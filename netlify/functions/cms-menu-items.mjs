// Dashboard API: navigation menu items. Requires CMS session.
// GET /.netlify/functions/cms-menu-items
// POST { label*, url*, position?, visible? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const { status, data } = await sbRest("menu_items", { query: "?select=*&order=position.asc&limit=200" });
    if (status !== 200) return json(502, { error: "Could not load menu items." });
    return json(200, { items: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const label = clean(body?.label, 80);
    const url = clean(body?.url, 200);
    if (label.length < 2) return json(400, { error: "Label is required." });
    if (!url) return json(400, { error: "URL is required." });
    const row = {
      label,
      url,
      position: Number.isFinite(Number(body?.position)) ? Number(body.position) : 0,
      visible: body?.visible !== false,
    };
    const { status, data } = await sbRest("menu_items", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not add menu item." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "navigation", text: `Menu item "${label}" added` } }).catch(() => {});
    return json(200, { item: created });
  }

  const id = body?.id || new URL(req.url).searchParams.get("id");
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.label !== undefined) {
      const l = clean(body.label, 80);
      if (l.length < 2) return json(400, { error: "Label is required." });
      patch.label = l;
    }
    if (body?.url !== undefined) {
      const u = clean(body.url, 200);
      if (!u) return json(400, { error: "URL is required." });
      patch.url = u;
    }
    if (body?.position !== undefined && Number.isFinite(Number(body.position))) patch.position = Number(body.position);
    if (body?.visible !== undefined) patch.visible = !!body.visible;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("menu_items",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const { status } = await sbRest("menu_items", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "navigation", text: "Menu item removed" } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
