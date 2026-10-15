/**
 * LiveBusiness — the studio's own details, on the website and on every document.
 *
 * This is v2.1's Business info screen, and one thing about it is worth stating plainly, because it is the
 * reason the screen was rebuilt rather than ported: v2.1 updated the website **from the browser**, page by
 * page, and its idea of what the site currently said was a copy of its own defaults. On this site those
 * defaults are wrong — the footer says `Mon–Sat 9:30–6:30` and the stored copy said `10:00–7:30` — so the
 * pairs it built matched nothing, every page came back unchanged, and the screen said the site had been
 * updated. Nothing on it could tell the difference between "the phone number changed in 1,500 places" and
 * "the number I looked for is not on this site".
 *
 * So this screen shows three things v2.1 could not:
 *
 *   · **Where "what the site says" came from.** `stored` when somebody applied a change from here;
 *     otherwise the name of the page it was read off, with a button to read a different one. A baseline
 *     nobody can see is a baseline nobody can correct.
 *   · **The pairs, and which of them match nothing.** Check writes nothing and reports each search string
 *     with the pages it hits, so a wrong number is visible *before* the button that touches 150 pages.
 *   · **A batch id after the write.** The same one-undo page history the header/footer screen uses: the
 *     apply is one batch, and rolling it back is one call.
 *
 * The second tab is the letterhead: the company record every quotation and invoice is printed with, its
 * banks and wallets, its signatories, and the next document number — checked against the numbers already
 * used, because a counter that has fallen behind reissues a number somebody has already been sent.
 *
 * Offline it says so and shows nothing: these are claims about a database and about files on disk.
 */
import { useMemo, useState } from "react";
import { Building2, CheckCircle2, Globe, Plus, RefreshCw, Save, Trash2, Undo2, Wand2 } from "lucide-react";
import { Btn, Card, Empty, Input, Note, PageHead, Pill, Seg } from "../components/primitives";
import { api, ApiFailure } from "../lib/api";
import { useSession } from "../lib/session";
import {
  isPending, useLive,
  type BizApplyResult, type BizCheckResult, type BizData, type BizFromSite, type BizPair,
  type BizRecord, type CompanyData, type CompanyRecord, type CompanySaveResult, type PendingResult,
} from "../lib/live";

type Tab = "website" | "company";

/** The contact fields, in the order the form shows them. */
const CONTACT: { key: keyof BizRecord; label: string; hint?: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone1", label: "Main phone" },
  { key: "phone2", label: "Second phone" },
  { key: "wa", label: "WhatsApp number", hint: "the button dials this one" },
  { key: "addr1", label: "Address line 1" },
  { key: "addr2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
];

/** The letterhead fields, in the order the tab shows them. */
const COMPANY_TEXT: { key: keyof CompanyRecord; label: string; hint?: string }[] = [
  { key: "name", label: "Company name" },
  { key: "tagline", label: "Tagline" },
  { key: "address", label: "Address on documents" },
  { key: "phones", label: "Phones", hint: "as they should print" },
  { key: "email", label: "Email" },
  { key: "web", label: "Website" },
  { key: "ntn", label: "NTN / tax number" },
  { key: "consultant", label: "Consultant line", hint: "shown beside the signature" },
  { key: "signName", label: "Signatory" },
  { key: "signTitle", label: "Their title" },
];

const BANK_FIELDS = ["bank", "title", "account", "iban", "branch", "code", "use"];
const WALLET_FIELDS = ["name", "number"];
const SIGNER_FIELDS = ["name", "title"];

/** The empty row a table adds when somebody presses Add. */
const blank = (fields: string[]) => Object.fromEntries(fields.map((f) => [f, f === "use" ? "all" : ""]));

export function LiveBusiness() {
  const { link, reason } = useSession();
  const mine = useLive<BizData>("/business");
  const companyLive = useLive<CompanyData>("/business/company");

  const [tab, setTab] = useState<Tab>("website");
  /* The edits live in the draft; until somebody types, the form reads the server's answer. That is one
     state rather than two because it removes a whole family of empty-render bugs: no effect fills the
     fields after the first paint (React does not run effects during a server render, so the smoke test
     would otherwise see a screen of nothing), and a reload after an apply shows the new values. */
  const [bizDraft, setBizDraft] = useState<BizRecord | null>(null);
  const [coDraft, setCoDraft] = useState<CompanyRecord | null>(null);
  const [check, setCheck] = useState<BizCheckResult | null>(null);
  const [read, setRead] = useState<BizFromSite | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [bad, setBad] = useState<ApiFailure | null>(null);

  /* `biz` and `company` are what the form shows: the draft when there is one, the server's answer otherwise. */
  const biz = bizDraft ?? mine.data?.biz ?? null;
  const company = coDraft ?? companyLive.data?.company ?? null;
  const base = () => bizDraft ?? mine.data?.biz ?? null;
  const baseCo = () => coDraft ?? companyLive.data?.company ?? null;

  const set = (key: keyof BizRecord, v: string) => {
    const b = base();
    if (b) setBizDraft({ ...b, [key]: v });
  };
  const setCo = (key: keyof CompanyRecord, v: string | number) => {
    const c = baseCo();
    if (c) setCoDraft({ ...c, [key]: v });
  };
  const setRow = (list: "banks" | "wallets" | "signers", i: number, field: string, v: string) => {
    const c = baseCo();
    if (c) setCoDraft({ ...c, [list]: c[list].map((r, j) => (j === i ? { ...r, [field]: v } : r)) });
  };
  const addRow = (list: "banks" | "wallets" | "signers", fields: string[]) => {
    const c = baseCo();
    if (c) setCoDraft({ ...c, [list]: [...c[list], blank(fields)] });
  };
  const dropRow = (list: "banks" | "wallets" | "signers", i: number) => {
    const c = baseCo();
    if (c) setCoDraft({ ...c, [list]: c[list].filter((_, j) => j !== i) });
  };

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setBad(null);
    setDone(null);
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
  async function doCheck() {
    const r = await run(() => api.post<BizCheckResult | PendingResult>("/business/check", { biz, limit: 100 }));
    if (r && isPending(r)) setDone(r.message);
    else setCheck(r as BizCheckResult);
  }

  /** Apply: the same edit, written — one batch the page history can roll back. */
  async function apply() {
    const r = await run(() => api.post<BizApplyResult | PendingResult>("/business", { biz, note: "Business details updated from the admin" }));
    if (r && isPending(r)) {
      setDone(r.message);
      return;
    }
    if (r && "batch" in r) {
      setCheck(null);
      const files = r.assets.filter((a) => a.changed).map((a) => a.rel);
      setDone(
        `${r.pages} page${r.pages === 1 ? "" : "s"} changed out of ${r.scanned} read, ${r.places} place${r.places === 1 ? "" : "s"} in all` +
        (files.length ? ` — plus ${files.join(", ")}` : ", and neither site script matched anything") +
        (r.batch ? `. Batch ${r.batch.slice(0, 8)} in page history: one call rolls all of it back.` : "."),
      );
      setBizDraft(null);
      mine.reload();
    }
  }

  /** Read what the site says off a page, and put it in the fields. */
  async function fromSite(rel: string) {
    const r = await run(() => api.get<BizFromSite>(`/business/from-site?rel=${encodeURIComponent(rel)}`));
    if (!r) return;
    setRead(r);
    const b = base();
    if (b) setBizDraft({ ...b, ...r.values });
    const missing = r.missing.length ? ` It did not find: ${r.missing.join(", ")} — those keep the values already in the form.` : "";
    setDone(`Read ${r.rel}: ${r.found.length} of the details are on that page.${missing}`);
  }

  async function saveCompany() {
    if (!company) return;
    const r = await run(() => api.post<CompanySaveResult | PendingResult>("/business/company", { company }));
    if (r && isPending(r)) {
      setDone(r.message);
      return;
    }
    if (r && "company" in r) {
      setCoDraft(null);
      setDone(
        r.changed.length
          ? `Saved: ${r.changed.join(", ")}. Every quotation and invoice printed from now on carries these.`
          : "Saved, and nothing differed from what was already stored.",
      );
      companyLive.reload();
    }
  }

  /* ---------------- the states that must not lie ---------------- */

  if (link !== "live") {
    return (
      <>
        <PageHead title="Business info" sub="The details on every page, and the letterhead on every document" />
        <Note tone={link === "offline" ? "danger" : "warn"} title={link === "offline" ? "Not connected" : "Sign in"}>
          {link === "offline"
            ? "api/v2 is not answering. The details could be changed by hand on the server, but this screen will not pretend it knows what the site says."
            : "Sign in to change the business details."}
          {reason ? ` — ${reason}` : ""}
        </Note>
      </>
    );
  }

  if (!mine.data && mine.loading) {
    return (
      <>
        <PageHead title="Business info" sub="The details on every page, and the letterhead on every document" />
        <Card><div className="muted" style={{ padding: 18 }}>Loading…</div></Card>
      </>
    );
  }

  if (!mine.data && mine.error) {
    return (
      <>
        <PageHead title="Business info" sub="The details on every page, and the letterhead on every document" />
        <Note tone="danger" title="The server did not answer">{mine.error.message}</Note>
      </>
    );
  }

  const data = mine.data!;
  const fromPage = data.source !== "stored" && data.source !== "defaults";

  return (
    <>
      <PageHead
        title="Business info"
        sub="The phone number, the address and the hours on every page — and the letterhead every document prints"
        actions={
          <Btn size="sm" icon={<RefreshCw size={14} />} onClick={() => { mine.reload(); companyLive.reload(); }}>
            Refresh
          </Btn>
        }
      />

      <div className="stack">
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: "website", label: "On the website" },
            { id: "company", label: "Company & documents" },
          ]}
        />

        {bad && <Note tone="danger" title="The server refused">{bad.message}</Note>}
        {done && <Note tone="ok" title="Done">{done}</Note>}

        {tab === "website" && biz && (
          <>
            <Note tone={fromPage || data.source === "defaults" ? "warn" : "info"} title={fromPage ? `Read off ${data.source}` : data.source === "defaults" ? "Nobody has set these yet" : "Last applied from here"}>
              {fromPage
                ? "Nobody has applied a change from this console yet, so what the website says was read off a real page rather than assumed. If the site has moved on since, read it again — a baseline that is wrong is why a change can update nothing and still report success."
                : data.source === "defaults"
                  ? "No page could be read, so these are the shipped defaults. Read the site or type the real values before applying anything."
                  : "What the website says is what this console last wrote. If the site's files were edited outside the admin, read it again before the next change."}
              {" "}
              <button className="btn sm ghost" type="button" disabled={busy} onClick={() => void fromSite(data.sample)}>
                Read {data.source === "stored" ? "the site again" : "again"} from {data.sample}
              </button>
            </Note>

            <div className="grid grid-2">
              <Card title="Contact" sub="Every page's footer and the contact page carry these.">
                <div className="grid grid-2">
                  {CONTACT.map((f) => (
                    <label key={String(f.key)} className="stack">
                      <span className="field-label">{f.label}{f.hint ? ` — ${f.hint}` : ""}</span>
                      <Input value={String(biz[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
                    </label>
                  ))}
                </div>
              </Card>

              <Card title="Opening hours" sub="Stored 24-hour; the site prints them as 9:30–6:30.">
                <div className="grid grid-3">
                  <label className="stack">
                    <span className="field-label">Days</span>
                    <select className="input" value={biz.days} onChange={(e) => set("days", e.target.value)}>
                      {data.days.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="stack">
                    <span className="field-label">Opens</span>
                    <Input type="time" value={biz.open} onChange={(e) => set("open", e.target.value)} />
                  </label>
                  <label className="stack">
                    <span className="field-label">Closes</span>
                    <Input type="time" value={biz.close} onChange={(e) => set("close", e.target.value)} />
                  </label>
                </div>
                <p className="muted" style={{ fontSize: "var(--fs-12)" }}>
                  {biz.days} {biz.open}–{biz.close} · the site shows this as {biz.days} {twelve(biz.open)}–{twelve(biz.close)}
                </p>
              </Card>
            </div>

            <Card title="Social profiles" sub={`Filled profiles appear in the footer's social row. ${data.site.socialRow} of ${data.site.pages} pages carry that row today.`}>
              {data.site.socialRow === 0 ? (
                <Note tone="warn" title="The footer has no social row yet">
                  Applying these keeps the links in the database but cannot put them on a page — the footer's markup is the Header &amp; footer screen's job. Setting a profile here is still worth it: it is what a page's row will be filled from once there is one.
                </Note>
              ) : null}
              <div className="grid grid-2">
                {Object.entries(data.socials).map(([key, label]) => (
                  <label key={key} className="stack">
                    <span className="field-label">{label}</span>
                    <Input
                      placeholder="https://"
                      value={String(biz[key as keyof BizRecord] ?? "")}
                      onChange={(e) => set(key as keyof BizRecord, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </Card>

            <Card
              title="Put it on the site"
              sub="Check measures the whole site and writes nothing. Apply writes the pages as one batch."
              actions={
                <div className="row">
                  <Btn size="sm" icon={<Wand2 size={14} />} disabled={busy} onClick={() => void doCheck()}>
                    Check the site
                  </Btn>
                  <Btn
                    size="sm"
                    variant="primary"
                    icon={<CheckCircle2 size={14} />}
                    disabled={busy}
                    onClick={() => void apply()}
                  >
                    {check ? `Update the website (${check.scan.pages} pages)` : "Update the website"}
                  </Btn>
                </div>
              }
            >
              {!check && <p className="muted">Check first: it lists the pages and the exact strings that would change. Nothing is written until you press Update.</p>}
              {check && <CheckReport result={check} pairs={check.pairs} />}
            </Card>
          </>
        )}

        {tab === "company" && company && (
          <>
            <Note tone="info" title="These print on every quotation and invoice">
              The letterhead, the bank account the client pays into, and the number the next document takes. Only the fields you change are written — saving one tab never blanks another.
            </Note>

            <Card title="Letterhead" sub="Shown at the top of every document.">
              <div className="grid grid-2">
                {COMPANY_TEXT.map((f) => (
                  <label key={String(f.key)} className="stack">
                    <span className="field-label">{f.label}{f.hint ? ` — ${f.hint}` : ""}</span>
                    <Input value={String(company[f.key] ?? "")} onChange={(e) => setCo(f.key, e.target.value)} />
                  </label>
                ))}
              </div>
            </Card>

            <Card title="Document numbers" sub={`The highest number already used is ${companyLive.data?.used.toLocaleString("en-US") ?? "…"}.`}>
              <div className="grid grid-2">
                <label className="stack">
                  <span className="field-label">Quotation prefix</span>
                  <Input value={company.prefix} onChange={(e) => setCo("prefix", e.target.value)} />
                </label>
                <label className="stack">
                  <span className="field-label">Next quotation number</span>
                  <Input type="number" value={String(company.nextNo)} onChange={(e) => setCo("nextNo", Number(e.target.value))} />
                </label>
                <label className="stack">
                  <span className="field-label">Furniture prefix</span>
                  <Input value={company.wfPrefix} onChange={(e) => setCo("wfPrefix", e.target.value)} />
                </label>
                <label className="stack">
                  <span className="field-label">Next furniture number</span>
                  <Input type="number" value={String(company.wfNext)} onChange={(e) => setCo("wfNext", Number(e.target.value))} />
                </label>
                <label className="stack">
                  <span className="field-label">Quotation validity (days)</span>
                  <Input type="number" value={String(company.validDays)} onChange={(e) => setCo("validDays", Number(e.target.value))} />
                </label>
              </div>
            </Card>

            <Card
              title="Bank accounts"
              sub="Shown on invoices. The line a bank is for decides which projects offer it."
              actions={<Btn size="sm" icon={<Plus size={14} />} onClick={() => addRow("banks", BANK_FIELDS)}>Add a bank</Btn>}
            >
              {company.banks.length === 0 ? (
                <Empty title="No bank accounts stored" sub="Invoices print whichever accounts are listed here." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Bank</th><th>Title</th><th>Account</th><th>IBAN</th><th>Branch</th><th>Code</th><th>For</th><th /></tr>
                    </thead>
                    <tbody>
                      {company.banks.map((row, i) => (
                        <tr key={i}>
                          {BANK_FIELDS.map((f) => (
                            <td key={f}>
                              {f === "use" ? (
                                <select className="input" value={row.use || "all"} onChange={(e) => setRow("banks", i, "use", e.target.value)}>
                                  {(companyLive.data?.bankUse ?? ["all"]).map((u: string) => <option key={u} value={u}>{u}</option>)}
                                </select>
                              ) : (
                                <Input value={row[f] ?? ""} onChange={(e) => setRow("banks", i, f, e.target.value)} />
                              )}
                            </td>
                          ))}
                          <td className="r">
                            <Btn size="sm" iconOnly icon={<Trash2 size={13} />} title="Remove this account" onClick={() => dropRow("banks", i)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="grid grid-2">
              <Card
                title="Wallets"
                sub="JazzCash, Easypaisa — printed under the banks."
                actions={<Btn size="sm" icon={<Plus size={14} />} onClick={() => addRow("wallets", WALLET_FIELDS)}>Add</Btn>}
              >
                {company.wallets.length === 0 ? <p className="muted">None stored.</p> : company.wallets.map((row, i) => (
                  <div className="row" key={i} style={{ gap: 8, marginBottom: 8 }}>
                    {WALLET_FIELDS.map((f) => (
                      <Input key={f} placeholder={f} value={row[f] ?? ""} onChange={(e) => setRow("wallets", i, f, e.target.value)} />
                    ))}
                    <Btn size="sm" iconOnly icon={<Trash2 size={13} />} title="Remove" onClick={() => dropRow("wallets", i)} />
                  </div>
                ))}
              </Card>

              <Card
                title="Signatories"
                sub="Who signs the documents, in the order shown."
                actions={<Btn size="sm" icon={<Plus size={14} />} onClick={() => addRow("signers", SIGNER_FIELDS)}>Add</Btn>}
              >
                {company.signers.length === 0 ? <p className="muted">None stored.</p> : company.signers.map((row, i) => (
                  <div className="row" key={i} style={{ gap: 8, marginBottom: 8 }}>
                    {SIGNER_FIELDS.map((f) => (
                      <Input key={f} placeholder={f} value={row[f] ?? ""} onChange={(e) => setRow("signers", i, f, e.target.value)} />
                    ))}
                    <Btn size="sm" iconOnly icon={<Trash2 size={13} />} title="Remove" onClick={() => dropRow("signers", i)} />
                  </div>
                ))}
              </Card>
            </div>

            <div className="row-between">
              <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
                <Building2 size={13} /> {company.name} · {company.phones} · {company.email}
              </span>
              <Btn variant="primary" size="sm" icon={<Save size={14} />} disabled={busy} onClick={() => void saveCompany()}>
                Save the letterhead
              </Btn>
            </div>
          </>
        )}

        {/* The link a person needs after applying: the history where this change is one row. */}
        {tab === "website" && (
          <p className="muted" style={{ fontSize: "var(--fs-12)" }}>
            <Globe size={13} /> Pages changed from here are one row in <a href="/pages">Pages → History</a>, where the whole batch rolls back together.
            {read ? <span> · Last read from {read.rel}.</span> : null}
          </p>
        )}
      </div>
    </>
  );
}

/** `19:30` → `7:30`, the way the site's footer spells a time. */
function twelve(t: string): string {
  const [h, m] = t.split(":");
  const hour = Number(h) % 12 || 12;
  return `${hour}:${m ?? "00"}`;
}

/**
 * What Check found — the half of this screen v2.1 did not have.
 *
 * Two lists, because they answer different questions: the pages that would change (so the number on the
 * button is a measurement), and the search strings that match **nowhere** (so a baseline that is wrong
 * cannot pass for success). A pair matching nothing is the state v2.1 reported as "website updated".
 */
function CheckReport({ result, pairs }: { result: BizCheckResult; pairs: BizPair[] }) {
  const { scan } = result;
  /* The server sends the pairs a person typed; the moves it makes behind them (the WhatsApp swap) arrive as
     a count. The filter stays because a pair list is what an older answer would send, and a pair with a
     countable flag of 0 is an internal move wherever it comes from. */
  const visible = useMemo(() => pairs.filter((p) => (p[2] ?? 1) === 1), [pairs]);
  return (
    <div className="stack">
      <div className="row">
        <Pill tone={scan.pages ? "ok" : "warn"}>{scan.pages} pages</Pill>
        <Pill tone="info">{scan.places} places</Pill>
        <Pill>{scan.scanned} pages read</Pill>
        <Pill>{visible.length} strings looked for</Pill>
        {scan.social.pages > 0 && <Pill tone="info">{scan.social.pages} social rows</Pill>}
        {result.moves > 0 && (
          <Pill tone="info" title="The digits-only phone pairs cannot be allowed to rewrite a wa.me link, so the WhatsApp number is swapped through a temporary value first">
            WhatsApp link rewritten
          </Pill>
        )}
      </div>

      {scan.none.length > 0 && (
        <Note tone="warn" title={`${scan.none.length} string${scan.none.length === 1 ? "" : "s"} matched nothing on the site`}>
          These are what the site would have to say for the change to reach it. If they look like the old
          values but the site says something else, the baseline is wrong — read the site again and check the
          form: {scan.none.slice(0, 6).join(" · ")}
          {scan.none.length > 6 ? ` · and ${scan.none.length - 6} more` : ""}
        </Note>
      )}

      {scan.pages === 0 ? (
        <Empty title="Nothing would change" sub="Every page already matches these details." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Page</th><th>Places</th><th>Social row</th></tr></thead>
            <tbody>
              {scan.changed.slice(0, 25).map((p) => (
                <tr key={p.rel}>
                  <td><a href={p.url} target="_blank" rel="noreferrer">{p.rel}</a></td>
                  <td>{p.places}</td>
                  <td>{p.social ? "fills in" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scan.truncated && <p className="muted" style={{ fontSize: "var(--fs-12)" }}>…and more pages than this list shows.</p>}
        </div>
      )}

      <details>
        <summary className="muted" style={{ fontSize: "var(--fs-12)", cursor: "pointer" }}>
          <Undo2 size={13} /> The {visible.length} exact replacements
        </summary>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>On the site now</th><th>Becomes</th></tr></thead>
            <tbody>
              {visible.map((p, i) => (
                <tr key={i}><td><code>{p[0]}</code></td><td><code>{p[1]}</code></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
