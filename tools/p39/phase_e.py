"""Phase E: replace unconfirmed claims with safe wording (1R 2R 3R 4R 5R 6C 7K 8K 9K 10C 11K).
Idempotent. Runs on frontend-v1 public HTML (not admin/builder). Budget <option>s are left alone
(they describe the customer's budget, not a Woodex claim)."""
import re, sys, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2] / "frontend-v1"
QUOTE = "Fees are set in a written, itemised quote after a site visit."
PRICE = re.compile(r"(?:rs\.?|pkr)\s?[0-9]", re.I)

PHRASES = [
    # 2 free
    ("Get a Free Consultation", "Book a Consultation"),
    ("Free initial consultation and basement assessment", "Initial consultation and basement assessment on request"),
    ("Free initial consultation.", "Initial consultation on request."),
    ("The initial consultation is free.", "Start with an initial consultation."),
    ("Book a free Woodex consultation", "Book a Woodex consultation"),
    ("book a free consultation", "book a consultation"),
    ("Book a free consultation", "Book a consultation"),
    ("Book a Free Consultation", "Book a Consultation"),
    ("a free consultation", "a consultation"),
    ("Free consultation", "Consultation"), ("free consultation", "consultation"),
    ("Free Consultation", "Consultation"),
    ("Free Woodex consultation.", "Book a Woodex consultation."),
    ("Free condition survey", "Condition survey"),
    ("free site visit", "site visit"), ("Free site visit", "Site visit"), ("Free Site Visit", "Site Visit"),
    ("free quote", "written quote"), ("Free quote", "Written quote"), ("Free Quote", "Written Quote"),
    # 3
    ("fixed room-by-room pricing", "an itemised room-by-room quote"),
    # 5 warranty
    ("<strong>1 year</strong>workmanship warranty", "<strong>Itemised</strong>written quotes"),
    ("What warranty do you provide?", "What aftercare do you provide?"),
    ("Quality Warranty", "Quality Checks"),
    ("documentation and warranties", "documentation and handover"),
    ("quality checks and warranty", "quality checks and handover"),
    # 6 4K
    ("Photoreal 4K views", "Photoreal 3D views"), ("photoreal 4K views", "photoreal 3D views"),
    ("See every room in 4K", "See every room in photoreal 3D"),
    # 10 showroom
    ("Our showroom and material library are at", "Our studio is at"),
    ("Our design team, showroom and material library are all here", "Our design studio is here"),
    ("the showroom at Zainab Tower and the material library our projects are specified from", "our studio at Zainab Tower"),
]
SENT = re.compile(r"[^.!?<>\"]*[.!?]?")

def fix_sentences(text, test, repl):
    out, last = [], None
    for m in re.finditer(r".+?(?:[.!?](?=\s+[A-Z(\"]|\s*$)|$)\s*", text, re.S):
        s = m.group(0)
        if test(s):
            if last == repl:
                continue
            tail = re.match(r".*?(\s*)$", s, re.S).group(1)
            out.append(repl + (tail or " ")); last = repl
        else:
            out.append(s); last = None
    return "".join(out).rstrip() + (" " if text.endswith(" ") else "")

WARR = re.compile(r"warrant|guarantee", re.I)
TIME = re.compile(r"typically \d", re.I)
FREE = re.compile(r"\b(?:are|is) free\b", re.I)

def seg_fix(seg):
    """seg: plain text (no tags/quotes)."""
    if PRICE.search(seg):
        stripped = seg.strip()
        if len(stripped) < 30 and not stripped.endswith("."):
            return "On quote"
        seg = fix_sentences(seg, lambda s: bool(PRICE.search(s)), QUOTE)
    if WARR.search(seg):
        seg = fix_sentences(seg, lambda s: bool(WARR.search(s)), "Aftercare terms are written into your contract before work starts.")
    if FREE.search(seg):
        seg = fix_sentences(seg, lambda s: bool(FREE.search(s)) and bool(re.search(r"consult|visit|assess|quot|survey", s, re.I)), "Start with a consultation and site assessment.")
    if TIME.search(seg):
        stripped = seg.strip()
        if len(stripped) < 60:
            return "Programme agreed before work starts"
        seg = fix_sentences(seg, lambda s: bool(TIME.search(s)), "The programme is agreed before work starts.")
    return seg

def hit(t):
    return bool(PRICE.search(t) or WARR.search(t) or TIME.search(t) or FREE.search(t))

def process(html):
    for a, b in PHRASES:
        html = html.replace(a, b)
    # protect <option> budget ranges
    opts = {}
    def keep(m):
        k = f"\x00{len(opts)}\x00"; opts[k] = m.group(0); return k
    # JSON-LD: parse and walk
    def ld(m):
        try: data = json.loads(m.group(2))
        except Exception: return m.group(0)
        def walk(x):
            if isinstance(x, dict): return {k: walk(v) for k, v in x.items()}
            if isinstance(x, list): return [walk(v) for v in x]
            if isinstance(x, str) and hit(x): return seg_fix(x).strip()
            return x
        return m.group(1) + json.dumps(walk(data), ensure_ascii=False, separators=(",", ":")) + m.group(3)
    html = re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)', ld, html, flags=re.S)
    html = re.sub(r"<option[^>]*>[^<]*</option>", keep, html)
    html = re.sub(r"<script\b.*?</script>|<style\b.*?</style>", keep, html, flags=re.S)
    # text nodes
    html = re.sub(r">([^<>]+)<", lambda m: ">" + (seg_fix(m.group(1)) if (hit(m.group(1))) else m.group(1)) + "<", html)
    # attributes
    html = re.sub(r'((?:content|title|alt|aria-label)=")([^"]*)(")', lambda m: m.group(1) + (seg_fix(m.group(2)).strip() if hit(m.group(2)) else m.group(2)) + m.group(3), html)
    for k, v in opts.items():
        html = html.replace(k, v)
    return html

changed = 0
for p in ROOT.rglob("*.html"):
    rel = p.relative_to(ROOT).as_posix()
    if rel.startswith(("admin/", "builder/")):
        continue
    t = p.read_text(encoding="utf-8")
    n = process(t)
    if n != t:
        p.write_text(n, encoding="utf-8"); changed += 1
print("changed", changed)
