// Dashboard API: system health checks. Requires CMS session (any role).
// GET /.netlify/functions/cms-health
import { bearerSession, json, verifySession } from "./_auth.mjs";
import { sbConfigured, sbRest } from "./_supabase.mjs";

const GH_OWNER = process.env.CMS_GITHUB_OWNER || "marketingwoodex-cloud";
const GH_REPO = process.env.CMS_GITHUB_REPO || "-marketingwoodex";

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed." });
  const user = await verifySession(bearerSession(req));
  if (!user) return json(401, { error: bearerSession(req) ? "Session expired. Please sign in again." : "Authentication required. Please sign in." });

  let supabase = "down";
  if (sbConfigured()) {
    try {
      const { status } = await sbRest("site_settings", { query: "?select=key&limit=1" });
      if (status === 200) supabase = "ok";
    } catch { /* stays down */ }
  }

  // GitHub: token validity and the token's user's repo role. NOTE: for classic
  // PATs, `permissions.push` reflects the USER's repo role, not the token's
  // scopes — a 403 on actual write ("Resource not accessible by personal
  // access token") means the token itself lacks Contents write even when
  // push:true is reported. Only a real publish proves write access.
  let github = "down";
  let github_push = null;
  let github_note = "No token configured.";
  const token = process.env.CMS_GITHUB_TOKEN || "";
  if (token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`, {
        headers: { authorization: `Bearer ${token}`, "user-agent": "woodex-cms" },
      });
      if (res.ok) {
        github = "ok";
        const repo = await res.json().catch(() => ({}));
        const perms = repo && repo.permissions;
        if (perms && typeof perms.push === "boolean") {
          github_push = perms.push;
          github_note = perms.push
            ? "Repo allows pushes for this token's user — confirm with a real publish (permissions alone do not prove the token can write)."
            : "Token is READ-ONLY — publishing is disabled. Grant Contents: Read and write.";
        } else {
          github_note = "Token valid; write access could not be determined.";
        }
      } else if (res.status === 404) {
        github_note = "Token cannot see the website repo.";
      } else if (res.status === 401) {
        github_note = "Token is invalid or revoked.";
      } else {
        github_note = `GitHub API returned ${res.status}.`;
      }
    } catch {
      github_note = "Could not reach GitHub.";
    }
  }

  return json(200, { supabase, github, github_push, github_note, time: new Date().toISOString() });
};
