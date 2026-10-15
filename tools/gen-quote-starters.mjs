#!/usr/bin/env node
/**
 * tools/gen-quote-starters.mjs — the studio's starter quotation templates, from the file the site loads.
 *
 * The nine BOQ templates (Renovation, Civil Work, Interior Designing, Interior, Fit-out, Architecture, 3D
 * Visualization, Furniture, Design Consultancy) are content the studio has curated for years. They live in
 * `assets/js/quotation-templates.js` as `window.WX_QUOT_TEMPLATES` — that is the copy the *site* loads, and
 * the copy somebody edits when a rate changes.
 *
 * v2.5's console has no `window`, so the templates have to reach it as data. Typing nine templates and
 * eighty line items a second time is how the two copies start disagreeing on the first rate change, so this
 * extracts rather than retypes: it evaluates the real file in a sandbox and writes
 * `api/v2/data/quote-starters.json`, which is what `wx_tpl_starters()` reads.
 *
 * The `kind` is derived here, once, with v2.1's own rule (`kindOf()` in admin-sales.js: renovation/civil →
 * renovation, fit → fit-out, design/3d/architect/consult → interior design, everything else → other) because
 * the stored template carries a kind and the starter set has to arrive with one. One implementation, in the
 * file that produces the data.
 *
 *   node tools/gen-quote-starters.mjs            write api/v2/data/quote-starters.json
 *   node tools/gen-quote-starters.mjs --check    fail if the file on disk differs (the gate runs this)
 *   node tools/gen-quote-starters.mjs --json     print what would be written
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets/js/quotation-templates.js");
const TARGET = join(ROOT, "api/v2/data/quote-starters.json");

/** v2.1's kindOf() from admin-sales.js, character for character. */
export function kindOf(name) {
  const n = String(name).toLowerCase();
  if (/renov|civil/.test(n)) return "renovation";
  if (/fit/.test(n)) return "fitout";
  if (/design|3d|architect|consult/.test(n)) return "design";
  return "other";
}

/**
 * Read the starter templates out of the site's own file.
 *
 * The file is evaluated, not parsed: it builds its terms with `[...].join("\n")` and reuses two shared
 * constants, so a regex would read the source rather than the content. The sandbox gets a `window` and
 * nothing else — no DOM, no fetch — so a starter file that grew a side effect would fail here rather than
 * in a browser.
 */
export function extractStarters() {
  const src = readFileSync(SOURCE, "utf8");
  const sandbox = { window: {} };
  runInNewContext(src, sandbox, { filename: SOURCE, timeout: 5000 });
  const list = sandbox.window.WX_QUOT_TEMPLATES;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`no templates found in ${SOURCE} — expected window.WX_QUOT_TEMPLATES`);
  }
  return list.map((t) => {
    if (!t || typeof t.name !== "string" || !Array.isArray(t.sections)) {
      throw new Error(`a template in ${SOURCE} has no name or no sections`);
    }
    return {
      name: t.name.trim(),
      kind: kindOf(t.name),
      description: String(t.description ?? "").trim(),
      sections: t.sections.map((s) => ({
        name: String(s.name ?? "").trim(),
        items: (s.items ?? []).map((i) => ({
          desc: String(i.desc ?? "").trim(),
          qty: Number(i.qty ?? 0),
          unit: String(i.unit ?? "job"),
          rate: Number(i.rate ?? 0),
        })),
      })),
      terms: String(t.terms ?? "").trim(),
    };
  });
}

/** The bytes the file should contain — one template per block, so a diff reads as a template, not a blob. */
export function render(rows) {
  return JSON.stringify(rows, null, 2) + "\n";
}

/* ---------------------------------------------------------------- CLI */

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const out = render(extractStarters());
  if (process.argv.includes("--json")) {
    process.stdout.write(out);
  } else if (process.argv.includes("--check")) {
    let onDisk = "";
    try {
      onDisk = readFileSync(TARGET, "utf8");
    } catch {
      console.error(`✗ ${TARGET} is missing — run node tools/gen-quote-starters.mjs`);
      process.exit(1);
    }
    if (onDisk !== out) {
      console.error(`✗ ${TARGET} has drifted from ${SOURCE} — run node tools/gen-quote-starters.mjs`);
      process.exit(1);
    }
    console.log(`✓ the starter templates match ${SOURCE}`);
  } else {
    writeFileSync(TARGET, out);
    const rows = JSON.parse(out);
    const items = rows.reduce((a, t) => a + t.sections.reduce((b, s) => b + s.items.length, 0), 0);
    console.log(`✓ wrote ${TARGET} — ${rows.length} templates, ${items} line items`);
  }
}
