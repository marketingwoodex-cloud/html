// Dashboard API: built-in analytics from page_views. Requires CMS session.
// GET /.netlify/functions/cms-analytics
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const TZ = "Asia/Karachi";
const dayKey = (iso) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { status, data } = await sbRest("page_views",
    { query: `?select=path,viewed_at&viewed_at=gte.${encodeURIComponent(since)}&order=viewed_at.desc&limit=5000` });
  if (status !== 200) return json(502, { error: "Could not load analytics." });
  const rows = data || [];

  const total = rows.length;
  const counts = {};
  for (const r of rows) {
    const p = r.path || "/";
    counts[p] = (counts[p] || 0) + 1;
  }
  const topPages = Object.entries(counts)
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const byDay = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = dayKey(d.toISOString());
    byDay.push({ day: key, views: 0 });
  }
  const dayIdx = Object.fromEntries(byDay.map((b, i) => [b.day, i]));
  for (const r of rows) {
    const key = dayKey(r.viewed_at);
    if (key in dayIdx) byDay[dayIdx[key]].views++;
  }
  const today = byDay.length ? byDay[byDay.length - 1].views : 0;

  return json(200, { total, today, byDay, topPages });
};
