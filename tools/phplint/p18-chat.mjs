// P18 D1/D2: chat pop-up dock, attachments (photo / PDF / voice), emoji, typing — visitor ↔ admin
import pp from "puppeteer-core"; import fs from "fs";
const w = (t) => new Promise((r) => setTimeout(r, t));
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"], headless: "shell", defaultViewport: { width: 1440, height: 950 } });
const errs = [];
// admin first, sitting on the dashboard
const a = await b.newPage(); a.on("pageerror", (e) => errs.push("admin: " + e.message));
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await w(3500);
ok(!!(await a.$("#cx-btn")), "header chat button next to the bell");
// visitor
const v = await b.newPage(); v.on("pageerror", (e) => errs.push("visitor: " + e.message));
await v.setViewport({ width: 420, height: 860 }); await v.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle0" }); await w(1500);
await v.click(".wx-wa-btn"); await w(500); await v.click('[data-go="chat"]'); await w(500);
await v.evaluate(() => localStorage.removeItem("wxChat"));
await v.type(".wx-ch-form textarea", "Hi, I need a bedroom design for my DHA house. My number is 0300 1234567"); await v.keyboard.press("Enter"); await w(2500);
const cid = await v.evaluate(() => (JSON.parse(localStorage.getItem("wxChat") || "{}")).id); ok(cid > 0, "visitor chat created #" + cid);
// admin dock pops up within the poll interval
let opened = false; for (let i = 0; i < 16 && !opened; i++) { await w(1000); opened = await a.evaluate(() => { const d = document.getElementById("cx-dock"); return !!d && !d.hidden && /bedroom design/.test(d.textContent); }); }
ok(opened, "chat pop-up opened on the dashboard with the client's message");
// typing indicator: visitor types → admin sees
await v.type(".wx-ch-form textarea", "Also wardrobe"); await w(3500);
ok(/is typing/.test(await a.$eval("#cx-ty", (x) => x.textContent)), "admin sees 'is typing…'");
await v.evaluate(() => { document.querySelector(".wx-ch-form textarea").value = ""; });
// emoji
await a.click("#cx-dock [data-cx=emo]"); await w(200); await a.click("#cx-dock .cx-emo button"); await w(100);
ok((await a.$eval("#cx-in textarea", (x) => x.value)) === "👋", "emoji inserted");
await a.$eval("#cx-in textarea", (x) => (x.value = "")); 
// admin types → visitor sees team typing
await a.type("#cx-in textarea", "Hello"); await w(3800);
ok(/typing/.test(await v.$eval(".wx-ch-ty", (x) => x.textContent)), "visitor sees 'Woodex team is typing…'");
await a.keyboard.press("Enter"); await w(1500);
// admin sends a photo
const png = await a.evaluate(() => new Promise((r) => { const c = document.createElement("canvas"); c.width = 640; c.height = 420; const g = c.getContext("2d"); g.fillStyle = "#f4efe7"; g.fillRect(0, 0, 640, 420); g.fillStyle = "#b8956a"; g.fillRect(60, 60, 300, 200); c.toBlob((bb) => { const f = new FileReader(); f.onload = () => r(f.result.split(",")[1]); f.readAsDataURL(bb); }, "image/png"); }));
fs.writeFileSync("/tmp/moodboard.png", Buffer.from(png, "base64"));
const [fc] = await Promise.all([a.waitForFileChooser(), a.click("#cx-dock [data-cx=file]")]); await fc.accept(["/tmp/moodboard.png"]); await w(2500);
ok(await a.$eval("#cx-msgs", (x) => !!x.querySelector(".lm.g img[src^='/assets/uploads/chat/']")), "photo shown in the admin chat");
// admin voice note (fake microphone)
await a.click("#cx-dock [data-cx=rec]"); await w(1800);
ok(/Stop/.test(await a.$eval("#cx-dock [data-cx=rec]", (x) => x.textContent)), "recording timer shows");
await a.click("#cx-dock [data-cx=rec]"); await w(3000);
ok(await a.$eval("#cx-msgs", (x) => !!x.querySelector(".lm.g audio[src^='/assets/uploads/chat/']")), "voice note sent and playable in admin");
// visitor receives photo + voice
await w(3500);
ok(await v.$eval(".wx-ch-list", (x) => !!x.querySelector("img[src^='/assets/uploads/chat/']") && !!x.querySelector("audio")), "visitor receives the photo and the voice note");
// visitor sends a PDF
fs.writeFileSync("/tmp/floor-plan.pdf", "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const [fc2] = await Promise.all([v.waitForFileChooser(), v.click(".wx-ch-x[data-x=file]")]); await fc2.accept(["/tmp/floor-plan.pdf"]); await w(2500);
ok(await v.$eval(".wx-ch-list", (x) => /floor-plan\.pdf/.test(x.textContent)), "visitor PDF shows in the widget");
let pdf = false; for (let i = 0; i < 6 && !pdf; i++) { await w(1000); pdf = await a.$eval("#cx-msgs", (x) => !!x.querySelector(".lm.v .cx-file") && /floor-plan\.pdf/.test(x.textContent)); }
ok(pdf, "admin sees the visitor's PDF as a download chip");
// a disguised file is refused
const bad = await v.evaluate(async () => { const s = JSON.parse(localStorage.getItem("wxChat")); const r = await fetch("/api/chat.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "file", chat_id: s.id, token: s.tok, data: btoa("<?php echo 1; ?>"), name: "x.pdf" }) }); return r.json(); });
ok(!bad.ok && /Only photos/.test(bad.error), "non-image / non-PDF refused: " + bad.error);
await a.screenshot({ path: "/home/user/-marketingwoodex/tools/p18-chat-dock.png" });
await v.screenshot({ path: "/home/user/-marketingwoodex/tools/p18-chat-visitor.png" });
// minimise → bubble; hide → gone
await a.click("#cx-dock [data-d=min]"); await w(300); ok(await a.evaluate(() => document.getElementById("cx-dock").hidden && !document.getElementById("cx-bub").hidden), "minimise leaves a chat bubble");
await a.click("#cx-bub"); await w(800); ok(await a.evaluate(() => !document.getElementById("cx-dock").hidden), "bubble reopens the chat");
await a.click("#cx-dock [data-d=x]"); await w(300); ok(await a.evaluate(() => document.getElementById("cx-dock").hidden && document.getElementById("cx-bub").hidden), "hide closes the pop-up");
// full inbox has the composer extras and renders attachments
await a.evaluate((id) => (location.hash = "#/chat/" + id), cid); await w(2500);
ok(!!(await a.$("#lc-in [data-cx=rec]")) && await a.$eval("#lc-msgs", (x) => x.querySelectorAll("img, audio, .cx-file").length >= 3), "inbox shows photo, voice, PDF + has attach/voice buttons");
ok(!errs.length, "no JS errors " + errs.join(" | ")); await b.close();
