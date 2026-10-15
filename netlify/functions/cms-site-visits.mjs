// Dashboard API: site visits. Requires CMS session.
// GET /.netlify/functions/cms-site-visits[?status=scheduled]
// POST { client_name*, phone?, address?, visit_date?, notes?, enquiry_id?, status? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["scheduled", "done", "cancelled"];
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const validDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    let query = "?select=*&order=visit_date.asc.nullslast,created_at.desc&limit=200";
    if (STATUSES.includes(status)) query += `&status=eq.${status}`;
    const { status: s, data } = await sbRest("site_visits", { query });
    if (s !== 200) return json(502, { error: "Could not load site visits." });
    return json(200, { visits: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const client_name = clean(body?.client_name, 120);
    if (client_name.length < 2) return json(400, { error: "Client name is required." });
    const status = STATUSES.includes(body?.status) ? body.status : "scheduled";
    const row = {
      client_name,
      phone: clean(body?.phone, 30) || null,
      address: clean(body?.address, 300) || null,
      visit_date: validDate(body?.visit_date),
      notes: clean(body?.notes, 2000) || null,
      status,
      enquiry_id: UUID.test(body?.enquiry_id || "") ? body.enquiry_id : null,
    };
    const { status: s, data } = await sbRest("site_visits", { method: "POST", body: row });
    if (s !== 201 && s !== 200) return json(502, { error: "Could not schedule visit." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "visits", text: `Site visit scheduled for "${client_name}"` } }).catch(() => {});
    return json(200, { visit: created });
  }

  const id = body?.id || new URL(req.url).searchParams.get("id");
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.client_name !== undefined) {
      const n = clean(body.client_name, 120);
      if (n.length < 2) return json(400, { error: "Client name is required." });
      patch.client_name = n;
    }
    if (body?.phone !== undefined) patch.phone = clean(body.phone, 30) || null;
    if (body?.address !== undefined) patch.address = clean(body.address, 300) || null;
    if (body?.visit_date !== undefined) patch.visit_date = validDate(body.visit_date);
    if (body?.notes !== undefined) patch.notes = clean(body.notes, 2000) || null;
    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) return json(400, { error: "Invalid status." });
      patch.status = body.status;
    }
    if (body?.enquiry_id !== undefined) patch.enquiry_id = UUID.test(body.enquiry_id || "") ? body.enquiry_id : null;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status: s } = await sbRest("site_visits",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not update." });
    const refetch = await sbRest("site_visits", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    await sbRest("activity", { method: "POST",
      body: { kind: "visits", text: `Site visit for "${saved?.client_name || id}" updated` } }).catch(() => {});
    return json(200, { visit: saved });
  }

  if (req.method === "DELETE") {
    const cur = await sbRest("site_visits", { query: `?select=client_name&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status: s } = await sbRest("site_visits", { method: "DELETE", query: `?id=eq.${id}` });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "visits", text: `Site visit for "${row.client_name}" removed` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
