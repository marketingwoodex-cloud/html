// Dashboard API: blog posts (block-based content). Requires CMS session.
// GET /.netlify/functions/cms-blog-posts[?status=draft|published]
// GET ?id=<uuid> -> full post including content
// POST { title*, slug?, excerpt?, cover_image?, content? (blocks array or JSON string) }
// PATCH { id, title?, slug?, excerpt?, cover_image?, content?, status? (draft|published) }
// DELETE { id }
// Content is stored as a JSON string of blocks:
//   [{type:'heading'|'paragraph'|'image'|'quote'|'list', text, url?, caption?}]
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["draft", "published"];
const BLOCK_TYPES = ["heading", "paragraph", "image", "quote", "list"];

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const cleanMulti = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}

function sanitizeBlocks(input) {
  let arr = input;
  if (typeof arr === "string") {
    try { arr = JSON.parse(arr); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 60).map((b) => {
    const t = BLOCK_TYPES.includes(b?.type) ? b.type : "paragraph";
    const out = { type: t, text: cleanMulti(b?.text, 5000) };
    if (t === "image") {
      out.url = clean(b?.url, 500);
      out.caption = clean(b?.caption, 300);
      if (!/^(\/|https?:\/\/)/.test(out.url)) out.url = "";
    }
    return out;
  }).filter((b) => b.text || (b.type === "image" && b.url));
}

async function uniqueSlug(base, excludeId) {
  let slug = slugify(base), n = 0;
  for (;;) {
    const cand = n ? `${slug}-${n}` : slug;
    const q = `?select=id&slug=eq.${encodeURIComponent(cand)}&limit=1` +
      (excludeId ? `&id=neq.${excludeId}` : "");
    try {
      const { status, data } = await sbRest("blog_posts", { query: q });
      if (status === 200 && (!data || !data.length)) return cand;
    } catch { return cand; }
    if (++n > 50) return `${slug}-${Date.now().toString(36)}`;
  }
}

function shapeList(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt,
    cover_image: r.cover_image, status: r.status,
    published_at: r.published_at, updated_at: r.updated_at, created_at: r.created_at,
  };
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if (id) {
      if (!UUID.test(id)) return json(400, { error: "Invalid id." });
      const { status, data } = await sbRest("blog_posts", { query: `?select=*&id=eq.${id}&limit=1` });
      if (status !== 200 || !data?.length) return json(404, { error: "Post not found." });
      return json(200, { post: data[0] });
    }
    const st = url.searchParams.get("status");
    const q = `?select=id,slug,title,excerpt,cover_image,status,published_at,updated_at,created_at` +
      `&order=updated_at.desc&limit=100` + (STATUSES.includes(st) ? `&status=eq.${st}` : "");
    const { status, data } = await sbRest("blog_posts", { query: q });
    if (status !== 200) return json(502, { error: "Could not load posts." });
    return json(200, { posts: (data || []).map(shapeList) });
  }

  let body = null;
  try { body = await req.json(); } catch { body = null; }

  if (req.method === "POST") {
    const title = clean(body?.title, 160);
    if (title.length < 3) return json(400, { error: "Title is required." });
    const slug = await uniqueSlug(body?.slug || title);
    const row = {
      title, slug,
      excerpt: clean(body?.excerpt, 300),
      cover_image: clean(body?.cover_image, 500),
      content: JSON.stringify(sanitizeBlocks(body?.content)),
      status: "draft",
    };
    const { status, data } = await sbRest("blog_posts", { method: "POST", body: row });
    if (status !== 201 && status !== 200) return json(502, { error: "Could not create post." });
    const created = Array.isArray(data) ? data[0] : data;
    await sbRest("activity", { method: "POST",
      body: { kind: "blog", text: `Blog post "${title}" created as draft` } }).catch(() => {});
    return json(200, { post: created });
  }

  if (req.method === "PATCH") {
    const id = body?.id;
    if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });
    const patch = {};
    if (body?.title !== undefined) {
      const t = clean(body.title, 160);
      if (t.length < 3) return json(400, { error: "Title is required." });
      patch.title = t;
    }
    if (body?.slug !== undefined) patch.slug = await uniqueSlug(body.slug || patch.title || "post", id);
    if (body?.excerpt !== undefined) patch.excerpt = clean(body.excerpt, 300);
    if (body?.cover_image !== undefined) patch.cover_image = clean(body.cover_image, 500);
    if (body?.content !== undefined) patch.content = JSON.stringify(sanitizeBlocks(body.content));
    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) return json(400, { error: "Invalid status." });
      patch.status = body.status;
      patch.published_at = body.status === "published" ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) return json(400, { error: "Nothing to update." });
    patch.updated_at = new Date().toISOString();
    const { status } = await sbRest("blog_posts",
      { method: "PATCH", query: `?id=eq.${id}`, body: patch });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not update post." });
    const refetch = await sbRest("blog_posts", { query: `?select=*&id=eq.${id}&limit=1` });
    const saved = refetch.data?.[0] || null;
    if (patch.status) await sbRest("activity", { method: "POST",
      body: { kind: "blog", text: `Blog post "${saved?.title || id}" ${patch.status}` } }).catch(() => {});
    return json(200, { post: saved });
  }

  if (req.method === "DELETE") {
    const id = body?.id;
    if (!UUID.test(id || "")) return json(400, { error: "Invalid id." });
    const cur = await sbRest("blog_posts", { query: `?select=title,slug,status&id=eq.${id}&limit=1` });
    const row = cur.data?.[0];
    const { status } = await sbRest("blog_posts", { method: "DELETE", query: `?id=eq.${id}` });
    if (status !== 200 && status !== 204) return json(502, { error: "Could not delete post." });
    await sbRest("activity", { method: "POST",
      body: { kind: "blog", text: `Blog post "${row?.title || id}" deleted` } }).catch(() => {});
    return json(200, { ok: true, wasPublished: row?.status === "published", slug: row?.slug });
  }

  return json(405, { error: "Method not allowed." });
};
