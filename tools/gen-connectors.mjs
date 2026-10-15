#!/usr/bin/env node
/**
 * tools/gen-connectors.mjs — the connector gallery, from the file v2.1 draws its cards out of.
 *
 * Settings → Integrations in the old admin is a gallery of 24 cards (Facebook, Messenger, Instagram, Threads,
 * Google Business, Gmail, Slack, … and "any app"). Each card knows five things a person needs before they can
 * connect anything: what the service is for, which tab it belongs to, what to paste into the *account* field,
 * what to paste into the *secret* field, and how to find both. All of that lives in `CAT` inside
 * `frontend-v1/admin/admin-conn.js` — 24 rows of it, with the Meta help text shared by three of them.
 *
 * v2.5's console has no `window` and no IIFE, so the gallery has to reach it as data. Retyping 24 cards is how
 * the two copies start disagreeing about which field holds the Page ID, so this extracts rather than retypes:
 * it evaluates the file's own declarations in a sandbox and writes `api/v2/data/connectors.json`, which is what
 * `wx_conn_catalog()` reads.
 *
 *   node tools/gen-connectors.mjs            write api/v2/data/connectors.json
 *   node tools/gen-connectors.mjs --check    fail if the file on disk differs (the gate runs this)
 *   node tools/gen-connectors.mjs --json     print what would be written
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "frontend-v1/admin/admin-conn.js");
const TARGET = join(ROOT, "api/v2/data/connectors.json");

/**
 * One `var NAME = …;` declaration, sliced out of the file by walking its brackets.
 *
 * The whole file cannot be evaluated — it is an IIFE that registers screens, and the four declarations this
 * needs are inside it, so nothing would be exported anyway. A regex cannot do it either: the rows are built
 * with `+ META_HELP`, and one help text is a 400-character Apps Script program containing quotes, braces and
 * semicolons. So the declarations are cut out by their braces and quotes, and evaluated as the JavaScript they
 * are — which is the point of the exercise: this reads the *content*, not the source.
 */
function sliceVar(src, name) {
  const at = new RegExp(`(^|\\n)\\s*var\\s+${name}\\s*=`).exec(src);
  if (!at) throw new Error(`${SOURCE}: no "var ${name} = " declaration`);
  let i = at.index + at[1].length;
  i = src.indexOf("=", i) + 1;
  let depth = 0;
  let quote = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === "\\") j++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) return `var ${name} =${src.slice(i, j)};`;
  }
  throw new Error(`${SOURCE}: the ${name} declaration never ends`);
}

/** The gallery as v2.1 wrote it: the cards, the featured order and the tab labels. */
export function extractCatalog() {
  const src = readFileSync(SOURCE, "utf8");
  const names = ["META_HELP", "CAT", "FEAT", "TABS"];
  const code = names.map((n) => sliceVar(src, n)).join("\n") + "\n({ CAT: CAT, FEAT: FEAT, TABS: TABS });";
  const out = runInNewContext(code, {}, { filename: SOURCE, timeout: 5000 });
  const rows = out.CAT;
  if (!Array.isArray(rows) || rows.length < 20) {
    throw new Error(`${SOURCE}: expected the 24-card CAT array, found ${Array.isArray(rows) ? rows.length : typeof rows}`);
  }
  const tabs = out.TABS.map(([id, label]) => ({ id: String(id), label: String(label) }));
  const keys = new Set(tabs.map((t) => t.id));
  const cards = rows.map((r) => {
    if (!Array.isArray(r) || r.length < 8) throw new Error(`${SOURCE}: a card is not an 8-field row`);
    const [key, name, tab, what, colour, account, secret, help] = r.map((v) => String(v ?? "").trim());
    if (key === "" || name === "") throw new Error(`${SOURCE}: a card has no key or no name`);
    for (const t of tab) if (!keys.has(t)) throw new Error(`${SOURCE}: card ${key} is on unknown tab "${t}"`);
    if (account === "" || secret === "") throw new Error(`${SOURCE}: card ${key} does not say what to paste where`);
    return { key, name, tabs: tab, what, colour, account, secret, help };
  });
  const featured = out.FEAT.map((k) => String(k));
  const known = new Set(cards.map((c) => c.key));
  for (const k of featured) if (!known.has(k)) throw new Error(`${SOURCE}: ${k} is featured but has no card`);
  return { source: "frontend-v1/admin/admin-conn.js", tabs, featured, connectors: cards };
}

/** The exact text written to disk, so `--check` can compare bytes and say which line differs. */
export function render(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n";
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const text = render(extractCatalog());
  const check = process.argv.includes("--check");
  const print = process.argv.includes("--json");
  if (print) {
    process.stdout.write(text);
  } else if (check) {
    let onDisk = "";
    try {
      onDisk = readFileSync(TARGET, "utf8");
    } catch {
      console.error(`✗ api/v2/data/connectors.json is missing — run node tools/gen-connectors.mjs`);
      process.exit(1);
    }
    if (onDisk !== text) {
      const a = onDisk.split("\n");
      const b = text.split("\n");
      const i = a.findIndex((line, n) => line !== b[n]);
      console.error(
        `✗ api/v2/data/connectors.json has drifted from the file v2.1 draws its cards from — run ` +
          `node tools/gen-connectors.mjs (line ${i + 1}: ${JSON.stringify(a[i])}, expected ${JSON.stringify(b[i])})`,
      );
      process.exit(1);
    }
    const n = JSON.parse(text).connectors.length;
    process.stdout.write(`✓ connectors.json matches admin-conn.js (${n} cards, ${JSON.parse(text).featured.length} featured)\n`);
  } else {
    writeFileSync(TARGET, text);
    const j = JSON.parse(text);
    process.stdout.write(`✓ api/v2/data/connectors.json — ${j.connectors.length} cards from ${SOURCE.replace(`${ROOT}/`, "")}\n`);
  }
}
