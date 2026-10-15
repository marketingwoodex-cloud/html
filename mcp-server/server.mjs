#!/usr/bin/env node
/* Woodex CMS MCP server.
 * Exposes the Woodex Interior website to MCP clients (Claude, Codex, Cursor):
 * pages, blog posts, projects, site settings and the media library.
 *
 * Reads content from the live GitHub repo and the live Supabase database.
 * Publishing tools commit straight to main, which redeploys the live site.
 *
 * Config via environment (see .env.example):
 *   WOODEX_GITHUB_TOKEN   fine-grained PAT with Contents read/write on the repo
 *   WOODEX_REPO           default: marketingwoodex-cloud/-marketingwoodex
 *   WOODEX_BRANCH         default: main
 *   WOODEX_SUPABASE_URL   e.g. https://xyz.supabase.co
 *   WOODEX_SUPABASE_KEY   service_role key
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GH = process.env.WOODEX_GITHUB_TOKEN || "";
const REPO = process.env.WOODEX_REPO || "marketingwoodex-cloud/-marketingwoodex";
const BRANCH = process.env.WOODEX_BRANCH || "main";
const SB_URL = (process.env.WOODEX_SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.WOODEX_SUPABASE_KEY || "";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- GitHub ---------------- */

async function ghGetFile(path) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`,
    { headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return {
    sha: j.sha,
    text: Buffer.from(j.content || "", "base64").toString("utf8"),
  };
}

async function ghPutFile(path, text, message) {
  const existing = await ghGetFile(path);
  const body = { message, content: Buffer.from(text, "utf8").toString("base64"), branch: BRANCH };
  if (existing) body.sha = existing.sha;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
  return true;
}

async function ghDeleteFile(path, message) {
  const existing = await ghGetFile(path);
  if (!existing) return false;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ message, sha: existing.sha, branch: BRANCH }),
  });
  if (!res.ok) throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${await res.text()}`);
  return true;
}

/* Only dashboard/page-managed HTML files may be written. */
function validPagePath(p) {
  return (
    typeof p === "string" &&
    p.length <= 200 &&
    !p.includes("..") &&
    !p.includes("\\") &&
    p.endsWith(".html") &&
    !p.startsWith("/") &&
    !p.startsWith("admin/") &&
    !p.startsWith("netlify/") &&
    !p.startsWith("api/") &&
    !p.startsWith(".") &&
    /^[A-Za-z0-9_.\-/]+$/.test(p)
  );
}

/* ---------------- Supabase ---------------- */

async function sb(table, { method = "GET", query = "", body = null } = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ---------------- Render modules (reused from the dashboard) ---------------- */

function loadRenderer(file, globalName) {
  const src = readFileSync(join(ROOT, "admin", file), "utf8");
  return new Function("window", `${src}\nreturn ${globalName};`)({});
}

let BlogRender = null;
let ProjectRender = null;
function blogRender() {
  if (!BlogRender) BlogRender = loadRenderer("blog-render.js", "WxBlogRender");
  return BlogRender;
}
function projectRender() {
  if (!ProjectRender) ProjectRender = loadRenderer("project-render.js", "WxProjectRender");
  return ProjectRender;
}

/* ---------------- Helpers ---------------- */

function slugify(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
}

async function uniquePostSlug(base, table, excludeId) {
  let slug = base, i = 1;
  for (;;) {
    let q = `?slug=eq.${encodeURIComponent(slug)}&select=id`;
    if (excludeId) q += `&id=neq.${excludeId}`;
    const rows = await sb(table, { query: q });
    if (!rows.length) return slug;
    i += 1;
    slug = `${base}-${i}`;
  }
}

function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 60).map((b) => {
    const t = String((b && b.type) || "paragraph").toLowerCase();
    const type = ["heading", "paragraph", "image", "quote", "list"].includes(t) ? t : "paragraph";
    const out = { type, text: String((b && b.text) || "").slice(0, 5000) };
    if (type === "image") out.url = String((b && b.url) || "").slice(0, 500);
    return out;
  });
}

function textResult(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

function requireEnv() {
  const missing = [];
  if (!GH) missing.push("WOODEX_GITHUB_TOKEN");
  if (!SB_URL) missing.push("WOODEX_SUPABASE_URL");
  if (!SB_KEY) missing.push("WOODEX_SUPABASE_KEY");
  if (missing.length) throw new Error("Missing environment: " + missing.join(", ") + ". See mcp-server/.env.example.");
}

/* ---------------- Server ---------------- */

const server = new McpServer({ name: "woodex-cms", version: "1.0.0" });

/* ---------- Pages ---------- */

server.tool(
  "list_pages",
  "List the website's pages (path, url, title) from the live site map.",
  {},
  async () => {
    requireEnv();
    const f = await ghGetFile("admin/pages.json");
    if (!f) throw new Error("admin/pages.json not found in the repo.");
    const pages = JSON.parse(f.text).map((p) => ({ path: p.path, url: p.url, title: p.title }));
    return textResult({ count: pages.length, pages });
  }
);

server.tool(
  "get_page",
  "Read a page's HTML from the live repo. Call this before updating a page.",
  { path: z.string().describe("Repo-relative HTML path, e.g. 'about/index.html'") },
  async ({ path }) => {
    requireEnv();
    if (!validPagePath(path)) throw new Error("Refusing to read: path is not a manageable public HTML page.");
    const f = await ghGetFile(path);
    if (!f) throw new Error("Page not found: " + path);
    const MAX = 60000;
    return textResult({ path, length: f.text.length, truncated: f.text.length > MAX, html: f.text.slice(0, MAX) });
  }
);

server.tool(
  "update_page",
  "Replace a page's full HTML in the repo and commit to main (redeploys the site). Always get_page first and preserve the header, nav, footer and brand styles.",
  {
    path: z.string().describe("Repo-relative HTML path, e.g. 'about/index.html'"),
    html: z.string().describe("Complete new HTML for the page"),
    message: z.string().optional().describe("Commit message"),
  },
  async ({ path, html, message }) => {
    requireEnv();
    if (!validPagePath(path)) throw new Error("Refusing to write: path is not a manageable public HTML page.");
    if (!html || html.length < 50) throw new Error("Refusing to write: HTML looks empty.");
    await ghPutFile(path, html, message || `MCP: update ${path}`);
    return textResult({ ok: true, path, note: "Committed to main. The live site rebuilds in about a minute." });
  }
);

/* ---------- Blog ---------- */

server.tool(
  "list_blog_posts",
  "List blog posts in the CMS database.",
  { status: z.enum(["draft", "published"]).optional().describe("Filter by status") },
  async ({ status }) => {
    requireEnv();
    let q = "?select=id,title,slug,status,excerpt,published_at,created_at&order=created_at.desc&limit=50";
    if (status) q += `&status=eq.${status}`;
    const rows = await sb("blog_posts", { query: q });
    return textResult({ count: rows.length, posts: rows });
  }
);

server.tool(
  "get_blog_post",
  "Get a blog post with its content blocks, by id or slug.",
  { id_or_slug: z.string() },
  async ({ id_or_slug }) => {
    requireEnv();
    const key = /^[0-9a-f-]{36}$/i.test(id_or_slug) ? "id" : "slug";
    const rows = await sb("blog_posts", { query: `?${key}=eq.${encodeURIComponent(id_or_slug)}&select=*&limit=1` });
    if (!rows.length) throw new Error("Post not found.");
    return textResult(rows[0]);
  }
);

server.tool(
  "create_blog_post",
  "Create a draft blog post. Publish it afterwards with publish_blog_post.",
  {
    title: z.string(),
    excerpt: z.string().optional(),
    cover_image: z.string().optional(),
    content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string(), url: z.string().optional() }))]).optional()
      .describe("Blocks array (heading/paragraph/image/quote/list) or plain text for one paragraph"),
    status: z.enum(["draft", "published"]).optional().describe("Defaults to draft"),
  },
  async ({ title, excerpt, cover_image, content, status }) => {
    requireEnv();
    const slug = await uniquePostSlug(slugify(title), "blog_posts");
    const blocks = typeof content === "string" ? [{ type: "paragraph", text: content }] : sanitizeBlocks(content);
    const rows = await sb("blog_posts", {
      method: "POST",
      query: "?select=id,title,slug,status",
      body: {
        title: String(title).slice(0, 200),
        slug,
        excerpt: excerpt ? String(excerpt).slice(0, 500) : null,
        cover_image: cover_image ? String(cover_image).slice(0, 500) : null,
        content: blocks,
        status: status === "published" ? "published" : "draft",
        published_at: status === "published" ? new Date().toISOString() : null,
      },
    });
    return textResult({ ok: true, post: rows[0] });
  }
);

server.tool(
  "update_blog_post",
  "Update a draft or published post's fields (title, excerpt, cover_image, content blocks). Re-publish afterwards if it is live.",
  {
    id: z.string(),
    title: z.string().optional(),
    excerpt: z.string().optional(),
    cover_image: z.string().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string(), url: z.string().optional() })).optional(),
  },
  async ({ id, title, excerpt, cover_image, content }) => {
    requireEnv();
    const body = {};
    if (title !== undefined) body.title = String(title).slice(0, 200);
    if (excerpt !== undefined) body.excerpt = excerpt ? String(excerpt).slice(0, 500) : null;
    if (cover_image !== undefined) body.cover_image = cover_image ? String(cover_image).slice(0, 500) : null;
    if (content !== undefined) body.content = sanitizeBlocks(content);
    if (!Object.keys(body).length) throw new Error("Nothing to update.");
    const rows = await sb("blog_posts", { method: "PATCH", query: `?id=eq.${id}&select=id,title,slug,status`, body });
    if (!rows.length) throw new Error("Post not found.");
    return textResult({ ok: true, post: rows[0] });
  }
);

server.tool(
  "publish_blog_post",
  "Publish a post: marks it published in the database, writes its article page to /insights/<slug>/ and refreshes the Insights index on the live site.",
  { id: z.string() },
  async ({ id }) => {
    requireEnv();
    const R = blogRender();
    const rows = await sb("blog_posts", {
      method: "PATCH",
      query: `?id=eq.${id}&select=*`,
      body: { status: "published", published_at: new Date().toISOString() },
    });
    if (!rows.length) throw new Error("Post not found.");
    const post = rows[0];
    const all = await sb("blog_posts", {
      query: "?status=eq.published&order=published_at.desc&limit=20&select=id,title,slug,excerpt,cover_image,content,published_at,created_at",
    });
    const norm = all.map((p) => R.normalizePost(p));
    const me = R.normalizePost(post);
    const related = [me].concat(norm.filter((p) => p.slug !== me.slug)).concat(R.STATIC_ARTICLES).slice(0, 4);
    await ghPutFile(`insights/${me.slug}/index.html`, R.renderPostHTML(me, related), `MCP: publish post ${me.slug}`);
    await ghPutFile("insights/index.html", R.renderInsightsIndex(norm), "MCP: refresh insights index");
    return textResult({ ok: true, slug: me.slug, url: `/insights/${me.slug}/` });
  }
);

server.tool(
  "unpublish_blog_post",
  "Unpublish a post: back to draft, removes its /insights/ page, refreshes the index.",
  { id: z.string() },
  async ({ id }) => {
    requireEnv();
    const R = blogRender();
    const rows = await sb("blog_posts", { method: "PATCH", query: `?id=eq.${id}&select=id,slug`, body: { status: "draft" } });
    if (!rows.length) throw new Error("Post not found.");
    await ghDeleteFile(`insights/${rows[0].slug}/index.html`, `MCP: unpublish post ${rows[0].slug}`);
    const all = await sb("blog_posts", {
      query: "?status=eq.published&order=published_at.desc&limit=20&select=id,title,slug,excerpt,cover_image,content,published_at,created_at",
    });
    await ghPutFile("insights/index.html", R.renderInsightsIndex(all.map((p) => R.normalizePost(p))), "MCP: refresh insights index");
    return textResult({ ok: true, slug: rows[0].slug });
  }
);

server.tool(
  "delete_blog_post",
  "Permanently delete a blog post (drafts only, for safety).",
  { id: z.string() },
  async ({ id }) => {
    requireEnv();
    const rows = await sb("blog_posts", { query: `?id=eq.${id}&select=id,status&limit=1` });
    if (!rows.length) throw new Error("Post not found.");
    if (rows[0].status === "published") throw new Error("Unpublish the post first.");
    await sb("blog_posts", { method: "DELETE", query: `?id=eq.${id}` });
    return textResult({ ok: true });
  }
);

/* ---------- Projects ---------- */

server.tool(
  "list_projects",
  "List projects in the CMS database with publish state.",
  {},
  async () => {
    requireEnv();
    const rows = await sb("projects", {
      query: "?select=id,title,slug,location,status,published,published_slug,created_at&order=created_at.desc&limit=50",
    });
    return textResult({ count: rows.length, projects: rows });
  }
);

server.tool(
  "get_project",
  "Get a project with its gallery, by id.",
  { id: z.string() },
  async ({ id }) => {
    requireEnv();
    const rows = await sb("projects", { query: `?id=eq.${id}&select=*&limit=1` });
    if (!rows.length) throw new Error("Project not found.");
    return textResult(rows[0]);
  }
);

server.tool(
  "publish_project",
  "Publish a project to the live site at /projects/<slug>/ and refresh the projects index. The project must be a draft.",
  { id: z.string() },
  async ({ id }) => {
    requireEnv();
    const R = projectRender();
    const rows = await sb("projects", { query: `?id=eq.${id}&select=*&limit=1` });
    if (!rows.length) throw new Error("Project not found.");
    const p = rows[0];
    if (String(p.status || "").toLowerCase() !== "draft") throw new Error("Only draft projects can be published.");
    const slug = await uniquePostSlug(slugify(p.title || p.name), "projects", p.id);
    await ghPutFile(`projects/${slug}/index.html`, R.renderProjectHTML(p), `MCP: publish project ${slug}`);
    const all = await sb("projects", { query: "?select=*" });
    await ghPutFile("projects/index.html", R.renderIndexHTML(all), "MCP: refresh projects index");
    await sb("projects", { method: "PATCH", query: `?id=eq.${p.id}`, body: { published: true, published_slug: slug } });
    return textResult({ ok: true, slug, url: `/projects/${slug}/` });
  }
);

server.tool(
  "unpublish_project",
  "Remove a published project page from the live site and refresh the index.",
  { id: z.string() },
  async ({ id }) => {
    requireEnv();
    const R = projectRender();
    const rows = await sb("projects", { query: `?id=eq.${id}&select=id,published_slug&limit=1` });
    if (!rows.length) throw new Error("Project not found.");
    if (rows[0].published_slug) {
      await ghDeleteFile(`projects/${rows[0].published_slug}/index.html`, `MCP: unpublish project ${rows[0].published_slug}`);
    }
    const all = await sb("projects", { query: "?select=*" });
    await ghPutFile("projects/index.html", R.renderIndexHTML(all), "MCP: refresh projects index");
    await sb("projects", { method: "PATCH", query: `?id=eq.${id}`, body: { published: false, published_slug: null } });
    return textResult({ ok: true });
  }
);

/* ---------- Settings ---------- */

server.tool(
  "get_settings",
  "Read the public site settings (site name, tagline, contacts, social links, estimator services).",
  {},
  async () => {
    requireEnv();
    const rows = await sb("site_settings", { query: "?select=key,value" });
    const out = {};
    rows.forEach((r) => { out[r.key] = r.value; });
    return textResult(out);
  }
);

server.tool(
  "update_setting",
  "Update one site setting (e.g. site.tagline, contact.phone1, social.instagram, estimator.services). Note: run 'Publish to website' in the dashboard afterwards for estimator or contact changes to reach the live pages.",
  {
    key: z.string().describe("Setting key, e.g. 'site.tagline' or 'contact.phone1'"),
    value: z.string().describe("New value as a JSON string"),
  },
  async ({ key, value }) => {
    requireEnv();
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(key)) throw new Error("Invalid setting key.");
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error("Value must be valid JSON."); }
    await sb("site_settings", {
      method: "POST",
      query: "?on_conflict=key",
      body: { key, value: parsed },
    }).catch(async (e) => {
      if (!/duplicate|conflict|unique/i.test(String(e.message))) throw e;
      await sb("site_settings", { method: "PATCH", query: `?key=eq.${encodeURIComponent(key)}`, body: { value: parsed } });
    });
    return textResult({ ok: true, key });
  }
);

/* ---------- Media ---------- */

server.tool(
  "list_media",
  "List media library files (newest first).",
  { limit: z.number().int().min(1).max(100).optional().describe("Defaults to 30") },
  async ({ limit }) => {
    requireEnv();
    const rows = await sb("media", {
      query: `?select=id,filename,url,alt_text,width,height,size_bytes,created_at&order=created_at.desc&limit=${limit || 30}`,
    });
    return textResult({ count: rows.length, media: rows });
  }
);

/* ---------------- Start ---------------- */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("woodex-cms-mcp failed to start:", err.message);
  process.exit(1);
});
