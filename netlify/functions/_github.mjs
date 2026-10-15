// Shared GitHub Contents API helpers for the Woodex CMS functions.
const OWNER = process.env.CMS_GITHUB_OWNER || "marketingwoodex-cloud";
const REPO = process.env.CMS_GITHUB_REPO || "-marketingwoodex";
const BRANCH = process.env.CMS_GITHUB_BRANCH || "main";
const API = "https://api.github.com";

const headers = () => ({
  authorization: `Bearer ${process.env.CMS_GITHUB_TOKEN || ""}`,
  accept: "application/vnd.github+json",
  "content-type": "application/json",
  "user-agent": "woodex-cms",
});

// Encode each path segment but keep the slashes: the Contents API treats
// %2F inconsistently, so encodeURIComponent on the whole path is wrong.
const ghPath = (path) => String(path).split("/").map(encodeURIComponent).join("/");

export async function ghGetFile(path) {
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/contents/${ghPath(path)}?ref=${BRANCH}`,
    { headers: headers() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  return res.json();
}

export async function ghPutFile(path, base64Content, message) {
  if (!process.env.CMS_GITHUB_TOKEN) throw new Error("CMS not configured (token missing)");
  const existing = await ghGetFile(path);
  const body = {
    message,
    content: base64Content,
    branch: BRANCH,
  };
  if (existing?.sha) body.sha = existing.sha;
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${ghPath(path)}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try { detail = jsonErrorDetail(JSON.parse(text)); } catch { detail = text.replace(/[\r\n]+/g, " ").slice(0, 140); }
    throw new Error(`GitHub write failed (${res.status}): ${detail}`);
  }
  return res.json();
}

function jsonErrorDetail(j) {
  const msg = (j && j.message ? String(j.message) : "").replace(/[\r\n]+/g, " ").slice(0, 140);
  const errs = Array.isArray(j?.errors) ? j.errors.map((e) => String(e?.message || e?.code || "")).filter(Boolean).join("; ").slice(0, 140) : "";
  return [msg, errs].filter(Boolean).join(" | ");
}

export const toBase64 = (str) => Buffer.from(str, "utf8").toString("base64");

export async function ghDeleteFile(path, message) {
  if (!process.env.CMS_GITHUB_TOKEN) throw new Error("CMS not configured (token missing)");
  const existing = await ghGetFile(path);
  if (!existing?.sha) return { deleted: false };
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${ghPath(path)}`, {
    method: "DELETE",
    headers: headers(),
    body: JSON.stringify({ message, sha: existing.sha, branch: BRANCH }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub delete failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { deleted: true };
}

// Only page HTML files inside the site may be written (never admin/, netlify/, .git/).
// Dashboard-managed JS config (assets/js/site-config.js, assets/js/estimator-rates.js)
// is also writable so Settings can publish to the live site.
export function validPagePath(p) {
  if (typeof p !== "string" || p.length > 200 || p.length === 0) return false;
  if (/[\0-\x1f\x7f\\]/.test(p)) return false; // control chars, backslashes
  const low = p.toLowerCase();
  if (p.includes("..")) return false;
  // Never allow writes inside code/config areas, whatever the extension.
  if (/^(admin|netlify|api|mcp-server|\.git|\.github)\//.test(low)) return false;
  if (p === "assets/js/site-config.js" || p === "assets/js/estimator-rates.js" || p === "assets/js/theme-config.js" || p === "assets/js/nav-config.js") return true;
  if (p === "sitemap.xml" || p === "robots.txt" || p === "vercel.json") return true;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.html$/.test(p)) return false;
  return true;
}
