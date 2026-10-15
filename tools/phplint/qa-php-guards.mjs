// Static: every `case 'x':` block in api/*-lib.php + admin.php must call need(...) (or be a known public action) before out()/jwrite/q(INSERT/UPDATE/DELETE).
import fs from "fs"; const R = "frontend-v1/api/";
const PUB = new Set(["status", "setup", "login", "login_2fa", "logout", "pw_forgot", "pw_reset", "google_cfg", "google_login", "bk_slots", "bk_public", "bk_book"]);
const bad = [];
for (const f of fs.readdirSync(R).filter((x) => /(-lib|^admin)\.php$/.test(x))) {
  const s = fs.readFileSync(R + f, "utf8"), re = /case '([a-z0-9_]+)':/g; let m; const hits = [];
  while ((m = re.exec(s))) hits.push([m[1], m.index]);
  hits.forEach(([a, i], k) => { let end = k + 1 < hits.length ? hits[k + 1][1] : i + 4000; let body = s.slice(i, end);
    if (/^\s*case '[a-z0-9_]+':\s*$/.test(body.split("\n")[0]) && body.split("\n").length <= 2) return; // fall-through label
    if (PUB.has(a)) return; if (/need\(|\$u = \$U\b|require_user|need_user|\$GLOBALS\['WX_U'\]/.test(body)) return;
    if (/out\(|jwrite|q\(/.test(body)) bad.push(f + ": " + a); });
}
console.log(bad.length ? "Actions without an explicit permission check:\n" + bad.join("\n") : "All actions have a permission check");
