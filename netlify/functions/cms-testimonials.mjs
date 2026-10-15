// Dashboard API: testimonials. Requires CMS session.
// GET /.netlify/functions/cms-testimonials[?published=1]
// POST { client_name*, quote*, company?, photo?, rating?, project?, service?, location?, featured?, published? }
// PATCH { id, ...fields }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const validPhoto = (u) => /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(String(u || ""));
const rating = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 5;
};

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const pub = url.searchParams.get("published");
    let query = "?select=*&order=featured.desc,created_at.desc&limit=200";
    if (pub === "1") query += "&published=eq.true";
    const { status, data } = await sbRest("testimonials", { query });
    if (status !== 200) return json(502, { error: "Could not load testimonials." });
    return json(200, { testimonials: data || [] });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const client_name = clean(body?.client_name, 120);
    const quote = clean(body?.quote, 2000);
    if (client_name.length < 2) return json(400, { error: "Client name is required." });
    if (quote.length < 4) return json(400, { error: "Quote is required." });
    const row = {
      client_name,
      quote,
      company: clean(body?.company, 120) || null,
      photo: validPhoto(body?.photo) ? clean(body.photo, 500) : null,
      rating: rating(body?.rating),
      project: clean(body?.project, 160) || null,
      service: clean(body?.service, 120) || null,
      location: clean(body?.location, 120) || null,
      featured: body?.featured === true,
      published: body?.published === true,
    };
    const { status, data } = await sbRest("testimonials", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not add testimonial." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "testimonials", text: `Testimonial from "${client_name}" added` } }).catch(() => {});
    return json(200, { testimonial: created });
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
    if (body?.quote !== undefined) {
      const q = clean(body.quote, 2000);
      if (q.length < 4) return json(400, { error: "Quote is required." });
      patch.quote = q;
    }
    if (body?.company !== undefined) patch.company = clean(body.company, 120) || null;
    if (body?.photo !== undefined) patch.photo = validPhoto(body.photo) ? clean(body.photo, 500) : null;
    if (body?.rating !== undefined) patch.rating = rating(body.rating);
    if (body?.project !== undefined) patch.project = clean(body.project, 160) || null;
    if (body?.service !== undefined) patch.service = clean(body.service, 120) || null;
    if (body?.location !== undefined) patch.location = clean(body.location, 120) || null;
    if (body?.featured !== undefined) patch.featured = body.featured === true;
    if (body?.published !== undefined) patch.published = body.published === true;
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    const { status } = await sbRest("testimonials",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update." });
    const refetch = await sbRest("testimonials", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    await sbRest("activity", { method: "POST",
      body: { kind: "testimonials", text: `Testimonial from "${saved?.client_name || id}" updated` } }).catch(() => {});
    return json(200, { testimonial: saved });
  }

  if (req.method === "DELETE") {
    const cur = await sbRest("testimonials", { query: `?select=client_name&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    if (!row) return json(404, { error: "Not found." });
    const { status } = await sbRest("testimonials", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete." });
    await sbRest("activity", { method: "POST",
      body: { kind: "testimonials", text: `Testimonial from "${row.client_name}" removed` } }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
