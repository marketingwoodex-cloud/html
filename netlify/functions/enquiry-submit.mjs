// Public endpoint: website contact form -> enquiries table.
// POST { name, phone, email?, project_type?, message?, _hp? }
// No login required; honeypot field filters bots.
import { json } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const clean = (v, n) => String(v ?? "").trim().slice(0, n);

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!sbConfigured()) return json(503, { error: "Enquiries are not configured yet." });

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
  const project_type = clean(body?.project_type, 80);
  const message = clean(body?.message, 2000);

  if (name.length < 2) return json(400, { error: "Please enter your name." });
  if (!/^[+\d][\d\s-]{6,}$/.test(phone))
    return json(400, { error: "Please enter a valid phone number." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json(400, { error: "Please enter a valid email." });

  let ins = null;
  try {
    ins = await sbRest("enquiries", {
      method: "POST",
      body: {
        name,
        phone,
        email: email || null,
        project_type: project_type || null,
        message: message || null,
        source: "website",
        status: "new",
      },
    });
  } catch {
    ins = null;
  }
  if (!ins || (ins.status !== 201 && ins.status !== 200))
    return json(502, { error: "Could not save your enquiry. Please try WhatsApp instead." });

  try {
    await sbRest("activity", {
      method: "POST",
      body: { kind: "enquiry", text: `New enquiry from ${name}`, meta: { phone } },
    });
  } catch {
    /* activity is best-effort */
  }
  return json(200, { ok: true });
};
