#!/usr/bin/env node
/*
 * tools/seed-dev.mjs — fill an EMPTY development database with a believable studio, through the API.
 *
 * Why through the API and not with SQL: every row this writes goes through the same routes the console
 * uses (lead, client, quotation, status change, invoice conversion, payment, booking). A seed that writes
 * tables directly would pass checks the console can never reach, and it would skip the arithmetic and the
 * validation the server does on the way in. So the seeder is also a write-path test.
 *
 * Usage (api/v2 must be running: `npm run dev:api` in admin-v25):
 *   node tools/seed-dev.mjs                      # base http://127.0.0.1:8080/api/v2
 *   node tools/seed-dev.mjs --base http://127.0.0.1:5173/api/v2
 *
 * Safety:
 *   · refuses any host except 127.0.0.1 / localhost (pass --allow-remote to override, and do not);
 *   · refuses to run if the database already has leads — it seeds an empty database, it never merges;
 *   · reads the owner's sign-in from _private/dev-owner.txt and never prints the password.
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
const BASE = arg("--base", "http://127.0.0.1:8080/api/v2").replace(/\/+$/, "");
const host = new URL(BASE).hostname;
if (!["127.0.0.1", "localhost"].includes(host) && !args.includes("--allow-remote")) {
  console.error(`refusing to seed ${host}: this seeder is for a local development database only`);
  process.exit(2);
}

/* ---- the owner's sign-in, from the file the SQLite setup wrote (never printed) */
const ownerFile = join(ROOT, "_private", "dev-owner.txt");
if (!existsSync(ownerFile)) {
  console.error("no _private/dev-owner.txt — run `npm run db:init` and `npm run db:owner` first");
  process.exit(2);
}
const ownerTxt = readFileSync(ownerFile, "utf8");
const email = (ownerTxt.match(/name:\s*(\S+)/) || [])[1];
const password = (ownerTxt.match(/password:\s*(\S+)/) || [])[1];
if (!email || !password) {
  console.error("_private/dev-owner.txt does not contain a sign-in; regenerate it with `npm run db:owner`");
  process.exit(2);
}

/* ---- a tiny client: a cookie jar and the CSRF token that login returns */
let cookie = "";
let csrf = "";
const log = [];
async function api(method, path, body) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrf) headers["X-WX-CSRF"] = csrf;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const pair = c.split(";")[0];
    if (pair.split("=")[1]) cookie = pair;
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} → ${res.status}, not JSON: ${text.slice(0, 160)}`);
  }
  if (!json.ok) {
    const e = json.error || {};
    throw new Error(`${method} ${path} → ${res.status} ${e.code || ""}: ${e.message || text.slice(0, 160)}`);
  }
  log.push(`${method} ${path} ${res.status}`);
  return json.data;
}

const say = (msg) => console.log(msg);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/* ---- the data: a Lahore interior and furniture studio, invented names, PKR amounts */
const CLIENTS = [
  { name: "Imran Chaudhry", company: "Platinum Ventures (Pvt) Ltd", phone: "+92 300 1110001", email: "imran@platinum.example", city: "Lahore", address: "Gulberg III, Lahore", type: "company", line: "interior", source: "referral", notes: "Office fit-out. Prefers a call in the morning." },
  { name: "Zainab Tower Developers", company: "Zainab Tower Developers", phone: "+92 321 2220002", email: "projects@zainabtower.example", city: "Lahore", address: "Main Boulevard, Lahore", type: "developer", line: "project", source: "website", notes: "Three floors of show-flat interiors." },
  { name: "Sana Qureshi", phone: "+92 333 3330003", email: "sana.q@example.com", city: "Lahore", address: "DHA Phase 5, Lahore", type: "individual", line: "furniture", source: "whatsapp", notes: "Dining set and wardrobes." },
  { name: "Ahsan Design Studio", company: "Ahsan Architects", phone: "+92 345 4440004", email: "studio@ahsanarch.example", city: "Lahore", address: "Model Town, Lahore", type: "architect", line: "interior", source: "phone", notes: "Refers joinery work to us." },
  { name: "Nadia Hussain", phone: "+92 311 5550005", email: "nadia.h@example.com", city: "Islamabad", address: "F-7, Islamabad", type: "individual", line: "furniture", source: "walkin", notes: "" },
];

/* Twelve leads across all seven stages. `stage` is set by the POST body directly (it is writable). */
const LEADS = [
  { name: "Hamza Rauf", phone: "+92 300 6660001", email: "hamza.r@example.com", line: "interior", source: "website", service: "Kitchen remodel", message: "Looking for a full kitchen with island.", value: 650000, stage: "new", page: "/kitchen-design" },
  { name: "Mehreen Aslam", phone: "+92 321 6660002", line: "furniture", source: "whatsapp", service: "Bedroom set", message: "Two wardrobes and a bed frame.", value: 280000, stage: "new", page: "/furniture" },
  { name: "Omar Farooq", phone: "+92 333 6660003", email: "omar.f@example.com", line: "project", source: "website", service: "Office interior", message: "Eight-desk office, Johar Town.", value: 1450000, stage: "new", page: "/commercial" },
  { name: "Ayesha Malik", phone: "+92 345 6660004", line: "interior", source: "phone", service: "Living room", message: "Wall panelling and TV unit.", value: 390000, stage: "contacted", page: "/living-room" },
  { name: "Bilal Sheikh", phone: "+92 311 6660005", line: "furniture", source: "referral", service: "Dining table", message: "Walnut dining table for eight.", value: 210000, stage: "contacted", page: "/furniture" },
  { name: "Fatima Zahra", phone: "+92 300 6660006", line: "interior", source: "website", service: "Full home", message: "Three-bed flat, full interior.", value: 2100000, stage: "visit", page: "/residential" },
  { name: "Usman Tariq", phone: "+92 321 6660007", line: "project", source: "chat", service: "Restaurant fit-out", message: "Seating and counter for a café.", value: 1800000, stage: "quote", page: "/commercial" },
  { name: "Rabia Anwar", phone: "+92 333 6660008", email: "rabia.a@example.com", line: "interior", source: "website", service: "Study room", message: "Built-in shelves and a desk.", value: 175000, stage: "quote", page: "/study" },
  { name: "Kamran Yousaf", phone: "+92 345 6660009", line: "furniture", source: "phone", service: "Sofa set", message: "Waiting for the fabric samples.", value: 320000, stage: "hold", page: "/furniture" },
  { name: "Saima Iqbal", phone: "+92 311 6660010", line: "interior", source: "walkin", service: "Bathroom vanity", message: "Walked in on Saturday.", value: 95000, stage: "won", page: "" },
  { name: "Tariq Mehmood", phone: "+92 300 6660011", line: "project", source: "website", service: "Warehouse office", message: "Asked for a price, went elsewhere.", value: 900000, stage: "lost", lost_reason: "Price", page: "/commercial" },
  { name: "Aliya Javed", phone: "+92 321 6660012", line: "furniture", source: "referral", service: "Children's room", message: "Went with a cheaper supplier.", value: 160000, stage: "lost", lost_reason: "Went elsewhere", page: "/furniture" },
];

/* The quotations. Q1 goes all the way: sent → approved → invoiced → one part-payment. */
const QUOTES = [
  {
    key: "platinum",
    client: "Platinum Ventures (Pvt) Ltd",
    project: "Office fit-out, 3rd floor",
    site: "Gulberg III, Lahore",
    sections: [
      { name: "Civil work", items: [
        { desc: "Civil work", kind: "head" },
        { desc: "Demolition and debris removal", qty: 1450, unit: "sq ft", rate: 42 },
        { desc: "Partition walls, gypsum board", qty: 620, unit: "sq ft", rate: 310 },
      ] },
      { name: "Joinery", items: [
        { desc: "Joinery and fixtures", kind: "head" },
        { desc: "Reception counter, walnut veneer", qty: 1, unit: "nos", rate: 185000 },
        { desc: "Workstations, eight seats", qty: 8, unit: "nos", rate: 42000 },
      ] },
    ],
    discount: 0,
    taxPct: 0,
    advance: 300000,
    terms: "50% advance payment with work order. Balance on handover.",
    send: true,
    approve: true,
    invoice: true,
  },
  {
    key: "zainab",
    client: "Zainab Tower Developers",
    project: "Show-flat interiors, floors 4 to 6",
    site: "Main Boulevard, Lahore",
    sections: [
      { name: "Show flat", items: [
        { desc: "Living and dining joinery", qty: 3, unit: "nos", rate: 240000 },
        { desc: "Kitchen cabinetry", qty: 3, unit: "nos", rate: 165000 },
      ] },
    ],
    discount: 150000,
    taxPct: 0,
    advance: 0,
    terms: "Prices valid for 14 days.",
    send: true,
  },
  {
    key: "sana",
    client: "Sana Qureshi",
    project: "Dining set and wardrobes",
    site: "DHA Phase 5, Lahore",
    sections: [
      { name: "Furniture", items: [
        { desc: "Dining table and six chairs, walnut", qty: 1, unit: "set", rate: 210000 },
        { desc: "Wardrobe, three doors", qty: 2, unit: "nos", rate: 96000 },
      ] },
    ],
    discount: 0,
    taxPct: 0,
    advance: 0,
    terms: "Delivery within six weeks of advance.",
  },
];

/* Bookings: two confirmed by staff, one filed from the public page and waiting for approval. */

async function main() {
  say(`seeding ${BASE}`);

  /* 1. Sign in — the same login the console uses. */
  const session = await api("POST", "/auth/login", { email, password });
  csrf = session.csrf;
  say(`  signed in as ${session.user.roleLabel} (${session.user.email})`);

  /* 2. Only an empty database. */
  const existing = await api("GET", "/leads?limit=1");
  const count = existing.total ?? (existing.leads || existing.items || []).length;
  if (count > 0) {
    console.error(`the database already has ${count} lead(s); the seeder only fills an empty database`);
    process.exit(3);
  }

  /* 3. Clients first: quotations and invoices point at them. */
  const clientIds = {};
  for (const c of CLIENTS) {
    const r = await api("POST", "/clients", c);
    const id = r.client?.id ?? r.id;
    clientIds[c.name] = id;
  }
  say(`  clients: ${Object.keys(clientIds).length}`);

  /* 4. Leads, each at its stage. The stage in the body is writable, so one POST per lead is enough. */
  let leadIds = [];
  for (const l of LEADS) {
    const r = await api("POST", "/leads", l);
    leadIds.push(r.lead?.id ?? r.id);
  }
  say(`  leads: ${leadIds.length}`);

  /* 5. Quotations: create (draft), send, and for the first one approve and convert to an invoice. */
  const quoteIds = {};
  const invoiceIds = {};
  for (const q of QUOTES) {
    const body = {
      client: { name: q.client, phone: "", email: "", address: "", company: "" },
      client_id: clientIds[q.client],
      project: q.project,
      site: q.site,
      sections: q.sections,
      discount: q.discount,
      taxPct: q.taxPct,
      advance: q.advance,
      terms: q.terms,
      valid_until: inDays(14),
    };
    const created = await api("POST", "/quotations", body);
    const id = created.quote?.id ?? created.id;
    quoteIds[q.key] = id;
    if (q.send) await api("POST", `/quotations/${id}/status`, { status: "sent" });
    if (q.approve) await api("POST", `/quotations/${id}/status`, { status: "approved" });
    if (q.invoice) {
      const inv = await api("POST", `/quotations/${id}/invoice`, { schedule: "50% advance, 50% on handover" });
      invoiceIds[q.key] = inv.invoice?.id ?? inv.id ?? inv.invoiceId;
    }
  }
  say(`  quotations: ${Object.keys(quoteIds).length} (1 invoiced)`);

  /* 6. A part-payment on the invoice, so the money figures are not all zero or all full. */
  if (invoiceIds.platinum) {
    await api("POST", `/invoices/${invoiceIds.platinum}/payments`, { amount: 300000, method: "bank", date: inDays(0), ref: "seed", note: "advance" });
    say("  payments: 1 (advance)");
  }

  /* 7. Bookings: the first booking type from the settings, two dates. */
  const cfg = await api("GET", "/bookings/settings");
  const types = cfg.cfg?.types || cfg.types || [];
  const typeKey = types.find((t) => t.on)?.k; // the settings name a type by `k`
  if (typeKey) {
    await api("POST", "/bookings", { type: String(typeKey), d: inDays(1), tm: "10:00", name: "Hamza Rauf", phone: "+92 300 6660001", note: "Site visit" });
    await api("POST", "/bookings", { type: String(typeKey), d: inDays(3), tm: "15:00", name: "Fatima Zahra", phone: "+92 321 6660006", note: "Flat measurement" });
    /* One request from the public booking page: it is filed as "waiting for approval", so the dashboard's
       pending count has a real value to show. */
    await api("POST", "/book", { type: String(typeKey), d: inDays(5), tm: "12:00", name: "Omar Farooq", phone: "+92 333 6660003", city: "Lahore", address: "Johar Town, Lahore", note: "Office meeting request" });
    say("  bookings: 3 (2 confirmed by staff, 1 waiting for approval from the public page)");
  } else {
    say("  bookings: skipped (no booking types configured)");
  }

  say(`done — ${log.length} API calls`);
}

main().catch((err) => {
  console.error(`seed failed: ${err.message}`);
  process.exit(1);
});
