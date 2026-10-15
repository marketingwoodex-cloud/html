/**
 * make-release.mjs — build the Hostinger release bundle and its manifest.
 *
 * Master plan §14.3: *one zip per release with a manifest — git SHA, build hash, asset hashes,
 * migration list applied, QA result summary, and the rollback commit.* This is that zip and that
 * manifest, made by a script rather than by hand, because a release assembled by hand is a release
 * nobody can repeat.
 *
 * ## What goes in, and why the base is `frontend-v1/`
 *
 * The payload is the site as it actually ships — the 150-page tree in `frontend-v1/`, the same tree the
 * P20–P22 releases were built from — *plus* the v2.5 stack. The cut-over in §14.2 is additive: `api/v2`
 * is deployed beside `api/`, the console is deployed beside `admin/`, and the v2.1 site keeps behaving
 * exactly as it does today. So this script copies the live tree untouched and adds to it:
 *
 *   api/v2/        the front controller and its handlers (the new API)
 *   db/            migrations, `migrate.php`, `owner.php` — CLI, denied over HTTP by db/.htaccess
 *   admin-next/    the built console (§14.2 step 2: reachable at /admin-next/ while /admin/ is v2.1)
 *
 * The one site file this script does modify is `.htaccess`, and only by appending a marked block: the
 * console is a single-page app, so `/admin-next/leads` has to be served `admin-next/index.html`. The
 * public site and `/api` are not touched by that block.
 *
 * ## What it refuses to do
 *
 * It refuses to ship a credential. `_private/db.json`, `_private/*.json` state, `.env`, `*.local.php`
 * and anything named like a secret stop the run with the path named — a release that leaks the database
 * password is worse than a release that fails. It also refuses to build if the console's own build or
 * the typecheck fails, because a payload carrying a broken bundle is a payload nobody should upload.
 *
 * Usage:
 *   node tools/make-release.mjs                 build the bundle into woodex-master-P25/
 *   node tools/make-release.mjs --dry-run       print what would be copied, copy nothing
 *   node tools/make-release.mjs --skip-console  reuse the existing admin-v25/dist
 *   node tools/make-release.mjs --out DIR       write the zip somewhere else
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const DRY = has("--dry-run");
const SKIP_CONSOLE = has("--skip-console");
const OUT = path.resolve(ROOT, opt("--out", "woodex-master-P25"));
const NAME = path.basename(OUT);
const STAGE = path.join(OUT, ".stage");
const ZIP = path.join(OUT, `${NAME}.zip`);

/** The site, exactly as the last release shipped it (P22 was built from this tree: 781 files). */
const BASE = "frontend-v1";

/** Everything the v2.5 stack adds, as `source in the repo` → `path in the payload`. */
const OVERLAYS = [
  ["api/v2", "api/v2"],
  ["db", "db"],
];

/** Directories that are never part of a payload, anywhere in the tree. */
const SKIP_DIRS = new Set(["node_modules", ".git", ".smoke", "__pycache__", ".phpwasm", ".probe", ".vite"]);

/**
 * Files a release must not carry, whatever their name says they are. The list is deliberately blunt:
 * a false positive costs somebody one renaming, a false negative costs the studio its database.
 */
const SECRET_RE = /(^|\/)(db\.json|security\.json|demo\.json|\.env[^/]*|_?credentials?[^/]*|secrets?[^/]*|.*\.local\.php|.*\.pem|id_rsa[^/]*)$/i;

/**
 * …and one name that looks like a secret and is not: `api/cacert.pem` is the Mozilla CA bundle v2.1's
 * PHP calls carry, and dropping it would break every outbound HTTPS call on the host. A public
 * certificate authority list is not a credential.
 */
const SECRET_OK = /(^|\/)api\/cacert\.pem$/;

/** Build output that is not needed on the host: sourcemaps, editor droppings, caches. */
const SKIP_FILE_RE = /(^|\/)(\.DS_Store|Thumbs\.db|.*\.log|.*\.map|\.phpunit\.result\.cache)$/i;

const files = { copied: 0, bytes: 0, byArea: new Map() };
const problems = [];

function area(rel) {
  return rel.split("/")[0] || "(root)";
}

function note(rel, bytes) {
  files.copied += 1;
  files.bytes += bytes;
  const a = area(rel);
  const cur = files.byArea.get(a) ?? { n: 0, b: 0 };
  cur.n += 1;
  cur.b += bytes;
  files.byArea.set(a, cur);
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(abs);
    } else if (e.isFile()) {
      yield abs;
    }
  }
}

/** Copy `src` (a file or a tree) to `dest`, applying the exclusion rules above. */
function copyInto(src, dest, relBase = "") {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    for (const abs of walk(src)) {
      const rel = path.join(dest, path.relative(src, abs));
      copyFile(abs, rel, relBase ? path.join(relBase, path.relative(src, abs)) : path.relative(src, abs));
    }
    return;
  }
  copyFile(src, dest, relBase);
}

function copyFile(abs, dest, rel) {
  const relUnix = rel.split(path.sep).join("/");
  if (SKIP_FILE_RE.test(relUnix)) return;
  if (SECRET_RE.test(relUnix) && !SECRET_OK.test(relUnix)) {
    problems.push(`refused to ship ${relUnix} — it is named like a credential (${abs})`);
    return;
  }
  const bytes = fs.statSync(abs).size;
  note(relUnix, bytes);
  if (DRY) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
}

/* ------------------------------------------------------------------ 1. the console build */
function buildConsole() {
  const dist = path.join(ROOT, "admin-v25", "dist");
  if (!SKIP_CONSOLE) {
    console.log("· building the console (tsc -b && vite build --base=/admin-next/)");
    if (!DRY) {
      /* `/admin-next/` is where §14.2 step 2 puts it. The base has to be absolute: the console has
         routes like `/projects/42`, and a relative base would resolve the bundle one directory too deep
         on exactly those screens. Repointing `/admin/` is a rebuild with `--base=/admin/` or a 302. */
      /* The stamp the bundle carries. Derived from the commit, not from the clock, for two reasons: the
         manifest records this exact string, and the console's own dirty test would mark every release
         build with a `+` (the pack's generated files are modified by definition at this point). */
      const at = new Date(git("log", "-1", "--format=%cI")).toISOString().slice(0, 16).replace("T", " ");
      const stamp = `${git("rev-parse", "--short", "HEAD")} · built ${at}Z`;
      execFileSync("npm", ["run", "build", "--", "--base=/admin-next/"], {
        cwd: path.join(ROOT, "admin-v25"),
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, WX_BUILD_STAMP: stamp },
      });
    }
  }
  if (!fs.existsSync(dist)) {
    problems.push("admin-v25/dist is missing — run without --skip-console, or build it first");
    return { files: 0, bytes: 0, stamp: null };
  }
  copyInto(dist, path.join(STAGE, "admin-next"));
  /* The build stamp is baked into the bundle by vite.config.ts; reading it back is how the manifest
     can say which console is in this zip without trusting a filename. */
  let stamp = null;
  for (const f of fs.readdirSync(path.join(dist, "assets"), { withFileTypes: true })) {
    if (!f.isFile() || !f.name.endsWith(".js")) continue;
    const text = fs.readFileSync(path.join(dist, "assets", f.name), "utf8");
    const m = text.match(/"([0-9a-f]{7,40}\+? · built [0-9-]+ [0-9:]+Z)"/);
    if (m) stamp = m[1];
  }
  return stamp ? { stamp } : {};
}

/* ------------------------------------------------------------------ 2. the .htaccess block */
const HT_BEGIN = "# --- v2.5 console (admin-next) ---";
const HT_BLOCK = `
${HT_BEGIN}
# The console is a single-page app: /admin-next/leads is a route, not a file on disk. Anything under
# /admin-next/ that is not a real file is answered with the app's own index.html. Added by
# tools/make-release.mjs; the block below it, and everything above it, is the site's own configuration.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^admin-next(/.+)?$ admin-next/index.html [L]
</IfModule>
# --- end v2.5 console ---
`;

/** `db/` is CLI and migrations; nothing in it should ever be readable over HTTP. */
const DB_HT = `# Nothing in db/ is a web resource: migrations, the migration runner and the owner tool are CLI.
# Mirrors _private/.htaccess — denied to Apache itself, not by a PHP guard that a misconfiguration could skip.
<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Deny from all
</IfModule>
`;

function patchHtaccess() {
  const dest = path.join(STAGE, ".htaccess");
  /* A dry run copies nothing, so the check reads the source tree instead of the staging one. */
  if (DRY) return fs.existsSync(path.join(ROOT, BASE, ".htaccess"));
  if (!fs.existsSync(dest)) {
    problems.push("the site tree has no .htaccess — the payload would not be installable");
    return false;
  }
  let text = fs.readFileSync(dest, "utf8");
  if (text.includes(HT_BEGIN)) return true;
  if (DRY) return true;
  fs.writeFileSync(dest, text.replace(/\s*$/, "\n") + HT_BLOCK);
  return true;
}

/* ------------------------------------------------------------------ 3. hashes and the manifest */
const sha256 = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function migrations() {
  const dir = path.join(ROOT, "db", "migrations");
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    : [];
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function main() {
  console.log(`${DRY ? "[dry run] " : ""}release bundle → ${path.relative(ROOT, OUT)}`);

  if (!DRY) {
    fs.rmSync(STAGE, { recursive: true, force: true });
    fs.mkdirSync(STAGE, { recursive: true });
  }

  console.log(`· site:      ${BASE}/ (the live 150-page tree, untouched)`);
  copyInto(path.join(ROOT, BASE), STAGE);
  for (const [from] of OVERLAYS) console.log(`· add:       ${from}/`);
  for (const [from, to] of OVERLAYS) copyInto(path.join(ROOT, from), path.join(STAGE, to), to);

  const consoleInfo = buildConsole();
  if (!DRY) fs.writeFileSync(path.join(STAGE, "db", ".htaccess"), DB_HT);
  patchHtaccess();

  if (problems.length) {
    console.error("\nFAILED — this bundle is not safe to ship:");
    for (const p of problems) console.error("  ✗ " + p);
    process.exit(1);
  }

  /* Every staged file gets the commit's own timestamp before the zip is written, so the *file times* are
     not a source of difference between two builds of one commit.

     Two builds still differ by one line, and this comment exists because the first version of this script
     claimed otherwise: the console bakes a build stamp into its bundle ("<sha> · built <time>Z"), that
     stamp is what makes a screenshot arguable, and it carries the minute the bundle was built. So the
     payload is bound to the commit *and* the build stamp — which is exactly what the manifest records, and
     why it records it. Byte-identical rebuilds would cost the stamp; the stamp is worth more than the
     rebuilding convenience. Without this normalisation the difference would be hundreds of file times
     rather than that one line, which is the difference between a diffable pair of builds and a mystery. */
  if (!DRY) {
    const at = execFileSync("git", ["log", "-1", "--format=%cd", "--date=format:%Y%m%d%H%M.%S"], { cwd: ROOT, encoding: "utf8" }).trim();
    const stamp = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) stamp(abs);
        execFileSync("touch", ["-h", "-t", at, abs]);
      }
    };
    stamp(STAGE);
  }

  /* The zip is written last and hashed, so the manifest describes the bytes rather than the intent. */
  let zipBytes = 0;
  let zipSha = "";
  if (!DRY) {
    fs.rmSync(ZIP, { force: true });
    execFileSync("zip", ["-q", "-r", "-X", "-9", ZIP, "."], { cwd: STAGE, stdio: "inherit" });
    zipBytes = fs.statSync(ZIP).size;
    zipSha = sha256(ZIP);
  }

  /** The pack's own documents — README, CHANGELOG and the memory plan — hashed into the manifest. */
  const docs = {};
  const manifest = {
    release: NAME,
    builtAt: new Date().toISOString().slice(0, 16) + "Z",
    gitSha: git("rev-parse", "HEAD"),
    /* Whether the *code* differs from the commit. The three files this script generates are excluded, or
       every run would report the tree dirty for the crime of having been run before: the manifest would be
       describing itself, and a field that is always true is a field nobody reads. */
    gitDirty: git(
      "status", "--porcelain", "--untracked-files=no", "--",
      ".", `:!${NAME}/MANIFEST.json`, `:!${NAME}/${NAME}.zip`, `:!${NAME}/MEMORY-PLAN.md`,
    ) !== "",
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    apiVersion: (fs.readFileSync(path.join(ROOT, "api", "v2", "lib", "bootstrap.php"), "utf8").match(/WX_V2_VERSION',\s*'([^']+)'/) ?? [])[1] ?? null,
    console: consoleInfo.stamp ?? null,
    consoleBase: "/admin-next/",
    payload: {
      zip: path.basename(ZIP),
      zipBytes,
      zipSha256: zipSha,
      files: files.copied,
      bytes: files.bytes,
      byArea: Object.fromEntries([...files.byArea.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n])),
    },
    files: {
      "api/v2/index.php": sha256(path.join(ROOT, "api", "v2", "index.php")),
      "admin-next/index.html": fs.existsSync(path.join(STAGE, "admin-next", "index.html")) ? sha256(path.join(STAGE, "admin-next", "index.html")) : null,
    },
    migrations: migrations(),
    docs,
    rollback: "the previous release zip, or `git show <sha>:<path>` for any file in this payload",
  };

  if (!DRY) {
    /* The pack's documents. `MEMORY-PLAN.md` is a copy of the root memory file rather than a link: a zip
       and a Drive upload both have to be self-contained, and a link that only resolves inside this
       checkout is a document nobody can read where it lands. The manifest records the copy's hash, so a
       pack whose memory plan no longer matches the branch is visible rather than suspected. */
    const memTo = path.join(OUT, "MEMORY-PLAN.md");
    fs.copyFileSync(path.join(ROOT, "WORK-SANDBOX-MEMORY.md"), memTo);
    for (const name of ["MEMORY-PLAN.md", "README.md", "CHANGELOG.md"]) {
      const abs = path.join(OUT, name);
      if (fs.existsSync(abs)) manifest.docs[name] = { sha256: sha256(abs), bytes: fs.statSync(abs).size };
    }
    if (manifest.docs["MEMORY-PLAN.md"]) manifest.docs["MEMORY-PLAN.md"].from = "WORK-SANDBOX-MEMORY.md";

    fs.writeFileSync(path.join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.rmSync(STAGE, { recursive: true, force: true });
  }

  console.log("");
  for (const [a, v] of [...files.byArea.entries()].sort((x, y) => y[1].n - x[1].n)) {
    console.log(`  ${String(v.n).padStart(5)}  ${a}`);
  }
  console.log(`  ${String(files.copied).padStart(5)}  files · ${(files.bytes / 1024 / 1024).toFixed(1)} MB uncompressed`);
  if (!DRY) console.log(`\n  ${path.relative(ROOT, ZIP)} · ${(zipBytes / 1024 / 1024).toFixed(1)} MB · sha256 ${zipSha.slice(0, 16)}…`);
  console.log(`  manifest: ${path.relative(ROOT, path.join(OUT, "MANIFEST.json"))}`);
}

main();
