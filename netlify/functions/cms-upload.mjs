// Woodex CMS upload — stores an image in the website repo and returns its URL.
// POST { filename, data } (data = dataURL or raw base64) with Authorization: Bearer <session>
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { ghPutFile } from "./_github.mjs";

const MAX_BYTES = 4_000_000; // 4 MB

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

  let { filename, data } = body || {};
  if (typeof filename !== "string" || typeof data !== "string") {
    return json(400, { error: "Invalid upload." });
  }
  const m = data.match(/^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));base64,(.+)$/);
  if (!m) return json(400, { error: "Only image files (png, jpg, gif, webp, svg) are allowed." });

  const clean = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^\.+/, "").slice(-80);
  if (!clean || clean.length < 5) return json(400, { error: "Invalid file name." });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_BYTES) return json(400, { error: "Image is too large (max 4 MB)." });

  const stamp = Date.now().toString(36);
  const path = `assets/uploads/${stamp}-${clean}`;
  try {
    await ghPutFile(path, m[2].replace(/\s+/g, ""), `CMS: upload ${clean}`);
    return json(200, { ok: true, url: `/${path}` });
  } catch (err) {
    return json(502, { error: "Could not upload the image." });
  }
};
