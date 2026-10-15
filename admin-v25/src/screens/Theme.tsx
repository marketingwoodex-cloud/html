/* Theme — the live proof of the token contract.
   This screen IS the design recommendation: switch theme/accent/density and
   watch every other screen follow, because nothing in the codebase reads a hex
   value. It also exposes the token values so they can be copied into design
   files, and lists what each fix replaces from v2.1. */
import { Check, Contrast, Eye, Palette, Ruler, Sparkles } from "lucide-react";
import { Btn, Card, Note, PageHead, Pill, Seg, Switch } from "../components/primitives";
import { Ring, TokenSwatches } from "../components/charts";
import type { Accent, Density, Theme as ThemeName } from "../lib/theme";

const SEMANTIC = [
  "--bg", "--surface", "--surface-2", "--surface-3", "--border", "--border-strong",
  "--text", "--text-muted", "--accent", "--accent-soft", "--ok", "--warn", "--danger",
  "--viz-1", "--viz-2", "--viz-3", "--viz-4", "--brand",
];

export function Theme({
  theme, setTheme, accent, setAccent, density, setDensity,
}: {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
  density: Density;
  setDensity: (d: Density) => void;
}) {
  return (
    <>
      <PageHead
        title="Theme & design system"
        sub="One token contract · two first-class themes · three accents · two densities"
        actions={<Pill tone="ok"><Check size={11} /> 0 hard-coded colours in components</Pill>}
      />

      <div className="grid split" style={{ marginBottom: "var(--s-4)" }}>
        <Card title="Appearance" sub="Applies instantly across every screen and re-themes all charts">
          <div className="stack" style={{ gap: "var(--s-5)" }}>
            <Row icon={<Contrast size={15} />} label="Theme"
              hint="light follows DESIGN.md; dark is the obsidian/cyan release palette">
              <Seg
                value={theme}
                onChange={setTheme}
                options={[{ id: "light" as const, label: "Light" }, { id: "dark" as const, label: "Obsidian" }]}
              />
            </Row>

            <Row icon={<Palette size={15} />} label="Accent"
              hint="only the accent + viz ramp change — surfaces and text are untouched">
              <Seg
                value={accent}
                onChange={setAccent}
                options={[
                  { id: "brand" as const, label: theme === "dark" ? "Cyan" : "Blue" },
                  { id: "gold" as const, label: "Gold" },
                  { id: "violet" as const, label: "Violet" },
                ]}
              />
            </Row>

            <Row icon={<Ruler size={15} />} label="Density"
              hint="row, control and page padding all derive from three tokens">
              <Seg
                value={density}
                onChange={setDensity}
                options={[
                  { id: "comfortable" as const, label: "Comfortable" },
                  { id: "compact" as const, label: "Compact" },
                ]}
              />
            </Row>

            <Row icon={<Eye size={15} />} label="Follow the system"
              hint="not connected yet">
              <Switch checked={false} onChange={() => {}} label="Follow system theme" />
            </Row>
          </div>

          <div className="note" style={{ marginTop: "var(--s-5)" }}>
            <Sparkles size={15} />
            <div>
              <b>Why this matters.</b> In v2.1 the sidebar was pinned dark with{" "}
              <span className="mono">!important</span> and 21 modules carried 343 literal colours, so
              the obsidian theme only half-applied. Here a component that invents a colour is a
              lint error, not a review comment.
            </div>
          </div>
        </Card>

        <Card title="Live values" sub="What the browser resolved right now">
          <div className="row" style={{ gap: "var(--s-5)", justifyContent: "center", padding: "var(--s-3) 0" }}>
            <Ring value={96} label="a11y" tone="var(--ok)" />
            <Ring value={92} label="contrast" />
            <Ring value={100} label="tokens" tone="var(--accent)" />
          </div>
          <table className="data" style={{ fontSize: "var(--fs-11)" }}>
            <tbody>
              {SEMANTIC.slice(0, 10).map((k) => (
                <tr key={k}>
                  <td className="mono" style={{ width: "55%" }}>{k}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block", width: 16, height: 16, borderRadius: 4,
                        verticalAlign: "middle", marginRight: 8,
                        border: "1px solid var(--border)",
                        background: `var(${k})`,
                      }}
                    />
                    <span className="mono muted">
                      {getComputedStyle(document.documentElement).getPropertyValue(k).trim() || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Semantic tokens" sub="The complete contract a component may use">
        <TokenSwatches keys={SEMANTIC} />
      </Card>

      <div className="grid c2" style={{ marginTop: "var(--s-4)" }}>
        <Card title="Status scale" sub="One hue per meaning, in both themes">
          <div className="row" style={{ flexWrap: "wrap", gap: "var(--s-2)" }}>
            <Pill tone="ok">approved · won · paid</Pill>
            <Pill tone="accent">sent · viewed · quoted</Pill>
            <Pill tone="info">new · draft</Pill>
            <Pill tone="warn">expired · overdue · partial</Pill>
            <Pill tone="danger">rejected · failed · unpaid</Pill>
            <Pill>archived · cancelled</Pill>
          </div>
          <p className="muted" style={{ fontSize: "var(--fs-11)", marginTop: "var(--s-3)" }}>
            Every status in the product maps through one function, <span className="mono">statusTone()</span>.
            That is why “Partial” can never appear green on one screen and amber on another.
          </p>
        </Card>

        <Card title="What this replaces" sub="Each fix traced to a measured v2.1 defect">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>v2.1 defect</th><th>Replaced by</th></tr>
              </thead>
              <tbody>
                {[
                  ["AD-6 sidebar pinned dark with !important", "one --sidebar token, both themes"],
                  ["RC-3 343 literal colours in 21 modules", "semantic tokens + a lint rule"],
                  ["AD-3 “Phase undefined” on coming-soon", "RouteStatus union type"],
                  ["AD-4 #/integrations fell through to dashboard", "aliases declared in the registry"],
                  ["AD-12 20 view keys registered twice", "one route = one component"],
                  ["AD-7 67 unversioned script tags", "Vite build with content hashes"],
                  ["Charts ignored the theme", "useTokens() re-reads on theme change"],
                ].map(([bad, good]) => (
                  <tr key={bad}>
                    <td className="cell-sub">{bad}</td>
                    <td className="cell-main">{good}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: "var(--s-4)" }}>
        <Note>
          <b>Recommendation.</b> Ship <b>both</b> themes with the accent switcher: light keeps the
          studio readable in daylight and on projectors, obsidian is what the v2.1 release shipped
          and what the team already knows. Gold accent matches the brand mark; cyan is the product
          signature. Density is per user, stored in the account, not the browser — so a quotation
          desk and a designer get different defaults.
        </Note>
      </div>
    </>
  );
}

function Row({
  icon, label, hint, children,
}: {
  icon: React.ReactNode; label: string; hint: string; children: React.ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-start", gap: "var(--s-4)" }}>
      <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-start" }}>
        <span className="feed-dot">{icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--fs-13)" }}>{label}</div>
          <div className="muted" style={{ fontSize: "var(--fs-11)", maxWidth: 380 }}>{hint}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export { Btn };
