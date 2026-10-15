/* ============================================================================
   ROUTE + NAVIGATION REGISTRY — the single source of truth.

   Replaces the v2.1 `NAV` tuple array (admin.js) which had three structural
   defects, all fixed by making this a typed registry:

     AD-3  nav tuples had no phase/status field -> "Phase undefined" rendered
     AD-4  hash aliases (business/connections/integrations) existed in code but
           not in NAV, so the router fell through to the dashboard loader
     AD-12 20 view keys were registered by 2+ modules; last script won

   Here every route appears ONCE. Aliases are declared as `aliases`. Status is
   a closed union, so a screen can never render an undefined phase.
   ========================================================================== */
import {
  LayoutDashboard, ShieldCheck, Inbox, Kanban, Clock, Contact, FileText, Receipt,
  CreditCard, Layers, Briefcase, MessageCircle, Send, Image, Zap, Sparkles,
  BookOpen, Star, SquarePen, Blocks, PanelLeft, RefreshCw, MapPin, Gauge,
  HelpCircle, MessageSquare, Users, Search, HeartPulse, Palette, Building2,
  HardDrive, Database, FolderOpen, Shield, Activity, User, Lock, Rows3,
  Container, Bell, Wand2, TrendingUp, Boxes, Globe, Mail, CalendarCheck,
  // (extras used by the tile screens)
  ListChecks, Megaphone, Network, FileStack, Truck,
} from "lucide-react";
import type { ComponentType } from "react";

export type RouteStatus = "stable" | "beta" | "planned";

export interface NavRoute {
  /** URL hash fragment without the leading "#/" — also the React Router path. */
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  /** Which sidebar section this belongs to. */
  section: SectionId;
  /** Collapsible sub-group inside a section (matches the v2.1 dropdown groups). */
  group?: string;
  /** Roles allowed to see it. Empty = everyone signed in. */
  roles?: Role[];
  /** Live counter source — rendered as a badge in the sidebar. */
  badge?: "leads" | "chat" | "approvals";
  status?: RouteStatus;
  /** Reached from a hub tab only — present in the registry, hidden in the sidebar. */
  hidden?: boolean;
  /** Old or alternate URLs that must resolve to this route (AD-4 fix). */
  aliases?: string[];
  /** One line describing the screen — used by the command palette. */
  hint?: string;
}

export type Role = "owner" | "admin" | "editor" | "sales" | "support";

export type SectionId =
  | "home" | "sales" | "conversations" | "website"
  | "automation" | "system" | "me";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "sales", label: "Sales" },
  { id: "conversations", label: "Conversations" },
  { id: "website", label: "Website" },
  { id: "automation", label: "Automation" },
  { id: "system", label: "System" },
  { id: "me", label: "Me" },
];

const SALES: Role[] = ["owner", "admin", "sales"];
const OA: Role[] = ["owner", "admin"];
const OAE: Role[] = ["owner", "admin", "editor"];

export const ROUTES: NavRoute[] = [
  /* ---------------------------------------------------------------- HOME */
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "home", hint: "Studio KPIs, pipeline, revenue trend" },
  { id: "approvals", label: "Approvals", icon: ShieldCheck, section: "home", roles: OAE, badge: "approvals", hint: "Manager changes waiting for the master" },
  { id: "timeline", label: "Timeline", icon: CalendarCheck, section: "home", hint: "Projects on a date axis with milestones" },

  /* --------------------------------------------------------------- SALES */
  { id: "enquiries", label: "Leads", icon: Inbox, section: "sales", roles: SALES, badge: "leads", hint: "Every enquiry from every channel" },
  /* The board and the quotation builder were prototype screens with no API behind them. They are deleted and
     registered here as planned, so the nav says SOON and the route says what it will do; `admin-p19f.js` in
     the v2.1 tree names what they will replace. */
  { id: "pipeline", label: "Pipeline", icon: Kanban, section: "sales", roles: SALES, status: "beta", hint: "Stage board — move a lead, the change is in its activity" },
  { id: "bookings", label: "Bookings", icon: Clock, section: "sales", roles: SALES, hint: "Site visits, office meetings, calls" },
  { id: "clients", label: "Clients", icon: Contact, section: "sales", roles: SALES, hint: "Client master records" },
  { id: "quotes", label: "Quotations", icon: FileText, section: "sales", group: "Quotes & invoices", roles: SALES, status: "beta", hint: "BOQ quotations — draft, approve, convert to an invoice" },
  { id: "invoices", label: "Invoices", icon: Receipt, section: "sales", group: "Quotes & invoices", roles: SALES, hint: "Invoices, tracker and payments" },
  { id: "transactions", label: "Payments", icon: CreditCard, section: "sales", group: "Quotes & invoices", roles: SALES, hint: "Receipts against invoices" },
  { id: "templates", label: "Quote templates", icon: Layers, section: "sales", group: "Quotes & invoices", roles: SALES, aliases: ["quotations/templates"], hint: "Nine starter BOQ templates, editable" },
  { id: "projects", label: "Projects", icon: Briefcase, section: "sales", roles: SALES, hint: "Live projects and milestones" },

  /* ------------------------------------------------------- CONVERSATIONS */
  { id: "chat", label: "Inbox", icon: MessageCircle, section: "conversations", badge: "chat", hint: "Live chat across web, WhatsApp, Telegram" },
  { id: "wahub", label: "WhatsApp hub", icon: Send, section: "conversations", group: "WhatsApp", hint: "Connection, delivery and read rates" },
  { id: "wainsights", label: "Insights", icon: TrendingUp, section: "conversations", group: "WhatsApp", hint: "Conversation analytics" },
  { id: "wauto", label: "Broadcasts", icon: Zap, section: "conversations", group: "WhatsApp", hint: "Campaigns, audiences and auto flows" },
  { id: "offers", label: "Discount offers", icon: Megaphone, section: "conversations", group: "WhatsApp", hint: "Targeted offer blasts" },
  { id: "connections", label: "Connect WhatsApp", icon: Network, section: "conversations", group: "WhatsApp", aliases: ["settings/connections"], hint: "Number, token and templates" },
  { id: "telegram", label: "Telegram", icon: Send, section: "conversations", roles: OAE, hint: "Bot, alerts and DM routing" },
  { id: "social", label: "Social media", icon: Image, section: "conversations", roles: OA, hint: "Facebook and Instagram planner" },
  { id: "notifications", label: "Client updates", icon: Bell, section: "conversations", aliases: ["updates"], hint: "Bilingual messages, the seven events and the log" },

  /* ------------------------------------------------------------- WEBSITE */
  { id: "pages", label: "All pages", icon: FileStack, section: "website", group: "Pages & builder", roles: OAE, hint: "150 public pages, metadata and status" },
  { id: "builder", label: "Page builder", icon: SquarePen, section: "website", group: "Pages & builder", roles: OAE, hint: "Visual canvas and block editor" },
  { id: "library", label: "Section library", icon: Blocks, section: "website", group: "Pages & builder", roles: OAE, hint: "51 reusable section blocks" },
  { id: "global", label: "Header & footer", icon: PanelLeft, section: "website", group: "Pages & builder", roles: OAE, hint: "Site-wide chrome and menus" },
  { id: "site-theme", label: "Site theme", icon: Palette, section: "website", group: "Pages & builder", roles: OAE, hint: "The colours and type every page is drawn from" },
  { id: "heroes", label: "Hero slides", icon: Rows3, section: "website", group: "Pages & builder", roles: OAE, hint: "Home page hero carousel" },
  { id: "redirects", label: "Redirects", icon: RefreshCw, section: "website", group: "Pages & builder", roles: OAE, hint: "36-rule plan and 404 log" },
  { id: "blog", label: "Blog", icon: BookOpen, section: "website", group: "Content", roles: OAE, hint: "48 published articles" },
  { id: "portfolio", label: "Portfolio", icon: Image, section: "website", group: "Content", roles: OAE, hint: "Case studies" },
  { id: "services", label: "Service pages", icon: Layers, section: "website", group: "Content", roles: OAE, hint: "Service catalogue" },
  { id: "cities", label: "City pages", icon: MapPin, section: "website", group: "Content", roles: OAE, hint: "12 local-SEO landing pages" },
  { id: "pagetpl", label: "Page templates", icon: Container, section: "website", group: "Content", roles: OAE, hint: "Reusable page starters" },
  { id: "forms", label: "Forms", icon: ListChecks, section: "website", group: "Content", roles: OAE, hint: "Form fields, alerts and auto-reply" },
  { id: "estimator", label: "Estimator", icon: Gauge, section: "website", group: "Content", roles: OAE, hint: "Public rate book and calculator" },
  { id: "faqs", label: "FAQs", icon: HelpCircle, section: "website", group: "Content", roles: OAE, hint: "Question groups" },
  { id: "testimonials", label: "Testimonials", icon: MessageSquare, section: "website", group: "Content", roles: OAE, hint: "Client reviews" },
  { id: "logos", label: "Client logos", icon: Image, section: "website", group: "Content", roles: OAE, hint: "Home page logo strip" },
  { id: "team", label: "Team", icon: Users, section: "website", group: "Content", roles: OAE, hint: "Staff profiles" },
  { id: "media", label: "Media", icon: FolderOpen, section: "website", roles: OAE, hint: "Image library, usage and alt text" },
  { id: "seo", label: "SEO", icon: Search, section: "website", roles: OAE, hint: "Per-page keyphrases and scores" },
  { id: "speed", label: "Speed", icon: Gauge, section: "website", roles: OAE, hint: "Core Web Vitals per page" },
  { id: "health", label: "Site health", icon: HeartPulse, section: "website", roles: OAE, hint: "Broken links, alt text, oversized images" },

  /* ---------------------------------------------------------- AUTOMATION */
  { id: "aicenter", label: "AI assistant", icon: Sparkles, section: "automation", roles: OA, hint: "One place to control every AI reply" },
  { id: "train", label: "Knowledge & Q&A", icon: BookOpen, section: "automation", roles: OA, hint: "Answers the bot is allowed to give" },
  { id: "aireport", label: "AI report", icon: Star, section: "automation", roles: OA, hint: "Hand-offs and unanswered questions" },
  { id: "seoagent", label: "SEO agent", icon: Wand2, section: "automation", roles: OAE, hint: "Scans pages and proposes fixes" },

  /* -------------------------------------------------------------- SYSTEM */
  { id: "business", label: "Business info", icon: Building2, section: "system", aliases: ["company", "settings/business"], hint: "Company, banks and legal details" },
  { id: "integrations", label: "Integrations", icon: Network, section: "system", aliases: ["settings", "connections-apps"], hint: "22 connectors and API keys" },
  { id: "users", label: "Users & roles", icon: Users, section: "system", roles: OA, hint: "Accounts, roles and permissions" },
  { id: "theme", label: "Theme", icon: Palette, section: "system", hint: "Design tokens, accent and density" },
  { id: "backups", label: "Backups", icon: HardDrive, section: "system", roles: OA, hint: "Snapshot, restore and download" },
  { id: "database", label: "Database", icon: Database, section: "system", roles: OA, hint: "20 tables, browse and export" },
  { id: "files", label: "File manager", icon: FolderOpen, section: "system", roles: OAE, hint: "Server files and uploads" },
  { id: "maintenance", label: "Maintenance", icon: Shield, section: "system", roles: OA, hint: "Coming-soon and safe mode" },
  { id: "activity", label: "Activity log", icon: Activity, section: "system", hint: "Every admin action, who and when" },
  { id: "system", label: "System check", icon: Activity, section: "system", hint: "PHP, database and permission probe" },

  /* ------------------------------------------------------------------ ME */
  { id: "profile", label: "My profile", icon: User, section: "me", hint: "Your details and signature" },
  { id: "security", label: "My security", icon: Lock, section: "me", hint: "Password, 2FA and sessions" },

  /* -------------------------------------------- inventory (v2.5 addition) */
  { id: "inventory", label: "Inventory", icon: Boxes, section: "sales", roles: SALES, status: "planned", hint: "Timber, acrylic, hardware and fabric stock" },
  { id: "procurement", label: "Procurement", icon: Truck, section: "sales", roles: SALES, status: "planned", hint: "Purchase orders from milestone thresholds" },
  { id: "portal", label: "Client portal", icon: Globe, section: "sales", roles: SALES, status: "planned", hint: "Tokenised client view and e-approval" },
  { id: "gmail", label: "Mail", icon: Mail, section: "conversations", status: "planned", hint: "Shared mailbox and templates" },
];

/* ---------------------------------------------------------------- selectors */
export const byId = new Map(ROUTES.map((r) => [r.id, r]));

/** Resolve a path (including aliases) to a route — the AD-4 fix. */
export function resolveRoute(path: string): NavRoute | undefined {
  const clean = path.replace(/^#?\/?/, "").split("?")[0];
  const direct = byId.get(clean);
  if (direct) return direct;
  return ROUTES.find((r) => r.aliases?.includes(clean));
}

export function sectionRoutes(section: SectionId, role: Role): NavRoute[] {
  return ROUTES.filter(
    (r) => r.section === section && !r.hidden && (!r.roles || r.roles.includes(role)),
  );
}

export function can(route: NavRoute, role: Role): boolean {
  return !route.roles || route.roles.includes(role);
}

/** Flat list for search / the command palette. */
export function searchRoutes(q: string, role: Role): NavRoute[] {
  const needle = q.trim().toLowerCase();
  const pool = ROUTES.filter((r) => can(r, role));
  if (!needle) return pool.filter((r) => r.status !== "planned").slice(0, 9);
  return pool
    .map((r) => {
      const hay = `${r.label} ${r.id} ${r.section} ${r.group ?? ""} ${r.hint ?? ""}`.toLowerCase();
      let score = 0;
      if (r.label.toLowerCase().startsWith(needle)) score += 100;
      if (r.label.toLowerCase().includes(needle)) score += 40;
      if (r.id.startsWith(needle)) score += 30;
      if (hay.includes(needle)) score += 10;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
    .slice(0, 12);
}
