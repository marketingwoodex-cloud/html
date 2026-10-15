/* Application shell: sidebar · topbar · content. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Bell, ChevronDown, ChevronsLeft, Menu, Moon, PanelLeft, Search, Sun, User, LogOut,
} from "lucide-react";
import clsx from "clsx";
import { SECTIONS, sectionRoutes, type Role } from "../lib/nav";
import { linkPill } from "../lib/live";
import type { Theme, Density } from "../lib/theme";
import { Avatar, Btn, Pill } from "./primitives";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Master", admin: "Manager", editor: "Developer", sales: "Sales", support: "Support",
};

export interface Badges { leads: number; chat: number; approvals: number; total: number }

export function Shell({
  children,
  role,
  setRole,
  theme,
  toggleTheme,
  density,
  setDensity,
  badges,
  onOpenPalette,
  routeId,
  crumbs,
  link,
  linkText,
  user,
  onSignOut,
}: {
  children: ReactNode;
  role: Role;
  setRole: (r: Role) => void;
  theme: Theme;
  toggleTheme: () => void;
  density: Density;
  setDensity: (d: Density) => void;
  badges: Badges;
  onOpenPalette: () => void;
  routeId: string;
  crumbs: { label: string; to?: string }[];
  /** live | signedOut | offline | checking — decides the strip, and whether the role switcher is real */
  link: "checking" | "offline" | "signedOut" | "live";
  linkText: string;
  user: { name: string; roleLabel: string } | null;
  onSignOut: () => void;
}) {
  const [mini, setMini] = useState(false);
  const loc = useLocation();
  /* One label for the link, derived here so the pill and the sentence it leads can never disagree. */
  const pill = linkPill(link);

  // expanded sub-groups; the group holding the current route opens by itself
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Quotes & invoices": true, "Pages & builder": true, WhatsApp: false, Content: false,
  });

  void loc.pathname;

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({ ...s, routes: sectionRoutes(s.id, role) })).filter(
        (s) => s.routes.length > 0,
      ),
    [role],
  );

  // a route inside a collapsed group must still be reachable: force it open
  useEffect(() => {
    const current = sections
      .flatMap((s) => s.routes)
      .find((r) => r.id === routeId);
    if (current?.group) setOpenGroups((g) => (g[current.group!] ? g : { ...g, [current.group!]: true }));
  }, [routeId, sections]);

  const navBody = (
    <nav className="side-scroll" aria-label="Main">
      {sections.map((section) => {
        // group the routes inside this section, preserving registry order
        const groups: { key: string; label?: string; routes: typeof section.routes }[] = [];
        for (const r of section.routes) {
          if (r.group) {
            let g = groups.find((x) => x.key === r.group);
            if (!g) { g = { key: r.group, label: r.group, routes: [] }; groups.push(g); }
            g.routes.push(r);
          } else {
            groups.push({ key: `__${r.id}`, routes: [r] });
          }
        }

        return (
          <div key={section.id}>
            <div className="side-section">{section.label}</div>
            {groups.map((g) =>
              g.label ? (
                <div key={g.key}>
                  <button
                    type="button"
                    className="side-group-btn"
                    aria-expanded={!!openGroups[g.key]}
                    onClick={() => setOpenGroups((s) => ({ ...s, [g.key]: !s[g.key] }))}
                  >
                    <ChevronDown size={13} className="caret" />
                    <span className="side-label">{g.label}</span>
                  </button>
                  {openGroups[g.key] &&
                    g.routes.map((r) => <NavItem key={r.id} r={r} badges={badges} />)}
                </div>
              ) : (
                g.routes.map((r) => <NavItem key={r.id} r={r} badges={badges} />)
              ),
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="shell">
      <aside className="side" data-mini={mini} aria-label="Sidebar">
        <div className="side-head">
          <Link to="/dashboard" className="brand-mark" title="Woodex Admin">W</Link>
          <span className="side-brand-text">
            <b>Woodex</b>
            <small>Admin v2.5 Pro</small>
          </span>
          <Btn
            variant="ghost"
            size="sm"
            iconOnly
            style={{ marginLeft: "auto" }}
            title={mini ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setMini((m) => !m)}
          >
            <ChevronsLeft size={15} style={{ transform: mini ? "rotate(180deg)" : undefined }} />
          </Btn>
        </div>
        {navBody}
        {/* The foot names the person the *server* says is signed in. It used to name a fixed person in every
            state — including no session at all: a name where a name has not been read. */}
        <div className="side-foot">
          {user ? (
            <>
              <Avatar name={user.name} />
              <span className="side-foot-text">
                <b>{user.name}</b>
                <span>{user.roleLabel || ROLE_LABEL[role]}</span>
              </span>
              <Btn variant="ghost" size="sm" iconOnly title="Sign out" onClick={onSignOut}><LogOut size={14} /></Btn>
            </>
          ) : (
            <span className="side-foot-text">
              <b>Nobody signed in</b>
              <span>The strip says what the server answered</span>
            </span>
          )}
        </div>
        {/* Which build this is, for the question a screenshot cannot answer. */}
        <div className="side-build" title="The commit this console was built from">
          v2.5 · {__WX_BUILD__}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Btn variant="ghost" size="sm" iconOnly className="wxa-mobile-only" title="Menu">
            <Menu size={16} />
          </Btn>
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: "var(--s-2)" }}>
                {i > 0 && <span className="sep">/</span>}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
              </span>
            ))}
          </div>

          <button type="button" className="search-btn" onClick={onOpenPalette}>
            <Search size={15} />
            <span className="grow">Search screens…</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="row" style={{ marginLeft: "auto", gap: "var(--s-3)" }}>
            {/* The layout preview, as another role, when nobody is signed in. Once the API is answering the
                server decides what you may see — a switcher here would be a lie with a dropdown. */}
            {link === "live" ? (
              user && <Pill tone="ok" plain>{user.roleLabel}</Pill>
            ) : (
              <select
                className="select"
                style={{ width: 128 }}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                aria-label="Preview as role"
                title="Preview the console as another role — the layouts, not what the account can do"
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            )}

            <Btn
              variant="default"
              size="sm"
              onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
              title="Toggle row density"
            >
              <PanelLeft size={14} />
              {density === "compact" ? "Compact" : "Comfy"}
            </Btn>

            <Btn variant="ghost" size="sm" iconOnly onClick={toggleTheme} title="Toggle light / dark">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Btn>

            <Btn
              variant="ghost"
              size="sm"
              iconOnly
              title={badges.total > 0 ? `${badges.total} things need attention` : "Notifications"}
              style={{ position: "relative" }}
            >
              <Bell size={16} />
              {badges.total > 0 && (
                <span
                  style={{
                    position: "absolute", top: -2, right: -2, minWidth: 15, height: 15, padding: "0 3px",
                    borderRadius: 8, background: "var(--danger)", color: "#fff",
                    fontSize: 10, lineHeight: "15px", textAlign: "center", fontWeight: 700,
                  }}
                >
                  {badges.total > 99 ? "99+" : badges.total}
                </span>
              )}
            </Btn>

            <div className="row" style={{ gap: "var(--s-2)" }}>
              {/* No session, so no name: the avatar is the studio's mark, not a person's initials. */}
              <Avatar name={user?.name ?? "Woodex"} />
              {link === "live" && (
                <Btn variant="ghost" size="sm" iconOnly title="Sign out" onClick={onSignOut}>
                  <LogOut size={16} />
                </Btn>
              )}
              <User size={0} />
            </div>
          </div>
        </header>

        <div
          className="status-strip"
          data-link={link}
          role="status"
          aria-live="polite"
        >
          <Pill tone={pill.tone} plain>{pill.label}</Pill>
          <span>{linkText}</span>
        </div>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  r,
  badges,
}: {
  r: ReturnType<typeof sectionRoutes>[number];
  badges: Badges;
}) {
  const count = r.badge ? badges[r.badge] : 0;
  return (
    <NavLink to={`/${r.id}`} className={clsx("nav-item")}>
      <r.icon size={16} />
      <span className="nav-label">{r.label}</span>
      {r.status === "planned" && <span className="nav-new">SOON</span>}
      {count > 0 && (
        <span className="nav-badge" data-kind={r.badge === "approvals" ? "warn" : undefined}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
  );
}
