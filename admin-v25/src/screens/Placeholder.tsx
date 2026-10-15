/* Placeholder for registered-but-not-yet-built screens.
   Deliberately NOT a "coming soon" stub: it states the route id, the phase that
   builds it, which API actions it will call and what module from v2.1 it
   replaces — so the registry doubles as a build checklist. */
import { Construction } from "lucide-react";
import { Card, Note, PageHead, Pill } from "../components/primitives";
import type { NavRoute } from "../lib/nav";

/** Phase assignment for every registered route. Phase 0 = built. */
const PHASES: Record<string, { phase: string; replaces: string; actions: string }> = {
  approvals: { phase: "P2", replaces: "admin-appr.js", actions: "appr_list · appr_get · appr_reject · appr_count" },
  timeline: { phase: "P3", replaces: "new in v2.5", actions: "projects_timeline" },
  enquiries: { phase: "—", replaces: "admin-crm.js (Leads table)", actions: "—" },
  bookings: { phase: "P2", replaces: "admin-booking.js", actions: "bk_list · bk_slots · bk_save · bk_status" },
  clients: { phase: "P2", replaces: "admin-sales17.js (clients)", actions: "clients_master · client_360 · clients_merge" },
  invoices: { phase: "P2", replaces: "admin-sales.js + admin-sales17.js", actions: "invs_list · inv_save · inv_track · pay_add" },
  transactions: { phase: "P2", replaces: "admin-sales.js (payments)", actions: "pays_list · pay_add · pay_delete" },
  templates: { phase: "P3", replaces: "admin-print*.js + quote-starter.js", actions: "tpl_list · tpl_save · tpl_import" },
  projects: { phase: "P3", replaces: "admin-sales.js (projects)", actions: "proj_list · proj_save · proj_delete" },
  chat: { phase: "P2", replaces: "admin-chat.js + admin-chat2.js", actions: "chat_list · chat_get · chat_reply · chat_typing · chat_file" },
  wahub: { phase: "P3", replaces: "admin-wahub.js", actions: "wah_overview · wah_rule_save · wah_rule_delete" },
  wainsights: { phase: "P3", replaces: "admin-wains.js", actions: "wah_insights" },
  wauto: { phase: "P4", replaces: "admin-p18g.js", actions: "wag_get · wag_camp_save · wag_camp_action · wag_optout" },
  offers: { phase: "P4", replaces: "admin-offers.js", actions: "crm_offers · crm_offer_save · crm_offer_send" },
  connections: { phase: "P4", replaces: "admin-p38wa.js", actions: "crm_wa_status · crm_wa_connect · crm_wa_disconnect" },
  telegram: { phase: "P4", replaces: "admin-tg.js", actions: "tg_get · tg_save · tg_connect · tg_test" },
  social: { phase: "P4", replaces: "admin-social.js", actions: "soc_get · soc_post_save · soc_comment_reply" },
  updates: { phase: "P3", replaces: "admin-notify.js", actions: "notify_get · notify_save · notify_test" },
  pages: { phase: "P3", replaces: "admin-pages.js", actions: "pages_list · page_new · page_delete · page_meta_save" },
  builder: { phase: "P5", replaces: "admin/builder/*", actions: "— (separate app, /builder/)" },
  library: { phase: "P3", replaces: "admin-library.js + admin-lib26.js", actions: "blocks_list · blocks_save · blocks_usage" },
  global: { phase: "P3", replaces: "admin-chrome.js", actions: "global_chrome · global_menu · chrome_save · chrome_versions" },
  heroes: { phase: "P3", replaces: "admin-hero.js", actions: "heroes_list · heroes_save" },
  redirects: { phase: "P3", replaces: "admin-redirects.js", actions: "redirects · redirects_save · r404_list" },
  blog: { phase: "P3", replaces: "admin-content.js (blog)", actions: "cms_list · cms_save · cms_published" },
  portfolio: { phase: "P3", replaces: "admin-content.js (portfolio)", actions: "cms_list · cms_save" },
  services: { phase: "P3", replaces: "admin-fields.js (services)", actions: "cms_biz_get · cms_biz_save" },
  cities: { phase: "P3", replaces: "admin-fields.js (cities)", actions: "cms_list · cms_save" },
  pagetpl: { phase: "P3", replaces: "admin-templates.js", actions: "cms_tpl_list · cms_tpl_save" },
  forms: { phase: "P3", replaces: "admin-p18e.js (forms)", actions: "forms_get · forms_save" },
  estimator: { phase: "P3", replaces: "admin-p18e.js (estimator)", actions: "est_save · est_tpls" },
  faqs: { phase: "P3", replaces: "admin-content.js (faqs)", actions: "cms_list · cms_save" },
  testimonials: { phase: "P3", replaces: "admin-content.js (testimonials)", actions: "cms_list · cms_save" },
  logos: { phase: "P3", replaces: "admin-logos.js", actions: "logos_get · logos_save · media_upload" },
  team: { phase: "P3", replaces: "admin-content.js (team)", actions: "cms_list · cms_save" },
  media: { phase: "P3", replaces: "admin-media.js (library)", actions: "media_list · media_upload · media_delete" },
  seo: { phase: "P4", replaces: "admin-seo.js + admin-seo38.js", actions: "seo_list · seo_page · seo_save · seo_scores" },
  speed: { phase: "P4", replaces: "admin-speed.js", actions: "health_speed · health_psi" },
  health: { phase: "P4", replaces: "admin-media.js (health)", actions: "health_get · health_scan" },
  aicenter: { phase: "P4", replaces: "admin-aicenter.js", actions: "aic_get · aic_save · aic_health" },
  train: { phase: "P4", replaces: "admin-train.js", actions: "chat_cfg_get · chat_cfg_save · chat_test" },
  aireport: { phase: "P4", replaces: "admin-aia.js", actions: "ai_report · ai_unans_list" },
  seoagent: { phase: "P5", replaces: "admin-seoagent.js", actions: "sag_get · sag_scan · sag_propose" },
  business: { phase: "P3", replaces: "admin-fields.js (business)", actions: "cms_biz_get · cms_biz_save · company_save" },
  integrations: { phase: "P3", replaces: "admin-settings.js (rewritten from hard-coded cards)", actions: "conn_list · conn_save · conn_test" },
  users: { phase: "P2", replaces: "admin.js (users) + admin-users.js", actions: "users · user_save · roles matrix" },
  backups: { phase: "P5", replaces: "admin-media.js (backups)", actions: "backup_list · backup_run · backup_restore" },
  database: { phase: "P5", replaces: "admin-p18h.js (database)", actions: "dbx_tables · dbx_browse · dbx_export" },
  files: { phase: "P5", replaces: "admin-p18h.js (files)", actions: "fm_list · fm_mkdir · fm_rename" },
  maintenance: { phase: "P5", replaces: "admin-p18h.js (maintenance)", actions: "maint_get · maint_save" },
  activity: { phase: "P2", replaces: "admin.js (activity)", actions: "activity" },
  system: { phase: "P5", replaces: "admin-system.js", actions: "status · sys_check" },
  profile: { phase: "P2", replaces: "admin-p18j.js", actions: "me_get · me_save · me_avatar" },
  security: { phase: "P2", replaces: "admin-settings.js (security)", actions: "sec_2fa_begin · sec_2fa_enable · sec_2fa_disable" },
  inventory: { phase: "P6", replaces: "new in v2.5", actions: "inv_items · inv_stock · inv_move" },
  procurement: { phase: "P6", replaces: "new in v2.5", actions: "po_list · po_save · po_receive" },
  portal: { phase: "P6", replaces: "new in v2.5", actions: "portal_token · portal_approve" },
  gmail: { phase: "P6", replaces: "new in v2.5", actions: "mail_list · mail_send" },
  quotes: { phase: "P2", replaces: "admin-sales.js + admin-print*.js", actions: "quotes_list · quote_get · quote_save · quote_pdf" },
};

export function Placeholder({ route }: { route: NavRoute }) {
  const meta = PHASES[route.id] ?? {
    phase: "P3",
    replaces: "—",
    actions: "—",
  };

  return (
    <>
      <PageHead
        title={route.label}
        sub={route.hint ?? "Screen registered in the route registry, not yet built"}
        actions={<Pill tone={route.status === "planned" ? "warn" : "info"}>
          {route.status === "planned" ? "v2.5 roadmap" : `Deliverable ${meta.phase}`}
        </Pill>}
      />

      <div className="grid c2">
        <Card title="Build plan for this screen">
          <table className="data">
            <tbody>
              <tr><td className="muted" style={{ width: 170 }}>Route id</td><td className="mono">{route.id}</td></tr>
              <tr><td className="muted">Section</td><td>{route.section}{route.group ? ` › ${route.group}` : ""}</td></tr>
              <tr><td className="muted">Roles</td><td>{route.roles?.join(", ") ?? "any signed-in user"}</td></tr>
              <tr><td className="muted">Delivery phase</td><td><b>{meta.phase}</b></td></tr>
              <tr><td className="muted">Replaces</td><td className="mono">{meta.replaces}</td></tr>
              <tr><td className="muted">API actions</td><td className="mono" style={{ fontSize: "var(--fs-11)" }}>{meta.actions}</td></tr>
              {route.aliases?.length ? (
                <tr><td className="muted">Aliases</td><td className="mono">{route.aliases.join(", ")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        <Card title="Why this is registered now">
          <p style={{ fontSize: "var(--fs-13)" }}>
            All {58} screens in the registry are typed before any of them is written. That is what
            removes the three defects the v2.1 audit found in navigation:
          </p>
          <ul style={{ margin: "var(--s-3) 0 0", paddingLeft: 18, fontSize: "var(--fs-12)" }}>
            <li><b>AD-3</b> — no route can render an undefined phase; status is a closed union.</li>
            <li><b>AD-4</b> — aliases are declared, so <span className="mono">#/integrations</span> resolves instead of falling through.</li>
            <li><b>AD-12</b> — a route appears once, so two modules can never fight over one view key.</li>
          </ul>
          <div className="note" style={{ marginTop: "var(--s-4)" }}>
            <Construction size={15} />
            <div>
              This screen is registered in the route list but not built yet. It is planned for phases P2–P6
              in the master plan.
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: "var(--s-4)" }}>
        <Note>
          <b>Acceptance gate for {route.label}.</b> A screen is done when: it renders for every
          permitted role, its empty and error states are designed, its API calls use the{" "}
          <span className="mono">/api/v2</span> envelope, it has no literal colour, and it appears in
          the command palette.
        </Note>
      </div>
    </>
  );
}
