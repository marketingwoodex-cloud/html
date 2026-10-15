// _vercel-adapter.mjs — lets the existing Netlify-style CMS functions
// (export default async (req: Request) => Response) run unchanged on Vercel's
// Node.js serverless runtime, which calls (req, res) instead.
// Each file in /api/ is a one-line wrapper around this.
import { issueSession, verifySessionLocal } from "./_auth.mjs";

// Sliding session rotation: when a request succeeds on a session older than
// 6h (but still within its 12h life), issue a fresh token via the
// X-Session-Refresh header. The dashboard swaps it in, so active users are
// never abruptly signed out while idle tokens still expire on time.
const ROTATE_AFTER_MS = 6 * 3600 * 1000;

export function vercelWrap(handler) {
  return async (req, res) => {
    try {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost";
      const url = `${proto}://${host}${req.url || "/"}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers || {})) {
        if (v === undefined) continue;
        try { headers.set(k, Array.isArray(v) ? v.join(", ") : String(v)); } catch {}
      }
      const method = (req.method || "GET").toUpperCase();
      let body;
      if (method !== "GET" && method !== "HEAD") {
        body = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });
      }
      const webReq = new Request(url, { method, headers, body });
      const webRes = await handler(webReq);
      res.statusCode = webRes.status;
      webRes.headers.forEach((v, k) => {
        try { res.setHeader(k, v); } catch {}
      });
      try {
        if (webRes.status < 400) {
          const m = (webReq.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
          const sess = m && verifySessionLocal(m[1]);
          if (sess && sess.iat && Date.now() - sess.iat > ROTATE_AFTER_MS) {
            res.setHeader("x-session-refresh", issueSession(sess.username, sess.role));
          }
        }
      } catch {}
      res.end(Buffer.from(await webRes.arrayBuffer()));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Function failed." }));
    }
  };
}
