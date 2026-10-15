// Dashboard API: site settings (key/value). Requires CMS session.
// GET /.netlify/functions/cms-settings -> { settings: { key: value } }
// POST { key, value } -> upsert one setting (key allowlisted)
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const ALLOWED = ["site", "contact", "social", "rates"];

export default async (req) => {
  if (!["GET","POST"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const { status, data } = await sbRest("site_settings", { query: "?select=key,value" });
    if (status !== 200) return json(502, { error: "Could not load settings." });
    const settings = {};
    (data || []).forEach((r) => { settings[r.key] = r.value; });
    return json(200, { settings });
  }

  if (req.method === "POST") {
    let body = null;
    try { body = await req.json(); } catch { body = null; }
    const key = String(body?.key || "");
    if (!ALLOWED.includes(key)) return json(400, { error: "Unknown setting." });
    const value = body?.value;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return json(400, { error: "Invalid value." });
    if (JSON.stringify(value).length > 200000) return json(400, { error: "Setting is too large." });
    const { status } = await sbRest("site_settings", {
      method: "POST",
      query: "?on_conflict=key",
      prefer: "resolution=merge-duplicates,return=representation",
      body: { key, value },
    });
    if (status !== 200 && status !== 201) return json(502, { error: "Could not save setting." });
    return json(200, { ok: true, key });
  }

  return json(405, { error: "Method not allowed." });
};
