/**
 * LiveHeroes — the hero at the top of every page, and the home page's slider.
 *
 * v2.1's Hero slides screen had three tabs. All three are here, and the middle one is where the design of
 * this port shows:
 *
 *   · **Home slider** — the slides, in order, with the words and the photo each one carries.
 *   · **All page heroes** — every page, which design its hero uses, and an editor that either edits the
 *     hero *where it stands* (`tpl: "keep"`, so a page keeps its own design) or switches it to one of six.
 *   · **Templates** — the six designs, each drawn by the server with the site's own stylesheet. The picture
 *     is produced by the same function that writes a page, so what is being compared is what will land.
 *
 * Three things are deliberate, and they are the same three the other Phase 3 screens hold to:
 *
 *   • **Live-only.** With no API it says so in a sentence. There is no list of "150 pages" invented in the
 *     browser, because a hero list is a claim about files on a server.
 *   • **What will change is said before it changes.** The address line under the editor names the page and
 *     whether the design is being kept or replaced, and the save button says which of the two it will do.
 *   • **One write, one undo.** Both writes go through the page writer, so the batch id is shown and Roll
 *     back puts every touched page back — the same undo the header change uses.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, Image as ImageIcon, Plus, RefreshCw, Rocket, Save, Search, Trash2, Undo2,
} from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type HeroHomeData, type HeroHomeSave, type HeroPageData, type HeroPageSave, type HeroScanData,
  type HeroSlide, type HeroTemplatePreview, type PendingResult, type RollbackResult,
} from "../lib/live";

type Tab = "home" | "pages" | "tpl";

/** A slide while it is being edited. `i` is its position in the file, which is what the server edits. */
interface SlideDraft extends Record<string, unknown> {
  i: number;
  kicker: string; title: string; lead: string;
  img: string; alt: string;
  b1t: string; b1h: string; b2t: string; b2h: string;
  word: string; m1: string; m2: string;
  off: boolean;
}

const FIELDS: [keyof SlideDraft, string, string?][] = [
  ["kicker", "Small heading"],
  ["title", "Title"],
  ["lead", "Text"],
];

function toDraft(s: HeroSlide, i: number): SlideDraft {
  return {
    i,
    kicker: s.kicker ?? "", title: s.title ?? "", lead: s.lead ?? "",
    img: s.img ?? "", alt: s.alt ?? "",
    b1t: s.b1t ?? "", b1h: s.b1h ?? "", b2t: s.b2t ?? "", b2h: s.b2h ?? "",
    word: s.word ?? "", m1: s.m1 ?? "", m2: s.m2 ?? "",
    off: Boolean(s.off),
  };
}

export function LiveHeroes() {
  const { link, reason } = useSession();
  const home = useLive<HeroHomeData>("/heroes/home");
  const scan = useLive<HeroScanData>("/heroes");
  const [tab, setTab] = useState<Tab>("home");

  if (link !== "live") {
    return (
      <>
        <PageHead title="Hero slides" sub="The hero at the top of every page, and the home page's slider" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. A hero is part of a page and pages live on the server, so this screen shows nothing rather than an empty list that reads as “your site has no heroes”."
            : "Sign in to see and edit the heroes."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Hero slides"
        sub="The first thing every visitor sees — on the home page and on all 150 pages of the site"
        actions={
          <Btn
            icon={<RefreshCw size={15} />}
            onClick={() => {
              home.reload();
              scan.reload();
            }}
          >
            Refresh
          </Btn>
        }
      />
      <div className="chip-row" role="tablist" aria-label="Hero screens">
        {([["home", "Home slider"], ["pages", "All page heroes"], ["tpl", "Templates"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`chip${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "home" && <HomeTab live={home} />}
      {tab === "pages" && <PagesTab live={scan} />}
      {tab === "tpl" && <TemplatesTab />}
    </>
  );
}

/* ------------------------------------------------------------------ home slider */

function HomeTab({ live }: { live: ReturnType<typeof useLive<HeroHomeData>> }) {
  const [drafts, setDrafts] = useState<SlideDraft[]>([]);
  const [interval, setIntervalSeconds] = useState(5);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [batch, setBatch] = useState<string | null>(null);

  const data = live.data;

  useEffect(() => {
    if (!data) return;
    setDrafts((data.slides ?? []).map(toDraft));
    setIntervalSeconds(data.interval || 5);
    setBatch(null);
    setNote(null);
    setBad(null);
  }, [data]);

  const showing = drafts.filter((s) => !s.off).length;

  function move(i: number, by: number) {
    const to = i + by;
    if (to < 0 || to >= drafts.length) return;
    const next = [...drafts];
    const [one] = next.splice(i, 1);
    next.splice(to, 0, one);
    setDrafts(next);
  }

  async function run<T>(fn: () => Promise<T>, ok: string): Promise<T | null> {
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      const r = await fn();
      setNote(ok);
      return r;
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const payload = {
      interval,
      /* `i` travels with each slide: the server edits that slide in place, so everything this screen does
         not manage — the route hints the site's own script added, the pixel sizes on the photograph —
         survives the save. */
      slides: drafts.map((s) => ({ ...s, i: s.i })),
    };
    const r = await run(
      () => api.post<HeroHomeSave | PendingResult>("/heroes/home", payload),
      "",
    );
    if (r && isPending(r)) {
      setNote(r.message);
      return;
    }
    if (r && "changed" in r) {
      if (!r.changed) {
        setNote("Nothing changed — the slider already reads that way.");
      } else {
        setBatch(r.batch);
        setNote(
          `Saved ${r.showing} slide(s). ${r.interval}s between slides. The whole slider is one change (batch ${r.batch.slice(0, 8)}) — Roll back puts all of it back.`,
        );
      }
      live.reload();
    }
  }

  async function rollback() {
    if (!batch) return;
    const r = await run(() => api.post<RollbackResult>("/pages/rollback", { batch }), "");
    if (r && "restored" in r) {
      setNote(`Rolled back ${r.restored.length} page(s).`);
      setBatch(null);
      live.reload();
    }
  }

  if (live.loading) {
    return (
      <Card>
        <h2 className="cell-main">Loading…</h2>
        <p className="cell-sub">Reading the home page.</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Note tone="danger" title="The home page could not be read">
        {live.error?.message ?? "The server did not answer."}
      </Note>
    );
  }
  if (!data.present) {
    return (
      <Empty
        title="The home page has no hero"
        sub="Use All page heroes → the home page → one of the six designs. The slider design takes two or more slides."
      />
    );
  }

  return (
    <div className="stack">
      <Note tone="info" title="A slider is one page and one heading">
        The first slide that shows carries the <b>h1</b> — the words this page offers a search engine — so
        hiding a slide never leaves the page without one. Hiding keeps a slide's words; only Remove deletes them.
      </Note>

      {note && <Note tone="ok" title="Done">{note}</Note>}
      {bad && (
        <Note tone="danger" title="That did not work">
          {bad.message}
          {bad.detail ? ` — ${bad.detail}` : ""}
        </Note>
      )}

      <Card>
        <div className="row-between">
          <div>
            <h2 className="cell-main">Home page slider</h2>
            <p className="cell-sub">
              {showing} of {drafts.length} slide{drafts.length === 1 ? "" : "s"} showing · slide 1 is the main heading
            </p>
          </div>
          <div className="row">
            <label className="row" style={{ gap: "var(--s-2)" }}>
              <span className="field-label">Change every</span>
              <select className="select" value={interval} onChange={(e) => setIntervalSeconds(Number(e.target.value))} aria-label="Seconds between slides">
                {[4, 5, 6, 7, 8, 10].map((n) => <option key={n} value={n}>{n}s</option>)}
              </select>
            </label>
            <Btn
              icon={<Plus size={15} />}
              onClick={() =>
                setDrafts([
                  ...drafts,
                  {
                    i: -1, kicker: "", title: "Your headline here", lead: "",
                    img: drafts[0]?.img ?? "", alt: "",
                    b1t: "Start your project", b1h: "/contact/", b2t: "", b2h: "",
                    word: "", m1: "", m2: "", off: false,
                  },
                ])
              }
            >
              Add slide
            </Btn>
            <Btn variant="primary" icon={<Rocket size={15} />} onClick={save} disabled={busy || drafts.length === 0}>
              Save &amp; publish
            </Btn>
            {batch && <Btn icon={<Undo2 size={15} />} onClick={rollback} disabled={busy}>Roll back</Btn>}
          </div>
        </div>

        <div className="stack" style={{ marginTop: "var(--s-4)" }}>
          {drafts.map((s, i) => (
            <div key={`${s.i}-${i}`} className="card" style={{ opacity: s.off ? 0.55 : 1, padding: "var(--s-3)" }}>
              <div className="row-between">
                <b className="cell-main">
                  Slide {i + 1} {i === 0 && !s.off && <Pill tone="accent">H1</Pill>} {s.off && <Pill tone="warn">Hidden</Pill>}
                </b>
                <div className="row">
                  <Btn size="sm" iconOnly title="Move up" onClick={() => move(i, -1)} disabled={i === 0} icon={<ArrowUp size={14} />} />
                  <Btn size="sm" iconOnly title="Move down" onClick={() => move(i, 1)} disabled={i === drafts.length - 1} icon={<ArrowDown size={14} />} />
                  <Btn
                    size="sm"
                    icon={s.off ? <Eye size={14} /> : <EyeOff size={14} />}
                    onClick={() => setDrafts(drafts.map((d, j) => (j === i ? { ...d, off: !d.off } : d)))}
                    title={s.off ? "Show this slide again" : "Hide this slide, keeping its words"}
                  >
                    {s.off ? "Show" : "Hide"}
                  </Btn>
                  <Btn
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                    disabled={drafts.length < 2}
                    title={drafts.length < 2 ? "Keep at least one slide" : "Remove this slide"}
                  >
                    Remove
                  </Btn>
                </div>
              </div>

              <div className="grid grid-3" style={{ marginTop: "var(--s-2)" }}>
                {FIELDS.map(([k, label]) => (
                  <label className="stack" key={k}>
                    <span className="field-label">{label}</span>
                    <input
                      className="input"
                      value={String(s[k] ?? "")}
                      onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, [k]: e.target.value } : d)))}
                    />
                  </label>
                ))}
                {(["b1t", "b1h", "b2t", "b2h"] as const).map((k) => (
                  <label className="stack" key={k}>
                    <span className="field-label">{k === "b1h" || k === "b2h" ? `Button ${k[1]} link` : `Button ${k[1]}`}</span>
                    <input
                      className="input"
                      value={String(s[k] ?? "")}
                      placeholder={k.endsWith("h") ? "/contact/" : ""}
                      onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, [k]: e.target.value } : d)))}
                    />
                  </label>
                ))}
                <label className="stack">
                  <span className="field-label">Big background word</span>
                  <input className="input" maxLength={14} value={s.word} onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, word: e.target.value } : d)))} />
                </label>
                <label className="stack">
                  <span className="field-label">Info line 1</span>
                  <input className="input" value={s.m1} onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, m1: e.target.value } : d)))} />
                </label>
                <label className="stack">
                  <span className="field-label">Info line 2</span>
                  <input className="input" value={s.m2} onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, m2: e.target.value } : d)))} />
                </label>
                <label className="stack">
                  <span className="field-label">Photo path</span>
                  <input className="input mono" value={s.img} placeholder="/assets/img/…" onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, img: e.target.value } : d)))} />
                </label>
                <label className="stack">
                  <span className="field-label">Photo description (alt text)</span>
                  <input className="input" value={s.alt} onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, alt: e.target.value } : d)))} />
                </label>
              </div>

              <p className="cell-sub" style={{ marginTop: "var(--s-2)" }}>
                {s.i >= 0 ? "Editing this slide where it stands — anything else inside it is left alone." : "A new slide: it will be written in full from these fields."}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ every page */

function PagesTab({ live }: { live: ReturnType<typeof useLive<HeroScanData>> }) {
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const data = live.data;
  const pages = useMemo(() => {
    const rows = data?.pages ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (p) =>
        (family === "" || p.family === family) &&
        (needle === "" || `${p.rel} ${p.title} ${p.heroTitle}`.toLowerCase().includes(needle)),
    );
  }, [data, q, family]);

  if (live.loading) {
    return (
      <Card>
        <h2 className="cell-main">Checking every page…</h2>
        <p className="cell-sub">Reading each page's hero from the server.</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Note tone="danger" title="The pages could not be read">
        {live.error?.message ?? "The server did not answer."}
      </Note>
    );
  }

  const families = Object.entries(data.counts ?? {});

  return (
    <div className="stack">
      <Note tone="info" title="Every page, and the one thing they share">
        A hero is part of its page, so this list is read from the pages themselves — not from a second record
        that could disagree with them. <b>{data.total}</b> page(s) checked
        {data.without > 0 ? <> · <b>{data.without}</b> with no hero at all</> : null}.
      </Note>

      <Card>
        <div className="toolbar">
          <input className="input" placeholder="Search pages…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Btn icon={<Search size={15} />} onClick={() => live.reload()}>Reload from the server</Btn>
        </div>
        <div className="chip-row">
          <button type="button" className={`chip${family === "" ? " is-on" : ""}`} onClick={() => setFamily("")}>
            All <b>{data.total}</b>
          </button>
          {families.map(([label, n]) => {
            const id = (data.pages ?? []).find((p) => p.familyLabel === label)?.family ?? label;
            return (
              <button key={label} type="button" className={`chip${family === id ? " is-on" : ""}`} onClick={() => setFamily(id)}>
                {label} <b>{n}</b>
              </button>
            );
          })}
        </div>

        {pages.length === 0 ? (
          <Empty title="Nothing matches that" sub="No page carries that hero design — or nothing matches the search." />
        ) : (
          <div className="table-wrap" style={{ marginTop: "var(--s-3)" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Hero design</th>
                  <th>Hero title</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.rel} className={open === p.rel ? "is-selected" : undefined}>
                    <td>
                      <span className="cell-main">{p.title}</span>
                      <span className="cell-sub mono">/{p.rel.replace(/index\.html$/, "")}</span>
                    </td>
                    <td>
                      <Pill tone={p.family === "none" ? "danger" : p.family.startsWith("tpl-") ? "ok" : "neutral"} title={p.familyNote || undefined}>
                        {p.familyLabel}
                      </Pill>
                    </td>
                    <td>{p.heroTitle || <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      <Btn variant={p.family === "none" ? "primary" : "default"} onClick={() => setOpen(open === p.rel ? null : p.rel)}>
                        {open === p.rel ? "Close" : p.family === "none" ? "Add hero" : "Edit hero"}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <HeroEditor rel={open} onSaved={() => { live.reload(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ the editor */

function HeroEditor({ rel, onSaved }: { rel: string; onSaved: () => void }) {
  const one = useLive<HeroPageData>(`/heroes/page?rel=${encodeURIComponent(rel)}`);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tpl, setTpl] = useState("keep");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const data = one.data;

  useEffect(() => {
    if (!data) return;
    setDraft({
      kicker: data.fields.kicker ?? "", title: data.fields.title ?? "", lead: data.fields.lead ?? "",
      img: data.fields.img ?? "", alt: data.fields.alt ?? "",
      b1t: data.fields.b1t ?? "", b1h: data.fields.b1h ?? "",
      b2t: data.fields.b2t ?? "", b2h: data.fields.b2h ?? "",
    });
    setTpl(data.hasHero ? "keep" : "split");
    setBatch(null);
    setNote(null);
    setBad(null);
  }, [data]);

  const save = useCallback(async () => {
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      const r = await api.post<HeroPageSave | PendingResult>("/heroes/page", { rel, tpl, ...draft });
      if (isPending(r)) {
        setNote(r.message);
      } else if (!r.changed) {
        setNote("Nothing changed — the page already reads that way.");
      } else {
        setBatch(r.batch);
        setNote(`${r.how} — ${r.bytes} bytes written as one change (batch ${r.batch.slice(0, 8)}). Roll back puts the page back.`);
        one.reload();
        onSaved();
      }
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }, [rel, tpl, draft, one, onSaved]);

  async function rollback() {
    if (!batch) return;
    setBusy(true);
    try {
      const r = await api.post<RollbackResult>("/pages/rollback", { batch });
      setNote(`Rolled back ${r.restored.length} page(s).`);
      setBatch(null);
      one.reload();
      onSaved();
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  if (one.loading) {
    return (
      <Card>
        <h2 className="cell-main">Loading the hero…</h2>
      </Card>
    );
  }
  if (!data) {
    return (
      <Note tone="danger" title="That hero could not be read">
        {one.error?.message ?? "The server did not answer."}
      </Note>
    );
  }

  return (
    <Card>
      <div className="row-between">
        <div>
          <h2 className="cell-main">Hero · {data.title}</h2>
          <p className="cell-sub">
            Now: <b>{data.family[1]}</b>
            {data.family[2] ? ` (${data.family[2]})` : ""} · {data.bytes} bytes · <span className="mono">{data.rel}</span>
          </p>
        </div>
        <div className="row">
          <label className="row" style={{ gap: "var(--s-2)" }}>
            <span className="field-label">Design</span>
            <select className="select" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="keep" disabled={!data.hasHero}>
                Keep this page&apos;s own design
              </option>
              {(data.templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </label>
          <Btn variant="primary" icon={<Save size={15} />} onClick={save} disabled={busy}>
            {tpl === "keep" ? "Save changes" : "Replace the hero"}
          </Btn>
          {batch && <Btn icon={<Undo2 size={15} />} onClick={rollback} disabled={busy}>Roll back</Btn>}
        </div>
      </div>

      {note && <Note tone="ok" title="Done">{note}</Note>}
      {bad && (
        <Note tone="danger" title="That did not work">
          {bad.message}
          {bad.detail ? ` — ${bad.detail}` : ""}
        </Note>
      )}

      <p className="cell-sub" style={{ marginTop: "var(--s-2)" }}>
        {tpl === "keep"
          ? "The text and photo are written into the page where they already are, and nothing else in the page is touched. A field this design has no place for is refused by name — it is never dropped."
          : "The whole hero section is replaced with this design's markup. The page keeps everything below it, and a second h1 cannot appear."}
      </p>

      <div className="grid grid-3" style={{ marginTop: "var(--s-3)" }}>
        {([["kicker", "Small heading"], ["title", "Title"], ["lead", "Text"], ["img", "Photo path"], ["alt", "Photo description (alt text)"],
          ["b1t", "Button 1"], ["b1h", "Button 1 link"], ["b2t", "Button 2"], ["b2h", "Button 2 link"]] as [string, string][]).map(([k, label]) => (
          <label className="stack" key={k}>
            <span className="field-label">{label}</span>
            <input
              className={k === "img" ? "input mono" : "input"}
              value={draft[k] ?? ""}
              placeholder={k === "img" ? "/assets/img/…" : k.endsWith("h") ? "/contact/" : ""}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ templates */

function TemplatesTab() {
  const [one, setOne] = useState<string | null>(null);
  const [preview, setPreview] = useState<HeroTemplatePreview | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const designs: [string, string, string][] = [
    ["image", "Full image", "Photo fills the hero, text bottom-left. Strong first impression."],
    ["split", "Split", "Text left, photo right, on cream. Calm and clear."],
    ["center", "Centered", "Photo behind, centred title. Good for campaigns."],
    ["plain", "Plain cream", "No photo. Title, text and buttons only. Fast to load."],
    ["compact", "Compact band", "Short navy band with title. Best for legal and utility pages."],
    ["slider", "Slider", "Several slides that rotate, each with its own photo and buttons."],
  ];

  async function show(id: string) {
    setBusy(true);
    setBad(null);
    setOne(id);
    try {
      setPreview(await api.get<HeroTemplatePreview>(`/heroes/preview?tpl=${id}`));
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Note tone="info" title="Six designs, drawn by the server">
        Each picture below is composed by the same function that writes a hero into a page, on the stylesheet
        the live pages load (<span className="mono">/assets/site.css</span>). Nothing here is a mock-up drawn
        in the browser, so the picture cannot drift from the result.
      </Note>
      {bad && <Note tone="danger" title="That preview could not be drawn">{bad.message}</Note>}

      <div className="grid grid-3">
        {designs.map(([id, label, desc]) => (
          <Card key={id}>
            <div className="row-between">
              <b className="cell-main">{label}</b>
              <Btn size="sm" icon={<ImageIcon size={14} />} onClick={() => show(id)} disabled={busy} title="Draw this design with sample words">
                {one === id && preview ? "Redraw" : "Show"}
              </Btn>
            </div>
            <p className="cell-sub">{desc}</p>
          </Card>
        ))}
      </div>

      {preview && (
        <Card>
          <div className="row-between">
            <div>
              <h2 className="cell-main">{preview.label}</h2>
              <p className="cell-sub">{preview.desc}</p>
            </div>
            <Pill tone="accent" title="The design id the server writes into the page">data-wxh=&quot;{preview.tpl}&quot;</Pill>
          </div>
          <iframe
            title={`${preview.label} hero, drawn by the server`}
            className="preview-frame"
            srcDoc={preview.html}
          />
          <p className="cell-sub">
            Sample words and a photograph from the library. On a real page the words come from that page, and
            a page below the root gets a breadcrumb trail above its title.
          </p>
        </Card>
      )}
    </div>
  );
}
