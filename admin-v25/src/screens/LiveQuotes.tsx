/**
 * LiveQuotes — the quotation builder (plan P25.2 §5.3), draft to invoice.
 *
 * The plan's rules, as the screen's rules:
 *
 *   · **The money is the server's.** `wx_doc_totals()` computes every figure — line amounts, subtotal,
 *     discount, tax, total, in whole rupees — and this screen *prints* those. It never re-adds. While a
 *     line is being edited its amount shows "—", because the number on screen must be one the server sent
 *     for the values that are on screen. Save, and the server's amounts come back.
 *   · **Issued quotations are immutable.** "Revise" never edits over a sent document: it asks the server
 *     for a new version (`POST /quotations/{id}/revise`), which arrives as its own draft, and the original
 *     stays exactly as the client received it.
 *   · **The status flow is the server's.** `GET /quotations/{id}` reports which moves this document may
 *     make next; the buttons are those moves, not a copy of a flow that could drift. The one move that is
 *     not a status call is "invoiced" — that is `POST /quotations/{id}/invoice`, the conversion, which
 *     refuses politely if an invoice already exists (a double click cannot make two invoices).
 *   · **Every panel has its states:** loading, empty, validation failure (the field is named), API error
 *     (with a retry), permission denied (said in words), and — when a Manager's save waits for the
 *     Master — the pending note rather than a false success.
 *
 * The template picker is how a quotation starts (`POST /quotations/templates`' shapes are the starter);
 * the Preview tab draws the document through `DocPreview` — the same component the templates screen and
 * the print view use — so what the client will read is what a person here reviews.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Eye,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Seg } from "../components/primitives";
import { DocPreview } from "../components/DocPreview";
import { api, ApiFailure } from "../lib/api";
import { money } from "../lib/format";
import {
  isPending,
  useLive,
  type PendingResult,
  type QuoteDetailData,
  type QuoteDoc,
  type QuoteInvoiceResult,
  type QuoteItem,
  type QuoteSaveResult,
  type QuoteSection,
  type QuoteStatus,
  type QuoteStatusResult,
  type QuotesData,
  type TplRow,
  type TplsData,
} from "../lib/live";
import { useSession } from "../lib/session";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  approved: "Approved",
  rejected: "Rejected",
  invoiced: "Invoiced",
};

function statusToneFor(s: QuoteStatus): "neutral" | "info" | "ok" | "warn" | "danger" | "accent" {
  return s === "approved" ? "ok" : s === "rejected" ? "danger" : s === "invoiced" ? "accent" : s === "draft" ? "neutral" : "info";
}

/** What the "new quotation" editor starts as. From a template: its sections and terms. From nothing: empty. */
interface Seed {
  from: TplRow | null;
}

interface DraftClient {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
}

interface Draft {
  id: number | null;
  no: string;
  option: string;
  client: DraftClient;
  project: string;
  site: string;
  issue_date: string;
  valid_until: string;
  sections: QuoteSection[];
  discount: string;
  taxPct: string;
  rent: string;
  advance: string;
  terms: string;
  notes: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankDraft(seed: Seed | null): Draft {
  const t = seed?.from;
  return {
    id: null,
    no: "",
    option: "",
    client: { name: "", company: "", phone: "", email: "", address: "" },
    project: "",
    site: "",
    issue_date: today(),
    valid_until: "",
    sections: t
      ? t.sections.map((s) => ({
          ...s,
          items: s.items.map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit, rate: it.rate, amount: 0, kind: it.kind ?? "", code: it.code ?? "" })),
        }))
      : [],
    discount: "0",
    taxPct: "0",
    rent: "0",
    advance: "0",
    terms: t?.terms ?? "",
    notes: "",
  };
}

function draftFromDoc(q: QuoteDoc): Draft {
  return {
    id: q.id,
    no: q.no,
    option: q.option ?? "",
    client: {
      name: q.client?.name ?? "",
      company: q.client?.company ?? "",
      phone: q.client?.phone ?? "",
      email: q.client?.email ?? "",
      address: q.client?.address ?? "",
    },
    project: q.project ?? "",
    site: q.site ?? "",
    issue_date: q.issue_date ?? "",
    valid_until: q.valid_until ?? "",
    sections: (q.sections ?? []).map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) })),
    discount: String(q.discount ?? 0),
    taxPct: String(q.taxPct ?? 0),
    rent: String(q.rent ?? 0),
    advance: String(q.advance ?? 0),
    terms: q.terms ?? "",
    notes: q.notes ?? "",
  };
}

export function LiveQuotes() {
  const { link, me, reason } = useSession();
  const live = useLive<QuotesData>("/quotations?limit=100");
  const [openId, setOpenId] = useState<number | null>(null);
  const [seed, setSeed] = useState<Seed | null>(null);

  const openNew = (from: TplRow | null) => {
    setSeed({ from });
    setOpenId(null);
  };

  if (link !== "live" || !me) {
    return (
      <>
        <PageHead title="Quotations" sub="Draft, approve and convert — the money is the server's." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading your quotations">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. A quotation list is a claim about your documents, so nothing is shown until they can be read.`
            : link === "checking"
              ? "Still looking for api/v2 — no numbers are drawn until the server sends them."
              : "Sign in to see the quotations."}
        </Note>
      </>
    );
  }

  if (openId !== null || seed !== null) {
    return (
      <QuoteEditor
        id={openId}
        seed={seed}
        onBack={() => {
          setOpenId(null);
          setSeed(null);
          live.reload();
        }}
        onOpen={(id) => {
          setSeed(null);
          setOpenId(id);
        }}
      />
    );
  }

  return (
    <>
      <PageHead
        title="Quotations"
        sub={
          live.data
            ? `${live.data.total} quotation${live.data.total === 1 ? "" : "s"} · ${live.data.summary.open} open · ${live.data.summary.approved} approved`
            : "Loading…"
        }
        actions={
          <>
            <Btn icon={<Plus size={15} />} variant="primary" onClick={() => openNew(null)}>
              New quotation
            </Btn>
            <Btn icon={<Layers size={15} />} onClick={() => openNew(null)}>
              From a template
            </Btn>
            <Btn icon={<RefreshCw size={15} />} onClick={live.reload} disabled={live.loading}>
              Refresh
            </Btn>
          </>
        }
      />
      {/* The template picker is part of the editor's first step; "New quotation" and "From a template"
          open the same builder, the second with the picker showing. */}
      {live.loading && !live.data ? (
        <Card>
          <h2 className="cell-main">Loading…</h2>
          <p className="cell-sub">Reading the quotation list from the server.</p>
        </Card>
      ) : !live.data ? (
        <Note tone="danger" title="The quotations could not be read">
          {live.error?.message ?? "The server did not answer."}{" "}
          <Btn onClick={live.reload}>Try again</Btn>
        </Note>
      ) : live.data.quotes.length === 0 ? (
        <Empty
          title="No quotations yet"
          sub="A quotation starts from a template or from an empty document — both are here."
        />
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Total (from the server)</th>
                  <th>Valid until</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {live.data.quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="cell-main">
                      {q.label}
                      <div className="cell-sub">
                        V{q.version}
                        {q.created_by ? ` · ${q.created_by}` : ""}
                      </div>
                    </td>
                    <td>{q.client || <span className="muted">no client on the document</span>}</td>
                    <td>
                      <Pill tone={statusToneFor(q.status)}>{STATUS_LABEL[q.status] ?? q.status}</Pill>
                    </td>
                    <td className="mono">{q.totalDisplay || money(q.total)}</td>
                    <td>{q.valid_until || <span className="muted">—</span>}</td>
                    <td>
                      <Btn onClick={() => setOpenId(q.id)}>Open</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ the builder */

type Panel = "edit" | "preview" | "history";

function QuoteEditor({
  id,
  seed,
  onBack,
  onOpen,
}: {
  id: number | null;
  seed: Seed | null;
  onBack: () => void;
  onOpen: (id: number) => void;
}) {
  const [detail, setDetail] = useState<QuoteDoc | null>(null);
  const [tpls, setTpls] = useState<TplsData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(id === null ? blankDraft(seed) : null);
  const [panel, setPanel] = useState<Panel>("edit");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; field?: string; kind: "validation" | "error" | "permission" } | null>(null);
  const [pickTemplate, setPickTemplate] = useState(seed !== null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* The document and the template list both come from the server. The document carries the amounts, the
     moves and the history; the templates carry the shapes a new quotation starts from and the unit list
     the line editor needs. */
  const units = tpls?.units ?? detail?.units ?? ["job"];
  const itemKinds = tpls?.itemKinds ?? ["", "head", "spec"];

  useEffect(() => {
    api
      .get<TplsData>("/quotations/templates")
      .then((d) => {
        if (alive.current) setTpls(d);
      })
      .catch(() => {
        /* The picker degrades to an empty document; the unit list falls back to the document's own. */
      });
  }, []);

  useEffect(() => {
    if (id === null) return;
    setDetail(null);
    api
      .get<QuoteDetailData>(`/quotations/${id}`)
      .then((d) => {
        if (!alive.current) return;
        setDetail(d.quote);
        setDraft(draftFromDoc(d.quote));
      })
      .catch((err: unknown) => {
        if (!alive.current) return;
        setFailure(failureFrom(err));
      });
  }, [id]);

  function failureFrom(err: unknown) {
    if (err instanceof ApiFailure) {
      return {
        message: err.message,
        field: err.field,
        kind: err.isPermissionFailure ? ("permission" as const) : err.status === 400 ? ("validation" as const) : ("error" as const),
      };
    }
    return { message: String(err), kind: "error" as const };
  }

  function set(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setOutcome(null);
    setFailure(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      const body = {
        client: {
          name: draft.client.name,
          company: draft.client.company,
          phone: draft.client.phone,
          email: draft.client.email,
          address: draft.client.address,
        },
        project: draft.project,
        site: draft.site,
        option: draft.option,
        issue_date: draft.issue_date,
        valid_until: draft.valid_until,
        sections: draft.sections.map((s) => ({
          name: s.name,
          note: s.note ?? "",
          area: s.area ?? 0,
          items: s.items.map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit, rate: it.rate, kind: it.kind ?? "", code: it.code ?? "" })),
        })),
        discount: Number(draft.discount) || 0,
        taxPct: Number(draft.taxPct) || 0,
        rent: Number(draft.rent) || 0,
        advance: Number(draft.advance) || 0,
        terms: draft.terms,
        notes: draft.notes,
      };
      const r = await api.post<QuoteSaveResult | PendingResult>(
        draft.id === null ? "/quotations" : `/quotations/${draft.id}`,
        body,
      );
      if (isPending(r)) {
        setOutcome(r.message);
        return;
      }
      /* The row comes back with the server's totals; the full document (amounts, moves, history) is
         re-read so every figure on screen is one the server sent for these values. */
      const savedId = r.quote.id;
      const d = await api.get<QuoteDetailData>(`/quotations/${savedId}`);
      if (!alive.current) return;
      setDetail(d.quote);
      setDraft(draftFromDoc(d.quote));
      setOutcome(`Saved — the server's totals are on the right.`);
      if (id === null) onOpen(savedId);
    } catch (err) {
      if (alive.current) setFailure(failureFrom(err));
    } finally {
      setBusy(false);
    }
  }

  async function move(to: QuoteStatus) {
    if (!detail) return;
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      const r = await api.post<QuoteStatusResult | PendingResult>(`/quotations/${detail.id}/status`, { status: to });
      if (isPending(r)) {
        setOutcome(r.message);
        return;
      }
      const d = await api.get<QuoteDetailData>(`/quotations/${detail.id}`);
      if (!alive.current) return;
      setDetail(d.quote);
      setDraft(draftFromDoc(d.quote));
      setOutcome(`Status: ${STATUS_LABEL[detail.status]} → ${STATUS_LABEL[to]}.`);
    } catch (err) {
      if (alive.current) setFailure(failureFrom(err));
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    if (!detail) return;
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      const r = await api.post<QuoteSaveResult | PendingResult>(`/quotations/${detail.id}/revise`, {});
      if (isPending(r)) {
        setOutcome(r.message);
        return;
      }
      /* The revision is its own document: open it. The original is untouched — that is the point. */
      setOutcome(`Revised as ${r.quote.label} — the original stays as it was.`);
      onOpen(r.quote.id);
    } catch (err) {
      if (alive.current) setFailure(failureFrom(err));
    } finally {
      setBusy(false);
    }
  }

  async function toInvoice() {
    if (!detail) return;
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      const r = await api.post<QuoteInvoiceResult | PendingResult>(`/quotations/${detail.id}/invoice`, {});
      if (isPending(r)) {
        setOutcome(r.message);
        return;
      }
      const d = await api.get<QuoteDetailData>(`/quotations/${detail.id}`);
      if (!alive.current) return;
      setDetail(d.quote);
      setOutcome(`Invoice ${r.invoice.no} created${r.project_id ? ", and the project is open" : ""}.`);
    } catch (err) {
      /* The idempotency rule's second half: a repeat conversion is refused by name, not billed twice. */
      if (err instanceof ApiFailure && err.status === 409) {
        setOutcome(err.message);
        try {
          const d = await api.get<QuoteDetailData>(`/quotations/${detail.id}`);
          if (alive.current) setDetail(d.quote);
        } catch {
          /* the note already says what happened */
        }
      } else if (alive.current) {
        setFailure(failureFrom(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (id !== null && !detail && !failure) {
    return (
      <Card>
        <h2 className="cell-main">Loading…</h2>
        <p className="cell-sub">Reading quotation #{id} from the server.</p>
      </Card>
    );
  }

  const tabs: { id: Panel; label: string }[] = [
    { id: "edit", label: "Edit" },
    { id: "preview", label: "Preview" },
    { id: "history", label: "History" },
  ];

  return (
    <>
      <PageHead
        title={detail ? detail.label : "New quotation"}
        sub={
          detail
            ? `${STATUS_LABEL[detail.status] ?? detail.status} · version ${detail.version} · created by ${detail.created_by || "the studio"}`
            : seed?.from
              ? `From the template “${seed.from.name}” — nothing is saved yet`
              : "A new document — nothing is saved yet"
        }
        actions={
          <>
            <Btn icon={<ArrowLeft size={15} />} onClick={onBack}>
              All quotations
            </Btn>
            {detail ? (
              <Btn icon={<Save size={15} />} variant="primary" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </Btn>
            ) : (
              <Btn icon={<Save size={15} />} variant="primary" disabled={busy || pickTemplate} onClick={() => void save()}>
                {busy ? "Saving…" : "Save this draft"}
              </Btn>
            )}
          </>
        }
      />

      {failure ? (
        <Note tone={failure.kind === "permission" ? "warn" : "danger"} title={
          failure.kind === "permission"
            ? "Your role cannot make this change"
            : failure.kind === "validation"
              ? "The server would not accept this document"
              : "The request failed"
        }>
          {failure.message}
          {failure.field ? <span className="mono"> · field: {failure.field}</span> : null}
          {failure.kind === "permission" ? " A Manager's change waits for the Master — the approval queue is under Approvals." : null}
        </Note>
      ) : null}
      {outcome ? <Note tone="ok" title="Done">{outcome}</Note> : null}

      {pickTemplate && tpls ? (
        <Card>
          <h2 className="cell-main">Start from a template</h2>
          <p className="cell-sub">A template is a shape — sections and terms. The client and the money belong to the quotation.</p>
          {tpls.templates.length === 0 ? (
            <>
              <Empty title="No templates saved yet" sub="The starter set can be imported from the Templates screen." />
              <div className="row">
                <Btn onClick={() => setPickTemplate(false)}>Start from an empty document</Btn>
                <Link to="/templates">Go to Templates</Link>
              </div>
            </>
          ) : (
            <div className="grid-2">
              {tpls.templates.map((t) => (
                <Card key={t.id ?? t.name}>
                  <div className="row-between">
                    <span className="cell-main">{t.name}</span>
                    <Pill tone="neutral">{t.pricedCount} priced line{t.pricedCount === 1 ? "" : "s"}</Pill>
                  </div>
                  <p className="cell-sub">{t.description || t.kindLabel}</p>
                  <Btn
                    variant="primary"
                    onClick={() => {
                      setDraft(blankDraft({ from: t }));
                      setPickTemplate(false);
                    }}
                  >
                    Use this shape
                  </Btn>
                </Card>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {!pickTemplate && draft ? (
        <div className="content-split">
          <div className="stack">
            <Card>
              <div className="row">
                <Seg value={panel} onChange={(v) => setPanel(v as Panel)} options={tabs} />
                {detail ? <a className="btn" href={detail.viewUrl} target="_blank" rel="noreferrer">Client view <Eye size={13} /></a> : null}
              </div>

              {panel === "edit" ? (
                <div className="stack">
                  <div className="grid-2">
                    <label className="stack">
                      <span className="field-label">Client name</span>
                      <input className="input" value={draft.client.name} onChange={(e) => set({ client: { ...draft.client, name: e.target.value } })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Company</span>
                      <input className="input" value={draft.client.company} onChange={(e) => set({ client: { ...draft.client, company: e.target.value } })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Phone</span>
                      <input className="input" value={draft.client.phone} onChange={(e) => set({ client: { ...draft.client, phone: e.target.value } })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Email</span>
                      <input className="input" value={draft.client.email} onChange={(e) => set({ client: { ...draft.client, email: e.target.value } })} />
                    </label>
                  </div>
                  <label className="stack">
                    <span className="field-label">Client address</span>
                    <input className="input" value={draft.client.address} onChange={(e) => set({ client: { ...draft.client, address: e.target.value } })} />
                  </label>
                  <div className="grid-2">
                    <label className="stack">
                      <span className="field-label">Project</span>
                      <input className="input" value={draft.project} onChange={(e) => set({ project: e.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Site</span>
                      <input className="input" value={draft.site} onChange={(e) => set({ site: e.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Issue date</span>
                      <input className="input" type="date" value={draft.issue_date} onChange={(e) => set({ issue_date: e.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Valid until</span>
                      <input className="input" type="date" value={draft.valid_until} onChange={(e) => set({ valid_until: e.target.value })} />
                    </label>
                  </div>

                  <SectionsEditor
                    sections={draft.sections}
                    units={units}
                    itemKinds={itemKinds}
                    serverSections={detail?.sections ?? null}
                    onChange={(sections) => set({ sections })}
                  />

                  <div className="grid-2">
                    <label className="stack">
                      <span className="field-label">Discount (PKR, whole rupees)</span>
                      <input className="input" inputMode="numeric" value={draft.discount} onChange={(e) => set({ discount: e.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Tax % (0–50, the snapshot is kept on the document)</span>
                      <input className="input" inputMode="decimal" value={draft.taxPct} onChange={(e) => set({ taxPct: e.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Site rent (PKR)</span>
                      <input className="input" inputMode="numeric" value={draft.rent} onChange={(e) => set({ rent: e.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="field-label">Advance (PKR)</span>
                      <input className="input" inputMode="numeric" value={draft.advance} onChange={(e) => set({ advance: e.target.value })} />
                    </label>
                  </div>
                  <label className="stack">
                    <span className="field-label">Terms</span>
                    <textarea className="input" rows={4} value={draft.terms} onChange={(e) => set({ terms: e.target.value })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Notes on the document</span>
                    <textarea className="input" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
                  </label>
                </div>
              ) : panel === "preview" ? (
                detail ? (
                  <DocPreview
                    title="Quotation"
                    no={detail.no}
                    date={detail.issue_date}
                    validUntil={detail.valid_until}
                    client={{ name: detail.client?.name || "—", company: detail.client?.company, address: detail.client?.address }}
                    project={detail.project}
                    site={detail.site}
                    sections={detail.sections}
                    subtotal={detail.subtotal}
                    discount={detail.discount}
                    taxPct={detail.taxPct}
                    tax={detail.tax}
                    total={detail.total}
                    terms={detail.terms}
                    company={detail.company}
                  />
                ) : (
                  <Note tone="info" title="The preview is the server's document">
                    Save once — every figure the preview prints is one the server computed for these values.
                  </Note>
                )
              ) : (
                <>
                  {detail && detail.history?.length ? (
                    <ul className="stack-tight">
                      {[...detail.history].reverse().map((h, i) => (
                        <li key={`${h.t}-${i}`} className="cell-sub">
                          <span className="mono">{h.t}</span> · {h.user || "someone"} — {h.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="No history yet" sub="Every save and every move is recorded here." />
                  )}
                </>
              )}
            </Card>
          </div>

          <div className="stack">
            {/* The money panel: the server's figures, and only ever the server's. */}
            <Card title="Totals" sub="Computed by the server in whole rupees — this screen never re-adds">
              {detail ? (
                <>
                  <div className="row-between"><span className="cell-sub">Subtotal</span><span className="mono">{money(detail.subtotal)}</span></div>
                  <div className="row-between"><span className="cell-sub">Discount</span><span className="mono">−{money(detail.discount)}</span></div>
                  <div className="row-between"><span className="cell-sub">Rent</span><span className="mono">{money(detail.rent)}</span></div>
                  <div className="row-between"><span className="cell-sub">Tax {detail.taxPct}%</span><span className="mono">{money(detail.tax)}</span></div>
                  <div className="row-between">
                    <span className="cell-main">Total</span>
                    <span className="cell-main mono">{detail.label ? money(detail.total) : ""}</span>
                  </div>
                </>
              ) : (
                <p className="cell-sub">
                  No totals yet. Nothing is calculated in the browser — save the document and the server's
                  figures appear here and on every line.
                </p>
              )}
            </Card>

            {detail ? (
              <Card title="Status" sub="The moves are the server's, for this document">
                <div className="chip-row">
                  <Pill tone={statusToneFor(detail.status)}>{STATUS_LABEL[detail.status] ?? detail.status}</Pill>
                  {detail.invoiced_id ? <Pill tone="accent">invoice #{detail.invoiced_id}</Pill> : null}
                </div>
                <div className="stack-tight">
                  {detail.moves.includes("invoiced") ? (
                    <Btn icon={<FileText size={15} />} variant="primary" disabled={busy} onClick={() => void toInvoice()}>
                      {busy ? "Working…" : "Convert to invoice"}
                    </Btn>
                  ) : null}
                  {detail.moves
                    .filter((m) => m !== "invoiced")
                    .map((m) => (
                      <Btn
                        key={m}
                        icon={m === "approved" ? <Check size={15} /> : m === "sent" ? <Send size={15} /> : m === "draft" ? <Undo2 size={15} /> : <ScrollText size={15} />}
                        disabled={busy}
                        onClick={() => void move(m)}
                      >
                        {m === "approved" ? "Approve" : m === "sent" ? "Mark sent" : m === "viewed" ? "Mark viewed" : m === "rejected" ? "Reject" : "Back to draft"}
                      </Btn>
                    ))}
                  {detail.status !== "invoiced" ? (
                    <Btn icon={<Layers size={15} />} disabled={busy} onClick={() => void revise()}>
                      Revise as a new version
                    </Btn>
                  ) : null}
                  {detail.moves.length === 0 && detail.status === "invoiced" ? (
                    <p className="cell-sub">
                      Invoiced — the document has reached the end of the flow. Corrections happen on the
                      invoice, or through a revision of the quotation before it is sent again.
                    </p>
                  ) : null}
                </div>
              </Card>
            ) : null}

            <Card title="Where this stands">
              <p className="cell-sub">
                A Manager's change waits for the Master when the approval policy says so — the queue is on{" "}
                <Link to="/approvals">Approvals</Link>. The audit trail records every step, and the History
                tab shows this document's own.
              </p>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ the line editor */

export function SectionsEditor({
  sections,
  units,
  itemKinds,
  serverSections,
  onChange,
}: {
  sections: QuoteSection[];
  units: string[];
  itemKinds: string[];
  serverSections: QuoteSection[] | null;
  onChange: (sections: QuoteSection[]) => void;
}) {
  /* A line's amount is printed only when the server sent it for *these* values: anything typed since the
     last save shows "—" rather than a number the screen worked out for itself. */
  const amountFor = (si: number, ii: number, it: QuoteItem): string => {
    const server = serverSections?.[si]?.items?.[ii];
    if (!server) return "—";
    const same = server.desc === it.desc && server.qty === it.qty && server.rate === it.rate && (server.kind ?? "") === (it.kind ?? "");
    return same ? Math.round(server.amount).toLocaleString("en-US") : "—";
  };

  const setItem = (si: number, ii: number, patch: Partial<QuoteItem>) => {
    const next = sections.map((s, i) =>
      i !== si ? s : { ...s, items: s.items.map((it, j) => (j !== ii ? it : { ...it, ...patch })) },
    );
    onChange(next);
  };

  return (
    <div className="stack">
      <div className="row-between">
        <span className="field-label">Sections and lines</span>
        <Btn
          icon={<Plus size={14} />}
          onClick={() => onChange([...sections, { name: `Section ${sections.length + 1}`, note: "", area: 0, items: [] }])}
        >
          Add section
        </Btn>
      </div>
      <p className="cell-sub">
        Amounts are the server's. A line you have changed shows “—” until the next save returns the computed
        figure.
      </p>
      {sections.length === 0 ? (
        <p className="cell-sub">No sections yet — add one, or start from a template.</p>
      ) : null}
      {sections.map((s, si) => (
        <Card key={si}>
          <div className="grid-2">
            <label className="stack">
              <span className="field-label">Section name</span>
              <input className="input" value={s.name} onChange={(e) => onChange(sections.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)))} />
            </label>
            <label className="stack">
              <span className="field-label">Note</span>
              <input className="input" value={s.note ?? ""} onChange={(e) => onChange(sections.map((x, i) => (i === si ? { ...x, note: e.target.value } : x)))} />
            </label>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Rate</th>
                  <th>Amount (server)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, ii) => (
                  <tr key={ii}>
                    <td>
                      <select className="input" value={it.kind ?? ""} onChange={(e) => setItem(si, ii, { kind: e.target.value })}>
                        {itemKinds.map((k) => (
                          <option key={k} value={k}>
                            {k === "" ? "line" : k === "head" ? "heading" : "spec"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" style={{ width: 70 }} value={it.code ?? ""} onChange={(e) => setItem(si, ii, { code: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={it.desc} onChange={(e) => setItem(si, ii, { desc: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" style={{ width: 70 }} inputMode="decimal" value={String(it.qty)} onChange={(e) => setItem(si, ii, { qty: Number(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <select className="input" value={it.unit} onChange={(e) => setItem(si, ii, { unit: e.target.value })}>
                        {units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" style={{ width: 90 }} inputMode="decimal" value={String(it.rate)} onChange={(e) => setItem(si, ii, { rate: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="mono">{amountFor(si, ii, it)}</td>
                    <td>
                      <Btn
                        icon={<X size={13} />}
                        iconOnly
                        aria-label="Remove line"
                        title="Remove line"
                        onClick={() => onChange(sections.map((x, i) => (i === si ? { ...x, items: x.items.filter((_, j) => j !== ii) } : x)))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <Btn
              icon={<Plus size={14} />}
              onClick={() =>
                onChange(
                  sections.map((x, i) =>
                    i === si ? { ...x, items: [...x.items, { desc: "", qty: 1, unit: "job", rate: 0, amount: 0, kind: "", code: "" }] } : x,
                  ),
                )
              }
            >
              Add line
            </Btn>
            <Btn
              icon={<X size={14} />}
              onClick={() => onChange(sections.filter((_, i) => i !== si))}
            >
              Remove section
            </Btn>
          </div>
        </Card>
      ))}
    </div>
  );
}
