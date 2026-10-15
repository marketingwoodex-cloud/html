/**
 * LiveDashboard — the overview, fed by `GET /dashboard`.
 *
 * This is the dashboard on live data, not the earlier mock. Two things are deliberately different from
 * the mock version, both of them lessons from the v2.1 audit:
 *
 *   · **Every number is labelled with where it came from.** "Pipeline value" and "quoted value" are
 *     different questions, and v2.1's dashboard added them together in JavaScript. Here the quote
 *     figure is the count of open quotations, and it says so: documents keep their totals inside the
 *     JSON payload until migration 003 promotes them, so a client-side sum would be inventing a
 *     number the server never sent.
 *
 *   · **The attention list is the product.** The four thresholds in `wx_settings` decide what appears
 *     (`attention.*`), the rules come back with the data so the screen can show them, and a failure to
 *     load shows the failure rather than an empty "all clear" — an all-clear that means "we could not
 *     ask" is the most expensive lie a dashboard can tell.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Clock, FileText, Inbox, MessageSquare, RefreshCw, Wallet } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill } from "../components/primitives";
import { Bar } from "../components/primitives";
import { money } from "../lib/format";
import { useLive, type DashboardData } from "../lib/live";
import { useSession } from "../lib/session";

const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", visit: "Visit booked", quote: "Quoted",
  hold: "On hold", won: "Won", lost: "Lost",
};

export function LiveDashboard({ role }: { role: string }) {
  const { data, error, loading, reload } = useLive<DashboardData>("/dashboard", role);
  const { health } = useSession();

  if (error) {
    return (
      <>
        <PageHead title="Today" sub="The overview could not be loaded." />
        <Note tone="warn">
          <AlertTriangle size={14} />
          <div>
            <b>{error.message}</b>
            <div className="mono" style={{ fontSize: "var(--fs-11)", marginTop: 4 }}>{error.detail}</div>
          </div>
        </Note>
        <div className="row" style={{ marginTop: "var(--s-4)" }}>
          <Btn onClick={reload}><RefreshCw size={14} /> Try again</Btn>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHead title="Today" sub={loading ? "Loading…" : "No data yet"} />
        <Card>
          <div className="stack" style={{ gap: "var(--s-3)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bar-track" style={{ height: 14, opacity: 0.4 }} />
            ))}
          </div>
        </Card>
      </>
    );
  }

  const stages = Object.entries(data.leads.byStage).sort((a, b) => b[1].value - a[1].value);
  const maxStage = Math.max(1, ...stages.map(([, v]) => v.value));
  const needsSomeone = data.chats.needs + data.leads.unread + data.bookings.pending;

  return (
    <>
      <PageHead
        title="Today"
        sub={
          needsSomeone > 0
            ? `${needsSomeone} thing${needsSomeone > 1 ? "s" : ""} need attention`
            : "Nothing is waiting on you"
        }
        actions={
          <>
            <Btn onClick={reload} disabled={loading}>
              <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
            </Btn>
            <Link to="/quotes" className="btn primary"><FileText size={15} /> New quotation</Link>
          </>
        }
      />

      {!health?.ready && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <Note tone="warn">
            <AlertTriangle size={14} />
            <span>
              The numbers below came back, but the platform is not fully ready — some widgets may be
              incomplete. Ask an administrator to check the system page.
            </span>
          </Note>
        </div>
      )}

      {data.attention.length > 0 && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <Note tone="warn">
            <AlertTriangle size={14} />
            <div>
              <b>{data.attention.length} things need a person.</b>{" "}
              The rules that put them here are in the list below.
            </div>
          </Note>
        </div>
      )}

      {/* KPI row — always four across, the layout rule from the v2.1 audit. */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "var(--s-4)" }}>
        <Kpi
          icon={<Inbox size={16} />}
          label="Open pipeline"
          value={String(data.leads.open)}
          foot={`${money(data.leads.openValue)} in ${data.leads.open} lead${data.leads.open === 1 ? "" : "s"}`}
          href="/pipeline"
        />
        <Kpi
          icon={<FileText size={16} />}
          label="Quotations out"
          value={String(data.quotes.open)}
          foot={`${data.quotes.total} total · values inside the documents, not summed here`}
          href="/quotes"
        />
        <Kpi
          icon={<MessageSquare size={16} />}
          label="Conversations"
          value={String(data.chats.open)}
          foot={`${data.chats.unread} unread · ${data.chats.needs} need a person`}
          href="/chat"
        />
        <Kpi
          icon={<CalendarClock size={16} />}
          label="Visits"
          value={String(data.bookings.pending)}
          foot={`${data.bookings.today} today · ${data.bookings.pending} waiting to be confirmed`}
          href="/bookings"
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "var(--s-4)", marginTop: "var(--s-4)" }}>
        <Card title="Pipeline by stage" sub="Value of open enquiries, as the server counts them">
          {stages.length === 0 ? (
            <Empty title="No leads yet" sub="Enquiries from the website, WhatsApp and the phone all land here." />
          ) : (
            <div className="bars">
              {stages.map(([stage, v]) => (
                <div className="bar-row" key={stage}>
                  <span className="muted" style={{ fontSize: "var(--fs-12)" }}>{STAGE_LABEL[stage] ?? stage}</span>
                  <Bar
                    value={v.value}
                    max={maxStage}
                    tone={stage === "won" ? "var(--ok)" : stage === "lost" ? "var(--danger)" : undefined}
                  />
                  <span className="num nowrap" style={{ fontSize: "var(--fs-12)" }}>
                    {v.count} · {money(v.value, { compact: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Needs attention" sub="The four rules that decide this list live in settings">
          {data.attention.length === 0 ? (
            <Empty title="Nothing waiting" sub="No stale enquiries, nothing unread, no conversation waiting for a person." />
          ) : (
            <div className="feed">
              {data.attention.map((a, i) => (
                <div className="feed-item" key={`${a.kind}-${a.id ?? i}`}>
                  <span className="feed-dot" />
                  <div className="grow">
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      <b style={{ fontSize: "var(--fs-13)" }}>{a.title}</b>
                      <Pill tone={a.kind === "unread_leads" ? "accent" : a.kind === "chat_help" ? "info" : "warn"} plain>
                        {a.kind.replace(/_/g, " ")}
                      </Pill>
                    </div>
                    <div className="cell-sub">{a.detail}</div>
                  </div>
                  {a.kind === "stale_lead" && a.id && (
                    <Link to="/leads" className="btn sm">Open</Link>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="card-foot muted" style={{ fontSize: "var(--fs-11)" }}>
            <Clock size={12} /> Stale after {data.rules.stale_lead_days} days · quotes expire in{" "}
            {data.rules.quote_expiry_days} days · unpaid after {data.rules.unpaid_days} days
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--s-4)", marginTop: "var(--s-4)" }}>
        <Card title="Money" sub="From the invoices module">
          <div className="row-between">
            <span className="muted">Payments are recorded per invoice</span>
            <Wallet size={15} className="muted" />
          </div>
          <p style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginTop: "var(--s-2)" }}>
            Totals, balances and overdue counts are on the invoices screen, where they are computed from
            the stored receipts — the same figures the client's reminder uses.
          </p>
          <Link to="/invoices" className="btn sm" style={{ marginTop: "var(--s-3)" }}>Open invoices</Link>
        </Card>
        <Card title="What v2.5 cannot show yet" sub="Honest gaps, not silent zeros">
          <ul style={{ fontSize: "var(--fs-12)", color: "var(--text-2)", paddingLeft: "var(--s-5)" }}>
            <li>Quotation values are not summed: the figures live in the document JSON until migration 003.</li>
            <li>The trend charts need a history endpoint, which arrives with the analytics phase.</li>
            <li>Revenue by month is on the invoices screen, from real receipts.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function Kpi({ icon, label, value, foot, href }: { icon: React.ReactNode; label: string; value: string; foot: string; href: string }) {
  return (
    <Link to={href} className="card kpi" style={{ textDecoration: "none" }}>
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot muted">{foot}</div>
    </Link>
  );
}
