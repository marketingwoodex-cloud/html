/**
 * LiveContent — the content CMS: the list an editor works from, the editor, and the publish button.
 *
 * The screen exists because of one sentence in the plan: *"an editor publishes an article"*. Everything
 * here is arranged around that sentence, and around one fact that shapes the whole design — **the browser
 * does not compose pages.**
 *
 * In v2.1 the article builder ran here: it assembled a finished HTML document, and the API stored the
 * blob and wrote it to disk. Three things followed from that, and this screen removes all three:
 *
 *   1. A new article could not inherit the site's header. The header was copied from whatever the browser
 *      had cached, so an article published after a header change carried the old one until someone
 *      noticed. Here the server reads the shell page at publish time.
 *   2. Scheduling meant storing the prepared page. A scheduled post was up to 3 MB of HTML in a JSON
 *      file; here it is a row with a time, and the tick renders it when the time comes.
 *   3. "Which posts are drafts?" could not be asked. The list loaded everything and filtered in the
 *      browser. Here `?filter=draft|scheduled|due|live` is a query, and the counts come from the server.
 *
 * The editor is therefore a *form*, not a page builder: title, address, hero fields, sections, SEO. Every
 * string is rendered and escaped by the server, which is why the preview below can be shown in a sandboxed
 * iframe without a second thought — and why the same preview is what will be published, byte for byte.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, CalendarClock, FileText, Plus, RefreshCw, Rocket, Save, Search, Trash2, X,
} from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Seg } from "../components/primitives";
import { AiSettings } from "../components/AiSettings";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type ContentData, type ContentItem, type ContentPreview, type ContentPublishResult,
  type ContentSection, type ContentStatus, type TickResult,
} from "../lib/live";
import { timeAgo } from "../lib/format";

/** What the editor is allowed to change, held locally until Save. */
interface Draft {
  id: number;
  type: string;
  title: string;
  slug: string;
  hero: Record<string, string>;
  sections: ContentSection[];
  seo: Record<string, string>;
  visibility: string;
}

const SECTION_LABELS: Record<string, string> = {
  lead: "Opening paragraph",
  heading: "Heading",
  para: "Paragraph",
  list: "List",
  image: "Image",
  quote: "Quote",
  facts: "Facts",
  faq: "Questions",
  cta: "Call to action",
  related: "Related reading",
};

const TYPE_LABELS: Record<string, string> = {
  post: "Article",
  study: "Case study",
  testimonial: "Testimonial",
  member: "Team member",
  faq: "FAQ",
  city: "City page",
};

/** Only the types that become a page of their own can be published. */
/* Kinds that become a page of their own — the ones with a Publish button and an address. */
const PAGE_TYPES = new Set(["post", "study", "city"]);

/** What this route calls the things it edits. `/blog` says article, `/cities` says city page — one table,
 *  one screen, and the words follow the kind the route opened on rather than assuming a blog. */
const KIND_TITLE: Record<string, string> = { post: "Articles", study: "Case studies", city: "City pages" };
const KIND_NOUN: Record<string, string> = { post: "article", study: "case study", city: "city page" };
const KIND_PLURAL: Record<string, string> = { post: "articles", study: "case studies", city: "city pages" };

const STATUS_TONE: Record<ContentStatus, "neutral" | "warn" | "ok"> = {
  draft: "neutral",
  scheduled: "warn",
  published: "ok",
};

function draftOf(item: ContentItem): Draft {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    hero: { ...(item.data.hero ?? {}) },
    sections: (item.data.sections ?? []).map((s) => ({ ...s })),
    seo: {
      title: item.seo.title ?? "",
      desc: item.seo.desc ?? "",
      kw: item.seo.kw ?? "",
      related: (item.seo.related ?? []).join("\n"),
    },
    visibility: item.data.visibility ?? "listed",
  };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A new section of a given kind, with the fields that kind needs. */
function blankSection(kind: string): ContentSection {
  switch (kind) {
    case "heading":
      return { kind, text: "", level: 2 };
    case "list":
      return { kind, items: [""] };
    case "image":
      return { kind, url: "", alt: "", caption: "" };
    case "quote":
      return { kind, text: "", by: "" };
    case "facts":
      return { kind, items: [] };
    case "faq":
      return { kind, items: [] };
    case "cta":
      return { kind, text: "", label: "", href: "" };
    case "related":
      return { kind, links: [] };
    default:
      return { kind, text: "" };
  }
}

/** Lines of a textarea ⇄ the rows the API stores, for the section kinds that hold rows. */
function rowsToText(rows: unknown): string {
  if (!Array.isArray(rows)) return "";
  return rows
    .map((r) => {
      if (typeof r === "string") return r;
      if (typeof r !== "object" || r === null) return "";
      const o = r as Record<string, unknown>;
      if ("q" in o || "a" in o) return `${o.q ?? ""} | ${o.a ?? ""}`;
      if ("k" in o || "v" in o) return `${o.k ?? ""} | ${o.v ?? ""}`;
      if ("label" in o || "href" in o) return `${o.label ?? ""} | ${o.href ?? ""}`;
      return "";
    })
    .join("\n");
}

function textToRows(kind: string, text: string): unknown[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  if (kind === "faq") {
    return lines.map((l) => {
      const [q, ...rest] = l.split("|");
      return { q: (q ?? "").trim(), a: rest.join("|").trim() };
    });
  }
  if (kind === "facts") {
    return lines.map((l) => {
      const [k, ...rest] = l.split("|");
      return { k: (k ?? "").trim(), v: rest.join("|").trim() };
    });
  }
  if (kind === "related") {
    return lines.map((l) => {
      const [label, ...rest] = l.split("|");
      return { label: (label ?? "").trim(), href: rest.join("|").trim() };
    });
  }
  return lines;
}

/**
 * @param presetType the kind this route is about — `/blog` is the article list, `/portfolio` the case
 *   studies, `/cities` the city pages. One screen owns all three because one table does, and the words on
 *   the screen follow the kind it opened on. The differences that matter are two: which page furniture a
 *   published page copies, and its address. A post and a case study go under their section's index
 *   (`/insights/…`, `/projects/…`); a city page is **root-level** (`/<address>/`), which is where v2.1 put
 *   them and where the addresses are indexed. One screen owns all three because one table does — the
 *   difference between an article, a case study and a city page is an address, not a different program.
 */
export function LiveContent({ presetType = "" }: { presetType?: string }) {
  const { link, reason } = useSession();
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState(presetType);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const list = useLive<ContentData>(`/content?filter=${filter}&type=${type}&q=${encodeURIComponent(query)}`, `${filter}|${type}|${query}`);

  const [selId, setSelId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<ContentPreview | null>(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  const data = list.data;

  /* Selecting keeps the list as the source of an item's truth: pick one and the draft starts from it. */
  useEffect(() => {
    if (selId === null || !data) return;
    const item = data.items.find((i) => i.id === selId);
    if (item) setDraft(draftOf(item));
  }, [selId, data]);

  const dirty = useMemo(() => {
    if (!draft || !data) return false;
    const item = data.items.find((i) => i.id === draft.id);
    if (!item) return true;
    return JSON.stringify(draftOf(item)) !== JSON.stringify(draft);
  }, [draft, data]);

  function select(id: number) {
    setSelId(id);
    setPreview(null);
    setNote(null);
    setBad(null);
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

  function bodyForSave() {
    if (!draft) return null;
    return {
      id: draft.id,
      type: draft.type,
      title: draft.title,
      slug: draft.slug,
      data: {
        hero: draft.hero,
        sections: draft.sections,
        visibility: draft.visibility,
      },
      seo: {
        title: draft.seo.title,
        desc: draft.seo.desc,
        kw: draft.seo.kw,
        related: (draft.seo.related ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
      },
    };
  }

  async function save() {
    const body = bodyForSave();
    if (!body) return;
    const r = await run(() => api.post<{ item: ContentItem } | { pending: true; message: string }>("/content", body), "Saved.");
    if (r && isPending(r)) {
      setNote(r.message);
    } else if (r && "item" in r) {
      list.reload();
    }
  }

  async function publish() {
    if (!draft) return;
    const r = await run(
      () => api.post<ContentPublishResult | { pending: true; message: string }>(`/content/${draft.id}/publish`, {}),
      "",
    );
    if (r && isPending(r)) {
      setNote(r.message);
      return;
    }
    if (r && "batch" in r) {
      setNote(`Published to ${r.url} — ${r.sections} sections, ${r.bytes.toLocaleString()} bytes. Page history keeps it as batch ${r.batch.slice(0, 8)}.`);
      list.reload();
    }
  }

  async function schedule() {
    if (!draft || when === "") {
      setBad(new ApiFailure({ code: "VALIDATION", message: "Pick a date and time first" }, 0, "client"));
      return;
    }
    const r = await run(
      () => api.post<{ item: ContentItem } | { pending: true; message: string }>(`/content/${draft.id}/schedule`, { publishAt: when }),
      `Scheduled for ${when.replace("T", " ")}. The server publishes it then — nothing to prepare.`,
    );
    if (r && isPending(r)) setNote(r.message);
    else if (r) list.reload();
  }

  async function tick() {
    const r = await run(() => api.post<TickResult | { pending: true; message: string }>("/content/tick", {}), "");
    if (r && isPending(r)) {
      setNote(r.message);
      return;
    }
    if (r && "published" in r) {
      const failed = r.failed.length ? ` ${r.failed.length} could not be published: ${r.failed.map((f) => `${f.title} (${f.message})`).join("; ")}` : "";
      setNote(r.checked === 0 ? "Nothing was due." : `Published ${r.published.map((p) => p.title).join(", ")}.${failed}`);
      list.reload();
    }
  }

  async function remove() {
    if (!draft) return;
    const r = await run(() => api.del<{ items: ContentItem[] } | { pending: true; message: string }>(`/content/${draft.id}`), "Deleted.");
    if (r && isPending(r)) setNote(r.message);
    else if (r) {
      setSelId(null);
      setDraft(null);
      list.reload();
    }
  }

  async function loadPreview() {
    if (!draft) return;
    setPreview(null);
    const r = await run(() => api.get<ContentPreview>(`/content/${draft.id}?preview=1`), "");
    if (r) setPreview(r);
  }

  /* ---------------- the states that must not lie ---------------- */

  if (link !== "live") {
    return (
      <>
        <PageHead title={KIND_TITLE[presetType] ?? "Content"} sub="The list, the editor and the publish button — one table, whichever kind you opened it on." />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering, so the content list cannot be read. This screen shows nothing rather than an empty list, because an empty list is a claim about your articles."
            : "Sign in to see the content list."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!data && list.loading) {
    return (
      <>
        <PageHead title={KIND_TITLE[presetType] ?? "Content"} sub="The list, the editor and the publish button — one table, whichever kind you opened it on." />
        <Card><div className="muted" style={{ padding: 18 }}>Loading…</div></Card>
      </>
    );
  }

  if (!data && list.error) {
    return (
      <>
        <PageHead title={KIND_TITLE[presetType] ?? "Content"} sub="The list, the editor and the publish button — one table, whichever kind you opened it on." />
        <Note tone="danger" title="The content list could not be read">
          {list.error.message}
        </Note>
      </>
    );
  }

  const items = data?.items ?? [];
  const selected = draft ? items.find((i) => i.id === draft.id) : undefined;
  const statuses: [string, string][] = [
    ["all", "All"],
    ["draft", "Drafts"],
    ["scheduled", "Scheduled"],
    ["due", "Due now"],
    ["live", "Live"],
  ];

  return (
    <>
      <PageHead
        title="Content"
        sub={
          data
            ? `${data.total} ${data.total === 1 ? KIND_NOUN[presetType] ?? "item" : KIND_PLURAL[presetType] ?? "items"} · the list is the server's`
            : "Articles, case studies and city pages — and the pages they publish to"
        }
        actions={
          <>
            <Btn icon={<RefreshCw size={15} />} onClick={list.reload}>Refresh</Btn>
            <Btn
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                const id = -Date.now();
                setSelId(id);
                setDraft({
                  id: 0, type: presetType || "post", title: "", slug: "",
                  hero: { kicker: "", dek: "", category: "", readTime: "", image: "" },
                  sections: [blankSection("lead")],
                  seo: { title: "", desc: "", kw: "", related: "" },
                  visibility: "listed",
                });
                setPreview(null);
                setNote(`New ${KIND_NOUN[presetType] ?? "article"} — nothing is created until you save.`);
              }}
            >
              New {KIND_NOUN[presetType] ?? "article"}
            </Btn>
          </>
        }
      />

      {data && data.due > 0 && (
        <Note tone="warn" title={`${data.due} scheduled item${data.due === 1 ? " is" : "s are"} due`}>
          <div className="row-between">
            <span>The server renders and publishes each one when you ask it to — there is no prepared page waiting anywhere.</span>
            <Btn icon={<Rocket size={15} />} onClick={tick} disabled={busy}>Publish them now</Btn>
          </div>
        </Note>
      )}

      {note && <Note tone="ok" title="Done">{note}</Note>}
      {bad && <Note tone="danger" title="That did not work">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}

      <div className="content-split">
        <Card>
          <div className="toolbar">
            <Seg options={statuses.map(([id, label]) => ({ id, label }))} value={filter} onChange={setFilter} />
            <div className="grow" />
            <input
              className="input"
              placeholder="Search titles…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setQuery(q); }}
            />
            <Btn icon={<Search size={15} />} onClick={() => setQuery(q)}>Search</Btn>
          </div>
          <div className="toolbar">
            <Seg
              options={[{ id: "", label: "Every kind" }, ...(data?.types ?? []).map((t) => ({ id: t, label: TYPE_LABELS[t] ?? t }))]}
              value={type}
              onChange={setType}
            />
          </div>

          {items.length === 0 ? (
            <Empty
              title={query ? "Nothing matches that search" : "No items in this view"}
              sub={query ? `Nothing in the list has “${query}” in its title.` : "Drafts, scheduled posts and live pages all appear here."}
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Where</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      onClick={() => select(it.id)}
                      className={selId === it.id ? "is-selected" : undefined}
                      style={{ cursor: "pointer" }}
                    >
                      <td><span className="cell-main">{it.title}</span></td>
                      <td>{TYPE_LABELS[it.type] ?? it.type}</td>
                      <td>
                        <Pill tone={STATUS_TONE[it.status] ?? "neutral"} title={it.status === "scheduled" && it.publishAt ? `Due ${it.publishAt}` : undefined}>
                          {it.status === "published" ? "Live" : it.status === "scheduled" ? "Scheduled" : "Draft"}
                        </Pill>
                      </td>
                      <td className="mono truncate">{it.url ?? (it.where ? `/${it.where}` : "—")}</td>
                      <td className="nowrap">{it.updatedAt ? timeAgo(it.updatedAt) : timeAgo(it.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          {!draft ? (
            <Empty title="Nothing selected" sub={`Pick something on the left, or start a new ${KIND_NOUN[presetType] ?? "article"}.`} />
          ) : (
            <div className="stack">
              <div className="row-between">
                <h2 className="cell-main">
                  {draft.id === 0 ? `New ${KIND_NOUN[draft.type] ?? "article"}` : draft.title || "(untitled)"}
                  {dirty && <Pill tone="warn" title="You have changes that are not saved yet">Unsaved</Pill>}
                </h2>
                <div className="row">
                  {draft.id > 0 && (
                    <>
                      <Btn icon={<FileText size={15} />} onClick={loadPreview} disabled={busy}>Preview</Btn>
                      {selected?.status !== "published" && PAGE_TYPES.has(draft.type) && (
                        <Btn variant="primary" icon={<Rocket size={15} />} onClick={publish} disabled={busy || dirty} title={dirty ? "Save first — publishing writes the page as it is on the server, and yours is not there yet" : undefined}>
                          Publish
                        </Btn>
                      )}
                      <Btn icon={<Trash2 size={15} />} onClick={remove} disabled={busy} title="Delete this draft. A live page is removed from the pages screen, where its history lives.">
                        Delete
                      </Btn>
                    </>
                  )}
                </div>
              </div>

              {selected?.status === "published" && (
                <Note tone="ok" title={`Live at ${selected.url}`}>
                  Saving changes does not touch the page. Publish again to write them — the old version stays in page history, so a change to a published article is undoable.
                </Note>
              )}

              <div className="grid grid-2">
                <label className="stack">
                  <span className="field-label">Title</span>
                  <input
                    className="input"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value, slug: draft.id === 0 || !selected?.rel ? slugify(e.target.value) : draft.slug })}
                  />
                </label>
                <label className="stack">
                  <span className="field-label">Kind</span>
                  <select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} disabled={draft.id > 0}>
                    {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label className="stack">
                <span className="field-label">Address</span>
                <input
                  className="input mono"
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })}
                  disabled={Boolean(selected?.rel)}
                />
                <span className="cell-sub">
                  {selected?.url
                    ? `Live at ${selected.url} — a published address cannot be changed, because it is already indexed and on somebody's card.`
                    : draft.type === "city"
                      ? `Will publish to /${draft.slug || "…"}/ — root level, next to the homepage, where v2.1 put city pages and where the addresses are indexed. The furniture comes from ${data?.shells.city || "index.html"} (or the city page its template names), so the page always carries the current header and footer.`
                      : PAGE_TYPES.has(draft.type)
                      ? `Will publish to /${draft.type === "post" ? "insights" : "projects"}/${draft.slug || "…"}/ — a copy of ${draft.type === "post" ? data?.shells.post : data?.shells.study} gives it the site's header and footer.`
                      /* eslint-disable-next-line no-irregular-whitespace */
                      : "This kind appears inside pages rather than at an address of its own."}
                </span>
              </label>

              <h3 className="cell-main">Hero</h3>
              <div className="grid grid-3">
                {["kicker", "dek", "category", "readTime", "image"].map((k) => (
                  <label className="stack" key={k}>
                    <span className="field-label">{k === "readTime" ? "Read time" : k === "dek" ? "Standfirst" : k === "image" ? "Hero image path" : k}</span>
                    <input
                      className="input"
                      value={draft.hero[k] ?? ""}
                      placeholder={k === "image" ? "/assets/img/…" : ""}
                      onChange={(e) => setDraft({ ...draft, hero: { ...draft.hero, [k]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>

              <div className="row-between">
                <h3 className="cell-main">Body</h3>
                <div className="row">
                  <select className="input" value="" onChange={(e) => {
                    const kind = e.target.value;
                    if (kind) setDraft({ ...draft, sections: [...draft.sections, blankSection(kind)] });
                    e.target.value = "";
                  }}>
                    <option value="">Add a section…</option>
                    {Object.entries(SECTION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
              </div>

              {draft.sections.length === 0 && <Empty title="No sections yet" sub="This item has no body yet, and the server refuses to write an empty page — add a section to publish it." />}

              {draft.sections.map((sec, i) => (
                <div className="sec-row" key={i}>
                  <div className="sec-head">
                    <strong>{SECTION_LABELS[sec.kind] ?? sec.kind}</strong>
                    <div className="row">
                      <Btn iconOnly icon={<ArrowUp size={14} />} title="Move up" disabled={i === 0}
                        onClick={() => {
                          const next = [...draft.sections];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          setDraft({ ...draft, sections: next });
                        }} />
                      <Btn iconOnly icon={<ArrowDown size={14} />} title="Move down" disabled={i === draft.sections.length - 1}
                        onClick={() => {
                          const next = [...draft.sections];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          setDraft({ ...draft, sections: next });
                        }} />
                      <Btn iconOnly icon={<X size={14} />} title="Remove this section"
                        onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== i) })} />
                    </div>
                  </div>
                  {renderSection(sec, (patch) => {
                    const next = [...draft.sections];
                    next[i] = { ...next[i], ...patch };
                    setDraft({ ...draft, sections: next });
                  })}
                </div>
              ))}

              <h3 className="cell-main">Search and social</h3>
              <div className="grid grid-2">
                <label className="stack">
                  <span className="field-label">Search title</span>
                  <input className="input" value={draft.seo.title ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, title: e.target.value } })} />
                </label>
                <label className="stack">
                  <span className="field-label">Keywords</span>
                  <input className="input" value={draft.seo.kw ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, kw: e.target.value } })} />
                </label>
              </div>
              <label className="stack">
                <span className="field-label">Description — this is the line under the title in a search result</span>
                <textarea className="input" rows={2} maxLength={200} value={draft.seo.desc ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, desc: e.target.value } })} />
              </label>
              <label className="stack">
                <span className="field-label">Related reading — one title per line</span>
                <textarea className="input" rows={2} value={draft.seo.related ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, related: e.target.value } })} />
              </label>
              <label className="stack">
                <span className="field-label">Visibility</span>
                <select className="input" value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })}>
                  <option value="listed">Listed — appears in the sitemap and in search</option>
                  <option value="unlisted">Unlisted — reachable by link, kept out of the sitemap</option>
                </select>
              </label>

              <div className="row-between">
                <div className="row">
                  <Btn icon={<Save size={15} />} onClick={save} disabled={busy}>Save</Btn>
                  <Btn icon={<CalendarClock size={15} />} onClick={schedule} disabled={busy || draft.id === 0 || dirty}
                    title={dirty ? "Save first" : "The server publishes it when the time comes"}>
                    Schedule
                  </Btn>
                  <input
                    className="input"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </div>
                <span className="cell-sub">
                  {draft.id === 0 ? "Not created yet." : `Created ${timeAgo(selected?.createdAt ?? "")} by ${selected?.createdBy ?? "—"}`}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {preview && (
        <Card>
          <div className="row-between">
            <h2 className="cell-main">Preview — the page the server would write</h2>
            <Btn iconOnly icon={<X size={14} />} title="Close the preview" onClick={() => setPreview(null)} />
          </div>
          <p className="cell-sub">
            Composed from this item and the site's own page furniture, right now. The iframe is sandboxed and
            the server escapes every string, so this is exactly what publishing would produce.
          </p>
          {preview.preview ? (
            <iframe
              title="Article preview"
              sandbox=""
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;margin:0;padding:24px;max-width:820px}img{max-width:100%;height:auto}.dx-body{margin-top:24px}</style></head><body>${preview.preview}</body></html>`}
              style={{ width: "100%", height: 420, border: "1px solid var(--line)", borderRadius: 10 }}
            />
          ) : (
            <Note tone="warn" title="Nothing to preview">
              This draft cannot be composed: check the body and the images. The message above says what the server refused.
            </Note>
          )}
        </Card>
      )}

      {/* The AI settings sit at the foot of the Content screen: they are what the writing help uses, and
          nothing above depends on them. The panel handles its own permission — an editor is told, in one
          line, that the keys are the owner's, rather than being shown a form that cannot save. */}
      <AiSettings />
    </>
  );
}

/** One section's fields. Every kind gets the ones it needs, and nothing else. */
function renderSection(sec: ContentSection, patch: (p: Partial<ContentSection>) => void) {
  switch (sec.kind) {
    case "heading":
      return (
        <div className="row">
          <select className="input" style={{ maxWidth: 120 }} value={sec.level ?? 2} onChange={(e) => patch({ level: Number(e.target.value) })}>
            <option value={2}>Heading 2</option>
            <option value={3}>Heading 3</option>
          </select>
          <input className="input grow" value={sec.text ?? ""} placeholder="The heading" onChange={(e) => patch({ text: e.target.value })} />
        </div>
      );
    case "list":
      return (
        <div className="stack">
          <textarea className="input" rows={4} value={(sec.items ?? []).join("\n")} placeholder="One item per line"
            onChange={(e) => patch({ items: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
          <label className="row">
            <input type="checkbox" checked={Boolean(sec.ordered)} onChange={(e) => patch({ ordered: e.target.checked })} />
            <span className="cell-sub">Numbered</span>
          </label>
        </div>
      );
    case "image":
      return (
        <div className="stack">
          <input className="input mono" value={sec.url ?? ""} placeholder="/assets/img/… (from the media library)"
            onChange={(e) => patch({ url: e.target.value })} />
          <input className="input" value={sec.alt ?? ""} placeholder="What the picture shows, for someone who cannot see it"
            onChange={(e) => patch({ alt: e.target.value })} />
          <input className="input" value={sec.caption ?? ""} placeholder="Caption (optional)" onChange={(e) => patch({ caption: e.target.value })} />
        </div>
      );
    case "facts":
      return (
        <textarea className="input" rows={3} value={rowsToText(sec.items)} placeholder="Label | Value, one per line"
          onChange={(e) => patch({ items: textToRows("facts", e.target.value) as string[] })} />
      );
    case "faq":
      return (
        <textarea className="input" rows={4} value={rowsToText(sec.items)} placeholder="Question | Answer, one per line"
          onChange={(e) => patch({ items: textToRows("faq", e.target.value) as string[] })} />
      );
    case "related":
      return (
        <textarea className="input" rows={3} value={rowsToText(sec.links)} placeholder="Label | /address or https://…, one per line"
          onChange={(e) => patch({ links: textToRows("related", e.target.value) as { label: string; href: string }[] })} />
      );
    case "cta":
      return (
        <div className="stack">
          <input className="input" value={sec.text ?? ""} placeholder="A sentence above the button (optional)" onChange={(e) => patch({ text: e.target.value })} />
          <div className="row">
            <input className="input" value={sec.label ?? ""} placeholder="Button label" onChange={(e) => patch({ label: e.target.value })} />
            <input className="input mono" value={sec.href ?? ""} placeholder="/contact/" onChange={(e) => patch({ href: e.target.value })} />
          </div>
        </div>
      );
    case "quote":
      return (
        <div className="stack">
          <textarea className="input" rows={2} value={sec.text ?? ""} onChange={(e) => patch({ text: e.target.value })} />
          <input className="input" value={sec.by ?? ""} placeholder="Who said it" onChange={(e) => patch({ by: e.target.value })} />
        </div>
      );
    default:
      return (
        <textarea
          className="input"
          rows={sec.kind === "lead" ? 2 : 6}
          value={sec.text ?? ""}
          placeholder={sec.kind === "para" ? "Plain text. A blank line starts a new paragraph." : ""}
          onChange={(e) => patch({ text: e.target.value })}
        />
      );
  }
}
