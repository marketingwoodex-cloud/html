// Shared BOQ helpers: sectioned line items for templates, quotations, invoices.
// Section: { name, items: [{ desc, qty, unit, rate, amount }] }
const UNITS = ["job", "nos", "sft", "rft", "sqmt", "each", "lumpsum"];
export const UNIT_LIST = UNITS;

const clean = (v, n) => String(v ?? "").trim().slice(0, n);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 200)
    .map((it) => {
      const desc = clean(it?.desc, 500);
      const qty = num(it?.qty);
      const unit = UNITS.includes(String(it?.unit || "").toLowerCase())
        ? String(it.unit).toLowerCase()
        : "job";
      const rate = num(it?.rate);
      return { desc, qty, unit, rate, amount: Math.round(qty * rate * 100) / 100 };
    })
    .filter((it) => it.desc);
}

export function sanitizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .slice(0, 30)
    .map((s) => ({
      name: clean(s?.name, 80) || "General",
      items: sanitizeItems(s?.items),
    }))
    .filter((s) => s.items.length);
}

// Totals across sections; returns per-section subtotals + grand totals.
export function sectionTotals(sections, discount) {
  let subtotal = 0;
  const withTotals = sections.map((s) => {
    const st = s.items.reduce((a, it) => a + num(it.amount), 0);
    subtotal += st;
    return { name: s.name, items: s.items, subtotal: Math.round(st * 100) / 100 };
  });
  const d = Math.min(num(discount), subtotal);
  return {
    sections: withTotals,
    subtotal: Math.round(subtotal),
    discount: Math.round(d),
    total: Math.round(subtotal - d),
  };
}

// Flat merge of all section items (keeps the legacy `items` column useful).
export function flatItems(sections) {
  const out = [];
  for (const s of sections) for (const it of s.items || []) out.push(it);
  return out;
}

export { clean, num };
