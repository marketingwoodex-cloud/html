// Dashboard API: page version history and restore. Requires CMS session.
// GET /.netlify/functions/cms-versions?path=index.html
// POST { id }  — restore a version (writes the page back to the repo)
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";
import { ghPutFile, ghGetFile, toBase64, validPagePath } from "./_github.mjs";
import { saveVersion } from "./_versions.mjs";

const UUID = /^[0-9a-f-]{36}$/i;

export default async (req) => {
  if (!["GET","POST"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const sp = new URL(req.url).searchParams;
    const singleId = sp.get("id") || "";
    if (singleId) {
      // Fetch one version with its full HTML (for Preview).
      if (!UUID.test(singleId)) return json(400, { error: "Invalid id." });
      const one = await sbRest("page_versions",
        { query: `?select=id,page_path,html,created_by,note,created_at&id=eq.${singleId}&limit=1` });
      if (one.status !== 200 || !one.data?.[0]) return json(404, { error: "Version not found." });
      const r = one.data[0];
      return json(200, { version: {
        id: r.id, page_path: r.page_path, html: r.html || "",
        created_by: r.created_by, note: r.note, created_at: r.created_at,
      } });
    }
    const path = sp.get("path") || "";
    if (!validPagePath(path)) return json(400, { error: "Invalid page path." });
    const { status, data } = await sbRest("page_versions", {
      query: `?select=id,page_path,created_by,note,created_at,html&page_path=eq.${encodeURIComponent(path)}&order=created_at.desc&limit=20`,
    });
    if (status !== 200) return json(502, { error: "Could not load versions." });
    const versions = (data || []).map((r) => ({
      id: r.id,
      page_path: r.page_path,
      created_by: r.created_by,
      note: r.note,
      created_at: r.created_at,
      size: (r.html || "").length,
    }));
    return json(200, { versions });
  }

  if (req.method === "POST") {
    let body = null;
    try { body = await req.json(); } catch { body = null; }
    const id = body?.id || "";
    if (!UUID.test(id)) return json(400, { error: "Invalid id." });
    const { status, data } = await sbRest("page_versions",
      { query: `?select=page_path,html,created_at&id=eq.${id}&limit=1` });
    if (status !== 200 || !data?.[0]) return json(404, { error: "Version not found." });
    const v = data[0];
    if (!validPagePath(v.page_path)) return json(400, { error: "Invalid page path." });
    // Snapshot the current live page first, so the restore itself stays reversible.
    try {
      const cur = await ghGetFile(v.page_path);
      const curHtml = cur?.content ? Buffer.from(cur.content, "base64").toString("utf8") : null;
      if (curHtml && curHtml !== v.html) {
        await saveVersion(v.page_path, curHtml, user.username || user.role || "admin",
          "Auto-snapshot before restore");
      }
    } catch {}
    try {
      await ghPutFile(v.page_path, toBase64(v.html),
        `CMS: restore ${v.page_path} to version ${v.created_at} (by ${user.username})`);
    } catch (e) {
      return json(502, { error: "Could not restore to the site." });
    }
    await sbRest("activity", { method: "POST",
      body: { kind: "pages", text: `Page "${v.page_path}" restored to version ${v.created_at}` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
