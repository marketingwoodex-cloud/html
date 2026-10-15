import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Shell, type Badges } from "./components/Shell";
import { CommandPalette } from "./components/CommandPalette";
import { Dashboard } from "./screens/Dashboard";
import { Leads } from "./screens/Leads";
import { Theme } from "./screens/Theme";
import { Placeholder } from "./screens/Placeholder";
import { ROUTES, resolveRoute, type Role } from "./lib/nav";
import { useAppearance } from "./lib/theme";
import { SessionProvider, useSession } from "./lib/session";
import { SignIn } from "./screens/SignIn";
import { LiveRedirects } from "./screens/LiveRedirects";
import { LiveMedia } from "./screens/LiveMedia";
import { LiveContent } from "./screens/LiveContent";
import { LiveGlobal } from "./screens/LiveGlobal";
import { LivePages } from "./screens/LivePages";
import { LiveLibrary } from "./screens/LiveLibrary";
import { LiveSiteTheme } from "./screens/LiveSiteTheme";
import { LivePlacements } from "./screens/LivePlacements";
import { LiveHeroes } from "./screens/LiveHeroes";
import { LiveForms } from "./screens/LiveForms";
import { LivePipeline } from "./screens/LivePipeline";
import { LiveQuotes } from "./screens/LiveQuotes";
import { LiveEstimator } from "./screens/LiveEstimator";
import { LiveProjects } from "./screens/LiveProjects";
import { LiveTimeline } from "./screens/LiveTimeline";
import { LiveUpdates } from "./screens/LiveUpdates";
import { LiveTemplates } from "./screens/LiveTemplates";
import { LiveBusiness } from "./screens/LiveBusiness";
import { LiveApprovals } from "./screens/LiveApprovals";
import { LiveSeo } from "./screens/LiveSeo";
import { linkLabel, useLive, type BellData } from "./lib/live";
import { Btn, Card, PageHead } from "./components/primitives";

/** Route ids implemented by a real screen in this prototype (Phase 0). */
const BUILT_IDS = new Set([
  "dashboard", "leads", "enquiries", "pipeline", "quotes", "theme", "redirects", "media", "blog", "portfolio", "cities", "global", "pages", "library", "site-theme",
  "testimonials", "team", "heroes",
  "forms", "estimator", "projects", "timeline", "notifications", "templates",
  "business", "approvals", "seo",
]);

/** The public entry point: one provider, then the app proper. */
export default function App() {
  return (
    <SessionProvider>
      <Frame />
    </SessionProvider>
  );
}

/* The sidebar's counts: the server's, or none at all — a function rather than a block inside the component,
 * so the rule can be asserted without a browser.
 *
 * A count beside *Leads* is a claim about the studio's day, and exactly one source may make it: the server
 * (`/notifications/poll`, one poll a minute). Until this slice the prototype's own numbers filled the gap
 * whenever the API was not answering, which is a claim about the studio's day invented from nothing. A zero
 * renders no badge at all, so the honest answer is a sidebar with no numbers on it. */
export function badgeCounts(bell: BellData | null): Badges {
  if (bell) {
    return { leads: bell.leads, chat: bell.chats, approvals: bell.approvals, total: bell.total };
  }
  return { leads: 0, chat: 0, approvals: 0, total: 0 };
}

/**
 * The frame: health, session, badges, routes.
 *
 * Four states, and the sign-in screen is one of them rather than an overlay:
 *   · the API is being looked for → the strip says so, and the door will not open yet
 *   · the API is not answering  → the strip says that, in those words, and nothing is invented for it
 *   · the API is there, nobody is signed in → SignIn
 *   · signed in → the app, with the role and the counts the *server* reported
 *
 * There is no fifth state. The prototype could be opened with sample data beside any of these; that door is
 * gone, and an unreachable host is reported as an unreachable host.
 */
function Frame() {
  const appearance = useAppearance();
  const [role, setRole] = useState<Role>("owner");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();

  const path = loc.pathname.replace(/^\//, "") || "dashboard";
  const route = useMemo(() => resolveRoute(path), [path]);
  const routeId = route?.id ?? path;

  /* The v2.1 router fell through to the dashboard loader when a path did not
     match (AD-4) and threw "Cannot set properties of null" on late replies
     (Phase A1 note). Here an unknown path is an explicit 404 screen. */

  const { link, reason, health, user, signOut } = useSession();
  const live = link === "live" && user !== null;

  /* The bell, from the server when there is a server. One poll a minute — the same cadence and endpoint
     the SPA will use, and the first screen that proves `GET /notifications/poll` end to end. */
  const bell = useLive<BellData>(live ? "/notifications/poll" : null, role);

  const badges: Badges = useMemo(() => badgeCounts(bell.data), [bell.data]);

  const strip = linkLabel(health, link, reason);

  /* The role the *server* says, when there is one; otherwise the switcher is a layout preview. */
  const effectiveRole = live && user ? (user.role as Role) : role;

  // ⌘K / Ctrl-K opens the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const crumbs = useMemo(() => {
    if (!route) return [{ label: "Not found" }];
    return [{ label: route.section }, { label: route.label }];
  }, [route]);

  /* `/`, `/index` and the empty path land on the dashboard, like the v2.1 default route.
     The empty string is not a curiosity: the router strips its `basename` before this runs, so the
     console's own address — `/admin-next` with or without the trailing slash — arrives here as `""`.
     Without that case the deployed console opened on its own URL and said "no route matches" — a
     correct answer to the wrong question, and the first thing anyone sees after a deploy. */
  if (loc.pathname === "/" || loc.pathname === "" || loc.pathname === "/index") {
    return <Navigate to="/dashboard" replace />;
  }

  /* Signed out, with the API answering: the door. Everything else in the app would be a screen of
     empty tables whose emptiness has no explanation. */
  if (link === "signedOut") {
    return (
      <Shell
        role={role}
        setRole={setRole}
        theme={appearance.theme}
        toggleTheme={appearance.toggleTheme}
        density={appearance.density}
        setDensity={appearance.setDensity}
        badges={{ leads: 0, chat: 0, approvals: 0, total: 0 }}
        onOpenPalette={() => setPaletteOpen(true)}
        routeId={routeId}
        crumbs={crumbs}
        link={link}
        linkText={strip}
        user={null}
        onSignOut={() => void signOut()}
      >
        <SignIn />
      </Shell>
    );
  }

  return (
    <>
      <Shell
        role={role}
        setRole={setRole}
        theme={appearance.theme}
        toggleTheme={appearance.toggleTheme}
        density={appearance.density}
        setDensity={appearance.setDensity}
        badges={badges}
        onOpenPalette={() => setPaletteOpen(true)}
        routeId={routeId}
        crumbs={crumbs}
        link={link}
        linkText={strip}
        user={user ? { name: user.name, roleLabel: user.roleLabel } : null}
        onSignOut={() => void signOut()}
      >
        <Routes>
          {/* Phase 0 — the screens that came first */}
          <Route path="/dashboard" element={<Dashboard role={effectiveRole} />} />
          {/* The Master's queue. A Phase 2 screen that was still a placeholder: the gate, the replay and the
              audit were built and tested, but the only way to *decide* anything was calling the API by hand
              — and the shell linked to it from a badge that had no reading behind it. */}
          <Route path="/approvals" element={<LiveApprovals />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/enquiries" element={<Leads />} />
          {/* The stage board (P25.2 §5.2): the columns are the server's stages, the counts are the server's
              counts, and a move is a PATCH — drag is only how it feels. */}
          <Route path="/pipeline" element={<LivePipeline />} />
          {/* The quotation builder (P25.2 §5.3): the money is the server's, issued documents are revised
              as new versions, and the move to an invoice is one conversion that cannot happen twice. */}
          <Route path="/quotes" element={<LiveQuotes />} />
          {/* Phase 3 — delivery. Every screen here reads the site's own files, so offline they say so in
              words rather than showing an empty table that looks like data. */}
          <Route path="/redirects" element={<LiveRedirects />} />
          <Route path="/media" element={<LiveMedia />} />
          {/* The content CMS. Three routes, one screen: an article, a case study and a city page are the
              same kind of thing — the difference is the address they take and the page furniture they
              publish into. A city page is root-level, because that is where v2.1 put them. */}
          <Route path="/blog" element={<LiveContent presetType="post" />} />
          <Route path="/portfolio" element={<LiveContent presetType="study" />} />
          <Route path="/cities" element={<LiveContent presetType="city" />} />
          {/* The hero at the top of every page, and the home page's slider. Three tabs over one idea:
              the first thing a visitor sees, written as rules rather than by hand in 150 files. */}
          <Route path="/heroes" element={<LiveHeroes />} />
          {/* The forms: which pages carry one, where the enquiry goes, and what the visitor is told back. */}
          <Route path="/forms" element={<LiveForms />} />
          {/* The rate book behind /estimator/ and the quotation builder — a file, written as JavaScript. */}
          <Route path="/estimator" element={<LiveEstimator />} />
          {/* Live work: stages and milestones, and the money each one bills. A project is opened by an
              approved quotation, so there is no "new" here — only what is already running. */}
          <Route path="/projects" element={<LiveProjects />} />
          {/* The same projects on a date axis: start to handover, filled by what has been invoiced. */}
          <Route path="/timeline" element={<LiveTimeline />} />
          {/* Client updates: the seven events and their wording, the channels, the log — and the sentence the
              screen refuses to hide, that the sending itself is still v2.1's until Phase 4. */}
          <Route path="/notifications" element={<LiveUpdates />} />
          {/* The header and the footer: one edit, every page, one undo. */}
          {/* Quotation templates — the shapes every quotation is built from. The plan calls this route
              `/quotations/templates`; the registry declares that as an alias and the redirect below opens it. */}
          <Route path="/templates" element={<LiveTemplates />} />
          <Route path="/business" element={<LiveBusiness />} />
          <Route path="/global" element={<LiveGlobal />} />
          {/* Every page and every change — where the header change across 150 pages is undone. */}
          <Route path="/pages" element={<LivePages />} />
          {/* What each page tells Google, and the two files Google reads. The audit runs on the server:
              v2.1 ran it in the browser and stored the numbers the browser worked out. */}
          <Route path="/seo" element={<LiveSeo />} />
          {/* The reusable pieces a page is assembled from, and the global sections pushed from one edit. */}
          <Route path="/library" element={<LiveLibrary />} />
          {/* The site's own colours and type — the file every page is drawn from, not the admin's palette. */}
          <Route path="/site-theme" element={<LiveSiteTheme />} />
          {/* Two nav entries, one screen: what changes between them is which kind it opens on. Testimonials
              and the team are placed *inside* pages rather than living at addresses of their own. */}
          <Route path="/testimonials" element={<LivePlacements initialKind="testimonial" />} />
          <Route path="/team" element={<LivePlacements initialKind="member" />} />
          <Route
            path="/theme"
            element={
              <Theme
                theme={appearance.theme}
                setTheme={appearance.setTheme}
                accent={appearance.accent}
                setAccent={appearance.setAccent}
                density={appearance.density}
                setDensity={appearance.setDensity}
              />
            }
          />
          {/* Aliases are declared once, in the registry, and open the screen they name here. Without this a
              path somebody was given — `#/quotations/templates`, `#/settings/connections` — landed on the
              not-found page while the screen existed, which is the AD-4 defect in a new coat. */}
          {ROUTES.flatMap((r) =>
            (r.aliases ?? []).map((alias) => (
              <Route key={alias} path={`/${alias}`} element={<Navigate to={`/${r.id}`} replace />} />
            )),
          )}
          {/* every other registered route renders its build plan */}
          {ROUTES.filter((r) => !BUILT_IDS.has(r.id)).map((r) => (
            <Route key={r.id} path={`/${r.id}`} element={<Placeholder route={r} />} />
          ))}
          <Route
            path="*"
            element={
              <NotFound
                onHome={() => navigate("/dashboard")}
                onIntegrations={() => navigate("/integrations")}
                path={loc.pathname}
              />
            }
          />
        </Routes>
      </Shell>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} role={role} />
    </>
  );
}

function NotFound({
  path,
  onHome,
  onIntegrations,
}: {
  path: string;
  onHome: () => void;
  onIntegrations: () => void;
}) {
  return (
    <>
      <PageHead title="Screen not found" sub={`No registered route matches “${path}”.`} />
      <Card title="This is deliberate" sub="v2.1 defect AD-4 — the old router fell through to the dashboard">
        <p style={{ fontSize: "var(--fs-13)" }}>
          In v2.1, an unknown path executed the dashboard loader silently, and aliases such as{" "}
          <span className="mono">#/integrations</span> were unreachable even though the screen
          existed. The registry now resolves aliases and reports anything else honestly.
        </p>
        <div className="row" style={{ marginTop: "var(--s-4)" }}>
          <Btn className="primary" onClick={onHome}>Go to the dashboard</Btn>
          {/* Through the router, not `window.location`: v2.1's alias was a hash on the *website's*
              homepage, so this button used to leave the console for the public site. On the console's own
              mount point that is a 404 the browser renders as a blank page. */}
          <Btn onClick={onIntegrations}>Open Integrations</Btn>
        </div>
      </Card>
    </>
  );
}

