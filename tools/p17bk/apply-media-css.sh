#!/bin/sh
cd "$(dirname "$0")/../../frontend-v1"
grep -q "md-stats" admin/admin.css || cat >> admin/admin.css <<'E'
/* P17 C9 media library */
.md-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}
.md-stat{display:flex;gap:12px;align-items:center;padding:14px 16px;text-align:left;cursor:pointer;font:inherit;color:inherit;border:1px solid var(--line);transition:border-color .15s,box-shadow .15s}
.md-stat:disabled{cursor:default}.md-stat:not(:disabled):hover{border-color:#b8956a}.md-stat.on{border-color:#b8956a;box-shadow:0 0 0 3px rgba(184,149,106,.18)}
.md-stat>i{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:rgba(184,149,106,.14);color:#8a6a43;flex:none}.md-stat>i svg{width:20px;height:20px}
.md-stat span{display:flex;flex-direction:column;min-width:0}.md-stat small{color:var(--muted,#667085);font-size:12px}.md-stat b{font-size:20px;line-height:1.2}.md-stat em{font-style:normal;font-size:11.5px;color:var(--muted,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.md-tools select{width:auto}.md-view button{padding:6px 9px}.md-view svg{width:16px;height:16px}
.md-list{padding:0;overflow:auto}.md-tbl td{vertical-align:middle}.md-tbl tr.md-card{cursor:pointer}.md-tbl tr.sel{background:rgba(184,149,106,.1)}
.md-lf{display:flex;align-items:center;gap:10px;min-width:220px}.md-lf img{width:44px;height:44px;object-fit:cover;border-radius:6px;background:#f2f2f2;flex:none}.md-lf b{font-weight:500;font-size:13px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.md-alt{display:inline-block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.md-bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cr-stage{position:relative;margin:12px auto;max-width:100%;width:fit-content;user-select:none;touch-action:none;background:#111}.cr-stage img{display:block;max-width:100%;max-height:58vh}
.cr-box{position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;outline:1px dashed rgba(12,22,40,.6)}
.cr-box::before,.cr-box::after{content:"";position:absolute;inset:33.33% 0;border-block:1px solid rgba(255,255,255,.35);pointer-events:none}.cr-box::after{inset:0 33.33%;border-block:0;border-inline:1px solid rgba(255,255,255,.35)}
.cr-h{position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;border-radius:50%;background:#b8956a;border:2px solid #fff;cursor:nwse-resize}
.cr-row{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.cr-row label{display:flex!important;align-items:center;gap:8px;margin:0!important}.cr-row input[type=number]{width:90px;margin:0}
@media(max-width:1100px){.md-stats{grid-template-columns:repeat(3,1fr)}}@media(max-width:640px){.md-stats{grid-template-columns:1fr 1fr}}
E
echo css
