/**
 * DocPreview — a quotation as the client will read it.
 *
 * v2.1 printed through `admin-print17.js`, a browser script that built the document out of a JSON blob with
 * `document.write`, three designs (Classic navy and gold, Minimal black on white, Premium espresso and cream)
 * and two layouts. It was the last screen that only existed inside a browser window: nothing else could
 * produce a quotation, and nothing could be checked about one.
 *
 * This is that document as a component. Two things are deliberately different:
 *
 *   · **It computes nothing.** Every figure on the page arrives from the server — the line amounts, the
 *     section subtotals, the document totals — because the moment a document is drawn is the moment its
 *     numbers get quoted, and a preview that disagrees with the record is how a client is told a wrong price.
 *     The only arithmetic here is the numbering (5.1, 5.1.1), which is a way of referring to a line rather
 *     than a value.
 *   · **It says when it is a sample.** A template is not a document with a client, so the preview says so on
 *     the page, not only in a heading above it — the thing being judged is what the client sees, and the
 *     label has to survive being screenshotted.
 *
 * The numbering is v2.1's, character for character: a heading takes the next free `section.n`, lines under a
 * heading are numbered under it, specification lines carry no number at all, and a line somebody numbered by
 * hand keeps their number. It is the only part of the printed page a client refers to out loud ("delete
 * 5.1.1"), so it is the last thing to redesign.
 */
import { Fragment } from "react";
import type { TplItem, TplSection } from "../lib/live";
import { amountInWords, dateLong } from "../lib/format";

export type DocDesign = "classic" | "minimal" | "premium";

export interface DocCompany {
  name: string;
  tagline?: string;
  address?: string;
  phones?: string;
  email?: string;
  web?: string;
  ntn?: string;
  signName?: string;
  signTitle?: string;
}

export interface DocParty {
  name: string;
  company?: string;
  address?: string;
}

export interface DocPreviewProps {
  title: string;
  no: string;
  date: string;
  validUntil?: string;
  client: DocParty;
  project?: string;
  site?: string;
  sections: TplSection[];
  subtotal: number;
  discount: number;
  taxPct: number;
  tax: number;
  total: number;
  terms?: string;
  design?: DocDesign;
  company: DocCompany;
  /** True when this document is a sample — a template with nobody's name on it. */
  sample?: string;
  /** Shown under the totals; blank lines are dropped. */
  note?: string;
}

interface Numbered {
  it: TplItem;
  code: string;
}

/** v2.1's `numbered()`: headings 5.1, their items 5.1.1, lines before any heading 5.1, specs unnumbered. */
export function numberedItems(section: TplSection, si: number): Numbered[] {
  let h = 0;
  let k = 0;
  return (section.items ?? []).map((it) => {
    const kind = it.kind ?? "";
    const own = (it.code ?? "").trim();
    let code = own;
    if (kind === "head") {
      h += 1;
      k = 0;
      code = own || `${si + 1}.${h}`;
    } else if (kind === "spec") {
      code = "";
    } else {
      k += 1;
      code = own || (h ? `${si + 1}.${h}.${k}` : `${si + 1}.${k}`);
    }
    return { it, code };
  });
}

const lines = (text?: string) =>
  String(text ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d{1,2}[.)])\s+/, "").trim())
    .filter(Boolean);

const qtyFmt = (n: number) => (n ? (Math.round(n * 1000) / 1000).toLocaleString("en-US") : "—");
const amtFmt = (n: number) => (n ? Math.round(n).toLocaleString("en-US") : "—");

export function DocPreview(props: DocPreviewProps) {
  const design = props.design ?? "classic";
  const total = props.total;
  return (
    <div className="doc-wrap">
      <article className={`doc doc-${design}`} data-design={design} aria-label={`${props.title} ${props.no}`}>
        {props.sample ? <div className="doc-sample">{props.sample}</div> : null}

        <header className="doc-head">
          <div className="doc-brand">
            <b>{props.company.name}</b>
            {props.company.tagline ? <small>{props.company.tagline}</small> : null}
            {props.company.address ? <em>{props.company.address}</em> : null}
          </div>
          <div className="doc-titles">
            <h1>{props.title}</h1>
            <div className="doc-meta">
              <span>{props.no}</span>
              <span>{dateLong(props.date)}</span>
              {props.validUntil ? <span>Valid until {dateLong(props.validUntil)}</span> : null}
            </div>
          </div>
        </header>

        <div className="doc-boxes">
          <section className="doc-box">
            <small>Prepared for</small>
            <b>{props.client.name || "—"}</b>
            {props.client.company ? <div>{props.client.company}</div> : null}
            {lines(props.client.address).map((l) => <div key={l}>{l}</div>)}
          </section>
          <section className="doc-box">
            <small>Project</small>
            <b>{props.project || "—"}</b>
            {props.site ? <div>{props.site}</div> : null}
          </section>
        </div>

        <table className="doc-table">
          <thead>
            <tr>
              <th className="c-code" />
              <th className="c-desc">Description</th>
              <th className="c-qty">Qty</th>
              <th className="c-unit">Unit</th>
              <th className="c-rate">Rate</th>
              <th className="c-amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {props.sections.map((s, si) => (
              <Fragment key={`sec-${si}`}>
                <tr className="row-section">
                  <td colSpan={4}>{s.name || `Section ${si + 1}`}</td>
                  <td className="c-amt" colSpan={2}>
                    {s.subtotal ? amtFmt(s.subtotal) : ""}
                  </td>
                </tr>
                {lines(s.note).length ? (
                  <tr className="row-note">
                    <td className="c-code" />
                    <td colSpan={5}>{lines(s.note).join(" ")}</td>
                  </tr>
                ) : null}
                {numberedItems(s, si).map(({ it, code }, ii) => (
                  <tr key={`i${si}-${ii}`} className={`row-item${it.kind ? ` row-${it.kind}` : ""}`}>
                    <td className="c-code">{code}</td>
                    <td className="c-desc">{it.desc}</td>
                    <td className="c-qty">{it.kind ? "" : qtyFmt(it.qty)}</td>
                    <td className="c-unit">{it.kind ? "" : it.unit}</td>
                    <td className="c-rate">{it.kind ? "" : amtFmt(it.rate)}</td>
                    <td className="c-amt">{it.kind ? "" : amtFmt(it.amount ?? 0)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>

        <div className="doc-totals">
          <div className="doc-words">
            <small>In words</small>
            <div>{amountInWords(total)}</div>
          </div>
          <table>
            <tbody>
              <tr>
                <th>Subtotal</th>
                <td>{amtFmt(props.subtotal)}</td>
              </tr>
              {props.discount ? (
                <tr>
                  <th>Discount</th>
                  <td>− {amtFmt(props.discount)}</td>
                </tr>
              ) : null}
              {props.taxPct ? (
                <tr>
                  <th>Tax {props.taxPct}%</th>
                  <td>{amtFmt(props.tax)}</td>
                </tr>
              ) : null}
              <tr className="row-total">
                <th>Total</th>
                <td>Rs {amtFmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {lines(props.terms).length ? (
          <section className="doc-terms">
            <small>Terms</small>
            <ol>
              {lines(props.terms).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          </section>
        ) : null}

        {props.note ? <p className="doc-note">{props.note}</p> : null}

        <footer className="doc-foot">
          <div className="doc-sign">
            <b>{props.company.signName || "—"}</b>
            <small>{props.company.signTitle || ""}</small>
          </div>
          <div className="doc-contact">
            {[props.company.phones, props.company.email, props.company.web].filter(Boolean).join(" · ")}
            {props.company.ntn ? ` · NTN ${props.company.ntn}` : ""}
          </div>
        </footer>
      </article>
    </div>
  );
}
