// Deep QA: logic edge cases (amount words, booking boundaries, invoice numbering). Run after p17-s12..s5.
import fs from "fs"; const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const c = async (a, o = {}) => (await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action: a, ...o }) })).json();
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const window = {}; new Function("window", "document", fs.readFileSync(new URL("../../frontend-v1/admin/admin-print.js", import.meta.url), "utf8"))(window, { addEventListener() {} });
const W = window.WXPrint.words;
for (const [n, s] of [[0, "Zero"], [15, "Fifteen"], [100, "One Hundred"], [101, "One Hundred One"], [1000, "One Thousand"], [100000, "One Lakh"], [1e7, "One Crore"], [4157300, "Forty One Lakh Fifty Seven Thousand Three Hundred"], [3143000, "Thirty One Lakh Forty Three Thousand"], [99999999, "Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine"], [1234.5, "One Thousand Two Hundred Thirty Five"]]) ok(W(n) === s, `words(${n}) = "${W(n)}"`);
T = (await c("login", { email: "o@woodex.pk", password: "Woodex@2026x" })).token;
const day = new Date(Date.now() + (20 + Math.floor(Math.random() * 300)) * 864e5).toISOString().slice(0, 10);
const a = await c("bk_save", { name: "Edge A", phone: "0300 1", type: "office", d: day, tm: "11:00", dur: 60 }); ok(a.ok, "booking 11:00–12:00");
ok((await c("bk_save", { name: "Edge B", phone: "0300 2", type: "office", d: day, tm: "12:00", dur: 60 })).ok, "back-to-back 12:00 allowed (no false clash)");
ok((await c("bk_save", { name: "Edge C", phone: "0300 3", type: "office", d: day, tm: "11:30", dur: 15 })).clash, "inside 11:30 clashes");
ok((await c("bk_save", { name: "Edge D", phone: "0300 4", type: "office", d: day, tm: "10:30", dur: 45 })).clash, "overlapping start 10:30 clashes");
await c("bk_status", { id: a.item.id, status: "cancelled", notify: false });
ok((await c("bk_save", { name: "Edge E", phone: "0300 5", type: "office", d: day, tm: "11:00", dur: 60 })).ok, "cancelled slot is free again");
ok(!(await c("bk_save", { name: "Edge F", phone: "0300 6", type: "office", d: day, tm: "25:00" })).ok, "bad time rejected");
const inv = (await c("invs_list")).invoices || []; const nos = inv.map((i) => i.no); ok(new Set(nos).size === nos.length, `${nos.length} invoice numbers, all unique`);
const q = (await c("quotes_list")).quotes; const all = nos.concat(q.map((x) => x.no + "|" + (x.version || 1) + (x.option || ""))); ok(!inv.some((i) => q.some((x) => x.no === i.no && !x.invoice_id && i.quote_id !== x.id)), "no invoice reuses another quote's number");
ok(inv.every((i) => Math.abs((+i.total - (+i.paid || 0)) - +i.balance) < 1), "balance = total − paid on every invoice");
