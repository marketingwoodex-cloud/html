<?php
/**
 * api/v2/lib/store.php — atomic JSON access for the stores that have not moved to MySQL yet.
 *
 * Master plan §6.4 rule 1. The v2.1 helpers were:
 *
 *     function jread(string $f): array { $r = @file_get_contents($f); return $r ? (json_decode($r,true) ?: []) : []; }
 *     function jwrite(string $f, array $d): void { file_put_contents($f, json_encode($d, …), LOCK_EX); }
 *
 * Two failures in three lines:
 *   · jwrite truncates the file *then* takes the lock, so a reader between those two moments sees an
 *     empty file, decodes nothing, and gets [] — indistinguishable from "no data yet";
 *   · jread swallows a corrupt or half-written file into an empty array as well, which is why a
 *     damaged store surfaces as "Admin is not set up yet" instead of an error.
 *
 * This class fixes both: writes go to a temp file in the same directory, are flushed, then rename()d
 * over the target (atomic on POSIX), and both reads and writes take a lock on a *sidecar* lock file
 * so the rename can never invalidate a held lock. A corrupt store raises, with the path and byte
 * count in the log, instead of pretending to be empty.
 */

declare(strict_types=1);

final class JsonStore
{
    /** @var string absolute path of the JSON file */
    private $file;

    /** @var string sidecar lock file — never renamed, so locks stay valid */
    private $lock;

    /** @var int file mode for the data file */
    private $mode;

    /** @var bool when true, a missing file reads as an empty array instead of raising */
    private $optional;

    public function __construct(string $file, bool $optional = false, int $mode = 0640)
    {
        if (!str_starts_with($file, '/')) {
            throw new InvalidArgumentException('JsonStore needs an absolute path');
        }
        $this->file = $file;
        $this->lock = $file . '.lock';
        $this->mode = $mode;
        $this->optional = $optional;
    }

    public function path(): string
    {
        return $this->file;
    }

    /**
     * Read the store. Raises on an unreadable or corrupt file: a caller must never be able to
     * mistake "damaged" for "empty". Missing + optional → [].
     */
    public function read(): array
    {
        if (!is_file($this->file)) {
            if ($this->optional) {
                return [];
            }
            return [];
        }
        $fh = $this->lockShared();
        try {
            clearstatcache(true, $this->file);
            $raw = @file_get_contents($this->file);
            if ($raw === false) {
                throw ApiError::internal('Could not read ' . basename($this->file), ['store' => $this->file]);
            }
            if (trim($raw) === '') {
                // Zero bytes is either a genuinely empty store or a truncated write. Both are
                // recoverable, but only one is silent — say which.
                return [];
            }
            $data = json_decode($raw, true);
            if (!is_array($data)) {
                error_log('[wx-v2] corrupt store ' . $this->file . ' (' . strlen($raw) . ' bytes): ' . json_last_error_msg());
                throw ApiError::internal(
                    'The stored settings file is damaged. Restore it from a backup — ' . basename($this->file),
                    ['store' => $this->file, 'bytes' => strlen($raw), 'json_error' => json_last_error_msg()]
                );
            }
            return $data;
        } finally {
            $this->unlock($fh);
        }
    }

    /** Read that returns null on any problem — for caches and best-effort lookups only. */
    public function tryRead(): ?array
    {
        try {
            return $this->read();
        } catch (Throwable $e) {
            return null;
        }
    }

    /** Atomic whole-file write. */
    public function write(array $data): void
    {
        $this->update(static function () use ($data) {
            return $data;
        });
    }

    /**
     * Read-modify-write under one exclusive lock. The callback receives the current value and
     * returns the new one; returning null leaves the file untouched. This is the only sanctioned way
     * to change a store, because a read outside the lock followed by a write is exactly the lost
     * update the v2.1 code allowed.
     */
    public function update(callable $fn): ?array
    {
        $dir = dirname($this->file);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw ApiError::internal('Could not create ' . basename($dir));
        }
        $fh = $this->lockExclusive();
        try {
            $current = [];
            if (is_file($this->file)) {
                $raw = @file_get_contents($this->file);
                if ($raw !== false && trim($raw) !== '') {
                    $decoded = json_decode($raw, true);
                    if (!is_array($decoded)) {
                        throw ApiError::internal('The stored settings file is damaged', ['store' => $this->file]);
                    }
                    $current = $decoded;
                }
            }
            $next = $fn($current);
            if ($next === null) {
                return $current;
            }
            if (!is_array($next)) {
                throw ApiError::internal('A store writer returned a non-array');
            }
            $this->writeAtomic($next);
            return $next;
        } finally {
            $this->unlock($fh);
        }
    }

    /** Temp file → flush → rename. Same directory, so rename() stays on one filesystem. */
    private function writeAtomic(array $data): void
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw ApiError::internal('Could not encode the settings file', ['json_error' => json_last_error_msg()]);
        }
        $tmp = $this->file . '.tmp.' . bin2hex(random_bytes(4));
        $fh = @fopen($tmp, 'wb');
        if ($fh === false) {
            throw ApiError::internal('Could not write ' . basename($this->file));
        }
        try {
            if (fwrite($fh, $json) === false) {
                throw ApiError::internal('Could not write ' . basename($this->file));
            }
            fflush($fh);
            if (function_exists('fsync')) {
                @fsync($fh);
            }
        } finally {
            fclose($fh);
        }
        @chmod($tmp, $this->mode);
        if (!@rename($tmp, $this->file)) {
            @unlink($tmp);
            throw ApiError::internal('Could not replace ' . basename($this->file));
        }
        clearstatcache(true, $this->file);
    }

    /* ---------------------------------------------------------- locking */
    /** @return resource */
    private function lockShared()
    {
        return $this->openLock(LOCK_SH);
    }

    /** @return resource */
    private function lockExclusive()
    {
        return $this->openLock(LOCK_EX);
    }

    /** @return resource */
    private function openLock(int $how)
    {
        $fh = @fopen($this->lock, 'c');
        if ($fh === false) {
            throw ApiError::internal('Could not open the lock for ' . basename($this->file));
        }
        if (!flock($fh, $how)) {
            fclose($fh);
            throw ApiError::conflict('Another request is writing that setting — try again');
        }
        return $fh;
    }

    /** @param resource $fh */
    private function unlock($fh): void
    {
        if (is_resource($fh)) {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}

/** Convenience: the store for a file in _private, e.g. wx_store('security.json'). */
function wx_store(string $name, bool $optional = false): JsonStore
{
    /* The name becomes a filesystem path, so it is validated rather than trusted. Every caller passes a
       literal ('security.json', 'demo.json'), which means a failure here is a bug in our code or an
       attempt that reached further than it should have — either way it stops before touching the disk. */
    if (!preg_match('~^[A-Za-z0-9][A-Za-z0-9._-]*\.json$~', $name) || str_contains($name, '..')) {
        throw ApiError::internal('Refused a store name outside _private: ' . $name);
    }
    return new JsonStore(WX_PRIVATE_DIR . '/' . ltrim($name, '/'), $optional);
}
