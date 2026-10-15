/**
 * LiveLibrary — the section library, and the global sections that live inside pages.
 *
 * A block is a piece of a page: a hero, a services grid, a testimonial band. The library exists so that the
 * fifth page reuses the first page's hero instead of inventing a sixth one, and so that "the phone number in
 * that band is wrong" is one edit rather than 150.
 *
 * The screen is built around the one distinction that matters, and it is a distinction in *where the block
 * lives*:
 *
 *   · A **library block** is a piece of HTML you copy into a page. The page holds its own copy from the
 *     moment it is inserted — editing the library block afterwards changes nothing that is already live.
 *   · A **global section** is inserted by reference. The block's root element carries
 *     `data-wx-global="<token>"` in the page, and that token is the tie to the library. Editing the block and
 *     pressing **Push** rewrites every page carrying the token — and because those pages are written through
 *     the versioned page writer, that push is one batch with one undo, and the screen says so.
 *
 * Deleting is where the difference turns into a decision: a global section that is in use is refused, and
 * the screen then offers the honest alternative — delete it and leave the markup on the pages, detached. That
 * is what "delete anyway" means here, and it says so instead of just doing it.
 */
import { useEffect, useMemo, useState } from "react";
import { Blocks, Eye, Plus, RefreshCw, Rocket, Trash2, X } from "lucide-react";
import { Btn, Card, Empty, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type Block, type BlockSaveResult, type BlocksData, type BlocksUsage, type BlockSyncResult,
} from "../lib/live";
import { bytes, timeAgo } from "../lib/format";

export function LiveLibrary() {
  const { link, reason } = useSession();
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [globalOnly, setGlobalOnly] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const library = useLive<BlocksData>("/blocks");
  const usage = useLive<BlocksUsage>("/blocks/usage");

  const [draft, setDraft] = useState<Block | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const blocks = library.data?.blocks ?? [];

  useEffect(() => {
    setResult(null);
    setBad(null);
    setConfirmDelete(false);
    setShowPreview(false);
    if (sel === null) {
      setDraft(null);
      return;
    }
    const b = blocks.find((x) => x.blk === sel);
    setDraft(b ? { ...b } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const filtered = useMemo(
    () =>
      blocks
        .filter((b) => (cat === "" ? true : b.cat === cat))
        .filter((b) => (globalOnly ? b.global : true))
        .filter((b) =>
          q === "" ? true : b.name.toLowerCase().includes(q.toLowerCase()) || b.tags.some((t) => t.includes(q.toLowerCase())),
        ),
    [blocks, cat, globalOnly, q],
  );

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

  function openNew() {
    setSel("new");
    setIsNew(true);
    setDraft({
      blk: "", name: "", kind: "section", cat: cat || "Custom", tags: [], global: false, bytes: 0,
      html: "", createdAt: "", updatedAt: "", updatedBy: "",
    });
    setResult(null);
  }

  async function save() {
    if (!draft) return;
    const body = {
      blk: isNew ? "" : draft.blk,
      name: draft.name,
      cat: draft.cat,
      tags: draft.tags,
      global: draft.global,
      kind: draft.kind,
      html: draft.html,
    };
    const r = await run(() => api.post<BlockSaveResult | { pending: true; message: string }>("/blocks", body));
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "block" in r) {
      setIsNew(false);
      setSel(r.block.blk);
      setDraft(r.block);
      setResult(
        r.block.global
          ? `Saved. ${r.canPush ? `It is used on ${r.usedOn.length} page${r.usedOn.length === 1 ? "" : "s"} — push it to bring them up to date.` : "No page carries it yet, so there is nothing to push."}`
          : "Saved as a library block. Pages that already used it keep the copy they have — only a global section is pushed.",
      );
      library.reload();
      usage.reload();
    }
  }

  async function push() {
    if (!draft || isNew) return;
    const r = await run(() => api.post<BlockSyncResult | { pending: true; message: string }>(`/blocks/${draft.blk}/sync`, {}));
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "batch" in r) {
      setResult(
        `${r.changed.length} of ${r.usedOn.length} page${r.usedOn.length === 1 ? "" : "s"} updated${r.skipped ? ` (${r.skipped} already matched)` : ""}. ` +
        `One change, batch ${r.batch.slice(0, 8)} — undo it from the page history in one go.`,
      );
      library.reload();
      usage.reload();
    }
  }

  async function remove(force: boolean) {
    if (!draft || isNew) return;
    const r = await run(() => api.del<{ detached: string[] } | { pending: true; message: string }>(`/blocks/${draft.blk}`, { force }));
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "detached" in r) {
      setResult(
        r.detached.length
          ? `Deleted. The markup stays on ${r.detached.length} page${r.detached.length === 1 ? "" : "s"} and is no longer tied to a block.`
          : "Deleted.",
      );
      setSel(null);
      setDraft(null);
      setConfirmDelete(false);
      library.reload();
      usage.reload();
    }
  }

  async function importLegacy() {
    const r = await run(() => api.get<BlocksData>("/blocks?import=1"));
    if (r) {
      setResult(`Read ${r.import?.blocks ?? 0} block${(r.import?.blocks ?? 0) === 1 ? "" : "s"} from the v2.1 library.`);
      library.reload();
      usage.reload();
    }
  }

  const usedOn = draft && !isNew ? usage.data?.usage[draft.blk]?.pages ?? [] : [];

  /* ---------------- the states that must not lie ---------------- */

  if (link !== "live") {
    return (
      <>
        <PageHead title="Section library" sub="The reusable pieces a page is assembled from" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. The library is on the server, and this screen will not show an empty shelf that reads as “there are no blocks”."
            : "Sign in to see the section library."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!library.data && library.loading) {
    return (
      <>
        <PageHead title="Section library" sub="The reusable pieces a page is assembled from" />
        <Card><div className="muted" style={{ padding: 18 }}>Loading…</div></Card>
      </>
    );
  }

  if (!library.data && library.error) {
    return (
      <>
        <PageHead title="Section library" sub="The reusable pieces a page is assembled from" />
        <Note tone="danger" title="The library could not be read">{library.error.message}</Note>
      </>
    );
  }

  const d = library.data;

  return (
    <>
      <PageHead
        title="Section library"
        sub={
          d
            ? `${d.total} block${d.total === 1 ? "" : "s"} · ${d.globals} global section${d.globals === 1 ? "" : "s"}` +
              (usage.data ? ` · ${usage.data.placements} placement${usage.data.placements === 1 ? "" : "s"} across ${usage.data.pages} pages` : "")
            : "The reusable pieces a page is assembled from"
        }
        actions={
          <>
            <Btn icon={<RefreshCw size={15} />} onClick={() => { library.reload(); usage.reload(); }}>Refresh</Btn>
            <Btn variant="primary" icon={<Plus size={15} />} onClick={openNew}>New block</Btn>
          </>
        }
      />

      {d && d.total === 0 && (
        <Note tone="info" title="The library is empty">
          <div className="row-between">
            <span>
              v2.1 kept its blocks in <code className="mono">_private/blocks.json</code>, with the tokens written
              into the pages. Reading that file across keeps the tokens, so every global section on the site
              stays tied to its block.
            </span>
            <Btn icon={<Blocks size={15} />} onClick={importLegacy} disabled={busy}>Read the v2.1 library</Btn>
          </div>
        </Note>
      )}

      {result && <Note tone="ok" title="Done">{result}</Note>}
      {bad && <Note tone="danger" title="That did not work">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}

      <div className="toolbar">
        <Seg
          options={[{ id: "", label: `Every category (${d?.total ?? 0})` }, ...(d?.cats ?? []).filter((c) => (d?.counts[c] ?? 0) > 0).map((c) => ({ id: c, label: `${c} (${d?.counts[c] ?? 0})` }))]}
          value={cat}
          onChange={setCat}
        />
        <div className="grow" />
        <Switch label="Global sections only" checked={globalOnly} onChange={setGlobalOnly} />
        <input className="input" placeholder="Search names and tags…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="content-split">
        <Card>
          <h2 className="cell-main">{filtered.length} block{filtered.length === 1 ? "" : "s"}</h2>
          {filtered.length === 0 ? (
            <Empty title="Nothing here yet" sub={d && d.total > 0 ? "No block matches this filter." : "Add a block, or read the v2.1 library across."} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Block</th><th>Category</th><th>Used on</th><th>Updated</th></tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const pages = usage.data?.usage[b.blk]?.pages.length ?? 0;
                    return (
                      <tr key={b.blk} className={sel === b.blk ? "is-selected" : undefined} style={{ cursor: "pointer" }} onClick={() => { setSel(b.blk); setIsNew(false); }}>
                        <td>
                          <span className="cell-main">
                            {b.name}
                            {b.global && <Pill tone="info" title="Inserted into pages by reference: the page carries this block's token, so it can be pushed to every page that uses it">global</Pill>}
                          </span>
                          <span className="cell-sub">
                            {b.tags.length ? b.tags.map((t) => `#${t}`).join(" ") : "no tags"} · {bytes(b.bytes)}
                          </span>
                        </td>
                        <td>{b.cat}</td>
                        <td className="nowrap">
                          {b.global
                            ? pages > 0
                              ? `${pages} page${pages === 1 ? "" : "s"}`
                              : <span className="muted">not placed</span>
                            : <span className="muted" title="A library block is copied into a page — from that moment the page holds its own copy, and nothing here tracks it">copy</span>}
                        </td>
                        <td className="nowrap">{timeAgo(b.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          {!draft ? (
            <Empty title="Nothing selected" sub="Pick a block to edit it, or start a new one." />
          ) : (
            <div className="stack">
              <div className="row-between">
                <h2 className="cell-main">{isNew ? "New block" : draft.name || "(unnamed)"}</h2>
                <div className="row">
                  {!isNew && (
                    <>
                      {draft.global && (
                        <Btn variant="primary" icon={<Rocket size={15} />} onClick={push} disabled={busy}
                          title={usedOn.length ? `Rewrite ${usedOn.length} page${usedOn.length === 1 ? "" : "s"} that carry this section` : "No page carries this section yet"}>
                          Push to {usedOn.length} page{usedOn.length === 1 ? "" : "s"}
                        </Btn>
                      )}
                      <Btn icon={<Trash2 size={15} />} onClick={() => (confirmDelete ? remove(true) : setConfirmDelete(true))} disabled={busy}
                        title={usedOn.length ? "This section is in use — deleting it leaves the markup on the pages, detached" : "Delete this block"}>
                        {confirmDelete ? (usedOn.length ? "Delete, leave the markup" : "Confirm delete") : "Delete"}
                      </Btn>
                    </>
                  )}
                  <Btn icon={<Eye size={15} />} onClick={() => setShowPreview((v) => !v)} disabled={busy}>Preview</Btn>
                </div>
              </div>

              {confirmDelete && usedOn.length > 0 && (
                <Note tone="warn" title={`This section is used on ${usedOn.length} page${usedOn.length === 1 ? "" : "s"}`}>
                  Deleting removes the block from the library. The markup stays in {usedOn.slice(0, 3).join(", ")}
                  {usedOn.length > 3 ? ` and ${usedOn.length - 3} more` : ""}, and stops being tied to anything.
                  Pressing Delete again does that.
                </Note>
              )}

              <div className="grid grid-2">
                <label className="stack">
                  <span className="field-label">Name</span>
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="stack">
                  <span className="field-label">Category</span>
                  <select className="input" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })}>
                    {(d?.cats ?? ["Custom"]).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-2">
                <label className="stack">
                  <span className="field-label">Tags</span>
                  <input
                    className="input"
                    value={draft.tags.join(", ")}
                    placeholder="hero, home, dark"
                    onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) })}
                  />
                </label>
                <label className="stack">
                  <span className="field-label">Kind</span>
                  <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Block["kind"] })}>
                    <option value="section">Section — a band of a page</option>
                    <option value="element">Element — a smaller piece</option>
                  </select>
                </label>
              </div>

              <Switch
                label="Global section — pages that use it follow this block, and Push rewrites them"
                checked={draft.global}
                onChange={(v) => setDraft({ ...draft, global: v })}
              />
              {draft.global && (
                <p className="cell-sub">
                  A global section must be one element: the site replaces that element wherever it appears. The
                  token {isNew ? "is generated when you save" : <code className="mono">{draft.blk}</code>} goes
                  into the pages, not into the library copy.
                </p>
              )}

              <label className="stack">
                <span className="field-label">HTML</span>
                <textarea className="input mono" rows={14} value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })} />
                <span className="cell-sub">
                  Scripts, event handlers and <code className="mono">javascript:</code> links are refused here.
                  A block is pasted into pages by people who are not thinking about script injection.
                </span>
              </label>

              {!isNew && usedOn.length > 0 && (
                <div className="stack">
                  <h3 className="cell-main">Used on {usedOn.length} page{usedOn.length === 1 ? "" : "s"}</h3>
                  <p className="cell-sub mono truncate">{usedOn.slice(0, 12).join(", ")}{usedOn.length > 12 ? ` and ${usedOn.length - 12} more` : ""}</p>
                </div>
              )}

              <div className="row-between">
                <Btn variant="primary" onClick={save} disabled={busy || draft.name.trim() === "" || draft.html.trim() === ""}>Save block</Btn>
                <span className="cell-sub">
                  {isNew ? "Not in the library yet." : `Updated ${timeAgo(draft.updatedAt)} by ${draft.updatedBy || "—"}`}
                </span>
              </div>

              {showPreview && draft.html.trim() !== "" && (
                <div className="stack">
                  <div className="row-between">
                    <h3 className="cell-main">Preview</h3>
                    <Btn iconOnly icon={<X size={14} />} title="Close the preview" onClick={() => setShowPreview(false)} />
                  </div>
                  <iframe
                    title="Block preview"
                    sandbox=""
                    srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px/1.5 system-ui;margin:0;padding:12px}img{max-width:100%;height:auto}section,div{border:1px dashed #ccc}</style></head><body>${draft.html}</body></html>`}
                    style={{ width: "100%", height: 260, border: "1px solid var(--line)", borderRadius: 10 }}
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
