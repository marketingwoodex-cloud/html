#!/bin/sh
# P17 templates CSS (idempotent)
F="$(dirname "$0")/../../frontend-v1/assets/site.css"
grep -q "P17 templates: table of contents" "$F" && exit 0
cat >> "$F" <<'E'
/* P17 templates: table of contents + hero variants */
.dx-toc{border:1px solid rgba(12,22,40,.1);border-radius:16px;padding:18px 22px;margin:0 0 32px;background:#fbf9f5}
.dx-toc p{margin:0 0 8px;font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a6a43}
.dx-toc ol{margin:0;padding-left:20px;display:grid;gap:6px}.dx-toc a{color:#0c1628;text-decoration:none}.dx-toc a:hover{color:#8a6a43;text-decoration:underline}
.dx-main h2[id]{scroll-margin-top:110px}
.dx-hero--media{padding-bottom:150px}
.dx-hero--media+.dx-wrap .dx-hero-media img{display:block;width:100%;height:auto;aspect-ratio:16/8;object-fit:cover}
E
