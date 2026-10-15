# PHP runtime in the sandbox — findings

The Arena sandbox has **no PHP binary and no root** (`which php` empty; `apt-get` blocked by the
dpkg lock). Phase 1 is PHP, so this records exactly what was tried so nobody repeats it.

| Approach | Result |
|---|---|
| `apt-get install php-cli` | ✗ `Could not open lock file /var/lib/dpkg/lock-frontend (13: Permission denied)` |
| `php-parser` (npm) static parse | ✓ **works** — real PHP 8 grammar, used by `tools/phplint/lint.cjs` on `arena/4ba510f0` |
| `@php-wasm/node@3.1.58` (npm) executing PHP | ✗ not usable — see below |

## php-wasm 3.1.58 — where it got to

Progress, in order. Each step was needed to get past the previous error:

1. `import { PHP, loadNodeRuntime } from "@php-wasm/node"` → ✗
   `does not provide an export named 'PHP'`.
   **The `PHP` class lives in `@php-wasm/universal`;** `@php-wasm/node` exports only the loaders
   (`loadNodeRuntime`, `getPHPLoaderModule`, `bindUserSpace`, `withNetworking`, …).
2. `new PHP(await loadNodeRuntime("8.2"))` → ✗ `PHPLoader.processId must be set before init`.
   The loader requires `typeof PHPLoader.processId === "number"` (a *number*, not a string) and only
   auto-assigns one when `process.env.VITEST` is set — which is not enough.
   → pass `{ emscriptenOptions: { processId: 42 } }`. That attempt **hung for 600 s** with no output.
3. Going one level lower revealed the real cause:
   `getPHPLoaderModule("8.2")` + `loadPHPRuntime(m, …)` → ✗
   `ENOENT: no such file or directory, open '8_2_33/php_8_2.wasm'`.
   **The wasm path is resolved relative to the process CWD.** The binary ships at
   `node_modules/@php-wasm/node-8-2/asyncify/8_2_33/php_8_2.wasm` (22 MB), so it must be reachable as
   `./8_2_33/php_8_2.wasm` from wherever node runs (a symlink is enough).
4. With the path fixed the wasm loads, then `new PHP(runtime)` → ✗ `Runtime with id 1 not found`.
   `PHP::initializeRuntime()` calls `popLoadedRuntime($id)`, i.e. it expects a **runtime id from the
   loaded-runtime registry**, not the object `loadPHPRuntime()` hands back.

Stopping at step 4 was a deliberate call, not a failure to persist:

- the API is version-specific and undocumented — untangling it is a maintenance liability for a
  test harness;
- **`pdo_mysql` is not part of the wasm build**, so even a working runtime could not exercise the
  Phase 1 paths that matter: login against `wx_users`, leads against `wx_leads`, migrations against
  the real schema. A runtime that cannot reach the data proves little.

## What is used instead

| Layer | Tool | Runs where |
|---|---|---|
| Syntax | `php-parser` (npm) over every `api/v2/**/*.php` | here |
| Conformance invariants | `tests/conformance.mjs` — routes↔handlers, alias coverage, envelope discipline, lock discipline, cookie flags, schema references | here |
| Behaviour | `tests/run.php` — real assertions against the real functions | on the host (any PHP 7.4+) |

`tests/run.php` is written so that the moment a PHP binary is available — on the Hostinger host, in
CI, or if this sandbox ever gets one — behavioural verification is a single command.

## If someone wants to finish the wasm path

```bash
mkdir -p /tmp/wx/phprun/8_2_33
ln -sf "$PWD/node_modules/@php-wasm/node-8-2/asyncify/8_2_33/php_8_2.wasm" /tmp/wx/phprun/8_2_33/
cd /tmp/wx/phprun          # CWD matters — the loader looks for ./8_2_33/php_8_2.wasm
npm i @php-wasm/node@3.1.58
```

Then resolve step 4 by finding what `popLoadedRuntime()` registers ids against, in
`node_modules/@php-wasm/universal/index.js` (search `popLoadedRuntime`).
