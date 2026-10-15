// Dashboard API: list and update estimator leads. Requires CMS session.
// GET /.netlify/functions/cms-estimator-leads[?status=new]
// PATCH { id, status? }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const STATUSES = ["new", "contacted", "site_visit", "quoted", "won", "lost"];
const LEGACY = { in_progress: "contacted", closed: "won" };
const normStatus = (st) => LEGACY[st] || st;

export default async (req) => {
  if (!["GET","PATCH"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const filter = STATUSES.includes(status) ? `&status=eq.${status}` : "";
    const q = `?select=*&order=created_at.desc&limit=${limit}&offset=${offset}${filter}`;
    const { status: s, data, total } = await sbRest("estimator_leads", { query: q, count: "exact" });
    // PostgREST answers a limited read with 206 Partial Content when more rows exist.
    if (s !== 200 && s !== 206) {
      // 416 = offset ran past the end (rows deleted between pages): honest empty page.
      if (s === 416) return json(200, { leads: [], total: total ?? 0, limit, offset });
      return json(502, { error: "Could not load estimator leads." });
    }
    return json(200, { leads: data, total: total ?? (data || []).length, limit, offset });
  }

  if (req.method === "PATCH") {
    let body = null;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request." });
    }
    const { id, status: st } = body || {};
    if (!/^[0-9a-f-]{36}$/i.test(String(id || "")))
      return json(400, { error: "Invalid id." });
    const nst = normStatus(st);
    if (!STATUSES.includes(nst)) return json(400, { error: "Invalid status." });
    const { status: s } = await sbRest("estimator_leads", {
      method: "PATCH",
      query: `?id=eq.${id}`,
      body: { status: nst },
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not update lead." });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
