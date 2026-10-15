// Dashboard API: quotation template library (sectioned). Requires CMS session.
// GET /.netlify/functions/cms-quotation-templates
// POST { name*, description?, sections?[{name, items[]}], terms?, upsert? }
// POST { ..., upsert: true } upgrades the same-name template instead of duplicating.
// PATCH { id, name?, description?, sections?, terms? }
// DELETE { id }
import { bearerSession, json, verifySession, canWrite } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";
import { clean, sanitizeSections, flatItems } from "./_boq.mjs";

const UUID = /^[0-9a-f-]{36}$/i;

function shape(row) {
  if (!row) return row;
  let sections = Array.isArray(row.sections) ? row.sections : [];
  if (!sections.length && Array.isArray(row.items) && row.items.length)
    sections = [{ name: "General", items: row.items }];
  return { ...row, sections };
}

export default async (req) => {
  if (!["GET","POST","PATCH","DELETE"].includes(req.method)) return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });
  if (req.method !== "GET" && !canWrite(user)) return json(403, { error: "Your role is read-only." });
  if (!sbConfigured()) return json(503, { error: "Database is not configured yet." });

  if (req.method === "GET") {
    const { status: s, data } = await sbRest("quotation_templates", {
      query: "?select=*&order=name.asc&limit=100",
    });
    if (s !== 200) return json(502, { error: "Could not load templates." });
    return json(200, { templates: (data || []).map(shape) });
  }

  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (req.method === "POST") {
    const name = clean(body?.name, 120);
    if (name.length < 2) return json(400, { error: "Template name required." });
    const sections = sanitizeSections(body?.sections);
    if (!sections.length) return json(400, { error: "Add at least one section with items." });
    const description = clean(body?.description, 2000);
    const terms = clean(body?.terms, 4000);
    if (body?.upsert) {
      const { status: fs, data: found } = await sbRest("quotation_templates", {
        query: `?select=id&name=eq.${encodeURIComponent(name)}&limit=1`,
      });
      if (fs === 200 && found && found.length) {
        const { status: ps } = await sbRest("quotation_templates", {
          method: "PATCH",
          query: `?id=eq.${found[0].id}`,
          body: { description, sections, items: flatItems(sections), terms, updated_at: new Date().toISOString() },
        });
        if (ps !== 200 && ps !== 204) return json(502, { error: "Could not upgrade template." });
        return json(200, { ok: true, id: found[0].id, upgraded: true });
      }
    }
    const { status: s, data } = await sbRest("quotation_templates", {
      method: "POST",
      body: { name, description, sections, items: flatItems(sections), terms },
    });
    if (s !== 200 && s !== 201) {
      const msg = JSON.stringify(data || "");
      if (/duplicate|unique/i.test(msg)) return json(409, { error: "A template with this name already exists." });
      return json(502, { error: "Could not save template." });
    }
    return json(200, { ok: true, id: data?.[0]?.id || null });
  }

  if (req.method === "PATCH") {
    const { id } = body || {};
    if (!UUID.test(String(id || ""))) return json(400, { error: "Invalid id." });
    const patch = { updated_at: new Date().toISOString() };
    if (body?.name !== undefined) {
      const name = clean(body.name, 120);
      if (name.length < 2) return json(400, { error: "Template name required." });
      patch.name = name;
    }
    if (body?.description !== undefined) patch.description = clean(body.description, 2000);
    if (body?.terms !== undefined) patch.terms = clean(body.terms, 4000);
    if (body?.sections !== undefined) {
      const sections = sanitizeSections(body.sections);
      if (!sections.length) return json(400, { error: "Add at least one section with items." });
      patch.sections = sections;
      patch.items = flatItems(sections);
    }
    const { status: s } = await sbRest("quotation_templates", {
      method: "PATCH",
      query: `?id=eq.${id}`,
      body: patch,
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not update template." });
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = body || {};
    if (!UUID.test(String(id || ""))) return json(400, { error: "Invalid id." });
    const { status: s } = await sbRest("quotation_templates", {
      method: "DELETE",
      query: `?id=eq.${id}`,
    });
    if (s !== 200 && s !== 204) return json(502, { error: "Could not delete template." });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed." });
};
