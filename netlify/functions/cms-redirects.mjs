// Dashboard API: SEO redirects. Requires CMS session.
// GET /.netlify/functions/cms-redirects
// POST { from_path*, to_path*, active? }
// PATCH { id, from_path?, to_path?, active? }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";
import { syncQuietly } from "./_redirects-sync.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const validFrom = (p) => typeof p === "string" && p.startsWith("/") && p.length > 1 && p.length <= 200 && !/\s/.test(p);
const validTo = (p) => typeof p === "string" && (/^\//.test(p) || /^https?:\/\//i.test(p)) && p.length <= 500 && !/\s/.test(p);

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const { status, data } = await sbRest("redirects", { query: "?select=*&order=created_at.desc&limit=500" });
    if (status !== 200) return json(502, { error: "Could not load redirects." });
    return json(200, { redirects: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const from_path = clean(body?.from_path, 200);
    const to_path = clean(body?.to_path, 500);
    if (!validFrom(from_path)) return json(400, { error: "from_path must start with /." });
    if (!validTo(to_path)) return json(400, { error: "to_path must start with / or http." });
    const row = { from_path, to_path, active: body?.active !== false };
    const { status, data } = await sbRest("redirects", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not add redirect." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "seo", text: `Redirect ${from_path} -> ${to_path} added` } }).catch(() => {});
    const warning = await syncQuietly();
    return json(200, { redirect: created, ...(warning ? { warning } : {}) });
  }

  const id = body?.id || new URL(req.url).searchParams.get("id");
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.from_path !== undefined) {
      const f = clean(body.from_path, 200);
      if (!validFrom(f)) return json(400, { error: "from_path must start with /." });
      patch.from_path = f;
    }
    if (body?.to_path !== undefined) {
      const t = clean(body.to_path, 500);
      if (!validTo(t)) return json(400, { error: "to_path must start with / or http." });
      patch.to_path = t;
    }
    if (body?.active !== undefined) patch.active = body.active === true;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("redirects",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    const refetch = await sbRest("redirects", { query: `?select=*&id=eq.${id}&limit=1` });
    const warning = await syncQuietly();
    return json(200, { redirect: refetch.data?.[0] || null, ...(warning ? { warning } : {}) });
  }

  if (req.method === "DELETE") {
    const { status } = await sbRest("redirects", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    const warning = await syncQuietly();
    return json(200, { ok: true, ...(warning ? { warning } : {}) });
  }

  return json(405, { error: "Method not allowed." });
};
