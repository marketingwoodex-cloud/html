// Rebuild admin/features.html from docs/FEATURES.md: cd ~/.cache/md && npm i marked && node <repo>/tools/features-build.mjs
import { marked } from "marked"; import fs from "fs";
const R="/home/user/-marketingwoodex/"; const md=fs.readFileSync(R+"docs/FEATURES.md","utf8");
const slug=s=>s.toLowerCase().replace(/<[^>]+>/g,"").replace(/[^\w\s-]/g,"").trim().replace(/\s/g,"-");
const toc=[]; const r=new marked.Renderer();
r.heading=function({tokens,depth}){const t=this.parser.parseInline(tokens);const id=slug(t);if(depth===2||depth===3)toc.push([depth,id,t.replace(/<[^>]+>/g,"")]);return `<h${depth} id="${id}">${t}</h${depth}>`;};
const body=marked.parse(md,{renderer:r});
const nav=toc.filter(x=>x[2]!=="Contents").map(([d,id,t])=>`<a class="l${d}" href="#${id}">${t}</a>`).join("");
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Woodex — Feature Guide</title><style>
:root{--n:#0c1628;--g:#b8956a;--c:#f4efe7;--l:#e4e7ec;--m:#667085}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:15px/1.65 "Plus Jakarta Sans",system-ui,Segoe UI,sans-serif;color:#101828;background:#f6f7f9}
nav{position:fixed;inset:0 auto 0 0;width:280px;background:var(--n);color:#cfd6e4;overflow:auto;padding:16px 12px}nav b{display:block;color:#fff;font-size:16px;padding:4px 8px 12px}nav input{width:100%;padding:9px 11px;border-radius:9px;border:1px solid #24324f;background:#16233d;color:#fff;margin-bottom:10px}
nav a{display:block;text-decoration:none;color:inherit;border-radius:7px;padding:5px 9px;font-size:13px}nav a.l2{color:#fff;font-weight:700;margin-top:8px}nav a.l3{padding-left:20px}nav a:hover,nav a.on{background:#16233d}nav a.on{box-shadow:inset 3px 0 0 var(--g)}
main{margin-left:280px;padding:24px 44px 80px;max-width:1100px}h1{font-size:28px}h2{margin-top:44px;padding-top:12px;border-top:2px solid var(--g);font-size:22px}h3{margin-top:26px;font-size:17px;background:#fff;border:1px solid var(--l);border-left:4px solid var(--g);padding:8px 12px;border-radius:8px}
h2,h3{scroll-margin-top:14px}code{background:var(--c);padding:1px 6px;border-radius:5px;font-size:13px}table{border-collapse:collapse;width:100%;background:#fff;font-size:14px;margin:10px 0}th,td{border:1px solid var(--l);padding:8px 10px;text-align:left;vertical-align:top}th{background:var(--n);color:#fff}
blockquote{margin:0;border-left:4px solid var(--g);background:var(--c);padding:8px 14px;border-radius:0 8px 8px 0}a{color:#8a6a40}mark{background:#f8e2b8}.hide{display:none}
@media(max-width:900px){nav{position:static;width:auto}main{margin:0;padding:16px}}@media print{nav{display:none}main{margin:0}}
</style></head><body><nav><b>Woodex Feature Guide</b><input id="q" placeholder="Search features…">${nav}</nav><main id="m">${body}</main><script>
var q=document.getElementById("q"),links=[].slice.call(document.querySelectorAll("nav a"));
q.oninput=function(){var v=q.value.toLowerCase();links.forEach(function(a){var id=a.getAttribute("href").slice(1),h=document.getElementById(id),t=a.textContent.toLowerCase(),n=h,txt=t;while(n&&(n=n.nextElementSibling)&&!/^H[23]$/.test(n.tagName))txt+=" "+n.textContent.toLowerCase();a.classList.toggle("hide",!!v&&txt.indexOf(v)<0)});};
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)links.forEach(function(a){a.classList.toggle("on",a.getAttribute("href")==="#"+e.target.id)})})},{rootMargin:"-10% 0px -80% 0px"});
document.querySelectorAll("h2[id],h3[id]").forEach(function(h){io.observe(h)});
</script></body></html>`;
fs.writeFileSync(R+"frontend-v1/admin/features.html",html); console.log("toc",toc.length);
