/**
 * LiveEstimator — the rate book the public estimator page and the quotation builder both read.
 *
 * The figures are not in a table on purpose, and that is v2.1's decision kept: they are written out as
 * JavaScript (`assets/js/estimator-rates.js`, `window.WX_RATES`) so `/estimator/` can price a job with no
 * request at all — which is why the calculator still works on a phone with one bar of signal. This screen is
 * the only thing that writes that file.
 *
 * Three things this screen does that v2.1's did not:
 *
 *   · **It says what the figures are read by.** The pages that load the file are listed, so "saved" is
 *     followed by "and these pages are now on v2610141530" — not left to be discovered on the website.
 *   · **One save, one undo.** v2.1 rewrote each reader page with a file write of its own, outside the page
 *     history. Here the readers are found first and rewritten as one batch, so the whole reload is one entry
 *     on the Pages screen with one Roll back — offered right here when it happens.
 *   · **A zero rate is refused by name.** It is the one typo that quietly drops a service out of every quote
 *     built from this book, and it used to be accepted silently.
 *
 * The saved sets ("the figures we quoted from in March") are v2.1's P19 templates, kept: a copy of the whole
 * book, so going back is a click rather than a database restore.
 */
import { useEffect, useMemo, useState } from "react";
import { Coins, Plus, RefreshCw, Save, Trash2, Undo2 } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type EstCatalog, type EstData, type EstRates, type EstSaveResult, type EstService, type EstTemplateResult,
  type PendingResult, type RollbackResult,
} from "../lib/live";

const UNITS: [string, string][] = [["sqft", "Per sq ft"], ["views", "Per view"]];

/** One service while it is being edited. The three rates are strings so a half-typed number is not a zero. */
interface SvcDraft extends Record<string, unknown> {
  key: string; label: string; hint: string; unit: string;
  essential: string; standard: string; premium: string;
}

interface CatDraft extends Record<string, unknown> {
  cat: string; desc: string; unit: string; rate: string;
}

function money(n: number | string): string {
  const v = typeof n === "string" ? Number(n.replace(/[^\d.-]/g, "")) : n;
  return Number.isFinite(v) ? new Intl.NumberFormat("en-PK").format(Math.round(v)) : "";
}

export function LiveEstimator() {
  const { link, reason } = useSession();
  const live = useLive<EstData>("/estimator");

  if (link !== "live") {
    return (
      <>
        <PageHead title="Estimator" sub="The figures every price starts from." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading your site">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. The rate book is a file on your server, and this screen will not show a guess at what is in it.`
            : "Sign in to see and change the figures the estimator and the quotation builder use."}
        </Note>
      </>
    );
  }
  if (live.loading) {
    return (
      <Card>
        <h2 className="cell-main">Loading…</h2>
        <p className="cell-sub">Reading the rate book.</p>
      </Card>
    );
  }
  if (!live.data) {
    return (
      <Note tone="danger" title="The rate book could not be read">
        {live.error?.message ?? "The server did not answer."}
      </Note>
    );
  }
  return <EstBody live={live} />;
}

function EstBody({ live }: { live: ReturnType<typeof useLive<EstData>> }) {
  const data = live.data!;
  const rates = data.rates;
  const [services, setServices] = useState<SvcDraft[]>([]);
  const [finishes, setFinishes] = useState<{ key: string; label: string; hint: string }[]>([]);
  const [catalog, setCatalog] = useState<CatDraft[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const [setName, setSetName] = useState("");

  const load = useMemo(
    () => (r: EstRates | null) => {
      setServices((r?.services ?? []).map((s: EstService) => ({
        key: s.key, label: s.label, hint: s.hint, unit: s.unit,
        essential: String(s.rates?.essential ?? 0),
        standard: String(s.rates?.standard ?? 0),
        premium: String(s.rates?.premium ?? 0),
      })));
      setFinishes((r?.finishes ?? []).map((f) => ({ ...f })));
      setCatalog((r?.catalog ?? []).map((c: EstCatalog) => ({ cat: c.cat, desc: c.desc, unit: c.unit, rate: String(c.rate) })));
      setTerms((r?.terms ?? []).slice());
    },
    [],
  );

  useEffect(() => {
    load(rates);
    setNote(null);
    setBad(null);
    setBatch(null);
  }, [rates, load]);

  /** What the screen will send: the drafts as the shape the server checks. */
  function payload(): EstRates {
    return {
      services: services.map((s) => ({
        key: s.key, label: s.label, hint: s.hint, unit: s.unit,
        unitLabel: UNITS.find(([u]) => u === s.unit)?.[1] ?? "",
        rates: { essential: Number(s.essential) || 0, standard: Number(s.standard) || 0, premium: Number(s.premium) || 0 },
      })),
      finishes,
      catalog: catalog.map((c) => ({ cat: c.cat, desc: c.desc, unit: c.unit || "job", rate: Number(c.rate) || 0 })),
      terms,
    } as EstRates;
  }

  const totalLines = services.length + catalog.length;

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      return await fn();
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const r = await run(() => api.post<EstSaveResult | PendingResult>("/estimator", { rates: payload() }));
    if (!r) return;
    if (isPending(r)) setNote(r.message);
    else if ("changed" in r) {
      if (r.changed) {
        setBatch(r.batch);
        setNote(`Saved. ${r.changed} page(s) now read the rate book as v${r.version} — one change (batch ${r.batch.slice(0, 8)}), so Roll back puts every page back.`);
      } else {
        setNote("Saved. The pages reading the rate book were already on this version, so nothing on the site was rewritten.");
      }
      live.reload();
    }
  }

  async function rollback() {
    if (!batch) return;
    const r = await run(() => api.post<RollbackResult>("/pages/rollback", { batch }));
    if (r && "restored" in r) {
      setNote(`Rolled back ${r.restored.length} page(s). The rate book file itself is not a page — the previous figures are copied to _private/backups on every save.`);
      setBatch(null);
      live.reload();
    }
  }

  async function keepSet() {
    const name = setName.trim();
    if (!name) {
      setBad(new ApiFailure({ code: "VALIDATION", message: "Give this set of figures a name first." }, 0, "client"));
      return;
    }
    const r = await run(() => api.post<EstTemplateResult | PendingResult>("/estimator/templates", { name, rates: payload() }));
    if (!r) return;
    if (isPending(r)) setNote(r.message);
    else {
      setNote(`Kept these figures as “${name}”.`);
      setSetName("");
      live.reload();
    }
  }

  async function dropSet(name: string) {
    const r = await run(() => api.post<EstTemplateResult | PendingResult>("/estimator/templates", { name, delete: true }));
    if (!r) return;
    if (isPending(r)) setNote(r.message);
    else {
      setNote(`Deleted “${name}”.`);
      live.reload();
    }
  }

  return (
    <>
      <PageHead
        title="Estimator"
        sub="The figures every price starts from."
        actions={
          <Btn icon={<RefreshCw size={15} />} onClick={live.reload}>
            Re-read the file
          </Btn>
        }
      />

      <Note tone={data.exists ? "info" : "warn"} title={data.exists ? `${data.rel} · ${(data.bytes / 1024).toFixed(1)} KB` : "There is no rate book file yet"}>
        {data.exists ? (
          <>
            Last written {data.mtime} (UTC). Read by {data.pages.length ? data.pages.join(", ") : "no page"} — the public
            estimator prices a job from this file with no request, so a save here reloads those pages as one change.
          </>
        ) : (
          "The estimator page reads window.WX_RATES from a file that is not on this server yet. Saving below writes it."
        )}
      </Note>

      <Card>
        <h2 className="cell-main">Services and rates</h2>
        <p className="cell-sub">
          In rupees, whole numbers. Essential ≤ Standard ≤ Premium, and none may be zero — a zero rate is how a
          service quietly drops out of every quote built from this book.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Service</th>
                <th>Priced by</th>
                <th className="num">Essential</th>
                <th className="num">Standard</th>
                <th className="num">Premium</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input className="input" value={s.label} placeholder="Interior Design" onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <input className="input" value={s.hint} placeholder="Concept, drawings and material palette" onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)))} />
                  </td>
                  <td>
                    <select className="select" value={s.unit} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}>
                      {UNITS.map(([u, label]) => (
                        <option key={u} value={u}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(["essential", "standard", "premium"] as const).map((k) => (
                    <td className="num" key={k}>
                      <input
                        className="input mono num"
                        inputMode="numeric"
                        value={s[k]}
                        onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, [k]: e.target.value.replace(/[^\d]/g, "") } : x)))}
                      />
                      <span className="cell-sub">{money(s[k])}</span>
                    </td>
                  ))}
                  <td className="right">
                    <Btn iconOnly icon={<Trash2 size={15} />} aria-label={`Remove ${s.label || "service"}`} onClick={() => setServices(services.filter((_, j) => j !== i))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <Btn
            icon={<Plus size={15} />}
            onClick={() => setServices([...services, { key: "", label: "", hint: "", unit: "sqft", essential: "", standard: "", premium: "" }])}
          >
            Add a service
          </Btn>
          <span className="cell-sub">{totalLines} line(s) on this rate book.</span>
        </div>
      </Card>

      <Card>
        <h2 className="cell-main">Finish levels</h2>
        <p className="cell-sub">The three names a quote prints. The multiplier stays in the services above — what changes here is what the client reads.</p>
        {finishes.map((f, i) => (
          <div className="grid-2" key={f.key}>
            <label className="stack">
              <span className="field-label">{f.key}</span>
              <input className="input" value={f.label} onChange={(e) => setFinishes(finishes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            </label>
            <label className="stack">
              <span className="field-label">One-line description</span>
              <input className="input" value={f.hint} onChange={(e) => setFinishes(finishes.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)))} />
            </label>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="cell-main">Itemised catalog</h2>
        <p className="cell-sub">Optional lines the quotation builder can add by description. A line with no description cannot be priced from, so it is dropped on save.</p>
        {catalog.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Unit</th>
                  <th className="num">Rate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {catalog.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <input className="input" value={c.cat} placeholder="Civil" onChange={(e) => setCatalog(catalog.map((x, j) => (j === i ? { ...x, cat: e.target.value } : x)))} />
                    </td>
                    <td>
                      <input className="input" value={c.desc} placeholder="Wall demolition" onChange={(e) => setCatalog(catalog.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
                    </td>
                    <td>
                      <input className="input" value={c.unit} placeholder="job" onChange={(e) => setCatalog(catalog.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                    </td>
                    <td className="num">
                      <input className="input mono num" inputMode="numeric" value={c.rate} onChange={(e) => setCatalog(catalog.map((x, j) => (j === i ? { ...x, rate: e.target.value.replace(/[^\d]/g, "") } : x)))} />
                      <span className="cell-sub">{money(c.rate)}</span>
                    </td>
                    <td className="right">
                      <Btn iconOnly icon={<Trash2 size={15} />} aria-label="Remove line" onClick={() => setCatalog(catalog.filter((_, j) => j !== i))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No catalog lines yet" sub="Add one only if the quotation builder should offer it by description." />
        )}
        <div className="row">
          <Btn icon={<Plus size={15} />} onClick={() => setCatalog([...catalog, { cat: "", desc: "", unit: "job", rate: "" }])}>
            Add a line
          </Btn>
        </div>
      </Card>

      <Card>
        <h2 className="cell-main">Terms printed with a quote</h2>
        <p className="cell-sub">These travel with the figures, so they are edited in the same place and saved with them.</p>
        {terms.map((t, i) => (
          <div className="row" key={i}>
            <input className="input" value={t} onChange={(e) => setTerms(terms.map((x, j) => (j === i ? e.target.value : x)))} />
            <Btn iconOnly icon={<Trash2 size={15} />} aria-label="Remove term" onClick={() => setTerms(terms.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="row">
          <Btn icon={<Plus size={15} />} onClick={() => setTerms([...terms, ""])}>
            Add a term
          </Btn>
        </div>
      </Card>

      {bad ? (
        <Note tone="danger" title="Not saved">
          {bad.message} {bad.field ? <span className="mono">{bad.field}</span> : null}
        </Note>
      ) : null}
      {note ? <Note tone="ok">{note}</Note> : null}

      <Card>
        <div className="row">
          <Btn variant="primary" icon={<Save size={15} />} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save the rate book"}
          </Btn>
          {batch ? (
            <Btn icon={<Undo2 size={15} />} onClick={rollback} disabled={busy}>
              Roll back the page reload
            </Btn>
          ) : null}
          <span className="cell-sub">
            Saving reloads {data.pages.length} page(s) as one change; the previous figures are copied to the site's
            backup folder first.
          </span>
        </div>
      </Card>

      <Card>
        <h2 className="cell-main">Saved sets</h2>
        <p className="cell-sub">
          A copy of the whole rate book under a name — “the figures we quoted from in March”. Keeping one is how a
          change here is undone without a database restore.
        </p>
        {data.templates?.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kept</th>
                  <th>By</th>
                  <th className="num">Services</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.templates.map((t) => (
                  <tr key={t.name}>
                    <td className="cell-main">
                      <Coins size={14} /> {t.name}
                    </td>
                    <td>{t.at}</td>
                    <td>{t.by}</td>
                    <td className="num">{t.rates?.services?.length ?? 0}</td>
                    <td className="right nowrap">
                      <Btn
                        onClick={() => {
                          load(t.rates ?? null);
                          setNote(`Loaded “${t.name}” into the editor. Nothing is saved until you save it.`);
                        }}
                      >
                        Load into the editor
                      </Btn>{" "}
                      <Btn iconOnly icon={<Trash2 size={15} />} aria-label={`Delete ${t.name}`} onClick={() => dropSet(t.name)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No saved sets" sub="Keep the figures you are about to change, so going back is a click." />
        )}
        <div className="row">
          <input className="input" value={setName} placeholder="March 2026 — office fit-out rates" onChange={(e) => setSetName(e.target.value)} />
          <Btn onClick={keepSet} disabled={busy}>
            Keep these figures
          </Btn>
          {data.templates?.length ? <Pill tone="neutral">{data.templates.length} of 20</Pill> : null}
        </div>
      </Card>
    </>
  );
}
