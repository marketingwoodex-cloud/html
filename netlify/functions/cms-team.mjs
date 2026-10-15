// Dashboard API: team members. Requires CMS session.
// GET /.netlify/functions/cms-team[?q=]
// POST { name*, role?, photo?, phone? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest, cleanSearch } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const validPhoto = (u) => /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(String(u || ""));

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const q = cleanSearch(url.searchParams.get("q"));
    let query = "?select=*&order=created_at.asc&limit=200";
    if (q) query += `&name=ilike.*${encodeURIComponent(q)}*`;
    const { status, data } = await sbRest("team", { query });
    if (status !== 200) return json(502, { error: "Could not load team." });
    return json(200, { team: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const name = clean(body?.name, 120);
    if (name.length < 2) return json(400, { error: "Name is required." });
    const row = {
      name,
      role: clean(body?.role, 80) || null,
      photo: validPhoto(body?.photo) ? clean(body.photo, 500) : null,
      phone: clean(body?.phone, 30) || null,
    };
    const { status, data } = await sbRest("team", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not add team member." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "team", text: `Team member "${name}" added` } }).catch(() => {});
    return json(200, { member: created });
  }

  const id = body?.id || new URL(req.url).searchParams.get("id");
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.name !== undefined) {
      const n = clean(body.name, 120);
      if (n.length < 2) return json(400, { error: "Name is required." });
      patch.name = n;
    }
    if (body?.role !== undefined) patch.role = clean(body.role, 80) || null;
    if (body?.photo !== undefined) patch.photo = validPhoto(body.photo) ? clean(body.photo, 500) : null;
    if (body?.phone !== undefined) patch.phone = clean(body.phone, 30) || null;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("team",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    const refetch = await sbRest("team", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    await sbRest("activity", { method: "POST",
      body: { kind: "team", text: `Team member "${saved?.name || id}" updated` } }).catch(() => {});
    return json(200, { member: saved });
  }

  if (req.method === "DELETE") {
    const cur = await sbRest("team", { query: `?select=name&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status } = await sbRest("team", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "team", text: `Team member "${row.name}" removed` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
