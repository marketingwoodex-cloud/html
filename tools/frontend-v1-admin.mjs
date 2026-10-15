// Woodex Admin v2 — PREVIEW backend (mirrors frontend-v1/api/admin.php).
// Stores data in frontend-v1/_private/admin-db.json instead of MySQL. Not deployed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROLES = ["owner", "admin", "editor", "sales", "support"];
// ---- P39 roles (mirror of api/roles-lib.php) ----
const ROLE_LABELS = { owner: "Master", admin: "Manager", editor: "Developer", sales: "Sales", support: "Support" };
const PERM_GROUPS = ["sales", "conversations", "updates", "broadcast", "ai", "website", "settings"];
const ROLE_GROUPS = { owner: ["self", "sales", "conversations", "updates", "broadcast", "ai", "website", "settings", "master"], admin: ["self", "sales", "conversations", "updates", "broadcast", "ai", "website", "settings"], editor: ["self", "website", "settings"], sales: ["self", "sales", "conversations"], support: ["self", "conversations", "updates", "support_view"] };
const EXPAND = { website: ["editor"], settings: ["editor"], conversations: ["sales", "support"], updates: ["support"], support_view: ["support"] };
const ACT_GROUPS = [
  ["self", /^(tg_link_code|tg_unlink|me|me_get|me_save|me_avatar|me_avatars|profile|password|logout|ping|poll|notif_poll|typing|dashboard|dash_data|site_stats|leads_count|mt_get|sec_(get|alerts|2fa_begin|2fa_enable|2fa_disable|recovery_new|revoke)|google_(me|link|unlink))$/],
  ["master", /^(user_save|sec_2fa_reset|backup_(run|delete|restore)|restore|dbx_row|db_reconnect|google_save|mcp_token_(new|regen|revoke|toggle))$/],
  ["support_view", /^(client_360|get_lead|projs_list)$/],
  ["updates", /^(proj_update|notify_proj_send)$/],
  ["conversations", /^(chat_(list|get|reply|close|file|mode|lead|typing|assign|note|tags|suggest)|wa_stats|whatsapp_stats|crm_wa_status)$/],
  ["ai", /^(chat_cfg_get|chat_cfg_save|chat_test|ai_test|ai_report|ai_unans_list|ai_unans_add|ai_unans_ignore|aic_get|aic_save|aic_health)$/],
  ["broadcast", /^(crm_offers|crm_offer_(save|send|delete)|wag_[a-z_]+|wah_[a-z_]+)$/],
  ["sales", /^(leads?_[a-z0-9_]+|add_lead_note|lead_note|get_lead|list_leads|clients?_[a-z0-9_]+|list_clients|quotes?_[a-z_]+|get_quote|list_quotes|create_quote_draft|invs?_[a-z_]+|pay_(add|delete)|projs?_[a-z_]+|bk_[a-z_]+|est_[a-z_]+|s17_meta|dash_target_save|monthly_report|tpl_(list|save|delete|import)|company_get)$/],
  ["settings", /^(tg_(get|save|connect|disconnect|test)|set_[a-z_]+|crm_settings|crm_settings_save|crm_test|crm_wa_connect|crm_wa_disconnect|notify_(get|save|test)|company_save|cms_biz_[a-z_]+|cms_ai_[a-z_]+|cms_announce_[a-z_]+|mt_set|sys_check|activity|google_cfg|health_settings|sheets_[a-z_]+|gdata_(save|clear))$/],
  ["website", /^(cms_[a-z_]+|page_[a-z_]+|pages|pages_list|list_pages|seo_[a-z_]+|blocks_[a-z_]+|global_[a-z_]+|chrome_[a-z_]+|theme|theme_get|media|media_[a-z_]+|fm_[a-z_]+|redirects|redirects_[a-z_]+|r404_[a-z_]+|health_(get|psi|scan|speed)|forms_(get|save)|gdata_(status|report)|backups|backup_(list|get)|users|dbx_(browse|export|tables)|mcp_(tokens|log))$/]
];
const VIEW_ONLY_OA = ["users", "backups", "backup_list", "backup_get", "dbx_browse", "dbx_export", "dbx_tables", "mcp_tokens", "mcp_log"];
const SHARED = { est_tpls: ["sales", "website"], est_tpl_save: ["sales", "website"], est_save: ["sales", "website"], crm_wa_status: ["conversations", "settings", "broadcast"], gdata_report: ["sales", "website"], s17_meta: ["sales", "support_view"], projs_table: ["sales", "support_view"], notify_get: ["settings", "updates"] };
const wxGroup = (a) => { for (const [g, re] of ACT_GROUPS) if (re.test(a)) return g; return null; };
const wxPerms = (u) => (Array.isArray(u.perms) ? u.perms : []).filter((p) => PERM_GROUPS.includes(p));
function wxAllowed(u, action, legacy) {
  if (SHARED[action]) { const mine = [...(ROLE_GROUPS[u.role] || []), ...wxPerms(u)]; return SHARED[action].some((g) => mine.includes(g) || (g === "support_view" && mine.includes("sales"))); }
  const g = wxGroup(action); if (g === null) return null;
  if (VIEW_ONLY_OA.includes(action)) return ["owner", "admin"].includes(u.role);
  const extra = wxPerms(u), mine = [...(ROLE_GROUPS[u.role] || ["self"]), ...extra];
  const has = mine.includes(g) || (["support_view", "updates"].includes(g) && mine.includes("sales"));
  if (!has) return false;
  if (!legacy || !legacy.length || legacy.includes(u.role)) return true;
  return (EXPAND[g] || []).includes(u.role) || extra.includes(g);
}
const wxCaps = (u) => ({ label: ROLE_LABELS[u.role] || u.role, groups: [...new Set([...(ROLE_GROUPS[u.role] || ["self"]), ...wxPerms(u)])], perms: wxPerms(u) });

class Fail extends Error { constructor(m, c = 400) { super(m); this.code = c; } }

export function createAdmin({ ROOT, secret, builderPassword }) {
  const PRIV = path.join(ROOT, "_private"), DBF = path.join(PRIV, "admin-db.json"), ACT = path.join(PRIV, "activity.jsonl");
  const load = () => (fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, "utf8")) : null);
  const save = (d) => fs.writeFileSync(DBF, JSON.stringify(d, null, 1));
  const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
  const hash = (pw) => { const s = crypto.randomBytes(16).toString("hex"); return "scrypt$" + s + "$" + crypto.scryptSync(pw, s, 32).toString("hex"); };
  const verify = (pw, h) => { const [, s, k] = String(h || "").split("$"); if (!s) return false; const a = crypto.scryptSync(String(pw), s, 32), b = Buffer.from(k, "hex"); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  const hmac = (s) => crypto.createHmac("sha256", secret()).update(s).digest("hex");
  /** Token = uid.exp.sid.sig — the session id makes every sign-in listable and revocable (Security → Sessions). */
  let lastSid = null; // sid of the session tokenFor() just created (bound into the builder token)
  const tokenFor = (u, req, ip) => {
    const exp = String(Math.floor(Date.now() / 1000) + 12 * 3600), sid = crypto.randomBytes(8).toString("hex"); lastSid = sid;
    u.sessions = (u.sessions || []).filter((x) => x.exp > Date.now() / 1000).slice(-9);
    u.sessions.push({ sid, exp: +exp, ip: ip || "", ua: String((req && req.headers["user-agent"]) || "").slice(0, 200), created: now(), seen: now() });
    return u.id + "." + exp + "." + sid + "." + hmac("adm|" + u.id + "|" + exp + "|" + u.pw_ver + "|" + sid);
  };
  // ---- TOTP (RFC 6238) for two-factor sign-in
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const b32enc = (buf) => { let bits = "", out = ""; for (const b of buf) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)]; return out; };
  const b32dec = (str) => { let bits = ""; for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0"); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
  const hotp = (key, ctr) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(ctr)); const h = crypto.createHmac("sha1", key).update(b).digest(), o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0"); };
  const totpOk = (secret, code, u) => { code = String(code || "").replace(/\s/g, ""); if (!/^\d{6}$/.test(code)) return false; const key = b32dec(secret), t = Math.floor(Date.now() / 30000);
    for (const d of [-1, 0, 1]) if (hotp(key, t + d) === code) { if (u) { if ((u.totp_last || 0) >= t + d) return false; u.totp_last = t + d; } return true; } return false; };
  const sha = (x) => crypto.createHash("sha256").update(String(x)).digest("hex");
  /** Builder token = exp.uid.sid.sig — bound to the admin session: signing out / revoking / disabling kills builder access too. */
  const builderToken = (uid, sid) => { const exp = String(Math.floor(Date.now() / 1000) + 12 * 3600); return exp + "." + uid + "." + sid + "." + hmac("wx|" + exp + "|" + uid + "|" + sid); };
  const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: ROLE_LABELS[u.role] || u.role, perms: wxPerms(u), active: !!u.active, created_at: u.created_at, last_login: u.last_login });
  const canBuild = (u) => ["owner", "admin", "editor"].includes(u.role);
  const validPw = (p) => { if (String(p || "").length < 8) throw new Fail("Password must be at least 8 characters"); };

  function current(db, req) {
    if (req && req._wxAs) return (db && db.users.find((x) => x.id === req._wxAs && x.active)) || null; // MCP bearer-token user
    const m = /^(\d+)\.(\d{10})\.([a-f0-9]{16})\.([a-f0-9]{64})$/.exec(String(req.headers["x-wx-adm"] || ""));
    if (!db || !m || +m[2] < Date.now() / 1000) return null;
    const u = db.users.find((x) => x.id === +m[1] && x.active);
    if (!u || hmac("adm|" + u.id + "|" + m[2] + "|" + u.pw_ver + "|" + m[3]) !== m[4]) return null;
    const s = (u.sessions || []).find((x) => x.sid === m[3]); if (!s) return null; // signed out remotely
    s.seen = now(); u._sid = m[3]; return u;
  }
  function log(db, u, action, target = "", ip = "") { db.activity.push({ id: ++db.seqA, user_id: u ? u.id : null, user_name: u ? u.name : null, action, target: String(target).slice(0, 255), ip, created_at: now() }); if (db.activity.length > 5000) db.activity.splice(0, db.activity.length - 5000); }
  function ingest(db) {
    if (!fs.existsSync(ACT)) return; const raw = fs.readFileSync(ACT, "utf8"); fs.writeFileSync(ACT, "");
    for (const l of raw.split("\n")) { let a; try { a = JSON.parse(l); } catch { continue; } if (!a.action) continue;
      const u = a.uid ? db.users.find((x) => x.id === +a.uid) : null;
      db.activity.push({ id: ++db.seqA, user_id: u ? u.id : null, user_name: u ? u.name : "Builder", action: "builder." + a.action, target: String(a.target || "").slice(0, 255), ip: a.ip || "", created_at: new Date(a.t * 1000).toISOString().slice(0, 19).replace("T", " ") }); }
  }
  function walk(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; }
  function stats() {
    const s = { pages: 0, folders: {}, media: 0, mediaBytes: 0, backups: 0, lastBackup: 0 };
    for (const f of walk(ROOT)) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (/^(builder|admin|api|assets|_private)\//.test(rel)) {
        if (/^assets\/uploads\/.*\.(jpe?g|png|webp|gif)$/i.test(rel)) { s.media++; s.mediaBytes += fs.statSync(f).size; }
        if (rel.startsWith("_private/backups/")) { s.backups++; s.lastBackup = Math.max(s.lastBackup, Math.floor(fs.statSync(f).mtimeMs / 1000)); }
        continue;
      }
      if (rel.endsWith(".html")) { s.pages++; const k = rel.includes("/") ? rel.split("/")[0] : "(top level)"; s.folders[k] = (s.folders[k] || 0) + 1; }
    }
    return s;
  }
  const tries = new Map();
  function finishLogin(db, u, req, ip) {
    u.last_login = now(); log(db, u, "login", "", ip);
    const ua = String(req.headers["user-agent"] || ""), dev = sha(ip + "|" + ua.replace(/[\d.]+/g, "")).slice(0, 16);
    u.known = u.known || [];
    if (!u.known.includes(dev)) {
      if (u.known.length && u.alerts !== false) loginAlert(u, ip, ua);
      u.known = [...u.known, dev].slice(-20);
    }
    return { ok: true, token: tokenFor(u, req, ip), builderToken: canBuild(u) ? builderToken(u.id, lastSid) : null, user: pub(u) };
  }
  function loginAlert(u, ip, ua) {
    const text = `Hello ${u.name},\n\nYour Woodex Admin account was just signed in to from a new device.\n\nTime: ${now()} UTC\nIP address: ${ip}\nDevice: ${ua.slice(0, 160)}\n\nIf this was you, ignore this email. If not, sign in, change your password and use Security → "Sign out all other devices".`;
    try { fs.mkdirSync(PRIV, { recursive: true }); fs.appendFileSync(path.join(PRIV, "outbox.jsonl"), JSON.stringify({ t: now(), channel: "email", to: u.email, subject: "New sign-in to Woodex Admin", text }) + "\n"); } catch {}
  }
  // =================================================================== A2 — pages, SEO, status, redirects, global parts
  const BACKUPS = path.join(PRIV, "backups"), PMETA = path.join(PRIV, "pages.json"), REDIR = path.join(PRIV, "redirects.json"), CHROME = path.join(PRIV, "chrome.json");
  const RESERVED = /^(_private|builder|admin|api|assets)\//;
  const jr = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  const jw = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 1));
  // ---- P39 Phase 2: Master approval (mirror of api/approvals-lib.php) ----
  const APPR = path.join(PRIV, "approvals.json"), APPR_CFG = path.join(PRIV, "approvals-cfg.json");
  const APPR_SKIP = /^(me|me_[a-z_]+|profile|password|login[a-z_0-9]*|logout|ping|poll|notif_poll|typing|status|setup|sec_[a-z0-9_]+|google_(me|link|unlink|login)|pw_[a-z_]+|chat_[a-z_]+|lead_note|add_lead_note|media_upload|fm_upload|upload|import_url|fetch_page|appr_[a-z_]+|[a-z0-9_]*_test|ai_test|health_(scan|psi|speed)|seo_ai|ai_run|outline|improve|excerpt|meta|text|button|alt|fix|article|city|location|faqs|interactive|initialize|load)$/, APPR_WRITE = /(save|delete|send|_new|restore|import|import2|merge|convert|_status|toggle|clear|purge|move|rename|trash|replace|reorder|connect|disconnect|_add|update|_action|mkdir|_zip|bill|photo|regen|revoke|_set|close|copy|invoice|link|sync|folder|_run|tick|optout|camp_action|delete)$/;
  const APPR_EXTRA = ["global_menu", "global_chrome", "media_alt", "proj_meta", "proj_milestones", "dbx_row"], APPR_READS = ["crm_wa_status", "gdata_status"];
  const APPR_BUILDER = ["save", "restore", "theme", "page_new", "media_delete", "blocks_save", "blocks_delete", "blocks_import", "blocks_sync"];
  const apprCfg = () => ({ manager: true, developer: false, notify: true, ...jr(APPR_CFG, {}) });
  const apprNeeded = (role, action, src, inp, req) => {
    if (req && req._wxReplay) return false; const c = apprCfg();
    if (!((role === "admin" && c.manager) || (role === "editor" && c.developer))) return false;
    if (src === "builder") return APPR_BUILDER.includes(action);
    if (APPR_SKIP.test(action) || APPR_READS.includes(action)) return false;
    if (action === "health_settings") return Object.keys(inp || {}).some((k) => k !== "action");
    return APPR_EXTRA.includes(action) || APPR_WRITE.test(action);
  };
  const apprSummary = (src, action, inp) => {
    const t = (k) => { const v = inp[k]; return v != null && typeof v !== "object" ? String(v).trim().slice(0, 80) : ""; };
    const what = t("title") || t("name") || t("path") || t("email") || t("client") || t("label") || (t("id") ? "#" + t("id") : "");
    const verb = /delete|trash|purge/.test(action) ? "Delete" : /send|camp_action/.test(action) ? "Send" : /new|add|import/.test(action) ? "Add" : /restore/.test(action) ? "Restore" : "Change";
    const area = src === "builder" ? (action === "theme" ? "website theme" : action.startsWith("blocks") ? "section library" : "page") : action.replace(/_(save|delete|send|new|add|status|update|set)$/, "").replace(/_/g, " ");
    return (verb + " " + area + (what ? ": " + what : "")).trim();
  };
  const apprQueue = (u, src, action, inp) => {
    const x = { ...inp }; delete x.action; const raw = JSON.stringify(x);
    if (raw.length > 3000000) return { ok: false, error: "This change is too large to send for approval. Ask the Master to make it." };
    const all = jr(APPR, []), id = "A" + new Date().toISOString().replace(/\D/g, "").slice(2, 14) + crypto.randomBytes(2).toString("hex");
    const item = { id, src, action, in: x, summary: apprSummary(src, action, x), by: { id: u.id, name: u.name, role: u.role }, at: new Date().toISOString(), status: "pending" };
    all.unshift(item); jw(APPR, all.slice(0, 500));
    return { ok: true, pending: true, approval: id, message: "Sent to the Master for approval: " + item.summary };
  };
  const apprList = (status = "pending") => { const all = jr(APPR, []); let ch = false; all.forEach((a) => { if (a.status === "pending" && Date.parse(a.at) < Date.now() - 14 * 864e5) { a.status = "expired"; ch = true; } }); if (ch) jw(APPR, all); return all.filter((a) => status === "all" || a.status === status); };
  const apprGet = (id) => jr(APPR, []).find((a) => a.id === id) || null;
  const apprSet = (id, patch) => { const all = jr(APPR, []); all.forEach((a, i) => { if (a.id === id) all[i] = { ...a, ...patch }; }); jw(APPR, all); };
  /** Master approves: replay the stored request through run(inp) with the Master's sign-in; record the result. */
  const apprApply = async (master, id, src, edits, run, req) => {
    if (!master || master.role !== "owner") throw new Fail("Only the Master can approve changes", 403);
    const a = apprGet(id); if (!a || a.src !== src) throw new Fail("Approval not found"); if (a.status !== "pending") throw new Fail("Already " + a.status);
    apprSet(id, { status: "applying", decidedBy: master.name || "Master", decidedAt: new Date().toISOString() });
    req._wxReplay = true;
    try { const r = await run({ ...a.in, ...(edits && typeof edits === "object" ? edits : {}), action: a.action }); apprSet(id, r && r.ok ? { status: "approved" } : { status: "pending", lastError: (r && r.error) || "Failed" }); return r; }
    catch (e) { apprSet(id, { status: "pending", lastError: e.message || "Failed" }); throw e; }
    finally { req._wxReplay = false; }
  };
  const urlOf = (rel) => "/" + rel.replace(/index\.html$/, "");
  const relOk = (rel) => {
    rel = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, ""); if (rel === "" || rel.endsWith("/")) rel += "index.html";
    if (!/^[a-z0-9][a-z0-9/_\-.]*\.html$/i.test(rel) || rel.includes("..") || RESERVED.test(rel)) throw new Fail("Invalid page path");
    if (!fs.existsSync(path.join(ROOT, rel))) throw new Fail("Page not found", 404); return rel;
  };
  const allPages = () => walk(ROOT).filter((f) => f.endsWith(".html")).map((f) => path.relative(ROOT, f).split(path.sep).join("/")).filter((r) => !RESERVED.test(r)).sort();
  const stampName = () => { const d = new Date(), p = (n, l = 2) => String(n).padStart(l, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}.html`; };
  const bdir = (rel) => path.join(BACKUPS, rel.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "_"));
  function backupPage(rel) {
    const d = bdir(rel); fs.mkdirSync(d, { recursive: true }); let n = stampName(); while (fs.existsSync(path.join(d, n))) n = n.replace(/(\d{3})\.html$/, (m, x) => String(+x + 1).padStart(3, "0") + ".html");
    fs.copyFileSync(path.join(ROOT, rel), path.join(d, n));
    const old = fs.readdirSync(d).filter((f) => f.endsWith(".html")).sort(); while (old.length > 30) fs.unlinkSync(path.join(d, old.shift()));
  }
  const hattr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
  const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
  const tagAttr = (tag, a) => { const m = new RegExp("\\s" + a + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i").exec(tag); return m ? dec(m[2] != null ? m[2] : m[3] || "") : ""; };
  const findMeta = (h, key, val) => { const m = new RegExp("<meta\\b[^>]*\\b" + key + "\\s*=\\s*[\"']" + reEsc(val) + "[\"'][^>]*>", "i").exec(h); return m ? m[0] : null; };
  const addHead = (h, tag) => h.replace(/<\/head>/i, () => tag + "\n</head>");
  function setMeta(h, key, val, content) { const old = findMeta(h, key, val), nw = content === "" ? "" : `<meta ${key}="${val}" content="${hattr(content)}">`; if (old != null) return h.replace(old, () => nw); return nw ? addHead(h, nw) : h; }
  function setCanonical(h, href) { const nw = href ? `<link rel="canonical" href="${hattr(href)}">` : "", m = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.exec(h); if (m) return h.replace(m[0], () => nw); return nw ? addHead(h, nw) : h; }
  function pageInfo(rel, meta) {
    const abs = path.join(ROOT, rel), h = fs.readFileSync(abs, "utf8"), st = fs.statSync(abs);
    const title = dec(((/<title>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || "").trim());
    const g = (k, v, a = "content") => { const m = findMeta(h, k, v); return m ? tagAttr(m, a) : ""; };
    const desc = g("name", "description"), robots = g("name", "robots"), og = g("property", "og:image");
    const cm = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.exec(h), can = cm ? tagAttr(cm[0], "href") : "";
    const main = (/<main\b[\s\S]*?<\/main>/i.exec(h) || [h])[0];
    const h1 = (main.match(/<h1\b/gi) || []).length, noalt = (main.match(/<img\b[^>]*>/gi) || []).filter((i) => !/\salt\s*=/i.test(i)).length;
    const words = (main.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
    const issues = [];
    if (!title) issues.push("No title"); else if (title.length > 60) issues.push("Title over 60 characters");
    if (!desc) issues.push("No meta description"); else if (desc.length < 70 || desc.length > 160) issues.push("Description should be 70–160 characters");
    if (h1 !== 1) issues.push(h1 ? "More than one H1" : "No H1");
    if (noalt) issues.push(noalt + " image(s) without alt text");
    if (!og) issues.push("No social share image");
    if (words < 250) issues.push("Thin content (" + words + " words)");
    return { path: rel, url: urlOf(rel), title, description: desc, canonical: can, ogImage: og, noindex: /noindex/i.test(robots), status: (meta[rel] || {}).status || "published",
      mtime: Math.floor(st.mtimeMs / 1000), size: st.size, words, issues, score: Math.max(0, 100 - issues.length * 12), folder: rel.split("/").length > 2 ? rel.split("/")[0] : "" };
  }
  // ---- P16 3.8b redirects v2 (mirror of api/redirects-lib.php)
  const RD_CFG = path.join(PRIV, "redirect-cfg.json"), RD_404 = path.join(PRIV, "r404.json"), RD_PLAN = path.join(ROOT, "api", "redirect-plan.json");
  const rdCfg = () => Object.assign({ www: true, spam: true, seeded: false }, jr(RD_CFG, {}));
  const rdOne = (r) => { let type = +r.type || 301; if (![301, 302, 410].includes(type)) type = 301; const match = r.match === "prefix" ? "prefix" : "exact";
    return { from: "/" + String(r.from || "").replace(/^\/+|\/+$/g, "") + "/", to: type === 410 ? "" : String(r.to || "").trim(), type, match, src: String(r.src || "").trim().slice(0, 60), on: r.on === undefined ? true : !!r.on }; };
  const rdClean = (rows) => { const list = [], seen = {};
    for (const r of rows) { if (!r || !String(r.from || "").replace(/[\/ ]/g, "")) continue; const x = rdOne(r);
      if (!/^\/[a-z0-9/_\-.&]*$/i.test(x.from)) throw new Fail('Old address "' + x.from + '" is not valid (letters, numbers, - _ . / & only)');
      if (/^\/(admin|api|assets|builder|_private)\//i.test(x.from)) throw new Fail('"' + x.from + '" is a system folder and cannot be redirected');
      if (x.type !== 410) { if (!x.to) throw new Fail("Choose a new address for " + x.from);
        if (!/^(https?:\/\/[^\s"<>]+|\/[a-z0-9/_\-.#?=&]*)$/i.test(x.to)) throw new Fail('New address "' + x.to + '" is not valid');
        if (x.to.replace(/\/+$/, "") === x.from.replace(/\/+$/, "")) throw new Fail("A redirect cannot point to itself (" + x.from + ")"); }
      const k = (x.from + "|" + x.match).toLowerCase(); if (seen[k]) continue; seen[k] = 1; list.push(x); }
    return list; };
  const rdMerge = (cur, add) => { const have = {}; cur.forEach((r) => (have[r.from.toLowerCase()] = 1)); let n = 0;
    add.forEach((r) => { const x = rdOne(r); if (have[x.from.toLowerCase()]) return; cur.push(x); have[x.from.toLowerCase()] = 1; n++; }); return { list: cur, added: n }; };
  const rdList = () => { let cur = jr(REDIR, []).map(rdOne); const c = rdCfg();
    if (!c.seeded) { cur = rdMerge(cur, jr(RD_PLAN, [])).list; jw(REDIR, cur); c.seeded = true; jw(RD_CFG, c); publishRules(); } return cur; };
  const rdLines = (q) => { const c = rdCfg(), L = [];
    if (c.www) L.push("# one official address: no www", "RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]", "RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]");
    if (c.spam) L.push("# hacked-spam cleanup: tell Google these are gone for good", "RewriteCond %{REQUEST_URI} (casino|gokkasten|gokautomat|blackjack|roulette|free-spins|itm-[0-9]{4,}) [NC]", "RewriteRule ^ - [G,L]", "RewriteCond %{QUERY_STRING} (^|&)(p|page_id|attachment_id|cat)=[0-9]+ [NC]", "RewriteRule ^$ /? [R=301,L]");
    jr(REDIR, []).map(rdOne).forEach((r) => { if (!r.on) return; const pt = "^" + q(r.from.replace(/^\/+|\/+$/g, "")) + (r.match === "prefix" ? "(/.*)?$" : "/?$");
      L.push(r.type === 410 ? "RewriteRule " + pt + " - [G,L]" : "RewriteRule " + pt + " " + r.to + " [R=" + r.type + ",L]"); });
    return L; };
  const rdExists = (pth) => pth === "/" || fs.existsSync(path.join(ROOT, pth.replace(/\/+$/, ""), "index.html")) || (fs.existsSync(path.join(ROOT, pth)) && fs.statSync(path.join(ROOT, pth)).isFile());
  const rdTest = (list) => { const from = {}; list.forEach((r) => { if (r.on) from[r.from.toLowerCase()] = r; });
    return list.map((r, i) => { let st = "ok", msg = r.type === 410 ? "Gone (410)" : "Target page exists";
      if (!r.on) { st = "off"; msg = "Switched off"; }
      else if (rdExists(r.from)) { st = "warn"; msg = "A live page exists at this address; the redirect hides it"; }
      else if (r.type !== 410 && r.to[0] === "/") { const pth = r.to.replace(/[?#].*$/, ""), nx = from[("/" + pth.replace(/^\/+|\/+$/g, "") + "/").toLowerCase()];
        if (nx) { st = "warn"; msg = "Chain: " + r.to + " redirects again to " + (nx.to || "410") + ". Point it straight to the final page"; }
        else if (!rdExists(pth)) { st = "bad"; msg = "Target page not found (" + pth + ")"; } }
      else if (r.type !== 410) msg = "External link (not checked)";
      return { i, status: st, msg }; }); };
  const rd404List = () => Object.entries(jr(RD_404, {})).map(([p, v]) => ({ path: p, n: v.n | 0, last: v.last || "", ref: v.ref || "" })).sort((a, b) => b.n - a.n).slice(0, 200);
  const rd404Log = (p, ref, ipAddr) => { let pth = "/" + String(p || "").replace(/[?#].*$/, "").slice(0, 200).replace(/^\/+|\/+$/g, "") + "/";
    if (pth === "//" || /^\/(admin|api|assets|builder|_private)\//i.test(pth) || /\.(js|css|map|png|jpe?g|webp|gif|svg|ico|woff2?)\/$/i.test(pth)) return;
    const d = jr(RD_404, {}); if (!d[pth] && Object.keys(d).length >= 300) { const lo = Object.entries(d).sort((a, b) => a[1].n - b[1].n)[0]; delete d[lo[0]]; }
    const e = d[pth] || { n: 0 }; e.n++; e.last = new Date().toISOString(); ref = String(ref || "").replace(/[\s"<>]/g, "").slice(0, 200); if (ref && !/localhost|e2b\.app/.test(ref)) e.ref = ref; d[pth] = e; jw(RD_404, d); };
  function publishRules() {
    const meta = jr(PMETA, {}), red = jr(REDIR, []), q = (s) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
    const [sysPre, sysRw] = sysHtLines(); const lines = ["# BEGIN WOODEX-ADMIN (managed by /admin — do not edit by hand)", ...sysPre, "<IfModule mod_rewrite.c>", "RewriteEngine On", ...sysRw];
    rdLines(q).forEach((l) => lines.push(l)); // P16 3.8b
    Object.keys(meta).forEach((rel) => { if (meta[rel].status === "draft") lines.push("RewriteRule ^" + q(rel.replace(/index\.html$/, "")) + "(index\\.html)?$ - [R=404,L]"); });
    lines.push("</IfModule>", "# END WOODEX-ADMIN");
    const ht = path.join(ROOT, ".htaccess"); let cur = fs.existsSync(ht) ? fs.readFileSync(ht, "utf8") : "";
    cur = cur.replace(/\n?# BEGIN WOODEX-ADMIN[\s\S]*?# END WOODEX-ADMIN\n?/, "\n");
    fs.writeFileSync(ht, cur.trimEnd() + "\n\n" + lines.join("\n") + "\n");
    const sm = path.join(ROOT, "sitemap.xml"); let base = "https://woodex.com.pk"; if (fs.existsSync(sm)) { const b = /<loc>(https?:\/\/[^/<]+)/.exec(fs.readFileSync(sm, "utf8")); if (b) base = b[1]; }
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const rel of allPages()) {
      if (rel === "404.html" || ["draft", "hidden"].includes((meta[rel] || {}).status)) continue;
      const head = fs.readFileSync(path.join(ROOT, rel), "utf8").slice(0, 6000), m = findMeta(head, "name", "robots"); if (m && /noindex/i.test(tagAttr(m, "content"))) continue;
      x += "  <url><loc>" + base + urlOf(rel) + "</loc><lastmod>" + new Date(fs.statSync(path.join(ROOT, rel)).mtimeMs).toISOString().slice(0, 10) + "</lastmod></url>\n";
    }
    fs.writeFileSync(sm, x + "</urlset>\n");
  }
  const PATS = { header: /<header class="site-header"[\s\S]*?<\/header>/, mobile: /<nav class="mobile-panel"[\s\S]*?<\/nav>/, footer: /<footer class="footer"[\s\S]*?<\/footer>/ };
  const unsafe = (x) => /<script|\son[a-z]+\s*=|javascript:/i.test(x);

  async function a2(action, inp, need, db, ip) {
    const done = (o) => { save(db); return o; };
    switch (action) {
      case "pages_list": {
        need(["owner", "admin", "editor"]); ingest(db); const meta = jr(PMETA, {}), last = {};
        db.activity.filter((a) => ["builder.save", "builder.page_new", "builder.restore", "page.meta"].includes(a.action)).forEach((a) => (last[a.target] = a.user_name));
        const pages = allPages().map((rel) => Object.assign(pageInfo(rel, meta), { editedBy: last[rel] || null })).sort((a, b) => (a.url === "/" ? -1 : b.url === "/" ? 1 : a.url.localeCompare(b.url)));
        return done({ ok: true, pages });
      }
      case "page_meta_save": {
        const u = need(["owner", "admin", "editor"]), rel = relOk(inp.path), title = String(inp.title || "").trim(), desc = String(inp.description || "").trim(), status = String(inp.status || "published");
        if (!["published", "hidden", "draft"].includes(status)) throw new Fail("Unknown status");
        if (rel === "index.html" && status === "draft") throw new Fail("The home page cannot be a draft");
        if (!title) throw new Fail("Title is required");
        const can = String(inp.canonical || "").trim(), og = String(inp.ogImage || "").trim();
        for (const v of [can, og]) if (v && !/^(https?:\/\/|\/)[^\s"<>]*$/.test(v)) throw new Fail("Links must start with https:// or /");
        backupPage(rel); const abs = path.join(ROOT, rel); let h = fs.readFileSync(abs, "utf8"); const tt = "<title>" + hattr(title) + "</title>";
        h = /<title>[\s\S]*?<\/title>/i.test(h) ? h.replace(/<title>[\s\S]*?<\/title>/i, () => tt) : addHead(h, tt);
        h = setMeta(h, "name", "description", desc); h = setMeta(h, "property", "og:title", title); h = setMeta(h, "property", "og:description", desc); h = setMeta(h, "property", "og:image", og);
        const noindex = !!inp.noindex || status !== "published", rm = findMeta(h, "name", "robots"), robots = rm ? tagAttr(rm, "content") : "";
        h = setMeta(h, "name", "robots", noindex ? "noindex, follow" : /noindex/i.test(robots) ? "" : robots); h = setCanonical(h, can);
        fs.writeFileSync(abs, h);
        const meta = jr(PMETA, {}); if (status === "published") delete meta[rel]; else meta[rel] = { status }; jw(PMETA, meta);
        publishRules(); log(db, u, "page.meta", rel, ip); return done({ ok: true, page: pageInfo(rel, meta) });
      }
      case "page_delete": {
        const u = need(["owner", "admin"]), rel = relOk(inp.path), to = String(inp.redirectTo || "").trim();
        if (rel === "index.html" || rel === "404.html") throw new Fail("This page cannot be deleted");
        if (!/^\/[a-z0-9/_\-.]*$/i.test(to)) throw new Fail("Choose a page to redirect visitors to");
        const trash = path.join(PRIV, "trash"); fs.mkdirSync(trash, { recursive: true });
        fs.renameSync(path.join(ROOT, rel), path.join(trash, stampName().slice(0, 15) + "-" + rel.replace(/[^a-z0-9]+/gi, "_")));
        try { fs.rmdirSync(path.dirname(path.join(ROOT, rel))); } catch {}
        const red = jr(REDIR, []).filter((r) => r.from !== urlOf(rel)); red.push({ from: urlOf(rel), to }); jw(REDIR, red);
        const meta = jr(PMETA, {}); delete meta[rel]; jw(PMETA, meta);
        publishRules(); log(db, u, "page.delete", rel + " → " + to, ip); return done({ ok: true });
      }
      case "backup_get": {
        need(["owner", "admin", "editor"]); const rel = relOk(inp.path), file = path.basename(String(inp.file || ""));
        if (!/^\d{8}-\d{6}(-\d{3})?\.html$/.test(file)) throw new Fail("Invalid backup");
        const f = path.join(bdir(rel), file); if (!fs.existsSync(f)) throw new Fail("Backup not found", 404);
        return { ok: true, html: fs.readFileSync(f, "utf8") };
      }
      case "redirects": { need(["owner", "admin"]); const l = rdList(), c = rdCfg(); return { ok: true, redirects: l, cfg: { www: c.www, spam: c.spam }, planCount: jr(RD_PLAN, []).length, test: rdTest(l), missed: Object.keys(jr(RD_404, {})).length }; }
      case "redirects_save": {
        const u = need(["owner", "admin"]), list = rdClean(inp.redirects || []);
        if (inp.cfg && typeof inp.cfg === "object") { const c = rdCfg(); c.www = "www" in inp.cfg ? !!inp.cfg.www : c.www; c.spam = "spam" in inp.cfg ? !!inp.cfg.spam : c.spam; c.seeded = true; jw(RD_CFG, c); }
        jw(REDIR, list); publishRules(); log(db, u, "redirects.save", list.length + " redirects", ip); return done({ ok: true, redirects: list, test: rdTest(list) });
      }
      case "redirects_plan": {
        const u = need(["owner", "admin"]), m = rdMerge(jr(REDIR, []).map(rdOne), jr(RD_PLAN, []));
        jw(REDIR, m.list); publishRules(); log(db, u, "redirects.save", "loaded plan (+" + m.added + ")", ip); return done({ ok: true, redirects: m.list, added: m.added, test: rdTest(m.list) });
      }
      case "r404_list": need(["owner", "admin"]); return { ok: true, rows: rd404List() };
      case "r404_clear": { need(["owner", "admin"]); const pth = String(inp.path || ""); if (!pth) jw(RD_404, {}); else { const d = jr(RD_404, {}); delete d[pth]; jw(RD_404, d); } return { ok: true, rows: rd404List() }; }
      case "global_menu": {
        const u = need(["owner", "admin"]), d = String(inp.desktop || ""), mob = String(inp.mobile || "");
        if (unsafe(d) || unsafe(mob)) throw new Fail("Scripts are not allowed in the menu");
        if (!/^<nav class="desktop-nav"[^>]*>[\s\S]*<\/nav>$/.test(d) || !/^<nav class="mobile-panel"[^>]*>[\s\S]*<\/nav>$/.test(mob)) throw new Fail("Invalid menu HTML");
        let n = 0;
        for (const rel of allPages()) {
          if (rel === "404.html") continue; // special menu (disabled links)
          const abs = path.join(ROOT, rel), o = fs.readFileSync(abs, "utf8"), url = urlOf(rel);
          const segs = url.replace(/^\/+|\/+$/g, "").split("/"), alts = [reEsc(url)]; if (segs.length > 1) alts.push(reEsc("/" + segs[0] + "/"));
          const dd = d.replace(new RegExp('<a\\b(?![^>]*class="mega-project")([^>]*\\bhref="(?:' + alts.join("|") + ')")', "g"), (m, a) => "<a" + a + ' aria-current="page"');
          const cta = /<a class="mobile-primary" href="([^"]*)"/.exec(o); const mm = cta ? mob.replace(/(<a class="mobile-primary" href=")[^"]*"/, (m, a) => a + cta[1] + '"') : mob;
          const h = o.replace(/<nav class="desktop-nav"[\s\S]*?<\/nav>/, () => dd).replace(/<nav class="mobile-panel"[\s\S]*?<\/nav>/, () => mm);
          if (h !== o) { backupPage(rel); fs.writeFileSync(abs, h); n++; }
        }
        log(db, u, "global.menu", n + " pages", ip); return done({ ok: true, changed: n });
      }
      case "chrome_versions": { need(["owner", "admin"]); return done({ ok: true, versions: jr(CHROME, []) }); }
      case "chrome_save": {
        const u = need(["owner", "admin"]), data = inp.data;
        if (!data || typeof data !== "object") throw new Fail("Nothing to save");
        if (JSON.stringify(data).length > 200000) throw new Fail("Too large");
        const v = jr(CHROME, []); v.unshift({ t: Math.floor(Date.now() / 1000), by: u.name || u.email || "", note: String(inp.note || "").slice(0, 120), data });
        jw(CHROME, v.slice(0, 10)); return done({ ok: true, versions: v.slice(0, 10) });
      }
      case "global_chrome": {
        const u = need(["owner", "admin"]), brand = String(inp.brand || ""), cta = String(inp.cta_label || "").trim(), foot = String(inp.footer || ""), introAll = !!inp.intro_all;
        if (unsafe(brand) || unsafe(foot) || unsafe(cta)) throw new Fail("Scripts are not allowed");
        if (brand && !/^<a class="brand"[^>]*>[\s\S]*<\/a>$/.test(brand)) throw new Fail("Invalid logo HTML");
        if (foot && !/^<footer class="footer">[\s\S]*<\/footer>$/.test(foot)) throw new Fail("Invalid footer HTML");
        if (cta.length > 40) throw new Fail("Button text is too long");
        const design = !!inp.design, style = String(inp.style || ""), phone = String(inp.phone || "");
        if (design) {
          if (style.length > 20000) throw new Fail("Design is too large");
          if (style && (!/^<style id="wx-chrome-style" data-cfg="[^"<>]*">[^<]*<\/style>$/.test(style) || /@import|expression\s*\(|javascript:|url\s*\(/i.test(style))) throw new Fail("Invalid design");
          if (phone && (!/^<a class="wx-hphone" href="tel:[0-9+]{4,20}">[\s\S]*<\/a>$/.test(phone) || unsafe(phone))) throw new Fail("Invalid phone");
        }
        const escH = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        let n = 0;
        for (const rel of allPages()) {
          if (rel === "404.html") continue;
          const abs = path.join(ROOT, rel), o = fs.readFileSync(abs, "utf8"), url = urlOf(rel); let h = o;
          if (brand) { const b = url === "/" ? brand.replace(/^<a class="brand"/, '<a class="brand" aria-current="page"') : brand; h = h.replace(/<a class="brand"[^>]*>[\s\S]*?<\/a>/, () => b); }
          if (cta) h = h.replace(/(<a class="header-cta"[^>]*>\s*<span class="header-cta-label">)[\s\S]*?(<\/span>)/, (m, a, c) => a + escH(cta) + c);
          const old = foot && /<footer class="footer">[\s\S]*?<\/footer>/.exec(h);
          if (old) {
            let f = foot;
            for (const id of ["footer-process", "footer-services", "footer-faq"]) { const m = new RegExp('<a id="' + id + '" href="([^"]*)"').exec(old[0]); if (m) f = f.replace(new RegExp('(<a id="' + id + '" href=")[^"]*"'), (x, a) => a + m[1] + '"'); }
            if (!introAll) { const it = /<div class="footer-intro">[\s\S]*?<\/div>(?=\s*<nav)/.exec(old[0]); if (it) f = f.replace(/<div class="footer-intro">[\s\S]*?<\/div>(?=\s*<nav)/, () => it[0]); }
            f = f.replace(/(id="footer-cta" href=")\/#([a-z0-9-]+)"/g, (m, a, id) => (h.includes('id="' + id + '"') ? a + "#" + id + '"' : m));
            h = h.replace(/<footer class="footer">[\s\S]*?<\/footer>/, () => f);
          }
          if (design) {
            h = h.replace(/\s*<style id="wx-chrome-style"[^>]*>[\s\S]*?<\/style>/g, "");
            if (style) h = h.replace(/<\/head>/i, () => style + "\n</head>");
            h = h.replace(/<a class="wx-hphone"[^>]*>[\s\S]*?<\/a>/g, "");
            if (phone) h = h.replace(/<a class="header-cta"/, (m) => phone + m);
          }
          if (h !== o) { backupPage(rel); fs.writeFileSync(abs, h); n++; }
        }
        log(db, u, "global.chrome", n + " pages", ip); return done({ ok: true, changed: n });
      }
      case "global_replace": {
        const u = need(["owner", "admin"]), find = String(inp.find || ""), rep = String(inp.replace || ""), dry = !!inp.dry;
        const scope = (inp.scope || []).filter((k) => PATS[k]);
        if (find.length < 2) throw new Fail("Type at least 2 characters to find"); if (!scope.length) throw new Fail("Choose where to search");
        if (unsafe(rep)) throw new Fail("Scripts are not allowed");
        const res = []; let total = 0;
        for (const rel of allPages()) {
          const abs = path.join(ROOT, rel); let h = fs.readFileSync(abs, "utf8"), cnt = 0;
          const spans = scope.map((k) => { const m = PATS[k].exec(h); return m ? [m.index, m[0].length] : null; }).filter(Boolean).sort((a, b) => b[0] - a[0]);
          for (const [off, len] of spans) { const part = h.substr(off, len), c = part.split(find).length - 1; if (c) { cnt += c; h = h.slice(0, off) + part.split(find).join(rep) + h.slice(off + len); } }
          if (cnt) { res.push({ path: rel, count: cnt }); total += cnt; if (!dry) { backupPage(rel); fs.writeFileSync(abs, h); } }
        }
        if (!dry && total) log(db, u, "global.replace", `"${find.slice(0, 60)}" → "${rep.slice(0, 60)}" (${res.length} pages)`, ip);
        return done({ ok: true, pages: res, total, dry });
      }
    }
    return null;
  }

  // =================================================================== A4 — forms, leads, pipeline, clients, alerts
  const STAGES = ["new", "contacted", "visit", "quote", "hold", "won", "lost"];
  const TEAM_SRC = ["manual", "client", "referral", "walkin", "phone", "facebook", "instagram", "google", "tiktok", "portal", "architect", "builder", "event", "outreach", "other"];
  const SOURCES = { contact: "Contact form", booking: "Online booking", estimator: "Cost estimator", brief: "3D brief", "fitout-hub": "Fit-out quote", "office-fitout": "Office fit-out quote", whatsapp: "WhatsApp widget", chat: "Live chat", client: "Existing client (repeat)", referral: "Referral / word of mouth", walkin: "Walk-in / office visit", phone: "Phone call", facebook: "Facebook", instagram: "Instagram", google: "Google search / Maps", tiktok: "TikTok / YouTube", portal: "Zameen / OLX / portals", architect: "Architect / consultant", builder: "Builder / developer", event: "Exhibition / event", outreach: "Cold call / outreach", other: "Other", manual: "Added by team", import: "CSV import" };
  const CRM = path.join(PRIV, "crm.json"), OUTBOX = path.join(PRIV, "outbox.jsonl");
  const OFFERS = path.join(PRIV, "offers.json");
  const GSA = path.join(PRIV, "google-sa.json");
  const crmCfg = () => Object.assign({ emailOn: false, emailTo: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", smtpFrom: "", waOn: false, waToken: "", waPhoneId: "", waTo: "", waTemplate: "", waLang: "en", tsSite: "", tsSecret: "" }, jr(CRM, {}));
  const SECRETS = ["smtpPass", "waToken", "tsSecret"];
  const cfgPub = (c) => { const o = { ...c }; SECRETS.forEach((k) => { o[k + "Set"] = !!c[k]; o[k] = ""; }); return o; };
  const clip = (v, n = 500) => String(v == null ? "" : v).trim().slice(0, n);
  const formHits = new Map();
  const ensureCrm = (db) => { db.leads = db.leads || []; db.clients = db.clients || []; db.seqL = db.seqL || 0; db.seqC = db.seqC || 0; };
  function leadText(l) {
    const f = Object.entries(l.fields || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
    return `New enquiry #${l.id} — ${SOURCES[l.source] || l.source}\nName: ${l.name}\nPhone: ${l.phone}${l.email ? "\nEmail: " + l.email : ""}${l.service ? "\nService: " + l.service : ""}${l.message ? "\nMessage: " + l.message : ""}${f ? "\n" + f : ""}\nPage: ${l.page || "-"}`;
  }
  async function sendAlerts(l, only) {
    const c = crmCfg(), res = {}, text = leadText(l);
    if ((only ? only === "email" : c.emailOn) && c.emailTo) {
      // preview server: no SMTP — write to the outbox file instead (api/forms.php sends real mail on Hostinger)
      fs.appendFileSync(OUTBOX, JSON.stringify({ t: now(), channel: "email", to: c.emailTo, subject: `New enquiry #${l.id}: ${l.name}`, text }) + "\n"); res.email = "queued (preview outbox)";
    }
    if ((only ? only === "whatsapp" : c.waOn) && c.waToken && c.waPhoneId && c.waTo) {
      for (const to of c.waTo.split(/[\s,]+/).filter(Boolean)) {
        const body = c.waTemplate ? { messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "template", template: { name: c.waTemplate, language: { code: c.waLang || "en" }, components: [{ type: "body", parameters: [{ type: "text", text: `#${l.id} ${l.name}` }, { type: "text", text: l.phone }, { type: "text", text: (SOURCES[l.source] || l.source) + (l.service ? " · " + l.service : "") }] }] } }
          : { messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body: text.slice(0, 4000) } };
        try { const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(c.waPhoneId)}/messages`, { method: "POST", headers: { Authorization: "Bearer " + c.waToken, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
          const j = await r.json().catch(() => ({})); res.whatsapp = r.ok ? "sent" : "failed: " + ((j.error && j.error.message) || r.status);
        } catch (e) { res.whatsapp = "failed: " + (e.name === "TimeoutError" ? "no response from Meta" : e.message); }
        fs.appendFileSync(OUTBOX, JSON.stringify({ t: now(), channel: "whatsapp", to, result: res.whatsapp }) + "\n");
      }
    }
    return res;
  }
  const leadPub = (l, db) => ({ ...l, assigned_name: l.assigned_to ? ((db.users.find((u) => u.id === l.assigned_to) || {}).name || "") : "" });
  /** public endpoint: /api/forms.php */
  async function formsApi(req, inp) {
    if (["book_cfg", "book_slots", "book_create"].includes(inp.action)) return bkPublic(req, inp);
    const c = crmCfg();
    if (inp.action === "config") return { ok: true, turnstile: c.tsSite || "" };
    if (inp.action === "wa_click") {
      const f = path.join(PRIV, "wa-stats.json"), st = jr(f, {}), d = new Date().toISOString().slice(0, 10);
      st.days = st.days || {}; st.days[d] = (st.days[d] || 0) + 1;
      for (const [k, v] of [["pages", String(inp.page || "/").replace(/[^a-z0-9/_-]/gi, "").slice(0, 120) || "/"], ["services", String(inp.service || "").replace(/[^\w &/-]/g, "").slice(0, 60)]]) { st[k] = st[k] || {}; if (v && (st[k][v] || Object.keys(st[k]).length < 300)) st[k][v] = (st[k][v] || 0) + 1; }
      jw(f, st); return { ok: true };
    }
    const ip = req.socket.remoteAddress || "";
    if (clip(inp._hp) || clip(inp.company_hp)) return { ok: true, id: 0 }; // bot: pretend success
    const h = (formHits.get(ip) || []).filter((t) => Date.now() - t < 600000); if (h.length >= 5) throw new Fail("Too many enquiries from this connection. Please WhatsApp us instead.", 429); h.push(Date.now()); formHits.set(ip, h);
    if (c.tsSecret && inp.form !== "whatsapp") {
      const tok = clip(inp["cf-turnstile-response"] || inp.turnstile, 2048); if (!tok) throw new Fail("Please complete the spam check", 400);
      try { const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: c.tsSecret, response: tok, remoteip: ip }), signal: AbortSignal.timeout(6000) }); const j = await r.json(); if (!j.success) throw new Fail("Spam check failed — please try again", 400); }
      catch (e) { if (e instanceof Fail) throw e; /* Cloudflare unreachable: accept rather than lose the lead */ }
    }
    const name = clip(inp.name, 120), phone = clip(inp.phone, 40), email = clip(inp.email, 190);
    if (name.length < 2) throw new Fail("Please enter your name");
    if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) throw new Fail("Please enter a valid phone number");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fail("Please check your email address");
    const source = Object.prototype.hasOwnProperty.call(SOURCES, inp.form) && !["manual", "import"].includes(inp.form) ? inp.form : "contact";
    const skip = new Set(["action", "form", "name", "phone", "email", "message", "service", "page", "_hp", "company_hp", "cf-turnstile-response", "turnstile"]), fields = {};
    for (const [k, v] of Object.entries(inp)) if (!skip.has(k) && /^[a-z0-9_ -]{1,40}$/i.test(k) && v !== "" && v != null && Object.keys(fields).length < 25) fields[k] = clip(v, 1000);
    const db = load(); if (!db) throw new Fail("Enquiries are not available right now. Please WhatsApp us.", 503); ensureCrm(db);
    const l = { id: ++db.seqL, created_at: now(), source, page: clip(inp.page, 200), name, phone, email, service: clip(inp.service, 120), message: clip(inp.message, 4000), fields, stage: "new", assigned_to: null, followup: "", value: 0, lost_reason: "", client_id: null, tags: [], notes: [], read: false, ip };
    db.leads.push(l); save(db);
    sendAlerts(l).catch(() => {});
    return { ok: true, id: l.id };
  }
  const leadFind = (db, id) => { const l = db.leads.find((x) => x.id === +id); if (!l) throw new Fail("Enquiry not found", 404); return l; };
  const SALES = ["owner", "admin", "sales"];
  async function a4(action, inp, need, db, ip) {
    if (!/^(leads?_|clients?_|crm_|gdata_)/.test(action)) return null;
    ensureCrm(db); const done = (o) => { save(db); return o; };
    switch (action) {
      case "leads_list": { need(SALES); return { ok: true, leads: db.leads.slice().reverse().map((l) => leadPub(l, db)), stages: STAGES, sources: SOURCES, teamSources: TEAM_SRC, team: db.users.filter((u) => u.active && SALES.includes(u.role)).map((u) => ({ id: u.id, name: u.name })) }; }
      case "leads_count": { need(); return { ok: true, unread: db.leads.filter((l) => !l.read).length }; }
      case "lead_save": {
        const u = need(SALES); let l;
        if (inp.id) l = leadFind(db, inp.id);
        else { const name = clip(inp.name, 120); if (!name) throw new Fail("Name is required"); l = { id: ++db.seqL, created_at: now(), source: "manual", page: "", name, phone: "", email: "", service: "", message: "", fields: {}, stage: "new", assigned_to: null, followup: "", value: 0, lost_reason: "", client_id: null, tags: [], notes: [], read: true }; db.leads.push(l); }
        const before = l.stage;
        ["name", "phone", "email", "service", "message", "lost_reason"].forEach((k) => { if (k in inp) l[k] = clip(inp[k], k === "message" ? 4000 : 190); });
        if ("stage" in inp) { if (!STAGES.includes(inp.stage)) throw new Fail("Unknown stage"); l.stage = inp.stage; }
        if ("assigned_to" in inp) { const a = +inp.assigned_to || null; if (a && !db.users.some((x) => x.id === a)) throw new Fail("Unknown team member"); l.assigned_to = a; }
        if ("followup" in inp) { const f = clip(inp.followup, 10); if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Fail("Follow-up must be a date"); l.followup = f; }
        if ("value" in inp) l.value = Math.max(0, Math.round(+inp.value || 0));
        if ("tags" in inp) l.tags = (Array.isArray(inp.tags) ? inp.tags : String(inp.tags).split(",")).map((t) => clip(t, 30).toLowerCase()).filter(Boolean).slice(0, 10);
        if ("source" in inp && TEAM_SRC.includes(inp.source) && (TEAM_SRC.includes(l.source) || l.source === "import")) l.source = inp.source; if ("read" in inp) l.read = !!inp.read;
        s17LeadExtra(l, inp, db);
        if (before !== l.stage) l.notes.push({ t: now(), user: u.name, text: `Stage: ${before} → ${l.stage}`, sys: true });
        log(db, u, inp.id ? "lead.update" : "lead.create", `#${l.id} ${l.name}${before !== l.stage ? " → " + l.stage : ""}`, ip);
        return done({ ok: true, lead: leadPub(l, db) });
      }
      case "lead_note": { const u = need(SALES), l = leadFind(db, inp.id), text = clip(inp.text, 2000); if (!text) throw new Fail("Write a note first"); l.notes.push({ t: now(), user: u.name, text }); log(db, u, "lead.note", `#${l.id}`, ip); return done({ ok: true, lead: leadPub(l, db) }); }
      case "lead_delete": { const u = need(["owner", "admin"]), l = leadFind(db, inp.id); db.leads = db.leads.filter((x) => x !== l); log(db, u, "lead.delete", `#${l.id} ${l.name}`, ip); return done({ ok: true }); }
      case "leads_import": {
        const u = need(["owner", "admin"]), rows = Array.isArray(inp.rows) ? inp.rows.slice(0, 2000) : []; let n = 0;
        for (const r of rows) { const name = clip(r.name, 120); if (!name) continue; const st = STAGES.includes(String(r.stage || "").toLowerCase()) ? String(r.stage).toLowerCase() : "new";
          db.leads.push({ id: ++db.seqL, created_at: /^\d{4}-\d{2}-\d{2}/.test(r.created_at || "") ? clip(r.created_at, 19) : now(), source: "import", page: "", name, phone: clip(r.phone, 40), email: clip(r.email, 190), service: clip(r.service, 120), message: clip(r.message, 4000), fields: {}, stage: st, assigned_to: null, followup: "", value: Math.max(0, Math.round(+r.value || 0)), lost_reason: "", client_id: null, tags: [], notes: [], read: true }); n++; }
        log(db, u, "lead.import", n + " rows", ip); return done({ ok: true, imported: n });
      }
      case "lead_convert": {
        const u = need(SALES), l = leadFind(db, inp.id);
        if (l.client_id && db.clients.some((c) => c.id === l.client_id)) return { ok: true, client_id: l.client_id };
        let c = db.clients.find((x) => (l.phone && x.phone.replace(/\D/g, "") === l.phone.replace(/\D/g, "")) || (l.email && x.email === l.email));
        if (!c) { c = { id: ++db.seqC, name: l.name, phone: l.phone, email: l.email, company: "", city: "Lahore", address: "", notes: "", created_at: now() }; db.clients.push(c); }
        l.client_id = c.id; if (!["won", "lost"].includes(l.stage)) { l.notes.push({ t: now(), user: u.name, text: `Stage: ${l.stage} → won`, sys: true }); l.stage = "won"; }
        log(db, u, "client.create", `${c.name} (from #${l.id})`, ip); return done({ ok: true, client_id: c.id });
      }
      case "clients_list": { need(SALES); return { ok: true, clients: db.clients.slice().reverse().map((c) => { const ls = db.leads.filter((l) => l.client_id === c.id); return { ...c, leads: ls.map((l) => ({ id: l.id, stage: l.stage, service: l.service, value: l.value, created_at: l.created_at })), value: ls.filter((l) => l.stage === "won").reduce((a, l) => a + (l.value || 0), 0) }; }) }; }
      case "client_save": {
        const u = need(SALES), name = clip(inp.name, 120); if (!name) throw new Fail("Name is required");
        let c = inp.id ? db.clients.find((x) => x.id === +inp.id) : null; if (inp.id && !c) throw new Fail("Client not found", 404);
        if (!c) { c = { id: ++db.seqC, created_at: now() }; db.clients.push(c); }
        Object.assign(c, { name, phone: clip(inp.phone, 40), email: clip(inp.email, 190), company: clip(inp.company, 120), city: clip(inp.city, 80), address: clip(inp.address, 300), notes: clip(inp.notes, 4000) }); s17ClientExtra(c, inp);
        log(db, u, inp.id ? "client.update" : "client.create", c.name, ip); return done({ ok: true, client: c });
      }
      case "client_delete": { const u = need(["owner", "admin"]), c = db.clients.find((x) => x.id === +inp.id); if (!c) throw new Fail("Client not found", 404); db.clients = db.clients.filter((x) => x !== c); db.leads.forEach((l) => { if (l.client_id === c.id) l.client_id = null; }); log(db, u, "client.delete", c.name, ip); return done({ ok: true }); }
      case "gdata_status": { need(["owner", "admin", "sales", "editor"]); const c = jr(GSA, {}); return { ok: true, connected: !!c.email, email: c.email || "", ga4: c.ga4 || "", gsc: c.gsc || "" }; }
      case "gdata_save": { need(["owner", "admin"]); const c = jr(GSA, {});
        if (inp.keyJson) { let k; try { k = JSON.parse(inp.keyJson); } catch { k = null; } if (!k || k.type !== "service_account" || !k.client_email || !k.private_key) throw new Fail('This is not a service-account key file (it must contain "type": "service_account")'); c.email = k.client_email; }
        if ("ga4" in inp) c.ga4 = String(inp.ga4 || "").replace(/\D/g, ""); if ("gsc" in inp) { const g = String(inp.gsc || "").trim(); if (g && !/^(sc-domain:[a-z0-9.-]+|https?:\/\/\S+\/)$/i.test(g)) throw new Fail("Search Console property: use sc-domain:woodex.com.pk or https://woodex.com.pk/ (with the ending /)"); c.gsc = g; }
        jw(GSA, c); return { ok: true, connected: !!c.email, email: c.email || "", ga4: c.ga4, gsc: c.gsc }; }
      case "gdata_clear": { need(["owner", "admin"]); try { fs.unlinkSync(GSA); } catch {} return { ok: true }; }
      case "gdata_report": { need(["owner", "admin", "sales", "editor"]); const c = jr(GSA, {}); if (!c.email) return { ok: true, connected: false };
        const days = [7, 28, 90].includes(+inp.days) ? +inp.days : 28; let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        const daily = [], sd = []; for (let i = days; i >= 1; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const u = Math.round(40 + rnd() * 60 + (days - i) * 0.6); daily.push({ date: d, users: u, sessions: Math.round(u * 1.3), views: Math.round(u * 2.6) }); sd.push({ date: d, clicks: Math.round(u * 0.35), impressions: Math.round(u * 9) }); }
        const sum = (a, k) => a.reduce((t, x) => t + x[k], 0), cl = sum(sd, "clicks"), im = sum(sd, "impressions");
        return { ok: true, connected: true, cached: false, preview: true, days, at: new Date().toISOString(),
          ga4: c.ga4 ? { daily, totals: { users: sum(daily, "users"), sessions: sum(daily, "sessions"), views: sum(daily, "views") }, pages: [["/", 1240], ["/renovation/", 610], ["/interior-design/", 480], ["/projects/", 390], ["/contact/", 250]].map(([p, v]) => ({ path: p, views: v })), sources: [["Organic Search", 820], ["Direct", 510], ["Organic Social", 260], ["Referral", 90]].map(([n, v]) => ({ name: n, sessions: v })) } : { error: "Add your GA4 Property ID (Analytics → Admin → Property details)." },
          gsc: c.gsc ? { daily: sd, totals: { clicks: cl, impressions: im, ctr: Math.round(cl / im * 1000) / 10, position: 14.2 }, queries: [["interior designer lahore", 120, 2100, 6.1], ["woodex interior", 95, 300, 1.2], ["home renovation lahore", 40, 1800, 11.4], ["office fit out lahore", 22, 900, 9.8]].map(([q, a, b, p]) => ({ q, clicks: a, impressions: b, position: p })) } : { error: "Add your Search Console property (e.g. sc-domain:woodex.com.pk)." } }; }
      case "crm_wa_status": { need(["owner", "admin"]); const c = crmCfg(); if (!c.waToken || !c.waPhoneId) return { ok: true, connected: false };
        return { ok: true, connected: true, info: { ok: true, number: "+92 300 1234567 (preview)", name: "Woodex Interior", quality: "GREEN" } }; }
      case "crm_wa_connect": { const u = need(["owner", "admin"]); const c = crmCfg(); const tok = String(inp.token || "").trim() || c.waToken, pid = String(inp.phoneId || "").replace(/\D/g, "");
        if (!tok || !pid) throw new Fail("Enter the access token and the Phone number ID"); if (tok === "bad") throw new Fail("Meta did not accept this: Invalid OAuth access token");
        c.waToken = tok; c.waPhoneId = pid; jw(CRM, c); log(db, u, "settings.wa", pid, ip); return done({ ok: true, info: { ok: true, number: "+92 300 1234567 (preview)", name: "Woodex Interior" } }); }
      case "crm_wa_disconnect": { const u = need(["owner", "admin"]); const c = crmCfg(); c.waToken = ""; c.waPhoneId = ""; c.waOn = false; jw(CRM, c); return done({ ok: true }); }
      case "crm_offers": { need(SALES); const c = crmCfg(); return { ok: true, offers: jr(OFFERS, {}).offers || [], waConnected: !!(c.waToken && c.waPhoneId) }; }
      case "crm_offer_save": { const u = need(["owner", "admin"]); const d = jr(OFFERS, {}); const list = d.offers || []; const id = String(inp.id || "") || crypto.randomBytes(4).toString("hex");
        const o = { id, title: clip(inp.title, 80), code: String(inp.code || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase(), percent: Math.max(0, Math.min(90, +inp.percent || 0)), expires: /^\d{4}-\d{2}-\d{2}$/.test(inp.expires || "") ? inp.expires : "", msg: clip(inp.msg, 1000), sent: 0 };
        if (!o.title || !o.msg) throw new Fail("Enter a title and the message"); const i = list.findIndex(x => x.id === id); if (i >= 0) { o.sent = list[i].sent || 0; list[i] = o; } else list.push(o);
        d.offers = list; jw(OFFERS, d); return done({ ok: true, offers: list }); }
      case "crm_offer_delete": { need(["owner", "admin"]); const d = jr(OFFERS, {}); d.offers = (d.offers || []).filter(x => x.id !== String(inp.id || "")); jw(OFFERS, d); return done({ ok: true, offers: d.offers }); }
      case "crm_offer_send": { const u = need(SALES); const d = jr(OFFERS, {}); const off = (d.offers || []).find(x => x.id === String(inp.id || "")); if (!off) throw new Fail("Offer not found", 404);
        if (off.expires && off.expires < new Date().toISOString().slice(0, 10)) throw new Fail("This offer has expired — change the date first");
        const ids = (inp.leads || []).slice(0, 50).map(Number); if (!ids.length) throw new Fail("Choose at least one lead"); const c = crmCfg(); let sent = 0; const results = [];
        for (const id of ids) { const l = (db.leads || []).find(x => x.id === id); if (!l) continue; const first = String(l.name || "").trim().split(" ")[0] || "there";
          const txt = off.msg.replace(/\{name\}/g, first).replace(/\{code\}/g, off.code).replace(/\{percent\}/g, off.percent).replace(/\{expires\}/g, off.expires);
          const link = l.phone ? "https://wa.me/" + String(l.phone).replace(/\D/g, "") + "?text=" + encodeURIComponent(txt) : "";
          const err = !l.phone ? "no phone number" : !(c.waToken && c.waPhoneId) ? "WhatsApp is not connected (Settings → Integrations)" : "";
          if (!err) { sent++; l.notes.push({ t: now(), user: u.name, text: "Offer sent on WhatsApp: " + off.title }); } results.push({ id, name: l.name, ok: !err, error: err, link }); }
        off.sent = (off.sent || 0) + sent; jw(OFFERS, d); return done({ ok: true, sent, results }); }
      case "crm_settings": { need(["owner", "admin"]); return { ok: true, settings: cfgPub(crmCfg()) }; }
      case "crm_settings_save": {
        const u = need(["owner", "admin"]), c = crmCfg(), s = inp.settings || {};
        for (const k of Object.keys(c)) { if (!(k in s)) continue; if (SECRETS.includes(k) && s[k] === "" && !s[k + "Clear"]) continue; c[k] = typeof c[k] === "boolean" ? !!s[k] : k === "smtpPort" ? (+s[k] || 465) : clip(s[k], 600); }
        if (c.emailTo && c.emailTo.split(/[\s,]+/).filter(Boolean).some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new Fail("Check the alert email address(es)");
        jw(CRM, c); log(db, u, "settings.crm", "", ip); return done({ ok: true, settings: cfgPub(c) });
      }
      case "crm_test": {
        need(["owner", "admin"]); const ch = inp.channel === "whatsapp" ? "whatsapp" : "email", c = crmCfg();
        if (ch === "email" && !c.emailTo) throw new Fail("Add an alert email address first");
        if (ch === "whatsapp" && !(c.waToken && c.waPhoneId && c.waTo)) throw new Fail("Add the WhatsApp token, phone number ID and recipient first");
        const r = await sendAlerts({ id: 0, source: "manual", name: "Test enquiry", phone: "+92 300 0000000", email: "", service: "Test", message: "This is a test alert from Woodex Admin.", fields: {}, page: "/admin/" }, ch);
        const v = r[ch] || "not sent"; if (/^failed/.test(v)) throw new Fail(v); return { ok: true, result: v };
      }
    }
    return null;
  }

  // =================================================================== A5 — templates, quotations, invoices, payments, projects
  const UNITS = ["sft", "rft", "sqmt", "nos", "each", "set", "point", "job", "lumpsum"];
  const QSTATUS = ["draft", "sent", "approved", "rejected", "superseded", "invoiced"];
  const PSTAGES = ["planning", "design", "procurement", "execution", "finishing", "handover", "completed"];
  const COMPANY = path.join(PRIV, "company.json");
  const coList = (k, rows) => { const f = { banks: ["bank", "title", "account", "iban", "branch", "code", "use"], wallets: ["name", "number"], signers: ["name", "title"] }[k]; if (!f || !Array.isArray(rows)) return [];
    return rows.slice(0, 8).filter((r) => r && typeof r === "object").map((r) => { const x = {}; f.forEach((n) => { x[n] = clip(r[n], 120); }); if (k === "banks") x.use = ["all", "interior", "furniture"].includes(x.use) ? x.use : "all"; return x; }).filter((x) => x[f[0]] || x[f[1]]); };
  const companyCfg = () => Object.assign({ name: "Woodex Interior", tagline: "Design · Build · Furniture", address: "M-71, Zainab Tower, Model Town Link Road, Lahore", phones: "+92 322 4000768", email: "info@woodex.com.pk", web: "woodex.com.pk", ntn: "", bankName: "", bankTitle: "", bankAccount: "", bankIban: "", signName: "Imtiaz Ahmad", signTitle: "Director", signers: [{ name: "Imtiaz Ahmad", title: "Director" }, { name: "Nabeel Afzal", title: "Marketing Manager" }],
    banks: [{ bank: "Bank Alfalah", title: "WOODEX INTERIOR", account: "02931007869105", iban: "PK06ALFH0293001007869105", branch: "Link Rd Model Town Br: Lahore", code: "0293", use: "interior" }, { bank: "Meezan Bank", title: "WOODEX FURNITURE", account: "02810111519091", iban: "PK43MEZN0002810111519091", branch: "Model Town Link Road, Lahore", code: "", use: "furniture" }],
    wallets: [{ name: "JazzCash", number: "+92 321 3656096" }, { name: "Easypaisa", number: "+92 321 3656096" }], payTerms: "", prefix: "WI-", nextNo: 10100, validDays: 15, consultant: "Woodex Interior" }, jr(COMPANY, {}));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;
  function cleanSections(sections) {
    if (!Array.isArray(sections)) return [];
    return sections.slice(0, 40).map((s) => ({
      name: clip(s && s.name, 80) || "Section", note: clip(s && s.note, 600),
      items: (Array.isArray(s && s.items) ? s.items : []).slice(0, 300).map((it) => {
        const qty = num(it.qty), rate = num(it.rate), unit = UNITS.includes(String(it.unit || "").toLowerCase()) ? String(it.unit).toLowerCase() : "job";
        const kind = ["head", "spec"].includes(it.kind) ? it.kind : "";
        return { desc: clip(it.desc, kind === "spec" ? 2000 : 600), qty: kind ? 0 : qty, unit, rate: kind ? 0 : rate, amount: kind ? 0 : r2(qty * rate), kind, code: clip(it.code, 12) };
      }).filter((it) => it.desc), area: num(s && s.area),
    }));
  }
  function totals(doc) {
    let sub = 0; doc.sections.forEach((s) => { s.subtotal = r2(s.items.reduce((a, it) => a + it.amount, 0)); sub += s.subtotal; });
    doc.subtotal = Math.round(sub); doc.discount = Math.min(Math.round(num(doc.discount)), doc.subtotal); doc.taxPct = Math.min(num(doc.taxPct), 50);
    doc.rent = Math.max(0, Math.round(num(doc.rent))); /*P18rent*/ doc.tax = Math.round((doc.subtotal - doc.discount + doc.rent) * doc.taxPct / 100); doc.total = doc.subtotal - doc.discount + doc.rent + doc.tax; doc.advance = Math.min(Math.max(0, Math.round(num(doc.advance))), doc.total); return doc;
  }
  const p18Blocks = (b) => { const ok = ["summary", "scope", "items", "totals", "terms", "bank", "sign"], o = []; (Array.isArray(b) ? b : []).forEach((k) => { k = String(k); const n = k.replace(/^-+/, ""); if (ok.includes(n) && !o.some((x) => x.replace(/^-+/, "") === n)) o.push(k); }); return o; };
  const ensureA5 = (db) => { ensureCrm(db); ["tpls", "quotes", "invoices", "projects"].forEach((k) => { db[k] = db[k] || []; }); ["seqT", "seqQ", "seqI", "seqP", "seqPay"].forEach((k) => { db[k] = db[k] || 0; }); };
  const clientOf = (inp) => ({ name: clip(inp.name, 120), phone: clip(inp.phone, 40), email: clip(inp.email, 190), address: clip(inp.address, 300), company: clip(inp.company, 120) });
  const qViewTok = (q) => hmac("qv|" + q.id + "|" + q.no).slice(0, 32);
  const qViewUrl = (q, host) => (host ? "https://" + String(host).replace(/[^a-z0-9.\-:]/gi, "") : "") + "/api/quote-view.php?id=" + q.id + "&t=" + qViewTok(q);
  const qLabel = (q) => q.no + (q.version > 1 ? " · V" + q.version : "") + (q.option ? " · " + q.option : "");
  const invPub = (i) => { const paid = i.payments.reduce((a, p) => a + p.amount, 0); return { ...i, paid, balance: Math.max(0, i.total - paid), payStatus: paid <= 0 ? "unpaid" : paid >= i.total ? "paid" : "partial", overdue: paid < i.total && i.due_date && i.due_date < now().slice(0, 10) }; };
  // ---- P17 S1+S2 mirror of api/sales17-lib.php
  const S17 = { lines: { furniture: "Furniture", interior: "Interior", project: "Project" }, leadTypes: { new: "New lead", returning: "Returning client", referral: "Referral" },
    quoteStatus: { "": "—", pending: "Pending", proposal: "Proposal / Quotation", done: "Done" }, nextTypes: { call: "Call", whatsapp: "WhatsApp", visit: "Site visit", meeting: "Meeting", email: "Email" },
    clientTypes: { individual: "Individual", company: "Company", developer: "Developer / builder", architect: "Architect / consultant" },
    projectTypes: ["Kitchen design", "Wardrobe & storage", "Bedroom design", "Living room design", "Dining room design", "Kids room design", "Home office design", "Basement design", "Complete home redesign / refurbishment", "House design (5 / 10 marla, 1 / 2 kanal)", "Farmhouse design", "Front elevation design", "Office interior design", "Office fit-out", "Co-working space", "Retail / showroom design", "Shopping mall design", "Restaurant / café interior", "Hotel interior design", "Healthcare / clinic design", "Pharmacy fit-out", "Gym design", "Spa / beauty salon design", "Educational building design", "Commercial fit-out", "Residential renovation", "Commercial / office renovation", "Restaurant / showroom renovation", "Architecture & master planning", "Turnkey design-build", "3D visualisation", "Furniture supply", "Other"] };
  const s17dt = (v) => { v = String(v || "").trim(); if (!v) return ""; const t = new Date(v.replace(" ", "T")); if (isNaN(t)) throw new Fail(`Check the date / time "${v.slice(0, 30)}"`); const p = (n) => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:00`; };
  const s17dig = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "0") d = "92" + d.slice(1); else if (d.length === 10 && d[0] === "3") d = "92" + d; return d; };
  function s17LeadExtra(l, inp, db) {
    for (const [k, n] of Object.entries({ company: 120, designation: 80, location: 160, project_type: 60, budget: 60, area: 30 })) if (k in inp) l[k] = clip(inp[k], n);
    const en = { line: Object.keys(S17.lines), lead_type: Object.keys(S17.leadTypes), quote_status: Object.keys(S17.quoteStatus), next_type: Object.keys(S17.nextTypes), priority: ["low", "normal", "high"] };
    for (const [k, ok] of Object.entries(en)) if (k in inp) { const v = String(inp[k] || ""); if (v && !ok.includes(v)) throw new Fail("Unknown " + k.replace("_", " ")); l[k] = v; }
    if ("next_at" in inp) { l.next_at = s17dt(inp.next_at); l.followup = l.next_at.slice(0, 10); }
    if ("last_contact" in inp) l.last_contact = s17dt(inp.last_contact);
    if (inp.client_id) { if (!db.clients.some((c) => c.id === +inp.client_id)) throw new Fail("Client not found", 404); l.client_id = +inp.client_id; }
  }
  function s17ClientExtra(c, inp) {
    c.updated_at = now(); for (const k of ["designation", "source"]) if (k in inp) c[k] = clip(inp[k], 80);
    if ("type" in inp) { if (inp.type && !S17.clientTypes[inp.type]) throw new Fail("Unknown client type"); c.type = inp.type || ""; }
    if ("line" in inp) { if (inp.line && !S17.lines[inp.line]) throw new Fail("Unknown business line"); c.line = inp.line || ""; }
    if ("tags" in inp) c.tags = (Array.isArray(inp.tags) ? inp.tags : String(inp.tags).split(",")).map((t) => clip(t, 30).toLowerCase()).filter(Boolean).slice(0, 12);
  }
  const s17Status = (iv, pp, ls) => { const open = pp.filter((p) => !["handover", "done", "closed"].includes(p.stage)), bal = iv.reduce((a, i) => a + i.balance, 0), won = ls.filter((l) => l.stage === "won").length;
    if (iv.length >= 2 || won >= 2) return "returning"; if (open.length || bal > 0 || (iv.length === 1 && new Date(iv[0].issue_date) > Date.now() - 90 * 864e5)) return "active"; if (!iv.length && !won) return "prospect"; return "past"; };
  function s17Docs(db, c) { const d = s17dig(c.phone), mine = (x) => +x.client_id === c.id || (d.length >= 10 && s17dig((x.client || {}).phone) === d);
    return [(db.quotes || []).filter(mine), (db.invoices || []).filter(mine).map(invPub), (db.projects || []).filter((p) => +p.client_id === c.id)]; }
  const s17InvNo = (line, db) => { for (let k = 0; k < 500; k++) { const no = s17InvNo1(line); if (!db.invoices.some((x) => x.no === no) && !(db.quotes || []).some((x) => x.no === no)) return no; } throw new Fail("Could not find a free invoice number"); };
  const s17InvNo1 = (line) => { if (line !== "furniture") { const c = companyCfg(), no = c.prefix + c.nextNo; c.nextNo++; jw(COMPANY, c); return no; } const c = jr(COMPANY, {}), n = Math.max(10050, +c.wfNext || 10050); c.wfNext = n + 1; jw(COMPANY, c); return (c.wfPrefix || "WF-") + n; };
  const s17InvRow = (x) => { const i = invPub(x), t = now().slice(0, 10); const r = { ...i, track: i.total > 0 && i.balance <= 0 ? "paid" : i.mode === "after_delivery" && !i.delivered ? "after_delivery" : i.paid > 0 ? "partial" : "unpaid", late: !!(i.delivery_date && !i.delivered && i.delivery_date < t) };
    ["po", "delivery_date", "line", "mode", "track_note", "delivered"].forEach((k) => { r[k] = String(r[k] || ""); }); r.company = (i.client && (i.client.company || i.client.name)) || ""; delete r.sections; return r; };
  function s17InvClient(db, inp) {
    let cid = +inp.client_id || 0; const ic = inp.client || {}, cl = { name: clip(ic.name, 120), company: clip(ic.company, 120), phone: clip(ic.phone, 40), email: clip(ic.email, 190), address: clip(ic.address, 300) };
    if (cid) { const c = db.clients.find((x) => x.id === cid); if (!c) throw new Fail("Client not found", 404); for (const k in cl) if (!cl[k]) cl[k] = c[k] || ""; }
    if (!cl.name) cl.name = cl.company; if (!cl.name) throw new Fail("Pick a client or type the company name");
    if (!cid) { const d = s17dig(cl.phone); const c = db.clients.find((x) => (d.length >= 10 && s17dig(x.phone) === d) || (cl.company && String(x.company || "").toLowerCase() === cl.company.toLowerCase()));
      if (c) cid = c.id; else { const n = { id: ++db.seqC, name: cl.name, phone: cl.phone, email: cl.email, company: cl.company, city: "Lahore", address: cl.address, notes: "", created_at: now() }; db.clients.push(n); cid = n.id; } }
    return [cid, cl];
  }
  // ---- P17 booking mirror (same actions as api/booking-lib.php)
  const BKF = path.join(PRIV, "booking.json"), BK_ST = { pending: "Waiting for approval", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled", noshow: "No-show" };
  const BK_DEF = { on: true, types: [{ k: "visit", label: "Site visit", dur: 60, on: true, hint: "Our designer visits your home, office or site to measure and discuss." }, { k: "office", label: "Office meeting", dur: 60, on: true, hint: "Meet the team at our Lahore studio and see materials." }, { k: "online", label: "Online call", dur: 30, on: true, hint: "A video or WhatsApp call to talk through your project." }],
    days: [1, 2, 3, 4, 5, 6], open: "10:00", last: "18:30", step: 60, maxDay: 3, minHours: 12, ahead: 30, areas: ["Lahore", "Other city (on request)"], blocked: [] };
  const bkCfg = () => Object.assign({}, BK_DEF, jr(BKF, {}));
  const pkNow = () => new Date(Date.now() + 5 * 3600e3); // Asia/Karachi (UTC+5, no DST) read with UTC getters
  const ymd = (d) => d.toISOString().slice(0, 10);
  const bkMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
  const bkHm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const bkLabel = (d, tm) => { const t = new Date(d + "T" + tm + ":00Z"); if (isNaN(t)) return d + " " + tm; const h = t.getUTCHours(); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][t.getUTCDay()] + " " + t.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()] + ", " + ((h % 12) || 12) + ":" + tm.slice(3) + " " + (h < 12 ? "am" : "pm"); };
  const bkType = (c, k) => c.types.find((t) => t.k === k) || null;
  const bkClosed = (c, d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + "T00:00:00Z"))) return "Invalid date";
    const today = ymd(pkNow()), lim = ymd(new Date(Date.parse(today + "T00:00:00Z") + c.ahead * 864e5));
    if (d < today) return "Past date"; if (d > lim) return "Too far ahead";
    const dow = new Date(d + "T00:00:00Z").getUTCDay() || 7; if (!c.days.map(Number).includes(dow)) return "Closed"; if ((c.blocked || []).includes(d)) return "Closed"; return "";
  };
  const bkFree = (db, c, d, dur, skip = 0, team = false) => {
    if (!team && bkClosed(c, d)) return [];
    const rows = (db.bookings || []).filter((b) => b.d === d && ["pending", "confirmed"].includes(b.status) && b.id !== skip);
    if (!team && rows.length >= c.maxDay) return [];
    const earliest = pkNow().getTime() + c.minHours * 3600e3, out = [];
    for (let m = bkMin(c.open); m <= bkMin(c.last); m += Math.max(15, c.step)) {
      if (!team && Date.parse(d + "T" + bkHm(m) + ":00Z") < earliest) continue;
      if (!rows.some((r) => m < bkMin(r.tm) + r.dur && bkMin(r.tm) < m + dur)) out.push(bkHm(m));
    }
    return out;
  };
  const bkRow = (b, c, db) => ({ ...b, type_label: (bkType(c, b.type) || {}).label || b.type, staff: b.staff_id ? ((db.users.find((u) => u.id === b.staff_id) || {}).name || "") : "", when: bkLabel(b.d, b.tm) });
  const bkNotify = (b, ev) => { const c = bkCfg(), t = bkType(c, b.type) || {}; const r = {}; const ref = (t.label || "Meeting") + " on " + bkLabel(b.d, b.tm);
    if (b.phone) { r.whatsapp = "sent (preview outbox)"; ntLog.unshift({ t: now(), event: ev, ref, name: b.name, channel: "wa", dest: b.phone, result: "sent" }); }
    if (b.email) { r.email = "sent (preview outbox)"; ntLog.unshift({ t: now(), event: ev, ref, name: b.name, channel: "email", dest: b.email, result: "sent" }); }
    fs.appendFileSync(OUTBOX, JSON.stringify({ t: now(), channel: "notify", event: ev, to: b.phone, ref }) + "\n"); return r; };
  const bkHits = new Map();
  async function bkPublic(req, inp) {
    const c = bkCfg(), db = load(); if (!db) throw new Fail("Booking is not available right now. Please WhatsApp us.", 503); ensureCrm(db); db.bookings = db.bookings || []; db.seqB = db.seqB || 0;
    if (inp.action === "book_cfg") { const days = {}, t0 = Date.parse(ymd(pkNow()) + "T00:00:00Z"); for (let i = 0; i <= c.ahead; i++) { const d = ymd(new Date(t0 + i * 864e5)); days[d] = !bkClosed(c, d) && bkFree(db, c, d, Math.min(...c.types.filter((t) => t.on).map((t) => t.dur), 480)).length ? 1 : 0; }
      return { ok: true, on: !!c.on, types: c.types.filter((t) => t.on).map((t) => ({ k: t.k, label: t.label, dur: t.dur, hint: t.hint || "" })), areas: c.areas, days, today: ymd(pkNow()) }; }
    if (!c.on) throw new Fail("Online booking is closed right now. Please WhatsApp us.", 503);
    if (inp.action === "book_slots") { const t = bkType(c, String(inp.type || "visit")); if (!t || !t.on) throw new Fail("Choose what you want to book"); return { ok: true, slots: bkFree(db, c, String(inp.date || ""), t.dur) }; }
    if (clip(inp._hp)) return { ok: true, id: 0 };
    const ip = req.socket.remoteAddress || "", h = (bkHits.get(ip) || []).filter((x) => Date.now() - x < 600000); if (h.length >= 3) throw new Fail("Too many bookings from this connection. Please WhatsApp us instead.", 429); h.push(Date.now()); bkHits.set(ip, h);
    const t = bkType(c, String(inp.type || "")); if (!t || !t.on) throw new Fail("Choose what you want to book");
    const name = clip(inp.name, 120), phone = clip(inp.phone, 40), email = clip(inp.email, 190);
    if (name.length < 2) throw new Fail("Please enter your name"); if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) throw new Fail("Please enter a valid phone number"); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fail("Please check your email address");
    const city = clip(inp.city, 80), address = clip(inp.address, 300), note = clip(inp.note, 1000), d = String(inp.date || ""), tm = String(inp.time || "");
    if (t.k === "visit" && address.length < 4) throw new Fail("Please enter the site address");
    if (!bkFree(db, c, d, t.dur).includes(tm)) throw new Fail("Sorry, that time was just taken — please pick another.", 409);
    const when = bkLabel(d, tm), fields = Object.fromEntries(Object.entries({ booking: t.label + " · " + when, city, address }).filter(([, v]) => v));
    const l = { id: ++db.seqL, created_at: now(), source: "booking", page: clip(inp.page || "/book-a-visit/", 200), name, phone, email, service: clip(inp.service, 120) || t.label, message: note, fields, stage: "visit", assigned_to: null, followup: d, next_at: d + " " + tm + ":00", next_type: t.k === "visit" ? "visit" : "meeting", value: 0, lost_reason: "", client_id: null, tags: [], notes: [], read: false, ip };
    db.leads.push(l);
    const b = { id: ++db.seqB, created_at: now(), lead_id: l.id, name, phone, email, type: t.k, city, address, d, tm, dur: t.dur, status: "pending", staff_id: 0, note, src: "web", reminded: 0 };
    db.bookings.push(b); save(db); sendAlerts({ ...l, service: t.label + " — " + when }).catch(() => {});
    return { ok: true, id: b.id, when, type: t.label };
  }
  /* P18 H mirror: maintenance switch, file manager (/assets), database browser (mirrors api/p18h-lib.php). Preview "tables" = arrays in admin-db.json. */
  const SYSF = path.join(PRIV, "system.json"), SYS_PAGES = ["404.html", "500.html", "503.html", "coming-soon.html"], FM_RO = ["assets/js", "assets/css", "assets/fonts", "assets/vendor"], FM_TRASH = path.join(PRIV, "trash");
  const FM_EXT = ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "ico", "pdf", "mp4", "webm", "mp3", "woff2", "woff", "txt", "csv", "json", "zip", "docx", "xlsx", "pptx"];
  function sysCfg() { const d = jr(SYSF, {}); const m = { on: false, mode: "maintenance", token: "", since: null, by: "", ...(d.maint || {}) }; if (!m.token) { m.token = crypto.randomBytes(16).toString("hex"); d.maint = m; jw(SYSF, d); } return m; }
  function sysHtLines() { const m = sysCfg(), pre = ["ErrorDocument 500 /500.html", "ErrorDocument 503 " + (m.mode === "soon" ? "/coming-soon.html" : "/503.html")], rw = [];
    if (m.on) rw.push("# maintenance mode (Admin → System → Maintenance): visitors get 503, staff with the wx_mt cookie see the site", "RewriteCond %{REQUEST_URI} !^/(admin|api|builder|assets)(/|$)", "RewriteCond %{REQUEST_URI} !^/(500|503|404|coming-soon)\\.html$", "RewriteCond %{REQUEST_URI} !^/(robots\\.txt|favicon\\.ico|sitemap\\.xml)$", "RewriteCond %{HTTP_COOKIE} !(^|;\\s*)wx_mt=" + m.token, "RewriteRule ^ - [R=503,L]");
    return [pre, rw]; }
  function fmPath(rel, must = true) { rel = String(rel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "assets";
    if (!/^assets(\/|$)/.test(rel) || /(^|\/)\.\.?(\/|$)/.test(rel) || /(^|\/)\./.test(rel)) throw new Fail("Outside the allowed folder"); const abs = path.join(ROOT, rel); if (must && !fs.existsSync(abs)) throw new Fail("Not found", 404); return [rel, abs]; }
  const fmRo = (rel) => rel === "assets" || FM_RO.some((r) => rel === r || rel.startsWith(r + "/"));
  const fmName = (n) => String(n || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const fmUsed = (url) => { const h = []; for (const rel of allPages()) { if (h.length >= 8) break; if (fs.readFileSync(path.join(ROOT, rel), "utf8").includes(url)) h.push(urlOf(rel)); } return h; };
  const DB_SECRET = /(pass|hash|token|secret|otp|reset|key)/i;
  const dbxTables = (db) => Object.keys(db).filter((k) => Array.isArray(db[k]) && db[k].length && typeof db[k][0] === "object").map((k) => "wx_" + k);
  const dbxMask = (k, v) => (v == null ? null : DB_SECRET.test(k) ? "••••••" : typeof v === "object" ? JSON.stringify(v) : v);
  /* P18 J — My account (mirror of api/p18j-lib.php) */
  const PROF = path.join(PRIV, "profiles.json"), PROF_KEYS = { phone: 30, whatsapp: 30, title: 80, city: 60, bio: 400 };
  const profGet = (id) => Object.assign({ phone: "", whatsapp: "", title: "", city: "", bio: "", avatar: "" }, jr(PROF, {})[String(id)] || {});
  const profPut = (id, p) => { const a = jr(PROF, {}); a[String(id)] = p; jw(PROF, a); };
  // P19 C: one central client record (mirror of api/p19c-lib.php)
  const p19key = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
  let p19t = 0;
  function p19link(db, throttle) {
    const n = { leads: 0, quotes: 0, invoices: 0, projects: 0 }; if (throttle && Date.now() - p19t < 60000) return n; p19t = Date.now();
    const ph = {}, em = {}; for (const c of db.clients || []) { const k = p19key(c.phone); if (k && !ph[k]) ph[k] = c.id; const e = String(c.email || "").trim().toLowerCase(); if (e && !em[e]) em[e] = c.id; }
    const m = (p, e) => ph[p19key(p)] || em[String(e || "").trim().toLowerCase()] || 0;
    for (const l of db.leads || []) if (!l.client_id) { const c = m(l.phone, l.email); if (c) { l.client_id = c; n.leads++; } }
    for (const [k, list] of [["quotes", db.quotes], ["invoices", db.invoices], ["projects", db.projects]]) for (const d of list || []) if (!d.client_id) { const c = m((d.client || {}).phone, (d.client || {}).email); if (c) { d.client_id = c; n[k]++; } }
    return n;
  }
  // P20: client logos (mirror of api/logos-lib.php)
  async function logos(action, inp, need) {
    if (!["logos_get", "logos_save"].includes(action)) return null;
    need(["owner", "admin", "editor"]); const F = path.join(ROOT, "assets/data/clients.json");
    const clean = (d) => ({ title: String(d.title || "Our clients").slice(0, 80), kicker: String(d.kicker ?? "Trusted by").slice(0, 60), mode: d.mode === "slider" ? "slider" : "grid",
      speed: Math.max(10, Math.min(90, +d.speed || 30)), grey: !!d.grey, show: d.show !== false,
      items: (d.items || []).slice(0, 40).filter((i) => /^\/assets\/(uploads|img)\/[\w./-]+\.(webp|png|jpe?g|gif|svg)$/i.test(i.logo || "") && !String(i.logo).includes("..")).map((i) => ({ name: String(i.name || "").slice(0, 80), logo: i.logo, url: /^https?:\/\//i.test(i.url || "") ? String(i.url).slice(0, 300) : "" })) });
    if (action === "logos_get") { let d = {}; try { d = JSON.parse(fs.readFileSync(F, "utf8")); } catch (e) {} return { ok: true, data: clean(d) }; }
    const d = clean(inp.data || {}); fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, JSON.stringify(d, null, 2)); return { ok: true, data: d };
  }
  // P36: connectors (mirror of api/conn-lib.php)
  async function conn(action, inp, need) {
    if (!["conn_list", "conn_save", "conn_delete", "conn_test", "conn_gmail_send", "conn_gmail_use", "conn_push"].includes(action)) return null;
    need(["owner", "admin"]); const F = path.join(PRIV, "connectors.json");
    let items = []; try { items = JSON.parse(fs.readFileSync(F, "utf8")).items || []; } catch (e) {}
    const put = () => { fs.mkdirSync(PRIV, { recursive: true }); fs.writeFileSync(F, JSON.stringify({ items }, null, 2)); };
    const pub = (c) => { const p = { ...c }; delete p.secret; p.hasSecret = !!c.secret; return p; }, all = () => items.map(pub);
    const s = (v, n) => String(v ?? "").replace(/<[^>]*>/g, "").trim().slice(0, n);
    if (action === "conn_list") return { ok: true, items: all() };
    const i = items.findIndex((c) => c.id === String(inp.id || ""));
    if (action === "conn_delete") { if (i < 0) throw new Fail("Connector not found", 404); items.splice(i, 1); put(); return { ok: true, items: all() }; }
    if (action === "conn_gmail_send" || action === "conn_gmail_use") { /* P22 preview mirror: validates, no real email from the preview */
      if (i < 0 || items[i].key !== "gmail") throw new Fail("Gmail connector not found", 404); const c = items[i];
      if (!/^\S+@\S+\.\S+$/.test(c.account || "") || String(c.secret || "").replace(/\s+/g, "").length !== 16) throw new Fail("Save the Gmail address and the 16-letter app password first");
      if (action === "conn_gmail_use") return { ok: true, message: "Gmail is now used for all email alerts (preview: saved only)." };
      c.note = "Preview: details OK. On Hostinger this sends a real test email."; c.checked = Math.floor(Date.now() / 1000); put(); return { ok: true, pass: true, message: c.note, items: all() };
    }
    if (action === "conn_push") {
      if (i < 0) throw new Fail("Connector not found", 404); const c = items[i]; let ok = false, msg = "Backups work with GitHub and Google Drive";
      if (c.key === "github") { ok = /^[\w.-]+\/[\w.-]+$/.test(c.account || "") && !!c.secret; msg = ok ? "Preview: backup ready. On Hostinger it uploads to GitHub backups/." : "Save the repository (owner/name) and token first"; }
      if (c.key === "gdrive") { ok = /folders\/[\w-]+/.test(c.account || "") && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.url || "") && !!c.secret; msg = ok ? "Preview: backup ready. On Hostinger it uploads to your Drive folder." : "Save the Drive folder link, the Apps Script web-app address and the script key first"; }
      Object.assign(c, { lastPush: Math.floor(Date.now() / 1000), pushOk: ok, note: msg }); put(); return { ok: true, pass: ok, message: msg, items: all() };
    }
    if (action === "conn_test") {
      if (i < 0) throw new Fail("Connector not found", 404); const c = items[i]; let ok = !!(c.secret || c.account), msg = "Saved. No test address, so nothing to check.";
      if (/^https:\/\//i.test(c.url || "")) { try { const r = await fetch(c.url, { signal: AbortSignal.timeout(8000) }); ok = r.status < 400; msg = "Address answered with HTTP " + r.status; } catch (e) { ok = false; msg = "Address did not answer"; } }
      Object.assign(c, { status: ok ? "connected" : "error", checked: Math.floor(Date.now() / 1000), note: msg }); put(); return { ok: true, pass: ok, message: msg, items: all() };
    }
    const name = s(inp.name, 60); if (!name) throw new Fail("Give the connector a name");
    const url = String(inp.url || "").trim(); if (url && !/^https?:\/\/[^\s<>"]+$/i.test(url)) throw new Fail("Address must start with https://");
    const c = i >= 0 ? items[i] : { id: "c" + crypto.randomBytes(5).toString("hex"), added: Math.floor(Date.now() / 1000) };
    Object.assign(c, { key: String(inp.key || "custom").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "custom", name, cat: s(inp.cat || "Custom", 40), account: s(inp.account, 160), url: url.slice(0, 300), notes: s(inp.notes, 400), on: inp.on !== false });
    const sec = String(inp.secret || "").trim(); if (sec) { c.secret = sec.slice(0, 2000); c.hint = sec.slice(-4); }
    c.status = c.secret || c.account ? "connected" : "setup"; c.updated = Math.floor(Date.now() / 1000);
    if (i < 0) items.push(c); put(); return { ok: true, item: pub(c), items: all() };
  }
  async function p19c(action, inp, need, db, ip) {
    if (!["client_comms", "clients_link"].includes(action)) return null;
    const u = need(["owner", "admin", "sales"]);
    if (action === "clients_link") { const n = p19link(db, false); save(db); return { ok: true, linked: n }; }
    const c = (db.clients || []).find((x) => x.id === +inp.id); if (!c) throw new Fail("Client not found", 404);
    const k = p19key(c.phone), e = String(c.email || "").toLowerCase(), lids = (db.leads || []).filter((l) => l.client_id === c.id).map((l) => l.id);
    const chats = (db.chats || []).filter((r) => (k && p19key(r.phone) === k) || (e && String(r.email || "").toLowerCase() === e) || (r.lead_id && lids.includes(r.lead_id)))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 30)
      .map((r) => { const ms = (db.chatMsgs || []).filter((x) => x.chat_id === r.id); return { id: r.id, channel: r.channel || "web", status: r.status, mode: r.mode, started: r.created_at, updated: r.updated_at, count: ms.length, last: ms.slice(-6).map(({ t, who, name, text }) => ({ t, who, name, text })) }; });
    return { ok: true, chats };
  }
  async function p18j(action, inp, need, db, ip) {
    if (!/^me_/.test(action)) return null;
    const u = need(), id = u.id, p = profGet(id);
    switch (action) {
      case "me_get": {
        const m0 = now().slice(0, 7) + "-01 00:00:00", st = { leads: 0, quotes: 0, invoices: 0, messages: 0, pages: 0 };
        const mine = db.activity.filter((x) => x.user_id === id);
        mine.filter((x) => x.created_at >= m0).forEach((x) => { const a = x.action;
          if (/^(lead|crm)\./.test(a)) st.leads++; else if (/^quote/.test(a)) st.quotes++; else if (/^(invoice|inv|payment)/.test(a)) st.invoices++; else if (/^(chat|wa|inbox|notify)/.test(a)) st.messages++; else if (/^(page|content|builder|global|seo)/.test(a)) st.pages++; });
        const act = mine.slice(-12).reverse().map((x) => ({ action: x.action, target: x.target, created_at: x.created_at }));
        const logins = mine.filter((x) => x.action === "login").reverse(), last = logins[1] ? { created_at: logins[1].created_at, ip: logins[1].ip } : null;
        const sess = (u.sessions || []).filter((x) => x.exp > Date.now() / 1000).length;
        return { ok: true, user: { id, name: u.name, email: u.email, role: u.role, created_at: u.created_at || null }, profile: p, stats: st, activity: act, security: { totp: !!u.totp_on, sessions: Math.max(1, sess), lastLogin: last } };
      }
      case "me_save": {
        const name = String(inp.name == null ? u.name : inp.name).trim(); if (!name) throw new Fail("Name is required"); if (/[<>]/.test(name)) throw new Fail("Name cannot contain < or >");
        for (const [k, max] of Object.entries(PROF_KEYS)) if (k in inp) p[k] = String(inp[k] || "").replace(/<[^>]*>/g, "").trim().slice(0, max);
        for (const k of ["phone", "whatsapp"]) if (p[k] && !/^[+0-9 ()-]{7,30}$/.test(p[k])) throw new Fail((k === "phone" ? "Phone" : "WhatsApp") + " number: digits, spaces and + only");
        u.name = name.slice(0, 120); profPut(id, p); log(db, u, "profile.update", "", ip); save(db); return { ok: true, user: pub(u), profile: p };
      }
      case "me_avatar": {
        const dir = path.join(ROOT, "assets/uploads/avatars"), old = p.avatar || "";
        if (inp.remove) p.avatar = "";
        else {
          const m = /^data:image\/(jpeg|png|webp);base64,/.exec(String(inp.data || "")); if (!m) throw new Fail("Choose a JPG, PNG or WebP photo");
          const bin = Buffer.from(String(inp.data).slice(String(inp.data).indexOf(",") + 1), "base64"); if (!bin.length || bin.length > 2 * 1048576) throw new Fail("Photo must be under 2 MB");
          const sig = bin.slice(0, 12).toString("hex"); if (!(/^ffd8ff/.test(sig) || /^89504e47/.test(sig) || (/^52494646/.test(sig) && bin.slice(8, 12).toString() === "WEBP"))) throw new Fail("That file is not a valid image");
          fs.mkdirSync(dir, { recursive: true }); const fn = "u" + id + "-" + crypto.randomBytes(4).toString("hex") + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
          fs.writeFileSync(path.join(dir, fn), bin); p.avatar = "/assets/uploads/avatars/" + fn;
        }
        if (new RegExp("^/assets/uploads/avatars/u" + id + "-[0-9a-f]{8}\\.(jpg|png|webp)$").test(old)) { try { fs.unlinkSync(path.join(ROOT, old)); } catch (e) {} }
        profPut(id, p); log(db, u, "profile.avatar", "", ip); save(db); return { ok: true, profile: p };
      }
      case "me_avatars": { const a = jr(PROF, {}), o = {}; for (const k in a) if (a[k].avatar) o[k] = a[k].avatar; return { ok: true, avatars: o }; }
    }
    return null;
  }
  async function p18h(action, inp, need, db, ip) {
    if (!/^(mt_|fm_|dbx_)/.test(action)) return null;
    const OA = ["owner", "admin"], ED = ["owner", "admin", "editor"], ST = ["owner", "admin", "editor", "sales"];
    switch (action) {
      case "mt_get": { need(); const m = sysCfg(); return { ok: true, on: m.on, mode: m.mode, since: m.since, by: m.by, token: m.token, until: m.until || "", title: m.title || "", text: m.text || "", pages: SYS_PAGES.map((p) => ({ path: p, url: "/" + p, exists: fs.existsSync(path.join(ROOT, p)) })) }; }
      case "mt_set": { const u = need(OA), d = jr(SYSF, {}), m = sysCfg(), was = m.on; m.on = !!inp.on; m.mode = (inp.mode || m.mode) === "soon" ? "soon" : "maintenance";
        if (m.on) { m.since = was && m.since ? m.since : now(); m.by = u.name; } else m.since = null; if (inp.newToken) m.token = crypto.randomBytes(16).toString("hex");
        if ("until" in inp) m.until = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(String(inp.until)) ? String(inp.until).replace("T", " ").slice(0, 16) : ""; for (const [k, n] of [["title", 120], ["text", 400]]) if (k in inp) m[k] = String(inp[k] || "").replace(/<[^>]*>/g, "").trim().slice(0, n);
        fs.mkdirSync(path.join(ROOT, "assets/data"), { recursive: true }); fs.writeFileSync(path.join(ROOT, "assets/data/launch.json"), JSON.stringify({ mode: m.mode, until: m.until || "", title: m.title || "", text: m.text || "" }));
        d.maint = m; jw(SYSF, d); publishRules(); log(db, u, "maintenance." + (m.on ? "on" : "off"), m.mode, ip); save(db); return { ok: true, on: m.on, mode: m.mode, since: m.since, token: m.token }; }
      case "fm_list": { need(ST); const [rel, abs] = fmPath(inp.dir || "assets"); if (!fs.statSync(abs).isDirectory()) throw new Fail("Not a folder");
        const items = fs.readdirSync(abs).filter((n) => n[0] !== ".").map((n) => { const a = path.join(abs, n), st = fs.statSync(a), d = st.isDirectory(); return { name: n, path: rel + "/" + n, dir: d, size: d ? null : st.size, mtime: dts(st.mtimeMs).slice(0, 16), count: d ? fs.readdirSync(a).length : null, ro: fmRo(rel + "/" + n) }; })
          .sort((x, y) => (y.dir - x.dir) || x.name.toLowerCase().localeCompare(y.name.toLowerCase()));
        const trash = fs.existsSync(FM_TRASH) ? fs.readdirSync(FM_TRASH).filter((f) => f.endsWith(".json")).length : 0; return { ok: true, dir: rel, ro: fmRo(rel), items, trash, maxUpload: "25M" }; }
      case "fm_upload": { const u = need(ED), [rel, abs] = fmPath(inp.dir); if (fmRo(rel)) throw new Fail("This folder is read-only. Upload into assets/uploads or assets/img.");
        const raw = Buffer.from(String(inp.data || "").replace(/^data:[^,]*,/, ""), "base64"); if (!raw.length) throw new Fail("Upload failed (empty file)"); if (raw.length > 25 * 1048576) throw new Fail("Files up to 25 MB");
        const name = fmName(inp.name), ext = path.extname(name).slice(1).toLowerCase(); if (!FM_EXT.includes(ext)) throw new Fail("This file type is not allowed (." + ext + ")");
        if (ext === "svg" && /<script|on[a-z]+\s*=|javascript:/i.test(raw.toString())) throw new Fail("This SVG contains scripts and was blocked");
        const base = name.slice(0, -(ext.length + 1)); let dst = path.join(abs, name), i = 2; while (fs.existsSync(dst)) dst = path.join(abs, base + "-" + i++ + "." + ext);
        fs.writeFileSync(dst, raw); log(db, u, "file.upload", rel + "/" + path.basename(dst), ip); save(db); return { ok: true, path: rel + "/" + path.basename(dst) }; }
      case "fm_mkdir": { const u = need(ED), [rel, abs] = fmPath(inp.dir); if (fmRo(rel)) throw new Fail("This folder is read-only"); const n = fmName(inp.name); if (!n || n.includes(".")) throw new Fail("Use letters, numbers and - only");
        if (fs.existsSync(path.join(abs, n))) throw new Fail("Already exists"); fs.mkdirSync(path.join(abs, n)); log(db, u, "file.mkdir", rel + "/" + n, ip); save(db); return { ok: true }; }
      case "fm_rename": { const u = need(ED), [rel, abs] = fmPath(inp.path); if (fmRo(rel)) throw new Fail("This item is read-only"); let n = fmName(inp.name); if (!n) throw new Fail("Enter a name");
        const isF = fs.statSync(abs).isFile(); if (isF) { const old = path.extname(abs).toLowerCase(); if (path.extname(n).toLowerCase() !== old) n = n.replace(/\.[^.]*$/, "") + old; }
        const dst = path.join(path.dirname(abs), n); if (fs.existsSync(dst)) throw new Fail("A file with that name already exists");
        const used = isF ? fmUsed("/" + rel) : []; if (used.length && !inp.force) return { ok: false, used, error: "This file is used on " + used.length + " page(s). Renaming will break it there." };
        fs.renameSync(abs, dst); log(db, u, "file.rename", rel + " → " + n, ip); save(db); return { ok: true, path: path.posix.dirname(rel) + "/" + n }; }
      case "fm_delete": { const u = need(ED), [rel, abs] = fmPath(inp.path); if (fmRo(rel)) throw new Fail("This item is read-only"); const st = fs.statSync(abs);
        if (st.isDirectory()) { if (fs.readdirSync(abs).length) throw new Fail("The folder is not empty"); fs.rmdirSync(abs); return { ok: true }; }
        const used = fmUsed("/" + rel); if (used.length && !inp.force) return { ok: false, used, error: "This file is used on " + used.length + " page(s)." };
        fs.mkdirSync(FM_TRASH, { recursive: true }); const id = now().replace(/\D/g, "").slice(0, 8) + "-" + now().replace(/\D/g, "").slice(8, 14) + "-" + crypto.randomBytes(3).toString("hex");
        fs.renameSync(abs, path.join(FM_TRASH, id + ".bin")); jw(path.join(FM_TRASH, id + ".json"), { path: rel, size: st.size, t: now(), by: u.name }); log(db, u, "file.delete", rel, ip); save(db); return { ok: true, trash: id }; }
      case "fm_trash": { need(ST); const L = fs.existsSync(FM_TRASH) ? fs.readdirSync(FM_TRASH).filter((f) => f.endsWith(".json")).map((f) => ({ id: f.slice(0, -5), ...jr(path.join(FM_TRASH, f), {}) })) : []; return { ok: true, items: L.sort((a, b) => (a.t < b.t ? 1 : -1)) }; }
      case "fm_restore": { const u = need(ED), id = String(inp.id || "").replace(/[^0-9a-f-]/g, ""), j = path.join(FM_TRASH, id + ".json"); if (!fs.existsSync(j)) throw new Fail("Not in the trash", 404);
        const m = jr(j, {}), [, abs] = fmPath(m.path, false); if (fs.existsSync(abs)) throw new Fail("A file with the same name exists again at " + m.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.renameSync(path.join(FM_TRASH, id + ".bin"), abs); fs.unlinkSync(j); log(db, u, "file.restore", m.path, ip); save(db); return { ok: true, path: m.path }; }
      case "fm_zip": { need(ST); const [rel, abs] = fmPath(inp.dir); const tmp = path.join(PRIV, "fmz-" + crypto.randomBytes(4).toString("hex") + ".zip");
        execFileSync("zip", ["-qr", tmp, "."], { cwd: abs }); const b = fs.readFileSync(tmp); fs.unlinkSync(tmp); return { ok: true, name: path.basename(rel) + ".zip", zip64: b.toString("base64") }; }
      case "dbx_tables": { need(OA); return { ok: true, tables: dbxTables(db).map((t) => ({ name: t, rows: db[t.slice(3)].length, size: JSON.stringify(db[t.slice(3)]).length, updated: null })) }; }
      case "dbx_browse": { need(OA); const t = String(inp.table || ""); if (!dbxTables(db).includes(t)) throw new Fail("Unknown table"); const L = db[t.slice(3)], keys = [...new Set(L.slice(0, 50).flatMap((r) => Object.keys(r)))];
        const q = String(inp.q || "").trim().toLowerCase(); let rows = q ? L.filter((r) => keys.some((k) => !DB_SECRET.test(k) && r[k] != null && String(typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k]).toLowerCase().includes(q))) : L.slice();
        rows = rows.slice().reverse(); const per = 50, page = Math.max(1, parseInt(inp.page) || 1), total = rows.length;
        const out = rows.slice((page - 1) * per, page * per).map((r) => Object.fromEntries(keys.map((k) => { let v = dbxMask(k, r[k]); if (typeof v === "string" && v.length > 240) v = v.slice(0, 240) + "…"; return [k, v ?? null]; })));
        return { ok: true, table: t, cols: keys.map((k) => ({ name: k, type: typeof (L[0] || {})[k] })), rows: out, total, page, pages: Math.max(1, Math.ceil(total / per)) }; }
      case "dbx_row": { need(OA); const t = String(inp.table || ""); if (!dbxTables(db).includes(t)) throw new Fail("Unknown table"); const r = db[t.slice(3)].find((x) => +x.id === +inp.id); if (!r) throw new Fail("Row not found", 404); return { ok: true, row: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, dbxMask(k, v)])) }; }
      case "dbx_export": { const u = need(OA), fmt = inp.fmt === "sql" ? "sql" : "csv", tabs = inp.table === "*" ? dbxTables(db) : [String(inp.table || "")]; if (!tabs.every((t) => dbxTables(db).includes(t))) throw new Fail("Unknown table");
        const cell = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)); let content;
        if (fmt === "csv") { const L = db[tabs[0].slice(3)], keys = [...new Set(L.flatMap((r) => Object.keys(r)))], esc2 = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
          content = "\uFEFF" + [keys.join(",")].concat(L.map((r) => keys.map((k) => esc2(cell(dbxMask(k, r[k])))).join(","))).join("\n") + "\n"; }
        else { content = "-- Woodex database export " + now() + " (preview: JSON tables as rows)\nSET NAMES utf8mb4;\n"; for (const t of tabs) { const L = db[t.slice(3)], keys = [...new Set(L.flatMap((r) => Object.keys(r)))];
          content += "\nDROP TABLE IF EXISTS `" + t + "`;\n-- columns: " + keys.join(", ") + "\n"; for (const r of L) content += "INSERT INTO `" + t + "` VALUES (" + keys.map((k) => (r[k] == null ? "NULL" : "'" + cell(r[k]).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'")).join(",") + ");\n"; } }
        log(db, u, "db.export." + fmt, tabs.join(","), ip); save(db); return { ok: true, name: (tabs.length > 1 ? "woodex-db-" + now().replace(/\D/g, "").slice(0, 14) : tabs[0]) + "." + fmt, mime: fmt === "csv" ? "text/csv" : "application/sql", content, note: fmt === "sql" ? "Contains password hashes and secrets — keep it private." : "Secrets are masked." }; }
    }
    return null;
  }
  /* P18 G mirror: WhatsApp automation (mirrors api/p18g-lib.php). The preview has no real WhatsApp number, so sends are SIMULATED (fake message ids). */
  const WAGF = path.join(PRIV, "wa-auto.json");
  const WAG_FLOWS = { welcome: "New enquiry → welcome", lead1: "New lead, no reply → 1st follow-up", lead2: "New lead, no reply → 2nd follow-up", lead3: "New lead, no reply → last follow-up", quote: "Quote sent → 1st follow-up", quote2: "Quote sent → 2nd follow-up", quote3: "Quote sent → last follow-up", invoice: "Invoice due soon → reminder", invoice0: "Invoice due today → reminder", invoice_late: "Invoice overdue → reminder", booking: "Site visit → reminder the day before" };
  const WAG_VARS = { "{name}": "First name", "{fullname}": "Full name", "{company}": "Company", "{city}": "City", "{ref}": "Quote / invoice no.", "{amount}": "Amount (Rs)", "{date}": "Date", "{time}": "Time", "{link}": "Link" };
  const WAG_STOP = /^\s*(stop|unsubscribe|band karo|بند|ruk jao|no more)\s*[.!]*\s*$/iu;
  const dts = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  function wagLoad() {
    const d = jr(WAGF, {}); d.cfg = { dailyCap: 250, perTick: 25, cronKey: "", quietFrom: "21:00", quietTo: "09:00", ...(d.cfg || {}) }; if (!d.cfg.cronKey) d.cfg.cronKey = crypto.randomBytes(12).toString("hex");
    const fl = d.flows || {}; for (const k of Object.keys(WAG_FLOWS)) fl[k] = { on: false, tpl: "", params: [], days: ({ lead1: 1, lead2: 3, lead3: 7, quote: 1, quote2: 3, quote3: 7, invoice: 3, invoice0: 0, invoice_late: 3 })[k] ?? 1, sent: 0, failed: 0, mail: false, subject: "", body: "", mailed: 0, ...(fl[k] || {}) }; d.flows = fl;
    for (const k of ["tpls", "segs", "camps"]) d[k] = d[k] || []; for (const k of ["optout", "day", "flowlog", "mid"]) d[k] = d[k] || {}; return d;
  }
  const wagSave = (d) => jw(WAGF, d);
  const wagPhone = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "0") d = "92" + d.slice(1); if (d.length === 10 && d[0] === "3") d = "92" + d; return d.length >= 10 ? d : ""; };
  const wagId = () => crypto.randomBytes(5).toString("hex");
  function wagContacts(db) {
    ensureCrm(db); const o = new Map();
    for (const r of db.leads) { const p = wagPhone(r.phone); if (!p) continue; const prev = o.get(p);
      o.set(p, { p, n: r.name, co: r.company || "", city: r.location || "", line: r.line || "", stage: r.stage, tags: r.tags || [], last: r.last_contact || r.created_at, created: r.created_at, lid: r.id, cid: r.client_id ?? (prev ? prev.cid : null), kind: "lead" }); }
    for (const r of db.clients) { const p = wagPhone(r.phone); if (!p) continue; const x = o.get(p);
      if (x) { x.kind = "client"; x.cid = r.id; if (!x.city) x.city = r.city || ""; continue; }
      o.set(p, { p, n: r.name, co: r.company || "", city: r.city || "", line: "", stage: "won", tags: [], last: r.created_at, created: r.created_at, lid: null, cid: r.id, kind: "client" }); }
    return [...o.values()];
  }
  const wagFilter = (f = {}) => ({ who: ["leads", "clients"].includes(f.who) ? f.who : "all", line: clip(f.line, 30), stages: (Array.isArray(f.stages) ? f.stages : []).filter((x) => ["new", "contacted", "visit", "quote", "won", "lost"].includes(x)), city: clip(f.city, 80), tag: clip(f.tag, 40), quiet: Math.max(0, Math.min(3650, parseInt(f.quiet) || 0)), recent: Math.max(0, Math.min(3650, parseInt(f.recent) || 0)) });
  function wagMatch(c, f) {
    if (f.who === "leads" && c.kind !== "lead") return false; if (f.who === "clients" && c.kind !== "client") return false;
    if (f.line && c.line.toLowerCase() !== f.line.toLowerCase()) return false; if (f.stages.length && !f.stages.includes(c.stage)) return false;
    if (f.city && !c.city.toLowerCase().includes(f.city.toLowerCase())) return false; if (f.tag && !c.tags.map((t) => String(t).trim().toLowerCase()).includes(f.tag.toLowerCase())) return false;
    if (f.quiet && c.last > dts(Date.now() - f.quiet * 864e5)) return false; if (f.recent && c.created < dts(Date.now() - f.recent * 864e5)) return false; return true;
  }
  const wagAudience = (db, f, d) => { const m = wagContacts(db).filter((c) => wagMatch(c, f)); return [m.filter((c) => !d.optout[c.p]), m.filter((c) => d.optout[c.p]).length]; };
  function wagFill(params, v) { const first = String(v.n || "").trim().split(" ")[0]; const map = { "{name}": first || "there", "{fullname}": v.n || "", "{company}": v.co || "", "{city}": v.city || "", "{ref}": v.ref || "", "{amount}": v.amount != null ? Number(v.amount).toLocaleString("en-US") : "", "{date}": v.date || "", "{time}": v.time || "", "{link}": v.link || "" };
    return params.map((p) => (String(p).replace(/\{[a-z]+\}/g, (m) => (m in map ? map[m] : m)).trim() || "-").slice(0, 900)); }
  const wagTpl = (d, id) => d.tpls.find((t) => t.id === id) || null;
  const wagSend = (to, t, vals) => (/^(\d)\1+$/.test(to.slice(-7)) ? { ok: false, error: "(preview) invalid number" } : { ok: true, id: "wamid.SIM" + wagId() });
  const wagLeft = (d) => Math.max(0, d.cfg.dailyCap - (d.day[now().slice(0, 10)] || 0));
  function wagStats(c) { const s = { total: c.rcp.length, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0 }, rank = { sent: 1, delivered: 2, read: 3, replied: 4 };
    for (const r of c.rcp) { if (rank[r.s]) { for (const [k, n] of Object.entries(rank)) if (n <= rank[r.s]) s[k]++; } else if (r.s in s) s[r.s]++; } return s; }
  const wagPub = (c, full) => { const o = { ...c, stats: wagStats(c) }; if (!full) delete o.rcp; else o.rcp = c.rcp.slice(0, 500); return o; };
  function wagFlowDue(db, d) {
    const jobs = [], F = d.flows, log = d.flowlog;
    if (F.welcome.on && F.welcome.tpl) for (const l of db.leads) { if (l.created_at < dts(Date.now() - 2 * 864e5)) continue; const k = "welcome:" + l.id, p = wagPhone(l.phone); if (!p || log[k]) continue; jobs.push(["welcome", k, { p, n: l.name, co: l.company || "", city: l.location || "", lid: l.id }]); }
    if (F.quote.on && F.quote.tpl) { const days = Math.max(1, F.quote.days), cut = dts(Date.now() - days * 864e5), old = dts(Date.now() - (days + 7) * 864e5);
      for (const x of db.quotes || []) { if (x.status !== "sent" || !x.sent_at || x.sent_at > cut || x.sent_at < old) continue; const k = "quote:" + x.id, p = wagPhone((x.client || {}).phone); if (!p || log[k]) continue; jobs.push(["quote", k, { p, n: (x.client || {}).name || "", co: (x.client || {}).company || "", ref: x.no || "", amount: x.total || 0, lid: x.lead_id }]); } }
    if (F.invoice.on && F.invoice.tpl) { const due = dts(Date.now() + Math.max(0, F.invoice.days) * 864e5).slice(0, 10);
      for (const i0 of db.invoices || []) { const i = invPub({ payments: [], ...i0 }); if (i.due_date !== due || i.balance <= 0) continue; const k = "invoice:" + i.id + ":" + due, p = wagPhone((i.client || {}).phone); if (!p || log[k]) continue; jobs.push(["invoice", k, { p, n: (i.client || {}).name || "", co: (i.client || {}).company || "", ref: i.no || "", amount: i.balance, date: due }]); } }
    if (F.booking.on && F.booking.tpl) { const tm = dts(Date.now() + 864e5).slice(0, 10);
      for (const b of db.bookings || []) { if (b.d !== tm || b.status !== "confirmed") continue; const k = "booking:" + b.id + ":" + b.d, p = wagPhone(b.phone); if (!p || log[k]) continue; const h = +b.tm.slice(0, 2); jobs.push(["booking", k, { p, n: b.name, date: b.d, time: ((h % 12) || 12) + ":" + b.tm.slice(3) + (h < 12 ? " am" : " pm"), lid: b.lead_id }]); } }
    return jobs;
  }
  function wagTick(db) {
    const d = wagLoad(), sum = { flows: 0, camp: 0, failed: 0 }; let budget = Math.min(d.cfg.perTick, wagLeft(d));
    const send = (p, t, v) => { const r = wagSend(p, t, v); budget--; if (r.ok) { const k = now().slice(0, 10); d.day[k] = (d.day[k] || 0) + 1; } return r; };
    for (const [fk, key, v] of wagFlowDue(db, d)) { if (budget <= 0) break; const f = d.flows[fk], t = wagTpl(d, f.tpl); if (!t) continue; if (d.optout[v.p]) { d.flowlog[key] = now(); continue; }
      const r = send(v.p, t, wagFill(f.params, v)); d.flowlog[key] = now(); if (r.ok) { f.sent++; sum.flows++; d.mid[r.id] = ["f", fk, now()]; } else { f.failed++; sum.failed++; f.lastError = r.error; } }
    outer: for (const c of d.camps) {
      if (c.status === "scheduled" && c.when <= now()) c.status = "sending"; if (c.status !== "sending") continue;
      const t = wagTpl(d, c.tpl); if (!t) { c.status = "failed"; c.error = "Template was deleted"; continue; }
      for (let i = 0; i < c.rcp.length; i++) { const r = c.rcp[i]; if (r.s !== "queued") continue; if (budget <= 0) break outer;
        if (d.optout[r.p]) { r.s = "skipped"; r.e = "opted out"; continue; }
        const x = send(r.p, t, wagFill(c.params, r)); r.t = now(); if (x.ok) { r.s = "sent"; r.w = x.id; d.mid[x.id] = ["c", c.id, i]; sum.camp++; } else { r.s = "failed"; r.e = x.error; sum.failed++; } }
      if (c.status === "sending" && !c.rcp.some((r) => r.s === "queued")) { c.status = "done"; c.done_at = now(); }
    }
    d.lastTick = now(); wagSave(d); return { ...sum, left: wagLeft(d) };
  }
  function wagWebhook(j) { // same logic as PHP wag_webhook — used by the preview's wag_sim action
    const d = wagLoad(), rank = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 }, stopped = [];
    for (const en of j.entry || []) for (const chg of en.changes || []) { const v = chg.value || {};
      for (const s of v.statuses || []) { const m = d.mid[s.id]; if (!m || m[0] !== "c") continue; const c = d.camps.find((x) => x.id === m[1]); const r = c && c.rcp[m[2]]; if (!r) continue;
        if (s.status === "failed") { if ((rank[r.s] || 0) <= 1) { r.s = "failed"; r.e = "not delivered"; } } else if ((rank[s.status] || 0) > (rank[r.s] || 0)) r.s = s.status; }
      for (const m of v.messages || []) { const p = wagPhone(m.from); if (!p) continue; const txt = (m.text || {}).body || "";
        if (WAG_STOP.test(txt)) { d.optout[p] = d.optout[p] || now(); stopped.push(p); continue; }
        if (/^\s*(start|subscribe)\s*$/i.test(txt)) delete d.optout[p];
        const since = dts(Date.now() - 14 * 864e5);
        for (const c of [...d.camps].reverse()) { let hit = false; for (const r of c.rcp) if (r.p === p && ["sent", "delivered", "read"].includes(r.s) && (r.t || "") >= since) { r.s = "replied"; hit = true; } if (hit) break; } } }
    wagSave(d); return stopped;
  }
  async function p18g(action, inp, need, db, ip) {
    if (!/^wa[gh]_/.test(action)) return null;
    const OA = ["owner", "admin"], SL = ["owner", "admin", "sales"];
    // P39 Phase 6 mirror (wahub-lib.php)
    const WAH_ST = { new: "New", contacted: "Contacted", visit: "Site visit", quote: "Quote sent", won: "Won", lost: "Lost" };
    const hubCfg = (d) => ({ remindHours: 24, remindChats: true, remindLeads: true, waba: "", ...(d.hub || {}) });
    switch (action) {
      case "wah_overview": { const u = need(SL), d = wagLoad(); ensureCrm(db); const day = (i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); let wk = 0; for (let i = 0; i < 7; i++) wk += +(d.day[day(i)] || 0);
        const tot = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 }; d.camps.forEach((c) => { const x = wagStats(c); for (const k in tot) tot[k] += x[k]; });
        const rules = d.rules || []; let fl = 0; Object.values(d.flows).forEach((f) => (fl += +f.sent || 0)); rules.forEach((r) => (fl += +r.sent || 0));
        const ch = (db.chats || []).filter((c) => c.status === "open" && c.channel === "wa"); const hub = hubCfg(d);
        return { ok: true, connected: false, today: +(d.day[day(0)] || 0), week: wk, cap: d.cfg.dailyCap, camp: tot, camps: d.camps.length, running: d.camps.filter((c) => ["sending", "scheduled"].includes(c.status)).length,
          flowsOn: Object.values(d.flows).filter((f) => f.on).length + rules.filter((r) => r.on).length, autoSent: fl, optout: Object.keys(d.optout || {}).length, tpls: d.tpls.length, approved: d.tpls.filter((t) => t.status === "APPROVED").length,
          wa: { open: ch.length, waiting: ch.filter((c) => c.needs).length }, lastTick: d.lastTick || null, hub: OA.includes(u.role) ? hub : { ...hub, waba: undefined }, rules, stages: WAH_ST,
          users: db.users.filter((x) => x.active !== false && ["owner", "admin", "sales", "support"].includes(x.role)).map((x) => ({ id: x.id, name: x.name })), tplList: d.tpls.map((t) => ({ id: t.id, label: t.label, params: t.params, status: t.status || "" })), vars: { "{name}": "First name", "{fullname}": "Full name", "{company}": "Company", "{city}": "City" } }; }
      case "wah_rule_save": { const u = need(OA), d = wagLoad(), r = inp.rule || {}, t = r.tpl ? wagTpl(d, r.tpl) : null; const stage = WAH_ST[r.stage] ? r.stage : "new", days = Math.max(0, Math.min(90, +r.days || 0));
        const o = { id: /^[a-f0-9]{6,12}$/.test(r.id || "") ? r.id : wagId(), name: clip(r.name, 80) || WAH_ST[stage] + " · " + days + " day" + (days === 1 ? "" : "s"), on: !!r.on, stage, when: r.when === "created" ? "created" : "quiet", days, tpl: t ? t.id : "", params: t ? t.params.map((p, i) => clip((r.params || [])[i] || p, 200)) : [], tag: clip(String(r.tag || "").replace(/,/g, " "), 40), assign: +r.assign || null, alert: !!r.alert };
        if (!o.tpl && !o.tag && !o.assign && !o.alert) throw new Fail("Choose at least one action: send a template, add a tag, assign or alert the team");
        d.rules = d.rules || []; const i = d.rules.findIndex((x) => x.id === o.id); if (i >= 0) d.rules[i] = { ...d.rules[i], ...o }; else { if (d.rules.length >= 30) throw new Fail("Up to 30 rules"); d.rules.push({ ...o, sent: 0, runs: 0, created: now() }); }
        wagSave(d); log(db, u, "wa.rule", o.name, ip); save(db); return { ok: true, rules: d.rules }; }
      case "wah_rule_delete": { const u = need(OA), d = wagLoad(); d.rules = (d.rules || []).filter((x) => x.id !== inp.id); wagSave(d); log(db, u, "wa.rule.delete", inp.id, ip); save(db); return { ok: true, rules: d.rules }; }
      case "wah_cfg_save": { const u = need(OA), d = wagLoad(), c = hubCfg(d), h = inp.hub || {}; if ("remindHours" in h) c.remindHours = Math.max(0, Math.min(168, +h.remindHours || 0)); for (const k of ["remindChats", "remindLeads"]) if (k in h) c[k] = !!h[k]; if ("waba" in h) c.waba = String(h.waba || "").replace(/\D/g, "").slice(0, 30); d.hub = c; wagSave(d); log(db, u, "wa.hub", "", ip); save(db); return { ok: true, hub: c }; }
      case "wah_insights": { need(SL); const d = wagLoad(); ensureCrm(db); const days = Math.max(7, Math.min(90, parseInt(inp.days) || 14)); const ds = (i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        const ser = {}; for (let i = days - 1; i >= 0; i--) { const k = ds(i); ser[k] = { d: k, web: 0, wa: 0, tg: 0, leads: 0, auto: +(d.day[k] || 0) }; }
        for (const c of (db.chats || [])) { const k = String(c.created_at || "").slice(0, 10); if (ser[k]) ser[k][c.channel === "wa" || c.channel === "tg" ? c.channel : "web"]++; }
        const src = {}; for (const l of db.leads) { const k = String(l.created_at || "").slice(0, 10); if (ser[k]) { ser[k].leads++; src[l.source || "other"] = (src[l.source || "other"] || 0) + 1; } }
        const ST = { new: "New", contacted: "Contacted", visit: "Site visit", quote: "Quote sent", won: "Won", lost: "Lost" }, fun = {}; for (const k in ST) fun[k] = 0; for (const l of db.leads) if (fun[l.stage] != null) fun[l.stage]++;
        const ts = (m) => Date.parse(String(m.t).replace(" ", "T")); const rt = { ai: [], team: [] };
        for (const c of (db.chats || [])) { let v = null, a = 0, t = 0; for (const m of (db.chatMsgs || []).filter((x) => x.chat_id === c.id)) { if (v == null && m.who === "visitor") v = ts(m); else if (v != null && m.who === "ai" && !a) { a = 1; rt.ai.push(Math.max(0, Math.round((ts(m) - v) / 1000))); } else if (v != null && m.who === "agent" && !t) { t = 1; rt.team.push(Math.max(0, Math.round((ts(m) - v) / 1000))); } } }
        const med = (a) => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null; const won = fun.won, cl = won + fun.lost;
        return { ok: true, days, series: Object.values(ser), sources: Object.fromEntries(Object.entries(src).sort((a, b) => b[1] - a[1])), funnel: fun, stages: ST, winRate: cl ? Math.round(won * 100 / cl) : null, reply: { ai: med(rt.ai), team: med(rt.team), aiN: rt.ai.length, teamN: rt.team.length },
          flows: Object.entries(d.flows).filter(([, f]) => f.on || f.sent || f.mailed || f.failed).map(([k, f]) => ({ k, name: WAG_FLOWS[k], on: !!f.on, sent: +f.sent || 0, mailed: +f.mailed || 0, failed: +f.failed || 0 })), camps: [], optout: Object.keys(d.optout || {}).length }; }
      case "wah_tpl_submit": { need(OA); const d = wagLoad(); if (!wagTpl(d, inp.id)) throw new Fail("Template not found"); if (!hubCfg(d).waba) throw new Fail("Add your WhatsApp Business Account ID in the hub settings first"); throw new Fail("Connect WhatsApp first (WhatsApp hub → Connect)"); }
      case "wah_tpl_sync": { need(OA); const d = wagLoad(); if (!hubCfg(d).waba) throw new Fail("Add your WhatsApp Business Account ID in Settings first (Meta → WhatsApp Manager → Account tools)"); throw new Fail("Connect WhatsApp first (WhatsApp hub → Connect)"); }
      case "wag_get": { const u = need(SL), d = wagLoad(); wagSave(d); const all = wagContacts(db), vals = (k) => [...new Set(all.map((c) => String(c[k] || "").trim()).filter(Boolean))], tags = new Set(); all.forEach((c) => c.tags.forEach((t) => String(t).trim() && tags.add(String(t).trim())));
        const oa = OA.includes(u.role); return { ok: true, cfg: oa ? d.cfg : { ...d.cfg, cronKey: undefined }, cronUrl: oa ? "/api/wa-cron.php?key=" + d.cfg.cronKey : "", flows: d.flows, flowNames: WAG_FLOWS, tpls: d.tpls, segs: d.segs, camps: [...d.camps].reverse().map((c) => wagPub(c)), vars: WAG_VARS,
          optout: Object.keys(d.optout).length, today: d.day[now().slice(0, 10)] || 0, left: wagLeft(d), lastTick: d.lastTick || null, connected: true, preview: true, opts: { lines: vals("line"), cities: vals("city").slice(0, 80), tags: [...tags].slice(0, 80) }, contacts: all.length }; }
      case "wag_audience": { need(SL); const d = wagLoad(), [L, opt] = wagAudience(db, wagFilter(inp.filter), d); return { ok: true, count: L.length, optedOut: opt, sample: L.slice(0, 25).map((c) => ({ name: c.n, phone: "+" + c.p, city: c.city, stage: c.stage, kind: c.kind, line: c.line })) }; }
      case "wag_seg_save": { const u = need(SL), d = wagLoad(), name = clip(inp.name, 60); if (!name) throw new Fail("Give the segment a name"); const s = { id: clip(inp.id, 20) || wagId(), name, filter: wagFilter(inp.filter), updated: now() };
        const i = d.segs.findIndex((x) => x.id === s.id); if (i >= 0) d.segs[i] = s; else { if (d.segs.length >= 50) throw new Fail("Up to 50 segments"); d.segs.push(s); } wagSave(d); log(db, u, "wa.segment", name, ip); save(db); return { ok: true, seg: s }; }
      case "wag_seg_delete": { need(SL); const d = wagLoad(); d.segs = d.segs.filter((x) => x.id !== inp.id); wagSave(d); return { ok: true }; }
      case "wag_tpl_save": { const u = need(OA), d = wagLoad(), name = clip(inp.name, 120).toLowerCase(); if (!/^[a-z0-9_]{1,120}$/.test(name)) throw new Fail("Template name must match the name in Meta exactly: lowercase letters, numbers and _ only");
        const body = clip(inp.body, 1024); if (!body) throw new Fail("Paste the template text from Meta so you can preview it"); const n = Math.max(0, ...[...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => +m[1]));
        const params = (Array.isArray(inp.params) ? inp.params : []).slice(0, n).map((p) => clip(p, 200)); while (params.length < n) params.push("{name}");
        const t = { id: clip(inp.id, 20) || wagId(), name, lang: clip(inp.lang, 10) || "en", label: clip(inp.label, 60) || name, body, params, cat: ["marketing", "utility"].includes(inp.cat) ? inp.cat : "marketing" };
        const i = d.tpls.findIndex((x) => x.id === t.id); if (i >= 0) d.tpls[i] = t; else d.tpls.push(t); wagSave(d); log(db, u, "wa.template", name, ip); save(db); return { ok: true, tpl: t }; }
      case "wag_tpl_delete": { need(OA); const d = wagLoad(); for (const [k, f] of Object.entries(d.flows)) if (f.on && f.tpl === inp.id) throw new Fail("This template is used by the auto flow “" + WAG_FLOWS[k] + "”. Turn it off first.");
        if (d.camps.some((c) => c.tpl === inp.id && ["scheduled", "sending", "paused"].includes(c.status))) throw new Fail("A campaign that is still sending uses this template"); d.tpls = d.tpls.filter((x) => x.id !== inp.id); wagSave(d); return { ok: true }; }
      case "wag_camp_save": { const u = need(SL), d = wagLoad(), name = clip(inp.name, 80); if (!name) throw new Fail("Give the campaign a name"); const t = wagTpl(d, inp.tpl); if (!t) throw new Fail("Choose a template");
        const f = wagFilter(inp.filter), [L] = wagAudience(db, f, d); if (!L.length) throw new Fail("No one matches this audience"); if (L.length > 5000) throw new Fail("Audience is over 5,000 people — narrow it down");
        let when = now(); if (inp.when) { const ms = Date.parse(String(inp.when).replace(" ", "T")); if (isNaN(ms)) throw new Fail("Invalid schedule time"); when = String(inp.when).replace("T", " ").slice(0, 16) + ":00"; }
        const params = (Array.isArray(inp.params) ? inp.params : t.params).slice(0, t.params.length).map((p) => clip(p, 200)); while (params.length < t.params.length) params.push(t.params[params.length]);
        const c = { id: wagId(), name, tpl: t.id, tplName: t.label, params, filter: f, seg: clip(inp.seg, 20), when, status: inp.draft ? "draft" : when > now() ? "scheduled" : "sending", created_at: now(), created_by: u.name, rcp: L.map((x) => ({ p: x.p, n: x.n, co: x.co, city: x.city, lid: x.lid, s: "queued" })) };
        d.camps.push(c); wagSave(d); log(db, u, "wa.campaign", name + " → " + L.length, ip); save(db); const tick = c.status === "sending" ? wagTick(db) : null; return { ok: true, camp: wagPub(wagLoad().camps.find((x) => x.id === c.id)), tick }; }
      case "wag_camp_get": { need(SL); const c = wagLoad().camps.find((x) => x.id === inp.id); if (!c) throw new Fail("Campaign not found", 404); return { ok: true, camp: wagPub(c, true) }; }
      case "wag_camp_action": { const u = need(SL), d = wagLoad(), i = d.camps.findIndex((x) => x.id === inp.id), c = d.camps[i], dd = inp.do; if (!c) throw new Fail("Campaign not found", 404);
        if (dd === "cancel" && ["draft", "scheduled", "sending", "paused"].includes(c.status)) { c.status = "cancelled"; c.rcp.forEach((r) => { if (r.s === "queued") r.s = "skipped"; }); }
        else if (dd === "pause" && ["sending", "scheduled"].includes(c.status)) c.status = "paused";
        else if ((dd === "resume" || dd === "start") && ["paused", "draft"].includes(c.status)) { c.status = "sending"; delete c.error; }
        else if (dd === "retry") { c.rcp.forEach((r) => { if (r.s === "failed") { r.s = "queued"; delete r.e; } }); if (["done", "paused"].includes(c.status)) c.status = "sending"; }
        else if (dd === "delete" && !["sending", "scheduled"].includes(c.status)) d.camps.splice(i, 1);
        else throw new Fail("That action is not possible now");
        wagSave(d); log(db, u, "wa.campaign." + dd, inp.id, ip); save(db); if (["resume", "start", "retry"].includes(dd)) wagTick(db); return { ok: true }; }
      case "wag_flows_save": { const u = need(OA), d = wagLoad();
        for (const [k, f] of Object.entries(inp.flows || {})) { if (!WAG_FLOWS[k] || !f) continue; const t = wagTpl(d, f.tpl); const mailOk = !!f.mail && String(f.body || "").trim() !== ""; if (f.on && !t && !mailOk) throw new Fail(WAG_FLOWS[k] + ": choose a template or write the backup email");
          const pr = t ? (Array.isArray(f.params) ? f.params : t.params).slice(0, t.params.length).map((p) => clip(p, 200)) : []; while (t && pr.length < t.params.length) pr.push("{name}");
          d.flows[k] = { ...d.flows[k], on: !!f.on, tpl: t ? t.id : "", days: Math.max(0, Math.min(30, parseInt(f.days ?? d.flows[k].days) || 0)), params: pr, mail: !!f.mail, subject: clip(f.subject, 120), body: String(f.body || "").replace(/<[^>]*>/g, "").trim().slice(0, 2000) }; }
        if (inp.cfg) { const cf = inp.cfg; d.cfg.dailyCap = Math.max(1, Math.min(100000, parseInt(cf.dailyCap) || 250)); d.cfg.perTick = Math.max(1, Math.min(200, parseInt(cf.perTick) || 25)); for (const k of ["quietFrom", "quietTo"]) d.cfg[k] = /^\d\d:\d\d$/.test(cf[k] || "") ? cf[k] : ""; }
        wagSave(d); log(db, u, "wa.flows", "", ip); save(db); return { ok: true, flows: d.flows, cfg: d.cfg }; }
      case "wag_optout": { need(SL); const d = wagLoad(), p = wagPhone(inp.phone); if (!p) throw new Fail("Enter a valid phone number"); if (inp.remove) delete d.optout[p]; else d.optout[p] = now(); wagSave(d); return { ok: true, optout: Object.keys(d.optout).length }; }
      case "wag_optout_list": { need(SL); const d = wagLoad(); return { ok: true, list: Object.entries(d.optout).sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([p, t]) => ({ phone: "+" + p, t })) }; }
      case "wag_tick": { need(SL); return { ok: true, ...wagTick(db) }; }
      case "wag_test": { need(OA); const d = wagLoad(), t = wagTpl(d, inp.tpl); if (!t) throw new Fail("Choose a template"); if (!wagPhone(inp.phone)) throw new Fail("Enter your WhatsApp number"); return { ok: true, preview: true }; }
      case "wag_sim": { need(OA); return { ok: true, stopped: wagWebhook(inp.payload || {}) }; } // preview only: feed a fake Meta webhook payload
    }
    return null;
  }
  /* P18 E mirror: estimator rate book + forms settings (mirrors api/p18e-lib.php) */
  const FORMS_WEB = { contact: "Contact form", estimator: "Cost estimator", brief: "3D brief", "fitout-hub": "Fit-out quote", "office-fitout": "Office fit-out quote", whatsapp: "WhatsApp widget" };
  const FORM_DEF = { alertTo: "", waTo: "", waAlert: true, reply: true, replyText: "" }, FORMSF = path.join(PRIV, "forms.json");
  const formsCfg = () => { const f = (jr(FORMSF, {}).forms) || {}; return Object.fromEntries(Object.keys(FORMS_WEB).map((k) => [k, { ...FORM_DEF, ...(f[k] || {}) }])); };
  function estClean(r) {
    if (!r || !Array.isArray(r.services) || !Array.isArray(r.finishes)) throw new Fail("Rate book is incomplete");
    const int = (v) => Math.max(0, Math.min(1e8, Math.round(+v || 0))), keys = new Set(), sv = [];
    for (const x of r.services.slice(0, 20)) {
      const label = clip(x.label, 60); if (!label) throw new Fail("Every service needs a name");
      const key = (String(x.key || label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 40); if (!key || keys.has(key)) throw new Fail("Two services have the same name: " + label); keys.add(key);
      const rt = { essential: int((x.rates || {}).essential), standard: int((x.rates || {}).standard), premium: int((x.rates || {}).premium) };
      if (!rt.essential || rt.essential > rt.standard || rt.standard > rt.premium) throw new Fail(label + ": rates must be above 0 and go up Essential ≤ Standard ≤ Premium");
      const unit = x.unit === "views" ? "views" : "sqft"; sv.push({ key, label, hint: clip(x.hint, 140), unit, unitLabel: clip(x.unitLabel, 40) || (unit === "views" ? "Number of views" : "Area (sq ft)"), rates: rt });
    }
    if (!sv.length) throw new Fail("Add at least one service");
    const by = Object.fromEntries(r.finishes.filter(Boolean).map((f) => [f.key, f]));
    const fin = [["essential", "Essential"], ["standard", "Standard"], ["premium", "Premium"]].map(([k, d]) => ({ key: k, label: clip((by[k] || {}).label, 30) || d, hint: clip((by[k] || {}).hint, 100) }));
    const cat = (Array.isArray(r.catalog) ? r.catalog : []).slice(0, 500).filter((c) => c && clip(c.desc, 300)).map((c) => ({ cat: clip(c.cat, 60), desc: clip(c.desc, 300), unit: clip(c.unit, 20) || "job", rate: int(c.rate) }));
    const terms = (Array.isArray(r.terms) ? r.terms : []).slice(0, 20).filter((t) => typeof t === "string" && t.trim()).map((t) => clip(t, 300));
    return { services: sv, finishes: fin, catalog: cat, terms };
  }
  async function p18e(action, inp, need, db, ip) {
    if (!/^(est_|forms_)/.test(action)) return null;
    const OA = ["owner", "admin"];
    if (action === "est_save") {
      const u = need(OA), r = estClean(inp.rates), rel = "assets/js/estimator-rates.js";
      cmsBackup(rel); fs.writeFileSync(path.join(ROOT, rel), "/* Woodex estimator rate book (PKR). Edited in Admin → Content → Estimator (" + now().slice(0, 16) + ").\n   The /estimator/ page and the quotation builder both read from here. */\nwindow.WX_RATES = " + JSON.stringify(r, null, 2) + ";\n");
      const v = now().replace(/\D/g, "").slice(2, 12);
      for (const p of htmlPages()) { const abs = path.join(ROOT, p), h = fs.readFileSync(abs, "utf8"); if (!h.includes("estimator-rates.js")) continue; const n = h.replace(/\/assets\/js\/estimator-rates\.js(\?v=\w+)?/g, "/assets/js/estimator-rates.js?v=" + v); if (n !== h) fs.writeFileSync(abs, n); }
      log(db, u, "estimator.save", r.services.length + " services", ip); save(db); return { ok: true, rates: r };
    }
    if (action === "est_tpls") { need(OA); return { ok: true, templates: jr(path.join(PRIV, "est-templates.json"), {}).list || [] }; }
    if (action === "est_tpl_save") {
      const u = need(OA), F = path.join(PRIV, "est-templates.json"); let L = jr(F, {}).list || []; const name = clip(inp.name, 60);
      if (inp.delete) L = L.filter((t) => t.name !== name); else { if (!name) throw new Fail("Give the template a name"); const r = estClean(inp.rates); L = [{ name, at: now(), by: u.name, rates: r }, ...L.filter((t) => t.name !== name)].slice(0, 20); }
      jw(F, { list: L }); log(db, u, "estimator.template", name, ip); save(db); return { ok: true, templates: L };
    }
    if (action === "forms_get") {
      need(OA); ensureCrm(db); const cfg = formsCfg(), pages = {}, since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace("T", " ");
      for (const rel of htmlPages()) { const h = fs.readFileSync(path.join(ROOT, rel), "utf8"); for (const id of Object.keys(FORMS_WEB)) { const q = id.replace(/[-]/g, "\\-"); if (new RegExp(`WXForms\\.send\\(\\s*["']${q}["']|data-form="${q}"|name="form"\\s+value="${q}"|form:\\s*["']${q}["']`).test(h)) (pages[id] = pages[id] || []).push("/" + rel.replace(/index\.html$/, "")); } }
      const forms = Object.entries(FORMS_WEB).map(([id, label]) => { const L = db.leads.filter((l) => l.source === id), fields = ["name", "phone", "email", "service", "message"]; L.slice(-40).forEach((l) => Object.keys(l.fields || {}).forEach((k) => { if (!fields.includes(k) && fields.length < 20) fields.push(k); }));
        return { id, label, total: L.length, month: L.filter((l) => l.created_at >= since).length, last: L.length ? L[L.length - 1].created_at : null, pages: [...new Set(pages[id] || [])].slice(0, 40), fields, cfg: cfg[id] }; });
      const c = crmCfg(); return { ok: true, forms, defaults: { emailTo: c.emailTo, emailOn: !!c.emailOn, waTo: c.waTo, smtpReady: !!(c.smtpHost && c.smtpUser), waOn: !!c.waOn, waReady: !!(c.waToken && c.waPhoneId) } };
    }
    if (action === "forms_save") {
      const u = need(OA), all = jr(FORMSF, {}); all.forms = all.forms || {};
      for (const [id, f] of Object.entries(inp.forms || {})) { if (!FORMS_WEB[id] || !f) continue; const em = String(f.alertTo || "").split(/[\s,;]+/).filter(Boolean); for (const e of em) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Fail(FORMS_WEB[id] + ': "' + e + '" is not a valid email');
        const wa = String(f.waTo || "").split(/[,;\n]+/).map((x) => x.replace(/\D/g, "")).filter(Boolean); for (const w of wa) if (w.length < 10 || w.length > 15) throw new Fail(FORMS_WEB[id] + ': WhatsApp number "' + w + '" should be 10-15 digits with country code, e.g. 923224000768');
        all.forms[id] = { alertTo: em.slice(0, 5).join(", "), waTo: wa.slice(0, 5).join(", "), waAlert: !!f.waAlert, reply: !!f.reply, replyText: clip(f.replyText, 1000) }; }
      if (inp.defaults && typeof inp.defaults === "object") { const de = String(inp.defaults.emailTo || "").split(/[\s,;]+/).filter(Boolean); for (const e of de) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Fail('Default alert email: "' + e + '" is not a valid email'); const cc = jr(CRM, {}); cc.emailTo = de.slice(0, 5).join(", "); cc.emailOn = !!inp.defaults.emailOn && de.length > 0; jw(CRM, cc); }
      jw(FORMSF, all); log(db, u, "forms.save", Object.keys(inp.forms || {}).join(","), ip); save(db); return { ok: true, forms: formsCfg() };
    }
    return null;
  }
  async function pbk(action, inp, need, db, ip) {
    if (!["bk_list", "bk_save", "bk_status", "bk_cfg", "bk_cfg_save", "bk_slots", "bk_remind"].includes(action)) return null;
    ensureCrm(db); db.bookings = db.bookings || []; db.seqB = db.seqB || 0; const c = bkCfg(), done = (o) => { save(db); return o; }, today = ymd(pkNow());
    const team = db.users.filter((u) => u.active && SALES.includes(u.role)).map((u) => ({ id: u.id, name: u.name }));
    switch (action) {
      case "bk_list": { need(SALES); const from = /^\d{4}-\d{2}-\d{2}$/.test(inp.from || "") ? inp.from : ymd(new Date(pkNow() - 7 * 864e5)), to = /^\d{4}-\d{2}-\d{2}$/.test(inp.to || "") ? inp.to : ymd(new Date(+pkNow() + 60 * 864e5));
        const srt = (a, b) => (a.d + a.tm < b.d + b.tm ? -1 : 1);
        return { ok: true, items: db.bookings.filter((b) => b.d >= from && b.d <= to).sort(srt).map((b) => bkRow(b, c, db)), pending: db.bookings.filter((b) => b.status === "pending" && b.d >= today).sort(srt).map((b) => bkRow(b, c, db)), team, status: BK_ST, cfg: c, today }; }
      case "bk_slots": { need(SALES); const t = bkType(c, String(inp.type || "visit")) || { dur: 60 }; return { ok: true, slots: bkFree(db, c, String(inp.date || ""), t.dur, +inp.id || 0, true), closed: bkClosed(c, String(inp.date || "")) }; }
      case "bk_save": {
        const u = need(SALES), id = +inp.id || 0, t = bkType(c, String(inp.type || "")); if (!t) throw new Fail("Choose a booking type");
        const d = String(inp.d || ""), tm = String(inp.tm || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(tm)) throw new Fail("Choose a date and time");
        const name = clip(inp.name, 120), phone = clip(inp.phone, 40); if (name.length < 2 || !phone) throw new Fail("Name and phone are required");
        const dur = Math.max(15, Math.min(480, +inp.dur || t.dur));
        if (!inp.force) { const x = db.bookings.find((r) => r.d === d && r.id !== id && ["pending", "confirmed"].includes(r.status) && bkMin(tm) < bkMin(r.tm) + r.dur && bkMin(r.tm) < bkMin(tm) + dur); if (x) return { ok: false, clash: true, error: "Clashes with " + x.name + " at " + x.tm }; }
        const staff = +inp.staff_id || 0; if (staff && !team.some((m) => m.id === staff)) throw new Fail("Unknown team member");
        const v = { name, phone, email: clip(inp.email, 190), type: t.k, city: clip(inp.city, 80), address: clip(inp.address, 300), d, tm, dur, staff_id: staff, note: clip(inp.note, 1000) };
        let b; if (id) { b = db.bookings.find((r) => r.id === id); if (!b) throw new Fail("Booking not found", 404); if (b.d !== d || b.tm !== tm) b.reminded = 0; Object.assign(b, v); }
        else { b = { id: ++db.seqB, created_at: now(), lead_id: +inp.lead_id || 0, status: BK_ST[inp.status] ? inp.status : "confirmed", src: "team", reminded: 0, ...v }; db.bookings.push(b); }
        const l = b.lead_id && db.leads.find((x) => x.id === b.lead_id); if (l) { l.next_at = d + " " + tm + ":00"; l.followup = d; l.next_type = t.k === "visit" ? "visit" : "meeting"; }
        const sent = inp.notify && b.status === "confirmed" ? bkNotify(b, "booking") : {};
        log(db, u, "booking.save", "#" + b.id, ip); return done({ ok: true, item: bkRow(b, c, db), sent });
      }
      case "bk_status": {
        const u = need(SALES), b = db.bookings.find((r) => r.id === +inp.id); if (!b) throw new Fail("Booking not found", 404); if (!BK_ST[inp.status]) throw new Fail("Unknown status");
        b.status = inp.status; const l = b.lead_id && db.leads.find((x) => x.id === b.lead_id); if (l) l.notes.push({ t: now(), user: u.name, text: "Booking " + bkLabel(b.d, b.tm) + ": " + BK_ST[b.status], sys: true });
        const sent = b.status === "confirmed" && inp.notify !== false ? bkNotify(b, "booking") : {};
        log(db, u, "booking.status", "#" + b.id + " " + b.status, ip); return done({ ok: true, item: bkRow(b, c, db), sent });
      }
      case "bk_remind": { need(["owner", "admin"]); const tom = ymd(new Date(+pkNow() + 864e5)); let n = 0; for (const b of db.bookings) if (b.d === tom && b.status === "confirmed" && !b.reminded) { bkNotify(b, "remind"); b.reminded = 1; n++; } return done({ ok: true, reminders: n }); }
      case "bk_cfg": need(SALES); return { ok: true, cfg: c };
      case "bk_cfg_save": {
        const u = need(["owner", "admin"]), s = inp.cfg || {}, n = { ...c }, hm = /^([01]\d|2[0-3]):[0-5]\d$/;
        if ("on" in s) n.on = !!s.on;
        for (const k of ["open", "last"]) if (s[k] != null) { if (!hm.test(s[k])) throw new Fail("Check the opening hours"); n[k] = s[k]; }
        if (bkMin(n.last) < bkMin(n.open)) throw new Fail("Last slot must be after opening time");
        for (const [k, a, z] of [["step", 15, 240], ["maxDay", 1, 30], ["minHours", 0, 168], ["ahead", 1, 180]]) if (s[k] != null) n[k] = Math.max(a, Math.min(z, +s[k] || 0));
        if (s.days) n.days = [...new Set(s.days.map(Number).filter((x) => x >= 1 && x <= 7))];
        if (s.areas) n.areas = s.areas.map((x) => clip(x, 60)).filter(Boolean).slice(0, 30);
        if (s.blocked) n.blocked = [...new Set(s.blocked.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].slice(0, 200);
        if (s.types) { const ty = s.types.slice(0, 8).map((x) => ({ k: String(x.k || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20), label: clip(x.label, 40), dur: Math.max(15, Math.min(480, +x.dur || 60)), on: !!x.on, hint: clip(x.hint, 160) })).filter((x) => x.k && x.label); if (!ty.length) throw new Fail("Keep at least one booking type"); n.types = ty; }
        jw(BKF, n); log(db, u, "booking.settings", "", ip); return { ok: true, cfg: n };
      }
    }
    return null;
  }
  async function a17(action, inp, need, db, ip) {
    if (!["lead_activity", "leads_followups", "leads_stats", "leads_import2", "clients_master", "client_360", "clients_merge", "s17_meta", "inv_new", "inv_track", "invs_tracker", "invs_import"].includes(action)) return null;
    ensureCrm(db); const done = (o) => { save(db); return o; };
    switch (action) {
      case "s17_meta": need(SALES); return { ok: true, ...S17 };
      case "lead_activity": {
        const u = need(SALES), l = leadFind(db, inp.id), k = String(inp.kind || "note"); if (!["call", "whatsapp", "visit", "meeting", "email", "note"].includes(k)) throw new Fail("Unknown activity type");
        let text = clip(inp.text, 2000); const out = clip(inp.outcome, 190); if (!text && !out) { const chg = !!inp.next_at || (inp.stage && inp.stage !== l.stage); if (!chg && inp.kind === "note") throw new Fail("Add a short note, pick an outcome, or set a follow-up"); text = ((inp.kind && inp.kind !== "note") ? inp.kind[0].toUpperCase() + inp.kind.slice(1) : "Update") + " logged" + (inp.next_at ? " · next follow-up set" : ""); }
        l.notes.push({ t: now(), user: u.name, text: text || out, kind: k, outcome: out }); l.read = true;
        if (k !== "note") { l.last_contact = now(); if (l.stage === "new") { l.notes.push({ t: now(), user: u.name, text: "Stage: new → contacted", sys: true }); l.stage = "contacted"; } }
        if ("next_at" in inp) { l.next_at = s17dt(inp.next_at); l.followup = l.next_at.slice(0, 10); l.next_type = l.next_at ? (S17.nextTypes[inp.next_type] ? inp.next_type : "call") : ""; }
        if (inp.stage && STAGES.includes(inp.stage) && inp.stage !== l.stage) { l.notes.push({ t: now(), user: u.name, text: `Stage: ${l.stage} → ${inp.stage}`, sys: true }); l.stage = inp.stage; }
        log(db, u, "lead.activity", `#${l.id} ${k}`, ip); return done({ ok: true, lead: leadPub(l, db) });
      }
      case "leads_followups": {
        need(SALES); const n = now(), today = n.slice(0, 10), wk = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) + " 23:59:59", g = { overdue: [], today: [], upcoming: [] };
        db.leads.filter((l) => l.next_at && !["won", "lost"].includes(l.stage) && l.next_at < wk).sort((a, b) => (a.next_at < b.next_at ? -1 : 1)).forEach((l) => {
          const r = { id: l.id, name: l.name, company: l.company || "", phone: l.phone, stage: l.stage, next_at: l.next_at, next_type: l.next_type || "", line: l.line || "", assigned_name: leadPub(l, db).assigned_name };
          const d = l.next_at.slice(0, 10); g[d === today ? "today" : l.next_at < n ? "overdue" : "upcoming"].push(r); });
        return { ok: true, ...g };
      }
      case "leads_stats": {
        need(SALES); const m = /^\d{4}-\d{2}$/.test(inp.month || "") ? inp.month : ""; const k = { total: 0, new: 0, client: 0, meeting: 0, proposal: 0, hold: 0, done: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
        for (const l of db.leads) { if (m && String(l.created_at).slice(0, 7) !== m) continue; k.total++; k.value += l.value || 0;
          if (l.lead_type === "returning" || l.client_id) k.client++; else k.new++; if (l.stage === "visit") k.meeting++; if (l.stage === "quote" || l.quote_status === "proposal") k.proposal++;
          if (l.stage === "hold") k.hold++; if (l.quote_status === "done") k.done++; if (l.stage === "won") { k.won++; k.wonValue += l.value || 0; } if (l.stage === "lost") k.lost++; }
        return { ok: true, month: m, stats: k, months: [...new Set(db.leads.map((l) => String(l.created_at).slice(0, 7)))].sort().reverse().slice(0, 36) };
      }
      case "leads_import2": {
        const u = need(["owner", "admin"]); let n = 0, skip = 0; const team = {}; db.users.forEach((t) => (team[String(t.name).split(" ")[0].toLowerCase()] = t.id));
        const known = new Set(db.leads.map((l) => s17dig(l.phone) + "|" + String(l.name).toLowerCase()));
        const mkc = inp.clients !== false, k10 = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; }, cix = {}; let cn = 0, cl = 0; db.clients.forEach((c) => { const k = k10(c.phone); if (k && !cix[k]) cix[k] = c.id; });
        const dt = (v) => { v = String(v || "").trim(); if (!v || /dd\//i.test(v)) return ""; const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; const t = new Date(v); return isNaN(t) ? "" : t.toISOString().slice(0, 19).replace("T", " "); };
        for (const r of (Array.isArray(inp.rows) ? inp.rows : []).slice(0, 3000)) {
          if (!r || typeof r !== "object") continue; const co = clip(r.company, 120); let name = clip(r.name, 120); if (!name || /^name$/i.test(name)) name = co; if (!name || /^(company|name)$/i.test(name)) { skip++; continue; }
          const key = s17dig(r.phone) + "|" + name.toLowerCase(); if (known.has(key)) { skip++; continue; } known.add(key);
          const act = String(r.action || "").trim().toLowerCase(); let stage = { won: "won", hold: "hold", meeting: "visit", visit: "visit", close: "lost", closed: "lost", lost: "lost", done: "contacted", contacted: "contacted" }[act] || "new";
          const qv = String(r.quotation || "").toLowerCase(), qs = qv.includes("done") ? "done" : /propo|quot/.test(qv) ? "proposal" : qv.includes("pend") ? "pending" : ""; if (qs === "proposal" && stage === "new") stage = "quote";
          const line = S17.lines[String(r.line || "").toLowerCase()] ? String(r.line).toLowerCase() : ""; const src = String(r.source || ""), lt = /client/i.test(src) ? "returning" : /refer/i.test(src) ? "referral" : "new";
          const meet = dt(r.meeting), last = dt(r.last_contact), ca = dt(r.date); const full = (d, h) => (d && d.length === 10 ? d + " " + h : d);
          db.leads.push({ id: ++db.seqL, created_at: full(ca, "10:00:00") || now(), source: "import", page: "", name, phone: clip(r.phone, 40), email: "", service: "", message: clip(r.note, 2000), fields: {}, stage,
            assigned_to: team[String(r.assigned || "-").trim().split(" ")[0].toLowerCase()] || null, followup: meet.slice(0, 10), value: 0, lost_reason: "", client_id: null, tags: [], notes: [], read: true,
            company: co === name ? "" : co, designation: clip(r.designation, 80), location: clip(r.location, 160), line, lead_type: lt, quote_status: qs, last_contact: full(last, "10:00:00"), next_at: full(meet, "11:00:00"), next_type: meet ? "meeting" : "" });
          const pk = mkc ? k10(r.phone) : ""; if (pk) { let cid = cix[pk]; if (!cid) { cid = ++db.seqC; db.clients.push({ id: cid, name, phone: clip(r.phone, 40), email: "", company: co === name ? "" : co, city: clip(r.location, 80), address: "", notes: "", created_at: full(ca, "10:00:00") || now(), type: co && co !== name ? "company" : "individual", source: "import", line, designation: clip(r.designation, 80) }); cix[pk] = cid; cn++; } else cl++; db.leads[db.leads.length - 1].client_id = cid; }
          n++; }
        log(db, u, "lead.import", n + " rows (sheet), " + cn + " new clients", ip); return done({ ok: true, imported: n, skipped: skip, clientsNew: cn, clientsLinked: cl });
      }
      case "clients_master": {
        need(SALES); if (p19link(db, true).leads) save(db); const I = (db.invoices || []).map(invPub);
        return { ok: true, types: S17.clientTypes, lines: S17.lines, clients: db.clients.slice().reverse().map((c) => {
          const ls = db.leads.filter((l) => l.client_id === c.id), iv = I.filter((i) => +i.client_id === c.id), pp = (db.projects || []).filter((p) => +p.client_id === c.id), qq = (db.quotes || []).filter((q) => +q.client_id === c.id);
          const last = [c.created_at, ...ls.map((l) => l.last_contact || l.created_at), ...iv.map((i) => i.issue_date || ""), ...qq.map((q) => q.updated_at || q.date || "")].sort().pop();
          return { id: c.id, name: c.name, company: c.company || "", phone: c.phone || "", email: c.email || "", city: c.city || "", type: c.type || "", line: c.line || "", tags: c.tags || [], created_at: c.created_at,
            leads: ls.length, quotes: qq.length, openQuotes: qq.filter((q) => ["draft", "sent"].includes(q.status)).length, invoices: iv.length, lifetime: iv.reduce((a, i) => a + i.total, 0), paid: iv.reduce((a, i) => a + i.paid, 0),
            balance: iv.reduce((a, i) => a + i.balance, 0), projects: pp.length, last, status: s17Status(iv, pp, ls) }; }) };
      }
      case "client_360": {
        need(SALES); const c0 = db.clients.find((x) => x.id === +inp.id); if (!c0) throw new Fail("Client not found", 404);
        const c = { phone: "", email: "", company: "", city: "", address: "", notes: "", type: "", source: "", line: "", designation: "", tags: [], ...c0 };
        const leads = db.leads.filter((l) => l.client_id === c.id).slice().reverse().map((l) => leadPub(l, db)); const [quotes, invs, projs] = s17Docs(db, c); const tl = [];
        for (const l of leads) { tl.push({ t: l.created_at, k: "lead", title: `Enquiry #${l.id}${l.service ? " — " + l.service : ""}`, sub: "Stage: " + l.stage, id: l.id }); for (const n of l.notes) if (!n.sys) tl.push({ t: n.t, k: "note", title: n.text, sub: n.user || "", id: l.id }); }
        const f = (n) => Math.round(+n || 0).toLocaleString("en-US");
        for (const x of quotes) tl.push({ t: x.created_at || x.date || "", k: "quote", title: `Quotation ${x.no}${x.version > 1 ? " · V" + x.version : ""} — ${x.status}`, sub: "Rs " + f(x.total), id: x.id });
        for (const x of invs) { tl.push({ t: (x.issue_date || "") + " 09:00:00", k: "invoice", title: `Invoice ${x.no} — Rs ${f(x.total)}`, sub: x.payStatus[0].toUpperCase() + x.payStatus.slice(1) + (x.balance ? " · balance Rs " + f(x.balance) : ""), id: x.id });
          for (const p of x.payments) tl.push({ t: (p.date || "") + " 12:00:00", k: "payment", title: `Payment Rs ${f(p.amount)} (${p.method || ""})`, sub: "Invoice " + x.no, id: x.id }); }
        for (const p of projs) tl.push({ t: p.created_at || p.start || "", k: "project", title: "Project " + p.name, sub: "Stage: " + p.stage, id: p.id });
        tl.sort((a, b) => String(b.t).localeCompare(String(a.t)));
        let next = null; for (const l of leads) if (l.next_at && !["won", "lost"].includes(l.stage) && (!next || l.next_at < next.at)) next = { at: l.next_at, type: l.next_type, lead: l.id };
        const sum = (a, k) => a.reduce((s, x) => s + (+x[k] || 0), 0);
        return { ok: true, client: c, status: s17Status(invs, projs, leads), next, kpis: { lifetime: sum(invs, "total"), paid: sum(invs, "paid"), balance: sum(invs, "balance"), quoted: sum(quotes, "total"), projects: projs.length, last: (tl[0] || {}).t || c.created_at },
          leads, quotes: quotes.map((x) => ({ ...x, label: x.no + (x.version > 1 ? " · V" + x.version : "") + (x.option ? " · " + x.option : "") })), invoices: invs, projects: projs, timeline: tl.slice(0, 300) };
      }
      case "inv_new": {
        const u = need(SALES); ensureA5(db); const [cid, cl] = s17InvClient(db, inp); const line = S17.lines[inp.line] ? inp.line : "interior";
        let secs = cleanSections(inp.sections); if (!secs.some((x) => x.items.length)) { const amt = num(inp.total); if (amt <= 0) throw new Fail("Enter the invoice amount or add items"); secs = [{ name: "Supply & services", note: "", items: [{ desc: clip(inp.desc, 600) || clip(inp.project, 160) || "As per work order", qty: 1, unit: "job", rate: amt, amount: amt }] }]; }
        const no = String(inp.no || "").trim() ? clip(inp.no, 30) : s17InvNo(line, db); if (db.invoices.some((x) => x.no === no)) throw new Fail("Invoice " + no + " already exists");
        const i = totals({ sections: secs, discount: inp.discount || 0, rent: inp.rent || 0, taxPct: inp.taxPct || 0 });
        Object.assign(i, { id: ++db.seqI, no, quote_id: null, quote_label: "", client: cl, client_id: cid, project: clip(inp.project, 160), site: clip(inp.site, 200), issue_date: /^\d{4}-\d{2}-\d{2}$/.test(inp.issue_date || "") ? inp.issue_date : now().slice(0, 10), due_date: /^\d{4}-\d{2}-\d{2}$/.test(inp.due_date || "") ? inp.due_date : "",
          terms: clip(inp.terms, 3000), notes: "", schedule: clip(inp.schedule, 600), payments: [], seqPay: 0, created_by: u.name, created_at: now(), po: clip(inp.po, 60), delivery_date: /^\d{4}-\d{2}-\d{2}$/.test(inp.delivery_date || "") ? inp.delivery_date : "", delivered: "", line, mode: inp.mode === "after_delivery" ? "after_delivery" : "", track_note: clip(inp.track_note, 500) });
        db.invoices.push(i); log(db, u, "invoice.create", no + " " + cl.name + " (standalone)", ip); return done({ ok: true, invoice: s17InvRow(i) });
      }
      case "inv_track": {
        const u = need(SALES); ensureA5(db); const i = db.invoices.find((x) => x.id === +inp.id); if (!i) throw new Fail("Invoice not found", 404);
        if ("po" in inp) i.po = clip(inp.po, 60); if ("track_note" in inp) i.track_note = clip(inp.track_note, 500);
        if ("delivery_date" in inp) i.delivery_date = /^\d{4}-\d{2}-\d{2}$/.test(inp.delivery_date || "") ? inp.delivery_date : "";
        if ("line" in inp) i.line = S17.lines[inp.line] ? inp.line : ""; if ("mode" in inp) i.mode = inp.mode === "after_delivery" ? "after_delivery" : "";
        if ("delivered" in inp) i.delivered = inp.delivered ? (/^\d{4}-\d{2}-\d{2}$/.test(String(inp.delivered)) ? inp.delivered : now().slice(0, 10)) : "";
        log(db, u, "invoice.track", i.no, ip); return done({ ok: true, invoice: s17InvRow(i) });
      }
      case "invs_tracker": {
        need(SALES); ensureA5(db); const y = /^\d{4}$/.test(String(inp.year || "")) ? String(inp.year) : now().slice(0, 4);
        const all = db.invoices.slice().reverse().map(s17InvRow), years = [...new Set([now().slice(0, 4), ...all.map((i) => String(i.issue_date).slice(0, 4))])].sort().reverse();
        const rows = all.filter((i) => String(i.issue_date).slice(0, 4) === y), months = {};
        for (let m = 1; m <= 12; m++) months[`${y}-${String(m).padStart(2, "0")}`] = { count: 0, total: 0, received: 0, balance: 0 };
        rows.forEach((i) => { const k = months[i.issue_date.slice(0, 7)]; if (!k) return; k.count++; k.total += i.total; k.received += i.paid; k.balance += i.balance; });
        return { ok: true, year: y, years, rows, months, lateAll: all.filter((i) => i.late).length, outstandingAll: all.reduce((a, i) => a + i.balance, 0) };
      }
      case "invs_import": {
        const u = need(["owner", "admin"]); ensureA5(db); let n = 0, skip = 0; const have = new Set(db.invoices.map((i) => i.no));
        const dt = (v) => { v = String(v || "").trim(); const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) return `${m[3].length === 2 ? 2000 + +m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; const t = v ? new Date(v) : null; return t && !isNaN(t) ? t.toISOString().slice(0, 10) : ""; };
        const nm = (v) => Math.round(parseFloat(String(v || "").replace(/[^\d.]/g, "")) || 0);
        for (const r of (Array.isArray(inp.rows) ? inp.rows : []).slice(0, 3000)) {
          if (!r || typeof r !== "object") continue; const no = clip(r.no, 30), co = clip(r.company, 120), tot = nm(r.total);
          if (!no || !co || tot <= 0 || (/^(invoice|inv)/i.test(no) && !/\d/.test(no)) || have.has(no)) { skip++; continue; } have.add(no);
          const [cid, cl] = s17InvClient(db, { client: { company: co, name: co } }); const date = dt(r.date) || now().slice(0, 10), rec = Math.min(tot, nm(r.received)), stt = String(r.status || "").toLowerCase();
          const i = totals({ sections: [{ name: "Supply & services", note: "", items: [{ desc: clip(r.note, 600) || "As per PO " + clip(r.po, 60), qty: 1, unit: "job", rate: tot, amount: tot }] }], discount: 0, taxPct: 0 });
          Object.assign(i, { id: ++db.seqI, no, quote_id: null, quote_label: "", client: cl, client_id: cid, project: "", site: "", issue_date: date, due_date: "", terms: "", notes: "", schedule: "", payments: [], seqPay: 0, created_by: u.name, created_at: now(),
            po: clip(r.po, 60), delivery_date: dt(r.delivery), delivered: stt.includes("paid") && !stt.includes("part") ? date : "", line: /^WF/i.test(no) ? "furniture" : "interior", mode: stt.includes("after") ? "after_delivery" : "", track_note: clip(r.note, 500) });
          if (rec > 0) { i.seqPay = 1; i.payments.push({ id: 1, rcpt: no + "-R1", date, amount: rec, method: "bank", ref: "", note: "Imported from sheet", by: u.name, t: now() }); }
          db.invoices.push(i); n++; }
        log(db, u, "invoice.import", n + " rows", ip); return done({ ok: true, imported: n, skipped: skip });
      }
      case "clients_merge": {
        const u = need(["owner", "admin"]), keep = +inp.keep, drop = +inp.merge; if (!keep || !drop || keep === drop) throw new Fail("Pick two different clients");
        const a = db.clients.find((x) => x.id === keep), b = db.clients.find((x) => x.id === drop); if (!a || !b) throw new Fail("Client not found", 404);
        db.leads.forEach((l) => { if (l.client_id === drop) l.client_id = keep; }); for (const t of ["quotes", "invoices", "projects"]) (db[t] || []).forEach((x) => { if (+x.client_id === drop) x.client_id = keep; });
        for (const k of ["phone", "email", "company", "city", "address"]) if (!String(a[k] || "").trim() && String(b[k] || "").trim()) a[k] = b[k]; a.notes = [a.notes, b.notes].filter(Boolean).join("\n");
        db.clients = db.clients.filter((x) => x !== b); log(db, u, "client.merge", `${b.name} → ${a.name}`, ip); return done({ ok: true, id: keep });
      }
    }
    return null;
  }
  function a5(action, inp, need, db, ip) {
    if (!/^(dash_|tpl_|quote_|quotes_|inv_|invs_|pay_|proj_|projs_|company_)/.test(action)) return null;
    ensureA5(db); const done = (o) => { save(db); return o; };
    const SALES = ["owner", "admin", "sales"], ALL = ["owner", "admin", "sales", "editor"];
    const findQ = (id) => { const q = db.quotes.find((x) => x.id === +id); if (!q) throw new Fail("Quotation not found", 404); return q; };
    const findI = (id) => { const i = db.invoices.find((x) => x.id === +id); if (!i) throw new Fail("Invoice not found", 404); return i; };
    const findP = (id) => { const p = db.projects.find((x) => x.id === +id); if (!p) throw new Fail("Project not found", 404); return p; };
    switch (action) {
      // ---------- company / document settings
      case "company_get": need(ALL); return { ok: true, company: companyCfg(), units: UNITS };
      case "company_save": {
        const u = need(["owner", "admin"]), c = companyCfg(), s = inp.company || {};
        for (const k of Object.keys(c)) if (k in s) c[k] = Array.isArray(c[k]) ? coList(k, s[k]) : ["nextNo", "validDays"].includes(k) ? Math.max(1, Math.round(num(s[k]))) : clip(s[k], k === "payTerms" ? 2000 : 300);
        const used = db.quotes.reduce((m, q) => Math.max(m, +String(q.no).replace(/\D/g, "") || 0), 0);
        if (c.nextNo <= used) throw new Fail("Next number must be higher than " + used + " (already used)");
        jw(COMPANY, c); log(db, u, "settings.company", "", ip); return done({ ok: true, company: c });
      }
      // ---------- templates
      case "tpl_list": need(SALES); return { ok: true, templates: db.tpls.map((t) => totals({ ...t, sections: t.sections.map((s) => ({ ...s, items: s.items.slice() })) })) };
      case "tpl_save": {
        const u = need(["owner", "admin"]), name = clip(inp.name, 80); if (!name) throw new Fail("Template name is required");
        let t = inp.id ? db.tpls.find((x) => x.id === +inp.id) : null; if (inp.id && !t) throw new Fail("Template not found", 404);
        if (!t) { t = { id: ++db.seqT, created_at: now() }; db.tpls.push(t); }
        Object.assign(t, { name, kind: ["design", "fitout", "renovation", "other"].includes(inp.kind) ? inp.kind : "other", description: clip(inp.description, 400), sections: cleanSections(inp.sections), terms: clip(inp.terms, 3000), updated_at: now() });
        log(db, u, "template.save", name, ip); return done({ ok: true, template: t });
      }
      case "tpl_import": {
        const u = need(["owner", "admin"]); let n = 0;
        for (const x of (Array.isArray(inp.templates) ? inp.templates : []).slice(0, 50)) { const name = clip(x.name, 80); if (!name || db.tpls.some((t) => t.name === name)) continue;
          db.tpls.push({ id: ++db.seqT, name, kind: ["design", "fitout", "renovation", "other"].includes(x.kind) ? x.kind : "other", description: clip(x.description, 400), sections: cleanSections(x.sections), terms: clip(x.terms, 3000), created_at: now(), updated_at: now() }); n++; }
        log(db, u, "template.import", n + " templates", ip); return done({ ok: true, imported: n });
      }
      case "tpl_delete": { const u = need(["owner", "admin"]), t = db.tpls.find((x) => x.id === +inp.id); if (!t) throw new Fail("Template not found", 404); db.tpls = db.tpls.filter((x) => x !== t); log(db, u, "template.delete", t.name, ip); return done({ ok: true }); }
      // ---------- quotations
      case "dash_target_save": { const u = need(["owner", "admin"]); db.dashTarget = Math.max(0, Math.round(+inp.target || 0)); return done({ ok: true, target: db.dashTarget }); }
      case "dash_data": {
        const u = need(ALL); const days = [7, 28, 90].includes(+inp.days) ? +inp.days : 28; const ymd = (t) => new Date(t).toISOString().slice(0, 10);
        const today = ymd(Date.now()), start = ymd(Date.now() - (days - 1) * 864e5), pStart = ymd(Date.now() - (2 * days - 1) * 864e5);
        const axis = []; for (let i = days - 1; i >= 0; i--) axis.push(ymd(Date.now() - i * 864e5));
        const o = { ok: true, days, role: u.role, crm: null, axis, visitors: axis.map(() => null) };
        if (!SALES.includes(u.role)) return o;
        const idx = Object.fromEntries(axis.map((d, i) => [d, i])), Z = () => axis.map(() => 0);
        const S = { leads: Z(), sent: Z(), won: Z(), invoiced: Z(), paid: Z() }; const inP = (d) => d >= pStart && d < start;
        let lN = 0, lP = 0, sN = 0, sP = 0, wN = 0, oq = 0, oqv = 0, pN = 0, pP = 0, unpaid = 0, mp = 0; const m0 = today.slice(0, 8) + "01"; const overdue = [];
        const funnel = { new: 0, contacted: 0, visit: 0, quoted: 0, won: 0, lost: 0 }; let pipe = 0; const src = {};
        for (const l of db.leads) { const d = String(l.created_at).slice(0, 10); if (d in idx) { lN++; S.leads[idx[d]]++; src[l.source] = (src[l.source] || 0) + 1; } else if (inP(d)) lP++; funnel[l.stage] = (funnel[l.stage] || 0) + 1; if (!["won", "lost"].includes(l.stage)) pipe += +l.value || 0; }
        for (const q of db.quotes) { const s = String(q.sent_at || "").slice(0, 10), a = String(q.approved_at || "").slice(0, 10); if (s in idx) { sN++; S.sent[idx[s]]++; } else if (s && inP(s)) sP++; if (a in idx) { wN++; S.won[idx[a]]++; } if (q.status === "sent") { oq++; oqv += +q.total || 0; } }
        for (const i of db.invoices) { const paid = (i.payments || []).reduce((m, p) => m + (+p.amount || 0), 0), bal = Math.max(0, i.total - paid); if (i.issue_date in idx) S.invoiced[idx[i.issue_date]] += i.total;
          for (const p of i.payments || []) { if (p.date in idx) { pN += +p.amount; S.paid[idx[p.date]] += +p.amount; } else if (inP(p.date)) pP += +p.amount; if (p.date >= m0) mp += +p.amount; }
          unpaid += bal; if (bal > 0 && i.due_date && i.due_date < today) overdue.push({ id: i.id, no: i.no, client: i.client?.name || "", balance: bal, due: i.due_date }); }
        const leads = db.leads.slice().sort((a, b) => b.id - a.id);
        const follow = leads.filter((l) => l.followup && l.followup <= today && !["won", "lost"].includes(l.stage)).slice(0, 8).map((l) => ({ id: l.id, name: l.name, service: l.service || "", stage: l.stage, followup: l.followup, late: l.followup < today }));
        o.crm = { kpi: { leads: [lN, lP], pipeline: pipe, quotesSent: [sN, sP], openQuotes: [oq, oqv], paid: [pN, pP], unpaid, won: wN }, series: S, funnel,
          recent: leads.slice(0, 6).map((l) => ({ id: l.id, name: l.name, service: l.service || "", stage: l.stage, source: l.source, created_at: l.created_at, read: !!l.is_read })),
          followups: follow, overdue: overdue.slice(0, 6), overdueN: overdue.length, sources: Object.entries(src).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
          chips: { new: db.leads.filter((l) => !l.is_read).length, overdue: overdue.length, follow: follow.length }, target: { target: db.dashTarget || 0, month: mp, monthLabel: new Date().toLocaleString("en", { month: "long", year: "numeric" }) } };
        return o;
      }
      case "quotes_list": { need(SALES); return { ok: true, quotes: db.quotes.slice().reverse().map(({ sections, ...q }) => ({ ...q, label: qLabel(q), sectionCount: sections.length })) }; }
      case "quote_get": { need(SALES); const q = findQ(inp.id); return { ok: true, quote: { ...q, label: qLabel(q) }, family: db.quotes.filter((x) => x.no === q.no).map((x) => ({ id: x.id, label: qLabel(x), status: x.status, total: x.total, version: x.version, option: x.option })), company: companyCfg(), invoice: db.invoices.find((i) => i.quote_id === q.id) ? invPub(db.invoices.find((i) => i.quote_id === q.id)) : null }; }
      case "quote_save": {
        const u = need(SALES); let q;
        if (inp.id) { q = findQ(inp.id); if (["approved", "invoiced", "superseded"].includes(q.status)) throw new Fail("This quotation is " + q.status + ". Create a new version to change it."); }
        else {
          const c = companyCfg(); q = { id: ++db.seqQ, no: c.prefix + c.nextNo, version: 1, option: "", status: "draft", created_by: u.name, created_at: now(), history: [{ t: now(), user: u.name, text: "Created" }] };
          c.nextNo++; jw(COMPANY, c); db.quotes.push(q);
          if (inp.lead_id) { const l = db.leads.find((x) => x.id === +inp.lead_id); if (l) { q.lead_id = l.id; if (["new", "contacted", "visit"].includes(l.stage)) { l.notes.push({ t: now(), user: u.name, text: `Stage: ${l.stage} → quote (${q.no})`, sys: true }); l.stage = "quote"; } } }
        }
        const c = companyCfg();
        Object.assign(q, { client: clientOf(inp.client || {}), client_id: +inp.client_id || q.client_id || null, project: clip(inp.project, 160), site: clip(inp.site, 200), kind: clip(inp.kind, 20) || q.kind || "other", date: /^\d{4}-\d{2}-\d{2}$/.test(inp.date || "") ? inp.date : q.date || now().slice(0, 10),
          valid_days: Math.max(1, Math.round(num(inp.valid_days) || c.validDays)), sections: cleanSections(inp.sections), discount: num(inp.discount), taxPct: num(inp.taxPct), terms: clip(inp.terms, 3000), notes: clip(inp.notes, 2000), intro: clip(inp.intro, 1500), design: ["classic", "minimal", "premium"].includes(inp.design) ? inp.design : q.design || "classic",
          layout: ["classic", "single", "project"].includes(inp.layout) ? inp.layout : q.layout || "classic", qtype: ["", "fitout", "renovation", "interior", "proposal", "furniture"].includes(inp.qtype || "") ? inp.qtype || "" : "",
          scope: clip(inp.scope, 6000), sign_name: clip(inp.sign_name, 80), sign_title: clip(inp.sign_title, 80), rent: num(inp.rent), advance: num(inp.advance), blocks: p18Blocks(inp.blocks), updated_at: now() });
        if (!q.client.name) throw new Fail("Client name is required");
        totals(q); log(db, u, inp.id ? "quote.update" : "quote.create", qLabel(q) + " " + q.client.name, ip);
        return done({ ok: true, quote: { ...q, label: qLabel(q) } });
      }
      case "quote_copy": {
        // mode: version (same number, V+1) | option (same number, new option) | duplicate (new number)
        const u = need(SALES), src = findQ(inp.id), mode = ["version", "option", "duplicate"].includes(inp.mode) ? inp.mode : "version", c = companyCfg();
        if (src.status === "invoiced" && mode !== "duplicate") throw new Fail("This quotation is already invoiced. Duplicate it to start a new number.");
        const fam = db.quotes.filter((x) => x.no === src.no);
        const q = JSON.parse(JSON.stringify(src)); Object.assign(q, { id: ++db.seqQ, status: "draft", created_by: u.name, created_at: now(), updated_at: now(), sent_at: null, approved_at: null, history: [{ t: now(), user: u.name, text: mode === "duplicate" ? "Duplicated from " + qLabel(src) : "Created from " + qLabel(src) }] });
        if (mode === "duplicate") { q.no = c.prefix + c.nextNo; c.nextNo++; jw(COMPANY, c); q.version = 1; q.option = ""; q.lead_id = null; }
        else if (mode === "version") { q.version = Math.max(...fam.filter((x) => x.option === src.option).map((x) => x.version)) + 1; }
        else { const n = fam.reduce((m, x) => Math.max(m, +(String(x.option).match(/\d+/) || [1])[0]), 1); q.option = "Option " + (n + 1); q.version = 1; fam.forEach((x) => { if (!x.option) x.option = "Option 1"; }); }
        db.quotes.push(q); log(db, u, "quote." + mode, qLabel(q), ip); return done({ ok: true, quote: { ...q, label: qLabel(q) } });
      }
      case "quote_link": { need(SALES); const q = findQ(inp.id); return { ok: true, link: qViewUrl(q, inp._host) }; }
      case "quote_send": {
        const u = need(SALES), q = findQ(inp.id), ch = String(inp.channel || ""), to = String(inp.to || "").trim(), link = qViewUrl(q, inp._host);
        if (["superseded", "rejected"].includes(q.status)) throw new Fail("This quotation is " + q.status);
        let what;
        if (ch === "email") {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Fail("Enter a valid email address");
          const pdf = String(inp.pdf || ""), bin = pdf ? Buffer.from(pdf, "base64") : null;
          if (bin && bin.slice(0, 4).toString() !== "%PDF") throw new Fail("The PDF file is not valid");
          // preview: no real SMTP, the email is written to _private/outbox/ instead
          const ob = path.join(PRIV, "outbox"); fs.mkdirSync(ob, { recursive: true }); const stem = path.join(ob, Date.now() + "-" + q.no);
          fs.writeFileSync(stem + ".txt", "To: " + to + "\nSubject: " + clip(inp.subject, 200) + "\n\n" + clip(inp.message, 5000) + "\n\nView online: " + link); if (bin) fs.writeFileSync(stem + ".pdf", bin);
          what = "Emailed to " + to + (bin ? " (PDF attached)" : "");
        } else if (ch === "whatsapp") what = "Shared on WhatsApp" + (to ? " with " + clip(to, 40) : "");
        else throw new Fail("Choose email or WhatsApp");
        q.history.push({ t: now(), user: u.name, text: what }); q.last_sent = { t: now(), channel: ch, to: clip(to, 190) };
        if (q.status === "draft") { q.status = "sent"; q.sent_at = now(); q.history.push({ t: now(), user: u.name, text: "Status: draft → sent" }); }
        log(db, u, "quote.send", qLabel(q) + " · " + ch, ip); return done({ ok: true, quote: { ...q, label: qLabel(q) }, link });
      }
      case "quote_status": {
        const u = need(SALES), q = findQ(inp.id), to = String(inp.status || "");
        if (!["draft", "sent", "approved", "rejected"].includes(to)) throw new Fail("Unknown status");
        if (q.status === "invoiced") throw new Fail("This quotation is already invoiced");
        if (to === "approved" && db.quotes.some((x) => x.no === q.no && x.id !== q.id && ["approved", "invoiced"].includes(x.status))) throw new Fail("Another version of " + q.no + " is already approved");
        const from = q.status; q.status = to; q.updated_at = now(); if (to === "sent") q.sent_at = now(); if (to === "approved") q.approved_at = now();
        q.history.push({ t: now(), user: u.name, text: `Status: ${from} → ${to}` + (inp.note ? " (" + clip(inp.note, 200) + ")" : "") });
        if (to === "approved") db.quotes.forEach((x) => { if (x.no === q.no && x.id !== q.id && ["draft", "sent"].includes(x.status)) { x.status = "superseded"; x.history.push({ t: now(), user: u.name, text: "Superseded by " + qLabel(q) }); } });
        const l = q.lead_id && db.leads.find((x) => x.id === q.lead_id);
        if (l && to === "approved" && l.stage !== "won") { l.notes.push({ t: now(), user: u.name, text: `Stage: ${l.stage} → won (${qLabel(q)} approved)`, sys: true }); l.stage = "won"; l.value = q.total; }
        if (l && to === "sent" && ["new", "contacted", "visit"].includes(l.stage)) { l.notes.push({ t: now(), user: u.name, text: `Stage: ${l.stage} → quote (${qLabel(q)} sent)`, sys: true }); l.stage = "quote"; }
        log(db, u, "quote." + to, qLabel(q), ip); return done({ ok: true, quote: { ...q, label: qLabel(q) } });
      }
      case "quote_delete": { const u = need(["owner", "admin"]), q = findQ(inp.id); if (!["draft", "rejected", "superseded"].includes(q.status)) throw new Fail("Only draft, rejected or superseded quotations can be deleted"); db.quotes = db.quotes.filter((x) => x !== q); log(db, u, "quote.delete", qLabel(q), ip); return done({ ok: true }); }
      case "quote_invoice": {
        const u = need(SALES), q = findQ(inp.id); if (q.status !== "approved") throw new Fail("Approve the quotation before converting it to an invoice");
        if (db.invoices.some((i) => i.quote_id === q.id)) throw new Fail("This quotation already has an invoice");
        let clientId = q.client_id;
        if (!clientId || !db.clients.some((c) => c.id === clientId)) { const d = q.client.phone.replace(/\D/g, ""); let c = db.clients.find((x) => (d && x.phone.replace(/\D/g, "") === d) || (q.client.email && x.email === q.client.email));
          if (!c) { c = { id: ++db.seqC, name: q.client.name, phone: q.client.phone, email: q.client.email, company: q.client.company || "", city: "Lahore", address: q.client.address, notes: "", created_at: now() }; db.clients.push(c); } clientId = c.id; q.client_id = c.id; }
        const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
        const i = { id: ++db.seqI, no: q.no, quote_id: q.id, quote_label: qLabel(q), client: { ...q.client }, client_id: clientId, project: q.project, site: q.site, sections: JSON.parse(JSON.stringify(q.sections)), subtotal: q.subtotal, discount: q.discount, rent: q.rent || 0, taxPct: q.taxPct, tax: q.tax, total: q.total, issue_date: now().slice(0, 10), due_date: due, terms: q.terms, notes: "", schedule: clip(inp.schedule, 600) || (/75%/.test(q.terms) ? "75% advance with work order, 25% on approval" : "50% advance with work order, balance on completion"), payments: [], created_by: u.name, created_at: now() };
        db.invoices.push(i); q.status = "invoiced"; q.history.push({ t: now(), user: u.name, text: "Converted to invoice " + i.no });
        if (inp.project !== false) { db.projects.push({ id: ++db.seqP, name: q.project || q.client.name, client_id: clientId, client_name: q.client.name, quote_id: q.id, invoice_id: i.id, no: q.no, site: q.site, stage: "planning", start: now().slice(0, 10), target: "", value: q.total, manager: null, updates: [{ t: now(), user: u.name, text: "Project opened from " + qLabel(q) }], photos: [], created_at: now() }); }
        log(db, u, "invoice.create", i.no + " " + i.client.name, ip); return done({ ok: true, invoice: invPub(i) });
      }
      // ---------- invoices & payments
      case "invs_list": need(SALES); return { ok: true, invoices: db.invoices.slice().reverse().map(({ sections, ...i }) => invPub({ ...i, sections: [] })) };
      case "inv_get": { need(SALES); const i = findI(inp.id); return { ok: true, invoice: invPub(i), company: companyCfg() }; }
      case "inv_save": {
        const u = need(SALES), i = findI(inp.id);
        if ("due_date" in inp) i.due_date = /^\d{4}-\d{2}-\d{2}$/.test(inp.due_date) ? inp.due_date : "";
        if ("issue_date" in inp && /^\d{4}-\d{2}-\d{2}$/.test(inp.issue_date)) i.issue_date = inp.issue_date;
        ["notes", "schedule", "terms"].forEach((k) => { if (k in inp) i[k] = clip(inp[k], 3000); }); if ("blocks" in inp) i.blocks = p18Blocks(inp.blocks); /*P18inv*/
        log(db, u, "invoice.update", i.no, ip); return done({ ok: true, invoice: invPub(i) });
      }
      case "pay_add": {
        const u = need(SALES), i = findI(inp.id), amount = Math.round(num(inp.amount)); if (!amount) throw new Fail("Enter the amount received");
        const bal = invPub(i).balance; if (amount > bal) throw new Fail("Amount is more than the balance (PKR " + bal.toLocaleString() + ")");
        const p = { id: ++db.seqPay, rcpt: i.no + "-R" + (i.payments.length + 1), date: /^\d{4}-\d{2}-\d{2}$/.test(inp.date || "") ? inp.date : now().slice(0, 10), amount, method: ["cash", "bank", "cheque", "online"].includes(inp.method) ? inp.method : "bank", ref: clip(inp.ref, 80), note: clip(inp.note, 300), by: u.name, t: now() };
        i.payments.push(p); log(db, u, "payment.add", `${i.no} PKR ${amount}`, ip); return done({ ok: true, invoice: invPub(i), payment: p });
      }
      case "pay_delete": { const u = need(["owner", "admin"]), i = findI(inp.id), p = i.payments.find((x) => x.id === +inp.pay_id); if (!p) throw new Fail("Payment not found", 404); i.payments = i.payments.filter((x) => x !== p); log(db, u, "payment.delete", `${i.no} ${p.rcpt}`, ip); return done({ ok: true, invoice: invPub(i) }); }
      // ---------- projects
      case "projs_table": {
        need(ALL); const today = now().slice(0, 10), inv = db.invoices.map(invPub), nm = (id) => (db.users.find((x) => x.id === +id) || {}).name || "";
        const rows = db.projects.map((p) => {
          const mine = inv.filter((i) => +i.project_id === p.id || (p.invoice_id && i.id === p.invoice_id)), byId = Object.fromEntries(mine.map((i) => [i.id, i]));
          const invoiced = Math.round(mine.reduce((a, i) => a + i.total, 0)), rec = Math.round(mine.reduce((a, i) => a + i.paid, 0)), value = +p.value || 0, si = PSTAGES.indexOf(p.stage), dn = ["handover", "completed"].includes(p.stage), last = p.updates[p.updates.length - 1];
          return { id: p.id, name: p.name, client_id: p.client_id || null, client_name: p.client_name || "", no: p.no || "", site: p.site || "", line: p.line || "", ptype: p.ptype || "", area: +p.area || 0, stage: p.stage, progress: si < 0 ? 0 : Math.round(si / (PSTAGES.length - 1) * 100),
            start: p.start || "", target: p.target || "", late: !dn && !!p.target && p.target < today, value, invoiced, received: rec, balance: Math.max(0, invoiced - rec), unbilled: Math.max(0, value - invoiced),
            manager: p.manager || null, manager_name: p.manager ? nm(p.manager) : "", team: p.team || [], team_names: (p.team || []).map(nm).filter(Boolean), photos: (p.photos || []).length, cover: (p.photos || []).length ? p.photos[p.photos.length - 1].url : "",
            last: last ? { t: last.t, text: last.text } : null, quote_id: p.quote_id || null, invoice_id: p.invoice_id || null,
            milestones: (p.milestones || []).map((m) => { const i = m.inv_id ? byId[m.inv_id] : null; return { ...m, amount: Math.round(value * m.pct / 100), inv_no: i ? i.no : "", paid: i ? i.paid : 0, status: !m.inv_id ? "unbilled" : !i ? "missing" : i.balance <= 0 ? "paid" : i.paid > 0 ? "partial" : "billed" }; }),
            invoices: mine.map((i) => ({ id: i.id, no: i.no, total: i.total, paid: i.paid, balance: i.balance })) };
        }).sort((a, b) => b.id - a.id);
        const k = { active: 0, value: 0, invoiced: 0, received: 0, balance: 0, late: 0 };
        rows.forEach((r) => { if (r.stage !== "completed") { k.active++; k.value += r.value; k.late += r.late ? 1 : 0; } k.invoiced += r.invoiced; k.received += r.received; k.balance += r.balance; });
        return { ok: true, projects: rows, kpi: k, stages: PSTAGES, team: db.users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })), lines: S17.lines, types: S17.projectTypes };
      }
      case "proj_meta": {
        const u = need(SALES), p = findP(inp.id);
        if ("line" in inp) p.line = S17.lines[inp.line] ? inp.line : ""; if ("ptype" in inp) p.ptype = clip(inp.ptype, 60); if ("area" in inp) p.area = Math.max(0, Math.round(num(inp.area)));
        if ("team" in inp) p.team = [...new Set((Array.isArray(inp.team) ? inp.team : []).map(Number).filter(Boolean))];
        if (inp.client_id) { const c = db.clients.find((x) => x.id === +inp.client_id); if (!c) throw new Fail("Client not found", 404); p.client_id = c.id; p.client_name = c.company || c.name; }
        log(db, u, "project.update", p.name, ip); return done({ ok: true, project: p });
      }
      case "proj_milestones": {
        const u = need(SALES), p = findP(inp.id), old = p.milestones || [], nw = []; let sum = 0;
        (Array.isArray(inp.plan) ? inp.plan : []).slice(0, 12).forEach((m, j) => { const pct = Math.round(num(m.pct) * 100) / 100; if (pct <= 0) return; sum += pct; nw.push({ label: clip(m.label, 80) || "Milestone " + (j + 1), pct, inv_id: (old[j] || {}).inv_id || null }); });
        old.forEach((m, j) => { if (m.inv_id && (!nw[j] || nw[j].inv_id !== m.inv_id || nw[j].pct !== m.pct)) throw new Fail("Milestone " + (j + 1) + " is already billed; it cannot be changed"); });
        if (nw.length && Math.abs(sum - 100) > 0.01) throw new Fail("Milestones must add up to 100% (now " + sum + "%)");
        p.milestones = nw; log(db, u, "project.milestones", p.name, ip); return done({ ok: true, project: p });
      }
      case "proj_bill": {
        const u = need(SALES), p = findP(inp.id), j = +inp.k, m = (p.milestones || [])[j];
        if (!m) throw new Fail("Milestone not found", 404); if (m.inv_id) throw new Fail("This milestone is already billed"); if (!(+p.value > 0)) throw new Fail("Set the contract value first");
        const full = p.invoice_id && db.invoices.find((x) => x.id === p.invoice_id);
        if (full) { if (full.payments.length) throw new Fail("The full contract invoice already has payments, so milestone billing cannot replace it"); if (!inp.replace) throw new Fail("REPLACE");
          db.invoices = db.invoices.filter((x) => x !== full); p.updates.push({ t: now(), user: u.name, text: "Full invoice " + full.no + " replaced by milestone invoices", sys: true }); p.invoice_id = null; }
        const line = p.line || "project"; if (!p.no) p.no = s17InvNo(line, db); const no = p.no + "-" + (j + 1); if (db.invoices.some((x) => x.no === no)) throw new Fail("Invoice " + no + " already exists");
        const amt = Math.round(p.value * m.pct / 100), [cid, cl] = s17InvClient(db, p.client_id ? { client_id: p.client_id } : { client: { company: p.client_name || p.name } });
        const i = totals({ sections: [{ name: "Milestone billing", note: "", items: [{ desc: "Milestone " + (j + 1) + ": " + m.label + " — " + m.pct + "% of contract value Rs " + p.value.toLocaleString("en-US") + " (" + p.no + ")", qty: 1, unit: "job", rate: amt, amount: amt }] }], discount: 0, taxPct: 0 });
        const d7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
        Object.assign(i, { id: ++db.seqI, no, quote_id: null, quote_label: p.no, client: cl, client_id: cid, project: p.name, project_id: p.id, site: p.site || "", issue_date: now().slice(0, 10), due_date: d7, terms: "", notes: "", schedule: "", payments: [], seqPay: 0, created_by: u.name, created_at: now(), po: "", delivery_date: "", delivered: "", line, mode: "", track_note: "Milestone " + (j + 1) + " · " + m.label });
        db.invoices.push(i); m.inv_id = i.id; p.client_id = cid; p.updates.push({ t: now(), user: u.name, text: "Invoice " + no + " raised: " + m.label + " (" + m.pct + "%) Rs " + amt.toLocaleString("en-US"), sys: true });
        log(db, u, "invoice.create", no + " milestone", ip); return done({ ok: true, invoice: s17InvRow(i), project: p });
      }
      case "projs_list": { need(ALL); return { ok: true, projects: db.projects.slice().reverse().map((p) => { const i = p.invoice_id && db.invoices.find((x) => x.id === p.invoice_id); return { ...p, paid: i ? invPub(i).paid : 0, manager_name: p.manager ? ((db.users.find((u) => u.id === p.manager) || {}).name || "") : "" }; }), stages: PSTAGES, team: db.users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })) }; }
      case "proj_save": {
        const u = need(["owner", "admin", "sales"]); let p = inp.id ? findP(inp.id) : null;
        if (!p) { const name = clip(inp.name, 160); if (!name) throw new Fail("Project name is required"); p = { id: ++db.seqP, name, client_id: null, client_name: "", quote_id: null, invoice_id: null, no: "", site: "", stage: "planning", start: now().slice(0, 10), target: "", value: 0, manager: null, updates: [{ t: now(), user: u.name, text: "Project created" }], photos: [], created_at: now() }; db.projects.push(p); }
        const before = p.stage;
        ["name", "client_name", "site"].forEach((k) => { if (k in inp) p[k] = clip(inp[k], 200) || p[k]; });
        ["start", "target"].forEach((k) => { if (k in inp) p[k] = /^\d{4}-\d{2}-\d{2}$/.test(inp[k]) ? inp[k] : ""; });
        if ("stage" in inp) { if (!PSTAGES.includes(inp.stage)) throw new Fail("Unknown stage"); p.stage = inp.stage; }
        if ("manager" in inp) p.manager = +inp.manager || null;
        if ("value" in inp) p.value = Math.round(num(inp.value));
        if (before !== p.stage) p.updates.push({ t: now(), user: u.name, text: `Stage: ${before} → ${p.stage}`, sys: true });
        log(db, u, inp.id ? "project.update" : "project.create", p.name, ip); return done({ ok: true, project: p });
      }
      case "proj_update": { const u = need(ALL), p = findP(inp.id), t = clip(inp.text, 2000); if (!t) throw new Fail("Write an update first"); p.updates.push({ t: now(), user: u.name, text: t }); log(db, u, "project.note", p.name, ip); return done({ ok: true, project: p }); }
      case "proj_photo": {
        const u = need(ALL), p = findP(inp.id), m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(inp.data || ""));
        if (!m) throw new Fail("Only JPG, PNG or WebP photos"); const buf = Buffer.from(m[2], "base64"); if (buf.length > 6 * 1024 * 1024) throw new Fail("Photo is larger than 6 MB");
        const magic = buf.slice(0, 4).toString("hex"); if (!/^(ffd8ff|89504e47|52494646)/.test(magic)) throw new Fail("That file is not an image");
        const dir = path.join(ROOT, "assets/uploads/projects"); fs.mkdirSync(dir, { recursive: true });
        const name = `p${p.id}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`; fs.writeFileSync(path.join(dir, name), buf);
        const ph = { url: "/assets/uploads/projects/" + name, caption: clip(inp.caption, 200), stage: p.stage, t: now(), by: u.name }; p.photos.push(ph);
        log(db, u, "project.photo", p.name, ip); return done({ ok: true, project: p });
      }
      case "proj_photo_delete": { const u = need(["owner", "admin", "sales"]), p = findP(inp.id), ph = p.photos.find((x) => x.url === inp.url); if (!ph) throw new Fail("Photo not found", 404); p.photos = p.photos.filter((x) => x !== ph); try { fs.unlinkSync(path.join(ROOT, ph.url)); } catch {} return done({ ok: true, project: p }); }
      case "proj_delete": { const u = need(["owner", "admin"]), p = findP(inp.id); db.projects = db.projects.filter((x) => x !== p); log(db, u, "project.delete", p.name, ip); return done({ ok: true }); }
    }
    return null;
  }

  // =================================================================== A6 — content collections (blog, portfolio, testimonials, team, FAQs) + AI
  const CMS = path.join(PRIV, "content.json");
  const CTYPES = ["post", "study", "testimonial", "member", "faq", "city"];
  const PAGE_TYPES = { post: "insights", study: "projects" };
  const AI_DEF = { customKey: "", customModel: "", customUrl: "", provider: "anthropic", anthropicKey: "", anthropicModel: "claude-sonnet-4-5", openaiKey: "", openaiModel: "gpt-4o-mini", openrouterKey: "", openrouterModel: "nousresearch/hermes-3-llama-3.1-405b", voice: "Calm, plain, confident British English. Short sentences. No hype, no exclamation marks. Woodex Interior is a design, fit-out and renovation studio in Lahore, Pakistan." };
  const AI_SECRETS = ["anthropicKey", "openaiKey", "openrouterKey", "customKey"];
  const cmsLoad = () => { const c = jr(CMS, {}); c.items = c.items || []; c.seq = c.seq || 0; c.ai = Object.assign({}, AI_DEF, c.ai || {}); return c; };
  const aiPub = (a) => { const o = { ...a }; AI_SECRETS.forEach((k) => { o[k + "Set"] = !!a[k]; o[k] = ""; }); return o; };
  const cmsBackup = (rel) => { const abs = path.join(ROOT, rel); if (!fs.existsSync(abs)) return; const d = path.join(PRIV, "backups", rel.replace(/[^a-z0-9]+/gi, "_")); fs.mkdirSync(d, { recursive: true }); const t = new Date(), p = (n, l = 2) => String(n).padStart(l, "0"); fs.copyFileSync(abs, path.join(d, `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}-${p(t.getMilliseconds(), 3)}.html`)); };
  const cmsRelOk = (rel, type) => new RegExp("^" + PAGE_TYPES[type] + "/[a-z0-9][a-z0-9-]{0,59}/index\\.html$").test(rel);
  const htmlOk = (h) => typeof h === "string" && h.length < 3 * 1024 * 1024 && /<html/i.test(h) && /<\/html>/i.test(h) && !/<[^>]+\s(contenteditable|data-wx-ed)[\s=>]/i.test(h);
  const sitemapAdd = (rel) => { const f = path.join(ROOT, "sitemap.xml"); if (!fs.existsSync(f)) return; const loc = "https://woodex.com.pk/" + rel.replace(/index\.html$/, ""); let x = fs.readFileSync(f, "utf8"); if (x.includes("<loc>" + loc + "</loc>") || !x.includes("</urlset>")) return; fs.writeFileSync(f, x.replace("</urlset>", "  <url><loc>" + loc + "</loc></url>\n</urlset>")); };
  const sitemapDel = (rel) => { const f = path.join(ROOT, "sitemap.xml"); if (!fs.existsSync(f)) return; const loc = "https://woodex.com.pk/" + rel.replace(/index\.html$/, ""); const x = fs.readFileSync(f, "utf8"), y = x.replace(new RegExp("[ \\t]*<url><loc>" + loc.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "</loc>[\\s\\S]*?</url>\\n?"), ""); if (y !== x) fs.writeFileSync(f, y); };
  const sitemapSync = (rel, it) => (((it.data || {}).visibility === "unlisted") ? sitemapDel(rel) : sitemapAdd(rel));
  /** Publish scheduled items whose time has come. Runs on every admin request (and can be hit by cron). */
  function cmsTick(db) {
    const c = cmsLoad(), t = now(); let n = 0;
    for (const it of c.items) {
      if (it.status !== "scheduled" || !it.publishAt || it.publishAt > t) continue;
      if (it.pending && PAGE_TYPES[it.type]) {
        const { rel, html, card } = it.pending; if (!cmsRelOk(rel, it.type) || !htmlOk(html)) { it.status = "draft"; it.error = "Scheduled page was invalid"; continue; }
        const abs = path.join(ROOT, rel); cmsBackup(rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, html);
        const li = path.join(ROOT, PAGE_TYPES[it.type], "index.html"), href = "/" + rel.replace(/index\.html$/, "");
        if (card && fs.existsSync(li)) { let L = fs.readFileSync(li, "utf8"); if (!L.includes('href="' + href + '"')) { const m = L.match(/<div class="hx-cards">/); if (m) { cmsBackup(PAGE_TYPES[it.type] + "/index.html"); L = L.replace(m[0], m[0] + "\n" + card); fs.writeFileSync(li, L); } } }
        it.rel = rel; delete it.pending; sitemapSync(rel, it);
      }
      it.status = "published"; it.published_at = t; n++; if (db) log(db, null, "content.autopublish", it.title);
    }
    if (n) jw(CMS, c); return n;
  }
  async function aiCall(a, system, user) {
    const p = a.provider, key = a[p + "Key"], model = a[p + "Model"];
    if (!key && !(p === "custom" && a.customUrl)) throw new Fail("Add an API key for " + ({ anthropic: "Claude", openai: "OpenAI", openrouter: "OpenRouter" }[p] || p) + " in Content → AI settings");
    let r, j;
    try {
      if (p === "anthropic") { r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: 6000, system, messages: [{ role: "user", content: user }] }), signal: AbortSignal.timeout(60000) }); j = await r.json(); if (!r.ok) throw new Error(j.error && j.error.message || r.status); return (j.content || []).map((x) => x.text || "").join(""); }
      const url = p === "custom" ? String(a.customUrl).replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/chat/completions" : p === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
      r = await fetch(url, { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json", "HTTP-Referer": "https://woodex.com.pk", "X-Title": "Woodex Admin" }, body: JSON.stringify({ model, max_tokens: 6000, messages: [{ role: "system", content: system }, { role: "user", content: user }] }), signal: AbortSignal.timeout(60000) });
      j = await r.json(); if (!r.ok) throw new Error(j.error && j.error.message || r.status); return j.choices[0].message.content || "";
    } catch (e) { throw new Fail("AI request failed: " + String(e.message || e).slice(0, 200), 502); }
  }
  const AI_TASKS = {
    outline: (i) => `Write a full blog article for the Woodex website.\nTitle: ${i.title}\nNotes from the team: ${i.notes || "(none)"}\nReturn ONLY JSON: {"dek":"one-sentence standfirst","blocks":[{"t":"h","text":"..."},{"t":"p","text":"..."},{"t":"list","items":["**Label:** text"]}],"summary":["three short takeaways"],"faqs":[{"q":"...","a":"..."}],"quote":"one pull quote"}. 5-7 sections, each a heading plus 1-2 paragraphs. Use **bold** sparingly. Prices in PKR where relevant.`,
    meta: (i) => `Write SEO metadata for this page.\nTitle: ${i.title}\nText: ${String(i.text || "").slice(0, 4000)}\nReturn ONLY JSON: {"title":"max 60 characters, ends with | Woodex Interior","desc":"140-158 characters"}`,
    alt: (i) => `Write alt text (max 110 characters, no "image of") for a photo on the Woodex website. File: ${i.file || ""}. Context: ${i.context || ""}. Return only the alt text.`,
    improve: (i) => `Rewrite this paragraph to be clearer and tighter, same meaning and length or shorter. Return only the paragraph.\n\n${String(i.text || "").slice(0, 3000)}`,
    excerpt: (i) => `Write a card summary (max 150 characters) for this page. Return only the text.\nTitle: ${i.title}\n${String(i.text || "").slice(0, 3000)}`,
    city: (i) => `You are localising a Woodex city landing page from ${i.source} to ${i.city}, Pakistan. The studio is based in Lahore and serves ${i.city} with site visits.\nRewrite each string for ${i.city}: mention real ${i.city} areas/neighbourhoods where natural, keep facts honest (the studio and showroom are in Lahore, not in ${i.city}), keep roughly the same length, keep **bold** markers and [link](url) markup unchanged.\nReturn ONLY a JSON array of exactly ${(i.texts || []).length} strings in the same order.\n\n${JSON.stringify((i.texts || []).slice(0, 120)).slice(0, 14000)}`,
    faqs: (i) => `Write 4 FAQs a Pakistani client would ask about: ${i.title}.\nContext: ${String(i.text || "").slice(0, 3000)}\nReturn ONLY JSON: [{"q":"...","a":"1-3 sentences"}]`,
  };
  const BIZ_DEF = { email: "info@woodex.com.pk", phone1: "+92 322 4000768", phone2: "", wa: "+92 322 4000768", addr1: "M-71, Zainab Tower", addr2: "Model Town Link Road", city: "Lahore", country: "Pakistan", days: "Mon–Sat", open: "10:00", close: "19:30", facebook: "", instagram: "", linkedin: "", youtube: "", tiktok: "", pinterest: "", x: "" };
  const BIZ_ASSETS = ["assets/site.js", "assets/js/whatsapp-widget.js"];
  const safeRel = (r) => typeof r === "string" && /^[a-z0-9][a-z0-9/_\-.]*\.html$/i.test(r) && !r.includes("..") && !/^(_private|builder|admin|api|assets)\//.test(r);
  const cityRelOk = (r) => typeof r === "string" && /^[a-z0-9][a-z0-9-]{0,59}\/index\.html$/.test(r) && !/^(builder|admin|api|assets|insights|projects)\//.test(r);
  async function a6(action, inp, need, db, ip) {
    if (!/^(cms_|ai_|sheets_)/.test(action)) return null;
    const ED = ["owner", "admin", "editor"], OA = ["owner", "admin"];
    const c = cmsLoad(), done = (o) => { jw(CMS, c); save(db); return o; };
    const find = (id) => { const it = c.items.find((x) => x.id === +id); if (!it) throw new Fail("Item not found", 404); return it; };
    switch (action) {
      case "cms_tpl_list": { need(ED); return { ok: true, tpls: c.tpls || [] }; }
      case "cms_tpl_save": {
        const u = need(ED), t = inp.tpl || {}, type = String(t.type || ""); if (!["post", "study", "city"].includes(type)) throw new Fail("Unknown template type");
        const name = clip(t.name, 60); if (!name) throw new Fail("Give the template a name");
        const o = { type, name, desc: clip(t.desc, 200), default: !!t.default };
        if (type === "city") { o.source = /^[a-z0-9-]{1,60}$/.test(t.source || "") ? t.source : ""; o.order = (t.order || []).slice(0, 30).filter((x) => x && /^[a-z0-9_-]{1,60}$/i.test(x.id || "")).map((x) => ({ id: x.id, on: !!x.on, label: clip(x.label, 60) })); if (!o.order.length) throw new Fail("Pick the sections for this city template"); }
        else { const SEC = ["body", "summary", "faqs", "quote", "related"]; o.hero = ["image", "navy", "media"].includes(t.hero) ? t.hero : "image"; o.toc = !!t.toc; o.meta = "meta" in t ? !!t.meta : true; o.facts = "facts" in t ? !!t.facts : true;
          const seen = new Set(); o.sections = []; for (const x of t.sections || []) if (SEC.includes(x.k) && !seen.has(x.k)) { seen.add(x.k); o.sections.push({ k: x.k, on: !!x.on }); } for (const k of SEC) if (!seen.has(k)) o.sections.push({ k, on: true }); }
        const L = c.tpls = c.tpls || []; const k = L.findIndex((x) => x.id === +t.id); if (k < 0 && L.length >= 60) throw new Fail("Too many templates");
        o.id = k >= 0 ? +t.id : (c.tplSeq = (c.tplSeq || 0) + 1); o.updated_at = now(); o.by = u.name;
        if (o.default) L.forEach((x) => { if (x.type === type) x.default = false; });
        if (k >= 0) L[k] = o; else L.push(o); log(db, u, "template.save", type + ": " + name, ip); return done({ ok: true, tpl: o, tpls: L });
      }
      case "cms_tpl_delete": { const u = need(ED), id = +inp.id; c.tpls = (c.tpls || []).filter((x) => x.id !== id); (c.items || []).forEach((x) => { if (x.data && +x.data.tpl === id) delete x.data.tpl; }); log(db, u, "template.delete", "#" + id, ip); return done({ ok: true, tpls: c.tpls }); }
      case "cms_page_kinds": { need(ED); const out = {}; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const a = path.join(d, f.name); if (f.isDirectory()) { if (!/^(_private|builder|admin|api|assets|node_modules)$/.test(f.name) || d !== ROOT) walk(a); } else if (f.name.endsWith(".html")) { const rel = path.relative(ROOT, a).split(path.sep).join("/"); if (!safeRel(rel)) continue; const m = /<body[^>]*data-page="([^"]*)"/i.exec(fs.readFileSync(a, "utf8").slice(0, 400000)); out[rel] = m ? m[1] : ""; } } }; walk(ROOT); return { ok: true, kinds: out }; }
      case "cms_sitemap_add": { need(ED); const rel = String(inp.rel || ""); if (!safeRel(rel) || !fs.existsSync(path.join(ROOT, rel))) throw new Fail("Page not found"); sitemapAdd(rel); return { ok: true }; }
      case "cms_biz_get": { need(ED); return { ok: true, biz: Object.assign({}, BIZ_DEF, c.biz || {}), applied: Object.assign({}, BIZ_DEF, c.bizApplied || {}) }; }
      case "cms_announce_get": { need(ED); const f = path.join(ROOT, "assets/announce.json"); return { ok: true, ann: Object.assign({ on: false, text: "", link: "", linkText: "", style: "navy" }, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}) }; }
      case "cms_announce_save": { const u = need(OA), a = inp.ann || {}; const o = { on: !!a.on, text: clip(a.text, 160), link: clip(a.link, 300), linkText: clip(a.linkText, 40), style: ["navy", "wood", "cream"].includes(a.style) ? a.style : "navy", v: Math.floor(Date.now() / 1000) };
        if (o.on && !o.text) throw new Fail("Write the announcement text"); if (o.link && !/^(\/[^\s"<>]*|https:\/\/[^\s"<>]+|tel:\+?[0-9 ]+|mailto:[^\s"<>]+)$/.test(o.link)) throw new Fail("The link must start with /, https://, tel: or mailto:");
        fs.writeFileSync(path.join(ROOT, "assets/announce.json"), JSON.stringify(o)); log(db, u, "announce.save", o.on ? "on" : "off", ip); return { ok: true, ann: o }; }
      case "sheets_get": { need(OA); return done({ ok: true, cfg: Object.assign({ url: "", on: false, last: "", lastErr: "" }, c.sheets || {}) }); }
      case "sheets_save": { const u = need(OA), url = String(inp.url || "").trim(); if (url && !/^https:\/\/script\.google(usercontent)?\.com\/[A-Za-z0-9/_\-.?=&]+$/.test(url)) throw new Fail("Paste the Apps Script web app URL (it starts with https://script.google.com/)"); c.sheets = Object.assign({}, c.sheets || {}, { url, on: !!inp.on && !!url }); log(db, u, "sheets.save", "", ip); return done({ ok: true, cfg: c.sheets }); }
      case "sheets_test": case "sheets_sync": { need(OA); if (!(c.sheets || {}).url) throw new Fail("Save the web app URL first"); throw new Fail("The preview cannot reach Google. This works on your Hostinger site."); }
      case "cms_biz_save": {
        const u = need(OA), b = inp.biz || {}, o = {}; for (const k of Object.keys(BIZ_DEF)) o[k] = clip(b[k], 160) || BIZ_DEF[k];
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) throw new Fail("Check the email address");
        for (const k of ["phone1", "phone2", "wa"]) if (o[k].replace(/\D/g, "").length < 10) throw new Fail("Check the phone numbers (use +92 format)");
        for (const k of ["facebook", "instagram", "linkedin", "youtube", "tiktok", "pinterest", "x"]) if (o[k] && !/^https:\/\/[^\s"<>]+$/.test(o[k])) throw new Fail("Social links must start with https://");
        if (!/^\d{2}:\d{2}$/.test(o.open) || !/^\d{2}:\d{2}$/.test(o.close)) throw new Fail("Check the opening hours");
        c.biz = o; if (inp.applied) c.bizApplied = { ...o }; log(db, u, inp.applied ? "business.apply" : "business.save", "", ip); return done({ ok: true, biz: o, applied: Object.assign({}, BIZ_DEF, c.bizApplied || {}) });
      }
      case "cms_biz_assets": {
        const u = need(OA), pairs = (Array.isArray(inp.pairs) ? inp.pairs : []).filter((p) => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string" && p[0].length >= 4 && p[0].length < 200 && p[1].length < 200 && !/[<>\\`]/.test(p[1]));
        let n = 0; for (const rel of BIZ_ASSETS) { const f = path.join(ROOT, rel); if (!fs.existsSync(f)) continue; let x = fs.readFileSync(f, "utf8"); const before = x; for (const [a, b2] of pairs) x = x.split(a).join(b2); if (x !== before) { cmsBackup(rel); fs.writeFileSync(f, x); n++; } }
        log(db, u, "business.assets", n + " files", ip); return { ok: true, files: n };
      }
      case "cms_list": { need(ED); const ty = CTYPES.includes(inp.type) ? inp.type : null; return { ok: true, items: c.items.filter((x) => !ty || x.type === ty).map(({ pending, ...x }) => ({ ...x, hasPending: !!pending })).reverse(), aiReady: !!c.ai[c.ai.provider + "Key"] }; }
      case "cms_get": { need(ED); const { pending, ...it } = find(inp.id); return { ok: true, item: it }; }
      case "cms_save": {
        const u = need(ED), type = String(inp.type || ""); if (!CTYPES.includes(type)) throw new Fail("Unknown content type");
        const title = clip(inp.title, 160); if (!title) throw new Fail(type === "testimonial" || type === "member" ? "Name is required" : "Title is required");
        const data = inp.data && typeof inp.data === "object" ? inp.data : {}; if (JSON.stringify(data).length > 400000) throw new Fail("Content is too large");
        let it = inp.id ? find(inp.id) : null;
        const slug = PAGE_TYPES[type] ? String(inp.slug || "").toLowerCase() : "";
        if (PAGE_TYPES[type]) {
          if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) throw new Fail("Page address: lowercase letters, numbers and dashes only");
          if (it && it.rel && it.slug !== slug) throw new Fail("The address of a published page cannot be changed");
          if (c.items.some((x) => x.type === type && x.slug === slug && x !== it)) throw new Fail("Another item already uses that address");
          if (!it || !it.rel) { const rel = PAGE_TYPES[type] + "/" + slug + "/index.html"; if (fs.existsSync(path.join(ROOT, rel)) && !(inp.claim === rel)) throw new Fail("A page already exists at /" + PAGE_TYPES[type] + "/" + slug + "/"); }
        }
        if (type === "city") { const cs = String(inp.slug || "").toLowerCase(); if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(cs)) throw new Fail("Page address: lowercase letters, numbers and dashes only"); if ((!it || !it.rel) && fs.existsSync(path.join(ROOT, cs, "index.html"))) throw new Fail("A page already exists at /" + cs + "/"); if (c.items.some((x) => x.type === "city" && x.slug === cs && x !== it)) throw new Fail("Another draft already uses that address"); inp.slug = cs; }
        if (!it) { it = { id: ++c.seq, type, status: "draft", created_at: now(), created_by: u.name, rel: null }; c.items.push(it); }
        Object.assign(it, { title, slug: type === "city" ? inp.slug : slug, data, seo: { title: clip(inp.seo && inp.seo.title, 90), desc: clip(inp.seo && inp.seo.desc, 200), og: clip(inp.seo && inp.seo.og, 300) }, order: +inp.order || 0, updated_at: now(), updated_by: u.name });
        if (inp.claim && PAGE_TYPES[type] && inp.claim === PAGE_TYPES[type] + "/" + slug + "/index.html") { it.rel = inp.claim; it.status = "published"; it.imported = true; }
        const st = String(inp.status || "");
        if (st === "draft" && it.status === "scheduled") { it.status = "draft"; delete it.pending; }
        if (st === "scheduled") {
          const at = String(inp.publishAt || "").replace("T", " ").slice(0, 16); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at)) throw new Fail("Pick a publish date and time");
          if (it.rel) throw new Fail("This item is already live. Just publish your changes.");
          if (PAGE_TYPES[type]) { const p = inp.pending || {}; if (!cmsRelOk(p.rel, type) || !htmlOk(p.html)) throw new Fail("Could not prepare the scheduled page"); it.pending = { rel: p.rel, html: p.html, card: clip(p.card, 4000) }; }
          it.status = "scheduled"; it.publishAt = at + ":00";
        }
        if (st === "published" && !PAGE_TYPES[type]) { it.status = "published"; it.published_at = it.published_at || now(); }
        log(db, u, "content.save", type + ": " + title, ip); return done({ ok: true, item: it });
      }
      case "cms_published": { // called by the browser after it wrote the page with the builder API
        const u = need(ED), it = find(inp.id); if (!PAGE_TYPES[it.type] && it.type !== "city") throw new Fail("Not a page item");
        const rel = String(inp.rel || ""); if (!(it.type === "city" ? cityRelOk(rel) : cmsRelOk(rel, it.type)) || !fs.existsSync(path.join(ROOT, rel))) throw new Fail("Page was not written");
        it.rel = rel; it.status = "published"; it.published_at = it.published_at || now(); delete it.pending; it.publishAt = null; if (it.type === "city") it.data = { source: (it.data || {}).source || "" }; sitemapSync(rel, it);
        log(db, u, "content.publish", it.title, ip); return done({ ok: true, item: it });
      }
      case "cms_status": { const u = need(ED), it = find(inp.id); if (PAGE_TYPES[it.type]) throw new Fail("Use Publish for pages"); it.status = inp.status === "published" ? "published" : "draft"; log(db, u, "content." + it.status, it.title, ip); return done({ ok: true, item: it }); }
      case "cms_reorder": { need(ED); (Array.isArray(inp.ids) ? inp.ids : []).forEach((id, n) => { const it = c.items.find((x) => x.id === +id); if (it) it.order = n + 1; }); return done({ ok: true }); }
      case "cms_delete": { const u = need(OA), it = find(inp.id); if (it.rel) throw new Fail("This page is live. Pages cannot be deleted; edit it instead."); c.items = c.items.filter((x) => x !== it); log(db, u, "content.delete", it.title, ip); return done({ ok: true }); }
      case "cms_placements": { need(ED); return { ok: true, placements: c.placements || { testimonial: ["index.html", "about/index.html"], member: ["about/index.html"] } }; }
      case "cms_placements_save": { const u = need(OA), p = inp.placements || {}; c.placements = {}; ["testimonial", "member"].forEach((k) => { c.placements[k] = (Array.isArray(p[k]) ? p[k] : []).filter((r) => /^[a-z0-9][a-z0-9/_\-.]*\.html$/i.test(r) && !r.includes("..") && !/^(_private|builder|admin|api|assets)\//.test(r)).slice(0, 80); const st = p[k + "Set"] || {}; c.placements[k + "Set"] = { kicker: clip(st.kicker, 60), heading: clip(st.heading, 120) }; if (k === "testimonial") { const D = ["cards", "spotlight", "slider", "wall", "band"], o = c.placements[k + "Set"]; o.design = D.includes(st.design) ? st.design : "cards"; o.max = Math.max(0, Math.min(30, +st.max || 0)); o.designs = {}; for (const [pg, dv] of Object.entries(st.designs || {})) if (c.placements[k].includes(pg) && D.includes(dv)) o.designs[pg] = dv; } }); log(db, u, "content.placements", "", ip); return done({ ok: true, placements: c.placements }); }
      case "cms_ai_get": need(OA); return { ok: true, ai: aiPub(c.ai) };
      case "cms_ai_save": {
        const u = need(OA), s = inp.ai || {};
        for (const k of Object.keys(AI_DEF)) { if (!(k in s)) continue; if (AI_SECRETS.includes(k) && s[k] === "" && !s[k + "Clear"]) continue; c.ai[k] = clip(s[k], k === "voice" ? 800 : 300); }
        if (!["anthropic", "openai", "openrouter", "custom"].includes(c.ai.provider)) c.ai.provider = "anthropic";
        log(db, u, "settings.ai", c.ai.provider, ip); return done({ ok: true, ai: aiPub(c.ai) });
      }
      case "ai_run": {
        const u = need(ED), task = String(inp.task || ""); if (!AI_TASKS[task]) throw new Fail("Unknown AI task");
        const text = await aiCall(c.ai, "You write website copy for Woodex Interior. " + c.ai.voice, AI_TASKS[task](inp.input || {}));
        log(db, u, "ai." + task, "", ip); save(db); return { ok: true, text };
      }
      case "cms_ai_models": { need(OA); const p = inp.provider || c.ai.provider; let key = String(inp.key || "").trim() || c.ai[p + "Key"] || ""; if (key === "none") key = "";
        const base = (String(inp.url || "").trim() || c.ai.customUrl || "").replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
        if (p === "custom" && !/^https?:\/\//i.test(base)) throw new Fail("Enter the endpoint URL first (e.g. https://your-tunnel.example.com/v1)");
        if (!key && p !== "custom" && p !== "openrouter") throw new Fail("Enter the API key first");
        const url = { anthropic: "https://api.anthropic.com/v1/models?limit=100", openai: "https://api.openai.com/v1/models", openrouter: "https://openrouter.ai/api/v1/models", custom: base + "/models" }[p];
        const h = p === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : key ? { authorization: "Bearer " + key } : {};
        let j; try { const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(15000) }); j = await r.json().catch(() => ({})); if (!r.ok) throw new Fail("Provider said: " + (j.error?.message || "HTTP " + r.status), 502); } catch (e) { if (e instanceof Fail) throw e; throw new Fail("Could not reach the provider: " + (e.cause?.code || e.message), 502); }
        const ids = [...new Set((j.data || j.models || []).map(m => String(m.id || m.name || "")).filter(id => id && !(p === "openai" && !/^(gpt|o\d|chatgpt)/.test(id)) && !/(embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search)/i.test(id)))];
        if (!ids.length) throw new Fail("No chat models returned by this provider");
        const pref = { anthropic: ["claude-sonnet-4", "claude-3-7-sonnet"], openai: ["gpt-4.1-mini", "gpt-4o-mini"], openrouter: ["anthropic/claude-sonnet-4", "openai/gpt-4o-mini"], custom: [] }[p] || [];
        let best = ids[0]; outer: for (const w of pref) for (const id of ids) if (id.startsWith(w)) { best = id; break outer; }
        if (p !== "anthropic") ids.sort(); return { ok: true, models: ids.slice(0, 400), recommended: best }; }
      case "ai_test": { need(OA); const t = await aiCall(c.ai, "Reply with one word.", "Say OK."); return { ok: true, text: t.slice(0, 60) }; }
    }
    return null;
  }

  // ================================================================== A7: media library, site backups, site health
  const MEDIA = path.join(PRIV, "media.json"), MTRASH = path.join(PRIV, "media-trash"), SBK = path.join(PRIV, "site-backups"), HEALTH = path.join(PRIV, "health.json");
  const IMG_DIRS = ["assets/img", "assets/uploads"], IMG_RE = /\.(webp|jpe?g|png|gif|svg|avif)$/i, SITE_URL = "https://woodex.com.pk";
  const sniff = (b) => b[0] === 0xff && b[1] === 0xd8 ? "jpg" : b[0] === 0x89 && b[1] === 0x50 ? "png" : b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" ? "webp" : b.slice(0, 3).toString() === "GIF" ? "gif" : null;
  const mediaRelOk = (u) => typeof u === "string" && /^\/assets\/(img|uploads)\/([a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*\.(webp|jpe?g|png|gif|svg|avif)$/i.test(u) && !u.includes("..");
  const walkFiles = (dir, test, out = [], skipRoot = null) => { if (!fs.existsSync(dir)) return out; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const a = path.join(dir, f.name); if (f.isDirectory()) { if (skipRoot && dir === ROOT && skipRoot.test(f.name)) continue; walkFiles(a, test, out, skipRoot); } else if (test(f.name)) out.push(a); } return out; };
  const relOf = (a) => path.relative(ROOT, a).split(path.sep).join("/");
  const htmlPages = () => walkFiles(ROOT, (n) => n.endsWith(".html"), [], /^(_private|builder|admin|api|assets|node_modules)$/).map(relOf);
  /** Text of everything that can reference an image: pages, CSS/JS, stored content (drafts, company logo…). */
  function usageCorpus() {
    const parts = htmlPages().map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")]);
    for (const a of walkFiles(path.join(ROOT, "assets"), (n) => /\.(css|js)$/.test(n))) parts.push([relOf(a), fs.readFileSync(a, "utf8")]);
    for (const f of fs.existsSync(PRIV) ? fs.readdirSync(PRIV).filter((n) => n.endsWith(".json") && !/^(media|health|admin-db|crm|db|config|redirects)\.json$/.test(n)) : []) parts.push(["_private/" + f, fs.readFileSync(path.join(PRIV, f), "utf8")]);
    return parts;
  }
  const mediaLoad = () => { const m = jr(MEDIA, {}); m.alt = m.alt || {}; m.trash = m.trash || []; m.seq = m.seq || 0; return m; };
  function backupOne(kind, u) {
    fs.mkdirSync(SBK, { recursive: true });
    const t = new Date(), p = (n) => String(n).padStart(2, "0"), name = `${kind}-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.tar.gz`;
    const list = [...htmlPages(), "sitemap.xml", "robots.txt", ".htaccess", "assets/site.js", "assets/js", "assets/v1-p21.css"].filter((r) => fs.existsSync(path.join(ROOT, r)));
    if (fs.existsSync(PRIV)) for (const f of fs.readdirSync(PRIV)) if (!/^(backups|site-backups|media-trash|trash)$/.test(f)) list.push("_private/" + f);
    if (kind !== "daily") list.push(...IMG_DIRS.filter((d) => fs.existsSync(path.join(ROOT, d))));
    const lf = path.join(SBK, ".list"); fs.writeFileSync(lf, list.join("\n"));
    execFileSync("tar", ["czf", path.join(SBK, name), "-C", ROOT, "-T", lf]); fs.unlinkSync(lf);
    // retention: 7 daily, 4 weekly, 10 manual, 3 safety
    const keep = { daily: 7, weekly: 4, full: 10, safety: 3 };
    for (const k of Object.keys(keep)) { const fsx = fs.readdirSync(SBK).filter((f) => f.startsWith(k + "-")).sort(); while (fsx.length > keep[k]) fs.unlinkSync(path.join(SBK, fsx.shift())); }
    return { name, size: fs.statSync(path.join(SBK, name)).size, by: u ? u.name : "cron" };
  }
  const bkList = () => (fs.existsSync(SBK) ? fs.readdirSync(SBK).filter((f) => /^(daily|weekly|full|safety|upload)-\d{8}-\d{6}\.(tar\.gz|zip)$/.test(f)).sort().reverse().map((f) => { const s = fs.statSync(path.join(SBK, f)); return { name: f, kind: f.split("-")[0], size: s.size, at: s.mtime.toISOString().slice(0, 19).replace("T", " ") }; }) : []);
  function backupAuto() {
    const l = bkList(), age = (k) => { const b = l.find((x) => x.kind === k); return b ? (Date.now() - fs.statSync(path.join(SBK, b.name)).mtimeMs) / 36e5 : 1e9; };
    const made = []; if (age("daily") > 20) made.push(backupOne("daily").name); if (age("weekly") > 24 * 6.5) made.push(backupOne("weekly").name);
    const h = jr(HEALTH, {}); h.lastCron = now(); jw(HEALTH, h); return made;
  }
  // ---- health scan
  function healthScan() {
    const redir = jr(REDIR, []).map((r) => r.from.replace(/\/$/, "")), pages = htmlPages(), issues = [], titles = {}, sizeCache = {};
    const fileFor = (href) => { let p = decodeURIComponent(href.split(/[?#]/)[0]); if (!p || p === "/") return "index.html"; p = p.replace(/^\/+/, ""); if (p.endsWith("/")) return p + "index.html"; return /\.[a-z0-9]+$/i.test(p) ? p : p + "/index.html"; };
    const add = (rel, type, sev, msg, extra) => issues.push({ rel, type, sev, msg, ...(extra || {}) });
    for (const rel of pages) {
      if (rel === "404.html") continue;
      const h = fs.readFileSync(path.join(ROOT, rel), "utf8"), attr = (tag, a) => { const m = new RegExp("\\s" + a + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag); return m ? m[1] : null; };
      const title = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || "").trim(), desc = attr((/<meta[^>]+name="description"[^>]*>/i.exec(h) || [""])[0], "content");
      if (!title) add(rel, "seo", 3, "Missing page title"); else { if (title.length > 65) add(rel, "seo", 1, `Title is long (${title.length} characters, aim for 60)`); if (title.length < 20) add(rel, "seo", 1, "Title is very short"); (titles[title] = titles[title] || []).push(rel); }
      if (!desc) add(rel, "seo", 2, "Missing meta description"); else if (desc.length > 165) add(rel, "seo", 1, `Description is long (${desc.length}, aim for 150-158)`); else if (desc.length < 70) add(rel, "seo", 1, `Description is short (${desc.length})`);
      const main = h.replace(/<script[\s\S]*?<\/script>/gi, ""), h1 = (main.match(/<h1[\s>]/gi) || []).length;
      if (h1 === 0) add(rel, "seo", 2, "No main heading (H1)"); else if (h1 > 1) add(rel, "seo", 1, `${h1} main headings (H1), use one`);
      if (!/<link[^>]+rel="canonical"/i.test(h)) add(rel, "seo", 1, "No canonical link");
      let noAlt = 0; for (const m of main.matchAll(/<img\b[^>]*>/gi)) { const a = attr(m[0], "alt"); if ((a === null || !a.trim()) && !/aria-hidden="true"|role="presentation"/.test(m[0])) noAlt++; }
      if (noAlt) add(rel, "alt", 2, `${noAlt} image(s) without alt text`, { count: noAlt });
      const seen = new Set();
      for (const m of main.matchAll(/\shref="(\/[^"]*)"/gi)) { const href = m[1]; if (/^\/\/|^\/(api|admin|builder)\//.test(href) || seen.has(href)) continue; seen.add(href); const f = fileFor(href); if (!fs.existsSync(path.join(ROOT, f)) && !redir.includes(href.split(/[?#]/)[0].replace(/\/$/, ""))) add(rel, "link", 3, "Broken link: " + href, { target: href }); }
      for (const m of main.matchAll(/\s(?:src|href|content)="((?:https:\/\/woodex\.com\.pk)?\/assets\/[^"]+\.(?:webp|jpe?g|png|gif|svg|avif))"/gi)) {
        const u = m[1].replace(SITE_URL, ""), f = path.join(ROOT, u.split("?")[0]); if (seen.has(u)) continue; seen.add(u);
        if (!fs.existsSync(f)) { add(rel, "image", 3, "Missing image: " + u, { target: u }); continue; }
        const sz = sizeCache[u] ?? (sizeCache[u] = fs.statSync(f).size); if (sz > 350 * 1024) add(rel, "image", 1, `Large image ${u.split("/").pop()} (${Math.round(sz / 1024)} KB)`, { target: u, size: sz });
      }
    }
    for (const [t, rels] of Object.entries(titles)) if (rels.length > 1) rels.forEach((r) => add(r, "seo", 1, `Same title as ${rels.length - 1} other page(s)`));
    const pen = issues.reduce((a, i) => a + (i.sev === 3 ? 3 : i.sev === 2 ? 1.2 : 0.35), 0), score = Math.max(0, Math.min(100, Math.round(100 - pen * 100 / (pages.length * 4))));
    return { score, pages: pages.length, at: now(), issues, counts: ["seo", "alt", "link", "image"].reduce((o, k) => (o[k] = issues.filter((i) => i.type === k).length, o), {}) };
  }

  /* P18 C: responsive sizes (mirrors api/media-lib.php rs_*) */
  const RS_W = [480, 960, 1600], rsVar = (url, w) => url.replace(/\.[a-z0-9]+$/i, "") + ".w" + w + ".webp";
  const rsHave = (url) => RS_W.filter((w) => fs.existsSync(path.join(ROOT, rsVar(url, w))));
  const rsStem = (url) => url.replace(/\.[a-z0-9]+$/i, ""), rsLegacy = (url) => RS_W.filter((w) => fs.existsSync(path.join(ROOT, rsStem(url) + "-" + w + ".webp")));
  const rsIsLegacyCopy = (abs) => { const m = /^(.*)-(480|960|1600)\.webp$/.exec(abs); return !!m && ["webp", "jpg", "jpeg", "png"].some((e) => fs.existsSync(m[1] + "." + e)); };
  function rsApply(url, ow) {
    const have = rsHave(url), set = have.map((w) => rsVar(url, w) + " " + w + "w"); if (set.length && ow > have[have.length - 1]) set.push(url + " " + ow + "w");
    const attr = set.length ? ` srcset="${set.join(", ")}" sizes="(max-width: 640px) 100vw, (max-width: 1200px) 80vw, 1200px" data-wx-rs` : ""; let pages = 0;
    for (const rel of htmlPages()) {
      const abs = path.join(ROOT, rel), h = fs.readFileSync(abs, "utf8"); if (!h.includes(url)) continue;
      const n = h.replace(/<img\b[^>]*>/gi, (t) => { const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); if (!new RegExp('\\ssrc="(' + esc(SITE_URL) + ')?' + esc(url) + '(\\?v=\\d+)?"').test(t)) return t; const sm = /\ssrcset="([^"]*)"/i.exec(t); if (sm && !t.includes("data-wx-rs") && !sm[1].includes(rsStem(url) + "-")) return t;
        t = t.replace(/\ssrcset="[^"]*"/i, "").replace(/\ssizes="[^"]*"/i, "").replace(/\sdata-wx-rs(="")?/, ""); return attr ? t.replace(/^<img/i, "<img" + attr) : t; });
      if (n !== h) { cmsBackup(rel); fs.writeFileSync(abs, n); pages++; }
    }
    return pages;
  }

  function mediaBust(url) { // P19 B7
    for (const w of rsHave(url)) { try { fs.unlinkSync(path.join(ROOT, rsVar(url, w))); } catch {} }
    rsApply(url, 0); const v = Math.floor(Date.now() / 1000), re = new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\?v=\\d+)?(?=[\"'\\s),])", "g"); let pages = 0;
    for (const rel of htmlPages()) { const abs = path.join(ROOT, rel), h = fs.readFileSync(abs, "utf8"); if (!h.includes(url)) continue; const n = h.replace(re, url + "?v=" + v); if (n !== h) { fs.writeFileSync(abs, n); pages++; } }
    return pages;
  }

  async function a7(action, inp, need, db, ip) {
    if (!/^(media_|backup_|health_)/.test(action)) return null;
    const ED = ["owner", "admin", "editor"], OA = ["owner", "admin"];
    switch (action) {
      case "media_list": {
        need(ED); const m = mediaLoad(), corpus = usageCorpus(), files = [];
        for (const d of IMG_DIRS) for (const a of walkFiles(path.join(ROOT, d), (n) => IMG_RE.test(n) && !/\.w(480|960|1600)\.webp$/.test(n))) {
          if (rsIsLegacyCopy(a)) continue;
          const url = "/" + relOf(a), s = fs.statSync(a), base = url.slice(1), name = path.basename(a);
          const used = corpus.filter(([, t]) => t.includes(base) || (name.length > 10 && t.includes(name))).map(([r]) => r);
          files.push({ url, name, folder: d === "assets/img" ? "site" : (path.relative(path.join(ROOT, d), path.dirname(a)).split(path.sep).join("/") || "uploads"), size: s.size, mtime: s.mtime.toISOString().slice(0, 19).replace("T", " "), alt: m.alt[url] || "", used, sizes: rsHave(url).length ? rsHave(url) : rsLegacy(url) });
        }
        const folders = fs.existsSync(path.join(ROOT, "assets/uploads")) ? fs.readdirSync(path.join(ROOT, "assets/uploads"), { withFileTypes: true }).filter((f) => f.isDirectory()).map((f) => f.name) : [];
        return { ok: true, files: files.sort((a, b) => b.mtime.localeCompare(a.mtime)), folders, trash: m.trash.length };
      }
      case "media_sizes": {
        const u = need(ED), url = String(inp.url || ""); if (!mediaRelOk(url) || !/\.(jpe?g|png|webp)$/i.test(url) || /\.w\d+\.webp$/.test(url)) throw new Fail("Invalid image");
        if (!fs.existsSync(path.join(ROOT, url))) throw new Fail("Image not found", 404); const ow = Math.max(1, +inp.ow || 0), files = inp.files && typeof inp.files === "object" ? inp.files : {};
        for (const w of RS_W) { const f = path.join(ROOT, rsVar(url, w)); if (fs.existsSync(f)) fs.unlinkSync(f); }
        const made = [];
        for (const w of RS_W) { if (files[w] == null || w >= ow) continue; const d = Buffer.from(String(files[w]), "base64"); if (!d.length || d.length > 3 * 1024 * 1024 || sniff(d) !== "webp") throw new Fail(`Size ${w}px is not a valid WebP image`); fs.writeFileSync(path.join(ROOT, rsVar(url, w)), d); made.push(w); }
        const pages = rsApply(url, ow); log(db, u, "media.sizes", url + " " + made.join("/"), ip); save(db); return { ok: true, sizes: made, pages };
      }
      case "media_folder": { need(ED); const n = String(inp.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); if (!n) throw new Fail("Folder name: letters and numbers"); fs.mkdirSync(path.join(ROOT, "assets/uploads", n), { recursive: true }); return { ok: true, name: n }; }
      case "media_upload": case "media_replace": {
        const u = need(action === "media_upload" ? ED : OA), data = Buffer.from(String(inp.data || ""), "base64");
        if (!data.length || data.length > 8 * 1024 * 1024) throw new Fail("Image is empty or larger than 8 MB"); const ext = sniff(data); if (!ext) throw new Fail("Only JPG, PNG, WebP or GIF images are allowed");
        if (action === "media_replace") {
          const url = String(inp.url || ""); if (!mediaRelOk(url)) throw new Fail("Invalid image"); const abs = path.join(ROOT, url); if (!fs.existsSync(abs)) throw new Fail("Image not found", 404);
          const cur = path.extname(abs).slice(1).toLowerCase().replace("jpeg", "jpg"); if (cur !== ext) throw new Fail("The new file must be the same format (" + cur + ")");
          const m = mediaLoad(); fs.mkdirSync(MTRASH, { recursive: true }); const tf = Date.now() + "-" + path.basename(abs); fs.copyFileSync(abs, path.join(MTRASH, tf));
          m.trash.push({ id: ++m.seq, url, file: tf, size: fs.statSync(abs).size, at: now(), by: u.name, why: "replaced" }); jw(MEDIA, m);
          const before = fs.statSync(abs).size; fs.writeFileSync(abs, data); const pages = mediaBust(url); log(db, u, "media.optimise", url, ip); save(db); return { ok: true, url, pages, before, after: data.length };
        }
        const folder = String(inp.folder || "").replace(/[^a-z0-9-]/g, ""), dir = path.join(ROOT, "assets/uploads", folder); if (folder && !fs.existsSync(dir)) throw new Fail("Folder not found");
        fs.mkdirSync(dir, { recursive: true });
        const base = (String(inp.name || "image").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "image").slice(0, 40), name = `${base}-${crypto.randomBytes(3).toString("hex")}.${ext}`;
        fs.writeFileSync(path.join(dir, name), data); const url = "/assets/uploads/" + (folder ? folder + "/" : "") + name;
        if (inp.alt) { const m = mediaLoad(); m.alt[url] = clip(inp.alt, 200); jw(MEDIA, m); }
        log(db, u, "media.upload", url, ip); save(db); return { ok: true, url, size: data.length };
      }
      case "media_alt": {
        const u = need(ED), url = String(inp.url || ""), alt = clip(inp.alt, 200); if (!mediaRelOk(url)) throw new Fail("Invalid image");
        const m = mediaLoad(); m.alt[url] = alt; jw(MEDIA, m); let pages = 0;
        if (inp.apply && alt) {
          const ea = alt.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          for (const rel of htmlPages()) {
            const abs = path.join(ROOT, rel), h = fs.readFileSync(abs, "utf8"); if (!h.includes(url)) continue;
            const n = h.replace(/<img\b[^>]*>/gi, (tag) => { if (!tag.includes('src="' + url + '"') && !tag.includes('src="' + SITE_URL + url + '"')) return tag; if (/\salt="[^"]+"/.test(tag)) return tag; return /\salt=""/.test(tag) ? tag.replace(/\salt=""/, ` alt="${ea}"`) : tag.replace(/^<img/i, `<img alt="${ea}"`); });
            if (n !== h) { cmsBackup(rel); fs.writeFileSync(abs, n); pages++; }
          }
        }
        log(db, u, "media.alt", url, ip); save(db); return { ok: true, pages };
      }
      case "media_move": {
        const u = need(ED), to = String(inp.folder || "").replace(/[^a-z0-9-]/g, ""), dir = path.join(ROOT, "assets/uploads", to); if (to && !fs.existsSync(dir)) throw new Fail("Folder not found");
        const urls = (Array.isArray(inp.urls) ? inp.urls : []).filter(mediaRelOk).slice(0, 200), corpus = usageCorpus(), m = mediaLoad(), moved = [], blocked = [];
        for (const url of urls) { const abs = path.join(ROOT, url); if (!fs.existsSync(abs) || !url.startsWith("/assets/uploads/") || corpus.some(([, t]) => t.includes(url.slice(1)))) { blocked.push(url); continue; }
          const nu = "/assets/uploads/" + (to ? to + "/" : "") + path.basename(abs); if (nu === url) continue; if (fs.existsSync(path.join(ROOT, nu))) { blocked.push(url); continue; }
          fs.renameSync(abs, path.join(ROOT, nu)); if (m.alt && m.alt[url]) { m.alt[nu] = m.alt[url]; delete m.alt[url]; } moved.push(nu); }
        jw(MEDIA, m); log(db, u, "media.move", moved.length + " file(s)", ip); save(db); return { ok: true, moved, blocked };
      }
      case "media_trash": {
        const u = need(OA), m = mediaLoad(), urls = (Array.isArray(inp.urls) ? inp.urls : []).filter(mediaRelOk).slice(0, 200), corpus = inp.force ? [] : usageCorpus(), moved = [], blocked = [];
        fs.mkdirSync(MTRASH, { recursive: true });
        for (const url of urls) {
          const abs = path.join(ROOT, url); if (!fs.existsSync(abs)) continue;
          if (corpus.some(([, t]) => t.includes(url.slice(1)))) { blocked.push(url); continue; }
          const tf = Date.now() + "-" + crypto.randomBytes(2).toString("hex") + "-" + path.basename(abs); m.trash.push({ id: ++m.seq, url, file: tf, size: fs.statSync(abs).size, at: now(), by: u.name, why: "deleted" }); fs.renameSync(abs, path.join(MTRASH, tf)); moved.push(url); for (const w of RS_W) { const vf = path.join(ROOT, rsVar(url, w)); if (fs.existsSync(vf)) fs.unlinkSync(vf); } if (inp.force) rsApply(url, 0);
        }
        jw(MEDIA, m); log(db, u, "media.trash", moved.length + " file(s)", ip); save(db); return { ok: true, moved, blocked };
      }
      case "media_trash_list": { need(OA); return { ok: true, trash: mediaLoad().trash.slice().reverse() }; }
      case "media_restore": case "media_purge": {
        const u = need(OA), m = mediaLoad(), ids = inp.all ? m.trash.map((t) => t.id) : [+inp.id]; let n = 0;
        for (const id of ids) {
          const i = m.trash.findIndex((t) => t.id === id); if (i < 0) continue; const t = m.trash[i], src = path.join(MTRASH, t.file);
          if (action === "media_restore") { const dst = path.join(ROOT, t.url); if (fs.existsSync(dst) && t.why !== "replaced") throw new Fail("A file with that name exists again"); fs.mkdirSync(path.dirname(dst), { recursive: true }); if (fs.existsSync(src)) fs.copyFileSync(src, dst); }
          if (fs.existsSync(src)) fs.unlinkSync(src); m.trash.splice(i, 1); n++;
        }
        jw(MEDIA, m); log(db, u, action === "media_restore" ? "media.restore" : "media.purge", n + " file(s)", ip); save(db); return { ok: true, n };
      }
      case "backup_list": { need(OA); const h = jr(HEALTH, {}); return { ok: true, backups: bkList(), lastCron: h.lastCron || null, format: "tar.gz" }; }
      case "backup_run": { const u = need(OA), kind = inp.kind === "daily" ? "daily" : "full"; const b = backupOne(kind, u); log(db, u, "backup.create", b.name, ip); save(db); return { ok: true, backup: b }; }
      case "backup_delete": { const u = need(OA), b = bkList().find((x) => x.name === inp.name); if (!b) throw new Fail("Backup not found", 404); fs.unlinkSync(path.join(SBK, b.name)); log(db, u, "backup.delete", b.name, ip); save(db); return { ok: true }; }
      case "backup_restore": {
        const u = need(OA), b = bkList().find((x) => x.name === inp.name); if (!b) throw new Fail("Backup not found", 404);
        const safety = backupOne("safety", u); execFileSync("tar", ["xzf", path.join(SBK, b.name), "-C", ROOT]);
        db = load(); log(db, u, "backup.restore", b.name + " (safety copy " + safety.name + ")", ip); save(db); return { ok: true, safety: safety.name };
      }
      case "health_get": { need(ED); const h = jr(HEALTH, {}); return { ok: true, scan: h.scan || null, psi: h.psi || {}, psiKeySet: !!h.psiKey, site: h.site || SITE_URL, lastCron: h.lastCron || null }; }
      case "health_scan": { const u = need(ED), h = jr(HEALTH, {}); h.scan = healthScan(); jw(HEALTH, h); log(db, u, "health.scan", h.scan.score + "/100", ip); save(db); return { ok: true, scan: h.scan }; }
      case "health_settings": { need(OA); const h = jr(HEALTH, {}); if (typeof inp.psiKey === "string" && inp.psiKey !== "") h.psiKey = inp.psiKey.trim().slice(0, 100); if (inp.clearKey) delete h.psiKey; if (/^https:\/\/[a-z0-9.-]+$/i.test(inp.site || "")) h.site = inp.site; jw(HEALTH, h); return { ok: true, psiKeySet: !!h.psiKey, site: h.site || SITE_URL }; }
      case "health_speed": { need(ED); const h = jr(HEALTH, {}); return { ok: true, psi: h.psi || {}, psiKeySet: !!h.psiKey, site: h.site || SITE_URL }; }
      case "health_psi": {
        need(ED); const h = jr(HEALTH, {}), rel = String(inp.rel || "index.html"); if (!/^[a-z0-9][a-z0-9/_\-.]*\.html$/i.test(rel) || rel.includes("..")) throw new Fail("Invalid page");
        const strategy = inp.strategy === "desktop" ? "desktop" : "mobile", url = (h.site || SITE_URL) + "/" + rel.replace(/index\.html$/, "");
        const q = new URLSearchParams({ url, strategy }); ["performance", "accessibility", "best-practices", "seo"].forEach((c) => q.append("category", c)); if (h.psiKey) q.set("key", h.psiKey);
        const r = process.env.PSI_FAKE ? await psiFake(strategy) : await fetch("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + q, { signal: AbortSignal.timeout(90000) }).catch((e) => ({ ok: false, statusText: e.message }));
        if (!r.ok) { let msg = r.statusText || "request failed"; try { msg = (await r.json()).error.message; } catch {} throw new Fail("PageSpeed: " + String(msg).slice(0, 200)); }
        const j = await r.json(), cat = j.lighthouseResult.categories, au = j.lighthouseResult.audits, sc = (k) => (cat[k] ? Math.round(cat[k].score * 100) : null);
        const res = { at: now(), strategy, perf: sc("performance"), a11y: sc("accessibility"), bp: sc("best-practices"), seo: sc("seo"), lcp: au["largest-contentful-paint"] && au["largest-contentful-paint"].displayValue, cls: au["cumulative-layout-shift"] && au["cumulative-layout-shift"].displayValue, tbt: au["total-blocking-time"] && au["total-blocking-time"].displayValue, fcp: au["first-contentful-paint"] && au["first-contentful-paint"].displayValue, si: au["speed-index"] && au["speed-index"].displayValue, tips: psiTips(au) };
        const h2 = jr(HEALTH, {}); h2.psi = h2.psi || {}; const k = rel + "|" + strategy; h2.psi[k] = [res, ...(h2.psi[k] || [])].slice(0, 10); jw(HEALTH, h2); return { ok: true, result: res };
      }
    }
    return null;
  }
  /* P15: top 5 suggestions (mirrors psi_tips in media-lib.php) */
  function psiTips(au) {
    const t = [];
    for (const [id, a] of Object.entries(au)) {
      if (a.score == null || a.score >= 0.9) continue;
      const ms = Math.max(+(a.details && a.details.overallSavingsMs) || 0, +(a.metricSavings && a.metricSavings.LCP) || 0, +(a.metricSavings && a.metricSavings.FCP) || 0);
      const kb = (+(a.details && a.details.overallSavingsBytes) || 0) / 1024;
      if (ms <= 0 && kb <= 0 && a.scoreDisplayMode !== "metricSavings") continue;
      t.push({ id, title: String(a.title || id).replace(/<[^>]+>/g, "").slice(0, 120), value: String(a.displayValue || "").slice(0, 60), ms: Math.round(ms), kb: Math.round(kb) });
    }
    return t.sort((x, y) => y.ms - x.ms || y.kb - x.kb).slice(0, 5);
  }
  /* Test mode: PSI_FAKE=1 returns a realistic fake PageSpeed answer (no Google call). */
  function psiFake(strategy) {
    const d = strategy === "desktop", rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
    const j = { lighthouseResult: { categories: { performance: { score: (d ? rnd(95, 100) : rnd(86, 97)) / 100 }, accessibility: { score: rnd(96, 101) / 100 }, "best-practices": { score: 1 }, seo: { score: 1 } },
      audits: { "largest-contentful-paint": { displayValue: (d ? 0.8 : 2.6) + " s" }, "cumulative-layout-shift": { displayValue: "0.01" }, "total-blocking-time": { displayValue: "20 ms" }, "first-contentful-paint": { displayValue: (d ? 0.5 : 1.8) + " s" }, "speed-index": { displayValue: (d ? 0.9 : 3.1) + " s" },
        "render-blocking-insight": { title: "Render blocking requests", score: 0.5, displayValue: "Est savings of 300 ms", scoreDisplayMode: "metricSavings", metricSavings: { FCP: 300, LCP: 300 } },
        "image-delivery-insight": { title: "Improve image delivery", score: 0.5, displayValue: "Est savings of 42 KiB", scoreDisplayMode: "metricSavings", metricSavings: { LCP: 150 }, details: { overallSavingsBytes: 43000 } },
        "unused-css-rules": { title: "Reduce unused CSS", score: 0.5, displayValue: "Est savings of 60 KiB", details: { overallSavingsMs: 120, overallSavingsBytes: 61000 } } } } };
    return Promise.resolve({ ok: true, json: async () => j });
  }
  // raw file download for backups (called by the preview server before JSON handling)
  /* Phase 7 — raw: backup_up (tar.gz body), db_dl (JSON download), db_up (JSON body). Mirrors api/media-lib.php media_raw(). */
  function rawAction(req, action, body) {
    const db = load(); const u = db && current(db, req);
    const J = (st, o) => ({ status: st, type: "application/json; charset=utf-8", body: JSON.stringify(o) });
    if (!u || !["owner", "admin"].includes(u.role)) return J(403, { ok: false, error: "You do not have permission for this" });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    if (action === "db_dl") return { status: 200, type: "application/json", name: "woodex-database-" + stamp + ".json", body: JSON.stringify({ woodexDb: 1, exported: new Date().toISOString(), tables: db }) };
    if (!body || !body.length) return J(400, { ok: false, error: "The file was empty" });
    if (action === "backup_up") {
      if (!(body[0] === 0x1f && body[1] === 0x8b) && !(body[0] === 0x50 && body[1] === 0x4b)) return J(400, { ok: false, error: "That is not a backup file" });
      fs.mkdirSync(SBK, { recursive: true }); const name = "upload-" + stamp + (body[0] === 0x1f ? ".tar.gz" : ".zip"); fs.writeFileSync(path.join(SBK, name), body);
      log(db, u, "backup.upload", name, ""); save(db); return J(200, { ok: true, name, size: body.length });
    }
    if (action === "db_up") {
      let j; try { j = JSON.parse(body.toString()); } catch { return J(400, { ok: false, error: "This is not a Woodex database file" }); }
      const t = j && (j.tables || j); if (!t || !Array.isArray(t.users) || !t.users.length) return J(400, { ok: false, error: "This is not a Woodex database file" });
      const safety = backupOne("safety", u); save(t); const d2 = load(); log(d2, u, "db.import", "database (safety copy " + safety.name + ")", ""); save(d2);
      return J(200, { ok: true, rows: Object.keys(t).length, safety: safety.name });
    }
    return J(400, { ok: false, error: "Unknown action" });
  }
  function backupFile(req, name) { const db = load(); const u = db && current(db, req); if (!u || !["owner", "admin"].includes(u.role)) return null; const b = bkList().find((x) => x.name === name); return b ? path.join(SBK, b.name) : null; }


  // ================================================================== A8: settings & integrations
  const SETF = path.join(PRIV, "settings.json");
  const GEN_DEF = { siteName: "Woodex Interior", logo: "/assets/img/img-f941b08b9510.png", favicon: "/assets/img/favicon.svg", share: "/assets/img/img-c7d3a3ebd62b.jpg" };
  const TRK_DEF = { ga4: "", gtm: "", pixel: "", gsc: "" };
  const setLoad = () => { const x = jr(SETF, {}); return { general: { ...GEN_DEF, ...(x.general || {}) }, generalApplied: { ...GEN_DEF, ...(x.generalApplied || {}) }, tracking: { ...TRK_DEF, ...(x.tracking || {}) }, trackingApplied: x.trackingApplied || null }; };
  const imgOk = (u) => typeof u === "string" && /^\/assets\/(img|uploads)\/[a-z0-9/_.-]+\.(png|jpe?g|webp|svg|gif|ico)$/i.test(u) && !u.includes("..");
  // ---- Phase 8: Google sign-in (existing users only), AI Agent (MCP) tokens, WhatsApp stats
  const GFILE = path.join(PRIV, "google.json"), MFILE = path.join(PRIV, "mcp.json");
  const gCid = () => String(jr(GFILE, {}).clientId || "").trim();
  const mLoad = () => { const m = jr(MFILE, {}); m.tokens = m.tokens || []; m.log = m.log || []; return m; };
  const mPub = (t) => ({ id: t.id, name: t.name, user: t.user_name || "", hint: t.hint, created_at: t.created_at, last_used: t.last_used || null, uses: t.uses || 0, off: !!t.off });
  async function gVerify(cred) {
    const cid = gCid(); if (!cid) throw new Fail("Google sign-in is not set up yet");
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(String(cred || ""))) throw new Fail("Invalid Google response");
    let t = {}; try { t = await (await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred), { signal: AbortSignal.timeout(10000) })).json(); } catch {}
    if (!t.sub || t.aud !== cid || !["accounts.google.com", "https://accounts.google.com"].includes(t.iss) || +t.exp < Date.now() / 1000) throw new Fail("Google sign-in could not be verified", 401);
    if (String(t.email_verified) !== "true") throw new Fail("Your Google email is not verified", 401);
    return { sub: String(t.sub), email: String(t.email || "").toLowerCase() };
  }
  async function p8(action, inp, need, db, ip, req) {
    if (!/^(google_|mcp_|wa_stats$)/.test(action)) return null;
    const OA = ["owner", "admin"], done = (o) => { save(db); return o; };
    switch (action) {
      case "google_cfg": return { ok: true, clientId: gCid() };
      case "google_login": {
        const g = await gVerify(inp.credential);
        const u = db.users.find((x) => x.google_sub === g.sub) || db.users.find((x) => g.email && x.email === g.email);
        if (!u || !u.active) { log(db, null, "login.google_denied", g.email, ip); save(db); throw new Fail("This Google account is not an Admin user. Ask the owner to add " + (g.email || "your email") + " in Users.", 403); }
        if (!u.google_sub) { u.google_sub = g.sub; u.google_email = g.email; }
        if (u.totp_on) { const exp = Math.floor(Date.now() / 1000) + 300; save(db); return { ok: true, need2fa: true, ticket: u.id + "." + exp + "." + hmac("2fa|" + u.id + "|" + exp + "|" + u.pw_ver) }; }
        return done(finishLogin(db, u, req, ip));
      }
      case "google_me": { const u = need(); return { ok: true, clientId: gCid(), linked: !!u.google_sub, email: u.google_email || "" }; }
      case "google_link": {
        const u = need(), g = await gVerify(inp.credential);
        if (db.users.some((x) => x.id !== u.id && x.google_sub === g.sub)) throw new Fail("That Google account is linked to another user");
        u.google_sub = g.sub; u.google_email = g.email; log(db, u, "google.link", g.email, ip); return done({ ok: true, linked: true, email: g.email });
      }
      case "google_unlink": { const u = need(); delete u.google_sub; delete u.google_email; log(db, u, "google.unlink", "", ip); return done({ ok: true, linked: false }); }
      case "google_save": {
        const u = need(["owner"]), cid = String(inp.clientId || "").trim();
        if (cid && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(cid)) throw new Fail("The client ID should end with .apps.googleusercontent.com");
        jw(GFILE, { clientId: cid }); log(db, u, "google.settings", cid ? "on" : "off", ip); return done({ ok: true, clientId: cid });
      }
      case "mcp_tokens": { need(OA); return { ok: true, tokens: mLoad().tokens.slice().reverse().map(mPub) }; }
      case "mcp_token_new": {
        const u = need(OA), m = mLoad(), name = clip(inp.name, 60) || "AI agent";
        if (m.tokens.length >= 20) throw new Fail("Maximum 20 tokens. Revoke an old one first.");
        const raw = "wxmcp_" + crypto.randomBytes(24).toString("hex");
        m.tokens.push({ id: crypto.randomBytes(6).toString("hex"), name, hash: sha(raw), hint: raw.slice(-4), user_id: u.id, user_name: u.name, created_at: now(), last_used: null, uses: 0 });
        jw(MFILE, m); log(db, u, "mcp.token_new", name, ip); return done({ ok: true, token: raw, tokens: m.tokens.slice().reverse().map(mPub) });
      }
      case "mcp_token_revoke": {
        const u = need(OA), m = mLoad(), n = m.tokens.length; m.tokens = m.tokens.filter((t) => t.id !== String(inp.id || ""));
        if (m.tokens.length === n) throw new Fail("Token not found", 404);
        jw(MFILE, m); log(db, u, "mcp.token_revoke", String(inp.id), ip); return done({ ok: true, tokens: m.tokens.slice().reverse().map(mPub) });
      }
      case "mcp_token_toggle": {
        const u = need(OA), m = mLoad(), t = m.tokens.find((x) => x.id === String(inp.id || "")); if (!t) throw new Fail("Token not found", 404);
        t.off = !inp.on; jw(MFILE, m); log(db, u, inp.on ? "mcp.token_on" : "mcp.token_off", t.id, ip); return done({ ok: true, tokens: m.tokens.slice().reverse().map(mPub) });
      }
      case "mcp_token_regen": {
        const u = need(OA), m = mLoad(), t = m.tokens.find((x) => x.id === String(inp.id || "")); if (!t) throw new Fail("Token not found", 404);
        const raw = "wxmcp_" + crypto.randomBytes(24).toString("hex"); t.hash = sha(raw); t.hint = raw.slice(-4); t.regen_at = now();
        jw(MFILE, m); log(db, u, "mcp.token_regen", t.id, ip); return done({ ok: true, token: raw, tokens: m.tokens.slice().reverse().map(mPub) });
      }
      case "mcp_log": { need(OA); return { ok: true, log: mLoad().log.slice(-100).reverse() }; }
      case "wa_stats": {
        need(); const w = jr(path.join(PRIV, "wa-stats.json"), {}), days = w.days || {}, keys = Object.keys(days).sort();
        const since = (n) => new Date(Date.now() - (n - 1) * 864e5).toISOString().slice(0, 10), sum = (n) => keys.filter((k) => k >= since(n)).reduce((a, k) => a + days[k], 0);
        const top = (o) => Object.fromEntries(Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, 10));
        const leads30 = (db.leads || []).filter((l) => l.source === "whatsapp" && l.created_at >= since(30)).length;
        return { ok: true, today: days[new Date().toISOString().slice(0, 10)] || 0, d7: sum(7), d30: sum(30), leads30, days: Object.fromEntries(keys.slice(-30).map((k) => [k, days[k]])), pages: top(w.pages), services: top(w.services) };
      }
    }
    return null;
  }
  // ---- Phase 10: live chat + notifications (mirror of api/chat-lib.php; AI replies need the PHP server)
  const CHATF = path.join(PRIV, "chat.json");
  const CHAT_DEF = { on: true, ai: true, emailAlert: true, autoLead: true, greeting: "Assalam-o-Alaikum, welcome to Woodex Interior. I can help with interior design, renovation, office fit-out and custom furniture. How may I assist you today? Our team is available Mon–Sat, 9:30 am – 6:30 pm.", noPrices: true, hours: "Mon–Sat, 9:30 am – 6:30 pm", knowledge: "Woodex Interior is an interior design and build company in Lahore, Pakistan.", tone: "designer", toneNote: "", qa: [], avoid: "Competitor comparisons\nPolitics or religion", prices: "", openFrom: "09:30", openTo: "18:30", days: [1, 2, 3, 4, 5, 6], afterHours: "Thanks for your message! We are away right now.", waAgent: false, waVerify: "", waSecret: "", waGreeting: "Assalam-o-Alaikum! Thank you for contacting Woodex Interior." };
  const require_rand = () => Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const CHAT_QS = { quick: [{ label: "Our services", text: "What services do you offer?" }, { label: "Book a site visit", text: "I would like to book a site visit." }, { label: "See our work", text: "Can I see your recent projects?" }, { label: "Talk to a person", text: "I would like to talk to a person." }, { label: "Hours & location", text: "What are your hours and where is your office?" }],
    saved: [{ k: "hello", t: "Assalam-o-Alaikum, thank you for contacting Woodex Interior. How can I help you with your space?" }, { k: "visit", t: "We would be glad to visit your site. Please share your address, a suitable day and time, and the best number to reach you." }, { k: "number", t: "Could you share your WhatsApp number so our designer can send you ideas and follow up?" }, { k: "portfolio", t: "You can see our recent projects here: https://woodex.com.pk/portfolio/" }, { k: "hours", t: "Our office is open Monday to Saturday, 9:30 AM to 6:30 PM (Sunday closed). Call or WhatsApp +92 322 4000768." }, { k: "thanks", t: "Thank you for your time. Our designer will be in touch shortly." }] };
  const chatCfg = () => Object.assign({}, CHAT_DEF, CHAT_QS, jr(CHATF, {}));
  const TGF = path.join(PRIV, "telegram.json"), TG_DEF = { token: "", bot: "", botName: "", secret: "", group: "", groupTitle: "", customers: true, button: "auto", alertChats: true, alertLeads: true, alertAppr: true, links: {}, codes: {}, connectedAt: "" };
  const tgCfg = () => Object.assign({ alertPhone: "923224200768" }, TG_DEF, jr(TGF, {}));
  const tgPub = (c) => { const o = { ...c }; delete o.token; delete o.secret; delete o.codes; o.tokenSet = !!c.token; o.linked = Object.keys(c.links || {}).length; o.dmCount = (c.dm || []).length; delete o.links; delete o.dmMap; delete o.pend; o.webhook = "https://woodex.com.pk/api/telegram.php"; o.waDown = true; o.buttonLive = !!(c.token && c.bot && c.customers && c.button !== "off"); return o; };
  const ensureChat = (db) => { db.chats = db.chats || []; db.chatMsgs = db.chatMsgs || []; db.seqCh = db.seqCh || 0; db.seqCm = db.seqCm || 0; db.aiEv = db.aiEv || []; db.aiUn = db.aiUn || []; db.seqUn = db.seqUn || 0; };
  // P39 Phase 5 mirror (ai-agent-lib.php)
  const AI_REASONS = { person: "Asked for a person", price: "Price / quote request", complaint: "Complaint or upset", unsure: "AI not sure", deal: "Ready to finalise", stuck: "No progress after 3 messages" };
  const aiEvent = (db, cid, kind, reason = null) => db.aiEv.push({ t: now(), chat_id: cid, kind, reason });
  const aiUnans = (db, cid, q) => { q = String(q).trim().slice(0, 500); if (q.length < 4) return; const key = q.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").slice(0, 120); const r = db.aiUn.find((x) => x.qkey === key && x.status === "open"); if (r) { r.n++; r.last_t = now(); r.chat_id = cid; } else db.aiUn.push({ id: ++db.seqUn, t: now(), last_t: now(), chat_id: cid, q, qkey: key, n: 1, status: "open" }); };
  const aiHandoff = (db, c, reason) => { c.needs = 1; c.handoff = reason; const last = [...db.chatMsgs].reverse().find((m) => m.chat_id === c.id && m.who === "visitor"); chatAdd(db, c, "note", "AI assistant", "🙋 Hand-off: " + (AI_REASONS[reason] || reason) + "\n" + (c.name || "Customer") + (c.phone ? " (" + c.phone + ")" : " (no phone yet)") + "\nLast message: “" + String(last ? last.text : "").slice(0, 160) + "”"); aiEvent(db, c.id, "handoff", reason); };
  const aiAfter = (db, c, human, reason) => { aiEvent(db, c.id, "answer"); if (!human && !c.handoff && !c.lead_id && !c.phone && db.chatMsgs.filter((m) => m.chat_id === c.id && m.who === "visitor").length >= 3) { human = true; reason = "stuck"; } if (human) aiHandoff(db, c, reason || "person"); };
  const chatOpenNow = () => { const d = new Date(Date.now() + 5 * 36e5), w = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return w !== 0 && m >= 600 && m < 1170; };
  const chatAdd = (db, c, who, name, text, att = null) => { const m = { id: ++db.seqCm, chat_id: c.id, t: now(), who, name: String(name || "").slice(0, 120), text: String(text).slice(0, 4000), att }; db.chatMsgs.push(m); if (who === "note") return m.id; c.updated_at = now(); c.last_text = ((who === "visitor" ? "" : who === "agent" ? "You: " : "AI: ") + text).slice(0, 250); if (who === "visitor") c.unread = (c.unread || 0) + 1; return m.id; };
  /* P18 D: attachments + typing (mirrors chat-lib.php chat_save_att) */
  const chatSniff = (b) => { const h = (n) => b.slice(0, n).toString("latin1"); if (b[0] === 0xff && b[1] === 0xd8) return ["jpg", "img"]; if (b[0] === 0x89 && h(4).slice(1) === "PNG") return ["png", "img"]; if (h(4) === "RIFF" && b.slice(8, 12).toString() === "WEBP") return ["webp", "img"]; if (h(4) === "GIF8") return ["gif", "img"]; if (h(5) === "%PDF-") return ["pdf", "file"]; if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return ["webm", "voice"]; if (h(4) === "OggS") return ["ogg", "voice"]; if (b.slice(4, 8).toString() === "ftyp") return ["m4a", "voice"]; return null; };
  const chatSaveAtt = (b64, name, voice) => {
    const d = Buffer.from(String(b64 || ""), "base64"); if (!d.length) throw new Fail("The file is empty"); if (d.length > 8 * 1024 * 1024) throw new Fail("Files must be 8 MB or smaller");
    const t = chatSniff(d); if (!t) throw new Fail("Only photos (JPG, PNG, WebP, GIF), PDF files and voice notes can be sent");
    if (t[1] === "voice" && !voice) throw new Fail("Only photos and PDF files can be attached"); if (voice && t[1] !== "voice") throw new Fail("Voice note format not recognised");
    const dir = "/assets/uploads/chat/" + new Date().toISOString().slice(0, 7).replace("-", ""); fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
    const f = dir + "/" + crypto.randomBytes(12).toString("hex") + "." + t[0]; fs.writeFileSync(path.join(ROOT, f), d);
    const n = String(name || "").replace(/[^\w .()-]+/gu, "").trim() || (t[1] === "voice" ? "Voice note" : "file." + t[0]);
    return { u: f, n: n.slice(0, 80), k: t[1], s: d.length };
  };
  const chatAttText = (a) => a.k === "voice" ? "🎤 Voice note" : a.k === "img" ? "📷 Photo" : "📎 " + a.n;
  const recent = (t) => !!t && Date.now() - t < 6000;
  const chatMsgs = (db, cid, since = 0, notes = false) => db.chatMsgs.filter((m) => m.chat_id === cid && m.id > since && (notes || m.who !== "note")).map(({ chat_id, ...m }) => m);
  const chatPub = (c) => ({ channel: c.channel || "web", id: c.id, created_at: c.created_at, updated_at: c.updated_at, name: c.name || "", phone: c.phone || "", email: c.email || "", page: c.page || "", status: c.status, mode: c.mode, agent: c.agent_name || "", unread: c.unread || 0, needs: !!c.needs, last: c.last_text || "", lead_id: c.lead_id || null , assigned: c.assigned_to || null, tags: c.tags || [], waitFrom: (c.unread || c.needs) ? c.updated_at : "", handoff: c.handoff || ""});
  const chatMakeLead = (db, c) => { ensureCrm(db); const l = { id: ++db.seqL, created_at: now(), source: "chat", page: c.page, name: c.name || "Chat visitor #" + c.id, phone: c.phone || "", email: c.email || "", service: "", message: chatMsgs(db, c.id).filter((m) => m.who === "visitor").map((m) => "• " + m.text).join("\n").slice(0, 3900), fields: { chat: c.id }, stage: "new", read: false, notes: [], tags: [], value: 0, assigned_to: null, client_id: null, followup: "" }; db.leads.push(l); c.lead_id = l.id; };
  const chatCapture = (db, c, text) => {
    let m; if (!c.phone && (m = /(?:\+?92|0)\s?3\d{2}[\s-]?\d{7}|\+?\d[\d\s-]{8,14}\d/.exec(text))) c.phone = m[0].replace(/[^\d+]/g, "");
    if (!c.email && (m = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.exec(text))) c.email = m[0].toLowerCase();
    if (!c.name && (m = /\b(?:my name is|this is|i am|i'm|name:)\s+([a-z][a-z]+(?:\s[a-z][a-z]+)?)/i.exec(text)) && !/^(looking|interested|from|here|planning|a|an|the)\b/i.test(m[1])) c.name = m[1].toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());
    if (!c.lead_id && (c.phone || c.email) && chatCfg().autoLead) chatMakeLead(db, c);
  };
  /** public visitor endpoint (api/chat.php) */
  const chatPublic = function (req, inp) {
    const cfg = chatCfg(), act = String(inp.action || "cfg"), db = load(), ip = req.socket.remoteAddress || "";
    if (!db) return { ok: true, on: false };
    ensureChat(db);
    if (act === "cfg") return { ok: true, on: !!cfg.on, greeting: cfg.greeting, hours: cfg.hours, open: chatOpenNow(), ai: !!cfg.ai, quick: (cfg.quick || []).slice(0, 6), assistant: (function () { const pe = (jr(CHATF, {}).aic || {}).persona || {}; return String(pe.name || "").trim() ? { name: pe.name, role: pe.role || "Interior design assistant" } : null; })(), tg: tgPub(tgCfg()).buttonLive ? { bot: tgCfg().bot, waDown: true } : null, site: (() => { const t = tgCfg(); let m = ["chat", "whatsapp", "telegram"].includes(t.site) ? t.site : "chat"; const ready = !!(t.token && t.bot && t.customers), link = ready ? "https://t.me/" + t.bot : (t.tgUser ? "https://t.me/" + t.tgUser : ""); if (m === "telegram" && !link) m = "chat"; if (m === "chat" && !cfg.on) m = "whatsapp"; return { mode: m, tgLink: link, tgBot: ready }; })() };
    if (inp.action === "tglink") { const t = tgCfg(); if (!t.bot) throw new Fail("Telegram is not available", 404); return { ok: true, link: "https://t.me/" + t.bot + "?start=c" + (+inp.chat_id) + "_preview" }; }
    if (!cfg.on) throw new Fail("Chat is offline", 403);
    const vchat = () => { const c = db.chats.find((x) => x.id === +inp.chat_id); if (!c || !/^[a-f0-9]{40}$/.test(String(inp.token || "")) || c.token !== sha(inp.token)) throw new Fail("Chat not found", 404); return c; };
    const vpub = (c, since) => ({ ok: true, chat_id: c.id, mode: c.mode, agent: c.agent_name || "", status: c.status, messages: chatMsgs(db, c.id, since), typing: recent(c.atype) });
    if (act === "poll") return vpub(vchat(), +inp.since || 0);
    if (act === "typing") { const c = vchat(); c.vtype = Date.now(); save(db); return { ok: true }; }
    if (act === "file") { const c = vchat(), att = chatSaveAtt(inp.data, inp.name, !!inp.voice); c.status = "open"; chatAdd(db, c, "visitor", c.name, chatAttText(att), att); c.needs = 1; c.vtype = 0; save(db); return vpub(c, +inp.since || 0); }
    if (act !== "send") throw new Fail("Unknown action", 404);
    const text = String(inp.text || "").trim().slice(0, 2000); if (!text) throw new Fail("Write a message");
    if (clip(inp._hp)) return { ok: true, messages: [] };
    const t = tries.get("c" + ip) || { n: 0, t: Date.now() }; if (Date.now() - t.t > 900000) { t.n = 0; t.t = Date.now(); } if (++t.n > 40) throw new Fail("You are sending messages too fast. Please wait a few minutes.", 429); tries.set("c" + ip, t);
    let c, token = null, isNew = false;
    if (+inp.chat_id) c = vchat();
    else { token = crypto.randomBytes(20).toString("hex"); c = { id: ++db.seqCh, token: sha(token), created_at: now(), updated_at: now(), page: String(inp.page || "/").replace(/[^\w/\-.?=&%]/g, "").slice(0, 200) || "/", ip, name: clip(inp.name, 120) || "", status: "open", mode: "ai", unread: 0, needs: 0 }; db.chats.push(c); isNew = true; chatAdd(db, c, "ai", "Woodex assistant", cfg.greeting); }
    c.status = "open"; chatAdd(db, c, "visitor", c.name, text); chatCapture(db, c, text); c.alerted = 1;
    const rr = c.mode === "ai" ? chatRule(cfg, text, db, c) : "";
    if (rr) { const hu = rr.includes("[HUMAN]"); chatAdd(db, c, "ai", "Woodex assistant", rr.replace("[HUMAN]", "").trim()); aiAfter(db, c, hu, hu ? "person" : ""); }
    else if (c.mode === "ai") aiUnans(db, c.id, text);
    if (rr) {}
    else if (c.mode === "ai" && !db.chatMsgs.some((m) => m.chat_id === c.id && m.who === "sys")) { chatAdd(db, c, "sys", "", chatOpenNow() ? "Thanks! A team member will reply here in a few minutes. You can also leave your phone number and we will call you." : "Thanks for your message! We are away right now (" + cfg.hours + "). Leave your name and phone number and we will call you back first thing."); c.needs = 1; }
    save(db); return { ...vpub(c, isNew ? 0 : +inp.since || 0), ...(token ? { token } : {}) };
  };
  // P19 B1 mirror of chat_rule_reply()
  const chatRule = (cfg, text, db, c) => {
    const co = companyCfg(), t = String(text).toLowerCase().trim(), STOP = ["the","and","you","your","for","are","can","what","how","does","with","have","this","that","from","kya","hai","aap","mein","please"];
    const words = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.includes(w));
    const tw = words(t); let best = "", score = 0;
    for (const x of cfg.qa || []) { if (!x.q || !x.a) continue; const qw = words(x.q); if (!qw.length) continue; const hit = qw.filter((w) => tw.includes(w)).length, sc = hit / qw.length; if ((hit >= 2 || (hit >= 1 && qw.length <= 2)) && sc > score) { score = sc; best = x.a; } }
    if (score >= 0.5) return best;
    // P40: same backup answers as chat_rule_reply() — api/chat-rules.json
    let R; try { R = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "chat-rules.json"), "utf8")); } catch (e) { return ""; }
    const prev = c && db ? db.chatMsgs.filter((m) => m.chat_id === c.id && m.who === "ai").map((m) => m.text.replace(R.askPhone, "").trim()) : [];
    const later = chatOpenNow() ? "in a little while" : "as soon as the office opens (" + cfg.hours + ")";
    const fill = (x) => x.replace("{address}", co.address).replace("{phones}", co.phones).replace("{email}", co.email).replace("{hours}", cfg.hours).replace("{later}", later);
    const fresh = (o) => { const f = o.map(fill).filter((x) => !prev.includes(x)); return f.length ? f[Math.floor(Math.random() * f.length)] : ""; };
    if (/(\+?92|0)3\d{2}-?\d{7}/.test(t.replace(/[\s-]+/g, ""))) { const a = fresh(R.phone); if (a) return a; }
    const t2 = t.replace(/^\W*(hi+|hello|hey|salam|assalam\w*(\s*o?\s*-?\s*alaikum)?|aoa|a\.o\.a|asalam\w*|good (morning|afternoon|evening))\b[\s,.!]*/iu, "").trim();
    if (t2.length < 3) return fresh(R.greeting);
    const wa = c && c.channel && c.channel !== "web", hasPhone = !!(c && c.phone);
    for (const r of R.rules) { let ok = false; try { ok = new RegExp(r.re, "iu").test(t2); } catch (e) {} if (!ok) continue;
      let a = fresh(r.a); if (!a) continue; if (!wa && !hasPhone && !r.noask && !r.human && !/\?\s*$/.test(a)) a += R.askPhone; return a + (r.human ? " [HUMAN]" : ""); }
    return "";
  };
  // ---- Phase 12 mirror: client updates (preview writes to _private/outbox/*-update.txt; PHP sends real WhatsApp/email)
  const NTF = path.join(PRIV, "notify.json"), NT_EV = { lead: "Enquiry received", quote: "Quotation sent", started: "Work started", handover: "Handover", booking: "Booking confirmed", remind: "Booking reminder (day before)" };
  const ntMsg = (en, ur) => "Dear {name},\n" + en + "\n\nمحترم {name}، " + ur + "\n\n{company} · {phone}";
  const NT_DEF = { email: true, wa: true, waLang: "en", ev: {
    lead: { on: true, subject: "We received your enquiry: {company}", tpl: "", text: ntMsg("Thank you for contacting {company}. Our team will call you shortly.", "{company} سے رابطہ کرنے کا شکریہ۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔") },
    quote: { on: true, subject: "Your quotation {ref} from {company}", tpl: "", text: ntMsg("Your quotation {ref} for {project} is ready: {link}", "{project} کے لیے آپ کی کوٹیشن {ref} تیار ہے: {link}") },
    started: { on: true, subject: "Work has started on {project}", tpl: "", text: ntMsg("Good news! Work has started on {project}.", "خوشخبری! {project} پر کام شروع ہو گیا ہے۔") },
    booking: { on: true, subject: "Confirmed: {ref}", tpl: "", text: ntMsg("Your {ref} is confirmed. Place: {project}.", "آپ کی ملاقات ({ref}) کنفرم ہو گئی ہے۔ جگہ: {project}۔") },
    remind: { on: true, subject: "Reminder: {ref}", tpl: "", text: ntMsg("A friendly reminder of your {ref} tomorrow. Place: {project}.", "یاد دہانی: کل آپ کی ملاقات ({ref}) ہے۔ جگہ: {project}۔") },
    handover: { on: true, subject: "Your project {project} is ready", tpl: "", text: ntMsg("{project} is complete and ready for handover. Thank you!", "{project} مکمل ہو گیا ہے اور حوالگی کے لیے تیار ہے۔ شکریہ!") } } };
  const ntCfg = () => { const c = Object.assign({}, NT_DEF, jr(NTF, {})); c.ev = Object.assign({}, NT_DEF.ev, c.ev || {}); for (const k in NT_DEF.ev) c.ev[k] = Object.assign({}, NT_DEF.ev[k], c.ev[k] || {}); return c; };
  const ntLog = [];
  // ---- Phase 13 mirror: SEO manager (same actions as api/seo-lib.php; no AI in preview)
  const SEOF = path.join(PRIV, "seo.json"), SEO_SCH = ["LocalBusiness", "Service", "Article", "FAQPage", "BreadcrumbList"];
  const seoData = () => { const d = jr(SEOF, {}); d.pages = d.pages || {}; return d; };
  const seoTypes = (h) => { const t = []; h = h.replace(/<script type="application\/ld\+json" id="wx-seo-schema">[\s\S]*?<\/script>/i, ""); for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { (function w(o) { if (!o || typeof o !== "object") return; if (o["@type"]) [].concat(o["@type"]).forEach((x) => t.push(String(x))); Object.values(o).forEach(w); })(JSON.parse(m[1])); } catch {} } return [...new Set(t)]; };
  const seoFaq = (h) => [...h.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)].map((m) => ({ "@type": "Question", name: m[1].replace(/<[^>]+>/g, "").trim(), acceptedAnswer: { "@type": "Answer", text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() } })).filter((x) => x.name && x.acceptedAnswer.text).slice(0, 20);
  async function p13(action, inp, need, db, ip) {
    if (!action.startsWith("seo_")) return null;
    const ED = ["owner", "admin", "editor"];
    switch (action) {
      case "seo_list": { need(ED); const sm = fs.existsSync(path.join(ROOT, "sitemap.xml")) ? (fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").match(/<loc>/g) || []).length : 0; const hl = jr(path.join(PRIV, "health.json"), {});
        return { ok: true, pages: seoData().pages, robots: fs.existsSync(path.join(ROOT, "robots.txt")) ? fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8") : "", sitemap: sm, scanAt: hl.scan ? hl.scan.at : null, broken: hl.scan ? (hl.scan.issues || []).filter((x) => x.type === "link").length : 0, schemas: SEO_SCH, aiReady: false }; }
      case "seo_page": { need(ED); const rel = relOk(inp.path), h = fs.readFileSync(path.join(ROOT, rel), "utf8"); const m = h.match(/<script type="application\/ld\+json" id="wx-seo-schema">([\s\S]*?)<\/script>/i); let mine = []; try { mine = m ? JSON.parse(m[1])["@graph"].map((x) => x["@type"]) : []; } catch {}
        return { ok: true, existing: seoTypes(h), managed: mine, faq: seoFaq(h).length, seo: seoData().pages[rel] || null }; }
      case "seo_save": { const u = need(ED), rel = relOk(inp.path), d = seoData(), p = d.pages[rel] || {}; p.kw = String(inp.kw || "").trim().slice(0, 120); p.related = (inp.related || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 4);
        for (const k of ["seo", "read"]) if (inp[k] != null) p[k] = Math.max(0, Math.min(100, +inp[k] | 0));
        let res = null; if (Array.isArray(inp.schema)) { p.schema = SEO_SCH.filter((t) => inp.schema.includes(t)); backupPage(rel); const abs = path.join(ROOT, rel); let h = fs.readFileSync(abs, "utf8"); const have = seoTypes(h), base = "https://woodex.com.pk", url = base + urlOf(rel), g = [], added = [];
          const title = ((h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "").trim(), h1 = ((h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), desc = ((h.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || "");
          for (const t of p.schema) { if (have.includes(t)) continue;
            if (t === "LocalBusiness") g.push({ "@type": "LocalBusiness", "@id": base + "/#business", name: "Woodex Interior", url: base + "/", telephone: "+92 322 4000768", address: { "@type": "PostalAddress", streetAddress: "M-71, Zainab Tower, Model Town Link Road, Lahore", addressLocality: "Lahore", addressCountry: "PK" } });
            if (t === "Service") g.push({ "@type": "Service", name: h1 || title, description: desc, url, areaServed: "Pakistan", provider: { "@id": base + "/#business", "@type": "LocalBusiness", name: "Woodex Interior" } });
            if (t === "Article") g.push({ "@type": "Article", headline: (h1 || title).slice(0, 110), description: desc, mainEntityOfPage: url, author: { "@type": "Organization", name: "Woodex Interior" } });
            if (t === "FAQPage") { const f = seoFaq(h); if (!f.length) continue; g.push({ "@type": "FAQPage", mainEntity: f }); }
            if (t === "BreadcrumbList") { const parts = urlOf(rel).split("/").filter(Boolean); if (!parts.length) continue; let acc = ""; g.push({ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: base + "/" }].concat(parts.map((x, k) => { acc += "/" + x; return { "@type": "ListItem", position: k + 2, name: k === parts.length - 1 && h1 ? h1 : x.replace(/-/g, " "), item: base + acc + "/" }; })) }); }
            added.push(t); }
          h = h.replace(/\s*<script type="application\/ld\+json" id="wx-seo-schema">[\s\S]*?<\/script>/i, "");
          if (g.length) h = h.replace(/<\/head>/i, () => '<script type="application/ld+json" id="wx-seo-schema">' + JSON.stringify({ "@context": "https://schema.org", "@graph": g }).replace(/</g, "\\u003c") + "</script>\n</head>");
          fs.writeFileSync(abs, h); res = { added, existing: have }; }
        p.t = now(); d.pages[rel] = p; jw(SEOF, d); log(db, u, "seo.save", rel, ip); return { ok: true, page: p, schema: res }; }
      case "seo_scores": { need(ED); const d = seoData(); for (const [rel, s] of Object.entries(inp.scores || {})) d.pages[rel] = Object.assign(d.pages[rel] || {}, { seo: +s.seo | 0, read: +s.read | 0 }); jw(SEOF, d); return { ok: true }; }
      case "seo_ai": need(ED); return { ok: false, error: "Add an API key in Blog & insights → AI settings (the preview has no AI)" };
      case "seo_robots_save": { need(["owner", "admin"]); const t = String(inp.text || "").replace(/\r/g, ""); if (/^\s*Disallow:\s*\/\s*$/mi.test(t)) return { ok: false, error: "This would block Google from the whole site (Disallow: /). Remove that line." }; fs.writeFileSync(path.join(ROOT, "robots.txt"), t.trimEnd() + "\n"); return { ok: true }; }
      case "seo_sitemap": { need(ED); publishRules(); return { ok: true, count: (fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").match(/<loc>/g) || []).length }; }
    }
    return null;
  }
  async function p12(action, inp, need, db, ip) {
    if (!action.startsWith("notify_")) return null;
    const done = (x) => x;
    switch (action) {
      case "notify_proj_send": { const u = need(["owner", "admin", "sales", "support"]), p = (db.projects || []).find((x) => x.id === +inp.id); if (!p) throw new Fail("Project not found", 404);
        const cl = (db.clients || []).find((c) => c.id === p.client_id) || {}; if (!cl.phone && !cl.email) throw new Fail("This project has no client phone or email");
        const ph = (inp.photos || []).filter((x) => /^\/assets\/uploads\/projects\/[\w.-]+$/.test(x)).slice(0, 3), note = clip(inp.note, 1000);
        const ob = path.join(PRIV, "outbox"); fs.mkdirSync(ob, { recursive: true }); fs.writeFileSync(path.join(ob, Date.now() + "-progress.txt"), "To: " + [cl.phone, cl.email].filter(Boolean).join(" / ") + "\n\nDear " + (cl.name || "Customer") + ",\n" + (note || "Progress update on " + p.name + ": we are now at the " + p.stage + " stage.") + (ph.length ? "\nSite photos: " + ph.join(" ") : ""));
        const result = {}; if (cl.phone) result.whatsapp = "sent (preview outbox)"; if (cl.email) result.email = "sent (preview outbox)";
        p.updates.push({ t: now(), user: u.name, text: "Progress update sent to the client" + (ph.length ? " with " + ph.length + " photo" + (ph.length > 1 ? "s" : "") : "") }); save(db); return { ok: true, result }; }
      case "notify_get": need(["owner", "admin"]); return { ok: true, cfg: ntCfg(), events: NT_EV, waReady: false, emailReady: false, log: ntLog.slice(0, 60) };
      case "notify_save": { need(["owner", "admin"]); const s = inp.cfg || {}, c = ntCfg(); for (const k of ["email", "wa"]) if (k in s) c[k] = !!s[k]; if (s.waLang) c.waLang = String(s.waLang);
        for (const k in NT_EV) if (s.ev && s.ev[k]) { const x = s.ev[k]; if ("on" in x) c.ev[k].on = !!x.on; for (const f of ["text", "subject", "tpl"]) if (f in x) c.ev[k][f] = String(x[f]).slice(0, 3000); }
        jw(NTF, c); return done({ ok: true, cfg: c }); }
      case "notify_test": { const u = need(["owner", "admin"]); const e = inp.event; if (!NT_EV[e]) return { ok: false, error: "Unknown event" }; const ph = String(inp.phone || "").trim(), em = String(inp.email || "").trim(); if (!ph && !em) return { ok: false, error: "Enter your phone or email to receive the test" };
        const ev = ntCfg().ev[e], v = { name: u.name, company: "Woodex Interior", phone: "+92 322 4000768", ref: "WI-10000", project: "Test project", link: "https://woodex.com.pk/" }, fill = (t) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
        const ob = path.join(PRIV, "outbox"); fs.mkdirSync(ob, { recursive: true }); fs.writeFileSync(path.join(ob, Date.now() + "-update.txt"), "To: " + [ph, em].filter(Boolean).join(" / ") + "\nSubject: " + fill(ev.subject) + "\n\n" + fill(ev.text));
        const result = {}; if (ph) { result.whatsapp = "sent (preview outbox)"; ntLog.unshift({ t: now(), event: e, ref: v.ref, name: u.name, channel: "wa", dest: ph, result: "sent" }); } if (em) { result.email = "sent (preview outbox)"; ntLog.unshift({ t: now(), event: e, ref: v.ref, name: u.name, channel: "email", dest: em, result: "sent" }); }
        return { ok: true, result }; }
    }
    return null;
  }
  // ---- P40 E mirror: social media planner (preview stores _private/social.json; PHP publishes for real)
  async function sag(action, inp, need) {
    if (!/^sag_/.test(action)) return null;
    const F = path.join(PRIV, "seo-agent.json"), ED = ["owner", "admin", "editor"];
    const L = () => { const d = jr(F, {}); d.cfg = { engine: "", model: "", weekly: true, ...(d.cfg || {}) }; d.history = d.history || []; return d; };
    const S = (d) => fs.writeFileSync(F, JSON.stringify(d, null, 1)), nowS = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
    const ENG = { anthropic: "Claude (Anthropic)", openai: "OpenAI / Codex", openrouter: "Hermes (OpenRouter)", custom: "Local model (Ollama / LM Studio)" };
    const pages = () => { const out = []; const walk = (d) => { for (const n of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const r = d ? d + "/" + n.name : n.name; if (n.isDirectory()) { if (!/^(admin|builder|api|assets|_private|vendor|node_modules|deploy|uploads|tools)$/.test(r) && !n.name.startsWith("_")) walk(r); } else if (/\.html$/.test(n.name) && !/^(404|offline|thank-you)/.test(n.name)) out.push(r); } }; walk(""); return out.sort().slice(0, 400); };
    const txt = (h) => { const g = (re) => ((h.match(re) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim(); return { title: g(/<title>([\s\S]*?)<\/title>/i), desc: (h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || "", h1: g(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i), text: h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") }; };
    const id = (s) => crypto.createHash("md5").update(s).digest("hex").slice(0, 10);
    const scan = () => { const sp = (jr(path.join(PRIV, "seo.json"), {}).pages) || {}, T = {}, Dd = {}, all = [], P = pages();
      for (const rel of P) { const h = fs.readFileSync(path.join(ROOT, rel), "utf8"); if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(h)) continue; const t = txt(h), kw = String((sp[rel] || {}).kw || "").trim();
        const add = (kind, sev, msg, x = {}) => all.push({ id: id(rel + kind + (x.src || "") + msg), page: rel, kind, sev, msg, ...x });
        const tl = t.title.length, dl = t.desc.length;
        if (!tl) add("title", 3, "Missing page title"); else if (tl < 30) add("title", 2, `Title is short (${tl} characters, aim for 50-60)`); else if (tl > 65) add("title", 1, `Title is long (${tl} characters): Google cuts it after about 60`);
        if (!dl) add("desc", 3, "Missing meta description"); else if (dl < 110) add("desc", 2, `Meta description is short (${dl} characters, aim for 140-155)`); else if (dl > 165) add("desc", 1, `Meta description is long (${dl} characters)`);
        if (t.title) { const k = t.title.toLowerCase(); if (T[k]) add("title", 2, "Same title as /" + T[k].replace(/index\.html$/, "")); else T[k] = rel; }
        if (t.desc) { const k = t.desc.toLowerCase(); if (Dd[k]) add("desc", 2, "Same description as /" + Dd[k].replace(/index\.html$/, "")); else Dd[k] = rel; }
        const h1 = (h.match(/<h1\b/gi) || []).length; if (!h1) add("h1", 2, "No H1 heading (fix in the page builder)", { manual: true }); else if (h1 > 1) add("h1", 1, h1 + " H1 headings: keep one (fix in the page builder)", { manual: true });
        if (!kw) add("kw", 1, "No focus keyphrase set", { manual: true }); else { if (!t.title.toLowerCase().includes(kw.toLowerCase())) add("title", 2, `Focus keyphrase "${kw}" is not in the title`); if (!t.desc.toLowerCase().includes(kw.toLowerCase())) add("desc", 1, `Focus keyphrase "${kw}" is not in the description`); }
        const w = t.text.split(" ").filter(Boolean).length; if (w < 250 && !/^(contact|thank|privacy|terms)/.test(rel)) add("thin", 1, `Thin content (${w} words). Add useful text in the builder or Blog editor`, { manual: true });
        let n = 0; for (const img of h.match(/<img\b[^>]*>/gi) || []) { if (n >= 6) break; const src = (img.match(/\ssrc=["']([^"']+)/i) || [])[1] || "", alt = img.match(/\salt=["']([^"']*)["']/i); if (!src || alt || /(logo|icon|sprite|pixel)/i.test(src)) continue; add("alt", 1, "Image without alt text: " + src.split("/").pop(), { src }); n++; }
        if (!h.includes("application/ld+json")) add("schema", 1, "No structured data (add it in SEO manager → page → Schema)", { manual: true });
        if (!/<link[^>]+rel=["']canonical/i.test(h)) add("canonical", 1, "No canonical link", { manual: true }); }
      { const u = {}; all.forEach((x) => { u[x.id] = x; }); all.length = 0; all.push(...Object.values(u)); } all.sort((a, b) => b.sev - a.sev || a.page.localeCompare(b.page)); let pen = 0; all.forEach((x) => { pen += { 1: 1, 2: 3, 3: 6 }[x.sev]; });
      return { at: nowS(), pages: P.length, score: Math.max(0, Math.min(100, Math.round(100 - pen * 100 / Math.max(1, P.length * 8)))), issues: all.slice(0, 600), counts: { high: all.filter((x) => x.sev === 3).length, med: all.filter((x) => x.sev === 2).length, low: all.filter((x) => x.sev === 1).length } }; };
    switch (action) {
      case "sag_get": { need(ED); const d = L(), ai = (jr(path.join(PRIV, "content.json"), {}).ai) || {}; return { ok: true, cfg: d.cfg, last: d.last || null, history: d.history, engines: { default: ai.provider || "anthropic", list: Object.entries(ENG).map(([k, label]) => ({ id: k, label, ready: !!ai[k + "Key"] || (k === "custom" && !!ai.customUrl), model: ai[k + "Model"] || { anthropic: "claude-sonnet-4-5", openai: "gpt-4o-mini", openrouter: "nousresearch/hermes-3-llama-3.1-405b", custom: "llama3.1" }[k] })) } }; }
      case "sag_cfg_save": { need(["owner", "admin"]); const d = L(), c = inp.cfg || {}; if ("engine" in c) d.cfg.engine = ENG[c.engine] ? c.engine : ""; if ("model" in c) d.cfg.model = String(c.model || "").replace(/[^\w.:/-]/g, "").slice(0, 100); if ("weekly" in c) d.cfg.weekly = !!c.weekly; S(d); return { ok: true, cfg: d.cfg }; }
      case "sag_scan": { need(ED); const d = L(), r = scan(); d.last = r; d.history.push({ at: r.at, score: r.score, issues: r.issues.length }); d.history = d.history.slice(-26); S(d); return { ok: true, last: r, history: d.history }; }
      case "sag_propose": { need(ED); const x = inp.issue || {}; if (!["title", "desc", "alt"].includes(x.kind)) throw new Fail("The agent can only write titles, descriptions and alt text. Fix this one by hand.");
        const h = fs.readFileSync(path.join(ROOT, String(x.page).replace(/\.\./g, "")), "utf8"), t = txt(h), kw = String(((jr(path.join(PRIV, "seo.json"), {}).pages || {})[x.page] || {}).kw || "").trim();
        if (x.kind === "alt") return { ok: true, preview: true, fix: { alt: "Finished interior by Woodex Interior in Lahore, warm wood and soft lighting" } };
        const base = (t.h1 || t.title || "Interior design").replace(/\s*\|.*$/, "").slice(0, 38), k = kw || base;
        return { ok: true, preview: true, fix: { kw: k, title: (k.charAt(0).toUpperCase() + k.slice(1)).slice(0, 40) + " in Lahore | Woodex Interior", desc: (k.charAt(0).toUpperCase() + k.slice(1)) + " by Woodex Interior, Lahore: design, 3D views and a clear plan from start to handover. Book a site visit today.", why: "Preview sample: on the live site the chosen AI engine writes this from the page text.", old: { title: t.title, desc: t.desc } } }; }
      case "sag_fix_save": { need(ED); const rel = String(inp.page || "").replace(/\.\./g, ""), f = path.join(ROOT, rel), fx = inp.fix || {}; if (!/\.html$/.test(rel) || !fs.existsSync(f)) throw new Fail("Page not found"); let h = fs.readFileSync(f, "utf8"); const ea = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        if (fx.alt != null) { let n = 0; h = h.replace(/<img\b[^>]*>/gi, (m) => { if (n || ((m.match(/\ssrc=["']([^"']+)/i) || [])[1] || "") !== fx.src) return m; n++; return m.replace(/\salt=(["'])[^"']*\1/i, "").replace(/^<img/i, '<img alt="' + ea(fx.alt) + '"'); }); if (!n) throw new Fail("That image is no longer on the page"); }
        else { if (fx.title) h = h.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + ea(fx.title) + "</title>"); if (fx.desc) h = /<meta[^>]+name=["']description["']/i.test(h) ? h.replace(/(<meta[^>]+name=["']description["'][^>]*content=["'])[^"']*/i, "$1" + ea(fx.desc)) : h.replace(/<\/head>/i, '<meta name="description" content="' + ea(fx.desc) + '">\n</head>'); }
        fs.writeFileSync(f, h); const d = L(); if (d.last) { const ids = (inp.ids || []).map(String); d.last.issues = d.last.issues.filter((q) => !ids.includes(q.id)); S(d); } return { ok: true }; }
    }
    return null;
  }
  async function soc(action, inp, need) {
    if (!/^soc_/.test(action)) return null;
    const F = path.join(PRIV, "social.json"), OA = ["owner", "admin"];
    const L = () => { const d = jr(F, {}); d.cfg = { pageId: "", igId: "", token: "", tags: "#WoodexInterior #InteriorDesignLahore #Lahore", autoDraft: true, autoSince: "", ...(d.cfg || {}) }; d.posts = d.posts || []; d.seen = d.seen || {}; d.comments = d.comments || []; return d; };
    const auto = (d) => { if (!d.cfg.autoDraft) return 0; if (!d.cfg.autoSince) { d.cfg.autoSince = nowS(); return -1; } let n = 0;
      for (const it of (jr(path.join(PRIV, "content.json"), {}).items || [])) { if (!["post", "study"].includes(it.type) || it.status !== "published" || !it.rel) continue; const key = it.type + ":" + it.id;
        if (d.seen[key] || String(it.published_at || "") < d.cfg.autoSince) continue; d.seen[key] = nowS(); const url = "https://woodex.com.pk/" + String(it.rel).replace(/^\//, "").replace(/index\.html$/, "");
        const dek = String((it.data || {}).dek || (it.seo || {}).desc || "").replace(/<[^>]*>/g, "").trim(), img = String((it.data || {}).hero || (it.seo || {}).og || "").trim(), nets = ["fb"]; if (/\.jpe?g(\?|$)/i.test(img)) nets.push("ig");
        d.posts.push({ id: "p" + crypto.randomBytes(5).toString("hex"), created_at: nowS(), res: {}, nets, text: ((it.type === "study" ? "New project story: " : "New on the Woodex journal: ") + it.title + (dek ? "\n\n" + dek : "") + "\n\nRead it here: " + url + "\n\n" + d.cfg.tags).slice(0, 2200), image: img, link: url, when: "", status: "draft", error: "", title: ((it.type === "study" ? "Project: " : "Article: ") + it.title).slice(0, 80), by: "Auto (website)", auto: key }); n++; }
      return n; };
    const S = (d) => fs.writeFileSync(F, JSON.stringify(d, null, 1)); const pubc = (c) => { const o = { ...c }; for (const k of ["token", "liToken", "gSecret", "gRefresh"]) { o[k + "Set"] = !!c[k]; o[k] = ""; } return o; };
    const nowS = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
    switch (action) {
      case "soc_get": { need(OA); const d = L(); if (auto(d) !== 0) S(d); const ps = d.posts.slice().sort((a, b) => String(b.when || b.created_at).localeCompare(String(a.when || a.created_at))); return { ok: true, cfg: pubc(d.cfg), connected: !!d.cfg.token && !!(d.cfg.pageId || d.cfg.igId) || !!(d.cfg.liToken && d.cfg.liOrg) || !!(d.cfg.gRefresh && d.cfg.gLoc), ready: { fb: !!(d.cfg.token && d.cfg.pageId), ig: !!(d.cfg.token && d.cfg.igId), li: !!(d.cfg.liToken && d.cfg.liOrg), gb: !!(d.cfg.gRefresh && d.cfg.gClient && d.cfg.gSecret && d.cfg.gAcc && d.cfg.gLoc) }, posts: ps, comments: d.comments.slice(0, 200), unread: d.comments.filter((x) => !x.read).length, commentsAt: d.commentsAt || "", now: nowS() }; }
      case "soc_cfg_save": { need(OA); const d = L(), c = inp.cfg || {}; for (const k of ["pageId", "igId"]) if (c[k] != null) d.cfg[k] = String(c[k]).replace(/\D/g, "").slice(0, 30); if (c.token && String(c.token).trim()) d.cfg.token = String(c.token).replace(/[^A-Za-z0-9_\-|.]/g, "").slice(0, 600); if (c.clearToken) d.cfg.token = ""; if (c.autoDraft != null) d.cfg.autoDraft = !!c.autoDraft; for (const k of ["liOrg", "gAcc", "gLoc"]) if (c[k] != null) d.cfg[k] = String(c[k]).replace(/\D/g, "").slice(0, 30); if (c.gClient != null) d.cfg.gClient = String(c.gClient).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 200); for (const k of ["liToken", "gSecret", "gRefresh"]) if (c[k] && String(c[k]).trim()) d.cfg[k] = String(c[k]).trim().slice(0, 1000); if (c.tags != null) d.cfg.tags = String(c.tags).replace(/<[^>]*>/g, "").trim().slice(0, 300); S(d); return { ok: true, cfg: pubc(d.cfg) }; }
      case "soc_post_save": { const u = need(OA), d = L(), x = inp.post || {}; const ix = d.posts.findIndex((p) => p.id === x.id), old = ix >= 0 ? d.posts[ix] : null;
        if (old && ["published", "partial"].includes(old.status)) throw new Fail("This post is already published. Duplicate it to post again.");
        const nets = ["fb", "ig", "li", "gb"].filter((n) => (x.nets || []).includes(n)); if (!nets.length) throw new Fail("Choose at least one: Facebook, Instagram, LinkedIn or Google");
        const text = String(x.text || "").replace(/<[^>]*>/g, "").trim().slice(0, 2200); if (!text) throw new Fail("Write the post text");
        const image = String(x.image || "").trim(); if (nets.includes("ig") && !image) throw new Fail("Instagram posts need an image");
        const link = String(x.link || "").trim(); if (link && !/^https?:\/\/\S+$/.test(link)) throw new Fail("The link must start with https://");
        let when = String(x.when || "").trim(); if (when) { if (isNaN(Date.parse(when.replace(" ", "T")))) throw new Fail("Pick a valid date and time"); when = when.replace("T", " ").slice(0, 16) + ":00"; }
        const status = x.status === "scheduled" ? "scheduled" : "draft"; if (status === "scheduled" && !when) throw new Fail("Pick a date and time to schedule");
        const p = { ...(old || { id: "p" + crypto.randomBytes(5).toString("hex"), created_at: nowS(), res: {} }), nets, text, image, link, when, status, error: "", title: String(x.title || "").slice(0, 80), by: u.name, updated_at: nowS() };
        if (ix >= 0) d.posts[ix] = p; else d.posts.push(p); S(d); return { ok: true, post: p }; }
      case "soc_post_delete": { need(OA); const d = L(); d.posts = d.posts.filter((p) => p.id !== inp.id); S(d); return { ok: true }; }
      case "soc_post_send": { need(OA); const d = L(), p = d.posts.find((q) => q.id === inp.id); if (!p) throw new Fail("Post not found");
        p.status = "failed"; p.error = d.cfg.token ? "Preview cannot publish. On the live site this posts to Facebook/Instagram." : "Connect Facebook first (Social media → Settings)"; S(d); return { ok: false, post: p, error: p.error }; }
      case "soc_comments_sync": { need(OA); const d = L(); if (!d.cfg.token) throw new Fail("Connect Facebook first"); d.commentsAt = nowS(); S(d); return { ok: true, comments: d.comments, errors: ["Preview cannot reach Meta. On the live site this loads new comments."], commentsAt: d.commentsAt }; }
      case "soc_comment_read": { need(OA); const d = L(), ids = (inp.ids || []).map(String); d.comments.forEach((c) => { if (inp.all || ids.includes(c.id)) c.read = true; }); S(d); return { ok: true }; }
      case "soc_comment_reply": { const u = need(OA), d = L(), t = String(inp.text || "").replace(/<[^>]*>/g, "").trim().slice(0, 1000); if (!t) throw new Fail("Write a reply"); if (!d.cfg.token) throw new Fail("Connect Facebook first");
        const c = d.comments.find((x) => x.id === inp.id); if (!c) throw new Fail("Comment not found"); Object.assign(c, { reply: t, replyBy: u.name, replyAt: nowS(), read: true }); S(d); return { ok: true, comment: c, preview: true }; }
      case "soc_ai_reply": { need(OA); const c = L().comments.find((x) => x.id === inp.id); if (!c) throw new Fail("Comment not found");
        return { ok: true, preview: true, text: /price|cost|rate|kitna|qeemat/i.test(c.text) ? "Thank you " + c.name.split(" ")[0] + "! Every project is planned to its size and finishes, so please WhatsApp us on +92 322 4000768 and our designer will guide you." : "Thank you " + c.name.split(" ")[0] + "! Glad you like it. If you are planning a space, send us a message any time." }; }
      case "soc_ai_caption": { need(OA); const t = String(inp.topic || "").trim(); if (!t) throw new Fail("Describe the post first (e.g. \"DHA office fit-out, walnut and brass, 40 seats\")"); const tags = L().cfg.tags;
        return { ok: true, preview: true, options: [
          "A closer look at " + t + ".\n\nWe started with how the space is used every day, then chose materials and light to match. Small decisions in the layout made the biggest difference.\n\nPlanning something similar? WhatsApp us on +92 322 4000768.\n\n" + tags + " #InteriorDesign #DesignAndBuild",
          "From 3D view to finished space: " + t + ".\n\nOur in-house 3D studio helped the client see every detail before work began, so the build matched the design.\n\nTell us about your space: +92 322 4000768.\n\n" + tags + " #3DVisualization #HomeInterior",
          "Details that make a space work ✨ " + t + ".\n\nThoughtful joinery, warm materials and a clear plan from start to handover.\n\nSee more on our Projects page.\n\n" + tags + " #OfficeDesign #PakistanInteriors"] }; }
    }
    return null;
  }
  async function p10(action, inp, need, db, ip, req) {
    if (!/^(chat_|notif_|tg_|ai_report|ai_unans_|aic_)/.test(action)) return null;
    ensureChat(db); ensureCrm(db); const SALES = ["owner", "admin", "sales"], done = (o) => { save(db); return o; };
    const get = (id) => { const c = db.chats.find((x) => x.id === +id); if (!c) throw new Fail("Chat not found", 404); return c; };
    switch (action) {
      case "chat_list": { const u = need(SALES); const st = inp.status === "closed" ? "closed" : "open", box = String(inp.box || "all"), cc = chatCfg(); const open = db.chats.filter((c) => c.status === "open");
        const L = db.chats.filter((c) => c.status === st && (box === "mine" ? c.assigned_to === u.id : box === "unassigned" ? !c.assigned_to : true)).sort((a, b) => (b.needs || 0) - (a.needs || 0) || String(b.updated_at).localeCompare(a.updated_at)).map(chatPub);
        return { ok: true, chats: L, me: u.id, team: db.users.filter((x) => x.active && ["owner", "admin", "sales", "support"].includes(x.role)).map((x) => ({ id: x.id, name: x.name })), counts: { mine: open.filter((c) => c.assigned_to === u.id).length, unassigned: open.filter((c) => !c.assigned_to).length, all: open.length }, cfg: { ai: cc.ai, on: cc.on, saved: cc.saved, tg: !!tgCfg().bot } }; }
      case "aic_get": case "aic_health": case "aic_save": { const u = need(["owner", "admin"]); const raw = jr(CHATF, {}), c = chatCfg();
        const D0 = { style: "balanced", creativity: 40, length: "short", instructions: "", persona: { name: "", role: "Interior design assistant", about: "" }, chan: { web: { on: true, style: "", note: "" }, wa: { on: true, style: "", note: "" }, tg: { on: true, style: "", note: "" } }, urdu: "match", signoff: false };
        const A = (x) => { x = x || {}; const o = { ...D0, ...x, persona: { ...D0.persona, ...(x.persona || {}) }, chan: {} }; for (const k of ["web", "wa", "tg"]) o.chan[k] = { ...D0.chan[k], ...((x.chan || {})[k] || {}) }; return o; };
        const tgc = jr(path.join(PRIV, "telegram.json"), {}), wd = jr(WAGF, {}), un = ((db.aiUn) || []).filter((x) => x.status === "open").length, qa = (c.qa || []).length;
        const health = [{ k: "ai", label: "AI key", st: "bad", msg: "No AI key. The chat uses Q&A rule answers only. Add it in Blog & insights → AI settings.", link: "#/blog" },
          { k: "chat", label: "Website chat", st: c.on !== false ? (c.ai !== false ? "ok" : "warn") : "bad", msg: c.on !== false ? (c.ai !== false ? "On, AI answers first" : "On, but AI replies are off (team answers only)") : "Chat bubble is turned off", link: "#/train" },
          { k: "wa", label: "WhatsApp Cloud API", st: "warn", msg: "Not connected. Customers can still click to WhatsApp you, but replies are not in the Inbox.", link: "#/settings/connections" },
          { k: "waai", label: "WhatsApp AI agent", st: "off", msg: "Needs WhatsApp connected first", link: "#/train" },
          { k: "tg", label: "Telegram bot", st: tgc.token ? "ok" : "warn", msg: tgc.token ? "Bot connected" : "Not connected (optional: team alerts and replies from Telegram)", link: "#/telegram" },
          { k: "mail", label: "Email (SMTP)", st: "warn", msg: "Not set up: email alerts and client emails are not sent", link: "#/settings" },
          { k: "cron", label: "Automation worker (cron)", st: wd.lastTick ? "ok" : "bad", msg: wd.lastTick ? "Last ran " + wd.lastTick : "Never ran: follow-ups, rules and reminders will not send. Add the cron job (every 5 min).", link: "#/wauto" },
          { k: "tpl", label: "WhatsApp templates", st: "warn", msg: (wd.tpls || []).length ? "0 of " + wd.tpls.length + " approved by Meta" : "No templates yet (needed for follow-ups after 24 hours)", link: "#/wauto" },
          { k: "qa", label: "Training Q&A", st: qa >= 10 ? "ok" : "warn", msg: qa + " answer" + (qa === 1 ? "" : "s") + (qa < 10 ? ": add at least 10 common questions" : ""), link: "#/train" },
          { k: "un", label: "Unanswered questions", st: un ? "warn" : "ok", msg: un ? un + " to review" : "Nothing to review", link: "#/aireport" },
          { k: "spam", label: "Spam protection (Turnstile)", st: "warn", msg: "Off: forms use honeypot + rate limit only", link: "#/settings" }];
        if (action === "aic_health") return { ok: true, health };
        if (action === "aic_get") return { ok: true, aic: A(raw.aic), styles: { concise: "Concise", balanced: "Balanced", expressive: "Expressive" }, channels: { web: "Website chat", wa: "WhatsApp", tg: "Telegram" }, base: { greeting: c.greeting, waGreeting: c.waGreeting || "", tone: c.tone || "designer", tones: ["designer", "friendly", "professional", "sales"], noPrices: c.noPrices !== false, ai: c.ai !== false, waAgent: !!c.waAgent, on: c.on !== false, hours: c.hours }, health };
        const a = A(raw.aic), x = inp.aic || {}, b = inp.base || {};
        if (["concise", "balanced", "expressive"].includes(x.style)) a.style = x.style; if (["short", "medium", "long"].includes(x.length)) a.length = x.length; if (["match", "roman", "script"].includes(x.urdu)) a.urdu = x.urdu;
        if ("creativity" in x) a.creativity = Math.max(0, Math.min(100, +x.creativity || 0)); if ("instructions" in x) a.instructions = clip(x.instructions, 2000); if ("signoff" in x) a.signoff = !!x.signoff;
        if (x.persona) for (const [k, n] of [["name", 40], ["role", 60], ["about", 1000]]) if (k in x.persona) a.persona[k] = clip(x.persona[k], n);
        if (x.chan) for (const k of ["web", "wa", "tg"]) { const y = x.chan[k]; if (!y) continue; if ("on" in y) a.chan[k].on = !!y.on; if ("style" in y) a.chan[k].style = ["concise", "balanced", "expressive"].includes(y.style) ? y.style : ""; if ("note" in y) a.chan[k].note = clip(y.note, 600); }
        raw.aic = a; for (const [k, n] of [["greeting", 500], ["waGreeting", 500]]) if (k in b) raw[k] = clip(b[k], n); if (["designer", "friendly", "professional", "sales"].includes(b.tone)) raw.tone = b.tone; for (const k of ["noPrices", "ai", "waAgent", "on"]) if (k in b) raw[k] = !!b[k];
        jw(CHATF, raw); log(db, u, "ai.settings", "", ip); return done({ ok: true, aic: a }); }
      case "chat_suggest": { need(SALES); get(inp.id); throw new Fail("Add an AI key first (Blog & insights → AI settings)"); }
      case "ai_report": { need(["owner", "admin"]); const days = Math.max(1, Math.min(365, +inp.days || 30)), from = new Date(Date.now() - days * 864e5).toISOString().replace("T", " ").slice(0, 19);
        const ch = db.chats.filter((c) => String(c.created_at) >= from), ids = new Set(ch.map((c) => c.id)), hum = new Set(db.chatMsgs.filter((m) => m.who === "agent" && ids.has(m.chat_id)).map((m) => m.chat_id)), ev = db.aiEv.filter((e) => e.t >= from);
        const rs = {}; ev.filter((e) => e.kind === "handoff").forEach((e) => { rs[e.reason] = (rs[e.reason] || 0) + 1; }); const byCh = {}; ch.forEach((c) => { const k = c.channel || "web"; byCh[k] = (byCh[k] || 0) + 1; });
        const fr = [], ft = []; ch.forEach((c) => { const M = db.chatMsgs.filter((m) => m.chat_id === c.id), v = M.find((m) => m.who === "visitor"); if (!v) return; const a = M.find((m) => (m.who === "ai" || m.who === "agent") && m.t >= v.t && m.id > v.id), g = M.find((m) => m.who === "agent" && m.id > v.id); const sec = (x) => (Date.parse(x.t.replace(" ", "T")) - Date.parse(v.t.replace(" ", "T"))) / 1000; if (a) fr.push(sec(a)); if (g) ft.push(sec(g)); });
        const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
        return { ok: true, days, chats: ch.length, aiOnly: ch.length - hum.size, handoffs: Object.values(rs).reduce((a, b) => a + b, 0), reasons: Object.entries(rs).map(([k, n]) => ({ k, label: AI_REASONS[k] || k, n })), leads: ch.filter((c) => c.lead_id).length, visits: ev.filter((e) => e.kind === "visit").length, answers: ev.filter((e) => e.kind === "answer").length, channels: byCh, firstReply: avg(fr), firstTeam: avg(ft), unanswered: db.aiUn.filter((x) => x.status === "open").length }; }
      case "ai_unans_list": { need(["owner", "admin"]); const st = ["open", "added", "ignored"].includes(inp.status) ? inp.status : "open"; return { ok: true, items: db.aiUn.filter((x) => x.status === st).sort((a, b) => b.n - a.n || String(b.last_t).localeCompare(a.last_t)).map(({ qkey, ...x }) => ({ ...x, t: x.last_t })) }; }
      case "ai_unans_add": { const u = need(["owner", "admin"]), r = db.aiUn.find((x) => x.id === +inp.id); if (!r) throw new Fail("Not found", 404); const q = String(inp.q || r.q).trim().slice(0, 300), a = String(inp.a || "").trim().slice(0, 1500); if (!q || !a) throw new Fail("Write the answer first"); const c = chatCfg(); c.qa = [...(c.qa || []), { q, a }].slice(-150); jw(CHATF, c); r.status = "added"; log(db, u, "ai.train", q, ip); return done({ ok: true }); }
      case "ai_unans_ignore": { need(["owner", "admin"]); const r = db.aiUn.find((x) => x.id === +inp.id); if (r) r.status = inp.undo ? "open" : "ignored"; return done({ ok: true }); }
      case "chat_assign": { const u = need(SALES), c = get(inp.id), to = +inp.user_id || 0, x = to && db.users.find((y) => y.id === to && y.active); if (to && !x) throw new Fail("User not found"); c.assigned_to = to || null; chatAdd(db, c, "note", u.name, to ? "Assigned to " + x.name : "Unassigned"); log(db, u, "chat.assign", "#" + c.id, ip); return done({ ok: true, chat: chatPub(c) }); }
      case "chat_note": { const u = need(SALES), c = get(inp.id), t = String(inp.text || "").trim().slice(0, 2000); if (!t) throw new Fail("Write a note"); const id = chatAdd(db, c, "note", u.name, t); return done({ ok: true, id }); }
      case "chat_tags": { need(SALES); const c = get(inp.id); c.tags = [...new Set((Array.isArray(inp.tags) ? inp.tags : []).map((x) => String(x).toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 24)).filter(Boolean))].slice(0, 6); return done({ ok: true, chat: chatPub(c) }); }
      case "tg_get": { const u = need(["owner", "admin", "editor"]); const c = tgCfg();
        if (c.pend && c.pend.uid === u.id && Date.now() - c.pend.t > 6000) { c.links = c.links || {}; c.links[u.id] = "preview"; c.dm = [...new Set([...(c.dm || []), u.id])]; delete c.pend; jw(TGF, c); } // preview: pretend the QR was scanned
        return { ok: true, cfg: tgPub(c), me: !!(c.links || {})[u.id], meDm: (c.dm || []).includes(u.id) }; }
      case "tg_test_me": { const u = need(), c = tgCfg(); if (!(c.links || {})[u.id]) throw new Fail("Scan the QR code first to link your Telegram"); return { ok: true, preview: true }; }
      case "tg_dm_set": { const u = need(), c = tgCfg(); let L = (c.dm || []).filter((x) => x !== u.id); if (inp.on) { if (!(c.links || {})[u.id]) throw new Fail("Scan the QR code first to link your Telegram"); L.push(u.id); } c.dm = L; jw(TGF, c); return { ok: true, on: !!inp.on }; }
      case "tg_save": { const u = need(["owner", "admin", "editor"]), c = tgCfg(); for (const k of ["customers", "alertChats", "alertLeads", "alertAppr"]) if (k in inp) c[k] = !!inp[k]; if (["auto", "always", "off"].includes(inp.button)) c.button = inp.button; if (["chat", "whatsapp", "telegram"].includes(inp.site)) c.site = inp.site;
        if ("alertPhone" in inp) { let ap = String(inp.alertPhone || "").replace(/\D/g, ""); if (ap.startsWith("0")) ap = "92" + ap.slice(1); if (ap && !/^92\d{10}$/.test(ap)) throw new Fail("Alert phone: use a Pakistani mobile like +92 322 4200768"); c.alertPhone = ap; }
        if ("tgUser" in inp) { const tu = String(inp.tgUser || "").trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, ""); if (tu && !/^[A-Za-z0-9_]{5,32}$/.test(tu)) throw new Fail("Telegram username: 5-32 letters, numbers or _"); c.tgUser = tu; } jw(TGF, c); log(db, u, "telegram.settings", "", ip); return done({ ok: true, cfg: tgPub(c) }); }
      case "tg_connect": { need(["owner", "admin", "editor"]); const tok = String(inp.token || "").trim(); if (!/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(tok)) throw new Fail("That does not look like a bot token. Copy it from @BotFather (looks like 123456789:AA…)."); throw new Fail("Preview cannot reach Telegram. On the live site this checks the token and sets the webhook automatically."); }
      case "tg_disconnect": { need(["owner", "admin"]); const c = tgCfg(); Object.assign(c, { token: "", bot: "", group: "", groupTitle: "" }); jw(TGF, c); return { ok: true, cfg: tgPub(c) }; }
      case "tg_test": { need(["owner", "admin", "editor"]); throw new Fail("Connect a team group first: add the bot to your group and send /connect there."); }
      case "tg_link_code": { need(); const c = tgCfg(); if (!c.bot) throw new Fail("Telegram is not connected yet (Integrations → Telegram)."); const code = crypto.randomBytes(3).toString("hex").toUpperCase(); const u0 = need(); if (inp.sim !== false) { c.pend = { uid: u0.id, t: Date.now() }; jw(TGF, c); } return { ok: true, code, link: "https://t.me/" + c.bot + "?start=L" + code, linked: !!(c.links || {})[u0.id] }; }
      case "tg_unlink": { const u = need(); const c = tgCfg(); delete (c.links || {})[u.id]; jw(TGF, c); return { ok: true }; }
      case "chat_get": { need(SALES); const c = get(inp.id); c.unread = 0; c.needs = 0; return done({ ok: true, chat: chatPub(c), messages: chatMsgs(db, c.id, +inp.since || 0, true), typing: recent(c.vtype) }); }
      case "chat_typing": { need(SALES); const c = db.chats.find((x) => x.id === +inp.id); if (c) c.atype = Date.now(); return done({ ok: true }); }
      case "chat_file": { const u = need(SALES), c = get(inp.id); if (c.channel === "wa") throw new Fail("Attachments work in website chats. For WhatsApp chats, send files from the WhatsApp app."); const att = chatSaveAtt(inp.data, inp.name, !!inp.voice); if (c.mode === "ai") chatAdd(db, c, "sys", "", u.name + " joined the chat"); const cap = String(inp.text || "").trim().slice(0, 500); const id = chatAdd(db, c, "agent", u.name, cap || chatAttText(att), att); Object.assign(c, { mode: "human", handoff: "", agent_name: u.name, status: "open", unread: 0, needs: 0, atype: 0 }); log(db, u, "chat.file", "#" + c.id + " " + att.k, ip); return done({ ok: true, id, chat: chatPub(c) }); }
      case "chat_reply": { const u = need(SALES), c = get(inp.id), t = String(inp.text || "").trim(); if (!t) throw new Fail("Write a message"); if (c.mode === "ai") chatAdd(db, c, "sys", "", u.name + " joined the chat"); const id = chatAdd(db, c, "agent", u.name, t); if (!c.assigned_to) c.assigned_to = u.id; Object.assign(c, { mode: "human", handoff: "", agent_name: u.name, status: "open", unread: 0, needs: 0 }); return done({ ok: true, id, chat: chatPub(c) }); }
      case "chat_mode": { const u = need(SALES), c = get(inp.id), m = inp.mode === "ai" ? "ai" : "human"; c.mode = m; c.agent_name = m === "human" ? u.name : null; chatAdd(db, c, "sys", "", m === "human" ? u.name + " joined the chat" : "The assistant is back in this chat"); return done({ ok: true, chat: chatPub(c) }); }
      case "chat_close": { const u = need(SALES), c = get(inp.id); c.status = inp.reopen ? "open" : "closed"; c.unread = 0; c.needs = 0; log(db, u, inp.reopen ? "chat.reopen" : "chat.close", "#" + c.id, ip); return done({ ok: true, chat: chatPub(c) }); }
      case "chat_lead": { const u = need(SALES), c = get(inp.id); for (const k of ["name", "phone", "email"]) if (String(inp[k] || "").trim()) c[k] = clip(inp[k], 190); if (!c.lead_id) chatMakeLead(db, c); log(db, u, "chat.lead", "#" + c.id, ip); return done({ ok: true, chat: chatPub(c) }); }
      case "chat_test": { need(["owner", "admin"]); const tu = (inp.turns || []).filter((x) => x.who === "user"), q = String((tu[tu.length - 1] || {}).text || inp.text || "").trim(); if (!q) throw new Fail("Type a test message"); const rr = chatRule(chatCfg(), q); return { ok: true, reply: rr.replace("[HUMAN]", "").trim() || "(No Q&A answer matched. With an AI key the assistant would answer; without one this question is logged under Unanswered.)", human: rr.includes("[HUMAN]"), rules: true }; }
      case "chat_cfg_get": { need(["owner", "admin"]); return { ok: true, cfg: chatCfg(), aiReady: false }; }
      case "chat_cfg_save": { const u = need(["owner", "admin"]), sv = inp.cfg || {}, c = chatCfg(); for (const k of ["on", "ai", "emailAlert", "autoLead", "noPrices"]) if (k in sv) c[k] = !!sv[k]; for (const [k, n] of [["greeting", 500], ["hours", 80], ["knowledge", 12000], ["toneNote", 400], ["avoid", 2000], ["prices", 4000], ["afterHours", 500], ["waGreeting", 500], ["waSecret", 120], ["openFrom", 5], ["openTo", 5], ["tone", 20]]) if (k in sv) c[k] = String(sv[k]).trim().slice(0, n); if ("waAgent" in sv) c.waAgent = !!sv.waAgent; if (Array.isArray(sv.days)) c.days = sv.days.map(Number); if (Array.isArray(sv.qa)) c.qa = sv.qa.filter((x) => x && x.q && x.a).map((x) => ({ q: String(x.q).slice(0, 300), a: String(x.a).slice(0, 1500) })); if (Array.isArray(sv.quick)) c.quick = sv.quick.filter((x) => x && x.label).slice(0, 8).map((x) => ({ label: String(x.label).slice(0, 30), text: String(x.text || x.label).slice(0, 300) })); if (Array.isArray(sv.saved)) c.saved = sv.saved.filter((x) => x && x.k && x.t).slice(0, 60).map((x) => ({ k: String(x.k).toLowerCase().replace(/[^\w-]/g, "").slice(0, 20), t: String(x.t).slice(0, 1500) })); if (!c.waVerify) c.waVerify = require_rand(); jw(CHATF, c); log(db, u, "chat.settings", "", ip); return done({ ok: true, cfg: c }); }
      case "notif_poll": {
        const u = need(), sales = SALES.includes(u.role); let items = [];
        const lu = sales ? db.leads.filter((l) => !l.read).length : 0, open = db.chats.filter((c) => c.status === "open" && (c.unread || c.needs)), cu = sales ? open.length : 0;
        if (sales) { items = open.map((c) => ({ kind: "chat", id: c.id, t: c.updated_at, title: (c.needs ? "Needs a person · " : "Live chat · ") + (c.name || "Visitor #" + c.id), text: c.last_text || "", href: "#/chat/" + c.id })).concat(db.leads.filter((l) => !l.read).slice(-8).reverse().map((l) => ({ kind: "lead", id: l.id, t: l.created_at, title: "New enquiry · " + l.name, text: (SOURCES[l.source] || l.source) + (l.service ? " · " + l.service : ""), href: "#/leads" }))).sort((a, b) => String(b.t).localeCompare(a.t)); }
        const lastV = db.chatMsgs.filter((m) => m.who === "visitor").reduce((a, m) => Math.max(a, m.id), 0);
        let bkMax = 0, payN = 0;
        if (sales) { // P18 D3
          const today = new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10), cut = new Date(Date.now() - 172800000 + 5 * 36e5).toISOString().slice(0, 19).replace("T", " ");
          bkMax = (db.bookings || []).reduce((a, x) => Math.max(a, x.id), 0);
          (db.bookings || []).filter((x) => x.status === "pending" && x.d >= today).sort((x, y) => (x.d + x.tm).localeCompare(y.d + y.tm)).slice(0, 5).forEach((x) => items.push({ kind: "booking", id: x.id, t: x.created_at, title: "Visit to confirm · " + x.name, text: x.d + " · " + x.tm, href: "#/bookings" }));
          const od = []; for (const iv0 of db.invoices || []) { const iv = invPub(iv0); for (const pm of iv.payments || []) { payN++; if (String(pm.t || "") >= cut) items.push({ kind: "payment", id: iv.id * 1000 + pm.id, t: pm.t, title: "Payment received · Rs " + Number(pm.amount).toLocaleString("en-US"), text: iv.no + " · " + ((iv.client || {}).name || ""), href: "#/invoice/" + iv.id }); } if (iv.overdue) od.push(iv.no + " (" + ((iv.client || {}).name || "") + ")"); }
          if (od.length) items.push({ kind: "overdue", id: 0, t: today + " 00:00:00", title: od.length + " overdue invoice" + (od.length > 1 ? "s" : ""), text: od.slice(0, 3).join(", "), href: "#/invoices" });
          items.sort((a, b) => String(b.t).localeCompare(a.t));
        }
        return { ok: true, leads: lu, chats: cu, total: lu + cu, items: items.slice(0, 20), stamp: String(sales ? (db.seqL || 0) * 100000 + lastV : 0) + (sales ? "." + bkMax + "." + payN : "") };
      }
    }
    return null;
  }
  async function a8(action, inp, need, db, ip) {
    if (!/^set_/.test(action)) return null;
    const OA = ["owner", "admin"];
    switch (action) {
      case "set_get": {
        need(OA); const x = setLoad(), c = crmCfg(), ai = cmsLoad().ai;
        return { ok: true, ...x, mail: { emailOn: c.emailOn, emailTo: c.emailTo, smtpHost: c.smtpHost, smtpPort: c.smtpPort, smtpUser: c.smtpUser, smtpFrom: c.smtpFrom, smtpPassSet: !!c.smtpPass }, turnstile: { tsSite: c.tsSite, tsSecretSet: !!c.tsSecret },
          ai: { provider: ai.provider, ready: !!ai[ai.provider + "Key"] }, psi: !!jr(path.join(PRIV, "health.json"), {}).psiKey,
          system: { server: "Node " + process.version + " (preview)", zip: "tar (preview)", curl: true, openssl: true, cron: jr(path.join(PRIV, "health.json"), {}).lastCron || null, disk: null } };
      }
      case "set_general_save": {
        const u = need(OA), g = inp.general || {}, x = jr(SETF, {}), o = {};
        o.siteName = clip(g.siteName, 80) || GEN_DEF.siteName; if (/[<>"]/.test(o.siteName)) throw new Fail("Site name cannot contain < > or quotes");
        for (const k of ["logo", "favicon", "share"]) { o[k] = clip(g[k], 200) || GEN_DEF[k]; if (!imgOk(o[k])) throw new Fail("Pick the " + k + " from the media library"); }
        x.general = o; if (inp.applied) x.generalApplied = { ...o }; jw(SETF, x); log(db, u, inp.applied ? "settings.general_apply" : "settings.general", "", ip); save(db);
        return { ok: true, ...setLoad() };
      }
      case "set_tracking_save": {
        const u = need(OA), t = inp.tracking || {}, x = jr(SETF, {}), o = {
          ga4: clip(t.ga4, 20).toUpperCase(), gtm: clip(t.gtm, 20).toUpperCase(), pixel: clip(t.pixel, 20).replace(/\D/g, ""), gsc: clip(t.gsc, 120).replace(/^.*content="([^"]+)".*$/, "$1") };
        if (o.ga4 && !/^G-[A-Z0-9]{4,15}$/.test(o.ga4)) throw new Fail("GA4 measurement ID looks like G-XXXXXXXXXX");
        if (o.gtm && !/^GTM-[A-Z0-9]{4,12}$/.test(o.gtm)) throw new Fail("Tag Manager ID looks like GTM-XXXXXXX");
        if (o.pixel && !/^\d{8,20}$/.test(o.pixel)) throw new Fail("Meta Pixel ID is a number (8-20 digits)");
        if (o.gsc && !/^[A-Za-z0-9_-]{10,100}$/.test(o.gsc)) throw new Fail("Search Console code: paste the content value of the meta tag");
        x.tracking = o; if (inp.applied) x.trackingApplied = { ...o, at: now() }; jw(SETF, x); log(db, u, inp.applied ? "settings.tracking_apply" : "settings.tracking", "", ip); save(db);
        return { ok: true, ...setLoad() };
      }
      case "set_ts_test": {
        need(OA); const c = crmCfg(); if (!c.tsSite || !c.tsSecret) throw new Fail("Add both Turnstile keys first");
        const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: c.tsSecret, response: "wx-test" }), signal: AbortSignal.timeout(8000) }).then((x) => x.json()).catch((e) => ({ neterr: e.message }));
        if (r.neterr) throw new Fail("Could not reach Cloudflare: " + r.neterr);
        const codes = r["error-codes"] || []; if (codes.includes("invalid-input-secret")) throw new Fail("Cloudflare says the secret key is wrong");
        return { ok: true, result: "Secret key accepted by Cloudflare" };
      }
    }
    return null;
  }
  const adminApi = async function (req, inp) {
    const action = String(inp.action || "status"), ip = req.socket.remoteAddress || "";
    let db = load(); if (db) { try { if (cmsTick(db)) save(db); } catch (e) { console.error("cmsTick", e.message); } }
    const need = (roles) => { const u = current(db, req); if (!u) throw new Fail("Not signed in", 401); const ok = wxAllowed(u, action, roles); if (ok === false || (ok === null && roles && !roles.includes(u.role))) throw new Fail("Your role (" + (ROLE_LABELS[u.role] || u.role) + ") does not have permission for this", 403); return u; };
    const done = (o) => { save(db); return o; };
    // P39 Phase 2: approvals
    if (/^appr_/.test(action)) {
      const u = need(), isM = u.role === "owner", mine = (a) => a.by && a.by.id === u.id;
      const lite = (a) => { const x = { ...a, in: { ...a.in } }; for (const k in x.in) { const v = x.in[k], j = typeof v === "string" ? v : JSON.stringify(v); if (j && j.length > (typeof v === "string" ? 400 : 1500)) x.in[k] = { _long: j.length, preview: j.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) }; } return x; };
      switch (action) {
        case "appr_count": { const p = apprList("pending"); return { ok: true, pending: (isM ? p : p.filter(mine)).length, master: isM }; }
        case "appr_list": { let l = apprList(String(inp.status || "pending")); if (!isM) l = l.filter(mine); return { ok: true, items: l.slice(0, 200).map(lite), cfg: apprCfg(), master: isM }; }
        case "appr_get": { const a = apprGet(String(inp.id || "")); if (!a || (!isM && !mine(a))) throw new Fail("Not found", 404); return { ok: true, item: a }; }
        case "appr_reject": { if (!isM) throw new Fail("Only the Master can reject changes", 403); const a = apprGet(String(inp.id || "")); if (!a || a.status !== "pending") throw new Fail("Not pending"); apprSet(a.id, { status: "rejected", note: String(inp.note || "").trim().slice(0, 500), decidedBy: u.name, decidedAt: new Date().toISOString() }); log(db, u, "approval.reject", a.summary, ip); return done({ ok: true }); }
        case "appr_cancel": { const a = apprGet(String(inp.id || "")); if (!a || !mine(a) || a.status !== "pending") throw new Fail("Not pending"); apprSet(a.id, { status: "cancelled" }); return { ok: true }; }
        case "appr_cfg_get": return { ok: true, cfg: apprCfg() };
        case "appr_cfg_save": { if (!isM) throw new Fail("Only the Master can change approval rules", 403); const c = { manager: !!inp.manager, developer: !!inp.developer, notify: !!inp.notify }; jw(APPR_CFG, c); log(db, u, "approval.rules", JSON.stringify(c), ip); return done({ ok: true, cfg: c }); }
        case "appr_apply": { const a0 = apprGet(String(inp.id || "")); const r = await apprApply(u, String(inp.id || ""), "admin", inp.edits, (x) => adminApi(req, x), req); if (r && r.ok) { const d2 = load(); log(d2, u, "approval.approve", a0 ? a0.summary : "", ip); save(d2); } return r; }
      }
    }
    { const u0 = db && current(db, req); if (u0 && apprNeeded(u0.role, action, "admin", inp, req) && wxAllowed(u0, action, []) !== false) return apprQueue(u0, "admin", action, inp); }
    switch (action) {
      case "cron": { let backups = []; try { backups = backupAuto(); } catch (e) { console.error("backup", e.message); } return { ok: true, published: 0, backups }; }
      /* P15 test mode: WX_DB_BROKEN=1 simulates a broken DB connection (mirrors db_reconnect in admin.php) */
      case "sys_check": { const u = need(["owner", "admin"]);
        const C = (g, n, ok, d, f) => ({ group: g, name: n, ok, detail: d, fix: f || "" }); const checks = [C("Server","PHP version",true,"Node preview " + process.version), C("Database","MySQL connection",true,"JSON store (preview)"), C("Files","SSL certificate bundle", fs.existsSync(path.join(ROOT,"api/cacert.pem")), "api/cacert.pem"), C("Sign-in","Admin token received", !!req.headers["x-wx-adm"], req.headers["x-wx-adm"] ? "header X-WX-ADM OK" : "missing")];
        for (const [n, url] of [["Google","https://www.googleapis.com/"],["OpenAI","https://api.openai.com/v1/models"]]) { try { const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) }); checks.push(C("Outgoing HTTPS", n, true, "HTTP " + r.status)); } catch (e) { checks.push(C("Outgoing HTTPS", n, false, String(e.cause?.code || e.message), "Sandbox network")); } }
        return { ok: true, checks, version: "P16", time: new Date().toISOString(), server: "node-preview" }; }
      case "db_reconnect": { if (!process.env.WX_DB_BROKEN) throw new Fail("The database connection already works. Please sign in normally.", 409); if (inp.builderPassword !== (process.env.WX_DEV_PASSWORD || "Woodex@2026")) throw new Fail("The builder password is wrong", 401); if (!inp.dbName || !inp.dbUser) throw new Fail("Enter the database name and user"); process.env.WX_DB_BROKEN = ""; return { ok: true, users: 1, fresh: false }; }
      case "status": { if (process.env.WX_DB_BROKEN) return { ok: true, needsSetup: false, dbError: true, driver: "mysql", builderLocked: true, user: null }; const u = current(db, req); return { ok: true, needsSetup: !db, driver: "json", builderLocked: true, user: u ? pub(u) : null }; }
      case "setup": {
        if (db) throw new Fail("Already set up", 403);
        if (String(inp.builderPassword || "") !== builderPassword()) throw new Fail("The current builder password is wrong", 401);
        const name = String(inp.name || "").trim(), email = String(inp.email || "").trim().toLowerCase();
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fail("Enter your name and a valid email"); validPw(inp.password);
        db = { users: [], activity: [], seqU: 1, seqA: 0 };
        const u = { id: 1, name, email, role: "owner", pass_hash: hash(inp.password), active: 1, pw_ver: 1, created_at: now(), last_login: null }; db.users.push(u);
        log(db, u, "setup", "", ip);
        return done({ ok: true, token: tokenFor(u, req, ip), builderToken: builderToken(u.id, lastSid), user: pub(u) });
      }
      case "login": {
        if (!db) throw new Fail("Admin is not set up yet", 503);
        const t = tries.get(ip) || { n: 0, t: 0 };
        if (t.n >= 8 && Date.now() - t.t < 600000) throw new Fail("Too many attempts — wait 10 minutes", 429);
        const u = db.users.find((x) => x.email === String(inp.email || "").trim().toLowerCase());
        if (!u || !u.active || !verify(inp.password, u.pass_hash)) { tries.set(ip, { n: Date.now() - t.t < 600000 ? t.n + 1 : 1, t: Date.now() }); await new Promise((r) => setTimeout(r, 400)); throw new Fail("Wrong email or password", 401); }
        tries.delete(ip);
        if (u.totp_on) { const exp = Math.floor(Date.now() / 1000) + 300; return { ok: true, need2fa: true, ticket: u.id + "." + exp + "." + hmac("2fa|" + u.id + "|" + exp + "|" + u.pw_ver) }; }
        return done(finishLogin(db, u, req, ip));
      }
      case "login_2fa": {
        if (!db) throw new Fail("Admin is not set up yet", 503);
        const t = tries.get("2fa" + ip) || { n: 0, t: 0 }; if (t.n >= 6 && Date.now() - t.t < 600000) throw new Fail("Too many attempts — wait 10 minutes", 429);
        const m = /^(\d+)\.(\d{10})\.([a-f0-9]{64})$/.exec(String(inp.ticket || "")), u = m && db.users.find((x) => x.id === +m[1] && x.active);
        if (!u || +m[2] < Date.now() / 1000 || hmac("2fa|" + u.id + "|" + m[2] + "|" + u.pw_ver) !== m[3]) throw new Fail("Sign-in expired, enter your password again", 401);
        const code = String(inp.code || "").trim(); let ok = totpOk(u.totp, code, u), used = false;
        if (!ok && /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(code)) { const h = sha(code.toLowerCase().replace("-", "")), i = (u.recovery || []).indexOf(h); if (i > -1) { u.recovery.splice(i, 1); ok = used = true; } }
        if (!ok) { tries.set("2fa" + ip, { n: Date.now() - t.t < 600000 ? t.n + 1 : 1, t: Date.now() }); save(db); await new Promise((r) => setTimeout(r, 400)); throw new Fail("That code is not right. Check the time on your phone", 401); }
        if (used) log(db, u, "2fa.recovery_used", (u.recovery || []).length + " left", ip);
        return done(finishLogin(db, u, req, ip));
      }
      case "sec_get": {
        const u = need(); const cur = u._sid;
        return done({ ok: true, totp: !!u.totp_on, recoveryLeft: (u.recovery || []).length, alerts: u.alerts !== false,
          sessions: (u.sessions || []).filter((x) => x.exp > Date.now() / 1000).map((x) => ({ sid: x.sid, ip: x.ip, ua: x.ua, created: x.created, seen: x.seen, current: x.sid === cur })).reverse(),
          logins: db.activity.filter((a) => a.user_id === u.id && /^(login|2fa\.)/.test(a.action)).slice(-10).reverse().map(({ action, ip, created_at }) => ({ action, ip, created_at })),
          team: ["owner", "admin"].includes(u.role) ? db.users.map((x) => ({ id: x.id, name: x.name, role: x.role, totp: !!x.totp_on, sessions: (x.sessions || []).filter((s) => s.exp > Date.now() / 1000).length })) : null });
      }
      case "sec_2fa_begin": { const u = need(); u.totp_pending = b32enc(crypto.randomBytes(20)); return done({ ok: true, secret: u.totp_pending, uri: "otpauth://totp/" + encodeURIComponent("Woodex Admin:" + u.email) + "?secret=" + u.totp_pending + "&issuer=" + encodeURIComponent("Woodex Admin") }); }
      case "sec_2fa_enable": {
        const u = need(); if (!u.totp_pending) throw new Fail("Start the setup again"); if (!totpOk(u.totp_pending, inp.code)) throw new Fail("That code is not right. Scan again or check your phone's time");
        u.totp = u.totp_pending; delete u.totp_pending; u.totp_on = true; const codes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex")); u.recovery = codes.map(sha);
        log(db, u, "2fa.enable", "", ip); return done({ ok: true, codes: codes.map((c) => c.slice(0, 4) + "-" + c.slice(4)) });
      }
      case "sec_2fa_disable": case "sec_recovery_new": {
        const u = need(); if (!verify(inp.password, u.pass_hash)) throw new Fail("Password is wrong", 401);
        if (action === "sec_2fa_disable") { u.totp_on = false; delete u.totp; u.recovery = []; log(db, u, "2fa.disable", "", ip); return done({ ok: true }); }
        if (!u.totp_on) throw new Fail("Two-factor is not on"); const codes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex")); u.recovery = codes.map(sha); log(db, u, "2fa.recovery_new", "", ip); return done({ ok: true, codes: codes.map((c) => c.slice(0, 4) + "-" + c.slice(4)) });
      }
      case "sec_2fa_reset": {
        const me = need(["owner", "admin"]), t = db.users.find((x) => x.id === +inp.user_id); if (!t) throw new Fail("User not found", 404);
        if (t.role === "owner" && me.role !== "owner") throw new Fail("Only the owner can do this", 403);
        t.totp_on = false; delete t.totp; t.recovery = []; t.sessions = []; log(db, me, "2fa.reset", t.email, ip); return done({ ok: true });
      }
      case "sec_revoke": {
        const u = need(); const cur = u._sid;
        if (inp.user_id && +inp.user_id !== u.id) { if (!["owner", "admin"].includes(u.role)) throw new Fail("No permission", 403); const t = db.users.find((x) => x.id === +inp.user_id); if (!t) throw new Fail("User not found", 404); if (t.role === "owner" && u.role !== "owner") throw new Fail("Only the owner can do this", 403); t.sessions = []; log(db, u, "session.revoke_all", t.email, ip); return done({ ok: true }); }
        u.sessions = (u.sessions || []).filter((x) => (inp.others ? x.sid === cur : x.sid !== String(inp.sid || "") || x.sid === cur));
        log(db, u, "session.revoke", inp.others ? "all other devices" : "one device", ip); return done({ ok: true });
      }
      case "sec_alerts": { const u = need(); u.alerts = !!inp.on; return done({ ok: true, alerts: u.alerts }); }
      case "pw_forgot": { // preview: no SMTP, so the reset link is written to _private/outbox/
        const email = String(inp.email || "").trim().toLowerCase(), msg = "If that email belongs to an Admin user, a reset link has been sent. Check your inbox (and spam).", u = db && db.users.find((x) => x.email === email && x.active);
        if (!u) return { ok: true, message: msg };
        const exp = Math.floor(Date.now() / 1000) + 3600, tok = u.id + "." + exp + "." + hmac("pwr|" + u.id + "|" + exp + "|" + u.pw_ver + "|" + u.pass_hash);
        const ob = path.join(PRIV, "outbox"); fs.mkdirSync(ob, { recursive: true }); fs.writeFileSync(path.join(ob, Date.now() + "-reset.txt"), "To: " + u.email + "\n/admin/#reset=" + tok);
        log(db, u, "password.reset_request", "", ip); return done({ ok: true, message: msg });
      }
      case "pw_reset": {
        const m = /^(\d+)\.(\d{10})\.([a-f0-9]{64})$/.exec(String(inp.token || "")); if (!m || +m[2] < Date.now() / 1000) throw new Fail("This reset link has expired. Ask for a new one.", 401);
        const u = db && db.users.find((x) => x.id === +m[1] && x.active); if (!u || hmac("pwr|" + u.id + "|" + m[2] + "|" + u.pw_ver + "|" + u.pass_hash) !== m[3]) throw new Fail("This reset link is not valid or was already used. Ask for a new one.", 401);
        validPw(inp.password); u.pass_hash = hash(inp.password); u.pw_ver++; u.sessions = []; log(db, u, "password.reset", "", ip); return done({ ok: true, message: "Password changed. Sign in with your new password." });
      }
      case "me": { const u = need(); return { ok: true, user: pub(u), caps: wxCaps(u), builderToken: canBuild(u) ? builderToken(u.id, u._sid) : null }; }
      case "logout": { const u = current(db, req); if (u) { u.sessions = (u.sessions || []).filter((x) => x.sid !== u._sid); log(db, u, "logout", "", ip); save(db); } return { ok: true }; }
      case "profile": { const u = need(); const n = String(inp.name || "").trim(); if (!n) throw new Fail("Name is required"); u.name = n.slice(0, 120); log(db, u, "profile.update", "", ip); return done({ ok: true, user: pub(u) }); }
      case "password": {
        const u = need(); if (!verify(inp.current, u.pass_hash)) throw new Fail("Current password is wrong", 401); validPw(inp.next);
        u.pass_hash = hash(inp.next); u.pw_ver++; u.sessions = []; log(db, u, "password.change", "", ip); return done({ ok: true, token: tokenFor(u, req, ip) });
      }
      case "users": need(["owner", "admin"]); return { ok: true, users: db.users.map(pub) };
      case "user_save": {
        const me = need(["owner", "admin"]);
        const id = +inp.id || 0, name = String(inp.name || "").trim(), email = String(inp.email || "").trim().toLowerCase(), role = String(inp.role || "editor"), active = inp.active ? 1 : 0, pw = String(inp.password || "");
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fail("Enter a name and a valid email");
        if (!ROLES.includes(role)) throw new Fail("Unknown role");
        if (role === "owner" && me.role !== "owner") throw new Fail("Only the owner can create another owner", 403);
        if (db.users.some((x) => x.email === email && x.id !== id)) throw new Fail("That email is already used");
        if (id) {
          const old = db.users.find((x) => x.id === id); if (!old) throw new Fail("User not found", 404);
          if (old.role === "owner" && me.role !== "owner") throw new Fail("Only the owner can edit the owner", 403);
          if (old.role === "owner" && (role !== "owner" || !active) && db.users.filter((x) => x.role === "owner" && x.active).length < 2) throw new Fail("There must be at least one active owner");
          if (old.id === me.id && !active) throw new Fail("You cannot deactivate yourself");
          if (pw) validPw(pw);
          const bump = pw || !active || old.role !== role; Object.assign(old, { name, email, role, active }); if (Array.isArray(inp.perms)) old.perms = inp.perms.filter((p) => PERM_GROUPS.includes(p)); if (pw || !active) old.pw_ver++; if (pw) old.pass_hash = hash(pw);
          if (bump && old.id !== me.id) old.sessions = []; // sign out everywhere (admin + builder) when access changes
          log(db, me, "user.update", email, ip);
        } else { validPw(pw); db.users.push({ id: ++db.seqU, name, email, role, perms: Array.isArray(inp.perms) ? inp.perms.filter((p) => PERM_GROUPS.includes(p)) : [], pass_hash: hash(pw), active, pw_ver: 1, created_at: now(), last_login: null }); log(db, me, "user.create", email, ip); }
        return done({ ok: true });
      }
      case "dashboard": {
        need(); ingest(db);
        const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10), wk = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19).replace("T", " ");
        const editsByDay = {}; db.activity.filter((a) => a.action.startsWith("builder.") && a.created_at.slice(0, 10) >= since).forEach((a) => { const d = a.created_at.slice(0, 10); editsByDay[d] = (editsByDay[d] || 0) + 1; });
        const s = stats(); s.team = db.users.filter((u) => u.active).length; ensureCrm(db); const mon = now().slice(0, 7); s.leadsMonth = db.leads.filter((l) => l.created_at.slice(0, 7) === mon).length; s.leadsUnread = db.leads.filter((l) => !l.read).length; ensureA5(db); s.quotesOpen = db.quotes.filter((q) => q.status === 'sent').length; s.quotesOpenValue = db.quotes.filter((q) => q.status === 'sent').reduce((a, q) => a + q.total, 0); s.receivable = db.invoices.reduce((a, i) => a + invPub(i).balance, 0); s.leadsOpen = db.leads.filter((l) => !['won','lost'].includes(l.stage)).length; s.edits7 = db.activity.filter((a) => (a.action === "builder.save" || a.action === "builder.page_new") && a.created_at >= wk).length;
        const recent = db.activity.slice(-8).reverse().map(({ user_name, action, target, created_at }) => ({ user_name, action, target, created_at }));
        return done({ ok: true, stats: s, editsByDay, recent });
      }
      case "activity": {
        need(["owner", "admin"]); ingest(db);
        const q = String(inp.q || "").toLowerCase(), per = 30, page = Math.max(1, +inp.page || 1);
        const all = db.activity.slice().reverse().filter((a) => !q || [a.action, a.target, a.user_name].some((v) => String(v || "").toLowerCase().includes(q)));
        return done({ ok: true, rows: all.slice((page - 1) * per, page * per).map(({ user_name, action, target, ip, created_at }) => ({ user_name, action, target, ip, created_at })), total: all.length, per, page });
      }
      default: {
        const r = (await sag(action, inp, need)) || (await soc(action, inp, need)) || (await conn(action, inp, need)) || (await logos(action, inp, need)) || (await p19c(action, inp, need, db, ip)) || (await p18j(action, inp, need, db, ip)) || (await p18h(action, inp, need, db, ip)) || (await p18g(action, inp, need, db, ip)) || (await p18e(action, inp, need, db, ip)) || (await pbk(action, inp, need, db, ip)) || (await a2(action, inp, need, db, ip)) || (await a17(action, inp, need, db, ip)) || (await a4(action, inp, need, db, ip)) || a5(action, inp, need, db, ip) || (await a6(action, inp, need, db, ip)) || (await a7(action, inp, need, db, ip)) || (await a8(action, inp, need, db, ip)) || (await p8(action, inp, need, db, ip, req)) || (await p10(action, inp, need, db, ip, req)) || (await p12(action, inp, need, db, ip)) || (await p13(action, inp, need, db, ip)); if (r) return r;
        throw new Fail("Unknown action", 404);
      }
    }
  };
  adminApi.installed = () => !!load();
  /** P39: builder side of approvals. Returns a result object, or null when the request should run normally. */
  adminApi.builderAppr = async function (req, inp, run) {
    const m = /^(\d{10})\.(\d+)\./.exec(String(req.headers["x-wx-csrf"] || "")), db = load(), u = m && db && db.users.find((x) => x.id === +m[2]);
    if (!u) return null; const action = String(inp.action || "");
    if (action === "appr_apply") return apprApply(u, String(inp.id || ""), "builder", inp.edits, run, req);
    if (apprNeeded(u.role, action, "builder", inp, req)) return apprQueue(u, "builder", action, inp);
    return null;
  };
  /** Builder token check: signature + user active + builder role + admin session still alive. */
  adminApi.builderOk = function (t) {
    const m = /^(\d{10})\.(\d+)\.([a-f0-9]{16})\.([a-f0-9]{64})$/.exec(String(t || ""));
    if (!m || +m[1] < Date.now() / 1000) return false;
    const good = hmac("wx|" + m[1] + "|" + m[2] + "|" + m[3]);
    if (!crypto.timingSafeEqual(Buffer.from(good), Buffer.from(m[4]))) return false;
    const db = load(), u = db && db.users.find((x) => x.id === +m[2]);
    return !!(u && u.active && canBuild(u) && (u.sessions || []).some((x) => x.sid === m[3] && x.exp > Date.now() / 1000));
  };
  /** MCP (Streamable HTTP, JSON responses) — mirror of api/mcp.php. Returns {status, body|null, headers}. */
  adminApi.mcp = async function (req, body) {
    const H = { "WWW-Authenticate": 'Bearer realm="woodex-mcp"' }, rid = body && typeof body === "object" && !Array.isArray(body) ? (body.id ?? null) : null;
    const rpc = (result, error, status = 200, headers) => ({ status, headers, body: { jsonrpc: "2.0", id: rid, ...(error ? { error } : { result }) } });
    const text = (d, isError = false) => ({ content: [{ type: "text", text: typeof d === "string" ? d : JSON.stringify(d, null, 2) }], isError });
    const m0 = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || "").trim()), raw = m0 ? m0[1] : new URL(req.url, "http://x").searchParams.get("key") || "";
    const M = mLoad(), T = raw && M.tokens.find((t) => t.hash === sha(raw));
    if (!T) return rpc(null, { code: -32001, message: "Missing or invalid token. Create one in Woodex Admin → Settings → AI Agent." }, 401, H);
    if (T.off) return rpc(null, { code: -32001, message: "This token is switched off. Turn it on in Woodex Admin → Settings → Integrations → API keys." }, 401, H);
    const db0 = load(), user = db0 && db0.users.find((x) => x.id === T.user_id && x.active);
    if (!user) return rpc(null, { code: -32001, message: "The Admin user of this token is inactive" }, 401, H);
    if (!body || Array.isArray(body) || body.jsonrpc !== "2.0" || !body.method) return rpc(null, { code: Array.isArray(body) ? -32600 : -32700, message: Array.isArray(body) ? "Batch requests are not supported" : "Invalid JSON-RPC request" }, 400);
    if (!("id" in body)) return { status: 202, body: null };
    const logCall = (tool, ok, note = "") => { const m = mLoad(); const t = m.tokens.find((x) => x.id === T.id); if (t) { t.last_used = now(); t.uses = (t.uses || 0) + 1; } m.log.push({ t: now(), token: T.name, tool, ok, note: String(note).slice(0, 160), ip: req.socket.remoteAddress || "" }); m.log = m.log.slice(-500); jw(MFILE, m); };
    const P = body.params || {}, VER = ["2025-06-18", "2025-03-26", "2024-11-05"];
    const call = async (action, inp = {}) => { const r2 = { headers: {}, socket: req.socket, url: "/api/admin.php", _wxAs: user.id }; try { return await adminApi(r2, { ...inp, action }); } catch (e) { return { ok: false, error: e instanceof Fail ? e.message : "Server error" }; } };
    const S = (props = {}, req2 = []) => ({ type: "object", properties: props, required: req2 }), st = (d) => ({ type: "string", description: d }), it = (d) => ({ type: "integer", description: d });
    const TOOLS = {
      list_leads: ["Lists website enquiries (leads) newest first. Filter by stage or a search word.", S({ stage: st("new, contacted, visit, quote, won or lost"), search: st("Matches name, phone, email, service or message"), limit: it("Max rows (default 25, max 200)") }), true],
      get_lead: ["Full details of one lead including its notes/history.", S({ id: it("Lead id") }, ["id"]), true],
      add_lead_note: ["Adds a note to a lead (marked as written by the AI agent). Does not change the stage.", S({ id: it("Lead id"), text: st("Note text") }, ["id", "text"]), false],
      list_quotes: ["Lists quotations (number, client, status, total).", S({ status: st("draft, sent, approved, invoiced, rejected, superseded"), search: st("Matches number, client or project"), limit: it("Max rows (default 25)") }), true],
      get_quote: ["Full quotation with sections, items and totals.", S({ id: it("Quotation id") }, ["id"]), true],
      create_quote_draft: ["Creates a NEW quotation as a draft for the team to review. It is never sent to the client. Units: sft, rft, sqmt, nos, each, set, point, job, lumpsum.", S({ client: { type: "object", properties: { name: st("Client name"), phone: st("Phone"), email: st("Email"), address: st("Address") }, required: ["name"] }, project: st("Project title"), site: st("Site address"), kind: st("residential, commercial, renovation, fitout or other"), sections: { type: "array", items: { type: "object", properties: { name: st("Section name, e.g. Kitchen"), items: { type: "array", items: { type: "object", properties: { desc: st("Description"), qty: { type: "number" }, unit: st("Unit"), rate: { type: "number", description: "Rate in PKR" } }, required: ["desc"] } } } } }, notes: st("Internal/client notes"), lead_id: it("Link to this lead (optional)") }, ["client"]), false],
      list_clients: ["Lists clients with contact details.", S({ search: st("Matches name, phone or email"), limit: it("Max rows (default 50)") }), true],
      list_pages: ["Lists all website pages with title, description, URL and SEO status.", S(), true],
      site_stats: ["Dashboard numbers: pages, leads this month, unread leads, quotation and sales totals.", S(), true],
      monthly_report: ["Report for one month: leads by source and stage, won/lost, quotations and their value.", S({ month: st("YYYY-MM (default: current month)") }), true],
      whatsapp_stats: ["WhatsApp button clicks (today, 7 and 30 days), top pages and services, WhatsApp leads.", S(), true],
      list_content: ["Lists articles (post), portfolio studies (study) or city pages (city) with id, title, address, status and template.", S({ type: st("post, study or city"), search: st("Matches the title or address") }, ["type"]), true],
      get_content: ["Full fields of one article or portfolio study.", S({ id: it("Content id") }, ["id"]), true],
      list_templates: ["Lists page templates (layout presets) for post, study or city.", S({ type: st("post, study or city") }), true],
      save_content_draft: ["Creates a NEW article/portfolio draft, or updates an existing one (pass id). Never publishes.", S({ type: st("post or study"), id: it("Existing item id"), title: st("Title"), slug: st("Address"), kicker: st("Kicker"), dek: st("Standfirst"), body: st("Markdown body"), summary: { type: "array", items: { type: "string" } }, faqs: { type: "array", items: { type: "object" } }, meta: { type: "array", items: { type: "object" } }, quote: st("Pull quote"), template: it("Template id") }, ["type"]), false],
      create_city_draft: ["Creates a DRAFT city page by copying a template city and swapping the name.", S({ city: st("City name"), source: st("City address to copy (default lahore)") }, ["city"]), false],
      create_blog_draft: ["Creates an Insights blog post as a DRAFT (not published). Body in simple markdown: \"## Heading\", \"- list item\", blank line between paragraphs.", S({ title: st("Post title"), slug: st("Page address (optional)"), excerpt: st("1–2 sentence summary"), body: st("Article body in simple markdown") }, ["title", "body"]), false],
    };
    switch (body.method) {
      case "initialize": logCall("initialize", true, (P.clientInfo || {}).name || ""); return rpc({ protocolVersion: VER.includes(P.protocolVersion) ? P.protocolVersion : VER[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "woodex-admin", title: "Woodex Interior Admin", version: "1.0.0" }, instructions: "Woodex Interior (Lahore) admin data. Currency is PKR. You can read leads, quotations, clients, pages and reports, and create drafts (quotation, blog post) or lead notes. Drafts are reviewed by the team before anything is sent or published. Signed in as " + user.name + " (" + user.role + ")." });
      case "ping": return rpc({});
      case "tools/list": return rpc({ tools: Object.entries(TOOLS).map(([name, [description, inputSchema, ro]]) => ({ name, description, inputSchema, annotations: { readOnlyHint: ro, destructiveHint: false, idempotentHint: ro, openWorldHint: false } })) });
      case "resources/list": return rpc({ resources: [] });
      case "prompts/list": return rpc({ prompts: [] });
      case "tools/call": break;
      default: return rpc(null, { code: -32601, message: "Method not found: " + body.method });
    }
    const tool = String(P.name || ""), a = P.arguments || {};
    if (!TOOLS[tool]) return rpc(null, { code: -32602, message: "Unknown tool: " + tool });
    const has = (row, q, keys) => !q || keys.some((k) => String(typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k] ?? "").toLowerCase().includes(q.toLowerCase()));
    const lim = (v, d, mx = 200) => (+v > 0 ? Math.min(+v, mx) : d);
    const pick = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
    const LK = ["id", "created_at", "name", "phone", "email", "service", "message", "stage", "source", "page", "value", "followup", "assigned_name", "tags", "lost_reason"];
    const run = async (action, inp, post) => { const r = await call(action, inp); if (!r.ok) { logCall(tool, false, r.error); return rpc(text(r.error || "Failed", true)); } const { ok, ...rest } = r, out = post ? post(r) : rest; logCall(tool, typeof out !== "string"); return rpc(text(out, typeof out === "string")); };
    switch (tool) {
      case "list_leads": return run("leads_list", {}, (r) => { const rows = r.leads.filter((l) => (!a.stage || l.stage === a.stage) && has(l, String(a.search || "").trim(), ["name", "phone", "email", "service", "message"])).slice(0, lim(a.limit, 25)); return { count: rows.length, stages: r.stages, leads: rows.map((l) => ({ ...pick(l, LK), notes: (l.notes || []).length })) }; });
      case "get_lead": return run("leads_list", {}, (r) => { const l = r.leads.find((x) => +x.id === +a.id); return l ? { ...pick(l, LK), notes: l.notes || [] } : "Lead not found"; });
      case "add_lead_note": if (!String(a.text || "").trim()) return rpc(text("Write a note first", true)); return run("lead_note", { id: +a.id, text: "[AI agent · " + T.name + "] " + String(a.text).trim() }, (r) => ({ ok: true, lead: r.lead && r.lead.id, message: "Note added" }));
      case "list_quotes": return run("quotes_list", {}, (r) => { const rows = r.quotes.filter((x) => (!a.status || x.status === a.status) && has(x, String(a.search || "").trim(), ["no", "client", "project"])).slice(0, lim(a.limit, 25)); return { count: rows.length, quotes: rows.map((x) => pick(x, ["id", "no", "label", "version", "option", "status", "client", "project", "site", "kind", "date", "total", "subtotal", "created_by", "created_at", "sent_at", "approved_at", "lead_id"])) }; });
      case "get_quote": return run("quote_get", { id: +a.id }, (r) => { const { history, ...q } = r.quote; return { quote: q, versions: r.family, invoice: r.invoice ? { no: r.invoice.no, status: r.invoice.status } : null }; });
      case "create_quote_draft": { const inp = pick(a, ["client", "project", "site", "kind", "sections", "notes", "lead_id"]); inp.notes = (String(inp.notes || "") + "\n(Draft prepared by AI agent: " + T.name + ")").trim(); return run("quote_save", inp, (r) => ({ ok: true, id: r.quote.id, no: r.quote.no, status: r.quote.status, total: r.quote.total, message: "Draft saved. Open Admin → Quotations to review and send it." })); }
      case "list_clients": return run("clients_list", {}, (r) => { const rows = (r.clients || []).filter((c) => has(c, String(a.search || "").trim(), ["name", "phone", "email", "company"])).slice(0, lim(a.limit, 50)); return { count: rows.length, clients: rows }; });
      case "list_pages": return run("pages_list", {}, (r) => ({ count: r.pages.length, pages: r.pages }));
      case "site_stats": return run("dashboard", {}, (r) => r.stats);
      case "whatsapp_stats": return run("wa_stats", {});
      case "monthly_report": {
        const mo = /^\d{4}-\d{2}$/.test(a.month || "") ? a.month : new Date().toISOString().slice(0, 7);
        const L = await call("leads_list"), Q = await call("quotes_list"); if (!L.ok || !Q.ok) { logCall(tool, false, L.error || Q.error); return rpc(text(L.error || Q.error, true)); }
        const ls = L.leads.filter((l) => String(l.created_at).slice(0, 7) === mo), cnt = (k) => ls.reduce((o, l) => ((o[l[k]] = (o[l[k]] || 0) + 1), o), {});
        const qs = Q.quotes.filter((x) => String(x.created_at || "").slice(0, 7) === mo), ap = Q.quotes.filter((x) => String(x.approved_at || "").slice(0, 7) === mo), val = (xs) => xs.reduce((s, x) => s + (+x.total || 0), 0);
        logCall(tool, true); return rpc(text({ month: mo, leads: ls.length, leadsBySource: cnt("source"), leadsByStage: cnt("stage"), quotationsCreated: qs.length, quotationsValue: val(qs), quotationsApproved: ap.length, approvedValue: val(ap), currency: "PKR" }));
      }
      case "list_content": case "get_content": case "list_templates": case "save_content_draft": case "create_city_draft": {
        const C = jr(CMS, {}), items = C.items || [], ty = String(a.type || "");
        const md = (src) => { const b = []; for (const chunk of String(src).replace(/\r/g, "").trim().split(/\n{2,}/)) { for (const ln of chunk.split("\n").map((x) => x.trim()).filter(Boolean)) { let m; if ((m = /^#{1,4}\s+(.+)$/.exec(ln))) b.push({ t: "h", text: m[1] }); else if ((m = /^[-*•]\s+(.+)$/.exec(ln))) { const l = b[b.length - 1]; if (l && l.t === "list") l.items.push(m[1]); else b.push({ t: "list", items: [m[1]] }); } else { const l = b[b.length - 1]; if (l && l.t === "p" && !l.end) l.text += " " + ln; else b.push({ t: "p", text: ln }); } } const l = b[b.length - 1]; if (l) l.end = true; } return b.map(({ end, ...x }) => x).slice(0, 120); };
        if (tool === "list_content") { if (!["post", "study", "city"].includes(ty)) return rpc(text("type must be post, study or city", true)); const q = String(a.search || "").toLowerCase(); const rows = items.filter((x) => x.type === ty && (!q || (x.title + " " + x.slug).toLowerCase().includes(q))).map((x) => ({ id: x.id, title: x.title, slug: x.slug, status: x.status, live: !!x.rel, template: +(x.data && x.data.tpl) || 0 }));
          if (ty === "city") for (const d of fs.readdirSync(ROOT)) { const f = path.join(ROOT, d, "index.html"); if (fs.existsSync(f) && /<body[^>]*data-page="city"/.test(fs.readFileSync(f, "utf8")) && (!q || d.includes(q))) rows.push({ slug: d, status: "published", live: true }); }
          logCall(tool, true); return rpc(text({ count: rows.length, items: rows })); }
        if (tool === "get_content") { const x = items.find((i) => i.id === +a.id && ["post", "study"].includes(i.type)); if (!x) return rpc(text("Article / study not found", true)); logCall(tool, true); return rpc(text(x)); }
        if (tool === "list_templates") { const L = (C.tpls || []).filter((t) => !ty || t.type === ty); logCall(tool, true); return rpc(text({ count: L.length, templates: L })); }
        if (tool === "save_content_draft") {
          if (!["post", "study"].includes(ty)) return rpc(text("type must be post or study", true));
          const old = a.id ? items.find((i) => i.id === +a.id && i.type === ty) : null; if (a.id && !old) return rpc(text("Item not found", true));
          const title = String(a.title || (old && old.title) || "").trim(); if (!title) return rpc(text("title is required for a new item", true));
          const d = { ...((old && old.data) || {}) }; for (const k of ["kicker", "dek", "quote"]) if (k in a) d[k] = clip(a[k], 600);
          if (String(a.body || "").trim()) d.blocks = md(a.body); if (Array.isArray(a.summary)) d.summary = a.summary.map((x) => clip(x, 400)).slice(0, 12);
          if (Array.isArray(a.faqs)) d.faqs = a.faqs.map((f) => ({ q: clip(f.q, 300), a: clip(f.a, 1500) })).filter((f) => f.q && f.a).slice(0, 15); if (Array.isArray(a.meta)) d.meta = a.meta.map((m) => ({ k: clip(m.k, 40), v: clip(m.v, 80) })).slice(0, 8);
          if ("template" in a) { const tv = +a.template || 0; if (tv) { if (!(C.tpls || []).some((t) => t.id === tv && t.type === ty)) return rpc(text("Template not found for this type (see list_templates)", true)); d.tpl = tv; } else delete d.tpl; }
          d.aiAgent = T.name; d.aiEdited = now();
          let inp; if (old) inp = { id: old.id, type: ty, title, slug: old.slug, data: d, seo: old.seo || {} };
          else { let slug = (String(a.slug || "").toLowerCase().trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).replace(/[^a-z0-9-]/g, "").slice(0, 60) || ty + "-" + Date.now(); if (items.some((x) => x.type === ty && x.slug === slug)) slug = slug.slice(0, 50) + "-" + Math.random().toString(16).slice(2, 7); inp = { type: ty, title, slug, status: "draft", data: d, seo: { desc: clip(a.dek, 160) } }; }
          return run("cms_save", inp, (r) => ({ ok: true, id: r.item && r.item.id, slug: r.item && r.item.slug, status: r.item && r.item.status, message: r.item && r.item.rel ? "Saved. The live page updates when the team presses Publish in Admin." : "Draft saved. The team reviews and publishes it in Admin." }));
        }
        const city = String(a.city || "").trim().replace(/\s+/g, " "), slug = city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); if (!slug) return rpc(text("city is required", true));
        const src = String(a.source || "lahore").toLowerCase().replace(/[^a-z0-9-]/g, "") || "lahore", sf = path.join(ROOT, src, "index.html"); let html = fs.existsSync(sf) ? fs.readFileSync(sf, "utf8") : "";
        if (!/<body[^>]*data-page="city"/.test(html)) return rpc(text("Source is not a city page", true));
        const m = /<title>[^<]*?in ([^|<]+?)\s*(\||<\/title>)/.exec(html), sn = m ? m[1].trim() : src; const hs = html.indexOf("<head"), he = html.indexOf("</head>"), ms = html.indexOf("<main"), me = html.indexOf("</main>");
        const sw = (s) => s.split("/" + src + "/").join("/" + slug + "/").replace(new RegExp("\\b" + sn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), city);
        html = html.slice(0, hs) + sw(html.slice(hs, he)) + html.slice(he, ms) + sw(html.slice(ms, me)) + html.slice(me);
        return run("cms_save", { type: "city", title: city.replace(/\b\w/g, (c) => c.toUpperCase()), slug, data: { html, source: src, aiAgent: T.name } }, (r) => ({ ok: true, id: r.item && r.item.id, slug, status: "draft", message: "City draft saved. Review it in Admin → City pages, then publish." }));
      }
      case "create_blog_draft": {
        const title = String(a.title || "").trim(), bodyMd = String(a.body || ""); if (!title || !bodyMd.trim()) return rpc(text("Title and body are required", true));
        let slug = (String(a.slug || "").toLowerCase().trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).replace(/[^a-z0-9-]/g, "").slice(0, 60) || "post-" + Date.now();
        const blocks = []; for (const chunk of bodyMd.replace(/\r/g, "").trim().split(/\n{2,}/)) { let para = null; for (const ln of chunk.split("\n").map((x) => x.trim()).filter(Boolean)) { let m; if ((m = /^#{1,4}\s+(.+)$/.exec(ln))) { blocks.push({ t: "h", text: m[1].slice(0, 200) }); para = null; } else if ((m = /^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(ln))) { const last = blocks[blocks.length - 1]; if (last && last.t === "list") last.items.push(m[1]); else blocks.push({ t: "list", items: [m[1]] }); para = null; } else if ((m = /^>\s*(.+)$/.exec(ln))) { blocks.push({ t: "quote", text: m[1] }); para = null; } else if (para) para.text += " " + ln; else { para = { t: "p", text: ln }; blocks.push(para); } } }
        return run("cms_save", { type: "post", title, slug, status: "draft", data: { excerpt: clip(a.excerpt, 300), blocks: blocks.slice(0, 120), aiAgent: T.name }, seo: { description: clip(a.excerpt, 160) } }, (r) => ({ ok: true, id: r.item && r.item.id, slug, status: "draft", message: "Draft saved. Open Admin → Insights to add a hero image, review and publish." }));
      }
    }
  };
  /** Client quotation view (mirror of api/quote-view.php) → {status, html} */
  adminApi.quoteView = function (id, t) {
    const db = load(), q = db && (db.quotes || []).find((x) => x.id === +id);
    const e = (m) => ({ status: 404, html: '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh"><h1 style="font-size:22px">' + m + "</h1>" });
    if (!q || !/^[a-f0-9]{32}$/.test(String(t)) || qViewTok(q) !== t) return e("This quotation link is not valid.");
    if (q.status === "superseded") return e("This quotation has been replaced by a newer version.");
    if (!q.viewed_at || Date.parse(q.viewed_at.replace(" ", "T")) < Date.now() - 432e5) { q.viewed_at = now(); q.views = (q.views || 0) + 1; q.history.push({ t: now(), user: "Client", text: "Viewed online" }); save(db); }
    const c = companyCfg(), { history, notes, created_by, lead_id, client_id, last_sent, ...pq } = q; pq.label = qLabel(q);
    const J = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
    const html = fs.readFileSync(path.join(ROOT, "api", "quote-view.php"), "utf8").split("?>").slice(1).join("?>")
      .replace(/<\?= htmlspecialchars\(\$title\) \?>/, "Quotation " + qLabel(q)).replace(/<\?= htmlspecialchars\(q_label\(\$x\)\) \?>/, qLabel(q))
      .replace(/<\?= htmlspecialchars\(\(string\)\$x\['client'\]\['name'\]\) \?>/, q.client.name.replace(/</g, "&lt;")).replace(/<\?= number_format\(\(float\)\$x\['total'\]\) \?>/, Math.round(q.total).toLocaleString("en-US"))
      .replace(/<\?php if \(\$wa\): \?>[\s\S]*?<\?php endif; \?>/, "").replace("<?= json_encode($q, $J) ?>", J(pq)).replace("<?= json_encode($c, $J) ?>", J(c));
    return { status: 200, html };
  };
  adminApi.chat = chatPublic;
  adminApi.r404 = (body, ipAddr) => { try { const b = JSON.parse(body || "{}"); rd404Log(b.p, b.r, ipAddr); } catch {} };
  adminApi.forms = formsApi; adminApi.backupFile = backupFile; adminApi.rawAction = rawAction;
  adminApi.publicGuard = function (rel, req) {
    const mt = sysCfg(); // P18 H: maintenance mode (preview mimics the .htaccess 503 rule)
    if (mt.on && (/[?&]asvisitor=1/.test((req && req.url) || "") || (!/^(500|503|404|coming-soon)\.html$|^(robots\.txt|favicon\.ico|sitemap\.xml)$/.test(rel) && !new RegExp("(^|;\\s*)wx_mt=" + mt.token).test((req && req.headers.cookie) || "")))) return { maint: "coming-soon.html" }; // P19 B3
    // preview-only: mimic the managed .htaccess rules (redirects, drafts 404)
    const url = "/" + rel.replace(/index\.html$/, ""), u2 = (url.endsWith("/") ? url : url + "/").toLowerCase(), c = rdCfg();
    if (c.spam && /(casino|gokkasten|gokautomat|blackjack|roulette|free-spins|itm-[0-9]{4,})/i.test(url)) return { gone: true };
    const r = jr(REDIR, []).map(rdOne).find((x) => x.on && (x.match === "prefix" ? u2.startsWith(x.from.toLowerCase()) : x.from.toLowerCase() === u2));
    if (r) return r.type === 410 ? { gone: true } : { redirect: r.to, code: r.type };
    const m = jr(PMETA, {})[rel]; if (m && m.status === "draft") return { notFound: true };
    return null;
  };
  return adminApi;
}
export { Fail as AdminFail };
