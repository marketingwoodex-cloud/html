// P18 B2: header/footer builder — drag reorder, footer columns, undo, dirty badge
import pp from "puppeteer-core";
const w = (t) => new Promise((r) => setTimeout(r, t));
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 1000 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message));
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await w(2500);
await a.evaluate(() => (location.hash = "#/global")); await w(3000);
const labels = () => a.$$eval("#hf-body [data-p^='menu.items.'][data-p$='.label']", (L) => L.map((x) => x.value));
const drag = (from, to) => a.evaluate((f, t) => { const F = document.querySelector(`[data-dp='${f}']`), T = document.querySelector(`[data-dp='${t}']`); F.querySelector(".hf-grip").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); const dt = new DataTransfer(); F.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt })); T.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt })); T.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })); F.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt })); }, from, to);
const before = await labels(); ok(before.length >= 3 && (await a.$$("#hf-body .hf-grip")).length >= 3, "drag handles on menu links: " + before.join(", "));
ok(await a.$eval("#hf-dirty", (x) => x.hidden) && await a.$eval("#hf-undo", (x) => x.disabled), "clean state: no badge, undo disabled");
await drag("menu.items.0", "menu.items.2"); await w(400);
const after = await labels(); ok(after[2] === before[0] && after[0] === before[1], "drag moved first link to 3rd: " + after.join(", "));
ok(!(await a.$eval("#hf-dirty", (x) => x.hidden)), "unpublished badge shows");
const html = await a.evaluate(() => document.getElementById("hf-frame").contentDocument.querySelector("nav.desktop-nav").textContent.replace(/\s+/g, " "));
ok(html.indexOf(before[1]) < html.indexOf(before[0]), "live preview follows the new order");
await a.click("#hf-undo"); await w(400); ok(JSON.stringify(await labels()) === JSON.stringify(before), "undo restores order");
ok(await a.$eval("#hf-dirty", (x) => x.hidden), "badge hides when back to published state");
// mega columns drag
await a.evaluate(() => document.querySelector("[data-gt=mega]").click()); await w(800);
const mt = () => a.$$eval("#hf-body [data-p^='mega.cols.'][data-p$='.title']", (L) => L.map((x) => x.value));
const m0 = await mt(); await drag("mega.cols.0", "mega.cols.1"); await w(400); const m1 = await mt();
ok(m1[0] === m0[1] && m1[1] === m0[0], "mega columns drag: " + m1.join(", "));
// footer columns
await a.evaluate(() => document.querySelector("[data-gt=footer]").click()); await w(800);
const ft = () => a.$$eval("#hf-body [data-p^='footer.cols.'][data-p$='.title']", (L) => L.map((x) => x.value));
const f0 = await ft(); ok(!!(await a.$("[data-add='footer.cols']")) || f0.length >= 4, "Add footer column button (" + f0.length + " cols)");
if (await a.$("[data-add='footer.cols']")) { await a.click("[data-add='footer.cols']"); await w(400); ok((await ft()).length === f0.length + 1, "footer column added");
  const pv = await a.evaluate(() => document.getElementById("hf-frame").contentDocument.querySelectorAll("footer nav.footer-column").length); ok(pv === f0.length + 1, "preview footer has " + pv + " columns"); }
const n = (await ft()).length; await a.click(`[data-mv='footer.cols.${n - 1}|-1']`); await w(400); ok((await ft())[n - 2] === "New column", "footer column moved left");
await a.click(`[data-rm='footer.cols.${n - 2}']`); await w(400); ok(JSON.stringify(await ft()) === JSON.stringify(f0), "footer column removed");
// links in footer column drag
const fl = () => a.$$eval("#hf-body [data-p^='footer.cols.0.links.'][data-p$='.label']", (L) => L.map((x) => x.value));
const l0 = await fl(); await drag("footer.cols.0.links.1", "footer.cols.0.links.0"); await w(400); const l1 = await fl(); ok(l1[0] === l0[1], "footer links drag: " + l1.slice(0, 3).join(", "));
// cross-list drop is refused
await drag("footer.cols.0.links.0", "footer.cols.1.links.0"); await w(300); ok(JSON.stringify(await fl()) === JSON.stringify(l1), "drop into another list is ignored");
// ctrl+z
await a.evaluate(() => document.activeElement && document.activeElement.blur()); await a.keyboard.down("Control"); await a.keyboard.press("z"); await a.keyboard.up("Control"); await w(400); ok(JSON.stringify(await fl()) === JSON.stringify(l0), "Ctrl+Z undoes");
await a.evaluate(() => document.querySelector("#hf-body .card").scrollIntoView()); await a.screenshot({ path: "/home/user/-marketingwoodex/tools/p18-hf-footer.png" });
ok(!errs.length, "no JS errors " + errs.join("|")); await b.close();
