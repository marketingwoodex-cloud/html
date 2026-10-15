// Render P17 print layouts to PNG + PDF. cp to ~/.cache/pb; LD_LIBRARY_PATH=$PWD/al/lib node p17-print.mjs <projectId> <singleId> <invoiceId>
import pp from "puppeteer-core";
const [pid, sid, iid] = process.argv.slice(2).map(Number), out = "/home/user/-marketingwoodex/tools/";
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 900, height: 1200 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message));
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
if (await a.$("input[type=password]")) { await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await new Promise((r) => setTimeout(r, 1800)); }
const html = async (kind, id) => a.evaluate((kind, id) => WXA.api(kind === "inv" ? "inv_get" : "quote_get", { id }).then((r) => kind === "inv" ? WXPrint.invoice(r.invoice, r.company) : WXPrint.quote(r.quote, r.company)), kind, id);
const docs = [["project", "q", pid], ["single", "q", sid], ["invoice", "inv", iid]];
for (const [name, kind, id] of docs) { if (!id) continue; const h = await html(kind, id); const p = await b.newPage(); await p.setViewport({ width: 900, height: 1200 });
  await p.setContent(h.replace("<head>", '<head><base href="http://127.0.0.1:8080/">'), { waitUntil: "networkidle0" });
  await p.screenshot({ path: out + "pr-" + name + ".png", fullPage: true }); await p.emulateMediaType("print"); const pdf = await p.pdf({ path: out + "pr-" + name + ".pdf", format: "A4", preferCSSPageSize: true });
  console.log(name, "pdf pages", (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length); await p.close(); }
console.log("errors:", JSON.stringify(errs)); await b.close();
