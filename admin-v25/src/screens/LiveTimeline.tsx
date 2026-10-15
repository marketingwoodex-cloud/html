/**
 * LiveTimeline — every project on a date axis.
 *
 * The plan asks for "projects on a date axis with milestones". What the data model actually holds is two
 * dates per project — `start` and `target` (handover) — and a milestone plan that is **percentages of the
 * contract**, not a set of dated tasks. So this screen draws exactly that and says so: a bar per project
 * from its start to its handover, filled by how much of the contract has been invoiced, with a today line.
 * It does not invent a task Gantt, because a bar for a task nobody dated would be a picture of a schedule
 * that does not exist — and the person who believed it would be the one promising a handover.
 *
 * Three rules the screen keeps:
 *
 *   · **Nothing is dropped silently.** A project with no dates cannot be a bar, so it is listed underneath
 *     as "no dates set" with the reason. A Gantt that quietly omitted them would look complete and be wrong.
 *   · **The axis is the work's own span**, from the earliest start to the latest handover, so a two-year
 *     archive does not squeeze one active month into a line.
 *   · **Late is a colour, not a filter.** Overdue handovers stay on the chart with a marker; the point of a
 *     timeline is that the late things are visible beside the healthy ones.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, RefreshCw } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Seg } from "../components/primitives";
import { useSession } from "../lib/session";
import { useLive, type ProjList, type ProjRow } from "../lib/live";

/** Pixels per day at each zoom. A year at the widest is ~1150 px, which is a scroll on a laptop and fine. */
const ZOOMS: { id: string; label: string; px: number }[] = [
  { id: "week", label: "Weeks", px: 6 },
  { id: "month", label: "Months", px: 3 },
  { id: "quarter", label: "Quarters", px: 1.2 },
];

const DAY = 86_400_000;

function day(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(date + "T00:00:00Z");
  return Number.isNaN(ms) ? null : ms;
}

function label(date: string): string {
  const ms = day(date);
  if (ms === null) return date;
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });
}

export function LiveTimeline() {
  const { link, reason } = useSession();
  if (link !== "live") {
    return (
      <>
        <PageHead title="Timeline" sub="Every project on a date axis." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading your site">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. A timeline drawn from nothing would still look like a schedule, which is why there is none until your projects can be read.`
            : "Sign in to see every project's start and handover on one axis."}
        </Note>
      </>
    );
  }
  return <TimelineBody />;
}

export function TimelineBody() {
  const live = useLive<ProjList>("/projects?view=all&limit=500");
  const [zoom, setZoom] = useState("month");
  const navigate = useNavigate();

  const data = live.data;
  const rows = useMemo(() => data?.projects ?? [], [data]);

  /* Bars and undated projects, separated honestly. `target` is the handover date and `start` the day work
     began; a project missing either cannot be placed, and rolling it up to "today" would put work on a day
     it never happened. */
  const { bars, undated } = useMemo(() => {
    const bars: { p: ProjRow; from: number; to: number; single: boolean }[] = [];
    const undated: ProjRow[] = [];
    for (const p of rows) {
      const a = day(p.start);
      const b = day(p.target);
      if (a === null && b === null) {
        undated.push(p);
        continue;
      }
      const from = a ?? (b as number);
      const to = b ?? (a as number);
      bars.push({ p, from: Math.min(from, to), to: Math.max(from, to), single: from === to });
    }
    return { bars, undated };
  }, [rows]);

  const range = useMemo(() => {
    if (!bars.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const b of bars) {
      min = Math.min(min, b.from);
      max = Math.max(max, b.to);
    }
    const today = Date.now();
    /* The today line has to be visible: if every project is in the past, the axis is extended to now, so
       "everything is behind us" is something the chart shows rather than something a person has to infer. */
    min = Math.min(min, today);
    max = Math.max(max, today);
    const pad = Math.max(7, Math.round((max - min) / DAY / 20)) * DAY;
    return { from: min - pad, to: max + pad };
  }, [bars]);

  const px = ZOOMS.find((z) => z.id === zoom)?.px ?? 3;
  const days = range ? Math.max(1, Math.ceil((range.to - range.from) / DAY)) : 0;
  const width = Math.max(320, Math.round(days * px));

  const months = useMemo(() => {
    if (!range) return [];
    const out: { label: string; left: number; width: number }[] = [];
    const d = new Date(range.from);
    d.setUTCDate(1);
    while (d.getTime() < range.to) {
      const start = Math.max(d.getTime(), range.from);
      const next = new Date(d);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const end = Math.min(next.getTime(), range.to);
      const w = Math.max(0, (end - start) / DAY) * px;
      /* Below ~26px a month label is noise, so short months are left unlabelled rather than overlapping. */
      out.push({
        label: w > 26 ? d.toLocaleDateString("en-GB", { month: "short", year: px <= 1.5 ? "2-digit" : undefined, timeZone: "UTC" }) : "",
        left: ((start - range.from) / DAY) * px,
        width: w,
      });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }, [range, px]);

  function x(ms: number): number {
    return range ? ((ms - range.from) / DAY) * px : 0;
  }

  const todayX = range ? x(Date.now()) : 0;

  return (
    <>
      <PageHead
        title="Timeline"
        sub="Every project from its start to its handover, filled by how much of the contract has been invoiced."
        actions={
          <>
            <Seg options={ZOOMS.map((z) => ({ id: z.id, label: z.label }))} value={zoom} onChange={setZoom} />
            <Btn icon={<RefreshCw size={15} />} onClick={live.reload}>
              Refresh
            </Btn>
          </>
        }
      />

      {live.loading && !data ? (
        <Card>
          <h2 className="cell-main">Reading the projects…</h2>
          <p className="cell-sub">The axis is built from the earliest start and the latest handover in your data.</p>
        </Card>
      ) : live.error ? (
        <Note tone="danger" title="The projects could not be read">
          {live.error.message} <span className="mono">{live.error.detail}</span>
        </Note>
      ) : !bars.length ? (
        <Card>
          <Empty
            title="No project has both a start and a handover date yet"
            sub={
              undated.length
                ? `${undated.length} project(s) exist but none carries a date this axis can place. Set a start and a handover target on the project, and it appears here.`
                : "A project is opened by an approved quotation and invoiced — once it has dates, it appears here."
            }
          />
        </Card>
      ) : (
        <>
          <Card title="The axis is your own work" sub={`${bars.length} project(s) with dates · ${days} days across · today is the dashed line.`}>
            <div className="gantt">
              <div className="gantt-scroll">
                <div className="gantt-grid" style={{ width: width + 220 }}>
                  <div className="gantt-head" style={{ width }}>
                    {months.map((m, i) => (
                      <div key={i} className="gantt-month" style={{ left: m.left, width: m.width }}>
                        {m.label}
                      </div>
                    ))}
                  </div>
                  {bars.map((b) => {
                    const left = x(b.from);
                    const w = Math.max(3, x(b.to) - left);
                    const fill = Math.max(0, Math.min(100, b.p.billedPct));
                    return (
                      <div className="gantt-row" key={b.p.id}>
                        <button type="button" className="gantt-label" onClick={() => navigate(`/projects?p=${b.p.id}`)}>
                          <b>{b.p.name}</b>
                          <span>
                            {b.p.stage} · {b.p.client_name || "no client"}
                          </span>
                        </button>
                        <div className="gantt-track" style={{ width }}>
                          <div
                            className={`gantt-bar${b.p.late ? " is-late" : ""}`}
                            style={{ left, width: w }}
                            title={`${b.p.name} — ${label(b.p.start)} → ${label(b.p.target)} · ${b.p.billedPct}% invoiced of ${b.p.valueDisplay}${b.p.balance ? ` · balance ${b.p.balanceDisplay}` : ""}`}
                          >
                            <i style={{ width: `${fill}%` }} />
                            <em>{b.p.billedPct}%</em>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="gantt-today" style={{ left: 220 + todayX }} title="Today">
                    <span>today</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="cell-sub">
              The fill is the share of the contract that has been invoiced — a milestone plan is percentages, so a
              project can be half built and not half billed. Click a name to open it.
            </p>
          </Card>

          {undated.length ? (
            <Card title={`${undated.length} project(s) with no dates set`} sub="They cannot be placed on an axis, so they are listed rather than left out.">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Stage</th>
                      <th className="num">Contract</th>
                      <th className="num">Invoiced</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {undated.map((p) => (
                      <tr key={p.id}>
                        <td className="cell-main">
                          <b>{p.name}</b>
                          <span className="cell-sub">{p.client_name || "No client"}</span>
                        </td>
                        <td>{p.stage}</td>
                        <td className="num nowrap">{p.valueDisplay}</td>
                        <td className="num nowrap">{p.invoiced ? p.invoicedDisplay : "—"}</td>
                        <td className="right">
                          <Btn onClick={() => navigate(`/projects?p=${p.id}`)}>
                            <CalendarRange size={14} /> Set the dates
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {data && data.total > data.projects.length ? (
            <Note tone="info" title={`Showing ${data.projects.length} of ${data.total} projects`}>
              The timeline reads the {data.limit} most recent projects. Older ones are on the Projects screen,
              filtered.
            </Note>
          ) : null}

          <Note tone={bars.some((b) => b.p.late) ? "warn" : "ok"} title={
            bars.some((b) => b.p.late)
              ? `${bars.filter((b) => b.p.late).length} project(s) are past their handover date`
              : "No project is past its handover date"
          }>
            {bars.some((b) => b.p.late) ? (
              <>
                They are marked on the axis. A closed project is never counted late — its date has done its job.
              </>
            ) : (
              "Late here means the handover target has gone by and the project is not closed."
            )}
          </Note>
        </>
      )}
    </>
  );
}
