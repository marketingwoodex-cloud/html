/**
 * LiveMedia — the image library, its alt-text queue and its trash, from `GET /media` and `GET /media/alt`.
 *
 * The library screen the plan asks for is not a grid of thumbnails with a delete button. It answers three
 * questions a person actually has, in this order:
 *
 *   1. **Which pictures are on the site and where are they used?** Every file carries the pages that
 *      reference it, so deleting or moving one is a decision with its consequences on screen. v2.1 showed
 *      a picture and a bin icon; the result was a broken logo nobody noticed until a client did.
 *   2. **Which ones have no alt text?** A queue, sorted by how many live pages use the image, because
 *      that is the order in which it matters. An image that was looked at and left empty is not in the
 *      queue — "decorative" is a decision, and the server records the decision separately from the text.
 *   3. **What did we delete?** With what it was, who did it and whether its address is free.
 *
 * The save buttons say what they did: a Manager's change that the policy sends to the Master comes back
 * as `pending: true`, and the screen repeats that sentence instead of a green "done".
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CornerUpLeft, Eraser, ImageOff, RefreshCw, Trash2 } from "lucide-react";
import { Btn, Card, Empty, Note, Pill, PageHead, Seg } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { useLive, isPending, type AltQueueData, type MediaData, type MediaFile, type TrashRow } from "../lib/live";
import { bytes, timeAgo } from "../lib/format";

export function LiveMedia() {
  const { link, reason } = useSession();
  const media = useLive<MediaData>("/media?import=1");
  const queue = useLive<AltQueueData>("/media/alt?limit=100");
  const trash = useLive<{ items: TrashRow[]; bytes: number }>("/media/trash");

  const [tab, setTab] = useState<"library" | "alt" | "trash">("library");
  const [filter, setFilter] = useState("");
  const [altDraft, setAltDraft] = useState<Record<string, string>>({});
  const [apply, setApply] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  const files = useMemo(() => {
    const all = media.data?.files ?? [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((f) => f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q)) : all;
  }, [media.data, filter]);

  async function saveAlt(f: MediaFile, text: string) {
    setBusy(true);
    setBad(null);
    try {
      const d = await api.post<unknown>("/media/alt", { url: f.url, alt: text, apply });
      if (isPending(d)) {
        setResult(d.message);
      } else {
        const r = d as { pages: number; alt: string };
        setResult(
          r.alt === ""
            ? `${f.name}: recorded as checked with no text — it will not come back to the queue.`
            : `${f.name}: saved · written into ${r.pages} page${r.pages === 1 ? "" : "s"}`,
        );
      }
      media.reload();
      queue.reload();
    } catch (e) {
      setBad(e instanceof ApiFailure ? e : null);
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: "restore" | "purge", id: number) {
    setBusy(true);
    setBad(null);
    try {
      const d =
        kind === "restore"
          ? await api.post<unknown>(`/media/trash/${id}/restore`)
          : await api.del<unknown>(`/media/trash/${id}`);
      setResult(isPending(d) ? d.message : kind === "restore" ? "File restored." : "File deleted for good.");
      media.reload();
      trash.reload();
    } catch (e) {
      setBad(e instanceof ApiFailure ? e : null);
    } finally {
      setBusy(false);
    }
  }

  if (media.loading && !media.data) return <PageHead title="Media" sub="Loading…" />;
  if (media.error) {
    return (
      <>
        <PageHead title="Media" sub="The library could not be loaded" />
        <Note tone="danger" title={`${media.error.code} — ${media.error.message}`}>
          The library is read from the site's own folders, so an empty grid here would mean an empty
          folder — this is a failed request instead. {media.error.detail}
        </Note>
      </>
    );
  }
  if (!media.data) {
    return (
      <>
        <PageHead title="Media" sub="No data yet" />
        <Empty
          title={link === "offline" ? "api/v2 is not answering" : "Sign in to see the library"}
          sub={
            link === "offline"
              ? "The library is the site's own image folders, so there is nothing to show without the API."
              : `The API answered${reason ? ` but ${reason}` : ""}, and this screen needs a session.`
          }
        />
      </>
    );
  }

  const d = media.data;
  const totalBytes = d.files.reduce((n, f) => n + f.size, 0);

  return (
    <>
      <PageHead
        title="Media"
        sub={`${d.files.length} images · ${bytes(totalBytes)} · ${d.trash} in the trash${
          d.missingAlt > 0 ? ` · ${d.missingAlt} waiting for alt text` : ""
        }`}
        actions={
          <>
            <Btn icon={<RefreshCw size={14} />} onClick={() => media.reload()} disabled={busy}>
              Reload
            </Btn>
            <Seg
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              options={[
                { id: "library", label: "Library" },
                { id: "alt", label: `Alt text${d.missingAlt > 0 ? ` (${d.missingAlt})` : ""}` },
                { id: "trash", label: `Trash${d.trash > 0 ? ` (${d.trash})` : ""}` },
              ]}
            />
          </>
        }
      />

      {d.import && (d.import.alt > 0 || d.import.trash > 0) && (
        <Note tone="info" title="Carried across from v2.1">
          {d.import.alt} alt text entries and {d.import.trash} trash records were read out of the old JSON
          file. The file is left alone; the tables are the truth from here.
        </Note>
      )}
      {result && (
        <Note tone="ok" title="The server said">
          {result}
        </Note>
      )}
      {bad && (
        <Note tone="danger" title={`${bad.code} — ${bad.message}`}>
          {bad.detail}
        </Note>
      )}

      {tab === "library" && (
        <Card
          title="Images"
          sub="Thumbnails are the real files, served from the same folders the pages use"
          actions={
            <input
              className="input"
              placeholder="Filter by name or folder…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 240 }}
            />
          }
        >
          {files.length === 0 ? (
            <Empty title="No images match" sub={filter ? `Nothing contains “${filter}”.` : "The library is empty."} />
          ) : (
            <div className="media-grid">
              {files.map((f) => (
                <figure key={f.url} className="media-tile">
                  <img src={f.url} alt={f.alt} loading="lazy" />
                  <figcaption>
                    <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                      <strong title={f.url}>{f.name}</strong>
                      <span style={{ color: "var(--fg-3)", fontSize: "var(--fs-11)" }}>{bytes(f.size)}</span>
                    </div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      <Pill tone={f.folder === "site" ? "neutral" : "info"}>{f.folder}</Pill>
                      {f.sizes.length > 0 ? (
                        <Pill tone="ok" plain>
                          {f.sizes.map((w) => `${w}`).join("/")}px
                        </Pill>
                      ) : (
                        <Pill tone="warn" plain>
                          no small copies
                        </Pill>
                      )}
                      {f.alt === "" ? (
                        f.checked ? (
                          <Pill tone="neutral" plain>
                            decorative
                          </Pill>
                        ) : (
                          <Pill tone="warn" plain>
                            <ImageOff size={11} /> no alt text
                          </Pill>
                        )
                      ) : (
                        <Pill tone="ok" plain title={f.alt}>
                          alt ✓
                        </Pill>
                      )}
                    </div>
                    <div style={{ marginTop: 6, fontSize: "var(--fs-11)", color: "var(--fg-3)" }}>
                      {f.used.length > 0 ? (
                        <span title={f.used.join(", ")}>
                          used on {f.used.length} page{f.used.length === 1 ? "" : "s"} — cannot be moved or
                          deleted without breaking {f.used.length === 1 ? "it" : "them"}
                        </span>
                      ) : (
                        <span>not used on any page</span>
                      )}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "alt" && (
        <Card
          title={`Waiting for alt text (${queue.data?.total ?? 0})`}
          sub={`${queue.data?.checked ?? 0} images have been looked at. An image with no alt text that nobody has opened is a gap; one marked and left empty is a decision.`}
          actions={
            <label className="field-label" title="Write the text into the pages that show the image">
              <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} /> write into the
              pages too
            </label>
          }
        >
          {queue.loading && !queue.data ? (
            <p style={{ fontSize: "var(--fs-13)", color: "var(--fg-3)" }}>Loading…</p>
          ) : (queue.data?.missing.length ?? 0) === 0 ? (
            <Empty title="Every image has an answer" sub="Nothing is waiting — checked and described, or checked and decorative." />
          ) : (
            <div className="alt-queue">
              {queue.data?.missing.map((f) => (
                <div key={f.url} className="alt-row">
                  <img src={f.url} alt="" loading="lazy" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: "var(--fs-12)" }}>{f.name}</strong>
                      {(queue.data?.usedOn[f.url] ?? 0) > 0 ? (
                        <Pill tone="warn" plain>
                          on {queue.data?.usedOn[f.url]} page{(queue.data?.usedOn[f.url] ?? 0) === 1 ? "" : "s"} now
                        </Pill>
                      ) : (
                        <Pill tone="neutral" plain>
                          not used yet
                        </Pill>
                      )}
                      <span style={{ color: "var(--fg-3)", fontSize: "var(--fs-11)" }}>{f.folder}</span>
                    </div>
                    <input
                      className="input"
                      placeholder="Describe the picture for somebody who cannot see it…"
                      value={altDraft[f.url] ?? ""}
                      onChange={(e) => setAltDraft({ ...altDraft, [f.url]: e.target.value })}
                      style={{ width: "100%", marginTop: 6 }}
                    />
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <Btn
                      variant="primary"
                      disabled={busy || (altDraft[f.url] ?? "").trim() === ""}
                      onClick={() => void saveAlt(f, (altDraft[f.url] ?? "").trim())}
                    >
                      Save
                    </Btn>
                    <Btn variant="ghost" disabled={busy} onClick={() => void saveAlt(f, "")} title="It carries no meaning — nothing to describe">
                      Decorative
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "trash" && (
        <Card
          title={`Trash (${trash.data?.items.length ?? 0})`}
          sub={
            trash.data && trash.data.items.length > 0
              ? `${bytes(trash.data.bytes)} of files that can be put back — the bytes are still on disk`
              : "Nothing has been deleted or replaced"
          }
          actions={
            <Btn
              variant="ghost"
              icon={<Eraser size={14} />}
              disabled={busy || (trash.data?.items.length ?? 0) === 0}
              title="Drop every trashed file for good"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.del<unknown>("/media/trash");
                  setResult(isPending(r) ? r.message : "The trash is empty.");
                  trash.reload();
                } catch (e) {
                  setBad(e instanceof ApiFailure ? e : null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Empty the trash
            </Btn>
          }
          tight
        >
          {(trash.data?.items.length ?? 0) === 0 ? (
            <Empty title="The trash is empty" sub="Deleted and replaced images appear here, with where they came from." />
          ) : (
            <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>File</th>
                  <th style={{ width: 110 }}>Why</th>
                  <th style={{ width: 170 }}>Address</th>
                  <th style={{ width: 90 }}>Size</th>
                  <th style={{ width: 140 }}>When · who</th>
                  <th style={{ width: 200 }} />
                </tr>
              </thead>
              <tbody>
                {trash.data?.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <code>{t.url.split("/").pop()}</code>
                    </td>
                    <td>
                      <Pill tone={t.why === "replaced" ? "info" : "warn"}>{t.why}</Pill>
                    </td>
                    <td style={{ fontSize: "var(--fs-12)" }}>
                      {t.addressFree ? (
                        <span style={{ color: "var(--fg-3)" }}>free</span>
                      ) : (
                        <Pill tone="ok" plain>
                          in use again
                        </Pill>
                      )}
                    </td>
                    <td>{bytes(t.bytes)}</td>
                    <td style={{ fontSize: "var(--fs-12)", color: "var(--fg-3)" }}>
                      {timeAgo(t.at)} · {t.by || "—"}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <Btn
                          icon={<CornerUpLeft size={14} />}
                          disabled={busy || !t.onDisk || (!t.addressFree && t.why !== "replaced")}
                          title={
                            !t.onDisk
                              ? "The file itself is gone"
                              : !t.addressFree && t.why !== "replaced"
                                ? "Something is at that address again"
                                : "Put it back"
                          }
                          onClick={() => void act("restore", t.id)}
                        >
                          Restore
                        </Btn>
                        <Btn
                          variant="ghost"
                          icon={<Trash2 size={14} />}
                          disabled={busy}
                          title="Delete for good — this cannot be undone"
                          onClick={() => void act("purge", t.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}

      {d.files.length === 0 && tab === "library" && (
        <Note tone="warn" title="The library is empty">
          <AlertTriangle size={12} /> That is either a new site or a folder the web server cannot read.
        </Note>
      )}
    </>
  );
}
