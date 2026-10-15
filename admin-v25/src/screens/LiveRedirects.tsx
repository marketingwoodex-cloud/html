/**
 * LiveRedirects — the 301s and the 404 log, fed by `GET /redirects` and `GET /404s`.
 *
 * This screen is where the phase's SEO work happens, and it is built around one honest fact: **the rules
 * are checked against the site on disk, and the check has four answers.** ok, warn (it hides a page, or it
 * chains), bad (the target does not exist) and off. The prototype showed a two-state switch; a two-state
 * switch cannot express "this rule sends Google to a page that is not there", which is the mistake that
 * costs a client their rankings.
 *
 * Three behaviours worth naming, because v2.1 got each of them wrong in a small way:
 *
 *   · **Nothing saves by itself.** The list is edited locally and posted in one request (the API replaces
 *     the list, validates it whole, and publishes the .htaccess from that same list) — so a half-typed
 *     rule cannot reach a live file, and the button says how many changes it is about to publish.
 *   · **A Manager's change is queued, not applied.** The API answers `pending: true` and this screen says
 *     so, instead of showing a green "saved" that is not true.
 *   · **The 404 log is the input, not decoration.** Each missed address can become a rule in one click,
 *     and one that already has a rule says so rather than offering a second one.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Btn, Card, Empty, Note, Pill, PageHead, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { useLive, isPending, type MissesData, type MissRow, type RedirectRule, type RedirectsData } from "../lib/live";
import { timeAgo } from "../lib/format";

type Draft = RedirectRule & { dirty?: boolean; fresh?: boolean };

const BLANK: Draft = { id: 0, from: "", to: "", type: 301, match: "exact", src: "manual", on: true, hits: 0, lastHit: null };

const TYPE_LABEL: Record<number, string> = { 301: "301 permanent", 302: "302 temporary", 410: "410 gone" };

export function LiveRedirects() {
  const { link, reason } = useSession();
  const redirects = useLive<RedirectsData>("/redirects?import=1");
  const misses = useLive<MissesData>("/404s?limit=100");

  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [cfg, setCfg] = useState<{ www: boolean; spam: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  /* The served list until somebody edits, then the draft. Kept in one place so the table, the counts and
     the save button all agree on what is on screen. */
  const rows: Draft[] = draft ?? redirects.data?.redirects ?? [];
  const switches = cfg ?? redirects.data?.cfg ?? { www: true, spam: false };

  const changes = useMemo(() => {
    if (!draft || !redirects.data) return 0;
    const before = new Map(redirects.data.redirects.map((r) => [`${r.from}|${r.match}`, r]));
    let n = 0;
    for (const r of draft) {
      const old = before.get(`${r.from}|${r.match}`);
      if (!old) n++;
      else if (old.to !== r.to || old.type !== r.type || old.on !== r.on) n++;
    }
    for (const [key] of before) if (!draft.some((r) => `${r.from}|${r.match}` === key)) n++;
    /* The two switches are changes too, and a save that silently flipped one would be a surprise. */
    if (cfg && redirects.data.cfg && (cfg.www !== redirects.data.cfg.www || cfg.spam !== redirects.data.cfg.spam)) n++;
    return n;
  }, [draft, cfg, redirects.data]);

  const verdict = useMemo(() => {
    /* Keyed by the rule index the API sends (`t.i`), not by the position in the verdict array: the two
       happen to agree today because both come from the same list, and a screen that quietly depends on
       that agreement would put the wrong verdict next to the wrong rule the day one of them is sorted. */
    const map = new Map<number, { status: string; msg: string }>();
    redirects.data?.test.forEach((t) => map.set(t.i, { status: t.status, msg: t.msg }));
    return map;
  }, [redirects.data]);

  function edit(index: number, patch: Partial<Draft>) {
    const base = rows.map((r) => ({ ...r }));
    base[index] = { ...base[index], ...patch, dirty: true };
    setDraft(base);
    setResult(null);
  }

  async function save() {
    setBusy(true);
    setBad(null);
    try {
      const payload = rows
        .filter((r) => r.from.trim() !== "")
        .map((r) => ({ from: r.from, to: r.to, type: r.type, match: r.match, src: r.src, on: r.on }));
      const data = await api.post<unknown>("/redirects", { redirects: payload, cfg: switches });
      if (isPending(data)) {
        setResult(data.message);
      } else {
        const d = data as { saved: { added: number; changed: number; removed: number }; publish: { changed: boolean; copied: string | null; lines: number } };
        setResult(
          `Published ${d.publish.lines} rules (${d.saved.added} added, ${d.saved.changed} changed, ${d.saved.removed} removed)` +
            (d.publish.copied ? ` · previous .htaccess kept as ${d.publish.copied}` : " · the file was already up to date"),
        );
      }
      setDraft(null);
      setCfg(null);
      redirects.reload();
    } catch (e) {
      setBad(e instanceof ApiFailure ? e : null);
    } finally {
      setBusy(false);
    }
  }

  async function mergePlan() {
    setBusy(true);
    setBad(null);
    try {
      const d = await api.post<{ added: number } | { pending: true; message: string }>("/redirects/plan");
      if (isPending(d)) setResult(d.message);
      else setResult((d as { added: number }).added === 0 ? "Every address in the plan already has a rule." : `Added ${(d as { added: number }).added} rules from the verified plan.`);
      redirects.reload();
    } catch (e) {
      setBad(e instanceof ApiFailure ? e : null);
    } finally {
      setBusy(false);
    }
  }

  if (redirects.loading && !redirects.data) {
    return <PageHead title="Redirects" sub="Loading…" />;
  }
  if (redirects.error) {
    return (
      <>
        <PageHead title="Redirects" sub="The rules could not be loaded" />
        <Note tone="danger" title={`${redirects.error.code} — ${redirects.error.message}`}>
          Nothing here is a cached copy: the list is empty because the request failed. {redirects.error.detail}
        </Note>
      </>
    );
  }
  if (!redirects.data) {
    return (
      <>
        <PageHead title="Redirects" sub="No data yet" />
        <Empty
          title={link === "offline" ? "api/v2 is not answering" : "Sign in to see the rules"}
          sub={
            link === "offline"
              ? "This screen edits the redirect rules on the server, so it will show nothing rather than an empty table that reads as \u201cnothing redirects\u201d."
              : `The API answered${reason ? ` but ${reason}` : ""}, and this screen needs a session.`
          }
        />
      </>
    );
  }

  const d = redirects.data;
  const badCount = d.test.filter((t) => t.status === "bad").length;
  const warnCount = d.test.filter((t) => t.status === "warn").length;

  return (
    <>
      <PageHead
        title="Redirects"
        sub={`${d.redirects.length} rules · ${d.redirects.filter((r) => r.on).length} on · ${d.lines} lines in the published block`}
        actions={
          <>
            <Btn icon={<RefreshCw size={14} />} onClick={() => redirects.reload()} disabled={busy}>
              Reload
            </Btn>
            <Btn onClick={mergePlan} disabled={busy || draft !== null}>
              Add the {d.planCount}-address plan
            </Btn>
            <Btn
              variant="primary"
              onClick={save}
              disabled={busy || changes === 0}
              title={changes === 0 ? "Nothing has changed" : `${changes} change(s) — the .htaccess is rewritten and published`}
            >
              {changes === 0 ? "Saved" : `Publish ${changes} change${changes === 1 ? "" : "s"}`}
            </Btn>
          </>
        }
      />

      {badCount > 0 && (
        <Note tone="danger" title={`${badCount} rule${badCount === 1 ? "" : "s"} point nowhere`}>
          The target page does not exist on this server, so the redirect replaces a working 404 with a broken
          redirect. Fix or switch these off before publishing.
        </Note>
      )}
      {warnCount > 0 && (
        <Note tone="warn" title={`${warnCount} rule${warnCount === 1 ? "" : "s"} need a look`}>
          Either a live page exists at the old address (the redirect hides it) or the rule chains — the first
          redirect goes to an address that redirects again.
        </Note>
      )}
      {result && (
        <Note tone="ok" title="The server said">
          {result}
        </Note>
      )}
      {bad && (
        <Note tone="danger" title={`${bad.code} — ${bad.message}`}>
          Nothing was published. The .htaccess is written only after every rule validates. {bad.detail}
        </Note>
      )}

      <Card
        title="Publishing"
        sub="The .htaccess block is generated from this list — the rules above are what the file will contain"
        actions={
          <div className="row" style={{ gap: 16 }}>
            <label className="field-label" title="Rewrite www.woodex.com.pk to the one official address">
              <Switch
                label="Force one official hostname"
                checked={switches.www}
                onChange={(v) => {
                  setCfg({ ...switches, www: v });
                  setResult(null);
                }}
              />{" "}
              one official hostname
            </label>
            <label className="field-label" title="Answer the injected casino/query-string URLs with 410 Gone">
              <Switch
                label="Answer the hacked-spam URLs with 410 Gone"
                checked={switches.spam}
                onChange={(v) => {
                  setCfg({ ...switches, spam: v });
                  setResult(null);
                }}
              />{" "}
              hacked-spam cleanup
            </label>
          </div>
        }
      >
        <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
          <span>
            <Pill tone={d.htaccess.published ? "ok" : "warn"}>{d.htaccess.published ? "block present" : "no block yet"}</Pill>{" "}
            .htaccess
          </span>
          <span>
            <Pill tone={d.htaccess.writable ? "ok" : "danger"}>{d.htaccess.writable ? "writable" : "read-only"}</Pill>{" "}
            {d.htaccess.exists ? "existing file" : "will be created"}
          </span>
          <span style={{ color: "var(--fg-3)", fontSize: "var(--fs-12)" }}>
            Every publish keeps a timestamped copy of the file it replaced, and writes a temporary file before
            renaming — a half-written .htaccess is a site that will not load.
          </span>
        </div>
      </Card>

      <Card
        title="Rules"
        sub="Old address → new address, exactly as Apache will be told"
        actions={
          <Btn icon={<Plus size={14} />} onClick={() => setDraft([{ ...BLANK }, ...rows])} disabled={busy}>
            Add a rule
          </Btn>
        }
        tight
      >
        {rows.length === 0 ? (
          <Empty title="No rules yet" sub="Add the verified plan, or write one by hand." />
        ) : (
          <div className="table-wrap">
            <table className="data">
            <thead>
              <tr>
                <th style={{ width: 90 }}>On</th>
                <th>Old address</th>
                <th>New address</th>
                <th style={{ width: 130 }}>Status</th>
                <th style={{ width: 110 }}>Match</th>
                <th style={{ width: 80 }}>Hits</th>
                <th style={{ width: 130 }}>Check</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                /* `null` means "no verdict to show yet": the row has been edited here, or it is a new
                   rule that the server has not validated — an unvalidated rule must not display "ok". */
                const v = r.dirty || r.fresh ? null : (verdict.get(i) ?? null);
                return (
                  <tr key={`${r.from}|${r.match}|${i}`}>
                    <td>
                      <Switch label={`Rule ${i + 1} is live`} checked={r.on} onChange={(val) => edit(i, { on: val })} />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={r.from}
                        placeholder="/old-address/"
                        onChange={(e) => edit(i, { from: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          className="input"
                          value={r.to}
                          placeholder={r.type === 410 ? "— gone, no target —" : "/new-address/"}
                          disabled={r.type === 410}
                          onChange={(e) => edit(i, { to: e.target.value })}
                          style={{ width: "100%" }}
                        />
                      </div>
                    </td>
                    <td>
                      <select className="input" value={r.type} onChange={(e) => edit(i, { type: Number(e.target.value) })}>
                        {[301, 302, 410].map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={r.match}
                        onChange={(e) => edit(i, { match: e.target.value as "exact" | "prefix" })}
                      >
                        <option value="exact">exact</option>
                        <option value="prefix">and everything under it</option>
                      </select>
                    </td>
                    <td style={{ fontSize: "var(--fs-12)", color: "var(--fg-3)" }}>
                      {r.hits > 0 ? `${r.hits}` : "never"}
                      {r.lastHit ? <div style={{ fontSize: "var(--fs-11)" }}>{timeAgo(r.lastHit)}</div> : null}
                    </td>
                    <td>
                      {v === null ? (
                        <Pill tone="info">edited</Pill>
                      ) : v.status === "ok" ? (
                        <Pill tone="ok">
                          <Check size={11} /> ok
                        </Pill>
                      ) : v.status === "off" ? (
                        <Pill tone="neutral">off</Pill>
                      ) : v.status === "warn" ? (
                        <Pill tone="warn" plain>
                          <AlertTriangle size={11} /> {v.msg.slice(0, 34)}
                        </Pill>
                      ) : (
                        <Pill tone="danger" plain>
                          <X size={11} /> {v.msg.slice(0, 34)}
                        </Pill>
                      )}
                    </td>
                    <td>
                      <Btn
                        variant="ghost"
                        iconOnly
                        icon={<Trash2 size={14} />}
                        title="Remove this rule"
                        onClick={() => {
                          setDraft(rows.filter((_, j) => j !== i).map((x) => ({ ...x })));
                          setResult(null);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      <Card
        title={`Addresses nobody found (${d.missed})`}
        sub="What Google and visitors asked for and did not get — every row is a redirect to write or a link to fix"
        actions={
          <Btn icon={<RefreshCw size={14} />} onClick={() => misses.reload()} disabled={busy}>
            Reload
          </Btn>
        }
        tight
      >
        {misses.loading && !misses.data ? (
          <p style={{ fontSize: "var(--fs-13)", color: "var(--fg-3)" }}>Loading…</p>
        ) : misses.data && misses.data.rows.length === 0 ? (
          <Empty title="Nothing missed" sub="The 404 log is empty — every address asked for was found." />
        ) : (
          <div className="table-wrap">
            <table className="data">
            <thead>
              <tr>
                <th>Path</th>
                <th style={{ width: 70 }}>Hits</th>
                <th style={{ width: 130 }}>Last</th>
                <th>From</th>
                <th style={{ width: 240 }} />
              </tr>
            </thead>
            <tbody>
              {(misses.data?.rows ?? []).map((m: MissRow) => {
                const suggestion = misses.data?.suggestions.find((s) => s.from === m.path);
                return (
                  <tr key={m.path}>
                    <td>
                      <code>{m.path}</code>
                    </td>
                    <td>{m.n}</td>
                    <td style={{ fontSize: "var(--fs-12)", color: "var(--fg-3)" }}>{m.last ? timeAgo(m.last) : "—"}</td>
                    <td style={{ fontSize: "var(--fs-12)", color: "var(--fg-3)" }}>{m.ref || "—"}</td>
                    <td>
                      {m.redirect ? (
                        <Pill tone={m.redirect.on ? "ok" : "warn"}>
                          already {m.redirect.type === 410 ? "410" : `→ ${m.redirect.to}`}
                        </Pill>
                      ) : suggestion ? (
                        <Btn
                          icon={<ArrowRight size={14} />}
                          onClick={() => {
                            setDraft([{ ...BLANK, from: suggestion.from, to: suggestion.to, src: suggestion.src }, ...rows]);
                            setResult(null);
                          }}
                        >
                          Rule → {suggestion.to}
                        </Btn>
                      ) : (
                        <Btn
                          onClick={() => {
                            setDraft([{ ...BLANK, from: m.path, src: "from the 404 log" }, ...rows]);
                            setResult(null);
                          }}
                        >
                          Write a rule
                        </Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </>
  );
}
