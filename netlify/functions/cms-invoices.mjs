// Dashboard API: invoices (created from quotations). Requires CMS session.
// GET /.netlify/functions/cms-invoices[?payment_status=unpaid]
// POST { quotation_id?, client_name*, phone?, email?, project?, site?, location?,
//        title?, description?, sections?[{name, items[]}], discount?, terms?, notes?,
//        due_date?, issue_date? }
// PATCH { id, payment_status?, amount_paid?, due_date?, terms?, notes?, ... }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";
import { clean, num, sanitizeSections, sectionTotals, flatItems } from "./_boq.mjs";

const PAY = ["unpaid", "partial", "paid"];
const UUID = /^[0-9a-f-]{36}$/i;

function shape(row) {
  if (!row) return row;
  let sections = Array.isArray(row.sections) ? row.sections : [];
  if (!sections.length && Array.isArray(row.items) && row.items.length)
    sections = [{ name: "General", items: row.items }];
  return { ...row, sections };
}

async function nextInvNo() {
  const yy = String(new Date().getFullYear()).slice(2);
  let seq = 1;
  try {
    const { status, data } = await sbRest("invoices", { query: "?select=inv_no&limit=1000" });
    if (status === 200 && Array.isArray(data)) {
      const re = new RegExp(`^WI/INV-(\\d{4})/${yy}$`);
      for (const r of data) {
        const m = re.exec(r.inv_no || "");
        if (m) seq = Math.max(seq, Number(m[1]) + 1);
      }
    }
  } catch { /* fall through */ }
  return `WI/INV-${String(seq).padStart(4, "0")}/${yy}`;
}

function derivePay(total, amount_paid) {
  const t = num(total), p = num(amount_paid);
  if (p <= 0) return "unpaid";
  if (p >= t) return "paid";
  return "partial";
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const ps = url.searchParams.get("payment_status");
    const q =
      `?select=*&order=created_at.desc&limit=100` +
      (PAY.includes(ps) ? `&payment_status=eq.${ps}` : "");
    const { status: s, data } = await sbRest("invoices", { query: q });
    if (s !== 200) return json(502, { error: "Could not load invoices." });
    return json(200, { invoices: (data || []).map(shape) });
  }

  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (req.method === "POST") {
    const client_name = clean(body?.client_name, 160);
    if (client_name.length < 2) return json(400, { error: "Client name is required." });
    const sections = sanitizeSections(body?.sections);
    if (!sections.length) return json(400, { error: "Add at least one section with items." });
    const t = sectionTotals(sections, body?.discount);
    const inv_no = await nextInvNo();
    const quotation_id = body?.quotation_id && UUID.test(String(body.quotation_id)) ? body.quotation_id : null;
    const ins = await sbRest("invoices", {
      method: "POST",
      body: {
        inv_no, version: 1, quotation_id,
        client_name,
        phone: clean(body?.phone, 40) || null,
        email: clean(body?.email, 160) || null,
        project: clean(body?.project, 200) || null,
        site: clean(body?.site, 200) || null,
        location: clean(body?.location, 200) || null,
        title: clean(body?.title, 120) || "Invoice",
        description: clean(body?.description, 2000) || null,
        sections: t.sections,
        items: flatItems(t.sections),
        subtotal: t.subtotal, discount: t.discount, total: t.total,
        amount_paid: 0, payment_status: "unpaid",
        issue_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body?.issue_date || "")) ? body.issue_date : new Date().toISOString().slice(0, 10),
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body?.due_date || "")) ? body.due_date : null,
        terms: clean(body?.terms, 4000) || null,
        notes: clean(body?.notes, 2000) || null,
      },
    });
    if (ins.status !== 201 && ins.status !== 200)
      return json(502, { error: "Could not save the invoice." });
    try {
      await sbRest("activity", {
        method: "POST",
        body: { kind: "invoice", text: `Invoice ${inv_no} created for ${client_name}`, meta: {} },
      });
    } catch { /* best-effort */ }
    return json(200, { ok: true, inv_no, invoice: shape(ins.data?.[0]) || null });
  }

  if (req.method === "PATCH") {
    const id = String(body?.id || "");
    if (!UUID.test(id)) return json(400, { error: "Invalid id." });
    const patch = { updated_at: new Date().toISOString() };
    if (body?.sections !== undefined) {
      const sections = sanitizeSections(body.sections);
      if (!sections.length) return json(400, { error: "Add at least one section with items." });
      const t = sectionTotals(sections, body?.discount);
      patch.sections = t.sections; patch.items = flatItems(t.sections);
      patch.subtotal = t.subtotal; patch.discount = t.discount; patch.total = t.total;
      if (body?.amount_paid === undefined) {
        // re-derive payment status against the new total
        const { status: gs, data: gd } = await sbRest("invoices", {
          query: `?select=amount_paid&id=eq.${id}&limit=1`,
        });
        if (gs === 200 && gd && gd[0]) patch.payment_status = derivePay(t.total, gd[0].amount_paid);
      }
    }
    if (body?.amount_paid !== undefined) {
      patch.amount_paid = Math.round(num(body.amount_paid));
      const total = patch.total !== undefined ? patch.total : null;
      if (total === null) {
        const { status: gs, data: gd } = await sbRest("invoices", {
          query: `?select=total&id=eq.${id}&limit=1`,
        });
        if (gs === 200 && gd && gd[0]) patch.payment_status = derivePay(gd[0].total, patch.amount_paid);
      } else {
        patch.payment_status = derivePay(total, patch.amount_paid);
      }
    }
    if (body?.payment_status !== undefined && PAY.includes(body.payment_status) && body?.amount_paid === undefined)
      patch.payment_status = body.payment_status;
    for (const k of ["client_name", "phone", "email", "project", "site", "location", "title", "description", "terms", "notes"]) {
      if (typeof body?.[k] === "string")
        patch[k] = clean(body[k], k === "terms" || k === "notes" || k === "description" ? 4000 : 200) || null;
    }
    if (typeof body?.due_date === "string")
      patch.due_date = /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null;
    if (patch.client_name !== undefined && patch.client_name !== null && patch.client_name.length < 2)
      return json(400, { error: "Client name is required." });
    const { status: s } = await sbRest("invoices", {
      method: "PATCH", query: `?id=eq.${id}`, body: patch,
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not update the invoice." });
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const id = String(body?.id || "");
    if (!UUID.test(String(id || ""))) return json(400, { error: "Invalid id." });
    const { status: s } = await sbRest("invoices", {
      method: "DELETE", query: `?id=eq.${id}`,
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not delete the invoice." });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
