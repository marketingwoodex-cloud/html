/**
 * LiveSiteTheme — the site's theme: the values every page is drawn from, and the file they live in.
 *
 * v2.1's builder had this screen and it wrote `assets/theme.css`. This site has no such file — the pages
 * load `/assets/site.css` and nothing else — so the port writes a marked block into that stylesheet. Two
 * consequences are visible here on purpose:
 *
 *   • the panel shows **what the stylesheet is using**, not only what somebody last chose. `_private/theme.json`
 *     and the CSS can disagree (a hand edit, a restored backup, the v2.1 builder running during the
 *     cut-over), and a screen that showed only the saved choice would be confidently wrong about the site;
 *   • the settings the theme does *not* cover are listed at the bottom. They are the greys, the two radii
 *     and the easing curve the whole design is built on — structure rather than choice — and saying so is
 *     better than leaving somebody to wonder why the borders did not move.
 *
 * Saving sends the whole set, not a patch: a set of values is the thing being saved, and a request that
 * only mentions the navy cannot say whether the rest were kept or forgotten. The `mtime` sent with it is
 * what makes two people editing one stylesheet a refusal instead of a silent overwrite.
 */
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, Save, Undo2 } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type PendingResult, type ThemeRollback, type ThemeSave, type ThemeState, type ThemeToken,
} from "../lib/live";
import { bytes, timeAgo } from "../lib/format";

export function LiveSiteTheme() {
  const { link } = useSession();
  const live = useLive<ThemeState>("/theme");

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");
  const [mtime, setMtime] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [conflict, setConflict] = useState(false);
  const [arming, setArming] = useState(false);

  /* Seed the form from the stylesheet, falling back to the saved record. `live || chosen` is the whole
     drift story in one expression: the file is what the site is serving, so it wins. */
  useEffect(() => {
    if (!live.data) {
      return;
    }
    const seed: Record<string, string> = {};
    for (const t of live.data.tokens) {
      seed[t.name] = t.live || t.chosen || "";
    }
    setDraft(seed);
    setMtime(live.data.meta?.mtimeEpoch ?? null);
    setMessage(null);
    setBad(null);
    setConflict(false);
    setArming(false);
  }, [live.data]);

  const groups = useMemo(() => groupTokens(live.data?.tokens ?? []), [live.data]);
  const changed = useMemo(() => {
    if (!draft || !live.data) {
      return false;
    }
    return live.data.tokens.some((t) => draft[t.name] !== (t.live || t.chosen || ""));
  }, [draft, live.data]);

  function set(name: string, value: string) {
    setDraft((d) => (d === null ? d : { ...d, [name]: value }));
  }

  /** Save the set. `force` is the second press after the API refused a stale form. */
  async function save(force: boolean) {
    if (!draft) {
      return;
    }
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v.trim() !== "") {
        vars[k] = v.trim();
      }
    }
    setBusy(true);
    setBad(null);
    setMessage(null);
    try {
      const r = await api.post<ThemeSave | PendingResult>("/theme", {
        vars,
        note,
        mtime,
        force,
      });
      if (isPending(r)) {
        setMessage(r.message);
      } else if ("changed" in r) {
        setMessage(
          r.changed
            ? `Saved${r.version ? ` · version #${r.version}` : ""} · the stylesheet is ${bytes(r.bytes)}`
            : "Nothing changed — the stylesheet already says exactly this.",
        );
      }
      setConflict(false);
      live.reload();
    } catch (err) {
      if (err instanceof ApiFailure && err.code === "CONFLICT") {
        setConflict(true);
        setBad(err);
      } else {
        setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore(version: number) {
    setBusy(true);
    setBad(null);
    setMessage(null);
    try {
      const r = await api.post<ThemeRollback | PendingResult>("/theme/rollback", { version });
      if (isPending(r)) {
        setMessage(r.message);
      } else if ("rolledBackTo" in r) {
        setMessage(`Put version #${r.rolledBackTo} back — saved as #${r.saved}, so the undo can be undone too.`);
      }
      live.reload();
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  if (link !== "live") {
    return (
      <>
        <PageHead title="Site theme" sub="The colours, type and spacing every page is drawn from" />
        <Note tone="warn" title="Not connected">
          The theme is a file on the site (<code>assets/site.css</code>). Without the API this screen cannot
          read it or write it — there is nothing here to show and nothing to save.
        </Note>
      </>
    );
  }

  const data = live.data;

  return (
    <>
      <PageHead
        title="Site theme"
        sub="The colours, type and spacing every page is drawn from"
        actions={
          <Btn icon={<RefreshCw size={15} />} onClick={live.reload} disabled={live.loading}>
            Refresh
          </Btn>
        }
      />

      {live.loading && data === null ? <Note tone="info" title="Reading the stylesheet…">One moment.</Note> : null}
      {live.error ? (
        <Note tone="danger" title="The theme could not be read">
          {live.error.message}
        </Note>
      ) : null}
      {data && !data.exists ? (
        <Note tone="danger" title="The stylesheet is missing">
          There is no <code>{data.file}</code> on the site. The theme is written into that file, so it has to
          exist before anything here can be saved.
        </Note>
      ) : null}

      {data && data.exists && draft ? (
        <>
          {message ? <Note tone="ok" title="Done">{message}</Note> : null}
          {conflict ? (
            <Note tone="danger" title="The stylesheet changed on the server">
              {bad?.message}
              <div className="row" style={{ marginTop: 10 }}>
                <Btn icon={<RefreshCw size={14} />} onClick={live.reload} disabled={busy}>Reload what is there</Btn>
                <Btn variant="primary" onClick={() => void save(true)} disabled={busy}>
                  Save anyway
                </Btn>
              </div>
            </Note>
          ) : bad ? (
            <Note tone="danger" title="The change was refused">{bad.message}</Note>
          ) : null}

          <div className="grid-2">
            <Card>
              <div className="card-head">
                <div>
                  <h3>Where the theme lives</h3>
                  <p className="muted">
                    <code>{data.file}</code> · {data.meta ? `${data.meta.lines} lines · ${bytes(data.meta.bytes)}` : ""}
                  </p>
                </div>
                <Pill tone={data.meta?.theme ? "ok" : "info"} title={data.meta?.theme ? "The stylesheet carries a generated theme block" : "The site's own tokens, no theme block"}>
                  {data.meta?.theme ? "custom theme" : "the site's own"}
                </Pill>
              </div>
              <p className="muted">
                Last written {data.meta ? timeAgo(data.meta.mtime) : "—"}. Saving keeps a version, so any change
                here can be put back — the history is at the bottom of this screen, and it is the same version
                store the pages use.
              </p>
              {data.drift ? (
                <Note tone="warn" title="The file and the saved settings disagree">
                  The stylesheet has changed since these settings were saved, so what is shown below is what the
                  site is using now. Saving makes the two agree again.
                </Note>
              ) : null}
            </Card>

            <Card>
              <h3>What this screen does not change</h3>
              <p className="muted">
                These tokens are structure rather than choice — the greys the borders and shadows are built
                from, the two larger radii and the easing curve. v2.1 never offered them, and they stay as
                they are:
              </p>
              <p className="mono muted">{data.untouched.join(" · ")}</p>
            </Card>
          </div>

          {groups.colors.length ? (
            <Card>
              <h3>Colours</h3>
              <p className="muted">Each one is written as a custom property and aliased onto the name the stylesheet already uses.</p>
              <div className="theme-grid">
                {groups.colors.map((t) => (
                  <ColourField key={t.name} t={t} value={draft[t.name] ?? ""} onChange={(v) => set(t.name, v)} />
                ))}
              </div>
            </Card>
          ) : null}

          {groups.type.length ? (
            <Card>
              <h3>Type</h3>
              <div className="theme-grid">
                {groups.type.map((t) =>
                  t.type === "font" ? (
                    <FontField key={t.name} t={t} value={draft[t.name] ?? ""} fonts={data.fonts} local={data.local} onChange={(v) => set(t.name, v)} />
                  ) : (
                    <Field key={t.name} label={t.label} hint={t.targets.join(" ") || "main headings"} value={draft[t.name] ?? ""} placeholder="44px" onChange={(v) => set(t.name, v)} />
                  ),
                )}
              </div>
            </Card>
          ) : null}

          {groups.space.length ? (
            <Card>
              <h3>Space and shape</h3>
              <div className="theme-grid">
                {groups.space.map((t) => (
                  <Field key={t.name} label={t.label} hint={t.targets.join(" ") || "—"} value={draft[t.name] ?? ""} placeholder="96px" onChange={(v) => set(t.name, v)} />
                ))}
              </div>
            </Card>
          ) : null}

          {groups.preset.length ? (
            <Card>
              <h3>Preset</h3>
              {groups.preset.map((t) => (
                <Field key={t.name} label={t.label} hint="recorded with the settings; it is not a value the design reads" value={draft[t.name] ?? ""} placeholder="ink" onChange={(v) => set(t.name, v)} />
              ))}
            </Card>
          ) : null}

          <Card>
            <h3>Save</h3>
            <p className="muted">
              A note is kept with the version, so the history says why the theme changed rather than only what
              it was.
            </p>
            <div className="row">
              <input
                className="input"
                placeholder="What is this change? (optional)"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Btn variant="primary" icon={<Save size={15} />} onClick={() => void save(false)} disabled={busy}>
                {changed ? "Save the theme" : "Save"}
              </Btn>
              {arming ? (
                <>
                  <Btn
                    icon={<RotateCcw size={15} />}
                    disabled={busy}
                    onClick={() => {
                      const cleared: Record<string, string> = {};
                      for (const t of data.tokens) {
                        cleared[t.name] = "";
                      }
                      setDraft(cleared);
                      setArming(false);
                    }}
                  >
                    Yes — remove the theme block
                  </Btn>
                  <Btn variant="ghost" onClick={() => setArming(false)}>Cancel</Btn>
                </>
              ) : (
                <Btn icon={<RotateCcw size={15} />} onClick={() => setArming(true)} disabled={busy}>
                  Back to the site's own theme
                </Btn>
              )}
              {data.meta?.mtime ? <span className="muted">reading the file as of {data.meta.mtime} UTC</span> : null}
            </div>
          </Card>

          <Card>
            <h3>History</h3>
            {data.history.length === 0 ? (
              <Empty title="No theme changes yet" sub="The first save writes a version of the stylesheet before it changes anything." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>When</th>
                      <th>By</th>
                      <th>Note</th>
                      <th>Size</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((v) => (
                      <tr key={v.id}>
                        <td className="mono">#{v.id}</td>
                        <td>{timeAgo(v.at)}</td>
                        <td>{v.by || "—"}</td>
                        <td className="muted">{v.note || "—"}</td>
                        <td className="mono">{bytes(v.bytes)}</td>
                        <td className="right">
                          <Btn icon={<Undo2 size={14} />} onClick={() => void restore(v.id)} disabled={busy}>
                            Put this back
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}

/** The four groups the panel is arranged in, taken from the API's own token list. */
function groupTokens(tokens: ThemeToken[]) {
  return {
    colors: tokens.filter((t) => t.type === "color"),
    type: tokens.filter((t) => t.name === "--wx-base-size" || t.name.startsWith("--wx-h") || t.type === "font"),
    space: tokens.filter((t) => t.type === "len" && t.name !== "--wx-base-size" && !t.name.startsWith("--wx-h")),
    preset: tokens.filter((t) => t.type === "name"),
  };
}

function Field({
  label, hint, value, placeholder, onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="theme-field">
      <span className="field-label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <span className="muted mono">{hint}</span>
    </label>
  );
}

/**
 * A colour is a hex value and the API only accepts hex, so the swatch and the text box are one control:
 * typing is the source of truth, and the swatch is there because picking a colour is what people do.
 */
function ColourField({ t, value, onChange }: { t: ThemeToken; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <label className="theme-field">
      <span className="field-label">{t.label}</span>
      <span className="row">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={`${t.label} swatch`} />
        <input className="input mono" value={value} placeholder="#0b1b33" onChange={(e) => onChange(e.target.value)} />
      </span>
      <span className="muted mono">{t.targets.join(" · ")}</span>
    </label>
  );
}

/** A font is either one the site can serve, or a Google family typed as `g:Family:400;700`. */
function FontField({
  t, value, fonts, local, onChange,
}: {
  t: ThemeToken;
  value: string;
  fonts: Record<string, string>;
  local: Record<string, string[]>;
  onChange: (v: string) => void;
}) {
  const google = value.startsWith("g:");
  return (
    <label className="theme-field">
      <span className="field-label">{t.label}</span>
      <select
        className="input"
        value={google ? "google" : value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "google" ? "g:Inter:400;500;600;700" : v);
        }}
      >
        <option value="">— the site's own —</option>
        {Object.keys(local).map((k) => (
          <option key={k} value={k}>{local[k][0]}</option>
        ))}
        {Object.keys(fonts).map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
        <option value="google">Google font…</option>
      </select>
      {google ? (
        <input className="input mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder="g:Inter:400;700" />
      ) : null}
      <span className="muted mono">{t.targets.join(" · ") || "—"}</span>
    </label>
  );
}
