// P17 S1+S2 API test (Node mirror). Usage: node tools/phplint/p17-s12.mjs
const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const call = async (action, o = {}) => { const r = await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action, ...o }) }); return r.json(); };
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
let st = await call("status"); if (st.needsSetup) await call("setup", { builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" });
const lg = await call("login", { email: "o@woodex.pk", password: "Woodex@2026x" }); T = lg.token || lg.csrf || ""; ok(lg.ok, "login " + (lg.error || ""));
for (const n of ["Abdullah Khan", "Nabeel Ahmed", "Imtiaz Ali", "Amir Raza"]) await call("user_save", { name: n, email: n.split(" ")[0].toLowerCase() + "@woodex.pk", role: "sales", password: "Sales@2026xx", active: true });
const meta = await call("s17_meta"); ok(meta.ok && meta.lines.furniture, "s17_meta");
const csvRows = [
  { date: "02/09/2026", company: "Packages Mall Retail", name: "Usman Tariq", phone: "0300 1234567", designation: "Admin Manager", location: "Walton Rd, Lahore", source: "New lead", line: "Interior", assigned: "Abdullah", quotation: "Proposal / Quotation", last_contact: "05/09/2026", action: "Meeting", meeting: "", note: "Shop fit-out 2,400 sft" },
  { date: "04/09/2026", company: "Gulberg Dental Clinic", name: "Dr Sana Malik", phone: "0321 7654321", designation: "Owner", location: "Gulberg III", source: "Client", line: "Interior", assigned: "Nabeel", quotation: "Pending", last_contact: "", action: "Hold", meeting: "", note: "Waiting for lease" },
  { date: "10/09/2026", company: "Haier Office", name: "Kamran Shah", phone: "0333 1112223", designation: "Procurement", location: "Model Town", source: "New lead", line: "Furniture", assigned: "Imtiaz", quotation: "Done", last_contact: "12/09/2026", action: "Won", meeting: "", note: "40 workstations" },
  { date: "18/09/2026", company: "DHA Villa 22", name: "Ali Raza", phone: "0345 9998887", designation: "", location: "DHA Phase 6", source: "New lead", line: "Project", assigned: "Amir", quotation: "", last_contact: "", action: "", meeting: "28/09/2026", note: "Full home renovation" },
  { date: "dd/mm/yyyy", company: "Company", name: "Name" }];
const im = await call("leads_import2", { rows: csvRows }); ok(im.ok && im.imported === 4 && im.skipped === 1, `import2 ${im.imported}/${im.skipped} ${im.error || ""}`);
const im2 = await call("leads_import2", { rows: csvRows.slice(0, 2) }); ok(im2.imported === 0, "duplicate rows skipped");
let L = (await call("leads_list")).leads; const dha = L.find((l) => l.company === "DHA Villa 22"), pk = L.find((l) => l.company === "Packages Mall Retail");
ok(dha && dha.next_type === "meeting" && dha.next_at.startsWith("2026-09-28") && dha.line === "project" && dha.assigned_name.startsWith("Amir"), "import mapping (meeting, line, assigned)");
ok(pk.stage === "visit" && pk.quote_status === "proposal" && pk.last_contact.startsWith("2026-09-05"), "import stage/quotation/last contact");
ok(L.find((l) => l.company === "Gulberg Dental Clinic").stage === "hold", "hold stage");
const fu = await call("leads_followups"); ok(fu.ok && fu.overdue.some((x) => x.id === dha.id), "followups overdue");
const nx = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) + "T11:00";
const act = await call("lead_activity", { id: dha.id, kind: "call", text: "Called, site visit agreed", outcome: "Visit booked", next_at: nx, next_type: "visit", stage: "visit" });
ok(act.ok && act.lead.stage === "visit" && act.lead.next_type === "visit" && act.lead.last_contact && act.lead.notes.some((n) => n.kind === "call"), "lead_activity " + (act.error || ""));
const bad = await call("lead_activity", { id: dha.id, kind: "call" }); ok(!bad.ok, "activity needs text");
const sv = await call("lead_save", { id: pk.id, budget: "25 lakh", area: "2400", priority: "high", value: 2500000 }); ok(sv.ok && sv.lead.budget === "25 lakh" && sv.lead.priority === "high", "lead_save extra fields");
ok(!(await call("lead_save", { id: pk.id, line: "cars" })).ok, "bad line rejected");
const s = await call("leads_stats", { month: "2026-09" }); ok(s.ok && s.stats.total === 4 && s.stats.hold === 1 && s.stats.won === 1 && s.stats.client === 1, "leads_stats " + JSON.stringify(s.stats));
const cv = await call("lead_convert", { id: pk.id }); ok(cv.ok, "convert");
await call("client_save", { id: cv.client_id, name: "Usman Tariq", company: "Packages Mall Retail", phone: "0300 1234567", city: "Lahore", type: "company", line: "interior", tags: "retail, vip" });
const dup = await call("client_save", { name: "Usman T.", phone: "", email: "usman@pm.pk", city: "Lahore" });
const cm = await call("clients_master"); const me = cm.clients.find((c) => c.id === cv.client_id); ok(cm.ok && me && me.type === "company" && me.tags.includes("vip"), "clients_master");
const mg = await call("clients_merge", { keep: cv.client_id, merge: dup.client.id }); ok(mg.ok, "merge " + (mg.error || ""));
const c3 = await call("client_360", { id: cv.client_id }); ok(c3.ok && c3.client.email === "usman@pm.pk" && c3.leads.length === 1 && c3.timeline.length >= 1, "client_360 " + (c3.error || ""));
const nl = await call("lead_save", { name: "Usman Tariq", company: "Packages Mall Retail", lead_type: "returning", client_id: cv.client_id }); ok(nl.ok && nl.lead.client_id === cv.client_id && nl.lead.stage === "new", "new enquiry linked to client");
console.log("ids", JSON.stringify({ client: cv.client_id, dha: dha.id }));
