/**
 * LiveForms — the website's six forms: where each one is, where its enquiries go, and what it says back.
 *
 * This screen exists because the honest answer here is not a list of numbers. v2.1's Forms screen looked for
 * *its own* markup (`WXForms.send('contact')`, `data-form="…"`) to say which pages carried a form — and this
 * site's pages do not send that: they post their enquiries to Netlify functions, or open the visitor's own
 * mail app. A screen that only checked its own patterns would have shown six forms, a column of zeros, and
 * no reason — which is true and misleading at the same time, the one combination a business owner cannot act
 * on.
 *
 * So two things are said per page, not one: which form is on it, and **where that form sends the enquiry**.
 * A page whose form goes somewhere this console does not receive is labelled as such, by address, and the
 * screen says what that means: the enquiry still reaches the studio, but it will not appear on Leads and no
 * alert from here is sent.
 *
 * Everything else is the house rule: live-only (no API, no invented list), what will change is said before it
 * changes, and a save that the Master has to approve comes back as a pending note rather than a success.
 */
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { isPending, useLive, type FormCfg, type FormRow, type FormSaveResult, type FormsData, type IntakeState, type PendingResult } from "../lib/live";

/** One form's settings. A copy is kept so the fields are editable and the saved answer is what is shown. */
interface Draft extends Record<string, unknown> {
  alertTo: string; waTo: string; waAlert: boolean; reply: boolean; replyText: string;
}

function toDraft(c: FormCfg): Draft {
  return {
    alertTo: c.alertTo ?? "", waTo: c.waTo ?? "",
    waAlert: Boolean(c.waAlert), reply: Boolean(c.reply),
    replyText: c.replyText ?? "",
  };
}

export function LiveForms() {
  const { link, reason } = useSession();
  const live = useLive<FormsData>("/forms");

  if (link !== "live") {
    return (
      <>
        <PageHead title="Forms" sub="Where each form is, and where its enquiries go." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading your site">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. A form list is a claim about the files on your server, so nothing is shown until they can be read.`
            : "Sign in to see which forms are on your site and where they send enquiries."}
        </Note>
      </>
    );
  }
  if (live.loading) {
    return (
      <Card>
        <h2 className="cell-main">Loading…</h2>
        <p className="cell-sub">Reading the pages for forms.</p>
      </Card>
    );
  }
  if (!live.data) {
    return (
      <Note tone="danger" title="The forms could not be read">
        {live.error?.message ?? "The server did not answer."}
      </Note>
    );
  }
  return <FormsBody live={live} />;
}

function FormsBody({ live }: { live: ReturnType<typeof useLive<FormsData>> }) {
  const data = live.data!;
  const away = useMemo(() => (data.scan.pages ?? []).filter((p) => !p.managed), [data]);
  const lands = (data.scan.pages ?? []).length - away.length;

  return (
    <>
      <PageHead
        title="Forms"
        sub="Where each form is, and where its enquiries go."
        actions={
          <Btn icon={<RefreshCw size={15} />} onClick={live.reload}>
            Re-read the pages
          </Btn>
        }
      />

      <Note tone={away.length ? "warn" : "ok"} title={away.length ? `${away.length} page(s) send enquiries somewhere this console does not receive` : "Every form on the site reports to this console"}>
        {away.length ? (
          <>
            Nothing is lost from the website — those enquiries still reach the studio exactly as they do today. But they
            will not appear on Leads, and the alerts below are not what sends them. {lands} page(s) post to a form this
            console receives.
          </>
        ) : (
          "Each form found on the site posts to an address whose enquiries land on the Leads screen."
        )}
      </Note>

      {data.intake ? <IntakeCard intake={data.intake} /> : null}

      <div className="grid-2">
        {data.forms.map((f) => (
          <FormCard key={f.id} form={f} onSaved={live.reload} />
        ))}
      </div>

      <Card>
        <h2 className="cell-main">Every page with a form</h2>
        <p className="cell-sub">
          Read from the pages themselves. The address is the one the page actually posts to — which is why this
          table cannot disagree with the site.
        </p>
        {!data.scan.pages?.length ? (
          <Empty title="No forms found" sub="No page on this site carries a form this console can see." />
        ) : (
          <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Page</th>
                <th>Form</th>
                <th>Enquiry goes to</th>
              </tr>
            </thead>
            <tbody>
              {data.scan.pages.map((p) => (
                <tr key={p.rel}>
                  <td className="cell-main">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.url}
                    </a>
                  </td>
                  <td>{p.formLabels?.length ? p.formLabels.join(", ") : <span className="muted">none this console names</span>}</td>
                  <td>
                    <div className="row">
                      <span>{p.landsLabel}</span>
                      {p.managed ? (
                        <Pill tone="ok">reaches this console</Pill>
                      ) : (
                        <Pill tone="warn">does not reach this console</Pill>
                      )}
                    </div>
                    {p.endpoints?.length ? <span className="cell-sub mono">{p.endpoints.join("  ")}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * Enquiry delivery — plan §5.1's "no silent loss", on a screen.
 *
 * The website records what happened after each enquiry was saved: did the team alert go out, did the
 * visitor get their reply, did the Sheets row arrive — and the failures with their reasons. This card reads
 * that log. A failed alert is a red fact here instead of a line in an error log nobody opens.
 */
export function IntakeCard({ intake }: { intake: IntakeState }) {
  const channels: Array<[string, string]> = [
    ["alert", "Team alert (email / WhatsApp / Telegram)"],
    ["reply", "Visitor auto-reply"],
    ["sheets", "Google Sheets push"],
  ];
  return (
    <Card>
      <h2 className="cell-main">Enquiry delivery</h2>
      <p className="cell-sub">
        What happened after each enquiry was saved — written by the website as the enquiries arrive, read here
        as it is. Last 30 days are the counts on each form below; these are the deliveries.
      </p>
      {intake.empty ? (
        <Empty title="Nothing recorded yet" sub="The log starts when the first enquiry arrives through a form on the site." />
      ) : (
        <>
          <div className="chip-row">
            <Pill tone="neutral">{`${intake.counts.total} recorded`}</Pill>
            <Pill tone="neutral">{`${intake.counts.duplicates} duplicate${intake.counts.duplicates === 1 ? "" : "s"} stopped`}</Pill>
            <Pill tone="neutral">{`${intake.counts.bots} honeypot${intake.counts.bots === 1 ? "" : "s"}`}</Pill>
            {intake.counts.unverified ? (
              <Pill tone="warn">{`${intake.counts.unverified} accepted without the spam check`}</Pill>
            ) : null}
            {intake.today.date ? (
              <Pill tone="neutral">
                {`today: ${intake.today.total} · ${intake.today.duplicates} duplicate${intake.today.duplicates === 1 ? "" : "s"}`}
              </Pill>
            ) : null}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Last outcome</th>
                </tr>
              </thead>
              <tbody>
                {channels.map(([key, label]) => {
                  const last = intake.last[key];
                  return (
                    <tr key={key}>
                      <td className="cell-main">{label}</td>
                      <td>
                        {last ? (
                          <div className="row">
                            <Pill tone={last.ok ? "ok" : "danger"}>{last.ok ? "delivered" : "failed"}</Pill>
                            <span className="cell-sub mono">
                              {last.at}
                              {last.detail ? ` · ${last.detail}` : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="muted">nothing sent yet through this channel</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {intake.fails.length ? (
            <Note tone="danger" title={`Delivery failure${intake.fails.length === 1 ? "" : "s"} on record`}>
              {intake.fails.slice(0, 5).map((f) => (
                <div key={`${f.at}-${f.kind}-${f.id}`} className="mono">
                  {f.at} · {f.kind}: {f.detail}
                </div>
              ))}
            </Note>
          ) : (
            <Note tone="ok" title="No delivery failures on record">
              Every alert, reply and Sheets push that was attempted has arrived.
            </Note>
          )}
        </>
      )}
    </Card>
  );
}

export function FormCard({ form, onSaved }: { form: FormRow; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(form.cfg));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  useEffect(() => {
    setDraft(toDraft(form.cfg));
    setNote(null);
    setBad(null);
  }, [form.cfg]);

  async function save() {
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      const r = await api.post<FormSaveResult | PendingResult>("/forms", { forms: { [form.id]: draft } });
      if (isPending(r)) setNote(r.message);
      else setNote("Saved — this form now alerts to the addresses above.");
      onSaved();
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="row-between">
        <h2 className="cell-main">{form.label}</h2>
        <Pill tone={form.total ? "ok" : "neutral"}>{form.total} enquir{form.total === 1 ? "y" : "ies"}</Pill>
      </div>
      <p className="cell-sub">
        {form.id} · {form.month} in the last 30 days ·{" "}
        {form.last ? `last received ${form.last}` : "nothing has arrived through this id"}
      </p>

      {form.note ? <Note tone="info">{form.note}</Note> : null}

      <div className="stack-tight">
        <span className="field-label">On these pages</span>
        {form.pages.length ? (
          <div className="chip-row">
            {form.pages.map((p) => (
              <a key={p} className="chip" href={p} target="_blank" rel="noreferrer">
                {p}
              </a>
            ))}
          </div>
        ) : (
          <p className="cell-sub">
            {form.note ? "Not carried by any page — it is loaded by the site's own script." : "No page on this site carries this form yet."}
          </p>
        )}
      </div>

      {form.leadPages?.length ? (
        <div className="stack-tight">
          <span className="field-label">Enquiries arrived from</span>
          <p className="cell-sub mono">
            {form.leadPages.map((p) => `${p.page || "(no page recorded)"} · ${p.n}`).join("  ·  ")}
          </p>
        </div>
      ) : null}

      <div className="stack-tight">
        <span className="field-label">Fields seen on this form</span>
        <p className="cell-sub mono">{form.fields.join(" · ")}</p>
      </div>

      <div className="grid-2">
        <label className="stack">
          <span className="field-label">Alert these addresses</span>
          <input
            className="input"
            value={draft.alertTo}
            placeholder="info@woodex.com.pk, sales@woodex.com.pk"
            onChange={(e) => setDraft({ ...draft, alertTo: e.target.value })}
          />
        </label>
        <label className="stack">
          <span className="field-label">WhatsApp alert to</span>
          <input
            className="input"
            value={draft.waTo}
            placeholder="923224000768"
            onChange={(e) => setDraft({ ...draft, waTo: e.target.value })}
          />
        </label>
      </div>

      <div className="row">
        <Switch checked={draft.waAlert} onChange={(v) => setDraft({ ...draft, waAlert: v })} label="WhatsApp alert" />
        <Switch checked={draft.reply} onChange={(v) => setDraft({ ...draft, reply: v })} label="Send an auto-reply" />
      </div>

      <label className="stack">
        <span className="field-label">What the visitor is told back</span>
        <textarea
          className="input"
          rows={3}
          value={draft.replyText}
          placeholder="Thanks — we have your enquiry and will call you back within one working day."
          onChange={(e) => setDraft({ ...draft, replyText: e.target.value })}
        />
      </label>

      {form.cfg.alertTo ? (
        <p className="cell-sub">Saved alerts go to {form.cfg.alertTo}.</p>
      ) : (
        <p className="cell-sub">No alert address saved — nothing is emailed when this form is sent.</p>
      )}

      {bad ? (
        <Note tone="danger" title="Not saved">
          {bad.message} <span className="mono">{bad.detail}</span>
        </Note>
      ) : null}
      {note ? <Note tone="ok">{note}</Note> : null}

      <div className="row">
        <Btn variant="primary" icon={<Save size={15} />} disabled={busy} onClick={save}>
          {busy ? "Saving…" : `Save ${form.label.toLowerCase()}`}
        </Btn>
        <span className="cell-sub">
          {form.cfg.alertTo === draft.alertTo && form.cfg.waTo === draft.waTo && form.cfg.replyText === draft.replyText && form.cfg.waAlert === draft.waAlert && form.cfg.reply === draft.reply
            ? "Nothing changed yet."
            : "A change here waits for the Master if your role queues."}
        </span>
      </div>
    </Card>
  );
}
