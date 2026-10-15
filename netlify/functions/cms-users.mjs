// Dashboard API: CMS users. Admin role only.
// GET /.netlify/functions/cms-users -> { users: [{id, username, role, active, created_at}] }
// POST { username*, password*, role? } -> create
// PATCH { id, password?, role?, active? }
// DELETE { id }
import { bearerSession, isAdmin, json, sha256hex, verifySession } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const ROLES = ["admin", "editor", "viewer"];
const cleanName = (v) => String(v ?? "").trim().toLowerCase().slice(0, 40);

function validUsername(u) {
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u);
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (!isAdmin(user)) return json(403, { error: "Only admins can manage users." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const { status, data } = await sbRest("cms_users",
      { query: "?select=id,username,role,active,created_at&order=created_at.asc&limit=100" });
    if (status !== 200) {
      const msg = JSON.stringify(data || {});
      if (/column|relation|table/i.test(msg) && /cms_users/.test(msg))
        return json(400, { error: "The cms_users table is missing. Run the migration SQL in Supabase first." });
      return json(502, { error: "Could not load users." });
    }
    return json(200, { users: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const username = cleanName(body?.username);
    const password = String(body?.password ?? "");
    const role = ROLES.includes(body?.role) ? body.role : "editor";
    if (!validUsername(username)) return json(400, { error: "Username: 3-40 chars, letters, numbers, dot, dash, underscore." });
    if (password.length < 8) return json(400, { error: "Password must be at least 8 characters." });
    const { status, data } = await sbRest("cms_users", {
      method: "POST", body: { username, pass_sha256: sha256hex(password), role, active: true },
    });
    if (status === 409) return json(409, { error: "That username is already taken." });
    if (status !== 200 && status !== 201) return json(502, { error: "Could not create user." });
    const created = Array.isArray(data) ? data[0] : data;
    return json(200, { user: { id: created?.id, username, role, active: true } });
  }

  const id = body?.id;
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.password !== undefined) {
      const pw = String(body.password ?? "");
      if (pw && pw.length < 8) return json(400, { error: "Password must be at least 8 characters." });
      if (pw) patch.pass_sha256 = sha256hex(pw);
    }
    if (body?.role !== undefined) {
      if (!ROLES.includes(body.role)) return json(400, { error: "Invalid role." });
      patch.role = body.role;
    }
    if (body?.active !== undefined) patch.active = body.active === true;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("cms_users", { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update user." });
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const { status } = await sbRest("cms_users", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete user." });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
