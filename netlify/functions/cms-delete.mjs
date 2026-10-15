// Woodex CMS delete — removes a published page file from the website repo.
// POST { path } with Authorization: Bearer <session>
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { ghDeleteFile, validPagePath } from "./_github.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });

  let body = null;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }

  const { path } = body || {};
  if (!validPagePath(path)) return json(400, { error: "Invalid page path." });

  try {
    const result = await ghDeleteFile(path, body?.message || `CMS: remove ${path}`);
    return json(200, { ok: true, deleted: result.deleted });
  } catch (err) {
    const m = /GitHub (?:write|delete) failed \((\d+)\): ?(.*)/.exec(err?.message || "");
    return json(502, { error: m ? `Could not remove the page from the website repo (GitHub ${m[1]}${m[2] ? ": " + m[2] : ""}).` : "Could not remove the page from the website repo." });
  }
};
