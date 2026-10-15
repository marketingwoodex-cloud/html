// Dashboard API: media library. Requires CMS session.
// GET /.netlify/functions/cms-media[?q=search&limit=60]
// POST { url*, filename?, size_bytes? } — register an uploaded file
// PATCH { id, filename? }
// DELETE { id } — removes the DB record and the file from the repo
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest, cleanSearch } from "./_supabase.mjs";
import { ghDeleteFile } from "./_github.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function urlToPath(u) {
  const m = /^\/([A-Za-z0-9][A-Za-z0-9._/-]*)$/.exec(String(u || ""));
  if (!m) return null;
  const p = m[1];
  if (p.startsWith("admin/") || p.startsWith("netlify/") || p.includes("..")) return null;
  return p;
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const q = cleanSearch(url.searchParams.get("q"));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 60));
    let query = `?select=*&order=created_at.desc&limit=${limit}`;
    if (q) query += `&filename=ilike.*${encodeURIComponent(q)}*`;
    const { status, data } = await sbRest("media", { query });
    if (status !== 200) return json(502, { error: "Could not load media." });
    return json(200, { media: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const url = clean(body?.url, 500);
    if (!urlToPath(url)) return json(400, { error: "Invalid file URL." });
    const row = {
      url,
      filename: clean(body?.filename, 160) || url.split("/").pop(),
      size_bytes: Number(body?.size_bytes) > 0 ? Math.round(Number(body.size_bytes)) : null,
    };
    // SEO + sizing fields (need the media migration; gracefully degrade without it).
    const altText = clean(body?.alt_text, 200);
    const width = Number(body?.width) > 0 ? Math.round(Number(body.width)) : null;
    const height = Number(body?.height) > 0 ? Math.round(Number(body.height)) : null;
    const full = { ...row };
    if (altText) full.alt_text = altText;
    if (width) full.width = width;
    if (height) full.height = height;
    let res = await sbRest("media", { method: "POST", body: full });
    let needsMigration = false;
    if ((altText || width || height) && res.status !== 201 && res.status !== 200 &&
        /column/i.test(JSON.stringify(res.data || ""))) {
      // Columns don't exist yet — save the legacy fields so the upload still works.
      needsMigration = true;
      res = await sbRest("media", { method: "POST", body: row });
    }
    const { status, data } = res;
    if (status !== 201 && status !== 200) return json(502, { error: "Could not save media record." });
    const item = Array.isArray(data) ? data[0] : data;
    if (needsMigration) item._needsMigration = true;
    return json(200, { item });
  }

  if (req.method === "PATCH") {
    const id = body?.id;
    if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });
    const patch = {};
    if (body?.filename !== undefined) {
      const filename = clean(body.filename, 160);
      if (filename.length < 2) return json(400, { error: "Name is required." });
      patch.filename = filename;
    }
    if (body?.alt_text !== undefined) patch.alt_text = clean(body.alt_text, 200);
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status, data } = await sbRest("media", { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if ((status === 400 || status === 500) && patch.alt_text !== undefined &&
        /column/i.test(JSON.stringify(data || ""))) {
      return json(400, { error: "Alt text needs a database update first. Run the media migration in the Supabase SQL editor, then try again." });
    }
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const id = body?.id;
    if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });
    const cur = await sbRest("media", { query: `?select=url,filename&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status } = await sbRest("media", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    // Remove the file from the repo too (best effort — keep the DB delete even if this fails).
    const path = urlToPath(row.url);
    let fileDeleted = false;
    if (path && path.startsWith("assets/uploads/")) {
      try { fileDeleted = (await ghDeleteFile(path, `CMS: delete media ${row.filename}`)).deleted; } catch { /* keep going */ }
    }
    await sbRest("activity", { method: "POST",
      body: { kind: "media", text: `Media file "${row.filename}" deleted` } }).catch(() => {});
    return json(200, { ok: true, fileDeleted });
  }

  return json(405, { error: "Method not allowed." });
};
