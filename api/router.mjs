// api/router.mjs — SINGLE Vercel serverless function for the whole CMS backend.
// Vercel Hobby caps deployments at 12 serverless functions, and the dashboard
// needs 16 endpoints, so every backend call is routed through this one function.
// vercel.json rewrites /.netlify/functions/<name> -> /api/router?fn=<name>
// (original query strings are preserved by Vercel and merged in).
// The real logic still lives untouched in netlify/functions/*.mjs.
import { vercelWrap } from "../netlify/functions/_vercel-adapter.mjs";
import cmsAuth from "../netlify/functions/cms-auth.mjs";
import cmsBlogPosts from "../netlify/functions/cms-blog-posts.mjs";
import cmsDelete from "../netlify/functions/cms-delete.mjs";
import cmsEnquiries from "../netlify/functions/cms-enquiries.mjs";
import cmsEstimatorLeads from "../netlify/functions/cms-estimator-leads.mjs";
import cmsInvoices from "../netlify/functions/cms-invoices.mjs";
import cmsMedia from "../netlify/functions/cms-media.mjs";
import cmsProjects from "../netlify/functions/cms-projects.mjs";
import cmsQuotationTemplates from "../netlify/functions/cms-quotation-templates.mjs";
import cmsQuotations from "../netlify/functions/cms-quotations.mjs";
import cmsSave from "../netlify/functions/cms-save.mjs";
import cmsSettings from "../netlify/functions/cms-settings.mjs";
import cmsStats from "../netlify/functions/cms-stats.mjs";
import cmsTeam from "../netlify/functions/cms-team.mjs";
import cmsUpload from "../netlify/functions/cms-upload.mjs";
import cmsUsers from "../netlify/functions/cms-users.mjs";
import cmsAnalytics from "../netlify/functions/cms-analytics.mjs";
import cmsBackups from "../netlify/functions/cms-backups.mjs";
import cmsClients from "../netlify/functions/cms-clients.mjs";
import cmsHealth from "../netlify/functions/cms-health.mjs";
import cmsLocations from "../netlify/functions/cms-locations.mjs";
import cmsPages from "../netlify/functions/cms-pages.mjs";
import cmsRedirects from "../netlify/functions/cms-redirects.mjs";
import cmsServices from "../netlify/functions/cms-services.mjs";
import cmsSiteVisits from "../netlify/functions/cms-site-visits.mjs";
import cmsTestimonials from "../netlify/functions/cms-testimonials.mjs";
import cmsVersions from "../netlify/functions/cms-versions.mjs";
import analyticsTrack from "../netlify/functions/analytics-track.mjs";
import cmsMenuItems from "../netlify/functions/cms-menu-items.mjs";
import enquirySubmit from "../netlify/functions/enquiry-submit.mjs";
import estimatorSubmit from "../netlify/functions/estimator-submit.mjs";

const HANDLERS = {
  "cms-auth": cmsAuth,
  "cms-blog-posts": cmsBlogPosts,
  "cms-delete": cmsDelete,
  "cms-enquiries": cmsEnquiries,
  "cms-estimator-leads": cmsEstimatorLeads,
  "cms-invoices": cmsInvoices,
  "cms-media": cmsMedia,
  "cms-projects": cmsProjects,
  "cms-quotation-templates": cmsQuotationTemplates,
  "cms-quotations": cmsQuotations,
  "cms-save": cmsSave,
  "cms-settings": cmsSettings,
  "cms-stats": cmsStats,
  "cms-team": cmsTeam,
  "cms-upload": cmsUpload,
  "cms-users": cmsUsers,
  "cms-analytics": cmsAnalytics,
  "cms-backups": cmsBackups,
  "cms-clients": cmsClients,
  "cms-health": cmsHealth,
  "cms-locations": cmsLocations,
  "cms-pages": cmsPages,
  "cms-redirects": cmsRedirects,
  "cms-services": cmsServices,
  "cms-site-visits": cmsSiteVisits,
  "cms-testimonials": cmsTestimonials,
  "cms-versions": cmsVersions,
  "analytics-track": analyticsTrack,
  "cms-menu-items": cmsMenuItems,
  "enquiry-submit": enquirySubmit,
  "estimator-submit": estimatorSubmit,
};

async function router(req, res) {
  let fn = "";
  try {
    fn = new URL(req.url || "/", "http://local").searchParams.get("fn") || "";
  } catch {}
  const handler = HANDLERS[fn];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Unknown API function." }));
    return;
  }
  return vercelWrap(handler)(req, res);
}

export default router;
