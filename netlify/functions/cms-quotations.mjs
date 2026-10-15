// Dashboard API: quotations (sectioned BOQ). Requires CMS session.
// GET /.netlify/functions/cms-quotations[?status=draft]
// POST { client_name*, phone?, email?, project?, site?, location?, title?, description?,
//        sections?[{name, items[]}], discount?, terms?, notes?, option_label?,
//        parent_id? (creates a new version of that quotation) }
// PATCH { id, status? | client_name?, ..., sections[]?, discount?, terms?, notes?, option_label? }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";
import { clean, num, sanitizeSections, sectionTotals, flatItems } from "./_boq.mjs";

const STATUSES = ["draft", "sent", "approved", "rejected"];
const UUID = /^[0-9a-f-]{36}$/i;

function shape(row) {
  if (!row) return row;
  let sections = Array.isArray(row.sections) ? row.sections : [];
  if (!sections.length && Array.isArray(row.items) && row.items.length)
    sections = [{ name: "General", items: row.items }];
  return { ...row, sections };
}

async function nextRef() {
  const yy = String(new Date().getFullYear()).slice(2);
  let seq = 1;
  try {
    const { status, data } = await sbRest("quotations", { query: "?select=ref_no&limit=1000" });
    if (status === 200 && Array.isArray(data)) {
      const re = new RegExp(`^WI/Q-(\\d{4})/${yy}$`);
      for (const r of data) {
        const m = re.exec(r.ref_no || "");
        if (m) seq = Math.max(seq, Number(m[1]) + 1);
      }
    }
  } catch { /* fall through with seq=1 */ }
  return `WI/Q-${String(seq).padStart(4, "0")}/${yy}`;
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q =
      `?select=*&order=created_at.desc&limit=100` +
      (STATUSES.includes(status) ? `&status=eq.${status}` : "");
    const { status: s, data } = await sbRest("quotations", { query: q });
    if (s !== 200) return json(502, { error: "Could not load quotations." });
    return json(200, { quotations: (data || []).map(shape) });
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

    // New version of an existing quotation?
    let ref_no = null, version = 1, parent_id = null;
    if (body?.parent_id && UUID.test(String(body.parent_id))) {
      const { status: ps, data: pd } = await sbRest("quotations", {
        query: `?select=ref_no,version&id=eq.${body.parent_id}&limit=1`,
      });
      if (ps === 200 && pd && pd[0]) {
        ref_no = pd[0].ref_no;
        version = num(pd[0].version) + 1 || 2;
        parent_id = body.parent_id;
      }
    }
    if (!ref_no) ref_no = await nextRef();

    const ins = await sbRest("quotations", {
      method: "POST",
      body: {
        ref_no, version, parent_id,
        client_name,
        phone: clean(body?.phone, 40) || null,
        email: clean(body?.email, 160) || null,
        project: clean(body?.project, 200) || null,
        site: clean(body?.site, 200) || null,
        location: clean(body?.location, 200) || null,
        title: clean(body?.title, 120) || "Interior",
        description: clean(body?.description, 2000) || null,
        option_label: clean(body?.option_label, 40) || null,
        sections: t.sections,
        items: flatItems(t.sections),
        subtotal: t.subtotal, discount: t.discount, total: t.total,
        terms: clean(body?.terms, 4000) || null,
        notes: clean(body?.notes, 2000) || null,
        status: "draft",
      },
    });
    if (ins.status !== 201 && ins.status !== 200)
      return json(502, { error: "Could not save the quotation." });
    try {
      await sbRest("activity", {
        method: "POST",
        body: { kind: "quotation", text: `Quotation ${ref_no} V${version} created for ${client_name}`, meta: {} },
      });
    } catch { /* best-effort */ }
    return json(200, { ok: true, ref_no, version, quotation: shape(ins.data?.[0]) || null });
  }

  if (req.method === "PATCH") {
    const id = String(body?.id || "");
    if (!UUID.test(id)) return json(400, { error: "Invalid id." });
    const patch = { updated_at: new Date().toISOString() };
    if (STATUSES.includes(body?.status)) patch.status = body.status;
    if (body?.sections !== undefined) {
      const sections = sanitizeSections(body.sections);
      if (!sections.length) return json(400, { error: "Add at least one section with items." });
      const t = sectionTotals(sections, body?.discount);
      patch.sections = t.sections;
      patch.items = flatItems(t.sections);
      patch.subtotal = t.subtotal; patch.discount = t.discount; patch.total = t.total;
    } else if (body?.discount !== undefined) {
      // discount-only change: recompute from stored sections
      const { status: gs, data: gd } = await sbRest("quotations", {
        query: `?select=sections,items&id=eq.${id}&limit=1`,
      });
      if (gs === 200 && gd && gd[0]) {
        const cur = shape(gd[0]);
        const t = sectionTotals(cur.sections, body.discount);
        patch.sections = t.sections; patch.items = flatItems(t.sections);
        patch.subtotal = t.subtotal; patch.discount = t.discount; patch.total = t.total;
      }
    }
    for (const k of ["client_name", "phone", "email", "project", "site", "location", "title", "description", "option_label", "terms", "notes"]) {
      if (typeof body?.[k] === "string")
        patch[k] = clean(body[k], k === "terms" || k === "notes" || k === "description" ? 4000 : 200) || null;
    }
    if (body?.discount !== undefined && body?.sections === undefined) patch.discount = num(body.discount);
    if (patch.client_name !== undefined && patch.client_name !== null && patch.client_name.length < 2)
      return json(400, { error: "Client name is required." });
    const { status: s } = await sbRest("quotations", {
      method: "PATCH", query: `?id=eq.${id}`, body: patch,
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not update the quotation." });
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const id = String(body?.id || new URL(req.url).searchParams.get("id") || "");
    if (!UUID.test(id)) return json(400, { error: "Invalid id." });
    const { status: s } = await sbRest("quotations", {
      method: "DELETE", query: `?id=eq.${id}`,
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not delete the quotation." });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
