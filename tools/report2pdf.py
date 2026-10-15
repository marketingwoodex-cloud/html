#!/usr/bin/env python3
"""Render a Woodex Markdown report -> branded PDF with fpdf2.

Generalised from tools/md2pdf.py (which is hard-wired to MASTER-PLAN.md) so any
report in this repository can be turned into a print-ready PDF with a cover.

Usage:
    python3 tools/report2pdf.py SRC.md OUT.pdf "Cover title" "Cover subtitle"
        [--meta "Label=Value" ...] [--footer "left text"]

Everything the parser supports: # / ## / ### headings, paragraphs, bullet and
numbered lists, `-` rules, > callouts, fenced code blocks, pipe tables.

Requires: pip install fpdf2   (no other dependency)
"""
import re
import sys
from fpdf import FPDF
from fpdf.enums import XPos, YPos

# ---------------------------------------------------------------- brand palette
NAVY = (10, 15, 30)
CARD = (18, 24, 38)
GOLD = (233, 201, 123)
TEXT = (30, 34, 42)
MUTED = (95, 101, 113)
WHITE = (255, 255, 255)
LINE = (210, 214, 222)
BGFILL = (244, 246, 250)
HEADBG = (10, 15, 30)

# ---------------------------------------------- unicode -> latin-1 safe glyphs
_MAP = {
    "\u2192": "->", "\u2190": "<-", "\u2194": "<->", "\u21d2": "=>",
    "\u2014": "-", "\u2013": "-", "\u2026": "...", "\u2018": "'", "\u2019": "'",
    "\u201c": '"', "\u201d": '"', "\u2022": "-", "\u00b7": "-", "\u2219": "-",
    "\u2248": "~", "\u2265": ">=", "\u2264": "<=", "\u00d7": "x", "\u00f7": "/",
    "\u2225": "||", "\u00a7": "Section ", "\u2318": "Cmd", "\u2713": "OK",
    "\u2714": "OK", "\u2605": "*", "\u2606": "*", "\u26a1": "!", "\U0001f512": "",
    "\U0001f4e6": "", "\U0001f680": "", "\U0001f4ca": "", "\u25b6": ">", "\u25c0": "<",
    "\u2502": "|", "\u2500": "-", "\u2501": "-", "\u250c": "+", "\u2510": "+",
    "\u2514": "+", "\u2518": "+", "\u251c": "+", "\u2524": "+", "\u252c": "+",
    "\u2534": "+", "\u253c": "+", "\u25bc": "v", "\u25b2": "^", "\u2588": "#",
}


def san(s: str) -> str:
    for k, v in _MAP.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


def strip_md(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    return s


# ------------------------------------------------------------------- arguments
argv = sys.argv[1:]
positional, META, FOOTER = [], [], "Woodex Interior - Confidential"
i = 0
while i < len(argv):
    a = argv[i]
    if a == "--meta" and i + 1 < len(argv) and "=" in argv[i + 1]:
        k, v = argv[i + 1].split("=", 1)
        META.append((k.strip(), v.strip()))
        i += 2
    elif a == "--footer" and i + 1 < len(argv):
        FOOTER = argv[i + 1]
        i += 2
    elif a.startswith("--"):
        i += 1
    else:
        positional.append(a)
        i += 1

SRC = positional[0] if len(positional) > 0 else "REPORT.md"
OUT = positional[1] if len(positional) > 1 else SRC.replace(".md", ".pdf")
TITLE = positional[2] if len(positional) > 2 else "Woodex Report"
SUBTITLE = positional[3] if len(positional) > 3 else ""

class Report(FPDF):
    def footer(self):
        if self.page_no() <= 1:
            return
        self.set_y(-12)
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(18, self.get_y(), 192, self.get_y())
        self.set_y(-10)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(120, 5, san(FOOTER), new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(54, 5, f"Page {self.page_no()}", align="R",
                  new_x=XPos.RIGHT, new_y=YPos.TOP)


pdf = Report(format="A4", unit="mm")
pdf.set_auto_page_break(True, margin=16)
pdf.set_margins(18, 16, 18)
EPW = pdf.w - 36  # 174 mm

# ------------------------------------------------------------------------ cover
pdf.add_page()
pdf.set_fill_color(*NAVY)
pdf.rect(0, 0, 210, 297, "F")
pdf.set_fill_color(*GOLD)
pdf.rect(18, 56, 46, 1.6, "F")
pdf.set_text_color(*GOLD)
pdf.set_font("Helvetica", "B", 11)
pdf.set_xy(18, 46)
pdf.cell(0, 6, san("WOODEX INTERIOR  \u00b7  DIGITAL OPERATIONS"))
pdf.set_text_color(*WHITE)
pdf.set_font("Helvetica", "B", 30)
pdf.set_xy(18, 70)
pdf.multi_cell(174, 13.5, san(TITLE))
if SUBTITLE:
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_xy(18, pdf.get_y() + 4)
    pdf.multi_cell(174, 9, san(SUBTITLE))
pdf.set_draw_color(*GOLD)
pdf.set_line_width(0.4)
pdf.line(18, 148, 90, 148)

if META:
    h = 12 + len(META) * 9.5
    y0 = 196 if h < 84 else 260 - h
    pdf.set_fill_color(*CARD)
    pdf.rect(18, y0, 174, h, "F")
    y = y0 + 7
    for k, v in META:
        pdf.set_xy(24, y)
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(*GOLD)
        pdf.cell(34, 8, san(k))
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(235, 238, 244)
        pdf.multi_cell(140, 8, san(v))
        y += 9.5

pdf.set_xy(18, 272)
pdf.set_font("Helvetica", "", 8)
pdf.set_text_color(150, 156, 170)
pdf.cell(0, 5, san("marketingwoodex-cloud/-marketingwoodex  \u00b7  arena branch  \u00b7  Confidential"))
pdf.add_page()

# ----------------------------------------------------------------- pdf helpers
H1_COUNT = [0]


def ensure(mm_needed):
    if pdf.get_y() + mm_needed > pdf.h - 16:
        pdf.add_page()


def heading(level, text, keep=0.0):
    text = san(strip_md(text))
    if level > 1 and keep:
        ensure(keep + (13.5 if level == 2 else 10.0))   # the heading, plus what must follow it
    if level == 1:
        H1_COUNT[0] += 1
        if H1_COUNT[0] > 1:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 17)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(EPW, 8.6, text)
        y = pdf.get_y() + 1.2
        pdf.set_fill_color(*GOLD)
        pdf.rect(18, y, 60, 1.2, "F")
        pdf.set_y(y + 5)
    elif level == 2:
        ensure(18)
        pdf.ln(3.5)
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(EPW, 6.8, text)
        pdf.set_draw_color(*GOLD)
        pdf.set_line_width(0.5)
        pdf.line(18, pdf.get_y() + 0.6, 192, pdf.get_y() + 0.6)
        pdf.ln(3)
    else:
        ensure(12)
        pdf.ln(2.5)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*CARD)
        pdf.multi_cell(EPW, 6.0, text)
        pdf.ln(1.2)


def paragraph(text, size=9.6, color=TEXT):
    pdf.set_font("Helvetica", "", size)
    pdf.set_text_color(*color)
    pdf.multi_cell(EPW, 5.0, san(text.replace("`", "")), markdown=True)
    pdf.ln(1.6)


def bullets(items):
    for it in items:
        ensure(8)
        m = re.match(r"^(\d+)\.\s+(.*)$", it)
        marker, body = (m.group(1) + ".", m.group(2)) if m else ("-", it)
        pdf.set_font("Helvetica", "B", 9.6)
        pdf.set_text_color(*NAVY)
        pdf.set_x(18)
        pdf.cell(7, 5.0, marker)
        pdf.set_font("Helvetica", "", 9.6)
        pdf.set_text_color(*TEXT)
        pdf.multi_cell(EPW - 7, 5.0, san(body.replace("`", "")), markdown=True,
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1.4)


def callout(text):
    pdf.ln(1)
    lines = wrap(san(strip_md(text)), EPW - 10, "", "", 9.6)
    h = len(lines) * 5.0 + 6
    ensure(h + 4)
    y0 = pdf.get_y()
    pdf.set_fill_color(252, 247, 233)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.3)
    pdf.rect(18, y0, EPW, h, "DF")
    pdf.set_fill_color(*GOLD)
    pdf.rect(18, y0, 1.6, h, "F")
    pdf.set_xy(23, y0 + 2.6)
    pdf.set_font("Helvetica", "", 9.4)
    pdf.set_text_color(*TEXT)
    pdf.multi_cell(EPW - 10, 5.0, san(text.replace("`", "")), markdown=True)
    pdf.set_y(y0 + h + 3)


def codeblock(lines_in):
    pdf.set_font("Courier", "", 8.0)
    wrapped = []
    for ln in lines_in:
        wrapped.extend(wrap(san(ln), EPW - 8, "Courier", "", 8.0) or [""])
    h = len(wrapped) * 4.1 + 6
    ensure(h + 4)
    y0 = pdf.get_y()
    pdf.set_fill_color(240, 242, 246)
    pdf.rect(18, y0, EPW, h, "F")
    pdf.set_xy(22, y0 + 3)
    pdf.set_font("Courier", "", 8.0)
    pdf.set_text_color(40, 44, 54)
    for ln in wrapped:
        pdf.cell(EPW - 8, 4.1, ln, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_x(22)
    pdf.set_y(y0 + h + 3)


def _hard_split(word, width):
    """Break a single word that is wider than the cell, character by character."""
    out, piece = [], ""
    for ch in word:
        if pdf.get_string_width(piece + ch) <= width or not piece:
            piece += ch
        else:
            out.append(piece)
            piece = ch
    out.append(piece)
    return out


def wrap(text, width, family, style, size):
    pdf.set_font(family or "Helvetica", style or "", size)
    out, cur = [], ""
    for w in text.split(" "):
        trial = (cur + " " + w).strip()
        if pdf.get_string_width(trial) <= width:
            cur = trial
            continue
        if cur:
            out.append(cur)
        if pdf.get_string_width(w) <= width:
            cur = w
        else:
            pieces = _hard_split(w, width)
            out.extend(pieces[:-1])
            cur = pieces[-1]
    if cur:
        out.append(cur)
    return out


KEEP_TOGETHER_MM = 200.0   # a table up to this height moves whole to a fresh page instead of splitting


def table_layout(rows):
    """Measure a pipe table once: font size, line height and column widths from real Helvetica
    metrics (in mm, the document unit), and the height of every row with those widths. The drawing
    code, the keep-together rule and a heading's look-ahead all use the same numbers."""
    ncol = max(len(r) for r in rows)
    rows = [r + [""] * (ncol - len(r)) for r in rows]

    fs = 7.2 if ncol >= 7 else (7.6 if ncol == 6 else (8.0 if ncol == 5
                                                      else (8.4 if ncol == 4 else 8.9)))
    lh = fs * 0.44
    pad = 3.2  # left + right padding in mm

    # measure the widest rendered line per column (header + up to 60 body rows)
    pdf.set_font("Helvetica", "", fs)
    raw, floor_ = [], []
    for c in range(ncol):
        wmax = pdf.get_string_width(san(strip_md(rows[0][c])))
        for r in rows[1:61]:
            wmax = max(wmax, pdf.get_string_width(san(strip_md(r[c]))))
        raw.append(wmax + pad)  # get_string_width() already answers in mm (the document unit)
        # a column must at least fit its longest header word, and any short
        # body word (<= 18 mm), so labels like "Postgres" never split
        words = list(rows[0][c].split(" "))
        for r in rows[1:41]:
            words.extend(str(r[c]).split(" "))
        hw = 0.0
        for w in words:
            ww = pdf.get_string_width(san(w)) + pad
            if ww <= 18.0:
                hw = max(hw, ww)
        floor_.append(min(max(hw, 13.0), 30.0))

    cap = EPW * 0.44
    widths = [max(min(raw[i], cap), floor_[i]) for i in range(ncol)]

    need = sum(floor_)
    if need > EPW:                        # pathological: shrink the type instead
        fs = max(6.2, fs * (EPW / need) * 0.97)
        lh = fs * 0.44
        widths = [floor_[i] * (EPW / need) for i in range(ncol)]
    else:
        total = sum(widths)
        if total > EPW:                   # every column keeps its floor; the room left is shared in
            spare = EPW - need            # proportion to how much more each column wants (need <= EPW here)
            want = [max(0.0, widths[i] - floor_[i]) for i in range(ncol)]
            wt = sum(want)
            widths = [floor_[i] + (spare * want[i] / wt if wt > 0 else spare / ncol) for i in range(ncol)]
        elif total < EPW:                 # spare width goes first to the columns that would wrap
            spare = EPW - total
            short = [max(0.0, raw[i] - widths[i]) for i in range(ncol)]
            st = sum(short)
            if st >= spare:               # not enough to unwrap everything: share by shortfall
                widths = [widths[i] + spare * short[i] / st for i in range(ncol)]
            else:                         # every column fits on one line; the rest goes by natural width
                widths = [widths[i] + short[i] for i in range(ncol)]
                rest, rt = spare - st, sum(raw)
                widths = [widths[i] + (rest * raw[i] / rt if rt > 0 else rest / ncol) for i in range(ncol)]

    lines_of = []
    for k, r in enumerate(rows):
        style = "B" if k == 0 else ""
        lines_of.append([wrap(san(strip_md(c)), widths[i] - pad, "Helvetica", style, fs)
                         for i, c in enumerate(r)])
    heights = [max(len(cl) for cl in cls) * lh + 2.6 for cls in lines_of]
    return {"rows": rows, "ncol": ncol, "fs": fs, "lh": lh, "pad": pad, "widths": widths,
            "lines": lines_of, "heights": heights}


def table_needs(rows):
    """Room a table must find on the current page before it starts (header + first row, or all of it
    when it is short enough to be kept together). Used by a heading to stay with its table."""
    L = table_layout(rows)
    total = sum(L["heights"])
    if total <= KEEP_TOGETHER_MM:
        return 2 + total
    return 2 + sum(L["heights"][:2])


def render_table(rows):
    """Draw a pipe table. Column widths come from real Helvetica metrics, so wide tables (6-8
    columns) neither overflow their cells nor collide. A short table is kept together, and a
    header is never left at the foot of a page without its first row."""
    if not rows:
        return
    L = table_layout(rows)
    rows, widths, fs, lh, pad = L["rows"], L["widths"], L["fs"], L["lh"], L["pad"]

    def draw_row(k, cells, header=False, alt=False):
        cell_lines = L["lines"][k]
        rowh = L["heights"][k]
        if pdf.get_y() + rowh > pdf.h - 16:
            pdf.add_page()
            draw_row(0, rows[0], header=True)
        y0 = pdf.get_y()
        x = 18.0
        for i, cl in enumerate(cell_lines):
            if header:
                pdf.set_fill_color(*HEADBG)
                pdf.rect(x, y0, widths[i], rowh, "F")
            elif alt:
                pdf.set_fill_color(*BGFILL)
                pdf.rect(x, y0, widths[i], rowh, "F")
            pdf.set_draw_color(*LINE)
            pdf.set_line_width(0.15)
            pdf.rect(x, y0, widths[i], rowh)
            pdf.set_font("Helvetica", "B" if header else "", fs)
            pdf.set_text_color(*(WHITE if header else TEXT))
            ty = y0 + 1.3
            for ln in cl:
                pdf.set_xy(x + 1.6, ty)
                pdf.cell(widths[i] - pad, lh, ln)
                ty += lh
            x += widths[i]
        pdf.set_y(y0 + rowh)

    pdf.ln(2)
    total = sum(L["heights"])
    room = pdf.h - 16 - pdf.get_y()
    if total <= KEEP_TOGETHER_MM:
        if total > room:                  # short enough to keep together: move it whole
            pdf.add_page()
    elif sum(L["heights"][:2]) > room:    # long table: never strand the header
        pdf.add_page()
    draw_row(0, rows[0], header=True)
    for k, r in enumerate(rows[1:], 1):
        draw_row(k, r, alt=(k % 2 == 0))
    pdf.ln(3.5)


# ---------------------------------------------------------------- markdown parse
lines = open(SRC, encoding="utf-8").read().split("\n")
i = 0
skip_first_hr = True
para_buf, bullet_buf = [], []


def _table_rows_at(j):
    """The pipe-table rows starting at line j (separator rows dropped), and the line after them."""
    look = []
    while j < len(lines) and lines[j].lstrip().startswith("|"):
        cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-{2,}:?", c or "-") for c in cells):
            look.append(cells)
        j += 1
    return look, j


def keep_after_heading(j):
    """How much must fit below a heading so it is not left alone at the foot of a page. It looks
    through sub-headings and one short paragraph to the block they introduce: for a table, its
    opening rows (or all of it when it is kept together); otherwise a few lines."""
    need = 0.0
    while True:
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j >= len(lines):
            return need
        t = lines[j]
        mh = re.match(r"^(#{1,3})\s+", t)
        if mh and len(mh.group(1)) > 1:            # a sub-heading: it comes along, keep looking
            need += 13.5 if len(mh.group(1)) == 2 else 10.0
            j += 1
            continue
        if t.lstrip().startswith("|"):
            look, _ = _table_rows_at(j)
            return min(need + (table_needs(look) if look else 0.0), KEEP_TOGETHER_MM)
        if re.match(r"^\s*([-*]\s|>\s|```)", t):     # bullets, a callout or code: a few lines
            return need + 14.0
        para = []
        while j < len(lines) and lines[j].strip() and not re.match(r"^\s*(\||#|[-*]\s|>\s|```)", lines[j]):
            para.append(lines[j].strip())
            j += 1
        h = len(wrap(san(strip_md(" ".join(para))), EPW, "Helvetica", "", 9.6)) * 5.0 + 2.0
        need += min(h, 20.0)
        k = j
        while k < len(lines) and not lines[k].strip():
            k += 1
        if h <= 16.0 and k < len(lines) and lines[k].lstrip().startswith("|"):   # a one- or two-line lead-in
            look, _ = _table_rows_at(k)
            if look:
                need += table_needs(look)
        return min(need, KEEP_TOGETHER_MM)


def flush_para():
    global para_buf
    if para_buf:
        paragraph(" ".join(para_buf).strip())
        para_buf = []


def flush_bullets():
    global bullet_buf
    if bullet_buf:
        bullets(bullet_buf)
        bullet_buf = []


while i < len(lines):
    raw = lines[i]
    ln = raw.rstrip()

    if ln.strip().startswith("```"):
        flush_para(); flush_bullets()
        i += 1
        buf = []
        while i < len(lines) and not lines[i].strip().startswith("```"):
            buf.append(lines[i])
            i += 1
        codeblock(buf)
        i += 1
        continue

    if ln.lstrip().startswith("|"):
        flush_para(); flush_bullets()
        trows = []
        while i < len(lines) and lines[i].lstrip().startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c or "-") for c in cells):
                trows.append(cells)
            i += 1
        if trows:
            render_table(trows)
        continue

    m = re.match(r"^(#{1,3})\s+(.*)$", ln)
    if m:
        flush_para(); flush_bullets()
        heading(len(m.group(1)), m.group(2), keep_after_heading(i + 1))
        i += 1
        continue

    if re.fullmatch(r"-{3,}", ln.strip()):
        flush_para(); flush_bullets()
        if skip_first_hr:
            skip_first_hr = False
        else:
            pdf.ln(2)
            pdf.set_draw_color(*LINE)
            pdf.set_line_width(0.3)
            pdf.line(18, pdf.get_y(), 192, pdf.get_y())
            pdf.ln(3)
        i += 1
        continue

    if ln.startswith("> "):
        flush_para(); flush_bullets()
        buf = [ln[2:]]
        i += 1
        while i < len(lines) and lines[i].startswith("> "):
            buf.append(lines[i][2:])
            i += 1
        callout(" ".join(buf))
        continue

    m = re.match(r"^(\s*)[-*]\s+(.*)$", ln)
    if m:
        flush_para()
        bullet_buf.append(m.group(2))
        i += 1
        continue

    m = re.match(r"^(\s*)(\d+)\.\s+(.*)$", ln)
    if m:
        flush_para()
        bullet_buf.append(f"{m.group(2)}. {m.group(3)}")
        i += 1
        continue

    if not ln.strip():
        flush_para(); flush_bullets()
        i += 1
        continue

    if bullet_buf and raw.startswith("   "):
        bullet_buf[-1] += " " + ln.strip()
        i += 1
        continue

    flush_bullets()
    para_buf.append(ln.strip())
    i += 1

flush_para(); flush_bullets()

pdf.output(OUT)
print(f"OK -> {OUT} ({pdf.page_no()} pages)")
