// Dashboard API: aggregate stats for the redesigned dashboard home (Phase 1).
// GET /.netlify/functions/cms-stats?days=30 — requires CMS session.
// Returns KPI numbers, a daily chart series, and the widget lists shown on
// the dashboard: recent enquiries / projects / posts / activity.
import { bearerSession, json, verifySession } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

async function rows(table, query) {
  const { status, data } = await sbRest(table, { query });
  return status === 200 && Array.isArray(data) ? data : [];
}

const dayKey = (d) => d.toISOString().slice(0, 10);

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  const url = new URL(req.url || "/", "http://local");
  const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;

  const now = Date.now();
  const since = now - days * 24 * 3600 * 1000;
  const prevSince = since - days * 24 * 3600 * 1000;
  const weekAgo = now - 7 * 24 * 3600 * 1000;

  const [
    enquiries, leads, quotations, visits, posts, projects, activity, recent,
  ] = await Promise.all([
    rows("enquiries", "?select=id,status,created_at&order=created_at.asc&limit=2000"),
    rows("estimator_leads", "?select=id,created_at&order=created_at.asc&limit=2000"),
    rows("quotations", "?select=id,total,status,created_at&order=created_at.desc&limit=500"),
    rows("site_visits", "?select=id,visit_date,status,client_name&order=visit_date.asc&limit=300"),
    rows("blog_posts", "?select=id,status,title,slug,cover_image,excerpt,updated_at&order=updated_at.desc&limit=50"),
    rows("projects", "?select=id,title,slug,category,images,status,created_at&order=created_at.desc&limit=50"),
    rows("activity", "?select=kind,text,created_at&order=created_at.desc&limit=12"),
    rows("enquiries", "?select=id,name,phone,project_type,status,created_at&order=created_at.desc&limit=5"),
  ]);
  // page_views with vid; falls back to created_at-only until the vid column
  // migration has been applied (graceful degradation).
  let views = await rows("page_views", "?select=created_at,vid&order=created_at.asc&limit=12000");
  if (!views.length) views = await rows("page_views", "?select=created_at&order=created_at.asc&limit=12000");

  // ---- KPI: leads (enquiries + estimator) with 30d delta ----
  const isRecent = (r, from, to) => {
    const t = new Date(r.created_at).getTime();
    return t >= from && t < to;
  };
  const leadsIn = (from, to) =>
    enquiries.filter((r) => isRecent(r, from, to)).length + leads.filter((r) => isRecent(r, from, to)).length;
  const leadsNow = leadsIn(since, now);
  const leadsPrev = leadsIn(prevSince, since);
  const leadsDelta = leadsPrev === 0 ? (leadsNow > 0 ? 100 : 0) : Math.round(((leadsNow - leadsPrev) / leadsPrev) * 100);

  // ---- KPI: quotation value ----
  const quoteRows = quotations.filter((q) => q.status !== "rejected");
  const quotationValue = quoteRows.reduce((s, q) => s + (Number(q.total) || 0), 0);
  const quotesActive = quotations.filter((q) => ["sent", "approved"].includes(q.status)).length;

  // ---- KPI: site visits in the current week (Mon–Sun, local-agnostic UTC) ----
  const today = new Date();
  const dow = (today.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dow));
  const sunday = new Date(monday.getTime() + 7 * 24 * 3600 * 1000);
  const visitsWeek = visits.filter((v) => v.visit_date >= dayKey(monday) && v.visit_date < dayKey(sunday)).length;

  // ---- status counts + new-this-week ----
  const byStatus = { new: 0, contacted: 0, site_visit: 0, quoted: 0, won: 0, lost: 0 };
  let newThisWeek = 0;
  enquiries.forEach((e) => {
    if (byStatus[e.status] !== undefined) byStatus[e.status] += 1;
    if (e.status === "new" && new Date(e.created_at).getTime() >= weekAgo) newThisWeek += 1;
  });

  // ---- daily series ----
  const labels = [];
  const start = new Date(since);
  for (let i = 0; i < days; i++) {
    labels.push(dayKey(new Date(start.getTime() + i * 24 * 3600 * 1000)));
  }
  const idx = new Map(labels.map((l, i) => [l, i]));
  const mk = () => new Array(days).fill(0);
  const sViews = mk(), sVisitors = mk(), sLeads = mk(), sConv = mk();
  const uniq = new Set();
  let viewsTotal = 0;
  views.forEach((v) => {
    const k = dayKey(new Date(v.created_at));
    const i = idx.get(k);
    if (i === undefined) return;
    sViews[i] += 1;
    viewsTotal += 1;
    if (v.vid) { uniq.add(v.vid); sVisitors[i] += 1; } // visitors = distinct vid/day (approx when >1 hit/day)
  });
  enquiries.forEach((r) => {
    const i = idx.get(dayKey(new Date(r.created_at)));
    if (i !== undefined) sConv[i] += 1;
  });
  leads.forEach((r) => {
    const i = idx.get(dayKey(new Date(r.created_at)));
    if (i !== undefined) sLeads[i] += 1;
  });
  sConv.forEach((_, i) => { sConv[i] += sLeads[i]; }); // conversions = form + estimator submissions

  const uniqueTotal = uniq.size;

  return json(200, {
    days,
    stats: {
      enquiries_total: enquiries.length,
      enquiries_new: byStatus.new,
      enquiries_new_week: newThisWeek,
      enquiries_by_status: byStatus,
      estimator_leads: leads.length,
      blog_posts: posts.length,
      blog_published: posts.filter((p) => p.status === "published").length,
      projects: projects.length,
      leads_total: leadsNow,
      leads_prev: leadsPrev,
      leads_delta_pct: leadsDelta,
      quotation_value_pkr: Math.round(quotationValue),
      quotes_active: quotesActive,
      visits_week: visitsWeek,
      views_total: viewsTotal,
      unique_visitors: uniqueTotal,
      views_per_visitor: uniqueTotal ? +(viewsTotal / uniqueTotal).toFixed(1) : null,
      active_chats: 0,
    },
    series: { labels, views: sViews, visitors: sVisitors, leads: sLeads, conversions: sConv },
    recent_enquiries: recent,
    recent_projects: projects.slice(0, 4).map((p) => ({
      id: p.id, title: p.title, slug: p.slug, category: p.category, status: p.status,
      created_at: p.created_at,
      thumb: (Array.isArray(p.images) && p.images[0] && p.images[0].url) || null,
    })),
    recent_posts: posts.slice(0, 5).map((p) => ({
      id: p.id, title: p.title, slug: p.slug, status: p.status,
      updated_at: p.updated_at, cover_image: p.cover_image || null,
    })),
    activity,
  });
};
