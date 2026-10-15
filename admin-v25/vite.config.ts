import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
/* Declared in src/vite-env.d.ts rather than pulled in: this app has no @types/node (the same reason
   `process` below is declared), and one function is all the build stamp needs. */
import { execSync } from "node:child_process";

/* The dev server is proxied under *.e2b.app (and under any hostname a preview uses), so hosts are open
   and it binds 0.0.0.0.

   `/api` is proxied rather than called cross-origin, and that is the point rather than a convenience:
   api/v2 is same-origin by design — no CORS headers at all, a session cookie with SameSite, and a CSRF
   token tied to the cookie. A cross-origin dev server would have to weaken all three to work, and the
   one thing a prototype must not do is behave differently from production in its *security* code. The
   target is configurable so the same app can develop against a local PHP host or a staging one:

     WX_API_TARGET=http://127.0.0.1:8080 npm run dev      (php -S 127.0.0.1:8080 on the repo root)
     WX_API_TARGET=https://woodex.com.pk npm run dev     (the live host, read-only work)
*/
/* `process` exists in this file (vite loads it in Node) but @types/node is not a dependency of a
   browser app — declaring the one member used is cheaper than adding 2 MB of Node typings for it. */
declare const process: {
  env: Record<string, string | undefined>;
  /* one line of stderr when the API is down, instead of a stack trace per request */
  stderr: { write(s: string): void };
};
const API_TARGET = process.env.WX_API_TARGET ?? "http://127.0.0.1:8080";

/**
 * Which build this is.
 *
 * The strip says whether the API is answering; this says *which console* you are looking at. Both were
 * missing once, and the result was a person refreshing a page and arguing with a screenshot: a dev server
 * serves whatever is on disk, a built bundle serves whatever was built, and the two look identical until
 * the bundle names itself. So it does, in the sidebar and on the sign-in card.
 */
const BUILD = (() => {
  /* A release build passes its own stamp. `tools/make-release.mjs` knows the code state — it excludes the
     three artifacts it is about to write from the dirty test — so it can say whether the *code* differs
     from the commit, which `git status` here cannot: by the time a rebuild runs, the pack's own generated
     files are modified and every release bundle would carry a `+` that means nothing. One string, one
     fact: the manifest records the same stamp the bundle shows. */
  const given = process.env.WX_BUILD_STAMP;
  if (given) return given;
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    /* A `+` when the tree is dirty, because "is this the new build?" is usually asked about edits that
       are not committed yet — and a stamp that shows a clean commit over edited files would be worse
       than no stamp at all. */
    /* Tracked edits only: an untracked scratch file is not "the build may differ from the commit", and a
       stamp that cries wolf every time something writes a cache is a stamp nobody reads. */
    const dirty = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
    const at = new Date().toISOString().slice(0, 16).replace("T", " ");
    return `${sha}${dirty ? "+" : ""} · built ${at}Z`;
  } catch {
    /* No git (a tarball, a CI checkout without history) is not a build failure. Say so and carry on. */
    return "unknown build";
  }
})();

/**
 * When the API is not running, say so in the API's own words.
 *
 * Vite's default behaviour is to log a proxy stack trace and answer an empty 500 — which the browser
 * reports as "the server responded with a status of 500", a sentence that sends the reader looking for a
 * bug in the API. This is a development server whose upstream is simply not up (no PHP, no MySQL, or
 * `dev:api` not started), so the truthful answer is an envelope in the same shape the API uses, with a
 * status of 502 and a message naming the command that fixes it.
 *
 * It answers no *data*: `ready: false` with a reason, never a made-up health response. A dev server that
 * invents an API is how a screen ends up looking correct in development and broken on the host.
 */
/* At most one line every 30 seconds, however many requests fail. The health probe and a grid of broken
   images are both "the same fact, repeatedly", and a console full of it hides the next real error. */
let guardNoteAt = 0;

function upstreamGuard(name: string, note = true) {
  return (proxy: { on: (e: string, cb: (...a: any[]) => void) => void }) => {
    proxy.on("error", (err: { code?: string; message?: string }, _req: unknown, res: unknown) => {
      const r = res as { writeHead?: (code: number, headers: Record<string, string>) => void; end?: (b: string) => void; headersSent?: boolean };
      if (!r || typeof r.writeHead !== "function" || r.headersSent) return;
      const down = err?.code === "ECONNREFUSED" || err?.code === "ECONNRESET" || err?.code === "ENOTFOUND";
      const body = JSON.stringify({
        ok: false,
        error: {
          code: "UPSTREAM",
          message: down
            ? `${name} is not answering at ${API_TARGET}. Start it with \`npm run dev:api\` (that needs PHP and a configured MySQL), or set WX_API_TARGET to a running host.`
            : `${name} request failed: ${err?.message ?? "unknown error"}`,
          field: null,
        },
        meta: { requestId: "dev-proxy", target: API_TARGET },
      });
      r.writeHead(down ? 502 : 504, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      r.end?.(body);
      /* One line, not a stack trace: the shell's status strip already says the same thing, and a wall of
         frames on every poll buries the errors that are the developer's. */
      if (note && Date.now() - guardNoteAt > 30_000) {
        guardNoteAt = Date.now();
        process.stderr.write(`\n  [vite] api/v2 is not reachable at ${API_TARGET} — the strip says so, and nothing is invented for it.\n`);
      }
    });
  };
}

/**
 * Replace `__WX_BUILD__` with the stamp, in dev and in every build.
 *
 * `define` is the tidier way to do this and it does not work here: a `define` replacement happens in the
 * same pass that compiles JSX, and the identifier sits inside a JSX expression — where the transform
 * leaves it alone, so the dev server served `v2.5 · ` with nothing after it. A one-hook plugin is a few
 * lines and behaves identically in `vite dev`, `vite build` and the SSR build the smoke test uses.
 */
function buildStampPlugin(): Plugin {
  return {
    name: "wx-build-stamp",
    transform(code: string) {
      if (!code.includes("__WX_BUILD__")) return null;
      return { code: code.replace(/__WX_BUILD__/g, JSON.stringify(BUILD)), map: null };
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), buildStampPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: true, // preview is proxied under *.e2b.app
    cors: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false, secure: false, configure: upstreamGuard("api/v2") },
      /* The media library shows pictures at the addresses the pages use (`/assets/img/…`). They are
         served by the same host in production, and by the dev PHP server (its document root is the
         repository root) in development — so proxying them is what makes the library look the same in
         both. Without it a designer reviews the media screen as a wall of broken images. */
      "/assets": {
        target: API_TARGET,
        changeOrigin: false,
        secure: false,
        /* Same guard, without the note: a grid of images failing is one fact, not forty. */
        configure: upstreamGuard("the site's images", false),
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: "es2020",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Vendor split for the browser build; the SSR/smoke build keeps its
        // dependencies external, so manualChunks must not apply there.
        manualChunks: isSsrBuild
          ? undefined
          : {
              vendor: ["react", "react-dom", "react-router-dom"],
              charts: ["recharts"],
              icons: ["lucide-react"],
            },
      },
    },
  },
}));
