// P17 S5: projects table + milestone billing.
const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const call = async (action, o = {}) => (await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action, ...o }) })).json();
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
T = (await call("login", { email: "o@woodex.pk", password: "Woodex@2026x" })).token;
const q = (await call("quote_save", { client: { name: "Mr. Faisal Rehman", company: "Interior Arch (Pvt) Ltd", phone: "0300 4441122" }, project: "Corporate office interior", site: "DHA Phase 6", layout: "project", qtype: "interior",
  sections: [{ name: "Wood work", items: [{ desc: "Media wall", qty: 1, unit: "job", rate: 1000000 }] }] })).quote;
await call("quote_status", { id: q.id, status: "approved" }); const qi = await call("quote_invoice", { id: q.id });
ok(qi.ok, "quote approved → invoice " + (qi.error || (qi.invoice || {}).no));
let t = await call("projs_table"); let p = t.projects.find((x) => x.quote_id === q.id);
ok(p && p.value === 1000000 && p.invoiced === 1000000 && p.balance === 1000000, "project opened from quotation, invoiced = full invoice");
ok((await call("proj_meta", { id: p.id, line: "project", ptype: "Office", area: 4250, team: [1] })).ok, "meta saved");
let r = await call("proj_milestones", { id: p.id, plan: [{ label: "Advance", pct: 50 }, { label: "Wood work", pct: 30 }, { label: "Handover", pct: 10 }] }); ok(!r.ok && /100%/.test(r.error), "plan must total 100% → " + r.error);
r = await call("proj_milestones", { id: p.id, plan: [{ label: "Advance", pct: 50 }, { label: "Wood work", pct: 30 }, { label: "Handover", pct: 20 }] }); ok(r.ok, "50/30/20 saved");
r = await call("proj_bill", { id: p.id, k: 0 }); ok(!r.ok && r.error === "REPLACE", "asks before replacing the full invoice");
r = await call("proj_bill", { id: p.id, k: 0, replace: true }); ok(r.ok && r.invoice.no === q.no + "-1" && r.invoice.total === 500000, "milestone 1 → " + (r.invoice || {}).no + " Rs " + (r.invoice || {}).total);
await call("pay_add", { id: r.invoice.id, amount: 300000, method: "bank", ref: "T1" });
r = await call("proj_bill", { id: p.id, k: 0 }); ok(!r.ok, "can't bill the same milestone twice");
r = await call("proj_milestones", { id: p.id, plan: [{ label: "Advance", pct: 40 }, { label: "Wood work", pct: 40 }, { label: "Handover", pct: 20 }] }); ok(!r.ok && /already billed/.test(r.error), "billed milestone is locked");
r = await call("proj_bill", { id: p.id, k: 1 }); ok(r.ok && r.invoice.no === q.no + "-2" && r.invoice.total === 300000, "milestone 2 → " + (r.invoice || {}).no);
t = await call("projs_table"); p = t.projects.find((x) => x.id === p.id);
ok(p.invoiced === 800000 && p.received === 300000 && p.balance === 500000 && p.unbilled === 200000, "totals invoiced 800k / received 300k / balance 500k / unbilled 200k → " + [p.invoiced, p.received, p.balance, p.unbilled].join("/"));
ok(p.milestones.map((m) => m.status).join() === "partial,billed,unbilled" && p.line === "project" && p.area === 4250 && p.team_names.length === 1, "milestone statuses + meta " + p.milestones.map((m) => m.status));
const tr = await call("invs_tracker", { year: new Date().getFullYear() + "" }); ok(tr.rows.some((i) => i.no === q.no + "-2") && !tr.rows.some((i) => i.no === q.no), "tracker shows milestone invoices, full invoice removed");
await call("proj_save", { id: p.id, target: "2020-01-01" }); t = await call("projs_table"); ok(t.projects.find((x) => x.id === p.id).late && t.kpi.late >= 1, "late handover flagged");
console.log(JSON.stringify({ project: p.id }));
