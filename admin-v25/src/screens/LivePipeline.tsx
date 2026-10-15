/**
 * LivePipeline — the stage board (plan P25.2 §5.2), the screen the owner asked for first.
 *
 * v2.1 had a board (`admin-p19f.js`) with no API behind it; the prototype that replaced it was deleted for
 * inventing data. This one is the real thing, and its rules are the plan's, in the order the plan lists them:
 *
 *   · **The columns are the server's stages.** `GET /leads?view=board` answers with `stages` (the server's
 *     `WX_LEAD_STAGES`) and the screen draws exactly those columns, in that order. A stage it has no label
 *     for is shown by its name, not hidden — the screen never invents, adds or drops a list entry. A lead
 *     whose stage is not in the list (an import, an old v2.1 row) still gets a column, at the end.
 *
 *   · **Per-column counts and values are the server's**, from its `GROUP BY stage` — never the length of the
 *     array the browser happens to be holding. When the page holds fewer cards than the column's real count,
 *     the column says "showing N of M" and points at the table for the rest. An empty column says
 *     "nothing in this stage", not "0".
 *
 *   · **The write is `PATCH /leads/{id}` with the stage.** Dragging a card is a convenience; on a phone
 *     there is no drag, so every card also carries a stage menu that makes the same call. The move is
 *     optimistic and is **reverted with the failure named** if the server refuses.
 *
 *   · **The change is in the lead's activity** because the server writes it there (`Stage: x → y`); the
 *     panel under the board opens a lead and shows that activity, so "who moved this and when" is a click
 *     away rather than a memory.
 *
 * Offline, the board says it cannot read the server instead of drawing seven empty columns that look like
 * a quiet week.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, GripVertical, RefreshCw } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { money, timeAgo } from "../lib/format";
import {
  useLive,
  type LeadDetailData,
  type LeadNote,
  type LeadRow,
  type LeadSaveResult,
  type LeadsData,
} from "../lib/live";
import { useSession } from "../lib/session";

/** Nicer names for the stages this business uses. The list itself comes from the server; this is only how
    a known name is printed. An unknown stage prints as itself. */
const STAGE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  visit: "Visit",
  quote: "Quoted",
  hold: "On hold",
  won: "Won",
  lost: "Lost",
};

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

export function LivePipeline() {
  const { link, me, reason } = useSession();
  const live = useLive<LeadsData>("/leads?view=board&limit=200");

  if (link !== "live" || !me) {
    return (
      <>
        <PageHead title="Pipeline" sub="Every enquiry on its way through the studio." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading your leads">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. A board is a claim about your leads, so nothing is drawn until they can be read.`
            : link === "checking"
              ? "Still looking for api/v2 — the board draws nothing until the server answers with the stages and the counts."
              : "Sign in to see the pipeline board."}
        </Note>
      </>
    );
  }
  if (live.loading && !live.data) {
    return (
      <Card>
        <h2 className="cell-main">Loading…</h2>
        <p className="cell-sub">Reading the pipeline from the server.</p>
      </Card>
    );
  }
  if (!live.data) {
    return (
      <Note tone="danger" title="The pipeline could not be read">
        {live.error?.message ?? "The server did not answer."}
      </Note>
    );
  }
  return <Board live={live} />;
}

export interface BoardSource {
  data: LeadsData | null;
  loading: boolean;
  reload: () => void;
}

export function Board({ live }: { live: BoardSource }) {
  const data = live.data!;
  /* The server's list, in the server's order. If it ever sends none, the honest board has no columns —
     drawing seven the screen remembered would be inventing the one thing the plan says not to. */
  const stages = data.stages ?? [];
  const counts = data.board ?? {};

  const [cards, setCards] = useState<LeadRow[]>(data.leads);
  const [moving, setMoving] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  /* A fresh answer from the server replaces the optimistic picture — the counts and the cards come from
     the same read again. */
  useEffect(() => {
    setCards(data.leads);
  }, [data]);

  const columns = useMemo(() => {
    const map = new Map<string, LeadRow[]>();
    for (const s of stages) map.set(s, []);
    for (const c of cards) {
      if (!map.has(c.stage)) map.set(c.stage, []); // a stage the server list does not know still gets a column
      map.get(c.stage)!.push(c);
    }
    return Array.from(map.entries());
  }, [cards, stages]);

  const move = useCallback(
    async (id: number, to: string) => {
      let from = "";
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          from = c.stage;
          return { ...c, stage: to };
        }),
      );
      if (!from || from === to) return;
      setMoving(id);
      setFailure(null);
      try {
        const r = await api.patch<LeadSaveResult>(`/leads/${id}`, { stage: to });
        setCards((prev) => prev.map((c) => (c.id === id ? r.lead : c)));
        live.reload(); // the counts are the server's; ask for them again now the move is real
      } catch (err) {
        const message =
          err instanceof ApiFailure ? err.message : String(err);
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, stage: from } : c)));
        setFailure(`Not moved: ${message}`);
      } finally {
        setMoving(null);
      }
    },
    [live],
  );

  return (
    <>
      <PageHead
        title="Pipeline"
        sub={
          data.total > cards.length
            ? `${data.total} enquiries · ${cards.length} on the board`
            : `${data.total} enquir${data.total === 1 ? "y" : "ies"} · stages and counts from the server`
        }
        actions={
          <Btn icon={<RefreshCw size={15} />} onClick={live.reload} disabled={live.loading}>
            {live.loading ? "Refreshing…" : "Refresh"}
          </Btn>
        }
      />

      {failure ? (
        <Note tone="danger" title="That move did not save">
          {failure} The card is back where it was.
        </Note>
      ) : null}

      {stages.length === 0 ? (
        <Note tone="warn" title="The server sent no stage list">
          A board without the server's stages would be a board of guesses, so no columns are drawn. The
          API's <span className="mono">view=board</span> answer should carry them.
        </Note>
      ) : (
        <div className="board" role="list">
          {columns.map(([stage, rows]) => {
            const count = counts[stage]?.count ?? 0;
            const value = counts[stage]?.value ?? 0;
            return (
              <section
                key={stage}
                className="board-col"
                role="listitem"
                aria-label={`${stageLabel(stage)}: ${count}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = Number(e.dataTransfer.getData("text/plain"));
                  if (Number.isFinite(id) && id > 0) void move(id, stage);
                }}
              >
                <header className="board-col-head">
                  <h2 className="cell-main">{stageLabel(stage)}</h2>
                  {/* The count is the server's GROUP BY, never rows.length. A column with nothing in it
                      says so in words — an empty column is not a zero. */}
                  {count > 0 ? (
                    <Pill tone={stage === "won" ? "ok" : stage === "lost" ? "neutral" : "accent"}>{`${count}`}</Pill>
                  ) : null}
                </header>
                {value > 0 ? <p className="cell-sub">{money(value)}</p> : null}
                {count === 0 && rows.length === 0 ? (
                  <p className="cell-sub board-empty">nothing in this stage</p>
                ) : (
                  <>
                    {rows.length < count ? (
                      <p className="cell-sub">
                        {`showing ${rows.length} of ${count} · `}
                        <Link to={`/leads?stage=${encodeURIComponent(stage)}`}>see them in the table</Link>
                      </p>
                    ) : null}
                    <div className="board-cards">
                      {rows.map((c) => (
                        <LeadCard
                          key={c.id}
                          lead={c}
                          stages={stages}
                          busy={moving === c.id}
                          selected={selected === c.id}
                          onOpen={() => setSelected(c.id)}
                          onMove={(to) => void move(c.id, to)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selected !== null ? (
        <LeadPanel id={selected} onClose={() => setSelected(null)} onMoved={() => live.reload()} />
      ) : null}
    </>
  );
}

export function LeadCard({
  lead,
  stages,
  busy,
  selected,
  onOpen,
  onMove,
}: {
  lead: LeadRow;
  stages: string[];
  busy: boolean;
  selected: boolean;
  onOpen: () => void;
  onMove: (to: string) => void;
}) {
  return (
    <article
      className={`board-card${selected ? " is-selected" : ""}${busy ? " is-busy" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(lead.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
    >
      <div className="row-between">
        <span className="cell-main">{lead.name}</span>
        <GripVertical size={13} className="muted" aria-hidden />
      </div>
      <p className="cell-sub">
        {lead.service || lead.company || "—"}
        {lead.value > 0 ? ` · ${lead.valueDisplay ?? money(lead.value)}` : ""}
      </p>
      <p className="cell-sub">
        {lead.phone || lead.email || "no contact on file"} · {timeAgo(lead.created_at)}
      </p>
      {/* The same write as the drag, for phones and keyboards. onChange fires only on a real change. */}
      <select
        className="input board-move"
        aria-label={`Move ${lead.name} to another stage`}
        value={lead.stage}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onMove(e.target.value)}
      >
        {Array.from(new Set([lead.stage, ...stages])).map((s) => (
          <option key={s} value={s}>
            {`${stageLabel(s)}${s === lead.stage ? " (now)" : ""}`}
          </option>
        ))}
      </select>
    </article>
  );
}

/** One lead and its activity — where a stage change shows up as `Stage: x → y`, written by the server. */
function LeadPanel({ id, onClose, onMoved }: { id: number; onClose: () => void; onMoved: () => void }) {
  const [detail, setDetail] = useState<LeadDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setDetail(null);
    setError(null);
    api
      .get<LeadDetailData>(`/leads/${id}`)
      .then((d) => {
        if (alive.current) setDetail(d);
      })
      .catch((err: unknown) => {
        if (alive.current) setError(err instanceof ApiFailure ? err.message : String(err));
      });
  }, [id, nonce]);

  async function addNote() {
    const text = note.trim();
    if (text.length < 2) return;
    setBusy(true);
    try {
      await api.post(`/leads/${id}/notes`, { text });
      setNote("");
      setNonce((n) => n + 1);
      onMoved();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="row-between">
        <h2 className="cell-main">
          {detail ? detail.lead.name : `Lead #${id}`}{" "}
          <span className="cell-sub">· activity</span>
        </h2>
        <Btn onClick={onClose}>Close</Btn>
      </div>
      {error ? (
        <Note tone="danger" title="This lead could not be read in full">
          {error}
        </Note>
      ) : null}
      {detail ? (
        <>
          <p className="cell-sub">
            {detail.lead.source}
            {detail.lead.page ? ` · ${detail.lead.page}` : ""} ·{" "}
            {detail.lead.phone || detail.lead.email || "no contact on file"}
            {detail.lead.value > 0 ? ` · ${detail.lead.valueDisplay ?? money(detail.lead.value)}` : ""}
          </p>
          {detail.notes.length === 0 ? (
            <Empty title="No activity yet" sub="Moves and notes will appear here." />
          ) : (
            <ul className="stack-tight">
              {detail.notes.map((n: LeadNote) => (
                <li key={n.id} className="cell-sub">
                  <span className="mono">{n.t}</span>{" "}
                  {n.sys ? <Pill tone="info">system</Pill> : <Pill tone="neutral">{n.user_name || "someone"}</Pill>}{" "}
                  {n.text}
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Add a note — a call, a promise, a next step"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addNote();
              }}
            />
            <Btn variant="primary" disabled={busy || note.trim().length < 2} onClick={() => void addNote()}>
              {busy ? "Saving…" : "Add note"}
            </Btn>
          </div>
        </>
      ) : (
        <p className="cell-sub">Reading the lead…</p>
      )}
      <p className="cell-sub">
        <ChevronRight size={12} className="muted" aria-hidden /> Stage changes are recorded by the server as
        soon as they are made — this list is where they show up.
      </p>
    </Card>
  );
}
