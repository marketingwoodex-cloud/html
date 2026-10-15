/**
 * LiveTemplates — the quotation templates: one per type of work.
 *
 * This is v2.1's Templates screen, on a real endpoint. What it keeps is the shape the studio works in: a card
 * per template with its kind, how many sections and lines it carries, the first line of its terms and what it
 * comes to; an editor that is the quotation builder's section editor with a client taken away; and the two
 * imports (`/admin/vendor/quote-starter.js`'s nine templates, or a JSON file somebody exported).
 *
 * Three things are decisions rather than ports:
 *
 *   · **A template is not a quotation, and the screen says which figures are which.** The rates are the
 *     studio's; the client, the site and the discount belong to a quotation. So the card counts its priced
 *     lines and says "rates to fill" when there are none, instead of showing a total of zero, which reads as
 *     "this job is free".
 *   · **The document is shown, not described.** "Preview" draws the quotation a client would receive —
 *     through the same component the print view uses — because the question a template answers is what the
 *     client will read.
 *   · **Saving is the Master's call when a Manager does it.** A template is what every future quotation is
 *     built from, so it goes through the same approval gate as a quotation, and the screen reports the
 *     pending state in the same words as the other screens.
 *
 * Offline it says so and shows nothing: a template list is a claim about rows in a database.
 */
import { useMemo, useRef, useState } from "react";
import { Copy, FileUp, Layers, Pencil, Plus, RefreshCw, Save, Sparkles, Trash2, X } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Seg, statusTone } from "../components/primitives";
import { DocPreview, type DocCompany, type DocDesign } from "../components/DocPreview";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { isPending, useLive, type PendingResult, type TplImportResult, type TplItem, type TplRow, type TplSaveResult, type TplSection, type TplsData } from "../lib/live";
import { money } from "../lib/format";

interface Draft {
  id: number | null;
  name: string;
  kind: string;
  description: string;
  terms: string;
  sections: TplSection[];
}

const NEW_SECTION: TplSection = { name: "", note: "", items: [{ desc: "", qty: 1, unit: "sft", rate: 0 }] };

/** A blank line to type into. The server refuses a line with no description, so the draft starts empty. */
const BLANK_ITEM: TplItem = { desc: "", qty: 1, unit: "sft", rate: 0 };

export function LiveTemplates() {
  const { link, reason } = useSession();
  const live = useLive<TplsData>("/quotations/templates");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<TplRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (link !== "live") {
    return (
      <>
        <PageHead title="Quote templates" sub="One template per type of work — the shapes every quotation is built from" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. Templates live in the database beside the quotations made from them, so this screen shows nothing rather than an empty list that reads as “you have no templates”."
            : "Sign in to see and edit the templates."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  const rows = live.data?.templates ?? [];
  const kinds = live.data?.kinds ?? { other: "Other" };
  const starter = live.data?.starter ?? [];
  const company: DocCompany = live.data?.company ?? { name: "Woodex Interior" };
  const missing = starter.filter((s) => !s.imported);

  const fail = (err: unknown) =>
    setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      setNote(await fn());
      live.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const saveTemplate = (d: Draft) =>
    run(async () => {
      const body = {
        name: d.name,
        kind: d.kind,
        description: d.description,
        terms: d.terms,
        sections: d.sections,
      };
      /* An edit is a PATCH on the row; a new template is a POST to the collection. Same handler either way —
         `wx_route_tpl_save_do()` takes the id from the path or from the body. */
      const r = d.id
        ? await api.patch<TplSaveResult | PendingResult>(`/quotations/templates/${d.id}`, body)
        : await api.post<TplSaveResult | PendingResult>("/quotations/templates", body);
      if (isPending(r)) return r.message;
      setEditing(null);
      return `Saved — “${r.template.name}” now has ${r.template.sectionCount} sections and ${r.template.lineCount} lines.`;
    });

  const removeTemplate = (t: TplRow) =>
    run(async () => {
      const r = await api.del<PendingResult | { deleted: number }>(`/quotations/templates/${t.id}`, {});
      if (isPending(r)) return r.message;
      return `Deleted “${t.name}”. Quotations made from it are untouched — they carry their own sections.`;
    });

  const importStarter = () =>
    run(async () => {
      const r = await api.post<TplImportResult | PendingResult>("/quotations/templates/import", { starter: true });
      if (isPending(r)) return r.message;
      return r.imported
        ? `Imported ${r.imported} of the nine starter templates${r.skipped.length ? `, skipped ${r.skipped.length} already saved (${r.skipped.join(", ")})` : ""}.`
        : `Nothing to import — all ${r.skipped.length} are already saved.`;
    });

  return (
    <>
      <PageHead
        title="Quote templates"
        sub="One template per type of work. A quotation made from one can be changed freely for each client."
        actions={
          <div className="row">
            <Btn icon={<RefreshCw size={15} />} onClick={live.reload}>Refresh</Btn>
            {missing.length && !editing ? (
              <Btn icon={<Sparkles size={15} />} onClick={importStarter} disabled={busy}>
                {`Import the starter set (${missing.length} of ${starter.length})`}
              </Btn>
            ) : null}
            {!editing ? (
              <>
                <Btn icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()} disabled={busy}>
                  Import from file
                </Btn>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(await f.text());
                    } catch {
                      setBad(new ApiFailure({ code: "VALIDATION", message: "That file is not valid JSON" }, 400, "client"));
                      return;
                    }
                    const list = Array.isArray(parsed) ? parsed : (parsed as { templates?: unknown }).templates;
                    if (!Array.isArray(list) || !list.length) {
                      setBad(new ApiFailure({ code: "VALIDATION", message: "No templates found in that file" }, 400, "client"));
                      return;
                    }
                    await run(async () => {
                      const r = await api.post<TplImportResult | PendingResult>("/quotations/templates/import", { templates: list });
                      if (isPending(r)) return r.message;
                      const parts = [`Imported ${r.imported}`];
                      if (r.skipped.length) parts.push(`skipped ${r.skipped.length} already saved`);
                      if (r.refused.length) parts.push(`refused ${r.refused.length} (${r.refused.join(", ")})`);
                      return parts.join(" · ");
                    });
                  }}
                />
                <Btn
                  variant="primary"
                  icon={<Plus size={15} />}
                  onClick={() =>
                    setEditing({
                      id: null,
                      name: "",
                      kind: "renovation",
                      description: "",
                      terms: "50% advance payment with work order.\nPayment will be charged on the actual dimension / size of area.\nRates are valid for 15 days as per market rates.",
                      sections: [{ ...NEW_SECTION, items: [{ ...BLANK_ITEM }] }],
                    })
                  }
                >
                  New template
                </Btn>
              </>
            ) : null}
          </div>
        }
      />

      {bad ? (
        <Note tone="danger" title={`${bad.code} · request ${bad.requestId ?? "—"}`}>
          {bad.message}
        </Note>
      ) : null}
      {note ? <Note tone="ok">{note}</Note> : null}
      {live.error ? (
        <Note tone="danger" title={`${live.error.code} · request ${live.error.requestId ?? "—"}`}>
          {live.error.message}
        </Note>
      ) : null}

      {editing ? (
        <TemplateEditor
          draft={editing}
          kinds={kinds}
          units={live.data?.units ?? []}
          itemKinds={live.data?.itemKinds ?? []}
          busy={busy}
          onChange={setEditing}
          onCancel={() => {
            setEditing(null);
            setNote(null);
            setBad(null);
          }}
          onSave={() => saveTemplate(editing)}
        />
      ) : preview ? (
        <>
          <div className="row-between">
            <h2 className="cell-main">Preview — {preview.name}</h2>
            <Btn icon={<X size={15} />} onClick={() => setPreview(null)}>Close preview</Btn>
          </div>
          <PreviewPane tpl={preview} company={company} />
        </>
      ) : live.loading ? (
        <Card><p className="cell-sub">Loading…</p></Card>
      ) : rows.length ? (
        <div className="tpl-grid">
          {rows.map((t) =>
            t.broken ? (
              <Card key={t.id}>
                <Note tone="danger" title="A template that will not decode">
                  {t.name} is stored in a shape this build cannot read. Its row in the database is intact — open it
                  in the v2.1 admin to see what it holds, or save it again here to replace it.
                </Note>
              </Card>
            ) : (
              <Card key={t.id}>
                <div className="row-between">
                  <div>
                    <h2 className="cell-main">{t.name}</h2>
                    <p className="cell-sub">
                      {t.sectionCount} sections · {t.lineCount} lines · {t.pricedCount} priced
                    </p>
                  </div>
                  <Pill tone={t.pricedCount ? "ok" : "neutral"}>{t.kindLabel}</Pill>
                </div>
                {t.description ? <p className="cell-sub">{t.description}</p> : null}
                <div className="chip-row">
                  {t.sections.slice(0, 10).map((s, i) => (
                    <span key={i} className="chip">{s.name || `Section ${i + 1}`}</span>
                  ))}
                  {t.sections.length > 10 ? <span className="chip">+{t.sections.length - 10} more</span> : null}
                </div>
                {t.termsFirst ? <p className="cell-sub">{t.termsFirst}</p> : null}
                <div className="row-between">
                  <b>{t.pricedCount ? money(t.total) : "Rates to fill"}</b>
                  <div className="row">
                    <Btn size="sm" onClick={() => setPreview(t)}>Preview</Btn>
                    <Btn
                      size="sm"
                      icon={<Pencil size={14} />}
                      onClick={() =>
                        setEditing({
                          id: t.id ?? null,
                          name: t.name,
                          kind: t.kind,
                          description: t.description,
                          terms: t.terms,
                          sections: t.sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) })),
                        })
                      }
                    >
                      Edit
                    </Btn>
                    <Btn
                      size="sm"
                      icon={<Trash2 size={14} />}
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Delete the template “${t.name}”? Quotations made from it are not affected.`)) {
                          void removeTemplate(t);
                        }
                      }}
                    >
                      Delete
                    </Btn>
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      ) : (
        <Empty
          title="No templates yet"
          sub={`Import the nine the studio ships — ${starter.map((s) => s.name).join(", ")} — or type one from scratch.`}
        />
      )}

      {!editing && !preview && !live.loading && starter.length ? (
        <Card>
          <h2 className="cell-main">The starter set</h2>
          <p className="cell-sub">
            Nine BOQ templates the studio has quoted from for years, generated from the same file the website
            loads. Importing adds the ones whose names are not saved yet and never overwrites an edited one.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Kind</th>
                  <th>Sections</th>
                  <th>Lines</th>
                  <th>Saved</th>
                </tr>
              </thead>
              <tbody>
                {starter.map((s) => (
                  <tr key={s.name}>
                    <td className="cell-main">{s.name}</td>
                    <td>{s.kindLabel}</td>
                    <td>{s.sectionCount}</td>
                    <td>{s.lineCount}</td>
                    <td>
                      <Pill tone={s.imported ? "ok" : "neutral"}>{s.imported ? "already saved" : "will be added"}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ the document */

/**
 * The quotation this template would produce, as the client would read it.
 *
 * The client's name is a placeholder and the page says so — a template has no client, and drawing somebody's
 * name on it would be inventing one. Everything else is real: the studio's rates, the section names, the terms.
 */
function PreviewPane({ tpl, company }: { tpl: TplRow; company: DocCompany }) {
  const [design, setDesign] = useState<DocDesign>("classic");
  const row = useMemo(() => (tpl.id ? tpl : { ...tpl, id: 0 }), [tpl]);
  return (
    <>
      <div className="row-between">
        <Seg
          value={design}
          onChange={setDesign}
          options={[
            { id: "classic", label: "Classic" },
            { id: "minimal", label: "Minimal" },
            { id: "premium", label: "Premium" },
          ]}
        />
        <p className="cell-sub">
          A preview for judging the document. Nothing here is sent, and the totals are the ones the server derived
          for the saved template.
        </p>
      </div>
      <DocPreview
        title="Quotation"
        no="WI-XXXXX"
        date={new Date().toISOString().slice(0, 10)}
        client={{ name: "Client name", company: "", address: "" }}
        project={row.name}
        site=""
        sections={row.sections}
        subtotal={row.subtotal}
        discount={0}
        taxPct={0}
        tax={0}
        total={row.total}
        terms={row.terms}
        design={design}
        company={company}
        sample="Sample — a template has no client. The rates and terms are the saved ones."
        note={row.pricedCount ? undefined : "Every line is unpriced: the rates are filled in on each quotation."}
      />
    </>
  );
}

/* ------------------------------------------------------------------ the editor */

function TemplateEditor({
  draft,
  kinds,
  units,
  itemKinds,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  kinds: Record<string, string>;
  units: string[];
  itemKinds: string[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const unitsList = units.length ? units : ["sft", "rft", "sqmt", "nos", "each", "set", "point", "job", "lumpsum"];
  const lines = draft.sections.reduce((a, s) => a + s.items.length, 0);
  const priced = draft.sections.reduce((a, s) => a + s.items.filter((i) => (i.rate ?? 0) > 0).length, 0);

  const setSection = (si: number, patch: Partial<TplSection>) =>
    onChange({ ...draft, sections: draft.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  const setItem = (si: number, ii: number, patch: Partial<TplItem>) =>
    onChange({
      ...draft,
      sections: draft.sections.map((s, i) =>
        i === si ? { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : s,
      ),
    });
  const moveSection = (si: number, by: number) => {
    const to = si + by;
    if (to < 0 || to >= draft.sections.length) return;
    const next = [...draft.sections];
    const [s] = next.splice(si, 1);
    next.splice(to, 0, s);
    onChange({ ...draft, sections: next });
  };

  return (
    <>
      <Card>
        <div className="row-between">
          <h2 className="cell-main">{draft.id ? `Edit ${draft.name}` : "New template"}</h2>
          <div className="row">
            <Btn onClick={onCancel} disabled={busy}>Cancel</Btn>
            <Btn variant="primary" icon={<Save size={15} />} onClick={onSave} disabled={busy || !draft.name.trim()}>
              Save template
            </Btn>
          </div>
        </div>
        <div className="grid grid-2">
          <label className="stack">
            <span className="field-label">Name</span>
            <input className="input" value={draft.name} maxLength={80} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Renovation" />
          </label>
          <div className="stack">
            <span className="field-label">Type</span>
            <Seg
              value={draft.kind}
              onChange={(k) => onChange({ ...draft, kind: k })}
              options={Object.entries(kinds).map(([id, label]) => ({ id, label }))}
            />
          </div>
        </div>
        <label className="stack">
          <span className="field-label">Description</span>
          <input
            className="input"
            value={draft.description}
            maxLength={400}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder="What kind of work this covers — the line a card shows"
          />
        </label>
        <label className="stack">
          <span className="field-label">Default terms</span>
          <textarea
            className="input"
            rows={5}
            value={draft.terms}
            maxLength={3000}
            onChange={(e) => onChange({ ...draft, terms: e.target.value })}
            placeholder="50% advance payment with work order."
          />
        </label>
        <p className="cell-sub">
          {draft.sections.length} sections · {lines} lines · {priced} priced.{" "}
          {priced ? "" : "Rates may stay empty — they are filled in on each quotation."}
        </p>
      </Card>

      {draft.sections.map((s, si) => (
        <Card key={si}>
          <div className="row-between">
            <div className="grid grid-2" style={{ flex: 1 }}>
              <label className="stack">
                <span className="field-label">Section {si + 1}</span>
                <input
                  className="input"
                  value={s.name}
                  maxLength={80}
                  onChange={(e) => setSection(si, { name: e.target.value })}
                  placeholder="Flooring"
                />
              </label>
              <label className="stack">
                <span className="field-label">Note under the heading</span>
                <input
                  className="input"
                  value={s.note ?? ""}
                  maxLength={600}
                  onChange={(e) => setSection(si, { note: e.target.value })}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="row">
              <Btn size="sm" onClick={() => moveSection(si, -1)} disabled={si === 0}>↑</Btn>
              <Btn size="sm" onClick={() => moveSection(si, 1)} disabled={si === draft.sections.length - 1}>↓</Btn>
              <Btn
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => onChange({ ...draft, sections: draft.sections.filter((_, i) => i !== si) })}
              >
                Remove
              </Btn>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Line</th>
                  <th>Kind</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Rate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, ii) => (
                  <tr key={ii}>
                    <td>
                      <input
                        className="input"
                        value={it.desc}
                        maxLength={it.kind === "spec" ? 2000 : 600}
                        onChange={(e) => setItem(si, ii, { desc: e.target.value })}
                        placeholder={it.kind ? "A heading or a specification line" : "Vitrified tiles 600x1200"}
                      />
                    </td>
                    <td>
                      <select
                        className="select"
                        value={it.kind ?? ""}
                        onChange={(e) => setItem(si, ii, { kind: e.target.value })}
                      >
                        <option value="">Priced line</option>
                        {itemKinds.map((k) => (
                          <option key={k} value={k}>{k === "head" ? "Heading" : "Specification"}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={it.qty}
                        disabled={Boolean(it.kind)}
                        onChange={(e) => setItem(si, ii, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <select className="select" value={it.unit} disabled={Boolean(it.kind)} onChange={(e) => setItem(si, ii, { unit: e.target.value })}>
                        {unitsList.map((u) => (
                          <option key={u} value={u}>{u === "sqmt" ? "sq m" : u === "lumpsum" ? "L/S" : u}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="1"
                        value={it.rate}
                        disabled={Boolean(it.kind)}
                        onChange={(e) => setItem(si, ii, { rate: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <Btn
                        size="sm"
                        iconOnly
                        icon={<X size={14} />}
                        title="Remove this line"
                        onClick={() => setSection(si, { items: s.items.filter((_, j) => j !== ii) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <Btn size="sm" icon={<Plus size={14} />} onClick={() => setSection(si, { items: [...s.items, { ...BLANK_ITEM }] })}>
              Add line
            </Btn>
            <Btn
              size="sm"
              icon={<Layers size={14} />}
              onClick={() => setSection(si, { items: [...s.items, { desc: "", qty: 0, unit: "job", rate: 0, kind: "head" }] })}
            >
              Add heading
            </Btn>
          </div>
        </Card>
      ))}

      <Card>
        <div className="row">
          <Btn icon={<Plus size={15} />} onClick={() => onChange({ ...draft, sections: [...draft.sections, { ...NEW_SECTION, items: [{ ...BLANK_ITEM }] }] })}>
            Add section
          </Btn>
          <Btn
            variant="primary"
            icon={<Save size={15} />}
            onClick={onSave}
            disabled={busy || !draft.name.trim()}
          >
            Save template
          </Btn>
          <Btn onClick={onCancel} disabled={busy}>Cancel</Btn>
        </div>
        <p className="cell-sub">
          Saving is what puts this in front of the Master when a Manager does it — the same gate a quotation goes
          through, in the same words. Until then nothing changes for anybody.
        </p>
      </Card>

      {draft.sections.length ? (
        <Card>
          <h2 className="cell-main">Copy as JSON</h2>
          <p className="cell-sub">
            The shape the import accepts, so a template can be moved between installs by hand. This is the shape
            the file import reads: an array of templates, or an object with a <code>templates</code> key.
          </p>
          <textarea
            className="input mono"
            readOnly
            rows={8}
            value={JSON.stringify(
              { name: draft.name, kind: draft.kind, description: draft.description, sections: draft.sections, terms: draft.terms },
              null,
              2,
            )}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="row">
            <Btn
              size="sm"
              icon={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard?.writeText(
                  JSON.stringify({ name: draft.name, kind: draft.kind, description: draft.description, sections: draft.sections, terms: draft.terms }, null, 2),
                );
              }}
            >
              Copy
            </Btn>
            <Pill tone={statusTone("draft")}>{draft.id ? `Saved as template #${draft.id}` : "Not saved yet"}</Pill>
          </div>
        </Card>
      ) : null}
    </>
  );
}
