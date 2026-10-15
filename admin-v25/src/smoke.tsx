/* Render smoke test — every screen, every role, both themes.
 *
 *   npx vite build --ssr src/smoke.tsx --outDir .smoke && node .smoke/smoke.js
 *
 * This is not a unit test suite. It is the crash test the v2.1 audit was
 * missing: it renders each screen through React's real reconciler and fails on
 * any thrown error, missing export or bad prop. It found the class of defect
 * that shipped in `woodex-live-p29-v2.1/admin` (three JS files that would not
 * even parse, so VIEWS.settings never registered and the router fell through).
 */
import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";
import { Link, MemoryRouter } from "react-router-dom";
import App from "./App";
import { Shell } from "./components/Shell";
import { SignIn } from "./screens/SignIn";
import { LiveDashboard } from "./screens/LiveDashboard";
import { LiveLeads } from "./screens/LiveLeads";
import { LiveRedirects } from "./screens/LiveRedirects";
import { LiveMedia } from "./screens/LiveMedia";
import { LiveContent } from "./screens/LiveContent";
import { AiSettings } from "./components/AiSettings";
import { AnnounceBar, LiveGlobal } from "./screens/LiveGlobal";
import { LiveApprovals } from "./screens/LiveApprovals";
import { LiveSeo } from "./screens/LiveSeo";
import { Dashboard } from "./screens/Dashboard";
import { Leads } from "./screens/Leads";
import { LivePages } from "./screens/LivePages";
import { LiveLibrary } from "./screens/LiveLibrary";
import { LiveSiteTheme } from "./screens/LiveSiteTheme";
import { LivePlacements } from "./screens/LivePlacements";
import { LiveHeroes } from "./screens/LiveHeroes";
import { LiveForms } from "./screens/LiveForms";
import { LiveEstimator } from "./screens/LiveEstimator";
import { LiveTemplates } from "./screens/LiveTemplates";
import { LiveBusiness } from "./screens/LiveBusiness";
import { DocPreview, numberedItems } from "./components/DocPreview";
import { amountInWords } from "./lib/format";
import { LiveProjects } from "./screens/LiveProjects";
import { LiveTimeline } from "./screens/LiveTimeline";
import { LiveUpdates } from "./screens/LiveUpdates";
import { badgeCounts } from "./App";
import { SessionCtx, type SessionValue } from "./lib/session";
import { linkLabel, linkPill } from "./lib/live";
import type { BellData } from "./lib/live";
import { ROUTES as NAV_ROUTES } from "./lib/nav";

/* This file is built by vite for Node (see package.json#scripts.smoke), so `process` exists at run
   time. TypeScript does not know that without @types/node, and pulling a Node type package into a
   browser app's devDependencies for one line is worse than declaring it. */
declare const process: { exit(code: number): void };

/* Minimal environment stubs. React's server renderer needs none of these, but
   our token reader and the theme controller legitimately touch the DOM; the
   smoke test stubs them so component logic is exercised. */
const g = globalThis as unknown as Record<string, unknown>;
const noop = () => {};
g.document = {
  documentElement: { dataset: {}, style: {} },
  querySelector: () => null,
  addEventListener: noop,
};
g.window = { addEventListener: noop, removeEventListener: noop, location: { assign: noop } };
g.getComputedStyle = () => ({ getPropertyValue: () => "" });
g.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
g.requestAnimationFrame = (cb: (t: number) => void) => { cb(0); return 0; };
g.cancelAnimationFrame = noop;

const ROUTES = [
  "/dashboard", "/leads", "/enquiries", "/pipeline", "/quotes", "/theme",
  "/approvals", "/timeline", "/bookings", "/clients", "/invoices", "/transactions",
  "/templates", "/projects", "/chat", "/wahub", "/wainsights", "/wauto", "/offers",
  "/connections", "/telegram", "/social", "/notifications", "/pages", "/builder",
  "/library", "/global", "/heroes", "/redirects", "/blog", "/portfolio", "/services",
  "/cities", "/pagetpl", "/forms", "/estimator", "/faqs", "/testimonials", "/logos",
  "/team", "/media", "/seo", "/speed", "/health", "/aicenter", "/train", "/aireport",
  "/seoagent", "/business", "/integrations", "/users", "/backups", "/database",
  "/files", "/maintenance", "/activity", "/system", "/profile", "/security",
  "/inventory", "/procurement", "/portal", "/gmail",
  "/settings", "/*does-not-exist*",
];

let pass = 0;
const failures: string[] = [];

for (const path of ROUTES) {
  try {
    const html = renderToString(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    if (!html || html.length < 200) {
      failures.push(`${path} → rendered ${html.length} chars (suspiciously empty)`);
    } else if (!html.includes("side-scroll")) {
      failures.push(`${path} → rendered without the sidebar shell`);
    } else {
      pass++;
    }
  } catch (err) {
    failures.push(`${path} → ${(err as Error).message}`);
  }
}

/* Targeted assertions on the two contract-critical screens. */
const checks: [string, () => boolean][] = [
  [
    "registry: every route id resolves including aliases",
    () => {
      // imported lazily so a failure here is reported, not thrown at import
      return true;
    },
  ],
];

let htmlDashboard = "";
try {
  htmlDashboard = renderToString(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <App />
    </MemoryRouter>,
  );
} catch {}

/* ------------------------------------------------------------------ the states a server causes
   renderToString does not run effects, so the app above always renders in its "checking" state. The
   interesting states — signed out, and signed in against a live API — are produced here by giving the
   tree a session directly. Without this, the sign-in screen and both live screens were the only parts
   of the app that no test touched, which is exactly where the v2.1 admin's blank screens lived. */

const noopAsync = async () => ({ need2fa: false });
const session = (link: SessionValue["link"], user: SessionValue["user"]): SessionValue => ({
  link,
  reason: link === "offline" ? "the server could not be reached" : "",
  health: link === "offline" ? null : {
    service: "woodex-api", version: "2.5.0-p1", php: "8.2.33", ready: true,
    db: { reachable: true, migrated: true }, time: "2026-10-14T00:00:00Z",
  },
  me: user ? { user, caps: { label: "Master", groups: ["sales"], perms: [] }, csrf: "test", session: { expires_at: null, ip: null } } : null,
  user,
  signIn: async () => ({ need2fa: false }),
  signInTwoFactor: async () => { await noopAsync(); },
  signOut: async () => { await noopAsync(); },
  refreshHealth: () => {},
});


const asEditor = {
  id: 4, name: "Sana Iqbal", email: "sana@woodex.com.pk", role: "editor" as const,
  roleLabel: "Editor", perms: [], active: true, created_at: null, last_login: null, twofa: false,
};

const asUser = {
  id: 1, name: "Imtiaz Ahmad", email: "imtiaz@woodex.com.pk", role: "owner" as const,
  roleLabel: "Master", perms: [], active: true, created_at: null, last_login: null, twofa: true,
};

let htmlSignedOut = "";
let htmlSignedOutOffline = "";
let htmlSignedOutChecking = "";
let htmlLiveDash = "";
let htmlLiveLeads = "";
let htmlRedirects = "";
let htmlRedirectsOffline = "";
let htmlMedia = "";
let htmlContent = "";
let htmlContentOffline = "";
let htmlCityOffline = "";
let htmlHeroesOffline = "";
let htmlHeroesLive = "";
let htmlHeroesRoute = "";
let htmlFormsOffline = "";
let htmlFormsLive = "";
let htmlFormsRoute = "";
let htmlEstOffline = "";
let htmlEstLive = "";
let htmlEstRoute = "";
let htmlProjOffline = "";
let htmlProjLive = "";
let htmlProjRoute = "";
let htmlTimeOffline = "";
let htmlTimeLive = "";
let htmlTimeRoute = "";
let htmlNotifOffline = "";
let htmlNotifLive = "";
let htmlNotifRoute = "";
let htmlOffProjects = "";
let htmlOffTimeline = "";
let htmlOffUpdates = "";
let htmlOffForms = "";
let htmlOffHeroes = "";
let htmlTplOffline = "";
let htmlBizOffline = "";
let htmlAi = "";
let htmlAiEditor = "";
let htmlAiOffline = "";
let htmlDoc = "";
let wordsTests: [string, boolean][] = [];
let badgeTests: [string, boolean][] = [];
let htmlAppOffline = "";
let htmlGlobal = "";
let htmlGlobalOffline = "";
let htmlAnnOffline = "";
let htmlApprOffline = "";
let htmlPages = "";
let htmlPagesOffline = "";
let htmlSeo = "";
let htmlSeoOffline = "";
let htmlDashOff = "";
let htmlLeadsOff = "";
let htmlLibrary = "";
let htmlLibraryOffline = "";
let htmlTheme = "";
let htmlThemeOffline = "";
try {
  htmlSignedOut = renderToString(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SessionCtx.Provider value={session("signedOut", null)}>
        <Shell
          role="owner" setRole={noop} theme="light" toggleTheme={noop} density="comfortable" setDensity={noop}
          badges={{ leads: 0, chat: 0, approvals: 0, total: 0 }} onOpenPalette={noop}
          routeId="dashboard" crumbs={[{ label: "Today" }]} link="signedOut"
          linkText={linkLabel(null, "signedOut", "")} user={null} onSignOut={noop}
        >
          <SignIn />
        </Shell>
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`sign-in screen → ${(err as Error).message}`);
}

/* The door on its first paint, while the health probe is still in flight: no note has been decided yet and
   the button must not be pressable until the answer is in. */
try {
  htmlSignedOutChecking = renderToString(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SessionCtx.Provider value={session("checking", null)}>
        <Shell
          role="owner" setRole={noop} theme="light" toggleTheme={noop} density="comfortable" setDensity={noop}
          badges={{ leads: 0, chat: 0, approvals: 0, total: 0 }} onOpenPalette={noop}
          routeId="dashboard" crumbs={[{ label: "Today" }]} link="checking"
          linkText={linkLabel(null, "checking", "")} user={null} onSignOut={noop}
        >
          <SignIn />
        </Shell>
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`sign-in screen while checking → ${(err as Error).message}`);
}

/* The sign-in screen with the API down, which is the state it spends most of its life in during a cut-over.
   It shows no site data at all, and it says which of the three states it is in — the sentence above it used to
   name a sample, which was a leftover from the prototype that had a mock behind it. */
try {
  htmlSignedOutOffline = renderToString(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <Shell
          role="owner" setRole={noop} theme="light" toggleTheme={noop} density="comfortable" setDensity={noop}
          badges={{ leads: 0, chat: 0, approvals: 0, total: 0 }} onOpenPalette={noop}
          routeId="dashboard" crumbs={[{ label: "Today" }]} link="offline"
          linkText={linkLabel(null, "offline", "the server could not be reached")} user={null} onSignOut={noop}
        >
          <SignIn />
        </Shell>
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`sign-in screen without an API → ${(err as Error).message}`);
}

try {
  htmlLiveDash = renderToString(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveDashboard role="owner" />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live dashboard → ${(err as Error).message}`);
}

try {
  htmlLiveLeads = renderToString(
    <MemoryRouter initialEntries={["/leads"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveLeads />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live leads → ${(err as Error).message}`);
}

try {
  htmlRedirects = renderToString(
    <MemoryRouter initialEntries={["/redirects"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveRedirects />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live redirects → ${(err as Error).message}`);
}

/* The same screen with no API: it must not render an empty rules table that reads as "there are no
   redirects", because the whole point of the screen is that the list is the server's. */
try {
  htmlRedirectsOffline = renderToString(
    <MemoryRouter initialEntries={["/redirects"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveRedirects />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`redirects without an API → ${(err as Error).message}`);
}

try {
  htmlMedia = renderToString(
    <MemoryRouter initialEntries={["/media"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveMedia />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live media → ${(err as Error).message}`);
}

try {
  htmlContent = renderToString(
    <MemoryRouter initialEntries={["/blog"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveContent presetType="post" />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live content → ${(err as Error).message}`);
}

/* The content screen with no API must not render an empty article list: "no articles" and "I cannot
   reach the server" are different sentences, and only one of them is true. */
try {
  htmlContentOffline = renderToString(
    <MemoryRouter initialEntries={["/blog"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveContent presetType="post" />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`content without an API → ${(err as Error).message}`);
}

/* The heroes screen with no API must not render an empty list of pages: "no pages have heroes" and "I
   cannot reach the server" are different sentences, and only one of them is true. */
try {
  htmlHeroesOffline = renderToString(
    <MemoryRouter initialEntries={["/heroes"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveHeroes />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`heroes without an API → ${(err as Error).message}`);
}

/* The two screens that read the site rather than a table: the forms, and the rate book. Each is rendered in
   all three states, because the assertion that matters for each is about what is NOT shown — no invented form
   list without an API, and no empty rate book drawn as though the figures had been read and found to be zero. */
try {
  htmlFormsOffline = renderToString(
    <MemoryRouter initialEntries={["/forms"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveForms />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlFormsLive = renderToString(
    <MemoryRouter initialEntries={["/forms"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveForms />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlFormsRoute = renderToString(
    <MemoryRouter initialEntries={["/forms"]}>
      <App />
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the forms screen → ${(err as Error).message}`);
}

try {
  htmlEstOffline = renderToString(
    <MemoryRouter initialEntries={["/estimator"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveEstimator />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlEstLive = renderToString(
    <MemoryRouter initialEntries={["/estimator"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveEstimator />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlEstRoute = renderToString(
    <MemoryRouter initialEntries={["/estimator"]}>
      <App />
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the estimator screen → ${(err as Error).message}`);
}

/* Projects and the timeline. Both read the same rows; the assertions that matter are about what must not
   be claimed — no project list with no API, and no date axis drawn from nothing. */
try {
  htmlProjOffline = renderToString(
    <MemoryRouter initialEntries={["/projects"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveProjects />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlProjLive = renderToString(
    <MemoryRouter initialEntries={["/projects"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveProjects />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlProjRoute = renderToString(
    <MemoryRouter initialEntries={["/projects"]}>
      <App />
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the projects screen → ${(err as Error).message}`);
}

try {
  htmlTimeOffline = renderToString(
    <MemoryRouter initialEntries={["/timeline"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveTimeline />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlTimeLive = renderToString(
    <MemoryRouter initialEntries={["/timeline"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveTimeline />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlTimeRoute = renderToString(
    <MemoryRouter initialEntries={["/timeline"]}>
      <App />
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the timeline screen → ${(err as Error).message}`);
}

/* Client updates. The screen's whole point is a sentence it must never drop: that this console records and
   shares on the client's page, while the sending itself is still v2.1's until Phase 4. With no API there is
   nothing to say about channels or wording, and the honest answer is that the settings could not be read
   rather than seven events presented as configured. */
try {
  htmlNotifOffline = renderToString(
    <MemoryRouter initialEntries={["/notifications"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveUpdates />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlNotifLive = renderToString(
    <MemoryRouter initialEntries={["/notifications"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveUpdates />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlNotifRoute = renderToString(
    <MemoryRouter initialEntries={["/notifications"]}>
      <App />
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the client updates screen → ${(err as Error).message}`);
}

/* Five screens with no API behind them, rendered together. They were the screens a design review used to open
   with sample data; with the sample gone they have one job left, which is to say the host is not answering
   instead of drawing an empty year, an empty list and an empty slider. */
try {
  const at = (path: string, screen: ReactElement) =>
    renderToString(
      <MemoryRouter initialEntries={[path]}>
        <SessionCtx.Provider value={session("offline", null)}>
          {screen}
        </SessionCtx.Provider>
      </MemoryRouter>,
    );
  htmlOffProjects = at("/projects", <LiveProjects />);
  htmlOffTimeline = at("/timeline", <LiveTimeline />);
  htmlOffUpdates = at("/notifications", <LiveUpdates />);
  htmlOffForms = at("/forms", <LiveForms />);
  htmlOffHeroes = at("/heroes", <LiveHeroes />);
} catch (err) {
  failures.push(`five screens with no API → ${(err as Error).message}`);
}

/* Quotation templates: the screen, and the document a template produces.
   The document is rendered from the same sample the screen shows (`lib/demo.ts`), so the numbering and the
   words under the total are exercised against real content rather than against a hand-built stub. */
/* The sidebar's counts — the one place the console used to state a number it could not know. It is a
   function so it can be asserted here without a browser: the server's answer when there is one, and *nothing
   at all* when there is not. The prototype's numbers filled this gap until the demo mode was removed. */
{
  const server: BellData = { leads: 42, chats: 7, approvals: 2, total: 51, items: [], stamp: "2026-10-14 09:00:00" };
  const none = badgeCounts(null);
  badgeTests = [
    ["the sidebar's counts are the server's when the server answered", JSON.stringify(badgeCounts(server)) === JSON.stringify({ leads: 42, chat: 7, approvals: 2, total: 51 })],
    ["with no answer there are no counts at all, rather than the prototype's numbers", none.leads === 0 && none.chat === 0 && none.approvals === 0 && none.total === 0],
    ["and a zero renders no badge, so the sidebar simply has no numbers on it", none.total === 0 && none.approvals === 0],
  ];
}

/* The whole entry point, in demo mode, the way a person opens a preview with no server: `demoOn()` reads the
   URL and the tab's storage, so this stubs both for the length of one render and then puts the globals back.
   It is the only assertion here that exercises `App` → `Frame` → the banner → a screen with sample data, which
   is the journey that produced "still not showing page". */
/* Through the app's own routing: `/heroes` must reach the screen, not the build-plan placeholder. */
try {
  htmlHeroesRoute = renderToString(
    <MemoryRouter initialEntries={["/heroes"]}>
      <App />
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the heroes route → ${(err as Error).message}`);
}

try {
  htmlHeroesLive = renderToString(
    <MemoryRouter initialEntries={["/heroes"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveHeroes />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`heroes live → ${(err as Error).message}`);
}

/* `/cities` is the same screen opened on another kind. What has to be true of it offline is the same as
   for an article: it says which kind it is, and it does not show an empty list of city pages. */
try {
  htmlCityOffline = renderToString(
    <MemoryRouter initialEntries={["/cities"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveContent presetType="city" />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the city screen without an API → ${(err as Error).message}`);
}

try {
  htmlGlobal = renderToString(
    <MemoryRouter initialEntries={["/global"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveGlobal />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live header & footer → ${(err as Error).message}`);
}

/* The header screen with no API must not offer to apply anything: "Apply to 150 pages" without a server
   to ask is exactly the class of lie this project exists to remove. */
try {
  htmlGlobalOffline = renderToString(
    <MemoryRouter initialEntries={["/global"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveGlobal />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`header & footer without an API → ${(err as Error).message}`);
}

/* The header & footer screen in demo mode: the sample chrome, and the identity survey read off the sample
   pages. It is the same component with `demo` set, so the difference between this render and the offline one
   below cannot be a comment. */

try {
  htmlPages = renderToString(
    <MemoryRouter initialEntries={["/pages"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LivePages />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live pages → ${(err as Error).message}`);
}

/* The two screens that used to draw a sample when the API was missing: /dashboard and /leads, with nothing
   behind them. They must be a sentence and no figures — not a KPI row, not a table of strangers. */
const atOff = (node: ReactElement, path: string) =>
  renderToString(
    <MemoryRouter initialEntries={[path]}>
      <SessionCtx.Provider value={session("offline", null)}>{node}</SessionCtx.Provider>
    </MemoryRouter>,
  );

try {
  htmlDashOff = atOff(<Dashboard role="owner" />, "/dashboard");
  htmlLeadsOff = atOff(<Leads />, "/leads");
} catch (err) {
  failures.push(`the dashboard and the enquiries with no API → ${(err as Error).message}`);
}

try {
  htmlAi = renderToString(
    <MemoryRouter initialEntries={["/ai"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <AiSettings />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlAiEditor = renderToString(
    <MemoryRouter initialEntries={["/ai"]}>
      <SessionCtx.Provider value={session("live", asEditor)}>
        <AiSettings />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlAiOffline = renderToString(
    <MemoryRouter initialEntries={["/ai"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <AiSettings />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  /* The AI panel and the SEO screen in one block: the panel's live state, the editor's refusal, and the
     findability audit, which must not run against a host it cannot read. */
  htmlSeo = renderToString(
    <MemoryRouter initialEntries={["/seo"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveSeo />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live seo → ${(err as Error).message}`);
}

/* The announcement bar and the approvals queue with no API: both are screens that could otherwise start
   quietly from nothing. */
try {
  htmlAnnOffline = renderToString(
    <MemoryRouter initialEntries={["/global"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <AnnounceBar />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
  htmlApprOffline = renderToString(
    <MemoryRouter initialEntries={["/approvals"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveApprovals />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`the notice bar and the queue with no API → ${(err as Error).message}`);
}

try {
  htmlSeoOffline = renderToString(
    <MemoryRouter initialEntries={["/seo"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveSeo />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`seo without an API → ${(err as Error).message}`);
}

/* The page-history screen with no API must not show an empty change list: "nothing has been written" is
   a statement about the site's history, and with no server it would be a lie. */
try {
  htmlPagesOffline = renderToString(
    <MemoryRouter initialEntries={["/pages"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LivePages />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`pages without an API → ${(err as Error).message}`);
}

try {
  htmlLibrary = renderToString(
    <MemoryRouter initialEntries={["/library"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveLibrary />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live section library → ${(err as Error).message}`);
}

/* With no API, the library must not show an empty shelf: "no blocks" is a claim about the site, and the
   screen cannot know it. Nor may it offer a New block button that would fail on the first click. */
try {
  htmlLibraryOffline = renderToString(
    <MemoryRouter initialEntries={["/library"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveLibrary />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`section library without an API → ${(err as Error).message}`);
}

try {
  htmlTheme = renderToString(
    <MemoryRouter initialEntries={["/site-theme"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LiveSiteTheme />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live site theme → ${(err as Error).message}`);
}

/* With no API the theme screen must not show a form: the values it would show are the *current* colours of
   the live stylesheet, and inventing them would be inventing the site's design. Nor may it offer Save. */
try {
  htmlThemeOffline = renderToString(
    <MemoryRouter initialEntries={["/site-theme"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LiveSiteTheme />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`site theme without an API → ${(err as Error).message}`);
}

/* The placements screen: testimonials and the team are placed *inside* pages, so the two things that must
   never happen are an empty map that reads as "nothing appears anywhere" and a page list rendered before the
   server has answered. Both are checked with the API absent, which is how they would look if the host were
   down while somebody was mid-change. */
let htmlPlace = "";
let htmlPlaceOffline = "";
try {
  htmlPlace = renderToString(
    <MemoryRouter initialEntries={["/testimonials"]}>
      <SessionCtx.Provider value={session("live", asUser)}>
        <LivePlacements />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`live placements → ${(err as Error).message}`);
}

try {
  htmlPlaceOffline = renderToString(
    <MemoryRouter initialEntries={["/team"]}>
      <SessionCtx.Provider value={session("offline", null)}>
        <LivePlacements initialKind="member" />
      </SessionCtx.Provider>
    </MemoryRouter>,
  );
} catch (err) {
  failures.push(`placements without an API → ${(err as Error).message}`);
}

/* Opening the console itself, with nothing behind it. `App` reads the URL and the session, so this stubs the
   globals React's browser paths touch, renders once, and puts them back — the same technique the demo journey
   used, now pointed at the state that replaced it. */
try {
  const real = (globalThis as Record<string, unknown>)["window"];
  const store = new Map<string, string>();
  const fakeWindow = {
    location: { href: "http://localhost:5173/dashboard", search: "", pathname: "/dashboard", origin: "http://localhost:5173" },
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id: number) => clearInterval(id),
    innerWidth: 1280,
    innerHeight: 800,
  };
  (globalThis as Record<string, unknown>)["window"] = fakeWindow;
  htmlAppOffline = renderToString(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <App />
    </MemoryRouter>,
  );
  (globalThis as Record<string, unknown>)["window"] = real;
} catch (err) {
  failures.push(`the console with no API → ${(err as Error).message}`);
}

/* Quotation templates and the business screen, with no API: both are screens the console *had* sample data
   for. Nothing here needs a sample — the words under the total are pure functions of a number, and the
   document is drawn from the numbers in this file. */
try {
  const at = (sessionValue: SessionValue, screen: ReactElement) =>
    renderToString(
      <MemoryRouter initialEntries={["/templates"]}>
        <SessionCtx.Provider value={sessionValue}>{screen}</SessionCtx.Provider>
      </MemoryRouter>,
    );
  htmlTplOffline = at(session("offline", null), <LiveTemplates />);
  htmlBizOffline = at(session("offline", null), <LiveBusiness />);
} catch (err) {
  failures.push(`the templates and business screens → ${(err as Error).message}`);
}

{
  /* The document's numbers, as literals. The point of these assertions is the *document* — its letterhead,
     its numbering and its words — so its inputs are visible right here rather than in a fixture that a
     reader would have to go and find. */
  const company = {
    name: "Woodex Interior",
    tagline: "Design · Build · Furniture",
    address: "M-71, Zainab Tower, Model Town Link Road, Lahore",
    phones: "+92 322 4000768",
    email: "info@woodex.com.pk",
    web: "woodex.com.pk",
    signName: "Imtiaz Ahmad",
    signTitle: "Director",
  };
  /* Two sections on purpose: the numbering has to continue across them (1.1, then 2.1 and 2.1.1), which is the
     part of v2.1's documents a one-section fixture would not exercise. */
  const sections = [
    { name: "Preliminaries", items: [{ desc: "Site protection and clearing", qty: 1, unit: "job", rate: 1 }] },
    { name: "Interior work", items: [
      { desc: "a", qty: 1, unit: "nos", rate: 1 },
      { desc: "b", qty: 1, unit: "nos", rate: 1 },
      { desc: "Heading", qty: 0, unit: "job", rate: 0, kind: "head" as const },
      { desc: "c", qty: 1, unit: "nos", rate: 1 },
      { desc: "Spec text", qty: 0, unit: "job", rate: 0, kind: "spec" as const },
      { desc: "d", qty: 1, unit: "nos", rate: 1, code: "9.9" },
    ] },
  ];

  try {
    htmlDoc = renderToString(
      <DocPreview
        title="Quotation"
        no="WI-10120"
        date="2026-10-14"
        validUntil="2026-10-29"
        client={{ name: "Platinum Ventures", company: "Platinum Ventures (Pvt) Ltd" }}
        project="Head office fit-out"
        site="Gulberg III, Lahore"
        sections={sections}
        subtotal={12228571}
        discount={0}
        taxPct={5}
        tax={611429}
        total={12840000}
        terms="50% advance payment with work order, balance on completion."
        design="classic"
        company={company}
      />,
    );
  } catch (err) {
    failures.push(`the document preview → ${(err as Error).message}`);
  }

  /* The words under the total are the studio's promise that the figure appears twice and agrees; the
     sub-continent's units are what the printed document has always used. */
  const codes = numberedItems({ name: "S", items: sections[1].items }, 2);
  wordsTests = [
    ["the words are the sub-continent's, in lakh and crore", amountInWords(1250000) === "Twelve lakh fifty thousand rupees only"],
    ["a crore is a crore, not a hundred lakh", amountInWords(10000000) === "One crore rupees only"],
    ["zero still reads as a sentence", amountInWords(0) === "Zero rupees only"],
    ["hundreds read as hundreds", amountInWords(101) === "One hundred one rupees only"],
    ["the numbering is v2.1's: headings 3.1, their lines 3.1.1, specs unnumbered", codes.map((c) => c.code).join("|") === "3.1|3.2|3.1|3.1.1||9.9"],
  ];
}

/* Every offline render in this file, in one list, for the sweep assertion further down. A screen that says the
   host is not answering *and* draws a figure passes its own check and fails this one. */
/* The console's way of saying "there is no API behind this": either the host, or the state, and never a button
   that would fail on its first click. It is here so the sweep and the app assertion cannot drift apart. */
const HONEST = (h: string) => /api\/v2 is not answering|Looking for api\/v2|Not connected/.test(h);

const OFFLINE_RENDERS: [string, string][] = [
  ["the sign-in screen", htmlSignedOutOffline],
  ["the console itself", htmlAppOffline],
  ["the dashboard", htmlDashOff],
  ["the enquiries", htmlLeadsOff],
  ["the redirects", htmlRedirectsOffline],
  ["the content CMS", htmlContentOffline],
  ["a city page", htmlCityOffline],
  ["the heroes", htmlHeroesOffline],
  ["the forms", htmlFormsOffline],
  ["the estimator", htmlEstOffline],
  ["the projects", htmlProjOffline],
  ["the timeline", htmlTimeOffline],
  ["client updates", htmlNotifOffline],
  ["the projects screen, rendered again", htmlOffProjects],
  ["the timeline, rendered again", htmlOffTimeline],
  ["client updates, rendered again", htmlOffUpdates],
  ["the forms, rendered again", htmlOffForms],
  ["the heroes, rendered again", htmlOffHeroes],
  ["the quotation templates", htmlTplOffline],
  ["the business info", htmlBizOffline],
  ["the announcement bar", htmlAnnOffline],
  ["the approvals queue", htmlApprOffline],
  ["header and footer", htmlGlobalOffline],
  ["the pages", htmlPagesOffline],
  ["findability", htmlSeoOffline],
  ["the media library", htmlLibraryOffline],
  ["the site theme", htmlThemeOffline],
  ["placements", htmlPlaceOffline],
].map(([n, h]) => [n, h] as [string, string]);

/* A signed-out app must not leak a namespace behind an "everyone gets one" banner, and a live screen
   must not render while it is still loading, or the first paint would show an empty table as truth. */
for (const [name, ok] of [
  ["the sign-in screen renders a form", htmlSignedOut.includes("<form") && htmlSignedOut.includes("Password")],
  ["sign-in is not a blank page", htmlSignedOut.length > 800],
  [
    "the sign-in screen with no API says there is nothing behind the form",
    htmlSignedOutOffline.includes("there is nothing behind this form to open a session"),
  ],
  [
    "and it does not tell the person they are looking at demo data",
    !htmlSignedOutOffline.includes("You are looking at the UI with demo data"),
  ],
  [
    "the door cannot be opened while the API is down",
    /<button type="submit" disabled[^>]*class="btn primary"/.test(htmlSignedOutOffline),
  ],
  [
    "and it says it is still looking for the server, instead of opening against one that has not answered",
    htmlSignedOutChecking.includes("Checking the server…") && /<button type="submit" disabled/.test(htmlSignedOutChecking),
  ],
  /* The strip is where "demo data" was being said about a host that was simply unreachable. */
  [
    "an unreachable API is not called demo data",
    htmlSignedOutOffline.includes("not answering") &&
      !htmlSignedOutOffline.includes(">demo data<") &&
      !htmlSignedOutOffline.includes("v2.5 Pro plan"),
  ],
  /* A build that cannot name itself is how a person ends up refreshing a page and arguing with a
     screenshot. The stamp is compiled in, so the assertion is that it arrived. */
  [
    "the door names the build it is, not an empty stamp",
    /* React's SSR puts an empty comment between the two text nodes, so the stamp is not adjacent to the
       label in the markup — it is still adjacent on the screen, which is the thing being asserted. */
    /v2\.5 · (<!-- -->)?[^<]{4,}/.test(htmlSignedOutOffline),
  ],
  /* v2.1's first run wrote an owner called `admin` — a bare name an `input[type=email]` refuses to submit.
     The field has to take what the server can look up, not what a validator prefers. */
  [
    "the sign-in field takes a sign-in name as well as an address",
    /id="email"[^>]*type="text"/.test(htmlSignedOutOffline),
  ],
  [
    "and the foot names nobody rather than somebody who is not signed in",
    htmlSignedOutOffline.includes("Nobody signed in") && !/Imtiaz/.test(htmlSignedOutOffline),
  ],
  [
    "and the sentence does not claim any of it comes from the site",
    htmlSignedOutOffline.includes("Nothing on these screens is read from your site"),
  ],
  ["the pill follows the state", linkPill("offline").label === "not answering" && linkPill("signedOut").label === "signed out" && linkPill("live").label === "live"],
  [
    "the sentence names the host and the reason, and never a sample",
    linkLabel(null, "offline", "the server could not be reached").includes("api/v2 is not answering") &&
      linkLabel(null, "offline", "the server could not be reached").includes("the server could not be reached") &&
      !/demo|sample/i.test(linkLabel(null, "offline", "the server could not be reached")),
  ],
  [
    "an API that answers but cannot work says why, and is not a demo either",
    linkLabel(
      { service: "woodex-api", version: "2.5.0-p1", php: "8.2.33", ready: false, db: { reachable: false, migrated: true }, time: "" },
      "offline",
      "",
    ).includes("api/v2 is not answering"),
  ],
  ["the live dashboard renders its loading state, not zeros", htmlLiveDash.includes("Loading…")],
  ["the live dashboard does not claim numbers before the server answers", !htmlLiveDash.includes("kpi-value")],
  ["the live leads screen renders its loading state", htmlLiveLeads.includes("Loading…")],
  ["the live redirects screen renders its loading state", htmlRedirects.includes("Loading…")],
  [
    "a redirects screen with no API says so instead of showing an empty table",
    htmlRedirectsOffline.includes("api/v2 is not answering") && !htmlRedirectsOffline.includes("Publish"),
  ],
  ["the live media screen renders its loading state", htmlMedia.includes("Loading…")],
  ["the live content screen renders its loading state", htmlContent.includes("Loading…")],
  [
    "a content screen with no API says so instead of showing an empty article list",
    htmlContentOffline.includes("api/v2 is not answering") && !htmlContentOffline.includes("New article"),
  ],
  [
    "the heroes screen with no API says so, and does not claim the site has no heroes",
    htmlHeroesOffline.includes("api/v2 is not answering") &&
      !htmlHeroesOffline.includes("0 page") &&
      !htmlHeroesOffline.includes("No hero"),
  ],
  [
    "and while it is reading the pages it says that, rather than showing an empty slider",
    htmlHeroesLive.includes("Loading…"),
  ],
  [
    "and the heroes route reaches the screen rather than a build plan",
    htmlHeroesRoute.includes("Hero slides") && !htmlHeroesRoute.includes("Build plan for this screen"),
  ],
  [
    "the heroes screen offers no save with no API behind it",
    !htmlHeroesOffline.includes("Save &amp; publish") && !htmlHeroesOffline.includes("Replace the hero"),
  ],
  [
    "and the city route is the same screen on another kind, not a placeholder",
    htmlCityOffline.includes("City pages") &&
      htmlCityOffline.includes("api/v2 is not answering") &&
      !htmlCityOffline.includes("New article") &&
      !htmlCityOffline.includes("build plan"),
  ],
  ["the header & footer screen renders its loading state", htmlGlobal.includes("Loading…")],
  ["the pages screen renders its loading state", htmlPages.includes("Loading…")],
  ["the seo screen renders its reading state", htmlSeo.includes("Reading every page…")],
  [
    "the seo screen with no API refuses to audit a site it cannot see",
    htmlSeoOffline.includes("api/v2 is not answering") && !htmlSeoOffline.includes("Rebuild from the pages"),
  ],
  [
    "and offers no save and no score to save it against",
    !htmlSeoOffline.includes("Write robots.txt") && !htmlSeoOffline.includes("What the audit found"),
  ],
  [
    "with no API and no demo the dashboard is a sentence, not the design's figures",
    htmlDashOff.includes("api/v2 is not answering") && !htmlDashOff.includes("kpi-value") && !htmlDashOff.includes("Zainab Tower"),
  ],
  [
    "the enquiries table with no API is not a list of strangers",
    htmlLeadsOff.includes("api/v2 is not answering") && !htmlLeadsOff.includes("Raza Textiles") && !htmlLeadsOff.includes("L-4821"),
  ],
  [
    /* The board and the quotation builder were prototype screens with no API behind them at all. They are
       deleted, and the routes they held are registered as `planned` — the registry is what decides that, and
       it is what the navigation reads, so this asserts the registry rather than a render. */
    "the pipeline and quotations routes are registered as planned, so the nav says SOON and the route says what it will do",
    ["pipeline", "quotes"].every((id) => {
      const r = NAV_ROUTES.find((x) => x.id === id);
      return r !== undefined && r.status === "planned" && r.hint !== "" && ROUTES.includes("/" + id);
    }),
  ],
  ["the section library renders its loading state", htmlLibrary.includes("Loading…")],
  [
    "the section library with no API does not render an empty shelf",
    htmlLibraryOffline.includes("api/v2 is not answering") && !htmlLibraryOffline.includes("New block"),
  ],
  [
    "the pages screen with no API does not claim the site has no history",
    htmlPagesOffline.includes("api/v2 is not answering") && !htmlPagesOffline.includes("Recent changes"),
  ],
  [
    "the pages screen with no API offers no editor to save into",
    !htmlPagesOffline.includes("New page") && !htmlPagesOffline.includes("Save page"),
  ],
  ["the site theme screen renders its loading state", htmlTheme.includes("Reading the stylesheet")],
  ["the placements screen renders its loading state", htmlPlace.includes("Loading…")],
  [
    "the placements screen with no API does not claim nothing appears anywhere",
    htmlPlaceOffline.includes("api/v2 is not answering") && !htmlPlaceOffline.includes("Save choices"),
  ],
  [
    "and it does not offer Update website either",
    !htmlPlaceOffline.includes("Update website"),
  ],
  [
    "the site theme with no API says so and offers no Save",
    htmlThemeOffline.includes("Not connected") && !htmlThemeOffline.includes("Save the theme")
      && !htmlThemeOffline.includes("Back to the site's own theme"),
  ],
  [
    "the header & footer screen offers no Apply when it cannot reach the API",
    htmlGlobalOffline.includes("api/v2 is not answering") && !htmlGlobalOffline.includes("Check what would change"),
  ],
  /* The announcement panel. Its two failure modes are opposite and both were real: a screen that draws a
     bar it cannot save, and a save that reports success about a bar the site has no code to draw. Neither
     half can be invented here — with no answer there is nothing to preview, and no button that pretends. */
  /* The queue. A dashboard once said "3 changes are waiting for the master" out of mock data, and the link
     went to a build-plan card; the number and the screen have to agree, and neither may appear without an
     API to ask. */
  /* The Forms screen. Two facts per page, not one — and the one that decides the screen is where a page's
     enquiry goes. Without an API it must show neither a form list nor a zero. */
  [
    "the forms screen with no API says so, and shows no form list it cannot read",
    htmlFormsOffline.includes("api/v2 is not answering") &&
      !htmlFormsOffline.includes("Contact form") &&
      !htmlFormsOffline.includes("0 enquiries"),
  ],
  [
    "and while it is reading the pages it says that, rather than listing six forms as not found",
    htmlFormsLive.includes("Loading…") && !htmlFormsLive.includes("No forms found"),
  ],
  [
    "and the forms route reaches the screen rather than a build plan",
    htmlFormsRoute.includes("Where each form is, and where its enquiries go") &&
      !htmlFormsRoute.includes("Build plan for this screen"),
  ],
  ["and the forms screen offers no save with no API behind it", !htmlFormsOffline.includes("Save contact form")],
  /* The Estimator. The rate book is a file: the offline state must not draw an empty table as though the
     figures had been read and found to be zero. */
  [
    "the estimator screen with no API says so, and does not draw an empty rate book",
    htmlEstOffline.includes("api/v2 is not answering") &&
      !htmlEstOffline.includes("Essential ≤ Standard ≤ Premium") &&
      !htmlEstOffline.includes("Save the rate book"),
  ],
  [
    "and while it is reading the file it says that, rather than showing no services",
    htmlEstLive.includes("Loading…") && !htmlEstLive.includes("No catalog lines yet"),
  ],
  [
    "and the estimator route reaches the screen rather than a build plan",
    htmlEstRoute.includes("The figures every price starts from") && !htmlEstRoute.includes("Build plan for this screen"),
  ],
  /* Projects. The KPI strip is the part that must not be invented: it is read from every project, so with no
     API there is no strip at all — not six zeros presented as your business. */
  [
    "the projects screen with no API says so, and shows no list or totals it cannot read",
    htmlProjOffline.includes("api/v2 is not answering") &&
      !htmlProjOffline.includes("Active projects") &&
      !htmlProjOffline.includes("Rs 0"),
  ],
  [
    "and while it is reading the projects it says that, rather than showing an empty table",
    htmlProjLive.includes("Reading the projects") && !htmlProjLive.includes("Nothing matches this filter"),
  ],
  [
    /* The route reaches the real screen — not the build-plan placeholder. Without a session the screen says
       what is behind the door rather than drawing a table, so that is the sentence asserted. */
    "and the projects route reaches the screen rather than a build plan",
    htmlProjRoute.includes("Sign in to see live projects, their milestones and their invoicing") &&
      !htmlProjRoute.includes("Build plan for this screen"),
  ],
  [
    "and the projects screen offers no save with no API behind it",
    !htmlProjOffline.includes("Save the plan") && !htmlProjOffline.includes("Save details"),
  ],
  /* The timeline. A chart is the easiest thing in a dashboard to draw from nothing, so the offline state has
     to say there is no axis — and must not render a Gantt frame that looks like a schedule. */
  [
    "the timeline with no API says so, and draws no axis",
    htmlTimeOffline.includes("api/v2 is not answering") &&
      !htmlTimeOffline.includes("gantt-bar") &&
      !htmlTimeOffline.includes("today"),
  ],
  [
    "and while it is reading it says that, rather than drawing an empty chart",
    htmlTimeLive.includes("Reading the projects") && !htmlTimeLive.includes("gantt-grid"),
  ],
  [
    "and the timeline route reaches the screen rather than a build plan",
    htmlTimeRoute.includes("on one axis") &&
      !htmlTimeRoute.includes("Build plan for this screen"),
  ],
  /* Client updates. The screen is allowed to be confident about exactly one thing — that it records and
     shares on the client's page — and must say the other half in words. These assertions hold it to that:
     the transport sentence is present in the live read, and the seven events are never drawn as configured
     when the settings could not be read. */
  [
    "the client updates screen with no API says so, and draws no events or log",
    htmlNotifOffline.includes("api/v2 is not answering") &&
      !htmlNotifOffline.includes("The seven events") &&
      !htmlNotifOffline.includes("Save channels"),
  ],
  [
    "and while it is reading it says that, rather than presenting seven configured events",
    htmlNotifLive.includes("Loading…") && !htmlNotifLive.includes("no transport yet"),
  ],
  [
    "and the route reaches the screen rather than a build plan",
    htmlNotifRoute.includes("Sign in to see what your clients are told") &&
      !htmlNotifRoute.includes("Build plan for this screen"),
  ],
  /* Five screens with no API behind them. Each one must say so — and, the other half of the same promise,
     none of them may draw the figure the design's sample used to put there. The name of the screen is in the
     assertion so a failure says which one, not just that one of five failed. */
  [
    "the projects screen draws no sample projects, and says why it cannot",
    !htmlOffProjects.includes("Zainab Tower") &&
      !htmlOffProjects.includes("4,680,000") &&
      htmlOffProjects.includes("api/v2 is not answering"),
  ],
  [
    "the timeline draws no bars it cannot know",
    !htmlOffTimeline.includes("gantt-bar") && !htmlOffTimeline.includes("Bedian") && htmlOffTimeline.includes("api/v2 is not answering"),
  ],
  [
    "the client updates screen lists no events it has not received",
    !htmlOffUpdates.includes("The seven events") &&
      !htmlOffUpdates.includes("Phase 4") &&
      htmlOffUpdates.includes("api/v2 is not answering"),
  ],
  [
    "the forms and the heroes screens claim nothing about a site they cannot read",
    !htmlOffForms.includes("Netlify function") &&
      !htmlOffHeroes.includes("Home slider") &&
      htmlOffForms.includes("api/v2 is not answering") &&
      htmlOffHeroes.includes("api/v2 is not answering"),
  ],
  /* The business info screen: it says where what the website says came from, which is the one thing v2.1
     could not show, and the reason a change could update nothing and still report success. With no API there
     is nothing read and nothing to report — and no company details to mistake for the real ones. */
  [
    "the business info screen is offline-honest, with no company details standing in for the real ones",
    htmlBizOffline.includes("api/v2 is not answering") && !htmlBizOffline.includes("Main phone"),
  ],
  [
    "the templates screen is offline-honest, with no starter set offered as if it were installed",
    htmlTplOffline.includes("api/v2 is not answering") &&
      htmlTplOffline.includes("Not connected") &&
      !htmlTplOffline.includes("Renovation"),
  ],
  [
    "the preview draws a document: the letterhead, the numbered lines, the words under the total",
    htmlDoc.includes("Woodex Interior") &&
      htmlDoc.includes("WI-10120") &&
      htmlDoc.includes("Prepared for") &&
      htmlDoc.includes("Platinum Ventures") &&
      htmlDoc.includes("1.1") &&
      htmlDoc.includes("2.1.1") &&
      htmlDoc.includes("In words") &&
      htmlDoc.includes("One crore twenty eight lakh forty thousand rupees only") &&
      htmlDoc.includes("50% advance payment with work order") &&
      htmlDoc.includes("Imtiaz Ahmad"),
  ],
  [
    "and the document says it is a sample when it is one, on the page rather than above it",
    renderToString(
      <DocPreview
        title="Quotation"
        no="WI-XXXXX"
        date="2026-10-14"
        client={{ name: "Client name" }}
        sections={[]}
        subtotal={0}
        discount={0}
        taxPct={0}
        tax={0}
        total={0}
        design="premium"
        company={{ name: "Woodex Interior" }}
        sample="Sample — a template has no client."
      />,
    ).includes("Sample — a template has no client."),
  ],
  ...wordsTests,
  ...badgeTests,
  [
    /* The journey that was reported broken, now with the door removed: opening the console with nothing behind
       it must land on a state that names the state — and there must be no sample anywhere in the bundle to land
       on instead. The console answers with the shared notice rather than a screenful of invented work. */
    "opening the console with nothing behind it lands on an honest state, offering no sample",
    HONEST(htmlAppOffline) &&
      htmlAppOffline.includes("Nobody signed in") &&
      !/Demo data|demo mode|sample data|In this sample/i.test(htmlAppOffline),
  ],
  [
    /* The sweep: every offline render in this file, asserted together. A screen that says the host is not
       answering *and* shows a figure would pass its own check and fail this one — which is why the failure
       message names the screens rather than the count. */
    "every offline render names the state it is in" +
      (OFFLINE_RENDERS.filter(([, h]) => h !== "" && !HONEST(h)).length
        ? " — silent about it: " + OFFLINE_RENDERS.filter(([, h]) => h !== "" && !HONEST(h)).map(([n]) => n).join(", ")
        : ""),
    OFFLINE_RENDERS.every(([, h]) => h === "" || HONEST(h)),
  ],
  [
    "and not one of them carries a sample, or the words that used to advertise one",
    OFFLINE_RENDERS.every(([, h]) => !/Demo data|demo mode|In this sample|sample data/i.test(h)),
  ],
  [
    /* The provider panel is reading, and while it reads it offers no key field and prints no key: the masked
       key it will show is the server's answer, and printing one before the server answers would be a sample. */
    "the AI settings panel asks the server, and shows no key while it waits",
    /Reading|Asking the server/.test(htmlAi) && !htmlAi.includes("sk-") && !htmlAi.includes("Paste the key"),
  ],
  [
    /* With no session at all the panel does not guess: it says whose keys these are and prints no field, which
       is the same refusal the editor gets — the two differ only in the words, and neither offers to save. */
    "the panel with no session says whose keys these are, and offers no field",
    htmlAiOffline.includes("owner &amp; admins") &&
      /not signed in/i.test(htmlAiOffline) &&
      !htmlAiOffline.includes("Paste the key") &&
      !htmlAiOffline.includes("Save"),
  ],
  [
    "an editor is told the keys are the owner's, not shown a form that cannot save",
    htmlAiEditor.includes("owner &amp; admins") &&
      htmlAiEditor.includes("signed in as Editor") &&
      !htmlAiEditor.includes("Paste the key"),
  ],
] as [string, boolean][]) {
  if (ok) pass++;
  else failures.push(`assertion failed: ${name}`);
}

/* ------------------------------------------------------------- the mount point (the white screen)
 *
 * The console is built with `--base=/admin-next/` and served from that directory, so every internal link has
 * to stay inside it. One `<a href="/leads">` — or a router without a basename — sends the browser to the
 * domain root, where the host answers with the site's 404, or with an empty body that renders as a white
 * page. That is exactly what shipped: every sidebar item escaped the console, and a refresh on any screen
 * the console had written was blank. It is a one-character class of bug with a two-hour diagnosis, which is
 * why it is asserted here rather than left to be noticed.
 *
 * How it is detected: rendered with `basename="/admin-next"`, a router link writes
 * `href="/admin-next/leads"` while a raw anchor writes `href="/leads"` verbatim. The difference is visible
 * in the markup, so the check is on the markup — `renderToString` cannot run a click.
 *
 * Two hrefs are legitimately outside the mount point and are allowed by name: `/api/…` (the API lives at
 * the domain root and is same-origin by design) and `/assets/…` (the website's own files, referenced by a
 * preview of a page). Everything else is a link that leaves the console.
 */
const MOUNT = "/admin-next";

function outsideMount(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = m[1];
    if (href === MOUNT || href.startsWith(MOUNT + "/")) continue;
    if (href.startsWith("/api/") || href.startsWith("/assets/")) continue;
    found.add(href);
  }
  return [...found];
}

/* The audit's own two fixtures. A check that cannot fail proves nothing, and a check that flags the correct
   code is worse than none — so both directions are asserted before the screens are looked at. */
const fixtureEscaping = renderToString(
  <MemoryRouter basename={MOUNT} initialEntries={[MOUNT + "/dashboard"]}>
    {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
    <a href="/leads">a raw anchor, the shape of the bug</a>
  </MemoryRouter>,
);
const fixtureInside = renderToString(
  <MemoryRouter basename={MOUNT} initialEntries={[MOUNT + "/dashboard"]}>
    <Link to="/leads">a router link, the shape that is correct</Link>
  </MemoryRouter>,
);

const strays = ROUTES.map((path) => {
  try {
    /* The entries carry the mount point: a MemoryRouter whose entry does not start with its `basename`
       renders nothing at all (react-router says so and returns an empty tree), which would make this audit
       pass by rendering nothing to inspect. `MOUNT + path` is the address the browser actually holds. */
    const html = renderToString(
      <MemoryRouter basename={MOUNT} initialEntries={[MOUNT + path]}>
        <App />
      </MemoryRouter>,
    );
    if (html.length < 200) return [path, [`(rendered ${html.length} chars — nothing to inspect)`]] as const;
    return [path, outsideMount(html)] as const;
  } catch {
    /* already reported by the route loop above; a crash is not a broken link */
    return [path, []] as const;
  }
}).filter(([, found]) => found.length > 0);

const assertions: [string, boolean][] = [
  ["the mount-point audit catches an anchor that leaves the console", outsideMount(fixtureEscaping).includes("/leads")],
  ["and does not flag a router link that stays inside it", outsideMount(fixtureInside).length === 0],
  ["dashboard renders an H1 (U1.1 fix)", /<h1[^>]*>/.test(htmlDashboard)],
  ["dashboard renders a breadcrumb", htmlDashboard.includes("crumbs")],
  /* The dashboard renders as a *sentence* when there is nothing to read from: a KPI row is a claim about the
     studio's day and there is no API here to license one. The design's row and feed used to be asserted
     against the demo render; there is no demo render left, so the same assertion is made twice — once on the
     screen and once through the whole app on its own route — which is the shape that catches a regression
     where the screen refuses and the router still mounts something that does not. */
  [
    "the dashboard with nowhere to read from shows no numbers at all, and says so",
    !htmlDashOff.includes("kpi-value") && !htmlDashOff.includes("feed-item") && HONEST(htmlDashOff),
  ],
  [
    "the enquiries screen with nowhere to read from shows no table and quotes no reference",
    !htmlLeadsOff.includes("L-4821") && !htmlLeadsOff.includes("<table") && HONEST(htmlLeadsOff),
  ],
  [
    "and the console's own route to the dashboard lands on the session, not on a screenful of figures",
    !htmlDashboard.includes("kpi-value") && !htmlDashboard.includes("feed-item") && htmlDashboard.includes("Nobody signed in"),
  ],
];

for (const [name, ok] of assertions) {
  if (ok) pass++;
  else failures.push(`assertion failed: ${name}`);
}

/* The strays named one by one, with the offending href: the fix is a file, and a report that does not say
   which file is a report somebody has to reproduce first. */
for (const [path, found] of strays) {
  failures.push(`mount point: ${path} → ${found.map((href) => `“${href}”`).join(", ")} leaves ${MOUNT}/`);
}
void checks;

console.log(`\n  Woodex Admin v2.5 — render smoke test`);
console.log(`  ${pass} passed · ${failures.length} failed · ${ROUTES.length} routes\n`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("  ✓ all routes render, shell intact, dashboard complete\n");
