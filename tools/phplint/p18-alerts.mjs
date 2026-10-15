// P18 D3: one alert feed — chats, leads, visits to confirm, payments, overdue; filter tabs; per-type sound
import pp from "puppeteer-core";
const w = (t) => new Promise((r) => setTimeout(r, t));
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 950 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message));
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await w(3000);
// a visit booking (unique future weekday) + a payment on an open invoice
const bk = await a.evaluate(async () => { const call = (o) => fetch("/api/forms.php", { method: "POST", body: JSON.stringify(o) }).then((r) => r.json());
  for (let k = 3 + Math.floor(Math.random() * 40); k < 80; k++) { const d = new Date(Date.now() + k * 864e5); if (d.getDay() === 0) continue; const day = d.toISOString().slice(0, 10); const s = await call({ action: "book_slots", type: "visit", date: day }); if (s.ok && s.slots && s.slots.length) return call({ action: "book_create", type: "visit", date: day, time: s.slots[0], name: "Alert Test " + k, phone: "0300" + String(1000000 + k), address: "House 1, DHA" }); } return { ok: false }; });
ok(bk.ok, "booking created");
const pay = await a.evaluate(async () => { const L = await WXA.api("inv_list"); let iv = (L.invoices || []).find((x) => x.balance > 1000);
  if (!iv) { const n = await WXA.api("inv_new", { client_id: 0, client: { company: "Alert Test Co", name: "Alert Test", phone: "03001112299" }, line: "furniture", issue_date: new Date().toISOString().slice(0, 10), due_date: "2026-01-01", sections: [{ name: "Supply", note: "", items: [{ desc: "Chairs", qty: 2, unit: "pcs", rate: 50000 }] }], discount: 0, rent: 0, taxPct: 0 }); if (!n.ok) return n; iv = n.invoice; } return WXA.api("pay_add", { id: iv.id, amount: 1000, method: "bank" }); });
ok(pay.ok, "payment recorded " + (pay.error || ""));
const r = await a.evaluate(() => WXA.api("notif_poll"));
const kinds = [...new Set(r.items.map((x) => x.kind))]; ok(kinds.includes("booking") && kinds.includes("payment"), "feed kinds: " + kinds.join(", "));
ok(/\.\d+\.\d+$/.test(r.stamp), "stamp includes bookings + payments: " + r.stamp);
await w(13000); await a.click("#nt-btn"); await w(600);
ok((await a.$$eval(".nt-f [data-f]", (L) => L.map((x) => x.textContent))).length === 5, "filter tabs: " + (await a.$$eval(".nt-f [data-f]", (L) => L.map((x) => x.textContent).join(" | "))));
await a.click(".nt-f [data-f=money]"); await w(300);
const mk = await a.$$eval(".nt-i", (L) => L.map((x) => x.className.replace("nt-i ", ""))); ok(mk.length > 0 && mk.every((k) => k === "payment" || k === "overdue"), "Money tab shows only payments/overdue: " + mk.join(","));
ok(!(await a.$eval("#nt-menu", (x) => x.hidden)), "menu stays open when switching tabs");
await a.screenshot({ path: "/home/user/-marketingwoodex/tools/p18-alerts.png", clip: { x: 900, y: 0, width: 540, height: 700 } });
await a.click(".nt-f [data-f=booking]"); await w(300); ok((await a.$$eval(".nt-i", (L) => L.map((x) => x.className))).every((c) => /booking/.test(c)), "Visits tab");
await a.click("#nt-set"); await w(500); ok((await a.$$("[data-snd]")).length === 4 && !!(await a.$("#ns-pop")), "settings: sound per type + pop-up toggle");
await a.click("[data-snd=payment]"); ok(await a.evaluate(() => localStorage.getItem("wxNt_snd_payment") === "0"), "payment sound turned off and saved");
ok(!errs.length, "no JS errors " + errs.join("|")); await b.close();
