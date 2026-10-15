// Dashboard API: Block Page Builder — content/pages/* drafts + publish.
// GET  ?action=list                 → registry of all pages
// GET  ?action=get&slug=/kitchen-design/ → { slug, meta, blocks }
// POST { action:"save",    slug, meta, blocks }  → commit drafts (not live)
// POST { action:"publish", slug }  → render into live page HTML + commit
// POST { action:"create",  slug, title, description, donor } → new page
// POST { action:"delete",  slug, redirect_to? } → remove page (+redirect)
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { ghGetFile, ghPutFile, ghDeleteFile, toBase64, validPagePath } from "./_github.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";
import { syncQuietly } from "./_redirects-sync.mjs";
import {
  contentDir, renderPage, validateBlocks, validateMeta,
} from "./_page-render.mjs";

const REGISTRY = "content/pages/index.json";

const cleanSlug = (s) => {
  if (typeof s !== "string" || s.length > 130) return null;
  let v = s.trim();
  if (!v.startsWith("/")) v = "/" + v;
  if (v !== "/" && !v.endsWith("/")) v += "/";
  if (v.includes("..") || v.includes("//")) return null;
  if (v === "/") return "/";
  if (!/^\/(?:[A-Za-z0-9][A-Za-z0-9-]*\/)+$/.test(v)) return null;
  if (v.split("/").filter(Boolean).some((seg) => seg.length > 60)) return null;
  return v;
};

const pagePath = (slug) => (slug === "/" ? "index.html" : `${slug.slice(1)}index.html`);
const contentValid = (p) =>
  /^content\/pages\/[A-Za-z0-9._/-]+\.json$/.test(p) && !p.includes("..");

async function readJson(path) {
  const file = await ghGetFile(path);
  if (!file || !file.content) return null;
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
}

async function writeJson(path, data, message) {
  if (!contentValid(path)) throw new Error(`Invalid content path: ${path}`);
  await ghPutFile(path, toBase64(JSON.stringify(data, null, 1)), message);
}

async function readRegistry() {
  const reg = await readJson(REGISTRY);
  return reg && Array.isArray(reg.pages) ? reg : { generated: "phase2", pages: [] };
}

async function writeRegistry(reg) {
  reg.pages.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeJson(REGISTRY, reg, "CMS: update page registry");
}

async function loadDrafts(slug) {
  const dir = contentDir(slug);
  const [blocks, meta] = await Promise.all([
    readJson(`${dir}/blocks.json`),
    readJson(`${dir}/meta.json`),
  ]);
  if (!blocks || !meta) throw new Error(`No drafts for ${slug} (not converted yet).`);
  return { blocks, meta };
}

export default async (req) => {
  const session = await verifySession(bearerSession(req));
  if (!session) return json(401, { error: "Sign in required." });
  const q = new URL(req.url).searchParams;

  // ------------------------------------------------------------- reads
  if (req.method === "GET") {
    const action = q.get("action") || "list";
    if (action === "list") {
      const reg = await readRegistry();
      return json(200, { pages: reg.pages, count: reg.pages.length });
    }
    if (action === "get") {
      const slug = cleanSlug(q.get("slug"));
      if (!slug) return json(400, { error: "Invalid slug." });
      try {
        const { blocks, meta } = await loadDrafts(slug);
        return json(200, { slug, meta, blocks });
      } catch (err) {
        return json(404, { error: err.message });
      }
    }
    return json(400, { error: "Unknown action." });
  }

  // ---------------------------------------------------------- mutations
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }
  const action = String(body?.action || "");
  const slug = cleanSlug(body?.slug);
  if (!slug) return json(400, { error: "Invalid slug." });
  const dir = contentDir(slug);

  if (action === "save") {
    if (!canWrite(session)) return json(403, { error: "Viewer role cannot edit." });
    try {
      const blocks = validateBlocks(body.blocks);
      const meta = validateMeta(body.meta, slug);
      await writeJson(`${dir}/blocks.json`, blocks, `CMS: save blocks ${slug}`);
      await writeJson(`${dir}/meta.json`, meta, `CMS: save meta ${slug}`);
      const reg = await readRegistry();
      const entry = reg.pages.find((p) => p.slug === slug);
      if (entry) entry.title = meta.title;
      if (reg.pages.length) await writeRegistry(reg);
      return json(200, { ok: true, draftOnly: true });
    } catch (err) {
      return json(400, { error: err.message });
    }
  }

  if (action === "publish") {
    if (!canWrite(session)) return json(403, { error: "Viewer role cannot publish." });
    try {
      const { blocks, meta } = await loadDrafts(slug);
      validateBlocks(blocks);
      validateMeta(meta, slug);
      const live = await ghGetFile(pagePath(slug));
      if (!live || !live.content) return json(404, { error: "Live page not found." });
      const html = Buffer.from(live.content, "base64").toString("utf8");
      const out = renderPage(html, meta, blocks);
      const path = pagePath(slug);
      if (!validPagePath(path)) return json(400, { error: "Page path not allowed." });
      const saved = await ghPutFile(path, toBase64(out), `CMS: publish ${slug}`);
      return json(200, { ok: true, sha: saved?.content?.sha || null });
    } catch (err) {
      return json(400, { error: err.message });
    }
  }

  if (action === "create") {
    if (!canWrite(session)) return json(403, { error: "Viewer role cannot create pages." });
    if (slug === "/") return json(400, { error: "Home page already exists." });
    try {
      const title = String(body.title || "").trim().slice(0, 180);
      const description = String(body.description || "").trim().slice(0, 400);
      const donorSlug = cleanSlug(body.donor) || "/kitchen-design/";
      if (!title) return json(400, { error: "Title is required." });
      const reg = await readRegistry();
      if (reg.pages.some((p) => p.slug === slug)) {
        return json(409, { error: "Slug already exists." });
      }
      const donorFile = await ghGetFile(pagePath(donorSlug));
      if (!donorFile?.content) return json(404, { error: "Donor page not found." });
      let html = Buffer.from(donorFile.content, "base64").toString("utf8");
      const heading = title.replace(/[<>&]/g, "");
      const intro =
        `<section class="page-intro"><div class="wrap">` +
        `<h1>${heading}</h1>` +
        (description ? `<p class="lede">${description.replace(/[<>]/g, "")}</p>` : "") +
        `</div></section>`;
      if (!/<main\b[^>]*>[\s\S]*?<\/main>/.test(html)) {
        return json(500, { error: "Donor page has no <main> element." });
      }
      html = html.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (_m, o, c) => o + intro + c);
      const meta = validateMeta(
        { title, description, canonical: `https://woodex.com.pk${slug}` },
        slug
      );
      const blocks = [{ id: `b${Date.now().toString(36)}`, type: "raw", html: intro }];
      const path = pagePath(slug);
      if (!validPagePath(path)) return json(400, { error: "Page path not allowed." });
      await Promise.all([
        writeJson(`${dir}/blocks.json`, blocks, `CMS: create blocks ${slug}`),
        writeJson(`${dir}/meta.json`, meta, `CMS: create meta ${slug}`),
      ]);
      await ghPutFile(path, toBase64(html), `CMS: create page ${slug}`);
      reg.pages.push({ slug, title, path: path, template: `from:${donorSlug}` });
      await writeRegistry(reg);
      return json(200, { ok: true, slug });
    } catch (err) {
      return json(400, { error: err.message });
    }
  }

  if (action === "delete") {
    if (!canWrite(session)) return json(403, { error: "Viewer role cannot delete pages." });
    if (slug === "/") return json(400, { error: "Home page cannot be deleted." });
    try {
      const results = {};
      results.page = await ghDeleteFile(pagePath(slug), `CMS: delete page ${slug}`);
      results.blocks = await ghDeleteFile(`${dir}/blocks.json`, `CMS: delete blocks ${slug}`);
      results.meta = await ghDeleteFile(`${dir}/meta.json`, `CMS: delete meta ${slug}`);
      const reg = await readRegistry();
      const before = reg.pages.length;
      reg.pages = reg.pages.filter((p) => p.slug !== slug);
      if (reg.pages.length !== before) await writeRegistry(reg);

      let warning = null;
      const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to.trim() : "";
      if (sbConfigured() && redirectTo.startsWith("/") && !/\s/.test(redirectTo)) {
        const existing = await sbRest("redirects", {
          query: `?select=id&from_path=eq.${encodeURIComponent(slug)}&limit=1`,
        });
        if (existing.status === 200 && (!existing.data || existing.data.length === 0)) {
          const ins = await sbRest("redirects", {
            method: "POST",
            body: { from_path: slug, to_path: redirectTo, active: true },
          });
          if (ins.status >= 200 && ins.status < 300) warning = await syncQuietly();
          else warning = "Page deleted, but the redirect row could not be saved.";
        }
      }
      return json(200, { ok: true, ...(warning ? { warning } : {}) });
    } catch (err) {
      return json(400, { error: err.message });
    }
  }

  return json(400, { error: "Unknown action." });
};
