/**
 * LivePages — the site's pages and their history, grouped by change.
 *
 * This is the screen that closes the Phase 3 gate. The gate's sentence has three parts — an editor
 * publishes an article, the header changes across 150 pages, the change is rolled back from page history
 * — and the third part needs one thing above all: **a person must be able to see what changed, as a
 * change.** A list of file versions cannot do that. The change that rewrote 148 pages is 148 rows with one
 * batch id, and 148 rows is a wall that hides the single undo button that matters.
 *
 * So the history tab shows *changes*: "148 pages · header/footer updated · 4 minutes ago · Imtiaz" with
 * one **Undo this change** button. Pressing it calls `POST /pages/rollback` with that batch, which restores
 * the oldest version of every page in it and returns a *new* batch id — the undo is itself undoable, and
 * the screen says so rather than leaving the person to wonder.
 *
 * The pages tab is deliberately quiet: which folders exist, which pages the site has, which ones were
 * written by a newer version of v2.1 than the index knows about (`stale` — the v2.1 case of a file edited
 * by hand), and how many versions each one has. Selecting a page shows its versions, and any of them can be
 * put back.
 */
import { useEffect, useMemo, useState } from "react";
import { FileStack, History, RefreshCw, SquarePen, Undo2, X } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type PageChange, type PageDetail, type PageKindsView, type PageState, type PagesData,
  type PublishResult, type RollbackResult,
} from "../lib/live";
import { bytes, timeAgo } from "../lib/format";

type Tab = "pages" | "history";
type ViewId = "all" | "service" | "city" | "articles" | "machinery";
type StatusWord = "published" | "hidden" | "draft";

/**
 * Which view of the site a page belongs to.
 *
 * v2.1's "services" screen was not a collection of its own: it was a *view* of the pages — every page whose
 * kind is not a city, that is not an article or a case study, and that is not the machinery — and "cities"
 * was the same list filtered the other way. The kind is the page's own `<body data-page="…">`, so it is read
 * from `/content/pages` rather than decided here, and a page nobody classified reads as a service page
 * because that is what it most likely is; the row shows the kind it actually has.
 */
function pageView(rel: string, kind: string): Exclude<ViewId, "all"> {
  if (/^(insights|projects)\//.test(rel)) return "articles";
  if (/^(404|500|503|coming-soon)\.html$/.test(rel) || rel.startsWith("builder/")) return "machinery";
  return kind === "city" ? "city" : "service";
}

/** A page's status, with the words v2.1 used for the same three states. */
function statusLabel(status: string): string {
  return status === "draft" ? "Draft" : status === "hidden" ? "Hidden" : "Published";
}

/** Where a draft starts: the page's own facts, as the server reported them. */
function draftOf(s: PageState): { status: StatusWord; noindex: boolean; title: string; description: string } {
  return { status: s.status, noindex: !s.indexable, title: s.title, description: s.description };
}

export function LivePages() {
  const { link, reason } = useSession();
  const [tab, setTab] = useState<Tab>("pages");
  const [folder, setFolder] = useState("");
  const [q, setQ] = useState("");
  const [rel, setRel] = useState<string | null>(null);

  const pages = useLive<PagesData>("/pages");
  /* The kind of every page, from its own `<body data-page>`: the one read behind the service/city views.
     With no answer the screen says so and shows every page — it does not guess a classification. */
  const kinds = useLive<PageKindsView>("/content/pages");
  const history = useLive<{ changes: PageChange[]; grouped: boolean }>(tab === "history" ? "/pages/history?limit=40" : null, tab);
  const detail = useLive<PageDetail>(rel === null ? null : `/pages/${rel}`, rel);

  const [result, setResult] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  /* The editor: the page's HTML and the `mtime` it was loaded at. Sending that mtime back is what turns
     "two people edited one page" from a silent overwrite into a refusal — see the conflict branch below. */
  const [edit, setEdit] = useState<{ rel: string; html: string; mtime: number | null } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newHtml, setNewHtml] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  /* The title of the page a copy came from, so the copy can be named "<title> (copy)" rather than carrying
     the original's title into Google beside it. */
  const [copyTitle, setCopyTitle] = useState("");
  const [view, setView] = useState<ViewId>("all");
  /* What the publish card is about to do. Held here, cleared when another page is opened or the publish
     succeeds, and re-filled from the server's own answer — the screen never carries a status forward from
     one page to the next. */
  const [draft, setDraft] = useState<{ status: StatusWord; noindex: boolean; title: string; description: string } | null>(null);

  useEffect(() => {
    setResult(null);
    setBad(null);
    setEdit(null);
    setDraft(null);
    setConflict(false);
  }, [tab, rel]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setBad(null);
    try {
      return await fn();
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /* The publish card starts from what the server says about the page, and only once: after that it holds
     what the person has changed. Opening another page clears it (the effect above), so a status can never
     travel from one page to the next. */
  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setDraft((cur) => (cur === null ? draftOf(d.state) : cur));
  }, [detail.data]);

  /**
   * Publish, hide or draft the open page — v2.1's page settings screen, which is where its `page_meta_save`
   * was called from.
   *
   * The title and the description travel with it because that is when somebody is looking at the page's line
   * in Google, and because the route treats an absent field as "leave it alone": this screen sends what the
   * person can see, and nothing it does not know about.
   */
  async function publish() {
    if (!detail.data || !draft) return;
    const rel = detail.data.rel;
    const r = await run(
      () => api.post<PublishResult | { pending: true; message: string }>(`/pages/${rel}/publish`, { ...draft }),
    );
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "status" in r) {
      const what = r.status === "published"
        ? (r.noindex ? "published, and kept out of search" : "published")
        : r.status === "hidden" ? "hidden from the site" : "saved as a draft";
      setResult(
        `/${r.rel} is ${what}. ${r.listed ? "Its address is in the sitemap" : "Its address is not in the sitemap"}` +
        `${r.sitemapChanged ? " — that just changed" : ""}. ` +
        `${r.wrote ? `The head was written as version ${r.version}, so the change is one undo in the history.` : "Nothing in the file itself had to change."} ` +
        "Publishing it again is how this is reversed; the change is in the audit log either way.",
      );
      setDraft(null);
      detail.reload();
      pages.reload();
      history.reload();
    }
  }

  /**
   * Start from a page that already looks right.
   *
   * v2.1's Duplicate, and the reason its "new service page" produced a page that matched the site: the copy
   * *is* the other page — header, footer, styling and all — so a new page never starts as a blank document.
   * The address is suggested the way v2.1 suggested it (`<name>-copy` beside the original).
   */
  async function loadCopy(from: string) {
    setCopyFrom(from);
    if (from === "") {
      return;
    }
    const d = await run(() => api.get<PageDetail>(`/pages/${from}`));
    if (!d) return;
    setNewHtml(d.html);
    const bare = from.replace(/\/?index\.html$/, "");
    const parts = bare.split("/");
    const name = parts.pop() ?? "";
    setNewFolder(parts.join("/"));
    setNewSlug(`${name}-copy`);
    setCopyTitle(d.state?.title ?? "");
    setResult(`${d.rel} copied into the box below${d.state ? ` — it is ${statusLabel(d.state.status).toLowerCase()}` : ""}. Change the address, then create it: it is saved as a draft.`);
  }

  /** Undo a whole change — the gate's last sentence, in one call. */
  async function undo(batch: string) {
    const r = await run(
      () => api.post<RollbackResult | { pending: true; message: string }>("/pages/rollback", { batch }),
    );
    setResult(null);
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "restored" in r) {
      const extra = [
        r.missing.length ? `${r.missing.length} page${r.missing.length === 1 ? " is" : "s are"} no longer on disk` : "",
        r.errors.length ? `${r.errors.length} could not be written` : "",
      ].filter(Boolean).join("; ");
      setResult(
        `Put ${r.restored.length} page${r.restored.length === 1 ? "" : "s"} back to how they were before this change` +
        `${extra ? ` (${extra})` : ""}. That undo is itself a change — batch ${r.undoBatch.slice(0, 8)} — so it can be undone too.`,
      );
      history.reload();
      pages.reload();
    }
  }

  /** Start editing a page: its HTML and the mtime it is being edited from. */
  function startEdit(d: PageDetail) {
    setEdit({ rel: d.rel, html: d.html, mtime: d.mtime ? Math.floor(new Date(d.mtime.replace(" ", "T") + "Z").getTime() / 1000) : null });
    setConflict(false);
    setResult(null);
  }

  /**
   * Save the page.
   *
   * A 409 is the interesting case and it is not an error to hide: the page changed on the server since it
   * was opened, so the API refuses rather than overwriting somebody else's work. The screen then offers the
   * same two things the message does — reload, or save again to replace what is there.
   */
  async function savePage(force: boolean) {
    if (!edit) return;
    const r = await run(
      () => api.post<{ rel: string; bytes: number; batch: string; version: number; mtime: number } | { pending: true; message: string }>(
        "/pages", { rel: edit.rel, html: edit.html, mtime: force ? null : edit.mtime, force, note: "edited in the admin" },
      ),
    );
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "bytes" in r) {
      setConflict(false);
      setResult(`Saved ${edit.rel} (${r.bytes.toLocaleString()} bytes). It is version ${r.version} in the history, so this edit is one undo — batch ${r.batch.slice(0, 8)}.`);
      setEdit((e) => (e ? { ...e, mtime: r.mtime } : e));
      detail.reload();
      pages.reload();
      history.reload();
    } else if (bad?.status === 409) {
      setConflict(true);
    }
  }

  /** Create a page at an address nobody has taken. */
  async function createPage() {
    const r = await run(
      () => api.post<{ rel: string; url: string; batch: string } | { pending: true; message: string }>(
        "/pages/new", { folder: newFolder, slug: newSlug, html: newHtml },
      ),
    );
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "rel" in r) {
      setCreating(false);
      setNewSlug("");
      setCopyFrom("");
      setRel(r.rel);
      pages.reload();
      /* v2.1 started a new page as a draft, and that is not a detail: a page that is public the moment it is
         created is a page in the sitemap before anybody has looked at it. The title is set to say what it
         is — a copy otherwise carries the original's title, and two pages with one title is a search result
         decided by a coin toss. */
      const asDraft = await run(
        () => api.post<PublishResult | { pending: true; message: string }>(`/pages/${r.rel}/publish`, {
          status: "draft",
          ...(copyTitle ? { title: `${copyTitle} (copy)` } : {}),
        }),
      );
      setCopyTitle("");
      const draftLine = asDraft === null
        ? ""
        : isPending(asDraft)
          ? ` ${asDraft.message}`
          : " It is a draft: not in the sitemap, and search engines are told to skip it until you publish it.";
      setResult(`Created ${r.url} — version ${r.batch.slice(0, 8)} in the history.${draftLine}`);
      detail.reload();
      history.reload();
    }
  }

  /** Put one version of one page back. `versionId` is the history row, which is what the API restores. */
  async function restore(relName: string, versionId: number) {
    const r = await run(
      () => api.post<{ rel: string; version: number } | { pending: true; message: string }>(
        `/pages/${relName}/restore`, { version: versionId },
      ),
    );
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "version" in r) {
      setResult(`${relName} is back to history version #${versionId}. What it replaced was written to the history first, so this restore is itself reversible.`);
      detail.reload();
      history.reload();
      pages.reload();
    }
  }

  /** What each view holds, so the filter says how much is in it before it is picked. */
  const viewCounts = useMemo(() => {
    const out: Record<ViewId, number> = { all: 0, service: 0, city: 0, articles: 0, machinery: 0 };
    for (const p of pages.data?.pages ?? []) {
      out.all++;
      out[pageView(p.rel, kinds.data?.kinds[p.rel] ?? "")]++;
    }
    return out;
  }, [pages.data, kinds.data]);

  const filtered = useMemo(() => {
    const list = pages.data?.pages ?? [];
    return list
      .filter((p) => (view === "all" ? true : pageView(p.rel, kinds.data?.kinds[p.rel] ?? "") === view))
      .filter((p) => (folder === "" ? true : (p.folder === "" ? "(root)" : p.folder) === folder))
      .filter((p) => (q === "" ? true : p.rel.toLowerCase().includes(q.toLowerCase()) || (p.title ?? "").toLowerCase().includes(q.toLowerCase())));
  }, [pages.data, kinds.data, folder, q, view]);

  /** A page's status and its kind, both from the server: the list shows them without a request per row. */
  const statusOf = (rel: string) => pages.data?.state?.[rel]?.status ?? "published";
  const kindOf = (rel: string) => kinds.data?.kinds[rel] ?? "";

  /* ---------------- the states that must not lie ---------------- */

  if (link !== "live") {
    return (
      <>
        <PageHead title="All pages" sub="Every public page, and the history of every change" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. The 150 pages are on the server and could be edited by hand, but this screen will not show a list it cannot read."
            : "Sign in to see the pages and their history."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!pages.data && pages.loading) {
    return (
      <>
        <PageHead title="All pages" sub="Every public page, and the history of every change" />
        <Card><div className="muted" style={{ padding: 18 }}>Loading…</div></Card>
      </>
    );
  }

  if (!pages.data && pages.error) {
    return (
      <>
        <PageHead title="All pages" sub="Every public page, and the history of every change" />
        <Note tone="danger" title="The page list could not be read">{pages.error.message}</Note>
      </>
    );
  }

  const data = pages.data;

  return (
    <>
      <PageHead
        title="All pages"
        sub={
          data
            ? `${data.count} pages${data.missing.length ? ` · ${data.missing.length} indexed and no longer on disk` : ""}${data.stale ? ` · ${data.stale} changed outside v2.5` : ""}`
            : ""
        }
        actions={
          <>
            <Btn icon={<RefreshCw size={15} />} onClick={() => { pages.reload(); history.reload(); }}>Refresh</Btn>
            <Btn
              variant="primary"
              icon={<FileStack size={15} />}
              onClick={() => {
                setTab("pages");
                setCreating(true);
                /* Starting from the page that is already open is the honest default: a new page that looks
                   like the site is a copy of the site, not a blank document. */
                setNewHtml(detail.data?.html ?? "");
                setNewFolder("");
                setNewSlug("");
              }}
            >
              New page
            </Btn>
          </>
        }
      />

      {data && data.missing.length > 0 && (
        <Note tone="warn" title={`${data.missing.length} indexed page${data.missing.length === 1 ? " is" : "s are"} not on disk`}>
          The index remembers files that are gone — {data.missing.slice(0, 4).join(", ")}{data.missing.length > 4 ? ` and ${data.missing.length - 4} more` : ""}. Its history is safe; nobody can restore a page to a file that is not there.
        </Note>
      )}
      {data && data.stale > 0 && (
        <Note tone="info" title={`${data.stale} page${data.stale === 1 ? "" : "s"} changed outside v2.5`}>
          The size on disk does not match the size in the index, which means something else wrote the file.
          Opening the page's history will record the current bytes as a version — nothing is lost either way,
          but the history is only useful if the newest version is the one that is live.
        </Note>
      )}

      {result && <Note tone="ok" title="Done">{result}</Note>}
      {bad && <Note tone="danger" title="That did not work">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}

      <div className="toolbar">
        <Seg
          options={[{ id: "pages", label: "Pages" }, { id: "history", label: "History" }]}
          value={tab}
          onChange={(t) => setTab(t as Tab)}
        />
        {tab === "pages" && (
          <>
            <div className="grow" />
            {kinds.data ? (
              <Seg
                options={[
                  { id: "all", label: `Every page (${viewCounts.all})` },
                  { id: "service", label: `Service pages (${viewCounts.service})` },
                  { id: "city", label: `City pages (${viewCounts.city})` },
                  { id: "articles", label: `Articles & studies (${viewCounts.articles})` },
                ]}
                value={view === "machinery" ? "all" : view}
                onChange={(v) => setView(v as ViewId)}
              />
            ) : (
              /* The kinds come from each page's own `<body data-page>`. With no answer the screen says so:
                 a filter that guessed which pages were services would be a second opinion about the site. */
              <span className="cell-sub" title={kinds.error?.message}>
                {kinds.loading ? "Reading the page kinds…" : "The page kinds could not be read, so this is every page."}
              </span>
            )}
            <Seg
              options={[{ id: "", label: "Every folder" }, ...Object.entries(data?.folders ?? {}).map(([f, n]) => ({ id: f, label: `${f} (${n})` }))]}
              value={folder}
              onChange={setFolder}
            />
            <input className="input" placeholder="Filter by address or title…" value={q} onChange={(e) => setQ(e.target.value)} />
          </>
        )}
      </div>

      {tab === "history" && (
        <Card>
          <h2 className="cell-main">Recent changes</h2>
          <p className="cell-sub">
            One entry per change, not per file: the header across 148 pages is one line with one undo. A
            change with no batch id is a single write from before batches existed — it cannot be undone as a
            group, and the screen says so instead of guessing.
          </p>
          {!history.data && history.loading && <div className="muted" style={{ padding: 18 }}>Loading…</div>}
          {history.data && history.data.changes.length === 0 && (
            <Empty title="Nothing has been written yet" sub="Every page write is recorded here the first time it happens." />
          )}
          {history.data && history.data.changes.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Change</th><th>Pages</th><th>When</th><th>By</th><th></th></tr>
                </thead>
                <tbody>
                  {history.data.changes.map((c) => (
                    <tr key={c.batch || `${c.at}-${c.sample[0]}`}>
                      <td>
                        <span className="cell-main">{c.note || "(no note)"}</span>
                        <span className="cell-sub mono truncate">
                          {c.sample.slice(0, 3).join(", ")}{c.pages > 3 ? ` and ${c.pages - 3} more` : ""}
                        </span>
                      </td>
                      <td className="nowrap">
                        {c.pages} page{c.pages === 1 ? "" : "s"}
                        <span className="cell-sub"> · {bytes(c.bytes)}</span>
                      </td>
                      <td className="nowrap">{timeAgo(c.at)}</td>
                      <td>{c.by || "—"}</td>
                      <td>
                        {c.undoable ? (
                          <Btn icon={<Undo2 size={14} />} onClick={() => undo(c.batch)} disabled={busy}
                            title={`Put all ${c.pages} page${c.pages === 1 ? "" : "s"} in this change back to the version before it`}>
                            Undo this change
                          </Btn>
                        ) : (
                          <Pill tone="neutral" title="This version predates batch ids, so there is no group to undo — open the page and restore the version instead.">
                            Open the page
                          </Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "pages" && creating && (
        <Card>
          <div className="row-between">
            <h2 className="cell-main">New page</h2>
            <Btn iconOnly icon={<X size={14} />} title="Cancel" onClick={() => setCreating(false)} />
          </div>
          <label className="stack">
            <span className="field-label">Start from</span>
            <select className="input" value={copyFrom} onChange={(e) => loadCopy(e.target.value)} disabled={busy}>
              <option value="">{newHtml.trim() === "" ? "Type the HTML below" : "Keep what is in the box"}</option>
              {(pages.data?.pages ?? []).map((p) => (
                <option key={p.rel} value={p.rel}>{`${p.title || p.rel} — /${p.rel}`}</option>
              ))}
            </select>
            <span className="cell-sub">
              A copy keeps the page's header, footer and styling, because it *is* that page — v2.1's answer to
              "make a new service page", and the reason a new page never starts as a blank document. The copy
              is saved as a draft under a “(copy)” title.
            </span>
          </label>
          <div className="grid-2">
            <label className="stack">
              <span className="field-label">Folder (leave empty for the site root)</span>
              <input className="input mono" value={newFolder} placeholder="interior-design" onChange={(e) => setNewFolder(e.target.value)} />
            </label>
            <label className="stack">
              <span className="field-label">Address</span>
              <input className="input mono" value={newSlug} placeholder="lahore-fit-out" onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
              <span className="cell-sub">
                The page will live at /{newFolder ? `${newFolder}/` : ""}{newSlug || "…"}/index.html — the address is the directory, so it cannot be changed later without moving the page.
              </span>
            </label>
          </div>
          <label className="stack">
            <span className="field-label">HTML — a complete document</span>
            <textarea className="input mono" rows={12} value={newHtml} onChange={(e) => setNewHtml(e.target.value)} />
            <span className="cell-sub">
              {newHtml.trim() === ""
                ? "Pick a page on the left first and press New page again to start from a copy of it — a new page that looks like the site is a copy of the site."
                : `${newHtml.length.toLocaleString()} characters. Only the owner can add scripts, embeds or on…= handlers; keeping what the copied page already has is always allowed.`}
            </span>
          </label>
          <div className="row">
            <Btn variant="primary" onClick={createPage} disabled={busy || newSlug.trim() === "" || newHtml.trim() === ""}>Create the page</Btn>
            <Btn onClick={() => setCreating(false)} disabled={busy}>Cancel</Btn>
          </div>
        </Card>
      )}

      {tab === "pages" && edit && (
        <Card>
          <div className="row-between">
            <h2 className="cell-main">Editing <span className="mono">/{edit.rel}</span></h2>
            <div className="row">
              <Btn variant="primary" onClick={() => savePage(false)} disabled={busy}>Save page</Btn>
              <Btn iconOnly icon={<X size={14} />} title="Close without saving" onClick={() => setEdit(null)} disabled={busy} />
            </div>
          </div>
          {conflict && (
            <Note tone="warn" title="This page changed on the server since you opened it">
              <div className="row-between">
                <span>
                  Saving now would replace somebody else's edit. Reload to see what is there and make your
                  change again — or save anyway, and this edit replaces theirs.
                </span>
                <div className="row">
                  <Btn onClick={() => { setEdit(null); detail.reload(); }}>Reload the page</Btn>
                  <Btn variant="primary" onClick={() => savePage(true)} disabled={busy}>Save anyway</Btn>
                </div>
              </div>
            </Note>
          )}
          <textarea
            className="input mono"
            rows={20}
            value={edit.html}
            onChange={(e) => setEdit({ ...edit, html: e.target.value })}
            spellCheck={false}
          />
          <p className="cell-sub">
            {edit.html.length.toLocaleString()} characters. Saving writes the page through the versioned
            writer: the version it replaces is kept, and the whole write is one batch in the history.
          </p>
        </Card>
      )}

      {tab === "pages" && (
        <div className="content-split">
          <Card>
            <h2 className="cell-main">{filtered.length} pages</h2>
            {filtered.length === 0 ? (
              <Empty title="Nothing matches" sub="Try another folder or clear the filter." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Page</th><th>Size</th><th>Versions</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.rel} className={rel === p.rel ? "is-selected" : undefined} style={{ cursor: "pointer" }} onClick={() => setRel(p.rel)}>
                        <td>
                          <span className="cell-main">
                            {p.title || p.rel}
                            {statusOf(p.rel) !== "published" && (
                              <Pill tone={statusOf(p.rel) === "draft" ? "warn" : "neutral"}>{statusLabel(statusOf(p.rel))}</Pill>
                            )}
                          </span>
                          <span className="cell-sub mono truncate">
                            /{p.rel}{kindOf(p.rel) ? ` · ${kindOf(p.rel)}` : ""}
                          </span>
                        </td>
                        <td className="nowrap mono">{bytes(p.bytes)}</td>
                        <td className="nowrap">
                          {p.versions || "—"}
                          {p.stale && <Pill tone="warn" title="The file on disk is not the size the index recorded">changed</Pill>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            {!rel ? (
              <Empty title="Nothing selected" sub="Pick a page to see its versions and restore one." />
            ) : !detail.data && detail.loading ? (
              <div className="muted" style={{ padding: 18 }}>Loading…</div>
            ) : detail.error ? (
              <Note tone="danger" title="That page could not be read">{detail.error.message}</Note>
            ) : detail.data ? (
              /* Both panels are their own components: the narrowing of `detail.data` cannot travel into the
                 callbacks defined in the same render, and a prop is a better answer than a cast. */
              <div className="stack">
                <PublishPanel
                  p={detail.data}
                  busy={busy}
                  draft={draft}
                  onDraft={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
                  onPublish={publish}
                />
                <PagePanel p={detail.data} busy={busy} onRestore={restore} onEdit={startEdit} />
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </>
  );
}

/**
 * Where one page is public.
 *
 * Three facts, and all three come from the server: whether the page is published, whether search engines are
 * told to skip it, and whether `sitemap.xml` lists it. v2.1's page settings screen was this card — status,
 * title, description, one checkbox about search — and the sentence under the status buttons is the point of
 * it: "hidden" and "not in the sitemap" are the same decision, made once, and a person should be able to read
 * what pressing the button does before they press it.
 */
function PublishPanel({
  p, busy, draft, onDraft, onPublish,
}: {
  p: PageDetail;
  busy: boolean;
  draft: { status: StatusWord; noindex: boolean; title: string; description: string } | null;
  onDraft: (patch: Partial<{ status: StatusWord; noindex: boolean; title: string; description: string }>) => void;
  onPublish: () => void;
}) {
  if (!draft) {
    return <div className="muted" style={{ padding: 18 }}>Loading…</div>;
  }
  const changed =
    draft.status !== p.state.status ||
    draft.noindex !== !p.state.indexable ||
    draft.title !== p.state.title ||
    draft.description !== p.state.description;
  const consequence = draft.status !== "published"
    ? `A ${draft.status} page is not public: search engines are told not to index it, and its address comes out of sitemap.xml.`
    : draft.noindex
      ? "The page stays public, but search engines are told to skip it and its address comes out of sitemap.xml."
      : "Public, open to search engines, and listed in sitemap.xml.";

  return (
    <div className="stack">
      <div className="row-between">
        <h2 className="cell-main">Where this page is public</h2>
        <div className="row">
          <Pill tone={p.state.status === "published" ? "ok" : "warn"}>{statusLabel(p.state.status)}</Pill>
          <Pill tone={p.state.inSitemap ? "ok" : "neutral"}>{p.state.inSitemap ? "in the sitemap" : "not in the sitemap"}</Pill>
          <Pill tone={p.state.indexable ? "ok" : "neutral"}>{p.state.indexable ? "open to search" : "search told to skip"}</Pill>
        </div>
      </div>

      <div className="grid-2">
        <label className="stack">
          <span className="field-label">Title — the line Google shows</span>
          <input className="input" value={draft.title} onChange={(e) => onDraft({ title: e.target.value })} />
        </label>
        <label className="stack">
          <span className="field-label">Description</span>
          <input className="input" value={draft.description} onChange={(e) => onDraft({ description: e.target.value })} />
        </label>
      </div>

      <label className="stack">
        <span className="field-label">Status</span>
        <Seg
          options={[
            { id: "published", label: "Published" },
            { id: "hidden", label: "Hidden" },
            { id: "draft", label: "Draft" },
          ]}
          value={draft.status}
          onChange={(v) => onDraft({ status: v as StatusWord })}
        />
        <span className="cell-sub">{consequence}</span>
      </label>

      {draft.status === "published" && (
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <Switch checked={draft.noindex} onChange={(v) => onDraft({ noindex: v })} label="Keep this page out of search engines" />
          <span className="cell-sub">Keep it out of search engines without unpublishing it</span>
        </label>
      )}

      <div className="row-between">
        <Btn variant="primary" onClick={onPublish} disabled={busy || !changed}>
          {busy ? "Working…" : changed ? "Publish this change" : "Nothing to publish"}
        </Btn>
        <span className="cell-sub">
          The page is written through the versioned writer, so a publish is one undo in the history below.
        </span>
      </div>
    </div>
  );
}

/** One page's versions, with the restore button for each. */
function PagePanel({
  p, busy, onRestore, onEdit,
}: {
  p: PageDetail;
  busy: boolean;
  onRestore: (rel: string, versionId: number) => void;
  onEdit: (d: PageDetail) => void;
}) {
  return (
<div className="stack">
                <div className="row-between">
                  <h2 className="cell-main">{p.index?.title || p.rel}</h2>
                  <span className="cell-sub mono">/{p.rel}</span>
                </div>
                <div className="row">
                  <Pill tone="neutral">{bytes(p.bytes)}</Pill>
                  <Btn icon={<SquarePen size={14} />} onClick={() => onEdit(p)} disabled={busy} title="Edit this page's HTML">
                    Edit HTML
                  </Btn>
                  <Pill tone={p.fresh ? "ok" : "warn"} title={p.fresh ? "The index agrees with the file on disk" : "The file on disk differs from the index"}>
                    {p.fresh ? "index agrees with disk" : "changes outside v2.5"}
                  </Pill>
                  {p.index?.updatedBy && <Pill tone="neutral" title={`Last written through v2.5 by ${p.index.updatedBy}`}>{p.index.updatedBy}</Pill>}
                </div>
                <p className="cell-sub">
                  {p.versions.length === 0
                    ? "No versions yet: this page has not been written through v2.5. The first write records the version it replaces."
                    : `${p.versions.length} version${p.versions.length === 1 ? "" : "s"} — the newest first. Restoring one writes a new version, so a restore can itself be undone.`}
                </p>
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>When</th><th>By</th><th>Note</th><th>Size</th><th></th></tr></thead>
                    <tbody>
                      {p.versions.map((v) => (
                        <tr key={v.id}>
                          <td className="nowrap">{timeAgo(v.at)}</td>
                          <td>{v.by || "—"}</td>
                          <td className="truncate">{v.note || "—"}{v.restoredFrom ? ` (restored from #${v.restoredFrom})` : ""}</td>
                          <td className="nowrap mono">{bytes(v.bytes)}</td>
                          <td>
                            <Btn icon={<History size={14} />} onClick={() => onRestore(p.rel, v.id)} disabled={busy}>
                              Restore
                            </Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="cell-sub">
                  <FileStack size={13} /> The history is per page; the *change* across many pages is on the
                  History tab, where one undo puts every page in it back.
                </p>
              </div>
  );
}
