// Shared Supabase REST helper for Woodex CMS functions.
// Uses the service_role key server-side only; it never reaches the browser.
const URL = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const sbConfigured = () => Boolean(URL && KEY);

export async function sbRest(path, { method = "GET", body = null, query = "", prefer = "", count = "" } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}${query}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: [prefer || (method === "POST" ? "return=representation" : "return=minimal"), count ? `count=${count}` : ""].filter(Boolean).join(","),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  const out = { status: res.status, data };
  if (count) {
    // PostgREST answers count=exact with e.g. "Content-Range: 0-99/1423".
    const m = String(res.headers.get("content-range") || "").match(/\/(\d+)$/);
    out.total = m ? Number(m[1]) : null;
  }
  return out;
}

// Search-box sanitizer: PostgREST treats () , . " ' * \ as structural syntax
// inside or=(...)/ilike filters, so strip them before interpolating a user
// search term into a query string. Authenticated-only surface, but strict anyway.
export const cleanSearch = (v, n = 60) =>
  String(v ?? "").replace(/\s+/g, " ").replace(/[(),."'*\\]/g, "").trim().slice(0, n);
