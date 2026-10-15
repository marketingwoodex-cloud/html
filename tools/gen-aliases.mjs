#!/usr/bin/env node
/**
 * gen-aliases.mjs — generate api/v2/aliases.php from the LIVE v2.1 dispatcher.
 *
 * The master plan promises that the v2 alias table "cannot drift". This is how:
 * it is not written by hand, it is extracted from the shipped PHP every time.
 *
 * Sources of an action name in frontend-v1/api:
 *   1. `case 'name':`                  inside the dispatcher switch (admin.php, builder.php, …)
 *   2. `$action === 'name'`
 *   3. `in_array($action, ['a','b'])`  guard lists
 *   4. prefix families:  preg_match('~^soc_~'), str_starts_with($action,'sag_'),
 *      strpos($action,'sheets_') !== 0   — these are families, recorded as patterns
 *
 * Usage:  node tools/gen-aliases.mjs [--check]
 *   --check  fail (exit 1) if the generated file differs from what is on disk
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = join(ROOT, "frontend-v1", "api");
const OUT = join(ROOT, "api", "v2", "aliases.php");
const OUT_JSON = join(ROOT, "api", "v2", "aliases.json");

/* v2.1 entry points → the v2 resource that now owns the action. */
const OWNER = {
  "admin.php": "admin",
  "builder.php": "builder",
  "forms.php": "public",
  "chat.php": "public",
  "whatsapp.php": "webhook",
  "telegram.php": "webhook",
  "quote-view.php": "public",
  "r404.php": "public",
  "wa-cron.php": "cron",
  "mcp.php": "mcp",
};

/** Prefix → v2 resource. Applied when an action has no explicit `case` owner. */
const PREFIX_RESOURCE = [
  [/^lead/, "leads"], [/^client/, "clients"], [/^crm_/, "clients"], [/^s17_/, "clients"],
  [/^quote/, "quotations"], [/^tpl_/, "quotations"], [/^inv/, "invoices"], [/^pay/, "invoices"],
  [/^proj/, "projects"], [/^bk_/, "bookings"], [/^chat_/, "chats"], [/^notif/, "notifications"],
  [/^cms_/, "content"], [/^page/, "pages"], [/^block/, "blocks"], [/^global_/, "chrome"],
  [/^chrome_/, "chrome"], [/^media/, "media"], [/^fm_/, "files"], [/^seo/, "seo"],
  [/^sag_/, "seo"], [/^soc_/, "social"], [/^tg_/, "telegram"], [/^wag_/, "whatsapp"],
  [/^wah_/, "whatsapp"], [/^ai/, "ai"], [/^aic_/, "ai"], [/^appr/, "approvals"],
  [/^user/, "users"], [/^sec_/, "security"], [/^me_/, "me"], [/^theme/, "theme"],
  [/^health/, "health"], [/^backup/, "system"], [/^dbx_/, "system"], [/^maint/, "system"],
  [/^conn/, "connectors"], [/^gdata/, "analytics"], [/^google/, "analytics"],
  [/^redirect/, "redirects"], [/^r404/, "redirects"], [/^est_/, "estimator"],
  [/^forms_/, "forms"], [/^logos_/, "logos"], [/^sheets_/, "sheets"], [/^mcp_/, "mcp"],
  [/^sys/, "system"], [/^activity/, "activity"], [/^status/, "system"], [/^pw_/, "me"],
  [/^login/, "me"], [/^logout/, "me"], [/^setup/, "system"], [/^profile/, "me"],
  [/^password/, "me"], [/^dash/, "dashboard"], [/^p8_/, "admin"], [/^p19/, "clients"],
  [/^p18/, "admin"], [/^wa_/, "whatsapp"],
];

function resourceFor(action, fileOwner) {
  if (fileOwner) return fileOwner;
  for (const [re, res] of PREFIX_RESOURCE) if (re.test(action)) return res;
  return "admin";
}

/* ------------------------------------------------------------------ extract */
const files = readdirSync(API).filter((f) => f.endsWith(".php")).sort();
const actions = new Map();   // action → { files:Set, resource }
const families = new Map();  // prefix → { files:Set, resource }

for (const f of files) {
  const src = readFileSync(join(API, f), "utf8");
  const owner = OWNER[f] ?? (f.includes("-lib") ? null : "admin");
  const add = (name, map) => {
    if (!map.has(name)) map.set(name, { files: new Set(), resource: resourceFor(name, owner) });
    map.get(name).files.add(f);
  };

  for (const m of src.matchAll(/\bcase\s+'([a-z][a-z0-9_]+)'\s*:/g)) add(m[1], actions);
  for (const m of src.matchAll(/\$action\s*===\s*'([a-z][a-z0-9_]+)'/g)) add(m[1], actions);
  for (const m of src.matchAll(/in_array\(\s*\$action\s*,\s*\[([^\]]{0,2000})\]/g)) {
    for (const q of m[1].matchAll(/'([a-z][a-z0-9_]+)'/g)) add(q[1], actions);
  }
  // prefix families
  for (const m of src.matchAll(/preg_match\(\s*'~?\^?([a-z]{2,6})_~?'\s*,\s*\$action/g)) add(m[1] + "_*", families);
  for (const m of src.matchAll(/str_start(?:s)?_?with\(\s*\$action\s*,\s*'([a-z]{2,6})_'/g)) add(m[1] + "_*", families);
  for (const m of src.matchAll(/strpos\(\s*\$action\s*,\s*'([a-z]{2,6})_'\s*\)\s*!==?\s*0/g)) add(m[1] + "_*", families);
}

const sorted = [...actions.keys()].sort();
const sortedFam = [...families.keys()].sort();

/* -------------------------------------------------------------------- emit */
const rows = sorted
  .map((a) => {
    const r = actions.get(a);
    return `  '${a}' => ['${r.resource}', '${[...r.files].sort()[0]}'],`;
  })
  .join("\n");
const famRows = sortedFam
  .map((p) => {
    const r = families.get(p);
    return `  '${p}' => '${r.resource}',`;
  })
  .join("\n");

const generated = `<?php
/**
 * api/v2/aliases.php — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 *   regenerate:  node tools/gen-aliases.mjs
 *   verify:      node tools/gen-aliases.mjs --check
 *
 * Maps every action name the v2.1 dispatcher can receive onto the v2 resource
 * that now owns it, so /api/v2/index.php?action=<legacy> keeps working while
 * the React client moves to resource routes. Extracted from the live PHP, which
 * is why it cannot drift (master plan §6.2).
 *
 *   ${sorted.length} actions · ${sortedFam.length} prefix families
 *   source: frontend-v1/api/*.php
 */

declare(strict_types=1);

/** action => [v2 resource, origin file] */
const WX_V2_ALIASES = [
${rows}
];

/** action prefix family => v2 resource, matched only if no exact alias exists */
const WX_V2_FAMILIES = [
${famRows}
];

/**
 * Resolve a legacy v2.1 action to a v2 resource.
 * Returns '' when the action is unknown — the caller answers NOT_FOUND.
 */
function wx_v2_resource_for(string $action): string
{
    if (isset(WX_V2_ALIASES[$action])) {
        return WX_V2_ALIASES[$action][0];
    }
    foreach (WX_V2_FAMILIES as $prefix => $resource) {
        $bare = substr($prefix, 0, -2); // strip the trailing "_*"
        if (strncmp($action, $bare . '_', strlen($bare) + 1) === 0) {
            return $resource;
        }
    }
    return '';
}
`;

const summary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "frontend-v1/api/*.php",
  actions: Object.fromEntries(sorted.map((a) => [a, actions.get(a).resource])),
  families: Object.fromEntries(sortedFam.map((p) => [p, families.get(p).resource])),
  counts: { actions: sorted.length, families: sortedFam.length },
};

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== generated) {
    console.error(`✗ api/v2/aliases.php is stale — run: node tools/gen-aliases.mjs`);
    process.exit(1);
  }
  console.log(`✓ aliases.php up to date (${sorted.length} actions, ${sortedFam.length} families)`);
  process.exit(0);
}

writeFileSync(OUT, generated);
writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2) + "\n");
console.log(`✓ api/v2/aliases.php — ${sorted.length} actions, ${sortedFam.length} prefix families`);
const byResource = {};
for (const a of sorted) {
  const r = actions.get(a).resource;
  byResource[r] = (byResource[r] ?? 0) + 1;
}
console.log(
  "  by resource: " +
    Object.entries(byResource)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" "),
);
