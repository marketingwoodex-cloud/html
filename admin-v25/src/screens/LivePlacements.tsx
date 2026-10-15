/**
 * LivePlacements — where the testimonials and the team appear, and the button that puts them there.
 *
 * The two kinds on this screen do not become pages of their own. They are written *inside* pages, wrapped in
 * a marker pair (`<!--wx:testimonials--> … <!--/wx:testimonials-->`) that says the section is generated — so
 * editing a review does not require anybody to edit a page, and pressing Update website replaces yesterday's
 * section instead of adding a second one.
 *
 * Three things about this screen are deliberate:
 *
 *   • **The preview is the push.** The section shown here is composed by the same server function that writes
 *     it (`?preview=1`), in the design that is selected, so what is being compared is what will land — not a
 *     mock-up drawn in the browser that the writer would have to keep in step.
 *   • **The button says what it will do first.** `GET /placements/plan` answers "17 pages change, 1 already
 *     matches, 2 cannot take this section" before anything is written, which is why the count is on the
 *     button rather than in the log afterwards.
 *   • **The undo is one entry.** Every changed page shares one batch, so the whole push is one row in the page
 *     history and Roll back puts all of them back — the same undo the header change uses.
 *
 * Pages that carry the marker but are no longer on the list are named at the bottom. That is the one state
 * where the site and the settings disagree (a page edited by hand, or a list changed without a push), and a
 * screen that hid it would leave a section on a page nobody chose.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, RefreshCw, Save, Undo2 } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Seg } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type PagesData, type PendingResult, type PlacementsData, type PlacePlan, type PlacePreview,
  type PlacePush, type RollbackResult,
} from "../lib/live";

const ACTION_WORD: Record<string, string> = {
  insert: "added",
  replace: "replaced",
  remove: "removed",
  none: "already right",
  "no-anchor": "no place for it",
};

export function LivePlacements({ initialKind = "testimonial" }: { initialKind?: string }) {
  const { link, reason } = useSession();
  const live = useLive<PlacementsData>("/placements");
  const pages = useLive<PagesData>("/pages");

  const [kind, setKind] = useState<string>(initialKind);
  const [kicker, setKicker] = useState("");
  const [heading, setHeading] = useState("");
  const [design, setDesign] = useState("cards");
  const [max, setMax] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [designs, setDesigns] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [plan, setPlan] = useState<PlacePlan | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const [shown, setShown] = useState<string>("");

  const data = live.data;
  const isTst = kind === "testimonial";

  /* Seed the form for the selected kind from what the server says it is using. */
  useEffect(() => {
    if (!data) return;
    const set = data.placements[`${kind}Set`] as { kicker?: string; heading?: string; design?: string; max?: number; designs?: Record<string, string> } | undefined;
    const list = (data.placements[kind] as string[] | undefined) ?? [];
    setKicker(set?.kicker ?? "");
    setHeading(set?.heading ?? "");
    setDesign(set?.design ?? "cards");
    setMax(set?.max ?? 0);
    setChosen(list);
    setDesigns(set?.designs ?? {});
    setPlan(null);
    setBatch(null);
    setNote(null);
    setBad(null);
  }, [data, kind]);

  const markerPages = data?.markerPages?.[kind] ?? [];
  const strays = useMemo(() => markerPages.filter((p) => !chosen.includes(p)), [markerPages, chosen]);
  const items = data?.items?.[kind] ?? [];
  const liveItems = items.length;

  /* The pages to tick: every page on the site, minus the ones that cannot take a section, plus a filter,
     because 150 checkboxes is a list somebody has to search rather than read. */
  const pageList = useMemo(() => {
    const rows = (pages.data?.pages ?? []).map((p) => p.rel).sort();
    const q = filter.trim().toLowerCase();
    return q === "" ? rows : rows.filter((r) => r.toLowerCase().includes(q));
  }, [pages.data, filter]);

  /** The whole set, in v2.1's shape: the map is the thing being saved, not one page at a time. */
  function mapForSave(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(data?.placements ?? {})) {
      if (k.endsWith("Set")) continue;
      out[k] = k === kind ? chosen : ((data?.placements[k] as string[] | undefined) ?? []);
      const set = data?.placements[`${k}Set`] as { kicker?: string; heading?: string; design?: string; max?: number; designs?: Record<string, string> } | undefined;
      out[`${k}Set`] = k === kind
        ? { kicker, heading, design, max, designs }
        : { kicker: set?.kicker ?? "", heading: set?.heading ?? "", design: set?.design ?? "cards", max: set?.max ?? 0, designs: set?.designs ?? {} };
    }
    return out;
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
    const r = await run(
      () => api.post<{ pending: true; message: string } | Record<string, unknown>>("/placements", { placements: mapForSave() }),
      "Saved. The website keeps showing what it shows until Update website is pressed.",
    );
    if (r && isPending(r)) setNote(r.message);
    else live.reload();
  }

  async function loadPreview(rel?: string) {
    const qs = new URLSearchParams({ kind, design, kicker, heading, max: String(max) });
    if (rel) qs.set("rel", rel);
    const r = await run(
      () => api.get<PlacePreview>(`/placements/preview?${qs.toString()}`),
      rel ? `This is what would happen to ${rel}.` : `Section preview — ${liveItems} live item(s).`,
    );
    if (r && r.kind) setPreview(r);
  }

  async function check() {
    const r = await run(() => api.get<PlacePlan>(`/placements/plan?kinds=${kind}`), "");
    if (r && "changed" in r) {
      setPlan(r);
      setNote(changedSentence(r));
    }
  }

  async function push() {
    const r = await run(
      () => api.post<PlacePush | PendingResult>(`/placements/push`, { kinds: [kind] }),
      "",
    );
    if (r && isPending(r)) {
      setNote(r.message);
      return;
    }
    if (r && "batch" in r) {
      setBatch(r.batch);
      setNote(
        r.changed.length === 0
          ? "Every page already said this — nothing was written, so there is nothing to undo."
          : `Updated ${r.changed.length} page(s) as one change (batch ${r.batch.slice(0, 8)}). Roll back undoes all of them.`,
      );
      live.reload();
      pages.reload();
    }
  }

  async function rollback() {
    if (!batch) return;
    const r = await run(() => api.post<RollbackResult>("/pages/rollback", { batch }), "");
    if (r && "restored" in r) {
      setNote(`Rolled back ${r.restored.length} page(s).${r.missing.length ? ` ${r.missing.length} page(s) could not be found.` : ""}`);
      setBatch(null);
      live.reload();
    }
  }

  /* ---------------- the states that must not lie ---------------- */

  if (link !== "live") {
    return (
      <>
        <PageHead title="Where they appear" sub="Reviews and staff profiles inside pages" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. The placements are on the server, and this screen will not show an empty map that reads as “nothing appears anywhere”."
            : "Sign in to see where the sections appear."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (live.loading && !data) {
    return (
      <>
        <PageHead title="Where they appear" sub="Reviews and staff profiles inside pages" />
        <Card><div className="muted" style={{ padding: 18 }}>Loading…</div></Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHead title="Where they appear" sub="Reviews and staff profiles inside pages" />
        <Note tone="danger" title="The placements could not be read">
          {live.error?.message ?? "The API did not answer."}
        </Note>
      </>
    );
  }

  return (
    <div className="screen">
      <PageHead
        title="Where they appear"
        sub="Reviews and staff profiles live inside pages, not at addresses of their own. Choosing a page here and pressing Update website rewrites that page's generated section."
        actions={
          <>
            <Btn variant="ghost" icon={<RefreshCw size={15} />} onClick={() => live.reload()}>
              Reload
            </Btn>
            <Btn variant="primary" icon={<Save size={15} />} onClick={save} disabled={busy}>
              Save choices
            </Btn>
          </>
        }
      />

      {note && <Note tone="info">{note}</Note>}
      {bad && <Note tone="danger" title={bad.code}>{bad.message}</Note>}

      <Seg
        value={kind}
        onChange={setKind}
        options={(data.kinds ?? []).map((k) => ({ id: k.kind, label: `${k.title} (${data.counts?.[k.kind] ?? 0} live)` }))}
      />

      <div className="grid-2">
        <Card title="The section" sub="What the generated block says, and how it looks.">
          <label className="stack">
            <span className="field-label">Small label above the heading</span>
            <input className="input" value={kicker} onChange={(e) => setKicker(e.target.value)} placeholder={isTst ? "Client words" : "The studio"} maxLength={60} />
          </label>
          <label className="stack">
            <span className="field-label">Heading</span>
            <input className="input" value={heading} onChange={(e) => setHeading(e.target.value)} placeholder={isTst ? "What our clients say" : "The people behind the work"} maxLength={120} />
          </label>
          {isTst && (
            <div className="stack">
              <span className="field-label">Design</span>
              <div className="chip-row">
                {(data.designs ?? []).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`chip${design === d.id ? " is-on" : ""}`}
                    title={d.note}
                    onClick={() => setDesign(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="hint">{data.designs?.find((d) => d.id === design)?.note}</p>
            </div>
          )}
          <label className="stack">
            <span className="field-label">Most items to show {max === 0 ? "(all of them)" : ""}</span>
            <input
              className="input"
              type="number"
              min={0}
              max={30}
              value={max}
              onChange={(e) => setMax(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
            />
          </label>
          <Note tone={liveItems === 0 ? "warn" : "info"}>
            {liveItems === 0
              ? `No live ${isTst ? "reviews" : "people"} yet — an empty section is not written, and one that is already on a page is removed.`
              : `${liveItems} live ${isTst ? "review(s)" : "person/people"} in the CMS, in the order the list shows them.`}
          </Note>
          <div className="actions">
            <Btn icon={<Eye size={15} />} onClick={() => loadPreview()} disabled={busy}>
              Preview this design
            </Btn>
          </div>
        </Card>

        <Card
          title="The pages"
          sub={`${chosen.length} chosen${strays.length ? ` · ${strays.length} page(s) still carry the section` : ""}`}
          actions={
            <input
              className="pager-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter pages…"
              aria-label="Filter pages"
            />
          }
        >
          {pageList.length === 0 ? (
            <Empty title="No pages match" sub="The filter is looking at the page list from /pages." />
          ) : (
            <div className="page-picker">
              {pageList.map((rel) => {
                const on = chosen.includes(rel);
                const carries = markerPages.includes(rel);
                return (
                  <div key={rel} className={`page-pick${on ? " is-on" : ""}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = e.target.checked ? [...chosen, rel] : chosen.filter((r) => r !== rel);
                          setChosen(next);
                          if (!e.target.checked) {
                            const d = { ...designs };
                            delete d[rel];
                            setDesigns(d);
                          }
                        }}
                      />
                      <span className="rel">{rel}</span>
                    </label>
                    {carries && <Pill tone={on ? "ok" : "warn"} plain>{on ? "has it" : "has it — not chosen"}</Pill>}
                    {isTst && on && (
                      <select
                        value={designs[rel] ?? ""}
                        onChange={(e) => {
                          const d = { ...designs };
                          if (e.target.value === "") delete d[rel];
                          else d[rel] = e.target.value;
                          setDesigns(d);
                        }}
                        aria-label={`Design for ${rel}`}
                      >
                        <option value="">Design: {design}</option>
                        {(data.designs ?? []).map((d) => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    )}
                    {on && (
                      <Btn variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => loadPreview(rel)}>
                        What this changes
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Update the website"
        sub="Writes the section into every chosen page as one change with one undo."
        actions={
          <>
            <Btn icon={<RefreshCw size={15} />} onClick={check} disabled={busy}>
              Check first
            </Btn>
            <Btn variant="primary" onClick={push} disabled={busy} icon={<Save size={15} />}>
              Update website
            </Btn>
            {batch && (
              <Btn variant="ghost" icon={<Undo2 size={15} />} onClick={rollback} disabled={busy}>
                Roll back this change
              </Btn>
            )}
          </>
        }
      >
        {plan ? (
          <ul className="plan">
            <li>
              <Pill tone={plan.changed ? "info" : "neutral"}>{plan.changed}</Pill> section(s) to write
            </li>
            <li>
              <Pill tone="ok">{plan.unchanged}</Pill> already matching
            </li>
            <li>
              <Pill tone={plan.blocked ? "warn" : "neutral"}>{plan.blocked}</Pill> page(s) with nowhere to put it
            </li>
            {plan.pages
              .flatMap((p) => p.kinds.map((k) => ({ rel: p.rel, ...k })))
              .filter((k) => k.action !== "none" && k.action !== "insert")
              .slice(0, 12)
              .map((k) => (
                <li key={k.rel + k.kind}>
                  <code>{k.rel}</code> — {ACTION_WORD[k.action] ?? k.action}
                  {k.anchor ? ` at ${k.anchor}` : ""}
                </li>
              ))}
          </ul>
        ) : (
          <p className="hint">
            Press Check first to see which pages change before anything is written.
          </p>
        )}
      </Card>

      {preview && (
        <Card
          title="Preview"
          sub={`${preview.design} · ${preview.items} item(s) · ${preview.bytes} bytes of HTML${preview.plan ? ` · ${ACTION_WORD[preview.plan.action] ?? preview.plan.action}${preview.plan.anchor ? ` at ${preview.plan.anchor}` : ""}` : ""}`}
          actions={
            <Btn variant="ghost" onClick={() => setShown(shown === "html" ? "" : "html")}>
              {shown === "html" ? "Show the section" : "Show the HTML"}
            </Btn>
          }
        >
          {shown === "html" ? (
            <pre className="code">{preview.html || "/* nothing to write: no live items */"}</pre>
          ) : (
            <>
              <iframe
                title="Section preview"
                className="preview-frame"
                srcDoc={`<!doctype html><html><head><link rel="stylesheet" href="/assets/site.css"></head><body>${preview.html}</body></html>`}
              />
              <p className="hint">
                Drawn with the site's own stylesheet. The preview is served from the same bytes the push writes —
                if this looks wrong here, it will look wrong on the site.
              </p>
            </>
          )}
          {preview.around && (
            <pre className="code around">
              {preview.around.before}
              {"\n>>> "}{preview.around.at || "the section lands here"}{"\n"}
              {preview.around.after}
            </pre>
          )}
        </Card>
      )}

      {strays.length > 0 && (
        <Note tone="warn" title="Pages that still show this section but are not chosen">
          <p>
            {strays.slice(0, 8).join(", ")}
            {strays.length > 8 ? ` and ${strays.length - 8} more` : ""} — they carry the marker from an earlier
            push. Press Update website and the section is removed from them.
          </p>
        </Note>
      )}

      {data.import && (
        <Note tone={data.import.imported ? "ok" : "info"} title="Import from v2.1">
          {data.import.imported
            ? `Read ${Object.values(data.import.placements ?? {}).reduce((a, b) => a + b, 0)} placement(s) out of _private/content.json.`
            : data.import.why ?? "Nothing to import."}
        </Note>
      )}

      <Note tone="info" title="Why the section is wrapped in a marker">
        <p>
          The generated block sits between <code>&lt;!--wx:testimonials--&gt;</code> and{" "}
          <code>&lt;!--/wx:testimonials--&gt;</code>. That is how a push replaces yesterday's section instead of
          adding a second one, and how taking a page off the list removes it. v2.1's builder writes the same
          markers, so both admins agree on what is generated while the site is cut over.
        </p>
        {liveItems === 0 && (
          <p>
            <AlertTriangle size={14} /> With no live items the block is empty, and an empty block means the page
            loses its section.
          </p>
        )}
      </Note>
    </div>
  );
}

function changedSentence(p: PlacePlan): string {
  return `${p.changed} section(s) would be written, ${p.unchanged} already match, ${p.blocked} page(s) have nowhere to put it.`;
}
