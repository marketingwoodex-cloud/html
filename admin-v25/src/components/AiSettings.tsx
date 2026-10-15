/**
 * AiSettings — the studio's AI settings: four providers, their keys and models, and the writing voice every
 * prompt is wrapped in.
 *
 * The panel is small because the API does the thinking. This screen never decides whether a key is valid,
 * never filters a model list, never builds a request and — the part that matters — never sees a key. What it
 * does is the one thing a form has to do honestly:
 *
 *   · it reports what is stored as **Set** or empty, rather than an empty field that reads like a lost key;
 *   · it keeps a key it was not told about (an ordinary save sends no key fields at all), and offers an
 *     explicit **Clear** for the one somebody wants gone — so deleting a key is a thing you do, not a thing
 *     that happens when you fix a typo in the voice;
 *   · it passes a refusal through in the API's own words ("Enter the API key first", "This server has no
 *     cURL extension") instead of a friendlier sentence that hides which of the two it is.
 *
 * Who may open it: the owner and admins, as v2.1 asked. An editor sees one line saying so — a form that
 * cannot save anything is worse than no form, because it looks like a permission problem.
 */
import { useState } from "react";
import { Eye, FlaskConical, Save, Trash2 } from "lucide-react";
import { Btn, Card, Input, Note, Pill, Seg } from "./primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { isPending, useLive, type AiModels, type AiState, type PendingResult } from "../lib/live";

/** The four key fields, and which provider each belongs to. */
const KEY_FIELD: Record<string, string> = {
  anthropic: "anthropicKey",
  openai: "openaiKey",
  openrouter: "openrouterKey",
  custom: "customKey",
};

export function AiSettings() {
  const { link, reason, user } = useSession();
  const canEdit = user?.role === "owner" || user?.role === "admin";
  const read = useLive<AiState>(canEdit ? "/ai/settings" : null);

  /** Only what a person changed: a field that is absent means "leave what is stored". */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [clears, setClears] = useState<Record<string, boolean>>({});
  const [list, setList] = useState<AiModels | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [tested, setTested] = useState<string | null>(null);

  const data = read.data;
  const ai = data?.ai;
  const provider = draft.provider ?? ai?.provider ?? "anthropic";
  const value = (key: string, stored: string): string => draft[key] ?? stored;
  const set = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }));

  /* An editor or a sales account: say who can, in one line, instead of showing a form that will not save. */
  if (!canEdit) {
    return (
      <Card>
        <div className="row-between">
          <span className="field-label">AI settings</span>
          <Pill tone="neutral">owner &amp; admins</Pill>
        </div>
        <Note tone="info" title="The owner's and the admins'">
          {user ? `${user.name} is signed in as ${user.roleLabel}. ` : "You are not signed in. "}
          The provider keys are the company's secrets and listing a provider's models is a call that costs
          money, so v2.1 asked for the owner or an admin here — and so does this console.
        </Note>
      </Card>
    );
  }

  /* Three states, and the order matters: "there is no API to ask" is not "the answer was empty". */
  if (!data && read.error) {
    return <Note tone="danger" title="The AI settings could not be read">{read.error.message}</Note>;
  }
  if (!data && (link !== "live" || read.loading)) {
    return (
      <Note tone={link === "live" ? "info" : "warn"} title={link === "live" ? "Reading…" : "Not connected"}>
        {link === "live"
          ? "Asking the server for the AI settings."
          : link === "offline"
            ? "api/v2 is not answering, so the keys and models cannot be read or changed from here."
            : "Sign in to change the AI settings."}
        {link !== "live" && reason ? ` — ${reason}` : ""}
      </Note>
    );
  }
  if (!ai || !data) {
    return <Note tone="warn" title="No AI record in the answer">The endpoint replied without the settings, which is a bug rather than an empty configuration.</Note>;
  }

  const keyField = KEY_FIELD[provider] ?? "anthropicKey";
  const keySet = Boolean(ai[`${keyField}Set` as keyof typeof ai]);

  /** Save: the fields that changed, plus an explicit Clear for each key somebody asked to erase. */
  async function save() {
    setBusy("save");
    setBad(null);
    setNote(null);
    try {
      const sent: Record<string, string | boolean> = { ...draft };
      for (const [k, on] of Object.entries(clears)) {
        if (on) sent[`${k}Clear`] = true;
      }
      const r = await api.post<AiState | PendingResult>("/ai/settings", { ai: sent });
      if (isPending(r)) {
        setNote(r.message);
      } else {
        const changed = (r as AiState).changed ?? [];
        setDraft({});
        setClears({});
        setNote(
          changed.length
            ? `Saved: ${changed.map((c) => c.replace(/Clear$/, "")).join(", ")}. v2.1's own file was updated in place, so both admins read the same settings.`
            : "Saved. Nothing had changed, so nothing was written.",
        );
        read.reload();
      }
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy("");
    }
  }

  /** List the provider's models. `key` is passed when one has just been typed, so it can be tried first. */
  async function fetchModels() {
    setBusy("models");
    setBad(null);
    setTested(null);
    try {
      const r = await api.post<AiModels>("/ai/models", {
        provider,
        key: draft[keyField] ?? "",
        url: draft.customUrl ?? "",
      });
      setList(r);
      setNote(`${r.models.length} model${r.models.length === 1 ? "" : "s"} from the provider. The suggested one is ${r.recommended}.`);
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy("");
    }
  }

  /** One small request: proof the key works before anybody writes an article with it. */
  async function test() {
    setBusy("test");
    setBad(null);
    setNote(null);
    try {
      const r = await api.post<{ provider: string; text: string }>("/ai/test", {});
      setTested(`The provider answered: “${r.text}”`);
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy("");
    }
  }

  const canCall = data.server.curl && Boolean(ai.ready);

  return (
    <Card>
      <div className="row-between">
        <div className="stack">
          <span className="field-label">AI settings</span>
          <span className="cell-sub">
            The writing help's provider and voice. Stored in the same file v2.1 uses, so the old admin keeps working.
          </span>
        </div>
        <Pill tone={ai.ready ? "ok" : "warn"}>{ai.ready ? "Configured" : "No key yet"}</Pill>
      </div>

      {/* Two facts the screen cannot work out for itself, said once, above the fields they affect. */}
      {!data.server.curl && (
        <Note tone="warn" title="This server cannot make the call">
          PHP here has no cURL extension, so nothing can be sent to a provider — the settings can still be saved,
          and the writing help will say the same thing when it is used.
        </Note>
      )}
      {data.server.curl && !data.server.cafile && (
        <Note tone="info" title="No CA bundle beside the API">
          `api/cacert.pem` was not found, so HTTPS calls will use the server's own certificate store. If a call
          fails with a certificate error, that is where to look.
        </Note>
      )}

      <div className="stack" style={{ marginTop: 14 }}>
        <label className="stack">
          <span className="field-label">Provider</span>
          <Seg
            options={data.providers.map((p) => ({ id: p.id, label: p.label }))}
            value={provider}
            onChange={(id) => {
              set("provider", id);
              setList(null);
              setTested(null);
            }}
          />
        </label>

        <label className="stack">
          <span className="field-label">
            {`API key — ${keySet ? "Set" : "empty"}${clears[keyField] ? " · will be erased" : ""}`}
          </span>
          <Input
            type="password"
            autoComplete="off"
            value={value(keyField, "")}
            placeholder={keySet ? "Set — leave empty to keep it" : "Paste the key for this provider"}
            onChange={(e) => set(keyField, e.target.value)}
          />
          <span className="cell-sub">
            A key is never sent back to this browser: the server reports only whether one is stored. Leaving the
            field empty keeps whatever is there.
          </span>
        </label>

        {keySet && (
          <div className="row-between">
            <span className="cell-sub">Erase the stored key for this provider.</span>
            <Btn
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={() => setClears((c) => ({ ...c, [keyField]: !c[keyField] }))}
            >
              {clears[keyField] ? "Keep it after all" : "Clear the key"}
            </Btn>
          </div>
        )}

        {provider === "custom" && (
          <label className="stack">
            <span className="field-label">Endpoint URL</span>
            <Input
              value={value("customUrl", ai.customUrl)}
              placeholder="https://your-tunnel.example.com/v1"
              onChange={(e) => set("customUrl", e.target.value)}
            />
            <span className="cell-sub">
              A local or self-hosted endpoint needs an address, not a key — anything not starting with
              <span className="mono"> https://</span> is refused by field.
            </span>
          </label>
        )}

        <label className="stack">
          <span className="field-label">Model</span>
          {list ? (
            <select
              className="input"
              value={value(`${provider}Model`, ai[`${provider}Model` as keyof typeof ai] as string)}
              onChange={(e) => set(`${provider}Model`, e.target.value)}
            >
              {list.models.map((m) => (
                <option key={m} value={m}>
                  {m === list.recommended ? `${m} — suggested` : m}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={value(`${provider}Model`, ai[`${provider}Model` as keyof typeof ai] as string)}
              placeholder="List the models, or type one"
              onChange={(e) => set(`${provider}Model`, e.target.value)}
            />
          )}
          <span className="cell-sub">
            The list comes from the provider, filtered to the models that can write — embeddings, transcription,
            audio and image models are not offered, and OpenAI's list is cut to the chat families.
          </span>
        </label>

        <label className="stack">
          <span className="field-label">{`Writing voice — ${value("voice", ai.voice).length} of ${data.limits.voice} characters`}</span>
          <textarea
            className="input"
            rows={4}
            maxLength={data.limits.voice}
            value={value("voice", ai.voice)}
            onChange={(e) => set("voice", e.target.value)}
          />
          <span className="cell-sub">
            Prepended to every prompt: how the studio writes, not what a particular article says.
          </span>
        </label>

        {note && <Note tone="ok" title="Saved">{note}</Note>}
        {tested && <Note tone="ok" title="The key works">{tested}</Note>}
        {bad && <Note tone="danger" title="The server refused it">{bad.message}</Note>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn icon={<Save size={14} />} onClick={save} disabled={busy !== ""}>
              {busy === "save" ? "Saving…" : "Save the settings"}
            </Btn>
            <Btn icon={<Eye size={14} />} onClick={fetchModels} disabled={busy !== "" || (provider !== "custom" && !keySet && !draft[keyField])}>
              {busy === "models" ? "Asking…" : "List models"}
            </Btn>
            <Btn
              icon={<FlaskConical size={14} />}
              onClick={test}
              disabled={busy !== "" || !canCall}
              title={canCall ? "One small request, to prove the key works" : "Add a key (and cURL on the server) first"}
            >
              {busy === "test" ? "Testing…" : "Test the key"}
            </Btn>
        </div>

        <span className="cell-sub">
          {data.file} · {data.exists ? "saved once already" : "nothing saved yet"}
          {" · "}
          {data.server.curl ? "cURL is available on this server" : "no cURL on this server"}
          {" · "}
          v2.1's admin reads and writes this same record.
        </span>
      </div>
    </Card>
  );
}
