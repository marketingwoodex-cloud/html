// Dashboard API: locations (structured content type). Requires CMS session.
// GET /.netlify/functions/cms-locations[?published=1]
// POST { name*, introduction?, services?, faqs?, map_url?, seo?, published? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function slugify(s) {
  return String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "location";
}

async function uniqueSlug(base, exceptId) {
  let slug = base, n = 1;
  for (;;) {
    let q = `?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    if (exceptId) q += `&id=neq.${exceptId}`;
    const { data } = await sbRest("locations", { query: q });
    if (!data || !data.length) return slug;
    slug = `${base}-${++n}`;
  }
}

const arr50 = (v) => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 50);
};
const sanitizeSeo = (v) => {
  if (!v || typeof v !== "object") return {};
  const o = {};
  for (const k of ["title", "description", "og_image", "canonical", "schema"]) {
    if (v[k] !== undefined) o[k] = clean(v[k], k === "description" ? 400 : 300) || null;
  }
  return o;
};
const validUrl = (u) => /^(https?:\/\/|\/)[^\s]*$/i.test(String(u || ""));

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const pub = url.searchParams.get("published");
    let query = "?select=*&order=name.asc&limit=200";
    if (pub === "1") query += "&published=eq.true";
    const { status, data } = await sbRest("locations", { query });
    if (status !== 200) return json(502, { error: "Could not load locations." });
    return json(200, { locations: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const name = clean(body?.name, 120);
    if (name.length < 2) return json(400, { error: "Name is required." });
    const slug = await uniqueSlug(slugify(body?.slug || name));
    const row = {
      name,
      slug,
      introduction: clean(body?.introduction, 4000) || null,
      services: arr50(body?.services),
      faqs: arr50(body?.faqs),
      map_url: validUrl(body?.map_url) ? clean(body.map_url, 500) : null,
      seo: sanitizeSeo(body?.seo),
      published: body?.published === true,
      published_slug: null,
    };
    const { status, data } = await sbRest("locations", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not add location." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "locations", text: `Location "${name}" added` } }).catch(() => {});
    return json(200, { location: created });
  }

  const id = body?.id || new URL(req.url).searchParams.get("id");
  if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });

  if (req.method === "PATCH") {
    const patch = {};
    if (body?.name !== undefined) {
      const n = clean(body.name, 120);
      if (n.length < 2) return json(400, { error: "Name is required." });
      patch.name = n;
      patch.slug = await uniqueSlug(slugify(body?.slug || n), id);
    } else if (body?.slug !== undefined) {
      patch.slug = await uniqueSlug(slugify(body.slug), id);
    }
    if (body?.introduction !== undefined) patch.introduction = clean(body.introduction, 4000) || null;
    if (body?.services !== undefined) patch.services = arr50(body.services);
    if (body?.faqs !== undefined) patch.faqs = arr50(body.faqs);
    if (body?.map_url !== undefined) patch.map_url = validUrl(body.map_url) ? clean(body.map_url, 500) : null;
    if (body?.seo !== undefined) patch.seo = sanitizeSeo(body.seo);
    if (body?.published !== undefined) patch.published = body.published === true;
    if (body?.published_slug !== undefined)
      patch.published_slug = body.published_slug ? slugify(body.published_slug).slice(0, 120) : null;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("locations",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    const refetch = await sbRest("locations", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    await sbRest("activity", { method: "POST",
      body: { kind: "locations", text: `Location "${saved?.name || id}" updated` } }).catch(() => {});
    return json(200, { location: saved });
  }

  if (req.method === "DELETE") {
    const cur = await sbRest("locations", { query: `?select=name&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status } = await sbRest("locations", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "locations", text: `Location "${row.name}" removed` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
