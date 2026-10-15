/**
 * LiveUpdates — what the client is told, on which channel, and the record of what went out.
 *
 * The screen is built around one sentence it refuses to hide: **v2.5 cannot send a WhatsApp or e-mail yet.**
 * v2.1's sender is still the live one; the plan moves the channels in Phase 4 with the WhatsApp suite, so this
 * console records what should go and shares it on the client's own page (which needs no transport at all).
 * Every message here ends with the link to that page — `/api/v2/client/project/{id}?t=…` — an HMAC of the
 * project's id and number, the same construction the quotation link has always used.
 *
 * So the three states a channel can be in are three different sentences, not one tick:
 *
 *   · **set up** — the credentials are on the file (WhatsApp token and phone id, or the mail sender), and the
 *     log will say `no transport yet`, because that part of the plan is not built;
 *   · **not configured** — nothing is connected, which is a task on the Connect screen;
 *   · **off** — the switch for that event is off, and nothing is recorded at all.
 *
 * The wording is v2.1's, verbatim, in both languages: seven events, each with the text a Pakistani client
 * actually receives (English and Urdu in one message) and a subject for the e-mail. Editing a body restores
 * the shipped wording when the box is emptied, because a template with no text is a message nobody can read.
 */
import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Btn, Card, Empty, Input, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { isPending, useLive, type NotifyCfg, type NotifyData, type NotifyEvent, type PendingResult } from "../lib/live";

/** One event, editable. A copy is kept so a field can be typed in and the answer that comes back is what is shown. */
interface Draft {
  on: boolean;
  subject: string;
  text: string;
}

function toDraft(c: NotifyCfg, id: string): Draft {
  const e = c.ev?.[id];
  return { on: Boolean(e?.on), subject: e?.subject ?? "", text: e?.text ?? "" };
}

export function LiveUpdates() {
  const { link, reason } = useSession();
  const live = useLive<NotifyData>("/notifications");

  if (link !== "live") {
    return (
      <>
        <PageHead title="Client updates" sub="What your clients are told, and where it is on the file." />
        <Note tone={link === "offline" ? "danger" : "info"} title="Not reading the settings">
          {link === "offline"
            ? `api/v2 is not answering${reason ? ` (${reason})` : ""}. The wording and the log are on the server, so nothing is shown until they can be read.`
            : "Sign in to see what your clients are told and what the log recorded."}
        </Note>
      </>
    );
  }
  if (live.loading) {
    return (
      <Card>
        <h2 className="cell-main">Loading…</h2>
        <p className="cell-sub">Reading the notification settings and the log.</p>
      </Card>
    );
  }
  if (!live.data) {
    return (
      <Note tone="danger" title="The settings could not be read">
        {live.error?.message ?? "The server did not answer."}
      </Note>
    );
  }
  return <UpdatesBody live={live} />;
}

function UpdatesBody({ live }: { live: ReturnType<typeof useLive<NotifyData>> }) {
  const data = live.data!;
  const t = data.transport;
  const events = Object.entries(data.events ?? {}) as [string, string][];

  return (
    <>
      <PageHead
        title="Client updates"
        sub="Seven events, the wording for each, and the log of what was recorded."
        actions={
          <Btn icon={<RefreshCw size={15} />} onClick={live.reload}>
            Re-read
          </Btn>
        }
      />

      <Note tone={t?.ready ? "ok" : "warn"} title={t?.ready ? "Sending from this console" : "Nothing has left by WhatsApp or e-mail yet"}>
        {t?.ready ? (
          "Messages are carried by this console."
        ) : (
          <>
            This console <b>records</b> what should go to a client and <b>shares</b> it on the client’s own page,
            which needs no transport at all — every progress message it composes ends with that link. The sending
            itself is v2.1’s, still live on the same server, and moves over in <b>Phase 4</b> with the WhatsApp
            suite. Until then a log row reading <span className="mono">no transport yet</span> means exactly
            that: recorded, not sent. Nothing is marked “the client has been told” until a message really leaves,
            so nothing is lost when the channels are connected.
          </>
        )}
      </Note>

      <Channels live={live} />

      <h2 className="side-h" style={{ marginTop: 18 }}>
        The seven events
      </h2>
      <p className="cell-sub">
        Two of these lists are not the same list, and the difference is worth saying out loud: the wording is
        all seven, while{" "}
        <b>
          {t?.wired?.length === 1 ? "one event is" : `${t?.wired?.length ?? 0} events are`} composed here today
        </b>{" "}
        — the project progress ones. A lead, a quotation, a booking and a reminder are still sent by v2.1’s
        screens, which have not moved yet, so their wording is kept ready rather than claimed. Each card says
        which it is.
      </p>
      <div className="grid-2">
        {events.map(([id, label]) => (
          <EventCard key={id} id={id} label={label} live={live} />
        ))}
      </div>

      <Card>
        <h2 className="cell-main">What the log recorded</h2>
        <p className="cell-sub">
          One row per attempt, with the channel and the result as it happened. This is the record v2.1 kept and
          the reason a studio can answer “were they told?” without guessing.
        </p>
        {!data.log.length ? (
          <Empty title="Nothing recorded yet" sub="No message has been recorded against any event — which is what a fresh install looks like." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Client</th>
                  <th>Channel</th>
                  <th>To</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-sub">{r.t}</td>
                    <td className="cell-main">{data.events[r.event] ?? r.event}</td>
                    <td>
                      {r.name || "—"}
                      {r.ref ? <span className="cell-sub">{r.ref}</span> : null}
                    </td>
                    <td>{r.channel}</td>
                    <td className="mono">{r.dest}</td>
                    <td>
                      <Pill tone={r.result === "sent" ? "ok" : r.result === "not configured" ? "warn" : "neutral"}>{r.result}</Pill>
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

/** One event: the switch, the subject, the bilingual body, and the test that proves the wording. */
function EventCard({ id, label, live }: { id: string; label: string; live: ReturnType<typeof useLive<NotifyData>> }) {
  const data = live.data!;
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.cfg, id));
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [to, setTo] = useState({ phone: "", email: "" });
  const [tested, setTested] = useState<string>("");

  async function save() {
    setBusy(true);
    setBad(null);
    setSaved("");
    try {
      const cfg = {
        ev: { [id]: { on: draft.on, subject: draft.subject, text: draft.text } },
      };
      const r = await api.post<{ cfg: NotifyCfg } | PendingResult>(`/notifications/settings`, { cfg });
      setSaved(isPending(r) ? r.message || "Waiting for the Master's approval — the wording is unchanged until then." : "Saved. The next message uses this wording.");
      live.reload();
    } catch (e) {
      setBad(e instanceof ApiFailure ? e : new ApiFailure({ code: "INTERNAL", message: String(e) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setBad(null);
    setTested("");
    try {
      const r = await api.post<{ result: Record<string, string> } | PendingResult>(`/notifications/test`, {
        event: id,
        phone: to.phone,
        email: to.email,
      });
      if (isPending(r)) {
        setTested(r.message || "Waiting for the Master's approval before a test message goes out.");
      } else {
        const parts = Object.entries(r.result ?? {});
        setTested(parts.length ? parts.map(([k, v]) => `${k}: ${v}`).join(" · ") : "Nothing to send to — enter a phone number or an address.");
        live.reload();
      }
    } catch (e) {
      setBad(e instanceof ApiFailure ? e : new ApiFailure({ code: "INTERNAL", message: String(e) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  const e: NotifyEvent | undefined = data.cfg.ev?.[id];

  return (
    <Card>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 className="cell-main">{label}</h2>
          <span className="cell-sub mono">{id}</span>
          <div className="row" style={{ marginTop: 4 }}>
            {data.transport.wired?.includes(id) ? (
              <Pill tone="ok">sent from this console today</Pill>
            ) : (
              <Pill tone="neutral">still v2.1’s, wording kept ready</Pill>
            )}
          </div>
        </div>
        <Switch label={label} checked={draft.on} onChange={(v) => setDraft({ ...draft, on: v })} />
      </div>

      <label className="cell-sub" htmlFor={`sub-${id}`}>
        Subject (e-mail)
      </label>
      <Input id={`sub-${id}`} value={draft.subject} onChange={(ev2) => setDraft({ ...draft, subject: ev2.target.value })} />

      <label className="cell-sub" htmlFor={`txt-${id}`}>
        The message
      </label>
      <textarea
        id={`txt-${id}`}
        className="input"
        rows={7}
        value={draft.text}
        onChange={(ev2) => setDraft({ ...draft, text: ev2.target.value })}
      />
      <p className="cell-sub">
        Placeholders a message fills in itself: <span className="mono">{"{name} {company} {phone} {ref} {project} {link} {stage}"}</span>.{" "}
        {e?.textNoPhotos ? (
          <>
            <br />
            A progress message that has no site photos yet uses the sentence that points at the client’s page
            instead — so no message ever arrives with an empty line where a link belongs.
          </>
        ) : null}
        <br />
        Emptying the box restores the wording the studio ships, rather than sending a client a blank message.
      </p>

      <div className="row">
        <Input placeholder="Test phone (03xx…)" value={to.phone} onChange={(ev2) => setTo({ ...to, phone: ev2.target.value })} />
        <Input placeholder="Test e-mail" value={to.email} onChange={(ev2) => setTo({ ...to, email: ev2.target.value })} />
        <Btn icon={<Send size={15} />} disabled={busy} onClick={sendTest}>
          Send a test
        </Btn>
      </div>

      {tested ? <p className="cell-sub">{tested}</p> : null}
      {saved ? <Note tone="ok">{saved}</Note> : null}
      {bad ? <Note tone="danger">{bad.message}</Note> : null}

      <div className="row">
        <Btn variant="primary" disabled={busy} onClick={save}>
          Save this wording
        </Btn>
        <Btn disabled={busy || (e?.on === draft.on && e?.text === draft.text && e?.subject === draft.subject)} onClick={() => setDraft(toDraft(data.cfg, id))}>
          Undo my edits
        </Btn>
      </div>
    </Card>
  );
}

/**
 * The channels: two switches, the language, and what is actually set up — saved together.
 *
 * The switches are a draft and the button saves them, because a channel turned on here changes what the
 * studio tells its clients and a Master may have to approve that. A switch that saved on the spot would be
 * that change happening without anyone saying so.
 */
function Channels({ live }: { live: ReturnType<typeof useLive<NotifyData>> }) {
  const data = live.data!;
  const [wa, setWa] = useState(Boolean(data.cfg.wa));
  const [email, setEmail] = useState(Boolean(data.cfg.email));
  const [lang, setLang] = useState<"en" | "ur">(data.cfg.waLang === "ur" ? "ur" : "en");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState<string>("");

  async function save() {
    setBusy(true);
    setMsg("");
    setBad("");
    try {
      const r = await api.post<{ cfg: unknown } | PendingResult>("/notifications/settings", { cfg: { wa, email, waLang: lang } });
      setMsg(isPending(r) ? r.message || "Waiting for the Master’s approval — the channels are unchanged until then." : "Saved.");
      if (!isPending(r)) live.reload();
    } catch (e) {
      setBad(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dirty = wa !== Boolean(data.cfg.wa) || email !== Boolean(data.cfg.email) || lang !== (data.cfg.waLang === "ur" ? "ur" : "en");

  return (
    <Card>
      <h2 className="cell-main">Channels</h2>
      <p className="cell-sub">
        Which channels a message is recorded for. A channel that is switched on but not connected still writes a log
        row — <span className="mono">not configured</span> — because “we meant to tell them and could not” is a fact
        worth keeping.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Switched</th>
              <th>Set up</th>
              <th>What a send would do today</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="cell-main">WhatsApp</td>
              <td>
                <Switch label="WhatsApp" checked={wa} onChange={setWa} />
              </td>
              <td>
                {data.ready.whatsapp ? <Pill tone="ok">token and phone id on file</Pill> : <Pill tone="warn">not connected</Pill>}
              </td>
              <td className="cell-sub">
                {data.ready.whatsapp ? "Recorded; sent by v2.1 until Phase 4." : "Not connected — set the token and phone id on the Connect screen."}
              </td>
            </tr>
            <tr>
              <td className="cell-main">E-mail</td>
              <td>
                <Switch label="E-mail" checked={email} onChange={setEmail} />
              </td>
              <td>{data.ready.email ? <Pill tone="ok">sender address on file</Pill> : <Pill tone="warn">not connected</Pill>}</td>
              <td className="cell-sub">
                {data.ready.email ? "Recorded; sent by v2.1 until Phase 4." : "Not connected — set the mail sender in Settings → Integrations."}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <span className="cell-sub">WhatsApp template language</span>
        <Seg
          value={lang}
          onChange={setLang}
          options={[
            { id: "en", label: "English" },
            { id: "ur", label: "Urdu" },
          ]}
        />
        <Btn variant="primary" disabled={busy || !dirty} onClick={save}>
          Save channels
        </Btn>
        {msg ? <span className="cell-sub">{msg}</span> : null}
        {bad ? <span className="cell-sub cell-danger">{bad}</span> : null}
      </div>
      <p className="cell-sub">
        The template language only matters when an approved WhatsApp template is named for an event. The default
        wording carries English and Urdu in one message, which is what the studio sends today.
      </p>
    </Card>
  );
}
