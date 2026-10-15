/**
 * LiveSeo — how findable the site is, per page, with the working out done once on the server.
 *
 * v2.1's SEO manager had the right three ideas and put the two halves of each in different places. The audit
 * ran **in the browser**: `admin-seo38.js` fetched every page, six at a time, parsed them with `DOMParser`,
 * counted words and links, and derived a score from a list of findings it kept in JavaScript. The numbers it
 * worked out were then posted to the server under `seo_scores` and stored in `_private/seo.json` — so the
 * site's own record of how findable it was came from whichever browser last pressed Analyse, and no screen
 * could answer "which pages have no description?" without loading all of them again.
 *
 * This screen reads one answer. `GET /seo/pages` audits the site on the server: findings in sentences, the
 * number derived from them, the sitemap checked against the pages, robots.txt read. Nothing is computed here
 * — not a score, not a count, not a word — which is the whole point of the slice: two screens, and later two
 * people, must not be able to disagree about the same page.
 *
 * What the screen does with it:
 *
 *   · **the site first.** The findings are counted by code, worst first, because "41 pages have no
 *     description" is a decision about the site and "this page has no description" is a decision about a page.
 *   · **then the page.** Selecting one shows what the audit read off it — the title it has next to the length
 *     Google shows, the headline, the description, the words — and the findings in full sentences.
 *   · **and the three files.** The focus phrase and the schema choice are the only things stored per page;
 *     robots.txt and the sitemap are the site's own two files, edited here with v2.1's refusals intact.
 *
 * A page's *title and description* are deliberately not editable here: they are `page_meta_save`'s business
 * (`POST /pages/{rel}/publish`, the Pages screen), and this screen reads them. Two screens that can write one
 * `<title>` is how a site ends up with two.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, FileCode2, Globe, RefreshCw, RotateCcw, Save, Search, X } from "lucide-react";
import { Btn, Card, Empty, Input, Note, PageHead, Pill, Seg } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import { useLive, type SeoPageView, type SeoPagesData, type SeoSaveResult, type SeoSitemapView, type SeoSuggest } from "../lib/live";

type Filter = "all" | "issues" | "errors" | "clean";

/** The finding codes in the words a person needs, for the strip at the top. The API sends codes; this names them. */
const CODE_LABEL: Record<string, string> = {
  title_missing: "no title",
  title_long: "title too long",
  title_short: "title short",
  title_duplicate: "title shared with another page",
  desc_missing: "no description",
  desc_long: "description too long",
  desc_short: "description short",
  desc_duplicate: "description shared",
  h1_missing: "no headline",
  h1_multiple: "more than one headline",
  thin_text: "thin text",
  not_public: "not public",
  noindex: "held out of search",
  not_in_sitemap: "missing from the sitemap",
  sitemap_noindex: "in the sitemap while noindex",
  broken_link: "links to a page that is not there",
  image_no_alt: "images with no alt text",
};

/** The tone a score is drawn in. The thresholds are the audit's own levels, said once. */
function scoreTone(score: number): "ok" | "warn" | "danger" {
  return score >= 90 ? "ok" : score >= 70 ? "warn" : "danger";
}

export function LiveSeo() {
  const { link, reason } = useSession();
  const [rel, setRel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const site = useLive<SeoPagesData>("/seo/pages");
  const page = useLive<SeoPageView>(rel === null ? null : `/seo/pages/${rel}`, rel);
  const sitemap = useLive<SeoSitemapView>("/seo/sitemap");

  /* The three fields this screen may write, held as a draft that is `null` until somebody types. The rule is
     `draft ?? server`, not "seed an effect": an effect does not run in a server render, so a seeded field
     renders empty and the screen looks like it has thrown the stored phrases away. (The Pages screen's publish
     card learned this the hard way.) `null` also means "cleared when another page is opened". */
  const [draft, setDraft] = useState<{ kw: string; related: string; schema: string[] } | null>(null);
  /* robots.txt the same way: the file the server read, until the person edits it. */
  const [robotsDraft, setRobotsDraft] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SeoSuggest | null>(null);

  const view = page.data;

  /* Opening another page clears everything that belonged to the last one. Clearing is the only thing an
     effect does here, so a server render and a first paint show the server's own values. */
  useEffect(() => {
    setSaid(null);
    setBad(null);
    setSuggestion(null);
    setDraft(null);
  }, [rel]);

  useEffect(() => {
    setForce(false);
  }, [site.data?.robotsState.at]);

  const kw = draft?.kw ?? view?.kw ?? "";
  const related = draft?.related ?? (view?.related ?? []).join(", ");
  const schema = draft?.schema ?? view?.schema ?? [];
  const robots = robotsDraft ?? site.data?.robotsState.text ?? null;

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

  async function savePage() {
    if (rel === null || view === null) return;
    const relatedList = related.split(",").map((x) => x.trim()).filter(Boolean);
    const body: Record<string, unknown> = {};
    if (kw !== view.kw) body.kw = kw;
    if (relatedList.join("|") !== view.related.join("|")) body.related = relatedList;
    if (schema.join("|") !== view.schema.join("|")) body.schema = schema;
    if (Object.keys(body).length === 0) {
      setSaid("Nothing has changed yet.");
      return;
    }
    const r = await run(() => api.post<SeoSaveResult | { pending: true; message: string }>(`/seo/pages/${rel}`, body));
    if (r === null) return;
    if ("pending" in r) {
      setSaid(r.message);
      return;
    }
    setSaid(
      `Saved${r.schema ? ` · structured data ${r.schema.wrote ? `written (${r.schema.added.join(", ") || "removed"})` : "already as asked"}` : ""}` +
        `${r.synced ? " · the article that owns this page was kept in step" : ""}` +
        `${r.ignored.length ? ` · a score sent from here is not stored` : ""}`,
    );
    page.reload();
    site.reload();
  }

  async function suggest() {
    if (rel === null) return;
    const r = await run(() => api.post<SeoSuggest>(`/seo/pages/${rel}/suggest`, { kw }));
    if (r === null) return;
    setSuggestion(r);
    setSaid(`Suggested by ${r.provider} · ${r.model} — nothing is stored until you save`);
  }

  async function saveRobots() {
    if (robots === null) return;
    const r = await run(() => api.post<{ wrote: boolean; problem: string | null }>("/seo/robots", { text: robots, force }));
    if (r === null) return;
    setSaid(r.wrote ? "robots.txt written." : "robots.txt was already exactly that.");
    site.reload();
  }

  async function rebuild() {
    const r = await run(() => api.post<{ count: number; kept: string[]; wrote: boolean }>("/seo/sitemap", {}));
    if (r === null) return;
    setSaid(
      `${r.count} addresses in the sitemap${r.kept.length ? `, and ${r.kept.length} kept that no page on disk explains` : ""}` +
        `${r.wrote ? "" : " — the file already said exactly that"}.`,
    );
    site.reload();
    sitemap.reload();
  }

  const audit = site.data?.audit ?? [];
  const summary = site.data?.summary;

  const filtered = useMemo(() => {
    return audit
      .filter((r) => (filter === "all" ? true : filter === "clean" ? r.issues.length === 0 : r.issues.length > 0))
      .filter((r) => (filter !== "errors" ? true : r.issues.some((i) => i.level === "error")))
      .filter((r) => (q === "" ? true : r.rel.toLowerCase().includes(q.toLowerCase()) || (r.title ?? "").toLowerCase().includes(q.toLowerCase())));
  }, [audit, filter, q]);

  /* ---------------- the states that must not lie ---------------- */

  /* With no API there is no audit to draw: the score would be a number this screen invented about a site it
     cannot see, and the site's robots.txt would be a file nobody read. It refuses instead. */
  if (link !== "live") {
    return (
      <>
        <PageHead title="Search and findability" sub="What each page tells Google, and what is missing" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. The site's pages, robots.txt and sitemap are all on the server, and none of them can be read from here — this screen will not audit a site it cannot see."
            : "Sign in to audit the site."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!site.data && site.loading) {
    return (
      <>
        <PageHead title="Search and findability" sub="What each page tells Google, and what is missing" />
        <Card><div className="muted" style={{ padding: 18 }}>Reading every page…</div></Card>
      </>
    );
  }

  if (!site.data && site.error) {
    return (
      <>
        <PageHead title="Search and findability" sub="What each page tells Google, and what is missing" />
        <Note tone="danger" title="The site could not be audited">{site.error.message}</Note>
      </>
    );
  }

  const data = site.data;
  if (!data || !summary) return null;
  const sm = data.sitemapState;

  return (
    <>
      <PageHead
        title="Search and findability"
        sub={
          `${data.count} pages · average ${summary.average}` +
          ` · ${summary.clean} with nothing to report` +
          `${summary.byLevel.error ? ` · ${summary.byLevel.error} errors` : ""}` +
          `${summary.byLevel.warn ? ` · ${summary.byLevel.warn} warnings` : ""}` +
          ` · checked ${data.checkedAt}`
        }
        actions={
          <>
            <Btn icon={<RefreshCw size={15} />} onClick={() => { site.reload(); sitemap.reload(); }}>Check the site again</Btn>
          </>
        }
      />

      {said && <Note tone="ok" title="Done">{said}</Note>}
      {bad && <Note tone="danger" title="That did not work">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}

      {summary.byLevel.error > 0 && (
        <Note tone="danger" title={`${summary.byLevel.error} thing${summary.byLevel.error === 1 ? "" : "s"} to fix`}>
          {Object.entries(summary.byCode)
            .filter(([code]) => (audit.find((r) => r.issues.some((i) => i.code === code))?.issues ?? []).some((i) => i.code === code && i.level === "error"))
            .slice(0, 4)
            .map(([code, n]) => `${n} ${CODE_LABEL[code] ?? code}`)
            .join(" · ")}
        </Note>
      )}
      {sm.missing.length > 0 && (
        <Note tone="warn" title={`${sm.missing.length} public page${sm.missing.length === 1 ? " is" : "s are"} not in the sitemap`}>
          Google is not being told they exist. {sm.missing.slice(0, 3).join(", ")}{sm.missing.length > 3 ? ` and ${sm.missing.length - 3} more` : ""} — the rebuild below adds every public page.
        </Note>
      )}
      {sm.shouldNotBeListed.length > 0 && (
        <Note tone="warn" title={`${sm.shouldNotBeListed.length} address${sm.shouldNotBeListed.length === 1 ? "" : "es"} in the sitemap should not be`}>
          A draft, a hidden page, a page telling Google <span className="mono">noindex</span>, or one of the four files that are not addresses. {sm.shouldNotBeListed.slice(0, 3).join(", ")}.
        </Note>
      )}
      {data.robotsState.blocksAll && (
        <Note tone="danger" title="robots.txt blocks the whole site">
          Every line begins <span className="mono">Disallow: /</span>, which takes the site out of Google. If that was not meant, change it under the two files below.
        </Note>
      )}

      <Card
        title="What the audit found"
        sub={`${data.count} pages read from the files themselves · ${summary.inSitemap} of them in sitemap.xml`}
      >
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {Object.entries(summary.byCode).length === 0 ? (
            <span className="muted">Nothing at all — every page has a title, a description, one headline and enough words.</span>
          ) : (
            Object.entries(summary.byCode).map(([code, n]) => (
              <Pill key={code} tone={(CODE_LABEL[code] ?? "") === "" ? "neutral" : "info"}>
                {n} · {CODE_LABEL[code] ?? code}
              </Pill>
            ))
          )}
        </div>
      </Card>

      <div className="toolbar">
        <Seg
          options={[
            { id: "all", label: `All ${audit.length}` },
            { id: "issues", label: `With findings ${audit.filter((r) => r.issues.length > 0).length}` },
            { id: "errors", label: `With errors ${audit.filter((r) => r.issues.some((i) => i.level === "error")).length}` },
            { id: "clean", label: `Clean ${summary.clean}` },
          ]}
          value={filter}
          onChange={(f) => setFilter(f as Filter)}
        />
        <div className="grow" />
        <Input placeholder="Page or title…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
      </div>

      <Card tight title="Worst first" sub="The order is the score, so the pages to fix are at the top">
        {filtered.length === 0 ? (
          <Empty title="Nothing matches" sub="Clear the search or pick another filter." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Score</th>
                <th>Page</th>
                <th>Focus phrase</th>
                <th>What is wrong</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.rel} onClick={() => setRel(r.rel)} style={{ cursor: "pointer" }}>
                  <td><Pill tone={scoreTone(r.score)}>{r.score}</Pill></td>
                  <td>
                    <strong>{r.rel}</strong>
                    <div className="muted mono" style={{ fontSize: "var(--fs-11)" }}>
                      {r.url} · {r.words} words{r.kind ? ` · ${r.kind}` : ""}
                      {r.status !== "published" ? ` · ${r.status}` : ""}
                      {!r.indexable ? " · noindex" : ""}
                    </div>
                  </td>
                  <td>{r.kw ? r.kw : <span className="muted">—</span>}</td>
                  <td>
                    {r.issues.length === 0 ? (
                      <span className="muted">nothing</span>
                    ) : (
                      <span className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                        {r.issues.slice(0, 3).map((i, n) => (
                          <Pill key={`${r.rel}-${i.code}-${n}`} tone={i.level === "error" ? "danger" : i.level === "warn" ? "warn" : "neutral"}>
                            {CODE_LABEL[i.code] ?? i.code}
                          </Pill>
                        ))}
                        {r.issues.length > 3 && <span className="muted">+{r.issues.length - 3}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {rel !== null && (
        <Card
          title={rel}
          sub={view ? `${view.url} · read ${view.checkedAt}` : "Reading the page…"}
          actions={
            <>
              <Btn icon={<ExternalLink size={15} />} onClick={() => window.open(view?.url ?? `/${rel}`, "_blank")}>Open on the site</Btn>
              <Btn icon={<X size={15} />} iconOnly aria-label="Close" onClick={() => setRel(null)} />
            </>
          }
        >
          {!view && page.loading && <div className="muted">Reading the page…</div>}
          {!view && page.error && <Note tone="danger" title="That page could not be read">{page.error.message}</Note>}
          {view && (
            <>
              <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <Pill tone={scoreTone(view.score)}>{view.score}</Pill>
                  <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 6 }}>
                    {view.issues.length === 0 ? "Nothing to report" : `${view.issues.length} finding${view.issues.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ fontSize: "var(--fs-13)" }}>
                    <strong>Title</strong>{" "}
                    <span className={view.facts.title === "" ? "muted" : ""}>{view.facts.title || "—"}</span>{" "}
                    <span className="muted">({view.facts.title.length} of {data.limits.title[1]} characters Google shows)</span>
                  </div>
                  <div style={{ fontSize: "var(--fs-13)", marginTop: 4 }}>
                    <strong>Description</strong>{" "}
                    <span className={view.facts.desc === "" ? "muted" : ""}>{view.facts.desc || "—"}</span>{" "}
                    <span className="muted">({view.facts.desc.length} of {data.limits.desc[1]})</span>
                  </div>
                  <div style={{ fontSize: "var(--fs-13)", marginTop: 4 }}>
                    <strong>H1</strong>{" "}
                    <span className={view.facts.h1 === "" ? "muted" : ""}>{view.facts.h1 || "—"}</span>{" "}
                    <span className="muted">
                      ({view.facts.h1Count} on the page · {view.facts.words} words · {view.facts.images} images, {view.facts.imagesNoAlt} with no alt text · {view.facts.links} links)
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 6 }}>
                    {view.facts.status} · {view.facts.indexable ? "open to search" : "noindex"} ·{" "}
                    {view.facts.inSitemap ? "in sitemap.xml" : "not in sitemap.xml"}
                    {view.facts.kind ? ` · kind ${view.facts.kind}` : ""}
                  </div>
                </div>
              </div>

              {view.issues.length > 0 && (
                <ul style={{ marginTop: 14, paddingLeft: 18 }}>
                  {view.issues.map((i, n) => (
                    <li key={`${i.code}-${n}`} style={{ marginBottom: 4 }}>
                      <span
                        className="mono"
                        style={{ color: i.level === "error" ? "var(--danger)" : i.level === "warn" ? "var(--warn)" : "var(--text-dim)" }}
                      >
                        {i.level}
                      </span>{" "}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ marginTop: 18 }}>
                <label className="muted" style={{ fontSize: "var(--fs-12)" }} htmlFor="seo-kw">Focus phrase</label>
                <Input id="seo-kw" value={kw} maxLength={data.limits.kw} onChange={(e) => setDraft({ kw: e.target.value, related, schema })} placeholder="fitted kitchens lahore" />
                <label className="muted" style={{ fontSize: "var(--fs-12)", display: "block", marginTop: 10 }} htmlFor="seo-related">
                  Related phrases — up to {data.limits.related}, separated by commas
                </label>
                <Input id="seo-related" value={related} onChange={(e) => setDraft({ kw, related: e.target.value, schema })} placeholder="kitchen design, kitchen renovation" />
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 6 }}>
                  Structured data — one managed block in this page&apos;s <span className="mono">&lt;head&gt;</span>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {data.schemas.map((s) => {
                    const on = schema.includes(s);
                    const already = view.existing.includes(s);
                    const managed = view.managed.includes(s);
                    return (
                      <Btn
                        key={s}
                        variant={on ? "primary" : "default"}
                        size="sm"
                        onClick={() => setDraft({ kw, related, schema: schema.includes(s) ? schema.filter((x) => x !== s) : [...schema, s] })}
                        title={already ? "This page already declares it, so the block will leave it alone" : managed ? "In the managed block now" : undefined}
                      >
                        {s}
                        {already ? " · already on the page" : ""}
                      </Btn>
                    );
                  })}
                </div>
                <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 6 }}>
                  {view.faq > 0
                    ? `${view.faq} question${view.faq === 1 ? "" : "s"} on this page — enough for an FAQ page to be declared.`
                    : "No questions on this page, so FAQPage has nothing to declare."}
                  {view.managed.length > 0 ? ` Managed now: ${view.managed.join(", ")}.` : " No managed block yet."}
                  {view.existing.length > 0 ? ` Declared by the page itself: ${view.existing.join(", ")}.` : ""}
                </div>
              </div>

              <div className="row" style={{ marginTop: 16 }}>
                <Btn variant="primary" icon={<Save size={15} />} disabled={busy} onClick={savePage}>Save</Btn>
                {data.aiReady ? (
                  <Btn icon={<Bot size={15} />} disabled={busy} onClick={suggest}>Suggest a phrase and a title</Btn>
                ) : (
                  <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
                    No AI key is set — add one in AI settings and this button writes a phrase, a title and a description to fill in and check.
                  </span>
                )}
              </div>

              {suggestion && (
                <Note tone="info" title={`${suggestion.provider} suggested`}>
                  <div style={{ marginBottom: 6 }}>
                    Phrase <strong>{suggestion.kw}</strong> · related {suggestion.related.join(", ") || "—"}
                  </div>
                  <div style={{ marginBottom: 6 }}>Title: {suggestion.title} ({suggestion.title.length})</div>
                  <div style={{ marginBottom: 6 }}>Description: {suggestion.desc} ({suggestion.desc.length})</div>
                  <div className="row">
                    <Btn size="sm" onClick={() => setDraft({ kw: suggestion.kw, related: suggestion.related.join(", "), schema })}>Use the phrase</Btn>
                    <Btn size="sm" onClick={() => { setDraft({ kw: suggestion.kw, related: suggestion.related.join(", "), schema }); setSaid("A title and description are saved on the Pages screen, in the page's publish card — this screen does not write them."); }}>
                      Use the phrase and read why the title is not here
                    </Btn>
                  </div>
                </Note>
              )}
            </>
          )}
        </Card>
      )}

      <Card
        title="The two files Google reads"
        sub={`robots.txt ${data.robotsState.exists ? `· ${data.robotsState.bytes} bytes` : "· not on disk"} · sitemap.xml · ${sm.count} addresses`}
      >
        <div className="row" style={{ alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <FileCode2 size={15} />
              <strong>robots.txt</strong>
              {data.robotsState.sitemapLine ? (
                <span className="muted" style={{ fontSize: "var(--fs-12)" }}>points at {data.robotsState.sitemapLine}</span>
              ) : (
                <span className="muted" style={{ fontSize: "var(--fs-12)" }}>no Sitemap line</span>
              )}
            </div>
            {robots === null ? (
              <div className="muted">Reading…</div>
            ) : (
              <>
                <textarea
                  className="input mono"
                  style={{ width: "100%", minHeight: 120 }}
                  value={robots}
                  onChange={(e) => setRobotsDraft(e.target.value)}
                  spellCheck={false}
                  aria-label="robots.txt"
                />
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  <Btn variant="primary" size="sm" icon={<Save size={14} />} disabled={busy} onClick={saveRobots}>Write robots.txt</Btn>
                  <label className="row muted" style={{ fontSize: "var(--fs-12)", gap: 6 }}>
                    <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                    I mean <span className="mono">Disallow: /</span> — take the whole site out of Google
                  </label>
                </div>
                {!data.robotsState.mayEdit && (
                  <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 6 }}>
                    Your role may read this file and not write it: it takes the owner or the admin, which is v2.1's rule.
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 320 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <Globe size={15} />
              <strong>sitemap.xml</strong>
              <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
                {sm.exists ? `written ${sm.at ?? "—"}` : "not on disk"}
              </span>
            </div>
            <div style={{ fontSize: "var(--fs-13)" }}>
              <div>{sm.count} addresses in the file · {sm.listed} of {data.count} pages listed</div>
              <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 4 }}>
                A rebuild writes the public, indexable pages — {sm.wanted} addresses — and keeps an address no page on disk accounts for
                {sm.extra.length ? `: ${sm.extra.slice(0, 2).join(", ")}${sm.extra.length > 2 ? ` and ${sm.extra.length - 2} more` : ""}` : ""}.
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Btn icon={<RotateCcw size={15} />} disabled={busy} onClick={rebuild}>Rebuild from the pages</Btn>
              <Btn icon={<Search size={15} />} onClick={() => sitemap.reload()}>Read the file</Btn>
            </div>
            {sitemap.data && (
              <div className="muted mono" style={{ fontSize: "var(--fs-11)", marginTop: 8, maxHeight: 120, overflow: "auto" }}>
                {sitemap.data.locs.slice(0, 40).join("\n")}
                {sitemap.data.locs.length > 40 ? `\n… and ${sitemap.data.locs.length - 40} more` : ""}
              </div>
            )}
            {sitemap.error && <Note tone="warn" title="The file could not be read">{sitemap.error.message}</Note>}
          </div>
        </div>
      </Card>

      <Card title="What this screen does not do" sub="Three things belong to other screens, and saying so is cheaper than a second place to edit them">
        <ul style={{ paddingLeft: 18, fontSize: "var(--fs-13)" }}>
          <li><strong>Title, description, canonical, og:image</strong> — the publish card on the Pages screen (<span className="mono">POST /pages/{"{"}rel{"}"}/publish</span>). This screen reads them and says what Google will cut.</li>
          <li><strong>Writing the text of a page</strong> — the page editor, and the block library behind it.</li>
          <li><strong>Scores</strong> — computed on the server for this request. v2.1 stored the number a browser worked out; a stored score is an opinion about a site that has changed since.</li>
        </ul>
        {!data.aiReady && (
          <div className="row" style={{ marginTop: 8 }}>
            <AlertTriangle size={15} />
            <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
              Findability is not only this page: with no key in AI settings, the phrase and title suggestions here are the one part that is switched off.
            </span>
          </div>
        )}
        {summary.clean === data.count && (
          <Note tone="ok" title="Nothing to report">
            <CheckCircle2 size={14} /> Every page has a title, a description, one headline and enough words, and the sitemap agrees with the site.
          </Note>
        )}
      </Card>
    </>
  );
}
