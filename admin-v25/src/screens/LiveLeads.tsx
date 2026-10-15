/**
 * LiveLeads — the enquiries table, fed by `GET /leads`.
 *
 * The prototype's table was the design; this is the same table on real rows, with three rules the v2.1
 * admin broke and this one does not:
 *
 *   · **Filtering and paging happen on the server.** v2.1 loaded every lead and filtered in JavaScript,
 *     which was fast with 40 rows and wrong with 4,000 — the count in the header said "1,204 enquiries"
 *     while the table showed 200. The query, the page and the total all come from the API, and the
 *     header reports the total the server sent.
 *
 *   · **A row never shows what the server did not send.** A missing phone number is "—", not an empty
 *     cell that reads as a number someone forgot to type.
 *
 *   · **The empty state distinguishes "no results" from "no data".** "No enquiries match these filters"
 *     and "no enquiries yet" are different sentences, and only one of them means the website form is
 *     broken.
 */
import { useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { Btn, Card, Empty, Input, Note, PageHead, Pill, statusTone } from "../components/primitives";
import { money, timeAgo } from "../lib/format";
import { useLive, type LeadsData, type LeadRow } from "../lib/live";
import { useSession } from "../lib/session";

const STAGES = ["new", "contacted", "visit", "quote", "hold", "won", "lost"] as const;
const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", visit: "Visit", quote: "Quoted",
  hold: "On hold", won: "Won", lost: "Lost",
};

export function LiveLeads() {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("");
  const [page, setPage] = useState(0);
  const { user } = useSession();
  const limit = 25;

  /* The query string is the key: changing a filter re-fetches, and the server keeps the paging honest. */
  const query = useMemo(() => {
    const parts = [`limit=${limit}`, `offset=${page * limit}`];
    if (q.trim()) parts.push(`q=${encodeURIComponent(q.trim())}`);
    if (stage) parts.push(`stage=${encodeURIComponent(stage)}`);
    return `/leads?${parts.join("&")}`;
  }, [q, stage, page]);

  const { data, error, loading, reload } = useLive<LeadsData>(query);

  return (
    <>
      <PageHead
        title="Enquiries"
        sub={
          data
            ? data.total > limit
              ? `${data.total} enquiries · showing ${data.offset + 1}–${Math.min(data.offset + data.leads.length, data.total)}`
              : `${data.total} enquir${data.total === 1 ? "y" : "ies"}`
            : "Loading…"
        }
        actions={
          <Btn onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
          </Btn>
        }
      />

      <Card tight>
        <div className="toolbar">
          <div className="row" style={{ gap: "var(--s-2)", flex: "1 1 260px" }}>
            <Search size={14} className="muted" />
            <Input
              placeholder="Name, phone, company…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
            {q && (
              <Btn iconOnly size="sm" onClick={() => { setQ(""); setPage(0); }} title="Clear">
                <X size={13} />
              </Btn>
            )}
          </div>
          <div className="row" style={{ gap: "var(--s-1)", flexWrap: "wrap" }}>
            <Btn size="sm" variant={stage === "" ? "primary" : "default"} onClick={() => { setStage(""); setPage(0); }}>
              All
            </Btn>
            {STAGES.map((s) => (
              <Btn
                key={s}
                size="sm"
                variant={stage === s ? "primary" : "default"}
                onClick={() => { setStage(stage === s ? "" : s); setPage(0); }}
              >
                {STAGE_LABEL[s]}
              </Btn>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: "var(--s-4)" }}>
            <Note tone="warn">
              <b>{error.message}</b>
              <div className="mono" style={{ fontSize: "var(--fs-11)", marginTop: 4 }}>{error.detail}</div>
            </Note>
            <div className="row" style={{ marginTop: "var(--s-3)" }}>
              <Btn size="sm" onClick={reload}>Try again</Btn>
            </div>
          </div>
        )}

        {!error && data && data.leads.length === 0 && (
          <Empty
            title={q || stage ? "No enquiries match these filters" : "No enquiries yet"}
            sub={
              q || stage
                ? "Try clearing the search or the stage."
                : "Enquiries from the website form, the chat widget, WhatsApp and the phone all appear here."
            }
          />
        )}

        {!error && data && data.leads.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Enquiry</th>
                    <th>Contact</th>
                    <th>Source</th>
                    <th>Service</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th>Stage</th>
                    <th>Last contact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map((l) => (
                    <Row key={l.id} lead={l} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-foot row-between">
              <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
                {data.offset + 1}–{Math.min(data.offset + data.leads.length, data.total)} of {data.total}
              </span>
              <span className="row" style={{ gap: "var(--s-2)" }}>
                <Btn size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Previous
                </Btn>
                <Btn
                  size="sm"
                  disabled={data.offset + data.leads.length >= data.total || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Btn>
              </span>
            </div>
          </>
        )}

        {!error && !data && (
          <div style={{ padding: "var(--s-4)" }}>
            <div className="stack" style={{ gap: "var(--s-3)" }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bar-track" style={{ height: 16, opacity: 0.35 }} />
              ))}
            </div>
          </div>
        )}
      </Card>

      {user && (
        <p className="muted" style={{ fontSize: "var(--fs-11)", marginTop: "var(--s-3)" }}>
          Signed in as {user.name} · {user.roleLabel}
          {user.perms.length > 0 ? ` · extra access: ${user.perms.join(", ")}` : ""}. Filters and paging
          are done by the server; this screen never filters a subset it happened to download.
        </p>
      )}
    </>
  );
}

function Row({ lead }: { lead: LeadRow }) {
  return (
    <tr>
      <td>
        <div className="cell-main">#{lead.id} · {lead.name}</div>
        <div className="cell-sub">
          {lead.company || lead.location || "—"}
          {!lead.is_read && <span className="pill accent plain" style={{ marginLeft: 8 }}>new</span>}
        </div>
      </td>
      <td>
        <div className="cell-main">{lead.phone ?? "—"}</div>
        <div className="cell-sub">{lead.email ?? "—"}</div>
      </td>
      <td><span className="cell-sub">{lead.source}</span></td>
      <td>{lead.service || "—"}</td>
      <td className="num" style={{ textAlign: "right" }}>{lead.value > 0 ? money(lead.value) : "—"}</td>
      <td>
        <Pill tone={statusTone(lead.stage) as never}>{STAGE_LABEL[lead.stage] ?? lead.stage}</Pill>
      </td>
      <td>
        <div className="cell-main">{lead.last_contact ? timeAgo(lead.last_contact) : "—"}</div>
        <div className="cell-sub">created {timeAgo(lead.created_at)}</div>
      </td>
    </tr>
  );
}
