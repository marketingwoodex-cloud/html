// Shared session-token helpers for the Woodex CMS functions.
// Session tokens are HMAC-signed (CMS_SESSION_SECRET) so the browser never
// holds the GitHub token; every privileged function verifies the session.
//
// verifySession() is async and performs a LIVE check: besides the HMAC +
// expiry, it confirms the user still exists and is active in cms_users (or is
// the legacy env admin), and resolves the role from the database so a
// demotion, promotion, or deactivation takes effect on the very next request.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export const sha256hex = (value) =>
  createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

export function issueSession(username, role) {
  const secret = process.env.CMS_SESSION_SECRET || "";
  const now = Date.now();
  const payload = b64url(JSON.stringify({ u: username, r: role || "admin", iat: now, exp: now + 12 * 3600 * 1000 }));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

// Sync part only: HMAC signature + expiry. Used by the adapter for cheap
// session-refresh checks; endpoints must use the async verifySession().
export function verifySessionLocal(token) {
  try {
    const secret = process.env.CMS_SESSION_SECRET || "";
    if (!secret || !token || typeof token !== "string") return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = b64url(createHmac("sha256", secret).update(payload).digest());
    if (!safeEqual(sig, expected)) return null;
    const data = JSON.parse(unb64url(payload).toString("utf8"));
    if (!data.u || !data.exp || Date.now() > data.exp) return null;
    const role = ["admin", "editor", "viewer"].includes(data.r) ? data.r : "admin";
    return { username: data.u, role, iat: data.iat || 0 };
  } catch {
    return null;
  }
}

export async function verifySession(token) {
  const base = verifySessionLocal(token);
  if (!base) return null;
  // Legacy env-configured admin is not in cms_users; always valid once signed.
  const envAdmin = process.env.CMS_ADMIN_USER || "";
  if (envAdmin && base.username === envAdmin) return base;
  // Live check: user must exist and be active; role is resolved from the DB.
  try {
    if (!sbConfigured()) return null;
    const { status, data } = await sbRest("cms_users", {
      query: `?select=username,role,active&username=eq.${encodeURIComponent(base.username)}&limit=1`,
    });
    const row = status === 200 && data && data[0];
    if (!row || row.active === false) return null;
    const role = ["admin", "editor", "viewer"].includes(row.role) ? row.role : "viewer";
    return { username: row.username, role, iat: base.iat };
  } catch {
    return null;
  }
}

// Editor and admin can change data; viewer is read-only.
export const canWrite = (user) => Boolean(user && user.role !== "viewer");
export const isAdmin = (user) => Boolean(user && user.role === "admin");

export const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const bearerSession = (req) => {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
};
