#!/usr/bin/env node
/**
 * php-lint — parse-only PHP checking with a real PHP 8 grammar.
 *
 * WHY: the CI sandbox has no PHP binary (`php -l` unavailable, no root to install one) and
 * php-wasm 3.1.58 could not be driven (see tools/phpwasm/README.md). `php-parser` implements the
 * PHP 8 grammar in JS, so a syntax error still fails the build. It does NOT type-check, execute, or
 * resolve includes — behaviour is covered by tests/run.php on a host with PHP.
 *
 * Usage:
 *   node tools/phplint/php-lint.mjs [paths…]        # default: api/v2, frontend-v1/api, frontend-v1/*.php
 *   node tools/phplint/php-lint.mjs --json          # machine-readable summary
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let Engine;
try {
  Engine = require("php-parser");
} catch {
  console.error("✗ php-parser is not installed. Run:  npm --prefix tools/phplint install");
  process.exit(2);
}

/* `db` holds the command-line tools (the migration runner, the owner command) and `tests` holds the PHP
   tests — all of it shipped, none of it previously parsed by anything but the runtime that ran it. */
const DEFAULTS = ["api/v2", "db", "tests", "frontend-v1/api", "frontend-v1"];
const skip = new Set(["node_modules", ".git", "dist", "build", "vendor", "_private", "backups"]);

function collect(target, out = [], seen = new Set()) {
  const abs = join(ROOT, target);
  if (!existsSync(abs)) return out;
  const st = statSync(abs);
  if (st.isFile()) {
    if (extname(abs) === ".php" && !seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
    return out;
  }
  for (const entry of readdirSync(abs)) {
    if (skip.has(entry)) continue;
    const full = join(abs, entry);
    const s = statSync(full);
    if (s.isDirectory()) collect(relative(ROOT, full), out, seen);
    else if (extname(full) === ".php" && !seen.has(full)) {
      seen.add(full);
      out.push(full);
    }
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const asJson = process.argv.includes("--json");
const targets = args.length ? args : DEFAULTS;
const files = targets.flatMap((t) => collect(t));

const parser = new Engine({ parser: { php8: true, suppressErrors: false }, ast: { withPositions: true } });
const failures = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  try {
    parser.parseCode(readFileSync(file, "utf8"), rel);
  } catch (e) {
    const line = e?.loc?.start?.line ?? e?.lineNumber ?? "?";
    failures.push({ file: rel, line, message: String(e.message).split("\n")[0] });
  }
}

if (asJson) {
  console.log(JSON.stringify({ checked: files.length, failures }, null, 2));
} else if (failures.length) {
  for (const f of failures) console.log(`✗ ${f.file}:${f.line}  ${f.message}`);
  console.log(`\n✗ PHP lint: ${failures.length} of ${files.length} file(s) failed to parse`);
} else {
  console.log(`✓ PHP lint: ${files.length} file(s) parse clean (PHP 8 grammar)`);
}

process.exit(failures.length ? 1 : 0);
