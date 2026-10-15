/* Formatting helpers — one place, so a number never renders two ways. */

export const money = (n: number, opts: { compact?: boolean; currency?: string } = {}) => {
  const { compact = false, currency = "PKR" } = opts;
  if (compact) {
    const abs = Math.abs(n);
    const unit = abs >= 1e7 ? "Cr" : abs >= 1e5 ? "L" : abs >= 1e3 ? "k" : "";
    const div = unit === "Cr" ? 1e7 : unit === "L" ? 1e5 : unit === "k" ? 1e3 : 1;
    return `${currency} ${(n / div).toFixed(unit ? 1 : 0)}${unit}`;
  }
  return `${currency} ${n.toLocaleString("en-PK")}`;
};

export const num = (n: number) => n.toLocaleString("en-PK");

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** "3m ago" · "2h ago" · "12 Oct" ·
 *  The clock defaults to *now*. A fixed date — of the kind a prototype pins so its own samples read
 *  correctly — makes every relative time wrong against a live row, and the error is invisible. */
export function timeAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** A file size in the unit a person would say it in. */
export const bytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * A whole-rupee amount in words, the way the printed quotation writes it: lakh and crore, in the sub-continent's
 * numbering rather than the short scale (12,50,000 is "Twelve lakh fifty thousand", not "one million two hundred
 * and fifty thousand").
 *
 * Ported from v2.1's print page because it is a promise the document makes to a client: the figure appears
 * twice, once as digits and once in words, and the two must agree. It is a pure function of an integer, so
 * the smoke test checks the boundary cases rather than a person checking one invoice.
 */
export function amountInWords(n: number): string {
  const num = Math.round(Math.abs(n));
  if (num === 0) return "Zero rupees only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const under1000 = (x: number): string => {
    if (x === 0) return "";
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
    return ones[Math.floor(x / 100)] + " hundred" + (x % 100 ? " " + under1000(x % 100) : "");
  };
  const parts: string[] = [];
  const crore = Math.floor(num / 1e7);
  const lakh = Math.floor((num % 1e7) / 1e5);
  const thousand = Math.floor((num % 1e5) / 1e3);
  const rest = num % 1e3;
  if (crore) parts.push(under1000(crore) + " crore");
  if (lakh) parts.push(under1000(lakh) + " lakh");
  if (thousand) parts.push(under1000(thousand) + " thousand");
  if (rest) parts.push(under1000(rest));
  /* "Twelve lakh Eighty four thousand" reads like a list of headings, so everything after the first word is
     lower case — the sentence a client reads under the total. */
  const flat = parts.join(" ").replace(/\s+/g, " ").trim();
  const words = flat.charAt(0).toUpperCase() + flat.slice(1).toLowerCase();
  return words + " rupees only";
}

/** A whole date as the document writes it: 14 October 2026. */
export const dateLong = (iso: string) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? String(iso ?? "") : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
