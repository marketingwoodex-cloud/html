#!/usr/bin/env node
/*
 * tools/verify-admin-live.mjs — ask every console screen's data path, and print what came back.
 *
 * Why this exists. `npm run smoke` renders the screens with **no API** and asserts the three states (it
 * proves the console never invents a figure). This is the other half, and it needs a running server: it
 * signs in the way the console's door does and then asks each endpoint the screens ask for, so "does this
 * screen work?" has an answer that came from the database rather than from a fixture or an opinion.
 *
 * It is deliberately *not* a gate. A gate belongs in ci/verify.yml and must not need a server; this is the
 * check a person runs after `npm run dev:api`, the way `tools/seed-dev.mjs` is run after it.
 *
 * Usage:
 *   node tools/verify-admin-live.mjs                        # through the Vite dev server (the browser's path)
 *   node tools/verify-admin-live.mjs --base http://127.0.0.1:8080/api/v2   # straight at api/v2
 *   node tools/verify-admin-live.mjs --json                 # machine-readable, for a script
 *
 * The sign-in is read from `_private/dev-owner.txt` (written when the SQLite database is set up; see
 * admin-v25/README.md) and is never printed. The host guard is seed-dev's, for the same reason: a script
 * that reads the studio's data should not be pointable at somebody else's server by a typo.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const BASE = arg("--base", "http://127.0.0.1:5173/api/v2").replace(/\/+$/, "");
const JSON_OUT = args.includes("--json");

const host = new URL(BASE).hostname;
if (!["127.0.0.1", "localhost"].includes(host) && !args.includes("--allow-remote")) {
  console.error(`refusing to check ${host}: this reads real records, so it is for a local server only`);
  process.exit(2);
}

const ownerFile = join(ROOT, "_private", "dev-owner.txt");
if (!existsSync(ownerFile)) {
  console.error("no _private/dev-owner.txt — run `npm run db:init` and `npm run db:owner` first (admin-v25/README.md)");
  process.exit(2);
}
const ownerTxt = readFileSync(ownerFile, "utf8");
const email = (ownerTxt.match(/name:\s*(\S+)/) || [])[1];
const password = (ownerTxt.match(/password:\s*(\S+)/) || [])[1];

/* ---- a cookie jar and a CSRF token, which is all the console keeps too */
let cookie = "";
let csrf = "";
async function api(method, path, body) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrf) headers["X-WX-CSRF"] = csrf;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  let body_json = {};
  try {
    body_json = await res.json();
  } catch {
    /* an HTML error page from a proxy is still an answer: report the status, not a parse failure */
  }
  return { status: res.status, body: body_json };
}

/* Every path the screens pass to `useLive`, in sidebar order, plus the API-only probes the console's own
   header strip uses. Kept as one list beside the code that runs it — a second copy in a document would be
   a copy that drifts from the screens without anything noticing. */
const SCREENS = [
  ["Dashboard", "/dashboard"],
  ["Approvals", "/approvals?status=pending"],
  ["Approvals count", "/approvals/count"],
  ["Leads", "/leads?stage=new"],
  ["Leads (all)", "/leads"],
  ["Clients", "/clients"],
  ["Quotations", "/quotations"],
  ["Quote templates", "/quotations/templates"],
  ["Invoices", "/invoices/summary"],
  ["Payments", "/payments"],
  ["Projects", "/projects"],
  ["Timeline", "/projects?view=all&limit=500"],
  ["Bookings", "/bookings"],
  ["Inbox / chats", "/chats"],
  ["Client updates", "/notifications"],
  ["Business info", "/business"],
  ["Company file", "/business/company"],
  ["Forms", "/forms"],
  ["Estimator", "/estimator"],
  ["Header & footer", "/chrome"],
  ["Announce bar", "/chrome/announce"],
  ["Hero slides", "/heroes"],
  ["Heroes (home)", "/heroes/home"],
  ["Pages", "/pages"],
  ["Content / blog", "/content?filter=all&type=all&q="],
  ["Content pages", "/content/pages"],
  ["Page history", "/pages/history?limit=40"],
  ["Library / blocks", "/blocks"],
  ["Block usage", "/blocks/usage"],
  ["Placements", "/placements"],
  ["Media", "/media?import=1"],
  ["Media alt queue", "/media/alt?limit=100"],
  ["Media trash", "/media/trash"],
  ["Redirects", "/redirects?import=1"],
  ["404 log", "/404s?limit=100"],
  ["SEO", "/seo/pages"],
  ["SEO sitemap", "/seo/sitemap"],
  ["Theme", "/theme"],
  ["AI settings", "/ai/settings"],
  ["Users", "/users"],
  ["Security", "/security"],
  ["System health", "/system/health"],
  ["System schema", "/system/schema"],
  ["Connectors", "/connectors"],
  ["Me", "/me"],
];

/** A shape, not an invented number: rows counted, or the keys the screen will read. */
function describe(data) {
  if (Array.isArray(data)) return `${data.length} rows`;
  if (data && typeof data === "object") {
    const keys = Object.keys(data).slice(0, 4);
    for (const k of ["total", "count", "pending"]) {
      if (typeof data[k] === "number") return `${k}=${data[k]} · ${keys.join(",")}`;
    }
    return keys.join(",");
  }
  return String(data).slice(0, 40);
}

const login = await api("POST", "/auth/login", { email, password });
if (!login.body?.ok) {
  console.error(`sign-in failed (${login.status}): ${login.body?.error?.message ?? "no answer"}`);
  console.error(`  base: ${BASE} — is the API running? (Admin console → npm run dev:api)`);
  process.exit(1);
}
csrf = login.body.data.csrf;
const who = login.body.data.user;

const rows = [];
for (const [name, path] of SCREENS) {
  const { status, body } = await api("GET", path);
  rows.push(
    body?.ok
      ? { name, path, state: "live", detail: describe(body.data) }
      : { name, path, state: String(status), detail: `${body?.error?.code ?? "?"}: ${String(body?.error?.message ?? "").slice(0, 60)}` },
  );
}

if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE, user: who?.email ?? null, screens: rows }, null, 2));
} else {
  const live = rows.filter((r) => r.state === "live").length;
  console.log(`\n  ${BASE}`);
  console.log(`  signed in as ${who?.name} <${who?.email}> · ${who?.roleLabel}\n`);
  console.log(`  ${"screen".padEnd(18)} ${"state".padEnd(7)} what came back`);
  console.log("  " + "-".repeat(92));
  for (const r of rows) console.log(`  ${r.name.padEnd(18)} ${r.state.padEnd(7)} ${r.detail}`);
  console.log("  " + "-".repeat(92));
  console.log(`  ${live} of ${rows.length} endpoints answered with data\n`);
  if (live !== rows.length) {
    console.log("  Not a failure by itself: a screen with an empty database answers with zero rows on");
    console.log("  purpose, and a screen reading the site tree needs a site root to read.\n");
  }
}
process.exit(rows.every((r) => r.state === "live") ? 0 : 1);
