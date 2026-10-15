// P18 A: rent/advance/blocks API checks
const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const c = async (a, o = {}) => (await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action: a, ...o }) })).json();
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
T = (await c("login", { email: "o@woodex.pk", password: "Woodex@2026x" })).token;
const qs = (await c("quotes_list")).quotes; const src = qs.find((q) => q.layout === "project" && q.status === "draft") || qs.find((q) => q.status === "draft");
const g = (await c("quote_get", { id: src.id })).quote;
const r = await c("quote_save", { ...g, rent: 50000, advance: 1000000, taxPct: 0, discount: 0, blocks: ["items", "-bank", "summary", "bogus", "-items"] });
ok(r.ok, "save " + (r.error || ""));
const q = r.quote; ok(q.total === q.subtotal + 50000, `grand total ${q.total} = subtotal ${q.subtotal} + rent 50,000`);
ok(q.advance === 1000000, "advance stored"); ok(JSON.stringify(q.blocks) === '["items","-bank","summary"]', "blocks sanitised " + JSON.stringify(q.blocks));
const r2 = await c("quote_save", { ...q, taxPct: 10 }); ok(r2.quote.tax === Math.round((q.subtotal + 50000) * 0.1), "tax charged on subtotal + rent");
const r3 = await c("quote_save", { ...q, advance: 99e9 }); ok(r3.quote.advance === r3.quote.total, "advance capped at total");
await c("quote_save", { ...q, taxPct: 0 });
console.log(JSON.stringify({ id: q.id, no: q.no, layout: q.layout }));
