/* Chart wrappers.
   The v2.1 audit found charts hard-coded their palette, so they stayed blue in
   the obsidian theme (AD-6 / RC-3). Here every colour comes from useTokens(),
   which re-reads the resolved CSS variables whenever the theme changes. */
import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTokens } from "../lib/theme";

const AXIS = { fontSize: 11, fontFamily: "inherit" } as const;

function useAxis() {
  const t = useTokens();
  return {
    tick: { fill: "#667085", ...AXIS },
    axisLine: { stroke: t.grid },
    tickLine: false as const,
  };
}

function TipBox({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  format?: (v: number, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-md)",
        padding: "8px 11px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span className="muted">{p.name}</span>
          <b style={{ marginLeft: "auto" }}>
            {format && typeof p.value === "number" ? format(p.value, p.name) : p.value}
          </b>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ data, tone }: { data: number[]; tone?: string }) {
  const t = useTokens();
  const rows = data.map((v, i) => ({ i, v }));
  const colour = tone ?? t.accent;
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${colour.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={colour}
            strokeWidth={1.6}
            fill={`url(#sp-${colour.replace(/[^a-z0-9]/gi, "")})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Quoted vs won value, in PKR lakh. */
export function RevenueChart({ data }: { data: { m: string; quoted: number; won: number }[] }) {
  const t = useTokens();
  const axis = useAxis();
  const fmt = (v: number) => `PKR ${v}L`;
  return (
    <div style={{ height: 268 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="g-won" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.viz[0]} stopOpacity={0.32} />
              <stop offset="100%" stopColor={t.viz[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="m" {...axis} />
          <YAxis {...axis} width={62} tickFormatter={(v) => `${v}L`} />
          <Tooltip content={<TipBox format={(v) => fmt(v)} />} />
          <Area
            type="monotone" name="Quoted" dataKey="quoted"
            stroke={t.viz[1]} strokeWidth={1.6} strokeDasharray="4 3"
            fill="none" isAnimationActive={false}
          />
          <Area
            type="monotone" name="Won" dataKey="won"
            stroke={t.viz[0]} strokeWidth={2.2} fill="url(#g-won)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChannelBars({ data }: { data: { name: string; value: number; tone: string }[] }) {
  const t = useTokens();
  const axis = useAxis();
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={t.grid} horizontal={false} />
          <XAxis type="number" {...axis} />
          <YAxis type="category" dataKey="name" width={104} {...axis} />
          <Tooltip content={<TipBox />} cursor={{ fill: "var(--surface-3)" }} />
          <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.tone} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Lead → client conversion over time, for the pipeline screen. */
export function ConversionLine({ data }: { data: { m: string; conv: number }[] }) {
  const t = useTokens();
  const axis = useAxis();
  return (
    <div style={{ height: 190 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="m" {...axis} />
          <YAxis {...axis} width={52} tickFormatter={(v) => `${v}%`} />
          <ReferenceLine y={18.7} stroke={t.viz[3]} strokeDasharray="4 3"
            label={{ value: "target 18.7%", position: "insideTopRight", fontSize: 10, fill: "#667085" }} />
          <Tooltip content={<TipBox format={(v) => `${v}%`} />} />
          <Line type="monotone" name="Conversion" dataKey="conv" stroke={t.accent}
            strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny donut for health scores — pure SVG, no chart lib needed. */
export function Ring({
  value,
  max = 100,
  size = 62,
  label,
  tone,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  tone?: string;
}) {
  const t = useTokens();
  const colour = tone ?? (value / max >= 0.9 ? "var(--ok)" : value / max >= 0.5 ? "var(--warn)" : "var(--danger)");
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <div style={{ width: size, textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${value}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.grid} strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={5}
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
          fontSize={size > 56 ? 15 : 12} fontWeight={650} fill="#4a5264">
          {value}
        </text>
      </svg>
      {label && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>}
    </div>
  );
}

/** Theme gallery swatch list, driven by the same tokens. */
export function TokenSwatches({ keys }: { keys: string[] }) {
  const t = useTokens();
  const val = (k: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  void t;
  return (
    <div className="swatches">
      {keys.map((k) => (
        <div className="swatch" key={k}>
          <div className="chip" style={{ background: `var(${k})` }} />
          <div className="meta">
            <b>{k}</b>
            <span className="muted mono">{val(k) || "—"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function useChartTokens() {
  return useMemo(() => useTokens, []);
}
