// Dashboard API: one-click JSON backup of all CMS tables. Admin only.
// GET /.netlify/functions/cms-backups
import { bearerSession, json, verifySession, isAdmin } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const TABLES = [
  "enquiries",
  "estimator_leads",
  "blog_posts",
  "projects",
  "team",
  "media",
  "activity",
  "site_settings",
  "clients",
  "site_visits",
  "testimonials",
  "services",
  "locations",
  "redirects",
  "menu_items",
  "invoices",
  "quotations",
  "quotation_templates",
  "page_views",
  "page_versions",
];
const ROW_CAP = 2000;

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (!isAdmin(user)) return json(403, { error: "Admin access required." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  // Read tables in parallel: sequential reads risk exceeding the serverless
  // time limit as the table list grows.
  const results = await Promise.all(TABLES.map(async (t) => {
    try {
      const { status, data } = await sbRest(t, { query: `?select=*&limit=${ROW_CAP}` });
      return [t, status === 200 ? (data || []) : { error: `read failed (${status})` }];
    } catch {
      return [t, { error: "read failed" }];
    }
  }));
  const tables = Object.fromEntries(results);
  // cms_users exported WITHOUT password hashes.
  try {
    const { status, data } = await sbRest("cms_users",
      { query: `?select=id,username,role,active,created_at&limit=${ROW_CAP}` });
    tables.cms_users = status === 200 ? (data || []) : { error: `read failed (${status})` };
  } catch {
    tables.cms_users = { error: "read failed" };
  }

  await sbRest("activity", { method: "POST",
    body: { kind: "system", text: `Backup exported by ${user.username}` } }).catch(() => {});

  return json(200, { exported_at: new Date().toISOString(), tables });
};
