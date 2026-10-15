// P17 S3 invoice tracker API test (Node mirror). Run after p17-s12.mjs on a fresh preview DB.
const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const call = async (action, o = {}) => (await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action, ...o }) })).json();
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
T = (await call("login", { email: "o@woodex.pk", password: "Woodex@2026x" })).token;
// 13 rows = Jan 2025 sheet totals 3,143,000 / 2,345,000 / 798,000
const tot = [450000, 380000, 320000, 290000, 260000, 240000, 230000, 210000, 200000, 190000, 160000, 113000, 100000];
const rec = [450000, 380000, 320000, 290000, 0, 240000, 115000, 210000, 0, 190000, 50000, 0, 100000];
const st = ["Paid", "Paid", "Paid", "Paid", "After delivery", "Paid", "Partial", "Paid", "", "Paid", "Partial", "After delivery", "Paid"];
const rows = tot.map((t, k) => ({ date: `${String(k + 2).padStart(2, "0")}/01/2025`, po: "PO-" + (700 + k), no: "WF-" + (10050 + k), company: ["Haier Pakistan", "Nishat Mills", "Packages Ltd"][k % 3], total: t.toLocaleString("en-US"), received: String(rec[k]), status: st[k], delivery: k === 8 ? "15/01/2025" : "", note: k === 8 ? "Chairs pending" : "" }));
rows.unshift({ date: "Date", po: "PO#", no: "Invoice", company: "Company", total: "Total" });
const im = await call("invs_import", { rows }); ok(im.ok && im.imported === 13 && im.skipped === 1, `import ${im.imported}/${im.skipped} ${im.error || ""}`);
ok((await call("invs_import", { rows })).imported === 0, "re-import skips existing numbers");
const tr = await call("invs_tracker", { year: "2025" }); const j = tr.months["2025-01"];
ok(j.count === 13 && j.total === 3143000 && j.received === 2345000 && j.balance === 798000, "Jan 2025 totals " + JSON.stringify(j));
const late = tr.rows.find((i) => i.no === "WF-10058"); ok(late.late && late.track === "unpaid", "late delivery flagged");
ok(tr.rows.find((i) => i.no === "WF-10054").track === "after_delivery", "after-delivery status");
ok(tr.rows.find((i) => i.no === "WF-10056").track === "partial" && tr.rows.find((i) => i.no === "WF-10050").track === "paid", "partial / paid");
const n1 = await call("inv_new", { client: { company: "Haier Pakistan" }, line: "furniture", po: "PO-900", total: 500000, delivery_date: "2026-10-20", mode: "after_delivery" });
ok(n1.ok && n1.invoice.no === "WF-10063" && n1.invoice.track === "after_delivery", "next free WF number " + (n1.invoice && n1.invoice.no));
const n2 = await call("inv_new", { client_id: 1, line: "interior", total: 120000, desc: "Extra glass partition" }); ok(n2.ok && /^WI-/.test(n2.invoice.no), "standalone WI invoice " + (n2.invoice && n2.invoice.no));
ok(!(await call("inv_new", { client: { company: "X" } })).ok, "amount required");
const p = await call("pay_add", { id: n2.invoice.id, amount: 120000, method: "cash" }); ok(p.ok, "payment on standalone");
const t2 = await call("inv_track", { id: late.id, delivered: "2025-01-20", track_note: "Delivered late" }); ok(t2.ok && !t2.invoice.late && t2.invoice.delivered === "2025-01-20", "mark delivered");
const c3 = await call("client_360", { id: 1 }); ok(c3.invoices.some((i) => i.id === n2.invoice.id), "standalone invoice on Client 360");
const g = await call("inv_get", { id: n2.invoice.id }); ok(g.ok && g.invoice.sections[0].items.length === 1, "invoice detail page data");
