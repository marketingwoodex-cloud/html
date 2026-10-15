/**
 * LiveProjects — every project, what it has billed, and the drawer that runs it.
 *
 * v2.1's screen read **every project into PHP on every view** (the plan's 1.4-second table) and then
 * filtered them in the browser, because the filtering it wanted could not be expressed in its query. That is
 * why the numbers at the top of this screen and the rows underneath them are read differently:
 *
 *   · the six figures come from the server as aggregates over **every** project — a "contract value"
 *     computed from the fifty rows a screen happens to be holding is a lie the moment there are fifty-one;
 *   · the rows are one page of a filtered, searched query, and the screen says how many there are in total
 *     when the page is not all of them.
 *
 * Two progress numbers, because a project has two answers to "how far along is it?": where it stands in the
 * studio's stages, and how much of the contract has been billed. v2.1 had one field and printed it as both.
 *
 * The drawer is where work happens: move the stage, edit the milestone plan (percentages that must add up),
 * bill a milestone — each one a real invoice in the same series v2.1 used, `WI-10120-2` — record a progress
 * update, or write the details. Nothing here invents an invoice; `POST /projects/{id}/bill` does, once.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, FileText, Plus, RefreshCw, Save, Search, Trash2, Wallet } from "lucide-react";
import { Bar, Btn, Card, Empty, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive, type PendingResult, type ProjDetail, type ProjKpi, type ProjList, type ProjRow,
} from "../lib/live";

type View = "active" | "late" | "due" | "closed" | "all";

/** The three plans a studio quotes from most often. v2.1 offered these three as buttons. */
const PRESETS: [string, [string, number][]][] = [
  ["50/50", [["Advance", 50], ["On handover", 50]]],
  ["50/30/20", [["Advance with work order", 50], ["On completion of wood work", 30], ["On handover", 20]]],
  ["40/30/20/10", [["Advance", 40], ["Civil & ceiling done", 30], ["Wood work done", 20], ["Handover", 10]]],
];

const MS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  paid: "ok", partial: "warn", billed: "warn", missing: "danger", unbilled: "neutral",
};
const MS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Part paid", billed: "Billed, unpaid", missing: "Invoice deleted", unbilled: "Not billed",
};

export function LiveProjects() {
  const { link, reason } = useSession();
  if (link !== "live") {
    return (
      <>
        <PageHead title="Projects" sub="Live projects, their stages and their money." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading your site">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. Projects live in your database, so this screen shows nothing until it can be read — a project list invented in the browser would be worse than an empty one.`
            : "Sign in to see live projects, their milestones and their invoicing."}
        </Note>
      </>
    );
  }
  return <ProjectsBody />;
}

export function ProjectsBody() {
  const [view, setView] = useState<View>("active");
  const [stage, setStage] = useState("");
  const [line, setLine] = useState("");
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [params, setParams] = useSearchParams();

  /* A search that fires on every keystroke would ask the server for a list per letter; the box waits for a
     pause, which is also what makes the "searching…" state mean something. */
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  /* `/projects?p=12` opens that project — which is how the timeline hands a row over to this screen. */
  useEffect(() => {
    const p = params.get("p");
    if (p && /^\d+$/.test(p)) setOpen(Number(p));
  }, [params]);

  const path = useMemo(() => {
    const s = new URLSearchParams({ view, limit: "100" });
    if (stage) s.set("stage", stage);
    if (line) s.set("line", line);
    if (q) s.set("q", q);
    return `/projects?${s.toString()}`;
  }, [view, stage, line, q]);

  const live = useLive<ProjList>(path);
  const data = live.data;

  const close = useCallback(() => {
    setOpen(null);
    if (params.has("p")) {
      const next = new URLSearchParams(params);
      next.delete("p");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  return (
    <>
      <PageHead
        title="Projects"
        sub="Every project, its stage and its money — one page of a filtered query, over totals read from all of them."
        actions={
          <>
            {/* A router link, so it stays inside whatever path the console is mounted at. An `<a href>`
                here reloads the page and asks the host for `/timeline` at the domain root — a screen the
                console owns, requested from a server that has never heard of it. */}
            <Link className="btn" to="/timeline">
              <CalendarClock size={15} /> Timeline
            </Link>
            <Btn icon={<RefreshCw size={15} />} onClick={live.reload}>
              Refresh
            </Btn>
          </>
        }
      />

      {data ? <KpiRow kpi={data.kpi} /> : null}

      <div className="toolbar">
        <Seg
          options={[
            { id: "active", label: "Active" },
            { id: "late", label: "Late" },
            { id: "due", label: "Balance due" },
            { id: "closed", label: "Closed" },
            { id: "all", label: "All" },
          ]}
          value={view}
          onChange={(v) => {
            setView(v as View);
            setStage("");
          }}
        />
        <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Every stage</option>
          {Object.entries(data?.stageLabels ?? {}).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select className="select" value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">All lines</option>
          {Object.entries(data?.lines ?? {}).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <div className="grow" />
        <Search size={15} className="muted" />
        <input
          className="input"
          placeholder="Name, number, client or site…"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>

      {live.error ? (
        <Note tone="danger" title="The projects could not be read">
          {live.error.message} <span className="mono">{live.error.detail}</span>
        </Note>
      ) : null}

      <Card>
        {live.loading && !data ? (
          <div className="muted" style={{ padding: 18 }}>
            Reading the projects…
          </div>
        ) : !data?.projects.length ? (
          <Empty
            title="Nothing matches this filter"
            sub="A project opens automatically when a quotation is approved and invoiced — there is no “New project” here because a project with no contract behind it is not work."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Stage</th>
                    <th>Handover</th>
                    <th className="num">Contract</th>
                    <th className="num">Invoiced</th>
                    <th className="num">Received</th>
                    <th className="num">Balance</th>
                    <th>Team</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => (
                    <tr key={p.id} className={p.late ? "is-late" : ""} onClick={() => setOpen(p.id)}>
                      <td className="cell-main">
                        <b>{p.name}</b>
                        <span className="cell-sub">
                          {p.client_name || "No client"}
                          {p.no ? ` · ${p.no}` : ""}
                          {p.site ? ` · ${p.site}` : ""}
                        </span>
                      </td>
                      <td>
                        <div className="row">
                          <Pill tone={p.stage === "closed" ? "ok" : p.stage === "handover" ? "accent" : "info"}>
                            {data.stageLabels[p.stage] ?? p.stage}
                          </Pill>
                          <span className="mono cell-sub">{p.milestonesDone}/{p.milestoneCount} billed</span>
                        </div>
                        <Bar value={p.stageProgress} max={100} />
                      </td>
                      <td className="nowrap">
                        {p.target ? (
                          <span className={p.late ? "cell-danger" : ""}>
                            {p.late ? <AlertTriangle size={13} /> : null} {p.target}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="num nowrap">{p.valueDisplay}</td>
                      <td className="num nowrap">
                        {p.invoiced ? p.invoicedDisplay : "—"}
                        <Bar value={p.billedPct} max={100} />
                      </td>
                      <td className="num nowrap">{p.received ? p.receivedDisplay : "—"}</td>
                      <td className={`num nowrap${p.balance ? " cell-danger" : ""}`}>{p.balance ? p.balanceDisplay : "—"}</td>
                      <td>{p.team_names.length ? p.team_names.join(", ") : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > data.projects.length ? (
              <Note tone="info" title={`Showing ${data.projects.length} of ${data.total} projects`}>
                The table holds the most recent {data.limit}. Narrow the stage, the line or the search to see the
                rest — the six figures above are always every project.
              </Note>
            ) : null}
          </>
        )}
      </Card>

      {open !== null ? <ProjectDrawer id={open} onClose={close} onSaved={live.reload} /> : null}
    </>
  );
}

function KpiRow({ kpi }: { kpi: ProjKpi }) {
  const cells: [string, string, string?][] = [
    ["Active projects", String(kpi.active)],
    ["Contract value (active)", kpi.valueDisplay],
    ["Invoiced", kpi.invoicedDisplay],
    ["Received", kpi.receivedDisplay, `${kpi.receivedPct}% of what is invoiced`],
    ["Balance due", kpi.balanceDisplay, kpi.balance ? "billed and not yet received" : undefined],
    ["Late handovers", String(kpi.late), kpi.late ? "past their date and unfinished" : undefined],
  ];
  return (
    <div className="kpi-row">
      {cells.map(([label, value, sub]) => (
        <div className={`kpi${label === "Late handovers" && kpi.late ? " bad" : ""}`} key={label}>
          <span className="cell-sub">{label}</span>
          <b className="kpi-value">{value}</b>
          {sub ? <span className="cell-sub">{sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the drawer */

function ProjectDrawer({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const live = useLive<ProjDetail>(`/projects/${id}`);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [plan, setPlan] = useState<{ label: string; pct: number }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [details, setDetails] = useState<ProjDetail["document"] | null>(null);
  const [update, setUpdate] = useState("");
  /* Off by default: what somebody types here is a note on the project until they say the client is to read it. */
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [replaceAsk, setReplaceAsk] = useState<{ k: number; message: string } | null>(null);

  const data = live.data;
  const project = data?.project;

  useEffect(() => {
    if (!data) return;
    setPlan((data.document.plan ?? []).map((m) => ({ label: m.label, pct: m.pct })));
    setDetails(data.document);
    setDirty(false);
    setNote(null);
    setBad(null);
    setReplaceAsk(null);
  }, [data]);

  async function run<T>(fn: () => Promise<T>, ok: string): Promise<T | null> {
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      const r = await fn();
      setNote(ok);
      return r;
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function moveStage(stage: string) {
    const r = await run(
      () => api.patch<{ project: ProjRow } | PendingResult>(`/projects/${id}`, { stage }),
      `Stage moved to ${live.data?.stageLabels[stage] ?? stage}.`,
    );
    if (r && isPending(r)) setNote(r.message);
    if (r) {
      live.reload();
      onSaved();
    }
  }

  async function savePlan() {
    const sum = plan.reduce((a, m) => a + (Number(m.pct) || 0), 0);
    if (plan.length && Math.abs(sum - 100) > 0.01) {
      setBad(new ApiFailure({ code: "VALIDATION", message: `The milestones add up to ${sum}%, not 100%. A plan nobody agreed to cannot be billed from.`, field: "plan" }, 0, "client"));
      return;
    }
    const r = await run(
      () => api.patch<{ project: ProjRow } | PendingResult>(`/projects/${id}`, { plan }),
      "The plan is saved. Each milestone now bills its share of the contract.",
    );
    if (r && isPending(r)) setNote(r.message);
    if (r) {
      setDirty(false);
      live.reload();
      onSaved();
    }
  }

  async function saveDetails() {
    if (!details) return;
    const r = await run(
      () =>
        api.patch<{ project: ProjRow } | PendingResult>(`/projects/${id}`, {
          name: details.name,
          site: details.site,
          start: details.start,
          target: details.target,
          value: details.value,
          line: details.line,
          ptype: details.ptype,
          manager: details.manager ?? 0,
          team: details.team,
        }),
      "Saved.",
    );
    if (r && isPending(r)) setNote(r.message);
    if (r) {
      live.reload();
      onSaved();
    }
  }

  async function bill(k: number, replace = false) {
    try {
      setBusy(true);
      setBad(null);
      setNote(null);
      const r = await api.post<{ invoice: { no: string; totalDisplay: string } } | PendingResult>(
        `/projects/${id}/bill`,
        { k, replace },
      );
      if ("invoice" in r) {
        setNote(`Invoice ${r.invoice.no} raised for ${r.invoice.totalDisplay}. It is on Invoice tracking now.`);
        setReplaceAsk(null);
        live.reload();
        onSaved();
      } else {
        setNote(r.message);
      }
    } catch (err) {
      const e = err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client");
      /* The server asks one question in words before replacing a whole-contract invoice — and it refuses if
         that invoice has been paid against. The screen shows the question, with the server's own sentence. */
      if (e.code === "CONFLICT") {
        setReplaceAsk({ k, message: e.message });
        setBad(null);
      } else {
        setBad(e);
      }
    } finally {
      setBusy(false);
    }
  }

  async function addUpdate() {
    const text = update.trim();
    if (!text) {
      setBad(new ApiFailure({ code: "VALIDATION", message: "Write the update first.", field: "text" }, 0, "client"));
      return;
    }
    /* Two different changes, and the answer says which one happened. Sharing an update puts it on the page
       the client opens — that works today, with no transport — while the WhatsApp and e-mail copies are
       recorded and sent by v2.1 until Phase 4, which is what the notifications screen explains in full. */
    const r = await run(
      () => api.post<{ entry: { text: string }; toClient: boolean } | PendingResult>(`/projects/${id}/updates`, { text, sendToClient: share }),
      share ? "Shared — it is on the client's page." : "Recorded on the project.",
    );
    if (r) {
      setUpdate("");
      setShare(false);
      live.reload();
      onSaved();
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Project">
        {live.loading && !data ? (
          <div className="muted" style={{ padding: 18 }}>
            Reading the project…
          </div>
        ) : !project ? (
          <Note tone="danger" title="This project could not be read">
            {live.error?.message ?? "The server did not answer."}
          </Note>
        ) : (
          <>
            <div className="row-between">
              <div>
                <h2 className="cell-main">{project.name}</h2>
                <p className="cell-sub">
                  {project.client_name || "No client"}
                  {project.no ? ` · ${project.no}` : ""}
                  {project.site ? ` · ${project.site}` : ""}
                </p>
              </div>
              <div className="row">
                {project.quote_id ? (
                  <a className="chip" href={`/quotes?q=${project.quote_id}`}>
                    <FileText size={13} /> Quotation
                  </a>
                ) : null}
                <Btn onClick={onClose}>Close</Btn>
              </div>
            </div>

            {project.late ? (
              <Note tone="warn" title="Past its handover date">
                The target was {project.target} and the project is at {data?.stageLabels[project.stage] ?? project.stage}.
              </Note>
            ) : null}
            {bad ? (
              <Note tone="danger" title="That did not work">
                {bad.message} <span className="mono">{bad.detail}</span>
              </Note>
            ) : null}
            {note ? <Note tone="ok">{note}</Note> : null}
            {replaceAsk ? (
              <Note tone="warn" title="This project has one invoice for the whole contract">
                {replaceAsk.message}{" "}
                <div className="row">
                  <Btn variant="primary" disabled={busy} onClick={() => bill(replaceAsk.k, true)}>
                    Replace it with milestone invoices
                  </Btn>
                  <Btn onClick={() => setReplaceAsk(null)}>Leave the invoice alone</Btn>
                </div>
              </Note>
            ) : null}

            <h3 className="side-h">Stage</h3>
            <div className="row">
              {(data?.stages ?? []).map((s) => (
                <Btn
                  key={s}
                  variant={s === project.stage ? "primary" : "default"}
                  disabled={busy || s === project.stage}
                  onClick={() => moveStage(s)}
                >
                  {data?.stageLabels[s] ?? s}
                </Btn>
              ))}
            </div>

            <h3 className="side-h">Money</h3>
            <div className="row">
              {(
                [
                  ["Contract", project.valueDisplay],
                  ["Invoiced", project.invoicedDisplay],
                  ["Received", project.receivedDisplay],
                  ["Balance due", project.balanceDisplay],
                  ["Not billed yet", project.unbilledDisplay],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div className="kpi" key={label}>
                  <span className="cell-sub">{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>

            <h3 className="side-h">Milestone billing</h3>
            <p className="cell-sub">
              Each milestone bills its share of the contract as its own invoice in the project's series
              {project.no ? ` (${project.no}-1, -2 …)` : ""}. A billed milestone cannot be edited — the client
              already has that document.
            </p>
            <div className="row">
              {PRESETS.map(([name, ms]) => (
                <Btn
                  key={name}
                  onClick={() => {
                    setPlan(ms.map(([label, pct]) => ({ label, pct })));
                    setDirty(true);
                  }}
                >
                  {name}
                </Btn>
              ))}
            </div>
            {plan.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Milestone</th>
                      <th className="num">%</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((m, i) => {
                      const billed = project.milestones[i];
                      const locked = Boolean(billed?.inv_id);
                      return (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>
                            <input
                              className="input"
                              value={m.label}
                              disabled={locked}
                              onChange={(e) => {
                                setPlan(plan.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)));
                                setDirty(true);
                              }}
                            />
                          </td>
                          <td className="num">
                            <input
                              className="input mono num"
                              inputMode="numeric"
                              value={String(m.pct)}
                              disabled={locked}
                              onChange={(e) => {
                                setPlan(plan.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)));
                                setDirty(true);
                              }}
                            />
                          </td>
                          <td className="num nowrap">{billed ? billed.amountDisplay : "—"}</td>
                          <td>
                            {billed ? (
                              <Pill tone={MS_TONE[billed.status] ?? "neutral"}>
                                {billed.inv_no ? `${billed.inv_no} · ` : ""}
                                {MS_LABEL[billed.status] ?? billed.status}
                              </Pill>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="right nowrap">
                            {billed?.inv_id ? null : (
                              <Btn
                                disabled={busy || dirty || !project.value}
                                title={dirty ? "Save the plan first" : !project.value ? "Set the contract value first" : "Raise this milestone's invoice"}
                                onClick={() => bill(i)}
                              >
                                <Wallet size={14} /> Raise invoice
                              </Btn>
                            )}
                            <Btn
                              iconOnly
                              icon={<Trash2 size={15} />}
                              aria-label={`Remove milestone ${i + 1}`}
                              disabled={locked}
                              onClick={() => {
                                setPlan(plan.filter((_, j) => j !== i));
                                setDirty(true);
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No milestone plan yet" sub="Pick one of the three plans above, or add the milestones the client agreed to." />
            )}
            <div className="row">
              <Btn icon={<Plus size={15} />} onClick={() => { setPlan([...plan, { label: `Milestone ${plan.length + 1}`, pct: 0 }]); setDirty(true); }}>
                Add a milestone
              </Btn>
              <span className="cell-sub">
                {plan.length} milestone(s) · total{" "}
                <b className={Math.abs(plan.reduce((a, m) => a + (Number(m.pct) || 0), 0) - 100) > 0.01 ? "cell-danger" : ""}>
                  {plan.reduce((a, m) => a + (Number(m.pct) || 0), 0)}%
                </b>
                {dirty ? " · unsaved" : ""}
              </span>
              <div className="grow" />
              <Btn variant="primary" icon={<Save size={15} />} disabled={busy || !dirty} onClick={savePlan}>
                Save the plan
              </Btn>
            </div>

            <h3 className="side-h">Invoices</h3>
            {data?.invoices.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="cell-main">
                          {i.no} <span className="cell-sub">{i.issued}</span>
                        </td>
                        <td className="num nowrap">{i.totalDisplay}</td>
                        <td className="num nowrap">{i.paidDisplay}</td>
                        <td className={`num nowrap${i.balance ? " cell-danger" : ""}`}>{i.balance ? i.balanceDisplay : "Paid"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cell-sub">Nothing has been invoiced on this project yet.</p>
            )}

            <h3 className="side-h">Details</h3>
            {details ? (
              <>
                <div className="grid-2">
                  <label className="stack">
                    <span className="field-label">Project name</span>
                    <input className="input" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Site</span>
                    <input className="input" value={details.site} onChange={(e) => setDetails({ ...details, site: e.target.value })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Contract value (Rs)</span>
                    <input
                      className="input mono"
                      inputMode="numeric"
                      value={String(details.value)}
                      onChange={(e) => setDetails({ ...details, value: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
                    />
                  </label>
                  <label className="stack">
                    <span className="field-label">Covered area (sq ft)</span>
                    <input className="input mono" inputMode="numeric" value={String(details.area)} onChange={(e) => setDetails({ ...details, area: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Start</span>
                    <input className="input" type="date" value={details.start} onChange={(e) => setDetails({ ...details, start: e.target.value })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Handover target</span>
                    <input className="input" type="date" value={details.target} onChange={(e) => setDetails({ ...details, target: e.target.value })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Business line</span>
                    <select className="select" value={details.line} onChange={(e) => setDetails({ ...details, line: e.target.value })}>
                      <option value="">—</option>
                      {Object.entries(data?.lines ?? {}).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack">
                    <span className="field-label">Project type</span>
                    <input className="input" value={details.ptype} onChange={(e) => setDetails({ ...details, ptype: e.target.value })} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Project manager</span>
                    <select
                      className="select"
                      value={details.manager ?? ""}
                      onChange={(e) => setDetails({ ...details, manager: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">—</option>
                      {(data?.team ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="row">
                  <span className="field-label">Team</span>
                  {(data?.team ?? []).map((t) => (
                    <label className="chip" key={t.id}>
                      <input
                        type="checkbox"
                        checked={details.team.includes(t.id)}
                        onChange={(e) =>
                          setDetails({
                            ...details,
                            team: e.target.checked ? [...details.team, t.id] : details.team.filter((x) => x !== t.id),
                          })
                        }
                      />{" "}
                      {t.name}
                    </label>
                  ))}
                </div>
                <div className="row">
                  <Btn variant="primary" icon={<Save size={15} />} disabled={busy} onClick={saveDetails}>
                    Save details
                  </Btn>
                </div>
              </>
            ) : null}

            <h3 className="side-h">The client's page</h3>
            <div className="row">
              <input className="input mono" readOnly value={data?.client?.link ?? ""} onFocus={(e) => e.currentTarget.select()} />
              <Btn
                disabled={!data?.client?.link}
                onClick={() => {
                  navigator.clipboard?.writeText(data?.client?.link ?? "");
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </Btn>
              <Btn disabled={!data?.client?.link} onClick={() => window.open(data?.client?.link, "_blank", "noopener")}>
                Open
              </Btn>
            </div>
            <p className="cell-sub">
              {data?.client?.views
                ? `Opened ${data.client.views} time${data.client.views === 1 ? "" : "s"}${data.client.viewedAt ? ` — last ${data.client.viewedAt}` : ""}.`
                : "Never opened yet."}{" "}
              {data?.client?.shared
                ? `${data.client.shared} update${data.client.shared === 1 ? "" : "s"} on their page; `
                : "No update is on their page yet; "}
              the rest of the feed is the studio's own record and never leaves this screen.
              {data?.client?.hasContact ? "" : " This project has no client phone or email yet — the link still works if you send it another way."}
            </p>

            <h3 className="side-h">Add an update</h3>
            <div className="row">
              <input
                className="input"
                placeholder="What happened on site"
                value={update}
                onChange={(e) => setUpdate(e.target.value)}
              />
              <Btn disabled={busy} onClick={addUpdate}>
                {share ? "Share with the client" : "Record update"}
              </Btn>
            </div>
            <div className="row" style={{ alignItems: "center" }}>
              <Switch label="Show the client" checked={share} onChange={setShare} />
              <span className="cell-sub">
                Show the client — it appears on their page, and the WhatsApp and e-mail copies are recorded for
                Phase 4. Off, it stays here.
              </span>
            </div>
            {data?.updates.length ? (
              <div className="data">
                {data.updates.map((u, i) => (
                  <div className="feed-item" key={i}>
                    <span className={`feed-dot${u.sys ? " is-sys" : ""}`} />
                    <div>
                      <div className="cell-main">{u.text}</div>
                      <span className="cell-sub">
                        {u.user} · {u.t}
                        {u.photo ? " · photo attached" : ""}
                      </span>
                      {u.toClient ? (
                        <Pill tone="info">on the client's page</Pill>
                      ) : (
                        <Pill>internal</Pill>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="cell-sub">No updates yet. Moves between stages are recorded here automatically.</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
