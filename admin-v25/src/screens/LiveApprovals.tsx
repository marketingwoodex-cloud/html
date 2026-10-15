/**
 * LiveApprovals — the Master's queue, and the one screen where the product's oldest rule is visible.
 *
 * The rule: the Master acts; a Manager proposes. v2.1 kept that queue in `_private/approvals.json`, which
 * meant it could not be searched, could be truncated by a half-written file, and had no notion of who
 * decided what. The queue itself is `wx_approvals` now and the *deciding* is the interesting part: an
 * approval does not ask the Master to retype anything — it replays the original request through the same
 * handler, as the Master (`wx_appr_replay()`), and an item that fails comes back with the error attached
 * rather than disappearing into a log.
 *
 * So this screen has three jobs and says which one it is doing: read the queue (what is waiting, who
 * asked, how long it has been there), read one request closely enough to decide it, and — for the Master
 * only — change the three switches that decide what waits in the first place. A Manager sees their own
 * requests and no buttons: being able to see that something is waiting is the difference between "in
 * progress" and "lost", and the buttons are not theirs to press.
 */
import { useState } from "react";
import { Check, Clock, Eye, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Btn, Card, Empty, Input, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type ApprData, type ApprDetailData, type ApprStatus,
} from "../lib/live";
import { timeAgo } from "../lib/format";

const STATUSES: { id: ApprStatus; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Refused" },
  { id: "all", label: "Everything" },
];

const TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  pending: "warn",
  approved: "ok",
  rejected: "danger",
  expired: "neutral",
  applying: "info",
};

export function LiveApprovals() {
  const { link, reason } = useSession();
  const [status, setStatus] = useState<ApprStatus>("pending");
  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  const list = useLive<ApprData>(`/approvals?status=${status}`, status);
  const detail = useLive<ApprDetailData>(openId === null ? null : `/approvals/${openId}`, openId);
  const data = list.data;

  function flash(message: string) {
    setNote(message);
    setBad(null);
    list.reload();
    if (openId !== null) detail.reload();
  }

  /* One state, one sentence: there is no sample below to reach, and a queue shown empty would read as "nothing
     is waiting for you" — a claim about the studio's morning that this screen cannot make. */
  if (link !== "live") {
    return (
      <>
        <PageHead title="Approvals" sub="Manager changes waiting for the master" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering, so the queue cannot be read. Nothing here would be a real request, and a queue that invented its own numbers is the one screen where that would matter most."
            : "Sign in to see what is waiting for the master."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!data && list.loading) {
    return (
      <>
        <PageHead title="Approvals" sub="Manager changes waiting for the master" />
        <Card><div className="muted" style={{ padding: 18 }}>Reading the queue…</div></Card>
      </>
    );
  }

  if (!data && list.error) {
    return (
      <>
        <PageHead title="Approvals" sub="Manager changes waiting for the master" />
        <Note tone="danger" title="The queue could not be read">{list.error.message}</Note>
      </>
    );
  }

  const rows = data?.approvals ?? [];

  return (
    <>
      <PageHead
        title="Approvals"
        sub={
          data
            ? data.canDecide
              ? `${data.pending} waiting for you · approving replays the request as the master, so nothing has to be retyped`
              : `${data.pending} waiting · you can see your own requests; only the master decides`
            : "Manager changes waiting for the master"
        }
        actions={<Btn icon={<RefreshCw size={15} />} onClick={() => { list.reload(); if (openId !== null) detail.reload(); }}>Refresh</Btn>}
      />

      {note && <Note tone="ok">{note}</Note>}
      {bad && <Note tone="danger" title="That did not work">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}

      <div className="toolbar">
        <Seg options={STATUSES} value={status} onChange={(t) => { setStatus(t); setOpenId(null); }} />
        <div className="row">
          <Pill tone={data && data.pending > 0 ? "warn" : "ok"}>{`${data?.pending ?? 0} waiting`}</Pill>
          <Pill tone="info">{data?.canDecide ? "you decide" : "your requests"}</Pill>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title={status === "pending" ? "Nothing is waiting" : "Nothing here"}
          sub={
            status === "pending"
              ? "When a manager saves something that needs your approval it appears here, with what it would change."
              : "No request has that outcome."
          }
        />
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>What</th><th>Who asked</th><th>When</th><th>State</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="cell-main">{a.summary}</div>
                      <div className="cell-sub mono">{a.action}{a.src === "builder" ? " · builder" : ""}</div>
                    </td>
                    <td>{a.by || "—"}<div className="cell-sub">{a.role || ""}</div></td>
                    <td className="nowrap">
                      {timeAgo(a.at)}
                      <div className="cell-sub"><Clock size={12} /> {a.ageHours}h old</div>
                    </td>
                    <td>
                      <Pill tone={TONE[a.status] ?? "neutral"}>{a.status}</Pill>
                      {a.note ? <div className="cell-sub">{a.note}</div> : null}
                    </td>
                    <td>
                      <Btn iconOnly icon={<Eye size={14} />} title="Read this request" onClick={() => setOpenId(openId === a.id ? null : a.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {openId !== null && (
        <ApprovalDetail
          id={openId}
          canDecide={detail.data?.canDecide ?? data?.canDecide ?? false}
          data={detail.data}
          loading={detail.loading}
          error={detail.error}
          onClose={() => setOpenId(null)}
          onDone={flash}
          onBad={setBad}
        />
      )}

      {data?.canDecide && <ApprovalPolicy cfg={data.cfg} onDone={flash} onBad={setBad} />}
    </>
  );
}

/**
 * One request, read closely enough to decide it: what will run, on which route file, and the body that
 * will be sent. The body is shown as it is stored — a request, not a document — because the Master is
 * deciding whether to run *that*, and a summary that has been prettified is a summary that could differ
 * from what the replay does.
 */
function ApprovalDetail({
  id, data, loading, error, canDecide, onClose, onDone, onBad,
}: {
  id: number;
  data: ApprDetailData | null;
  loading: boolean;
  error: ApiFailure | null;
  canDecide: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onBad: (e: ApiFailure) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState("");

  async function decide(kind: "approve" | "reject") {
    setBusy(true);
    try {
      const r = await api.post<{ applied: boolean; result?: unknown } | { pending: true; message: string }>(
        `/approvals/${id}/${kind}`,
        kind === "reject" ? { note: why } : {},
      );
      if (isPending(r)) {
        onDone(r.message);
      } else if (kind === "approve") {
        onDone("Approved and applied — the request ran as you, and the person who asked can see it in the log.");
      } else {
        onDone("Refused. The requester sees your reason; nothing was written to the site.");
      }
      onClose();
    } catch (err) {
      onBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  const a = data?.approval;
  const bodyText = a ? JSON.stringify(a.body ?? {}, null, 2) : "";

  return (
    <Card>
      <div className="row-between">
        <h2 className="cell-main">
          <ShieldCheck size={15} /> Request #{id}
        </h2>
        <Btn iconOnly icon={<X size={14} />} title="Close" onClick={onClose} />
      </div>

      {loading && !a && <div className="muted" style={{ padding: 12 }}>Reading the request…</div>}
      {error && <Note tone="danger" title="That request could not be read">{error.message}</Note>}

      {a && (
        <>
          <p className="cell-sub" style={{ marginTop: 6 }}>
            {a.summary} — asked by <b>{a.by || "—"}</b> ({a.role || "unknown role"}) {timeAgo(a.at)}, {a.ageHours}h ago.
          </p>

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Route file</th><th>Handler</th><th>Method</th></tr></thead>
              <tbody>
                <tr>
                  <td className="mono">{a.request.file || "—"}</td>
                  <td className="mono">{a.request.fn || "—"}</td>
                  <td className="mono">{a.request.method || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <details open style={{ marginTop: 10 }}>
            <summary className="muted" style={{ fontSize: "var(--fs-12)", cursor: "pointer" }}>
              The exact request that will be replayed
            </summary>
            <pre className="mono" style={{ maxHeight: 280, overflow: "auto", fontSize: "var(--fs-12)", padding: 10, background: "var(--surface)", borderRadius: 8 }}>
              {bodyText === "{}" ? "(no body — the route takes its work from the URL)" : bodyText}
            </pre>
          </details>

          {a.status !== "pending" && (
            <Note tone={TONE[a.status] === "danger" ? "danger" : "info"} title={`Already ${a.status}`}>
              {a.decidedBy ? `Decided by ${a.decidedBy}` : "Decided"}{a.decidedAt ? ` ${timeAgo(a.decidedAt)}` : ""}
              {a.note ? ` — ${a.note}` : ""}
            </Note>
          )}

          {canDecide && a.status === "pending" && (
            <div className="stack" style={{ marginTop: 12 }}>
              <Input value={why} placeholder="Why not (only used when you refuse)" onChange={(e) => setWhy(e.target.value)} />
              <div className="row">
                <Btn variant="primary" icon={<Check size={15} />} disabled={busy} onClick={() => decide("approve")}>
                  Approve and run it
                </Btn>
                <Btn icon={<X size={15} />} disabled={busy || why.trim().length < 3} onClick={() => decide("reject")} title={why.trim().length < 3 ? "Give a reason first" : undefined}>
                  Refuse
                </Btn>
                <span className="cell-sub">
                  Approving replays the request as you — the same handler, the same body. If it fails, the item
                  stays here with the error attached.
                </span>
              </div>
            </div>
          )}

          {!canDecide && a.status === "pending" && (
            <Note tone="info" title="Only the master decides">
              You can see that this is waiting; the buttons are the master's. Nothing you do here changes it.
            </Note>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The three switches, and who may change them: only the Master, because the whole point of the feature is
 * that a Manager cannot decide their own changes do not need approval.
 */
function ApprovalPolicy({
  cfg, onDone, onBad,
}: {
  cfg: { manager: boolean; developer: boolean; notify?: boolean; expire_days?: number };
  onDone: (message: string) => void;
  onBad: (e: ApiFailure) => void;
}) {
  const [manager, setManager] = useState(cfg.manager);
  const [developer, setDeveloper] = useState(cfg.developer);
  const [notify, setNotify] = useState(cfg.notify ?? true);
  const [busy, setBusy] = useState(false);
  const dirty = manager !== cfg.manager || developer !== cfg.developer || notify !== (cfg.notify ?? true);

  async function save() {
    setBusy(true);
    try {
      const r = await api.post<{ cfg: typeof cfg } | { pending: true; message: string }>("/approvals/config", {
        manager, developer, notify,
      });
      onDone(isPending(r) ? r.message : "Policy saved. It applies to the next change somebody makes, not to what is already queued.");
    } catch (err) {
      onBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="cell-main">What waits for you</h2>
      <p className="cell-sub">
        v2.1's policy, unchanged: the Master acts directly, a Manager proposes, and the developers' switch
        decides whether an Editor's changes are held the same way. Requests older than {cfg.expire_days ?? 14} days
        expire rather than sitting in the queue forever.
      </p>
      <div className="stack" style={{ marginTop: 8 }}>
        <Switch label="A manager's change waits for me" checked={manager} onChange={setManager} />
        <Switch label="A developer's change waits too" checked={developer} onChange={setDeveloper} />
        <Switch label="Tell me when something is waiting" checked={notify} onChange={setNotify} />
        <div className="row">
          <Btn variant="primary" disabled={busy || !dirty} onClick={save}>Save the policy</Btn>
          {!dirty && <span className="cell-sub">Nothing has changed yet.</span>}
        </div>
      </div>
    </Card>
  );
}
