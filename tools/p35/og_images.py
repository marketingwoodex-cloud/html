#!/usr/bin/env python3
"""P35-A: unique social (og/twitter) image per service page.
1) Any /tmp/gen2/<slug>.jpg is converted to assets/img/svc-<slug>{,-960,-480}.webp (16:9).
2) Each service page gets og:image = svc-<slug> if present, else its unique hub-card image.
3) /services/ hub cards use svc-<slug> when present. Idempotent."""
import os, re, glob, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1")); IMG = os.path.join(ROOT, "assets", "img")
SITE = "https://woodex.com.pk"
try:
    from PIL import Image
    for f in glob.glob("/tmp/gen2/*.jpg"):
        sl = os.path.basename(f)[:-4]; out = os.path.join(IMG, "svc-%s.webp" % sl)
        if os.path.exists(out): continue
        im = Image.open(f).convert("RGB"); w, h = im.size; th = int(w * 9 / 16)
        if th < h: t = (h - th) // 2; im = im.crop((0, t, w, t + th))
        for suf, W in (("", 1600), ("-960", 960), ("-480", 480)):
            im.resize((W, int(W * 9 / 16)), Image.LANCZOS).save(os.path.join(IMG, "svc-%s%s.webp" % (sl, suf)), quality=80)
        print("converted", sl)
except ImportError: pass
hub = os.path.join(ROOT, "services", "index.html"); s = open(hub, encoding="utf-8").read()
cards = re.findall(r'<a class="sv-card[^"]*" href="/([a-z0-9-]+)/"><figure><img[^>]*src="/assets/img/((?:img|ins|svc)-[a-z0-9-]+?)-960\.webp"', s)
seen = set(); done = 0; dup = []
for sl, cur in cards:
    gen = "svc-" + sl
    pick = gen if os.path.exists(os.path.join(IMG, gen + "-960.webp")) else cur
    if pick in seen: dup.append(sl)
    seen.add(pick)
    if pick != cur:
        s = re.sub(r'(<a class="sv-card[^"]*" href="/%s/"><figure><img[^>]*?)/assets/img/%s(-480|-960)' % (re.escape(sl), re.escape(cur)),
                   lambda m: m.group(1) + "/assets/img/" + pick + m.group(2), s)
        s = re.sub(r'(<a class="sv-card[^"]*" href="/%s/"><figure><img[^>]*?)/assets/img/%s(-480|-960)' % (re.escape(sl), re.escape(cur)),
                   lambda m: m.group(1) + "/assets/img/" + pick + m.group(2), s)
    p = os.path.join(ROOT, sl, "index.html"); t = open(p, encoding="utf-8").read(); o = t
    big = pick if pick.startswith("svc-") else pick
    url = "%s/assets/img/%s.webp" % (SITE, big)
    t = re.sub(r'<meta property="og:image" content="[^"]*"', '<meta property="og:image" content="%s"' % url, t, count=1)
    t = re.sub(r'<meta name="twitter:image" content="[^"]*"', '<meta name="twitter:image" content="%s"' % url, t, count=1)
    if pick.startswith("svc-"): t = re.sub(r'(<meta property="og:image:width" content=")\d+', r"\g<1>1600", t, count=1); t = re.sub(r'(<meta property="og:image:height" content=")\d+', r"\g<1>900", t, count=1)
    if t != o: open(p, "w", encoding="utf-8").write(t); done += 1
open(hub, "w", encoding="utf-8").write(s)
print("pages updated", done, "| still sharing an image:", len(dup), dup)
