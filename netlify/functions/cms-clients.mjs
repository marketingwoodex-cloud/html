// Dashboard API: clients. Requires CMS session.
// GET /.netlify/functions/cms-clients[?q=]
// POST { name*, company?, phone?, email?, address?, notes? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest, cleanSearch } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const q = cleanSearch(url.searchParams.get("q"));
    let query = "?select=*&order=created_at.desc&limit=200";
    if (q) query += `&or=(name.ilike.*${encodeURIComponent(q)}*,company.ilike.*${encodeURIComponent(q)}*,phone.ilike.*${encodeURIComponent(q)}*)`;
    const { status, data } = await sbRest("clients", { query });
    if (status !== 200) return json(502, { error: "Could not load clients." });
    return json(200, { clients: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const name = clean(body?.name, 120);
    if (name.length < 2) return json(400, { error: "Name is required." });
    const row = {
      name,
      company: clean(body?.company, 120) || null,
      phone: clean(body?.phone, 30) || null,
      email: clean(body?.email, 160) || null,
      address: clean(body?.address, 300) || null,
      notes: clean(body?.notes, 2000) || null,
    };
    const { status, data } = await sbRest("clients", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not add client." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "clients", text: `Client "${name}" added` } }).catch(() => {});
    return json(200, { client: created });
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
    for (const f of ["company", "phone", "email", "address", "notes"]) {
      if (body?.[f] !== undefined) patch[f] = clean(body[f], f === "notes" ? 2000 : f === "address" ? 300 : 160) || null;
    }
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("clients",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    const refetch = await sbRest("clients", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    await sbRest("activity", { method: "POST",
      body: { kind: "clients", text: `Client "${saved?.name || id}" updated` } }).catch(() => {});
    return json(200, { client: saved });
  }

  if (req.method === "DELETE") {
    const cur = await sbRest("clients", { query: `?select=name&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status } = await sbRest("clients", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "clients", text: `Client "${row.name}" removed` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
