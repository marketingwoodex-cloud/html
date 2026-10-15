/* Small, dependency-free primitives. Styling comes entirely from tokens.css. */
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, Inbox } from "lucide-react";

export function Card({
  title,
  sub,
  actions,
  children,
  foot,
  tight,
  className,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  tight?: boolean;
  className?: string;
}) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={clsx("card-body", tight && "tight")}>{children}</div>
      {foot && <div className="card-foot">{foot}</div>}
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
  plain,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "accent";
  plain?: boolean;
  /** The full text when the pill shows an abbreviation — a tooltip, not a second line. */
  title?: string;
}) {
  return (
    <span className={clsx("pill", plain && "plain")} data-tone={tone} title={title}>
      {children}
    </span>
  );
}

/** Semantic status → pill tone. One map, so statuses look the same everywhere. */
export function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "info" | "accent" {
  switch (status) {
    case "approved":
    case "won":
    case "paid":
    case "published":
    case "connected":
      return "ok";
    case "sent":
    case "viewed":
    case "visit":
    case "contacted":
    case "partial":
      return "accent";
    case "draft":
    case "new":
      return "info";
    case "expired":
    case "overdue":
    case "late":
      return "warn";
    case "rejected":
    case "lost":
    case "failed":
    case "unpaid":
      return "danger";
    default:
      return "neutral";
  }
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  size?: "md" | "sm";
  iconOnly?: boolean;
  /** A leading icon, or the only content of an `iconOnly` button. */
  icon?: ReactNode;
};

export function Btn({ variant = "default", size = "md", iconOnly, icon, className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={clsx(
        "btn",
        variant !== "default" && variant,
        size === "sm" && "sm",
        iconOnly && "icon",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("input", props.className)} />;
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Avatar({ name }: { name: string }) {
  const text = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return <span className="avatar">{text}</span>;
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head row-between">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <p style={{ fontWeight: 600, color: "var(--text)" }}>{title}</p>
      {sub && <p style={{ fontSize: "var(--fs-12)" }}>{sub}</p>}
    </div>
  );
}

/**
 * An honest message in the page — not a toast, because the thing it says is usually a *reason*: why the
 * numbers are empty, why a rule cannot be published, what the server did after a save.
 *
 * `title` exists because the sentence a person needs first should not be buried in a paragraph: "3 rules
 * point nowhere" is the message, and the explanation belongs under it.
 */
export function Note({
  children,
  tone = "info",
  title,
}: {
  children?: ReactNode;
  tone?: "info" | "ok" | "warn" | "danger";
  title?: ReactNode;
}) {
  const Icon = tone === "warn" || tone === "danger" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={clsx("note", tone !== "info" && tone)}>
      <Icon size={16} />
      <div>
        {title ? <strong className="note-title">{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function Delta({ value }: { value: number }) {
  const dir = value > 0.001 ? "up" : value < -0.001 ? "down" : "flat";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
  return (
    <span className="delta" data-dir={dir}>
      {arrow} {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

export function Bar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${w}%`, background: tone ?? "var(--viz-1)" }} />
    </div>
  );
}
