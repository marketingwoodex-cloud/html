// Shared vercel.json redirects sync (audit P0-2 fix). Used by cms-redirects
// (manual SEO redirect management) and cms-pages (delete-with-redirect).
import { sbRest } from "./_supabase.mjs";
import { ghGetFile, ghPutFile, toBase64 } from "./_github.mjs";

// Re-write ONLY the redirects array of vercel.json (preserving rewrites and
// headers) so Vercel applies the redirects as real 308s. Sources are
// restricted to URL-safe characters so path-to-regexp never sees operator
// syntax.
export async function syncVercelRedirects() {
  const { status, data } = await sbRest("redirects", {
    query: "?select=from_path,to_path,active&order=created_at.asc&limit=500",
  });
  if (status !== 200) throw new Error("Could not read the redirects table.");
  const rows = (data || []).filter((r) => r.active !== false);
  const redirects = [];
  for (const r of rows) {
    const src = String(r.from_path || "").replace(/[^A-Za-z0-9/_~.-]/g, "");
    const dst = String(r.to_path || "");
    if (!src || src.length < 2 || !dst) continue;
    redirects.push({ source: src, destination: dst, permanent: true });
  }
  const file = await ghGetFile("vercel.json");
  if (!file || !file.content) throw new Error("vercel.json not found in repo.");
  const cfg = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  cfg.redirects = redirects;
  await ghPutFile("vercel.json", toBase64(JSON.stringify(cfg)), "CMS: sync SEO redirects");
  return redirects.length;
}

// Best-effort sync wrapper: never lose the DB change, but surface failures
// so the caller can warn instead of silently doing nothing.
export async function syncQuietly() {
  try {
    await syncVercelRedirects();
    return null;
  } catch (err) {
    return `Saved in database, but vercel.json could not be updated: ${err.message}`;
  }
}
