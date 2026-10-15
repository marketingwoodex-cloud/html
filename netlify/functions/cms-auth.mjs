// Woodex CMS auth — verifies the dashboard username/password and issues a
// short-lived HMAC session token. The GitHub token never leaves the server.
//
// Two credential sources:
//   1. Env vars CMS_ADMIN_USER / CMS_ADMIN_PASS_SHA256 (the main admin, role admin)
//   2. The cms_users table (admin-created users with admin/editor/viewer roles)
import { issueSession, json, safeEqual, sha256hex } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const MAX_ATTEMPTS = 25;
const WINDOW_MS = 10 * 60 * 1000;
// In-memory counter is only a fallback for when Supabase is unreachable.
// The real enforcement is shared across all serverless instances via the
// activity table (kind = "login_fail", text = client IP).
const memAttempts = new Map();

const clientIp = (req) =>
  req.headers.get("x-nf-client-connection-ip") ||
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  "unknown";

// Cross-instance failed-login count inside the window. Returns null when the
// shared store cannot be reached (caller falls back to the memory counter).
async function sharedFailCount(kind, key) {
  try {
    if (!sbConfigured() || !key) return null;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { status, data } = await sbRest("activity", {
      query: `?select=id&kind=eq.${kind}&text=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(since)}&limit=100`,
    });
    if (status !== 200 && status !== 206) return null;
    return (data || []).length;
  } catch {
    return null;
  }
}

async function recordFail(ip, username) {
  const now = Date.now();
  const e = memAttempts.get(ip);
  if (!e || now > e.resetAt) memAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else e.count += 1;
  try {
    if (!sbConfigured()) return;
    const rows = [{ kind: "login_fail", text: ip }];
    if (username) rows.push({ kind: "login_fail_user", text: username });
    for (const row of rows) {
      await sbRest("activity", { method: "POST", body: row });
    }
    // Opportunistic pruning so brute-force rows never pile up.
    const cutoff = new Date(now - 2 * WINDOW_MS).toISOString();
    await sbRest("activity", {
      method: "DELETE",
      query: `?kind=in.(login_fail,login_fail_user)&created_at=lt.${encodeURIComponent(cutoff)}`,
    }).catch(() => {});
  } catch { /* memory counter still enforced */ }
}

async function clearFails(ip, username) {
  memAttempts.delete(ip);
  try {
    if (!sbConfigured()) return;
    await sbRest("activity", {
      method: "DELETE",
      query: `?kind=eq.login_fail&text=eq.${encodeURIComponent(ip)}`,
    }).catch(() => {});
    if (username) {
      await sbRest("activity", {
        method: "DELETE",
        query: `?kind=eq.login_fail_user&text=eq.${encodeURIComponent(username)}`,
      }).catch(() => {});
    }
  } catch {}
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const ip = clientIp(req);
  const now = Date.now();
  let body = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }
  const uname = typeof body?.username === "string" ? body.username.trim().toLowerCase().slice(0, 40) : "";
  // Enforce both buckets: per-IP (naive brute force) and per-username
  // (distributed brute force from rotating IPs).
  const overLimit = async (kind, key, memKey) => {
    const shared = await sharedFailCount(kind, key);
    if (shared !== null) return shared >= MAX_ATTEMPTS;
    const e = memKey && memAttempts.get(memKey);
    return !!(e && now <= e.resetAt && e.count >= MAX_ATTEMPTS);
  };
  if ((await overLimit("login_fail", ip, ip)) || (uname && (await overLimit("login_fail_user", uname, null)))) {
    return json(429, { error: "Too many attempts. Please wait a few minutes." });
  }

  const expectedUser = process.env.CMS_ADMIN_USER || "";
  const expectedPassHash = process.env.CMS_ADMIN_PASS_SHA256 || "";
  const secret = process.env.CMS_SESSION_SECRET || "";

  const userOk = expectedUser !== "" && safeEqual(body?.username, expectedUser);
  const passOk =
    expectedPassHash !== "" &&
    /^[0-9a-f]{64}$/i.test(expectedPassHash) &&
    safeEqual(sha256hex(body?.password), expectedPassHash.toLowerCase());

  if (userOk && passOk && secret) {
    await clearFails(ip, expectedUser.toLowerCase());
    return json(200, { session: issueSession(expectedUser, "admin"), username: expectedUser, role: "admin" });
  }

  // Fall back to dashboard-managed users.
  if (secret && sbConfigured() && typeof body?.username === "string" && typeof body?.password === "string") {
    try {
      const uname = body.username.trim().toLowerCase();
      const { status, data } = await sbRest("cms_users", {
        query: `?select=id,username,pass_sha256,role,active&username=eq.${encodeURIComponent(uname)}&limit=1`,
      });
      const row = status === 200 && data && data[0];
      if (row && row.active && /^[0-9a-f]{64}$/i.test(row.pass_sha256 || "") &&
          safeEqual(sha256hex(body.password), String(row.pass_sha256).toLowerCase())) {
        const role = ["admin", "editor", "viewer"].includes(row.role) ? row.role : "viewer";
        await clearFails(ip, row.username);
        return json(200, { session: issueSession(row.username, role), username: row.username, role });
      }
    } catch { /* fall through to 401 */ }
  }

  await recordFail(ip, uname);
  return json(401, { error: "Incorrect username or password." });
};
