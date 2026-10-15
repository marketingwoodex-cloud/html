// Deep QA: every admin API action — signed-out must be refused; sales role must be refused for owner/admin actions. Node mirror.
import fs from "fs";
const B = "http://127.0.0.1:8080/api/admin.php", R = "frontend-v1/api/";
const acts = new Set(); for (const f of fs.readdirSync(R).filter((x) => x.endsWith(".php"))) for (const m of fs.readFileSync(R + f, "utf8").matchAll(/case '([a-z0-9_]+)':/g)) acts.add(m[1]);
const call = async (action, tok, o = {}) => { try { const r = await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(tok ? { "X-WX-ADM": tok } : {}) }, body: JSON.stringify({ action, ...o }) }); return { s: r.status, j: await r.json().catch(() => ({})) }; } catch (e) { return { s: 0, j: { error: String(e) } }; } };
const PUBLIC = /^(status|setup|login|logout|pw_forgot|pw_reset|google_login|google_cfg_public|totp_|bk_slots|bk_public|chat_public)/;
const st = await call("status"); if (st.j.needsSetup) await call("setup", null, { builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" });
const own = (await call("login", null, { email: "o@woodex.pk", password: "Woodex@2026x" })).j.token;
await call("user_save", own, { name: "QA Sales", email: "qa.sales@woodex.pk", role: "sales", password: "Sales@2026xx", active: true });
const sal = (await call("login", null, { email: "qa.sales@woodex.pk", password: "Sales@2026xx" })).j.token;
let open = [], salesOk = [], unknown = [], crash = [];
const OWNER_ONLY = /^(user_|users_|backup_|security_|sec_|mcp_token|mcp_log|cms_ai_save|ai_save|wa_cfg|wa_settings|google_cfg_save|gdata_cfg|company_save|redirects?_save|db_|system_|health_fix|media_purge|media_replace|media_trash|smtp_|notify_cfg|integ_save|api_key)/;
for (const a of [...acts].sort()) {
  const r = await call(a, null); if (r.s >= 500) crash.push(a + " (signed-out " + r.s + ")");
  if (/Unknown action/i.test(r.j.error || "")) { unknown.push(a); continue; }
  if (r.j.ok && !PUBLIC.test(a)) open.push(a);
  if (OWNER_ONLY.test(a) && sal) { const s = await call(a, sal); if (s.s >= 500) crash.push(a + " (sales " + s.s + ")"); if (s.j.ok) salesOk.push(a); }
}
console.log("actions found:", acts.size, "| not in mirror:", unknown.length);
console.log("OPEN without sign-in:", open.length ? open.join(", ") : "none");
console.log("owner/admin actions allowed for SALES role:", salesOk.length ? salesOk.join(", ") : "none");
console.log("5xx crashes:", crash.length ? crash.join(", ") : "none");
console.log("mirror-missing (PHP only):", unknown.join(", "));
