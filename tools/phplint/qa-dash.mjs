// Deep QA: dashboard numbers must equal values recomputed from raw lists (Node mirror). Run after p17-s12..s5 seeds.
const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const c = async (a, o = {}) => (await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action: a, ...o }) })).json();
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
T = (await c("login", { email: "o@woodex.pk", password: "Woodex@2026x" })).token;
// add fresh activity inside the window
const today = new Date().toISOString().slice(0, 10), nx = new Date(Date.now() - 864e5).toISOString().slice(0, 10) + "T10:00";
const L0 = await c("lead_save", { name: "QA Dash Lead", phone: "0300 5550001", service: "Office fit-out", value: 1200000, stage: "contacted" }); const lid = (L0.lead || {}).id;
await c("lead_activity", { id: lid, kind: "call", text: "QA call", next_at: nx, next_type: "call" });
const d = (await c("dash_data", {})).crm, days = 28, start = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
const leads = (await c("leads_list")).leads, quotes = (await c("quotes_list")).quotes, invs = (await c("invs_list")).invoices || (await c("invs_list")).items || [];
const inW = (s) => s && s.slice(0, 10) >= start && s.slice(0, 10) <= today;
ok(d.kpi.leads[0] === leads.filter((l) => inW(l.created_at)).length, `leads in window ${d.kpi.leads[0]} = ${leads.filter((l) => inW(l.created_at)).length}`);
const pipe = leads.filter((l) => !["won", "lost"].includes(l.stage)).reduce((s, l) => s + (+l.value || 0), 0); ok(d.kpi.pipeline === pipe, `pipeline ${d.kpi.pipeline} = ${pipe}`);
const fun = {}; leads.forEach((l) => (fun[l.stage] = (fun[l.stage] || 0) + 1)); ok(Object.entries(fun).every(([k, v]) => (d.funnel[k] || 0) === v), "funnel by stage " + JSON.stringify(fun) + " vs " + JSON.stringify(d.funnel));
const open = quotes.filter((q) => q.status === "sent"); ok(d.kpi.openQuotes[0] === open.length && d.kpi.openQuotes[1] === open.reduce((s, q) => s + Math.round(+q.total || 0), 0), `open quotes ${JSON.stringify(d.kpi.openQuotes)} = ${open.length}/${open.reduce((s, q) => s + (+q.total || 0), 0)}`);
ok(d.kpi.quotesSent[0] === quotes.filter((q) => inW(q.sent_at)).length, `quotes sent in window ${d.kpi.quotesSent[0]}`);
const bal = invs.reduce((s, i) => s + (+i.balance || 0), 0); ok(d.kpi.unpaid === bal, `unpaid ${d.kpi.unpaid} = sum of invoice balances ${bal} (${invs.length} invoices)`);
ok(d.series.leads.reduce((a, b) => a + b, 0) === d.kpi.leads[0], "leads chart total = KPI");
ok(d.followups.some((f) => f.id === lid), "P17 next follow-up (next_at) shows in dashboard follow-ups");
ok(d.recent.length > 0 && d.recent[0].id === Math.max(...leads.map((l) => l.id)), "recent leads newest first");
