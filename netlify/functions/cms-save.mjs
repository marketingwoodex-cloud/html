// Woodex CMS save — commits edited page HTML to the website repo.
// POST { path, html, message } with Authorization: Bearer <session>
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { ghPutFile, ghGetFile, toBase64, validPagePath } from "./_github.mjs";
import { saveVersion } from "./_versions.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });

  let body = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const { path, html } = body || {};
  if (!validPagePath(path)) return json(400, { error: "Invalid page path." });
  // Only the dashboard-managed JS config files and SEO files may be published this way.
  const isJsConfig = path === "assets/js/estimator-rates.js" || path === "assets/js/site-config.js" || path === "assets/js/theme-config.js" || path === "assets/js/nav-config.js";
  const isSeoFile = path === "sitemap.xml" || path === "robots.txt";
  if (typeof html !== "string" || (!isSeoFile && html.length < 100) || html.length > 2_000_000) {
    return json(400, { error: "Invalid page content." });
  }
  if (!isJsConfig && !isSeoFile && !/^[\s\S]*<html[\s>][\s\S]*<\/html>\s*$/.test(html)) {
    return json(400, { error: "Content does not look like a full page." });
  }
  if (isJsConfig && !/window\.(WX_RATES|WOODEX_CONFIG|WX_THEME|WX_NAV)\s*=/.test(html)) {
    return json(400, { error: "Config file does not look valid." });
  }
  if (isSeoFile && (typeof html !== "string" || html.length < 10 || html.length > 2_000_000)) {
    return json(400, { error: "Invalid SEO file content." });
  }

  try {
    // Snapshot the previous content for version history (never blocks the save).
    try {
      const prevFile = await ghGetFile(path);
      const prevHtml = prevFile?.content ? Buffer.from(prevFile.content, "base64").toString("utf8") : null;
      if (prevHtml) await saveVersion(path, prevHtml, user.username || user.role || "admin");
    } catch {}
    const result = await ghPutFile(
      path,
      toBase64(html),
      body?.message || `CMS: update ${path}`
    );
    return json(200, { ok: true, commit: result?.commit?.sha || null });
  } catch (err) {
    // Surface GitHub's status + message (no credentials) so a failed publish
    // is diagnosable: read-only token vs branch rules vs validation.
    const m = /GitHub (?:write|delete) failed \((\d+)\): ?(.*)/.exec(err?.message || "");
    return json(502, { error: m ? `Could not save to the website repo (GitHub ${m[1]}${m[2] ? ": " + m[2] : ""}).` : "Could not save to the website repo." });
  }
};
