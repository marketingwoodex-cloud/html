// _page-render.mjs — splice meta + rendered <main> into a live page shell.
// MUST stay algorithmically identical to tools/blocks-convert.py::render_page
// (the offline converter validates byte-parity with this pipeline).

export const contentDir = (slug) =>
  `content/pages/${slug === "/" ? "home" : String(slug).replace(/^\/+|\/+$/g, "")}`;

const spliceRe = (html, rx, repl) => html.replace(rx, repl);

export function renderBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && !b.hidden && typeof b.html === "string")
    .map((b) => b.html)
    .join("");
}

export function renderPage(liveHtml, meta, blocks) {
  if (!/<main\b[^>]*>/i.test(liveHtml) || !liveHtml.includes("</main>")) {
    throw new Error("Live page has no <main> element to render into.");
  }
  const inner = renderBlocks(blocks);
  let out = liveHtml.replace(
    /(<main\b[^>]*>)[\s\S]*?(<\/main>)/i,
    (_m, open, close) => open + inner + close
  );
  const t = meta && meta.title ? String(meta.title) : "";
  const d = meta && meta.description ? String(meta.description) : "";
  const c = meta && meta.canonical ? String(meta.canonical) : "";
  if (t) {
    out = spliceRe(out, /<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
    out = spliceRe(out, /(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`);
    out = spliceRe(out, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`);
  }
  if (d) {
    out = spliceRe(out, /(<meta name="description" content=")[^"]*(")/, `$1${d}$2`);
    out = spliceRe(out, /(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
    out = spliceRe(out, /(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`);
  }
  if (c) {
    if (/<link rel="canonical" href="/.test(out)) {
      out = spliceRe(out, /(<link rel="canonical" href=")[^"]*(")/, `$1${c}$2`);
    } else {
      out = out.replace("</head>", `<link rel="canonical" href="${c}" />\n</head>`);
    }
    out = spliceRe(out, /(<meta property="og:url" content=")[^"]*(")/, `$1${c}$2`);
  }
  return out;
}

// Sanity checks for editor-supplied HTML. Trust model matches cms-save:
// any writer is a session-authenticated CMS user who can already publish
// full page HTML (with scripts) — so this is structural hygiene, not the
// security boundary (auth is). <script> is allowed because app pages like
// /estimator/ keep their logic inside <main>.
export function sanitizeBlockHtml(html) {
  const s = String(html ?? "");
  if (s.length > 400_000) throw new Error("Block HTML too large (400KB max).");
  if (/<\s*\/?\s*(html|head|body)\b/i.test(s)) {
    throw new Error("Block HTML cannot contain document-level tags.");
  }
  return s;
}

export function validateBlocks(blocks) {
  if (!Array.isArray(blocks)) throw new Error("blocks must be an array.");
  if (blocks.length > 200) throw new Error("Too many blocks (200 max).");
  const ids = new Set();
  return blocks.map((b, i) => {
    if (!b || typeof b !== "object") throw new Error(`Block ${i}: not an object.`);
    const type = typeof b.type === "string" && b.type ? b.type : "raw";
    const id = typeof b.id === "string" && /^[a-z0-9_-]{4,40}$/i.test(b.id)
      ? b.id
      : `blk${Date.now().toString(36)}${i}`;
    if (ids.has(id)) throw new Error(`Duplicate block id: ${id}`);
    ids.add(id);
    const base = {
      id,
      type,
      ...(b.hidden ? { hidden: true } : {}),
      html: sanitizeBlockHtml(b.html),
    };
    // Structured editing layer (typed blocks). html remains the publish
    // source of truth; fields only drive the editor's regeneration step.
    if (b.fields !== undefined && b.fields !== null) {
      if (typeof b.fields !== "object" || Array.isArray(b.fields)) {
        throw new Error(`Block ${i}: fields must be an object.`);
      }
      const fs = JSON.stringify(b.fields);
      if (fs.length > 120_000) throw new Error(`Block ${i}: fields too large.`);
      base.fields = b.fields;
    }
    return base;
  });
}

export function validateMeta(meta, slug) {
  const m = meta && typeof meta === "object" ? meta : {};
  const title = String(m.title || "").trim().slice(0, 180);
  const description = String(m.description || "").trim().slice(0, 400);
  const canonical = String(m.canonical || `https://woodex.com.pk${slug}`).slice(0, 300);
  if (!title) throw new Error("Meta title is required.");
  if (/[<>]/.test(title) || /[<>]/.test(description)) throw new Error("Meta tags cannot contain < >.");
  return { title, description, canonical };
}
