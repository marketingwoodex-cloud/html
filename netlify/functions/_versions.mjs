// Shared page-version history helpers for the Woodex CMS.
// Keeps the newest 20 versions per page_path. Never throws to callers.
import { sbRest } from "./_supabase.mjs";

const MAX_VERSIONS = 20;

export async function saveVersion(page_path, html, username, note) {
  try {
    if (!page_path || !html) return null;
    const res = await sbRest("page_versions", {
      method: "POST",
      body: { page_path, html, created_by: username || null, note: note || null },
    });
    if (res.status !== 201 && res.status !== 200) return null;
    // Prune to the newest 20.
    const list = await sbRest("page_versions", {
      query: `?select=id&page_path=eq.${encodeURIComponent(page_path)}&order=created_at.desc&limit=1000`,
    });
    const ids = (list.data || []).map((r) => r.id).filter(Boolean);
    if (ids.length > MAX_VERSIONS) {
      const stale = ids.slice(MAX_VERSIONS);
      for (const sid of stale) {
        await sbRest("page_versions", { method: "DELETE", query: `?id=eq.${sid}` }).catch(() => {});
      }
    }
    return res.data?.[0] || null;
  } catch {
    return null;
  }
}

export async function listVersions(page_path) {
  try {
    const { data } = await sbRest("page_versions", {
      query: `?select=id,page_path,created_by,note,created_at&page_path=eq.${encodeURIComponent(page_path)}&order=created_at.desc&limit=50`,
    });
    return (data || []).map((r) => ({ ...r }));
  } catch {
    return [];
  }
}
