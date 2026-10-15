#!/bin/sh
# P17 C8 testimonial design CSS (idempotent)
cd "$(dirname "$0")/../../frontend-v1"
grep -q "wx-tst--spotlight" assets/v1.css || cat >> assets/v1.css <<'E'
/* P17 C8: testimonial designs (cards = default above) */
.wx-tst-avg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0 0;color:var(--wx-muted);font-size:.92rem}.wx-tst-avg b{font-size:1.6rem;color:var(--wx-navy);line-height:1}.wx-tst-avg .wx-stars{color:#b8956a;display:inline-block}
.wx-tst-card.is-big blockquote{font-size:clamp(1.2rem,2.1vw,1.6rem);line-height:1.45;letter-spacing:-.01em}
.wx-tst-card.is-big blockquote::before{content:"\201C";display:block;font-size:3.6rem;line-height:.6;color:#b8956a;margin-bottom:8px}
.wx-tst-card.is-big figcaption img,.wx-tst-card.is-big .wx-av{width:64px;height:64px}
.wx-tst-spot{display:grid;grid-template-columns:1.25fr 1fr;gap:var(--s-3);align-items:stretch}
.wx-tst-spot>.is-big{padding:clamp(24px,4vw,44px)}
.wx-tst-side{display:grid;gap:var(--s-3)}.wx-tst-side .wx-tst-card{padding:var(--s-3)}.wx-tst-side blockquote{font-size:.97rem}
.wx-tst-track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(300px,calc((100% - 2*var(--s-3))/3));gap:var(--s-3);overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 18px;scrollbar-width:thin;scrollbar-color:#b8956a transparent}
.wx-tst-track>.wx-tst-card{scroll-snap-align:start}.wx-tst-track:focus-visible{outline:2px solid #b8956a;outline-offset:4px}
.wx-tst-wall{columns:3 280px;column-gap:var(--s-3)}.wx-tst-wall>.wx-tst-card{break-inside:avoid;margin:0 0 var(--s-3);display:flex}
.wx-tst-wall>.wx-tst-card:nth-child(3n+2){background:var(--wx-navy);border-color:var(--wx-navy)}.wx-tst-wall>.wx-tst-card:nth-child(3n+2) blockquote,.wx-tst-wall>.wx-tst-card:nth-child(3n+2) b{color:#fff}.wx-tst-wall>.wx-tst-card:nth-child(3n+2) .wx-stars{color:#b8956a}.wx-tst-wall>.wx-tst-card:nth-child(3n+2) figcaption{border-color:rgba(255,255,255,.14)}.wx-tst-wall>.wx-tst-card:nth-child(3n+2) small{color:rgba(255,255,255,.65)}
.wx-tst--band{background:var(--wx-navy);color:#fff}
.wx-tst--band .wx-kicker,.wx-tst--band .wx-tst-avg{color:rgba(255,255,255,.7)}.wx-tst--band h2,.wx-tst--band .wx-tst-avg b{color:#fff}
.wx-tst-band>.is-big{background:transparent;border:0;padding:0 0 var(--s-4);max-width:900px}.wx-tst-band>.is-big blockquote,.wx-tst-band>.is-big b{color:#fff}.wx-tst-band>.is-big figcaption{border-color:rgba(255,255,255,.14)}.wx-tst-band small{color:rgba(255,255,255,.65)!important}
.wx-tst-band .wx-stars{color:#b8956a}.wx-tst-band .wx-av{background:#b8956a!important}
.wx-tst-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3)}.wx-tst-row .wx-tst-card{background:#152033;border-color:rgba(255,255,255,.08)}.wx-tst-row blockquote,.wx-tst-row b{color:#fff}.wx-tst-row figcaption{border-color:rgba(255,255,255,.1)}
@media(max-width:1000px){.wx-tst-spot{grid-template-columns:1fr}.wx-tst-row{grid-template-columns:1fr 1fr}.wx-tst-track{grid-auto-columns:minmax(280px,46%)}}
@media(max-width:640px){.wx-tst-row{grid-template-columns:1fr}.wx-tst-track{grid-auto-columns:86%}}
E
grep -q "tst-pick" admin/admin.css || cat >> admin/admin.css <<'E'
/* P17 C8 testimonial design picker */
.tst-pick{margin:4px 0 14px;padding:14px;border:1px solid var(--line);border-radius:12px}
.tst-ds{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0}
.tst-d{display:flex!important;flex-direction:column;gap:3px;padding:8px;border:1.5px solid var(--line);border-radius:10px;cursor:pointer;font-size:12.5px!important;font-weight:600}
.tst-d input{display:none}.tst-d small{font-weight:400;color:var(--muted,#667085);line-height:1.3}.tst-d.on{border-color:#b8956a;box-shadow:0 0 0 3px rgba(184,149,106,.2)}
.tst-ic{display:grid;gap:3px;height:40px;padding:5px;border-radius:6px;background:#f4efe7;grid-template-columns:repeat(3,1fr)}.tst-ic s{display:block;border-radius:3px;background:#fff;border:1px solid rgba(12,22,40,.12)}
.tst-ic-spotlight{grid-template-columns:1.4fr 1fr;grid-template-rows:1fr 1fr}.tst-ic-spotlight s:first-child{grid-row:1/3;background:#0c1628}
.tst-ic-slider{grid-template-columns:1fr 1fr 1fr .4fr}.tst-ic-wall s:nth-child(2){background:#0c1628;transform:translateY(5px)}
.tst-ic-band{background:#0c1628;grid-template-rows:1.3fr 1fr}.tst-ic-band s{background:#152033;border-color:#24324a}.tst-ic-band s:first-child{grid-column:1/4;background:transparent;border:0;border-bottom:2px solid #b8956a;border-radius:0}
.tst-max{display:flex!important;align-items:center;gap:8px;font-size:13px}.tst-max input{width:70px;margin:0}
.tst-pv{margin-top:10px;height:260px;border:1px solid var(--line);border-radius:10px;overflow:hidden}.tst-pv iframe{border:0;width:200%;height:520px;transform:scale(.5);transform-origin:0 0}
.pl-pd{margin:0 0 0 auto!important;width:auto!important;padding:2px 6px!important;font-size:12px!important;height:auto!important}
@media(max-width:900px){.tst-ds{grid-template-columns:repeat(2,1fr)}}
E
echo css
