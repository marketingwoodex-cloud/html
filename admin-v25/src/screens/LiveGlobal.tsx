/**
 * LiveGlobal — the header, the menu and the footer, and the two numbers that make the screen honest.
 *
 * This is the Phase 3 gate's second sentence: *"changes the header across 150 pages"*. The site is not
 * templated — every page is its own finished HTML document — so "change the header" means finding the
 * header in every page and replacing it while keeping what is genuinely per-page:
 *
 *   · the current page's own link gets `aria-current="page"`, or the menu highlights nothing;
 *   · the home page's brand is marked as the current page;
 *   · the mobile menu keeps *this page's* "Get a quote" target, which differs by page;
 *   · the footer keeps this page's own section anchors and its own intro sentence — and a footer link
 *     written `/#page-contact` becomes `#page-contact` on the pages that actually have that section.
 *
 * All of that happens on the server (`lib/chrome.php`), and it is why this screen has two buttons rather
 * than one. **Check** runs the whole edit and writes nothing; **Apply** runs the same edit and writes.
 * The count on the Apply button is the count Check measured, so "148 pages will change" is a measurement
 * rather than a promise — and after Apply, the screen reports the batch id, because the same page
 * history that versions a single page versions this change too, and one call rolls all of it back.
 *
 * The coverage line at the top is the other number that matters: if 12 pages have no `<footer
 * class="footer">`, a footer edit cannot reach them, and a screen that said "150 pages · done" would be
 * telling the person something untrue.
 *
 * The fifth tab is the announcement bar — chrome, but not a region of a page: the site fetches one small
 * file and draws the bar itself, so that tab writes a file instead of 150 pages and says so.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Eye, History, RefreshCw, Rocket, Undo2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Btn, Card, Empty, Input, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type AnnounceData, type AnnounceRecord, type PendingResult,
  type ChromeData, type ChromeDiff, type ChromeResult, type ReplaceResult,
} from "../lib/live";
import { timeAgo } from "../lib/format";

type Tab = "header" | "menu" | "footer" | "replace" | "announce";

/** What each tab edits, and which region of the page it is. */
const TAB_REGIONS: Record<Exclude<Tab, "replace" | "announce">, string[]> = {
  header: ["brand", "cta", "design"],
  menu: ["menu"],
  footer: ["footer"],
};

export function LiveGlobal() {
  const { link, reason } = useSession();
  const mine = useLive<ChromeData>("/chrome");

  /* The tab lives in the address as well as in the state, so `/global?tab=footer` opens the footer — a link
     somebody can send, and the only way a render test can look at a tab that is not the first one. */
  const [params, setParams] = useSearchParams();
  const askedTab = params.get("tab");
  const [tab, setTab] = useState<Tab>(
    askedTab === "menu" || askedTab === "footer" || askedTab === "replace" || askedTab === "announce" ? askedTab : "header",
  );
  const pickTab = (next: Tab) => {
    setTab(next);
    setParams(next === "header" ? {} : { tab: next }, { replace: true });
  };
  const [brand, setBrand] = useState("");
  const [cta, setCta] = useState("");
  const [phone, setPhone] = useState("");
  const [style, setStyle] = useState("");
  const [menuDesktop, setMenuDesktop] = useState("");
  const [menuMobile, setMenuMobile] = useState("");
  const [footer, setFooter] = useState("");
  const [introAll, setIntroAll] = useState(false);
  const [idEmail, setIdEmail] = useState("");
  const [idPhone, setIdPhone] = useState("");
  const [idWa, setIdWa] = useState("");

  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [scope, setScope] = useState<string[]>(["header"]);

  const [diff, setDiff] = useState<ChromeDiff | null>(null);
  const [rep, setRep] = useState<ReplaceResult | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const data = mine.data;
  const stored = data?.chrome;

  /* Loading the stored chrome *into the fields* is what makes this a form: the fields hold what the
     editor is about to apply, not what the site currently says. The empty state matters — on a fresh
     install nothing is stored, and the screen offers the header the site actually has, read off a real
     page, as the starting point. */
  useEffect(() => {
    if (!stored) return;
    const source = data?.fromPage;
    setBrand((b) => b || stored.brand || source?.brand || "");
    setCta((c) => c || stored.cta || "");
    setPhone((p) => p || stored.phone || source?.phone || "");
    setStyle((s) => s || stored.style || source?.style || "");
    setMenuDesktop((m) => m || stored.menuDesktop || source?.menuDesktop || "");
    setMenuMobile((m) => m || stored.menuMobile || source?.menuMobile || "");
    setFooter((f) => f || stored.footer || source?.footer || "");
    /* The identity fields start from what the pages say, so the box shows the site's own number rather than
       an empty field somebody has to go and look up. */
    const id = data?.identity;
    setIdEmail((v) => v || id?.email || id?.company.email || "");
    setIdPhone((v) => v || id?.phone || "");
    setIdWa((v) => v || id?.whatsapp || "");
    /* Fields are filled once, from the first answer: typing must not be overwritten by a refresh, and an
       editor who clears a field means it. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const edit = useMemo(() => {
    if (tab === "menu") return { regions: TAB_REGIONS.menu, menuDesktop, menuMobile };
    if (tab === "footer") return { regions: TAB_REGIONS.footer, footer, introAll };
    if (tab === "header") return { regions: TAB_REGIONS.header, brand, cta, phone, style, introAll };
    return {};
  }, [tab, brand, cta, phone, style, menuDesktop, menuMobile, footer, introAll]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setBad(null);
    setResult(null);
    try {
      return await fn();
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Check: the whole edit, no writes. */
  async function check() {
    const r = await run(() => api.post<ChromeDiff | { pending: true; message: string }>("/chrome/preview", { ...edit, limit: 40 }));
    setRep(null);
    if (r && isPending(r)) setResult(r.message);
    else setDiff(r as ChromeDiff);
  }

  /** Apply: the same edit, written. */
  async function apply() {
    const r = await run(() => api.post<ChromeResult | { pending: true; message: string }>("/chrome", { ...edit, note: `${tab} updated from the admin` }));
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "batch" in r) {
      setDiff(null);
      const skipped = r.skipped ? ` ${r.skipped} page${r.skipped === 1 ? "" : "s"} already matched and were left alone.` : "";
      setResult(
        `${r.pages} page${r.pages === 1 ? "" : "s"} changed out of ${r.scanned} read.${skipped} ` +
        `The change is batch ${r.batch.slice(0, 8)} in page history — one call rolls all of it back.`,
      );
      mine.reload();
    }
  }

  /**
   * The three facts in the footer's contact lines — its own request.
   *
   * Not folded into the footer tab's Apply: a footer rewrite and a phone-number change are two decisions,
   * and one button that quietly did both would make the preview of either a lie about the other.
   */
  const idEdit = useMemo(
    () => ({ regions: ["identity"], identity: { email: idEmail, phone: idPhone, whatsapp: idWa } }),
    [idEmail, idPhone, idWa],
  );

  async function checkIdentity() {
    const r = await run(() => api.post<ChromeDiff | { pending: true; message: string }>("/chrome/preview", { ...idEdit, limit: 40 }));
    setRep(null);
    if (r && isPending(r)) setResult(r.message);
    else setDiff(r as ChromeDiff);
  }

  async function applyIdentity() {
    const r = await run(() => api.post<ChromeResult | { pending: true; message: string }>("/chrome", {
      ...idEdit,
      note: "the footer contact details updated from the admin",
    }));
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "batch" in r) {
      setDiff(null);
      const skipped = r.skipped ? ` ${r.skipped} page${r.skipped === 1 ? "" : "s"} already said it and were left alone.` : "";
      setResult(
        `${r.pages} page${r.pages === 1 ? "" : "s"} now say the new details, out of ${r.scanned} read.${skipped} ` +
        `The change is batch ${r.batch.slice(0, 8)} in page history — one call rolls all of it back.`,
      );
      mine.reload();
    }
  }

  async function dryRun() {
    const r = await run(() => api.post<ReplaceResult | { pending: true; message: string }>("/chrome/replace", { find, replace, scope, dry: true }));
    if (r && isPending(r)) setResult(r.message);
    else setRep(r as ReplaceResult);
  }

  async function doReplace() {
    const r = await run(() => api.post<ReplaceResult | { pending: true; message: string }>("/chrome/replace", { find, replace, scope, dry: false }));
    if (r && isPending(r)) {
      setResult(r.message);
      return;
    }
    if (r && "total" in r) {
      setRep(null);
      setResult(`${r.total} replacement${r.total === 1 ? "" : "s"} in ${r.pages.length} page${r.pages.length === 1 ? "" : "s"}${r.batch ? ` — batch ${r.batch.slice(0, 8)}, one undo` : ""}.`);
      mine.reload();
    }
  }

  async function restore(id: number) {
    const r = await run(() => api.post<{ chrome: ChromeData["chrome"]; restored: number; applied: boolean; hint: string } | { pending: true; message: string }>(`/chrome/versions/${id}`, {}));
    if (r && !isPending(r) && "hint" in r) {
      setBrand(r.chrome.brand);
      setCta(r.chrome.cta);
      setPhone(r.chrome.phone);
      setStyle(r.chrome.style);
      setMenuDesktop(r.chrome.menuDesktop);
      setMenuMobile(r.chrome.menuMobile);
      setFooter(r.chrome.footer);
      setResult(`Version ${r.restored} is loaded into the fields. ${r.hint}`);
      mine.reload();
    } else if (r && isPending(r)) {
      setResult(r.message);
    }
  }

  /* ---------------- the states that must not lie ---------------- */

  /* Without a server there is nothing this screen's buttons could do, so it says so instead of drawing them. */
  if (link !== "live") {
    return (
      <>
        <PageHead title="Header & footer" sub="One change, every page" />
        <Note tone="warn" title="Not connected">
          {link === "offline"
            ? "api/v2 is not answering. The header could be changed by hand on the server, but this screen will not pretend it knows what the site says."
            : "Sign in to change the header and the footer."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!data && mine.loading) {
    return (
      <>
        <PageHead title="Header & footer" sub="One change, every page" />
        <Card><div className="muted" style={{ padding: 18 }}>Loading…</div></Card>
      </>
    );
  }

  if (!data && mine.error) {
    return (
      <>
        <PageHead title="Header & footer" sub="One change, every page" />
        <Note tone="danger" title="The chrome could not be read">{mine.error.message}</Note>
      </>
    );
  }

  const cov = data?.coverage;

  return (
    <>
      <PageHead
        title="Header & footer"
        sub={
          cov
            ? `${cov.pages} pages carry a header · ${cov.regions.footer ?? 0} carry a footer · ${cov.regions.menuDesktop ?? 0} have a desktop menu`
            : "One change, every page"
        }
        actions={
          <>
            <Btn icon={<RefreshCw size={15} />} onClick={mine.reload}>Refresh</Btn>
            <Btn variant="primary" icon={<Eye size={15} />} onClick={check} disabled={busy || tab === "replace" || tab === "announce"}>
              Check what would change
            </Btn>
          </>
        }
      />

      {!stored?.brand && !stored?.footer && data?.fromPage && (
        <Note tone="info" title={`Nothing has been applied from here yet — starting from ${data.fromPage.rel}`}>
          The header and the footer below were read off a real page, so the first Apply replaces the site's
          own header with the site's own header. Nothing changes until you edit something.
        </Note>
      )}

      {result && <Note tone="ok" title="Done">{result}</Note>}
      {bad && <Note tone="danger" title="That did not work">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}

      <div className="toolbar">
        <Seg
          options={[
            { id: "header", label: "Header" },
            { id: "menu", label: "Menus" },
            { id: "footer", label: "Footer" },
            { id: "replace", label: "Find & replace" },
            { id: "announce", label: "Announcement bar" },
          ]}
          value={tab}
          onChange={(t) => { pickTab(t as Tab); setDiff(null); setRep(null); }}
        />
        {data?.versions && data.versions.length > 0 && (
          <span className="cell-sub">
            <History size={13} /> last applied {stored?.updatedAt ? timeAgo(stored.updatedAt) : "—"} by {stored?.updatedBy || "—"}
          </span>
        )}
      </div>

      {tab === "header" && (
        <Card>
          <div className="stack">
            <label className="stack">
              <span className="field-label">Brand (the logo link in the header)</span>
              <textarea className="input mono" rows={2} value={brand} onChange={(e) => setBrand(e.target.value)}
                placeholder={'<a class="brand" href="/">…</a>'} />
              <span className="cell-sub">The home page's brand gets <code>aria-current="page"</code> automatically.</span>
            </label>
            <div className="grid-2">
              <label className="stack">
                <span className="field-label">Header button text</span>
                <input className="input" maxLength={40} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Get a quote" />
              </label>
              <label className="stack">
                <span className="field-label">Header phone</span>
                <input className="input mono" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder={'<a class="wx-hphone" href="tel:+92…">…</a>'} />
                <span className="cell-sub">Leave empty and any existing phone is removed — this is how you turn it off.</span>
              </label>
            </div>
            <label className="stack">
              <span className="field-label">Design block (the single style element the site reads its colours from)</span>
              <textarea className="input mono" rows={4} value={style} onChange={(e) => setStyle(e.target.value)}
                placeholder={'<style id="wx-chrome-style" data-cfg="…">…</style>'} />
              <span className="cell-sub">Applied twice, it produces the same page — the element is rewritten, never added twice.</span>
            </label>
          </div>
        </Card>
      )}

      {tab === "menu" && (
        <Card>
          <div className="stack">
            <label className="stack">
              <span className="field-label">Desktop navigation</span>
              <textarea className="input mono" rows={6} value={menuDesktop} onChange={(e) => setMenuDesktop(e.target.value)}
                placeholder={'<nav class="desktop-nav">…</nav>'} />
              <span className="cell-sub">Each page's own link is marked <code>aria-current="page"</code> when this is applied.</span>
            </label>
            <label className="stack">
              <span className="field-label">Mobile panel</span>
              <textarea className="input mono" rows={5} value={menuMobile} onChange={(e) => setMenuMobile(e.target.value)}
                placeholder={'<nav class="mobile-panel">…</nav>'} />
              <span className="cell-sub">The mobile "Get a quote" button keeps whatever target the page already had — a service page and the blog point somewhere different on purpose.</span>
            </label>
          </div>
        </Card>
      )}

      {tab === "footer" && (
        <>
        {data?.identity && (
          <Card>
            <div className="row-between">
              <h2 className="cell-main">Get in touch</h2>
              <Pill tone={data.identity.matches ? "ok" : "warn"}>
                {data.identity.matches ? "the pages match the record" : "the pages and the record differ"}
              </Pill>
            </div>
            <p className="cell-sub">
              Read off {data.identity.pages} of {data.identity.scanned} pages, link by link: the email is in{" "}
              {data.identity.links.email} link{data.identity.links.email === 1 ? "" : "s"}, the phone in{" "}
              {data.identity.links.phone}, the WhatsApp link in {data.identity.links.whatsapp}. The studio record
              says {data.identity.company.email} · {data.identity.company.phones} — that is the address documents
              print, and it is edited on the Business screen. Where the two disagree, one of them is out of date.
            </p>
            {data.identity.others.email.length > 1 && (
              <Note tone="warn" title="More than one email is on the site">
                {data.identity.others.email.map((v) => `${v.value} (${v.count})`).join(", ")}. The fields below
                start from the most common one; applying writes that value into the others.
              </Note>
            )}
            <div className="grid-2">
              <label className="stack">
                <span className="field-label">Email</span>
                <Input value={idEmail} onChange={(e) => setIdEmail(e.target.value)} placeholder="info@woodex.com.pk" />
                <span className="cell-sub">Every mailto: link, and the words beside it.</span>
              </label>
              <label className="stack">
                <span className="field-label">Phone</span>
                <Input value={idPhone} onChange={(e) => setIdPhone(e.target.value)} placeholder="+923224000768" />
                <span className="cell-sub">The digits the link points at. The words on the page are formatted from them.</span>
              </label>
              <label className="stack">
                <span className="field-label">WhatsApp</span>
                <Input value={idWa} onChange={(e) => setIdWa(e.target.value)} placeholder="923224000768" />
                <span className="cell-sub">Digits only, as wa.me wants them. Empty follows the phone above.</span>
              </label>
            </div>
            <p className="cell-sub">
              Applied the way everything here is: every page walked, each one versioned, and a page's history can
              put it back. A number written into a sentence, a map link or a PDF is not a link — this changes the
              links, and the count above is how you see what it found.
            </p>
            <div className="row">
              <Btn icon={<Eye size={15} />} onClick={checkIdentity} disabled={busy}>Check first</Btn>
              <Btn variant="primary" icon={<Rocket size={15} />} onClick={applyIdentity} disabled={busy}
                title="One change to every page, with one undo">
                Apply to the site
              </Btn>
            </div>
          </Card>
        )}
        <Card>
          <div className="stack">
            <label className="stack">
              <span className="field-label">Footer</span>
              <textarea className="input mono" rows={10} value={footer} onChange={(e) => setFooter(e.target.value)}
                placeholder={'<footer class="footer">…</footer>'} />
            </label>
            <label className="row">
              <input type="checkbox" checked={introAll} onChange={(e) => setIntroAll(e.target.checked)} />
              <span>Use this footer's intro sentence on every page</span>
            </label>
            <span className="cell-sub">
              Off (the default), each page keeps the sentence that describes it. On, this text replaces all of them.
              Each page's own section anchors (process, services, FAQs) are kept either way.
            </span>
          </div>
        </Card>
        </>
      )}

      {tab === "announce" && <AnnounceBar />}

      {tab === "replace" && (
        <Card>
          <div className="stack">
            <div className="row">
              <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find — at least two characters" />
              <ArrowRightLeft size={16} />
              <input className="input" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with (empty removes it)" />
            </div>
            <div className="row">
              {[["header", "Header"], ["mobile", "Mobile menu"], ["footer", "Footer"]].map(([id, label]) => (
                <label className="row" key={id}>
                  <input
                    type="checkbox"
                    checked={scope.includes(id)}
                    onChange={(e) => setScope(e.target.checked ? [...scope, id] : scope.filter((s) => s !== id))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="cell-sub">
              Scoped to one part of the page on purpose: a find-and-replace over whole pages is how a
              rename of a CSS class takes the layout with it. Check first — it writes nothing.
            </p>
            <div className="row">
              <Btn icon={<Eye size={15} />} onClick={dryRun} disabled={busy || find.length < 2 || scope.length === 0}>Check</Btn>
              <Btn variant="primary" icon={<Rocket size={15} />} onClick={doReplace} disabled={busy || find.length < 2 || scope.length === 0 || rep === null}
                title={rep === null ? "Check first — this touches every page's header, menu and footer" : undefined}>
                Replace in all pages
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {diff && (
        <Card>
          <div className="row-between">
            <h2 className="cell-main">
              {diff.pages === 0 ? "Nothing would change" : `${diff.pages} page${diff.pages === 1 ? "" : "s"} would change`}
            </h2>
            <Btn variant="primary" icon={<Rocket size={15} />} onClick={apply} disabled={busy || diff.pages === 0}>
              Apply to {diff.pages} page{diff.pages === 1 ? "" : "s"}
            </Btn>
          </div>
          <p className="cell-sub">
            {diff.scanned} pages read · {diff.skipped} already match and will be left alone
            {diff.missing.length > 0 ? ` · ${diff.missing.length} named page${diff.missing.length === 1 ? " is" : "s are"} missing from disk` : ""}.
          </p>
          {diff.changed.length === 0 ? (
            <Empty title="Nothing to do" sub="Every page already says this. Applying now would write nothing." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Page</th><th>Before</th><th>After</th><th>Size</th></tr>
                </thead>
                <tbody>
                  {diff.changed.map((c) => (
                    <tr key={c.rel}>
                      <td className="mono truncate">{c.url}</td>
                      <td className="truncate muted">{c.before.ctaLabel ?? c.before.brand ?? c.before.menuDesktop ?? "…"}</td>
                      <td className="truncate">{c.after.ctaLabel ?? c.after.brand ?? c.after.menuDesktop ?? "…"}</td>
                      <td className="nowrap mono">{c.bytes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {diff.changed.length < diff.pages && (
            <p className="cell-sub">Showing the first {diff.changed.length} of {diff.pages}. All of them are written.</p>
          )}
        </Card>
      )}

      {rep && (
        <Card>
          <div className="row-between">
            <h2 className="cell-main">
              {rep.total === 0 ? "That text is not in any page" : `${rep.total} match${rep.total === 1 ? "" : "es"} in ${rep.pages.length} page${rep.pages.length === 1 ? "" : "s"}`}
            </h2>
            <Pill tone="info" title="Nothing was written">Check only</Pill>
          </div>
          {rep.pages.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Page</th><th>Matches</th></tr></thead>
                <tbody>
                  {rep.pages.map((p) => (
                    <tr key={p.rel}><td className="mono truncate">{p.rel}</td><td>{p.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="cell-sub">{rep.scanned} pages read. Use “Replace in all pages” above to do it.</p>
        </Card>
      )}

      {data?.versions && data.versions.length > 0 && (
        <Card>
          <h2 className="cell-main">Previous headers</h2>
          <p className="cell-sub">
            This is the header *text*, not the pages. Restoring one loads it into the fields above; press
            Apply to write it across the site. The pages themselves have their own history, with an undo per
            change.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Version</th><th>Note</th><th>When</th><th>By</th><th></th></tr></thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.version}</td>
                    <td className="truncate">{v.note || "—"}</td>
                    <td className="nowrap">{timeAgo(v.at)}</td>
                    <td>{v.by}</td>
                    <td>
                      <Btn icon={<Undo2 size={14} />} onClick={() => restore(v.id)} disabled={busy} title="Load this into the fields">
                        Load
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------- the announcement bar
 *
 * One small file, `assets/announce.json`, which the site's own script fetches and draws in the browser —
 * so this tab writes a file rather than 150 pages, and the screen says so instead of implying a site-wide
 * rewrite. Two things it has to state rather than assume:
 *
 *   · whether the site this console serves carries the code that draws the bar at all — both the script
 *     that fetches it and the stylesheet that dresses it. The feature reached the older copy of this site
 *     and never the pages this console serves, so "saved" could have meant "and nothing appeared";
 *   · how many pages load the script, because "every page" is the promise the bar makes.
 *
 * The strip in the middle is the bar at the colours the stylesheet uses. It is a preview of a real file,
 * not a mock of one: everything it draws comes from the values about to be saved.
 */

/** The three colours, at the values `assets/site.css` uses — see `.wx-ann--*` in that file. */
const ANN_SKIN: Record<string, { bg: string; fg: string }> = {
  navy: { bg: "#0a0f1e", fg: "#ffffff" },
  wood: { bg: "#b8956a", fg: "#ffffff" },
  cream: { bg: "#f4efe7", fg: "#000000" },
};

export function AnnounceBar() {
  const { link, reason } = useSession();
  const read = useLive<AnnounceData>("/chrome/announce");
  const [draft, setDraft] = useState<AnnounceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  const data = read.data;
  const ann = draft ?? data?.ann ?? null;
  const set = (patch: Partial<AnnounceRecord>) => {
    if (ann) setDraft({ ...ann, ...patch });
  };
  /* Only the five fields a person can change: the version belongs to the server, which moves it exactly
     when something else here moved. */
  const dirty =
    !!draft &&
    !!data &&
    (["on", "text", "link", "linkText", "style"] as const).some((k) => draft[k] !== data.ann[k]);

  async function save() {
    if (!ann) return;
    setBusy(true);
    setBad(null);
    setNote(null);
    try {
      const r = await api.post<AnnounceData | PendingResult>("/chrome/announce", { ann });
      if (isPending(r)) {
        setNote(r.message);
      } else {
        setDraft(null);
        setNote(
          r.ann.on
            ? "Saved. The bar is on every page from the next load — nothing was written to the pages themselves."
            : "Saved. The bar is hidden on every page from the next load.",
        );
        read.reload();
      }
    } catch (err) {
      setBad(err instanceof ApiFailure ? err : new ApiFailure({ code: "INTERNAL", message: String(err) }, 0, "client"));
    } finally {
      setBusy(false);
    }
  }

  /* Three states, and the order matters: "there is no API to ask" is not "the answer had nothing in it",
     and a panel that said the second when the first is true would be inventing a server. */
  if (!data && read.error) {
    return <Note tone="danger" title="The announcement could not be read">{read.error.message}</Note>;
  }
  if (!data && (link !== "live" || read.loading)) {
    return (
      <Note tone={link === "live" ? "info" : "warn"} title={link === "live" ? "Reading…" : "Not connected"}>
        {link === "live"
          ? "Asking the server for the announcement."
          : link === "offline"
            ? "api/v2 is not answering, so the bar cannot be read or changed from here."
            : "Sign in to edit the announcement bar."}
        {link !== "live" && reason ? ` — ${reason}` : ""}
      </Note>
    );
  }
  if (!ann || !data) {
    return <Empty title="No announcement in the answer" sub="The endpoint replied without an announcement, which is a bug rather than an empty site." />;
  }

  const skin = ANN_SKIN[ann.style] ?? ANN_SKIN.navy;
  const missing = data.pages.total - data.pages.script;

  return (
    <>
      <Card>
        <div className="row-between">
          <div className="stack">
            <span className="field-label">Announcement bar</span>
            <span className="cell-sub">
              A thin bar above the header on every page — for offers, holidays or news. Visitors can close it.
            </span>
          </div>
          <Pill tone={ann.on ? "ok" : "neutral"}>{ann.on ? "Live" : "Off"}</Pill>
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <Switch label="Show the bar on every page" checked={ann.on} onChange={(v) => set({ on: v })} />

          <label className="stack">
            <span className="field-label">
              {`Text — ${ann.text.length} of ${data.limits.text} characters`}
            </span>
            <Input
              value={ann.text}
              maxLength={data.limits.text}
              placeholder="e.g. Free site visit in Lahore this month"
              onChange={(e) => set({ text: e.target.value })}
            />
          </label>

          <div className="grid grid-2">
            <label className="stack">
              <span className="field-label">Link (optional)</span>
              <Input
                value={ann.link}
                maxLength={data.limits.link}
                placeholder="/contact/"
                onChange={(e) => set({ link: e.target.value })}
              />
            </label>
            <label className="stack">
              <span className="field-label">Link text</span>
              <Input
                value={ann.linkText}
                maxLength={data.limits.linkText}
                placeholder="Book now"
                onChange={(e) => set({ linkText: e.target.value })}
              />
            </label>
          </div>

          <label className="stack">
            <span className="field-label">Colour</span>
            <Seg
              options={data.styles.map((s) => ({ id: s.id, label: s.label }))}
              value={ann.style}
              onChange={(id) => set({ style: id })}
            />
          </label>

          <span className="cell-sub">
            A link must start with <span className="mono">/</span>, <span className="mono">https://</span>,{" "}
            <span className="mono">tel:</span> or <span className="mono">mailto:</span> — anything else is refused
            by field rather than saved and ignored.
          </span>
        </div>
      </Card>

      <Card>
        <div className="row-between">
          <span className="field-label">What the site draws</span>
          <span className="cell-sub">{ann.text.length === 0 ? "no words yet" : "36px tall, above the header"}</span>
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            height: 36,
            padding: "0 44px",
            marginTop: 10,
            borderRadius: "8px 8px 0 0",
            background: skin.bg,
            color: skin.fg,
            fontSize: 13,
            lineHeight: 1.2,
            textAlign: "center",
          }}
        >
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {ann.text || "The words above appear here."}
          </span>
          {ann.link ? (
            <a
              href={ann.link}
              onClick={(e) => e.preventDefault()}
              style={{ color: "inherit", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {ann.linkText || "Learn more"}
            </a>
          ) : null}
          <span
            aria-hidden="true"
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              width: 26, height: 26, lineHeight: "24px", borderRadius: 999, textAlign: "center",
              fontSize: 20, opacity: 0.75,
            }}
          >
            ×
          </span>
        </div>
        <p className="cell-sub" style={{ marginTop: 8 }}>
          The bar is fixed to the top and the header moves down by its height; the mobile menu moves with it.
          A visitor who closes it is not shown that version again — which is why saving an edit moves the
          version even inside the same second, and saving the same words again does not.
        </p>
      </Card>

      <Card>
        <div className="row-between">
          <div className="stack">
            <span className="field-label">Publishing</span>
            <span className="cell-sub">
              Written to <span className="mono">{data.file}</span>
              {data.exists ? "" : " — nothing has been saved yet, so the site shows no bar"}
            </span>
          </div>
          {ann.v > 0 && (
            <span className="cell-sub">changed {timeAgo(new Date(ann.v * 1000).toISOString())}</span>
          )}
        </div>

        {!data.site.ready && (
          <div style={{ marginTop: 12 }}>
            <Note tone="danger" title="The site cannot draw this bar yet">
              {!data.site.script && <>{data.site.scriptFile} does not fetch the announcement. </>}
              {!data.site.style && <>{data.site.styleFile} has no rules for it. </>}
              Saving still writes the file, but nothing appears on a page until that half is in place — which
              is why it is said here rather than discovered after a save.
            </Note>
          </div>
        )}

        {data.site.ready && (
          <div style={{ marginTop: 12 }}>
            <Note
              tone={missing === 0 ? "ok" : "warn"}
              title={
                missing === 0
                  ? "Every page can show it"
                  : `${missing} of ${data.pages.total} pages do not load the script`
              }
            >
              {`${data.pages.script} of ${data.pages.total} pages load ${data.site.scriptFile}, which is what draws the bar.`}
            </Note>
          </div>
        )}

        {bad && <Note tone="danger" title="Not saved">{bad.message}{bad.detail ? ` — ${bad.detail}` : ""}</Note>}
        {note && <Note tone="ok">{note}</Note>}

        <div className="row" style={{ marginTop: 12 }}>
          <Btn
            variant="primary"
            icon={<Rocket size={15} />}
            onClick={save}
            disabled={busy || !dirty}
            title={dirty ? undefined : "Nothing has changed yet"}
          >
            Save &amp; publish
          </Btn>
          {dirty && (
            <Btn icon={<Undo2 size={14} />} onClick={() => setDraft(null)} disabled={busy}>
              Discard my edit
            </Btn>
          )}
          <Btn icon={<RefreshCw size={15} />} onClick={read.reload} disabled={busy}>
            Re-read
          </Btn>
        </div>
      </Card>
    </>
  );
}
