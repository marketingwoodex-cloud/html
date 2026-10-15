// Dashboard API: projects. Requires CMS session.
// GET /.netlify/functions/cms-projects[?status=&category=&q=]
// POST { title*, category?, location?, description?, images?, status? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest, cleanSearch } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function slugify(s) {
  return String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "project";
}

function sanitizeImages(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).map((im) => ({
    url: clean(im?.url, 500),
    caption: clean(im?.caption, 160),
    alt: clean(im?.alt, 160) || null,
    width: Number.isFinite(Number(im?.width)) && Number(im.width) > 0 ? Math.floor(Number(im.width)) : null,
    height: Number.isFinite(Number(im?.height)) && Number(im.height) > 0 ? Math.floor(Number(im.height)) : null,
  })).filter((im) => /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(im.url));
}

async function uniqueSlug(base, exceptId) {
  let slug = base, n = 1;
  for (;;) {
    let q = `?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    if (exceptId) q += `&id=neq.${exceptId}`;
    const { data } = await sbRest("projects", { query: q });
    if (!data || !data.length) return slug;
    slug = `${base}-${++n}`;
  }
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = clean(url.searchParams.get("status"), 20);
    const category = clean(url.searchParams.get("category"), 60);
    const q = cleanSearch(url.searchParams.get("q"));
    let query = "?select=*&order=created_at.desc&limit=200";
    if (status) query += `&status=eq.${encodeURIComponent(status)}`;
    if (category) query += `&category=eq.${encodeURIComponent(category)}`;
    if (q) query += `&title=ilike.*${encodeURIComponent(q)}*`;
    const { status: s, data } = await sbRest("projects", { query });
    if (s !== 200) return json(502, { error: "Could not load projects." });
    return json(200, { projects: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const title = clean(body?.title, 160);
    if (title.length < 2) return json(400, { error: "Project title is required." });
    const slug = await uniqueSlug(slugify(body?.slug || title));
    const status = body?.status === "draft" ? "draft" : "active";
    const row = {
      title, slug,
      category: clean(body?.category, 60) || null,
      location: clean(body?.location, 80) || null,
      description: clean(body?.description, 4000) || null,
      images: sanitizeImages(body?.images),
      status,
    };
    const { status: s, data } = await sbRest("projects", { method: "POST", body: row });
    if (s !== 201 && s !== 200) return json(502, { error: "Could not create project." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "projects", text: `Project "${title}" created` } }).catch(() => {});
    return json(200, { project: created });
  }

  const id = body?.id || new URL(req.url).searchParams.get("id");
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.title !== undefined) {
      const t = clean(body.title, 160);
      if (t.length < 2) return json(400, { error: "Project title is required." });
      patch.title = t;
    }
    if (body?.slug !== undefined || body?.title !== undefined)
      patch.slug = await uniqueSlug(slugify(body?.slug || body?.title || "project"), id);
    if (body?.category !== undefined) patch.category = clean(body.category, 60) || null;
    if (body?.location !== undefined) patch.location = clean(body.location, 80) || null;
    if (body?.description !== undefined) patch.description = clean(body.description, 4000) || null;
    if (body?.images !== undefined) patch.images = sanitizeImages(body.images);
    if (body?.status !== undefined) patch.status = body.status === "draft" ? "draft" : "active";
    if (body?.published !== undefined) patch.published = body.published === true;
    if (body?.published_slug !== undefined)
      patch.published_slug = body.published_slug ? slugify(body.published_slug).slice(0, 120) : null;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status, data: errData } = await sbRest("projects",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) {
      const msg = JSON.stringify(errData || {});
      if (/published/.test(msg) && /column/i.test(msg))
        return json(400, { error: "The projects table needs the publish columns. Run the migration SQL in Supabase first." });
      return json(502, { error: "Could not update project." });
    }
    const refetch = await sbRest("projects", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    await sbRest("activity", { method: "POST",
      body: { kind: "projects", text: `Project "${saved?.title || id}" updated` } }).catch(() => {});
    return json(200, { project: saved });
  }

  if (req.method === "DELETE") {
    const cur = await sbRest("projects", { query: `?select=title&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status } = await sbRest("projects", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "projects", text: `Project "${row.title}" deleted` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
