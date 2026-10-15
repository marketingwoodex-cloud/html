// Public endpoint: website estimator -> estimator_leads table.
// POST { name, phone, email?, service_type, area, finish, estimate_min, estimate_max, _hp? }
// No login required; honeypot field filters bots.
import { json } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const clean = (v, n) => String(v ?? "").trim().slice(0, n);
const SERVICES = ["interior-design", "fit-out", "renovation", "architecture", "3d-visualization", "furniture"];
const FINISHES = ["essential", "standard", "premium"];

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!sbConfigured()) return json(503, { error: "The estimator is not configured yet." });

  let body = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }
  if (body?._hp) return json(200, { ok: true }); // honeypot: pretend success

  const name = clean(body?.name, 120);
  const phone = clean(body?.phone, 40);
  const email = clean(body?.email, 160);
  const service_type = clean(body?.service_type, 40);
  const finish = clean(body?.finish, 20);
  const area = Number(body?.area);
  const estimate_min = Number(body?.estimate_min);
  const estimate_max = Number(body?.estimate_max);

  if (name.length < 2) return json(400, { error: "Please enter your name." });
  if (!/^[+\d][\d\s-]{6,}$/.test(phone))
    return json(400, { error: "Please enter a valid phone number." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json(400, { error: "Please enter a valid email." });
  if (!SERVICES.includes(service_type)) return json(400, { error: "Please choose a service." });
  if (!FINISHES.includes(finish)) return json(400, { error: "Please choose a finish level." });
  if (!Number.isFinite(area) || area < 50 || area > 1000000)
    return json(400, { error: "Please enter a sensible area or quantity." });
  if (!Number.isFinite(estimate_min) || !Number.isFinite(estimate_max) || estimate_min < 0 || estimate_max < estimate_min)
    return json(400, { error: "Invalid estimate." });

  let ins = null;
  try {
    ins = await sbRest("estimator_leads", {
      method: "POST",
      body: {
        name,
        phone,
        email: email || null,
        service_type,
        area_sqft: Math.round(area),
        selections: { finish },
        estimate_min: Math.round(estimate_min),
        estimate_max: Math.round(estimate_max),
        status: "new",
      },
    });
  } catch {
    ins = null;
  }
  if (!ins || (ins.status !== 201 && ins.status !== 200))
    return json(502, { error: "Could not save. Please try WhatsApp instead." });

  try {
    await sbRest("activity", {
      method: "POST",
      body: { kind: "estimator", text: `New estimator lead from ${name} (${service_type})`, meta: { phone } },
    });
  } catch {
    /* activity is best-effort */
  }
  return json(200, { ok: true });
};
