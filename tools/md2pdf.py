#!/usr/bin/env python3
"""Render MASTER-PLAN.md -> MASTER-PLAN.pdf with fpdf2 (brand styled)."""
import re, sys
from fpdf import FPDF
from fpdf.enums import XPos, YPos

import sys
SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/-marketingwoodex/MASTER-PLAN.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else SRC.replace(".md", ".pdf")

NAVY   = (10, 15, 30)
CARD   = (18, 24, 38)
GOLD   = (233, 201, 123)
TEXT   = (30, 34, 42)
MUTED  = (95, 101, 113)
WHITE  = (255, 255, 255)
LINE   = (210, 214, 222)
BGFILL = (244, 246, 250)
HEADBG = (10, 15, 30)

# ---- unicode -> latin-1-safe ------------------------------------------------
_MAP = {
    "→": "->", "←": "<-", "↔": "<->", "⇒": "=>",
    "—": "-", "–": "-", "…": "...", "‘": "'", "’": "'",
    "“": '"', "”": '"', "•": "-", "·": "-", "∙": "-",
    "≈": "~", "≥": ">=", "≤": "<=", "×": "x", "÷": "/", "∥": "||", "⁃": "-",
    "§": "Section ", "⌘": "Cmd", "✓": "OK", "✔": "OK",
    "★": "*", "☆": "*", "•": "-", "⁃": "-",
    "️": "", "⚡": "!", "🔒": "", "📦": "", "🚀": "",
    # box-drawing / arrows used in the architecture diagram
    "│": "|", "─": "-", "━": "-", "┌": "+", "┐": "+",
    "└": "+", "┘": "+", "├": "+", "┤": "+", "┬": "+",
    "┴": "+", "┼": "+", "▼": "v", "▲": "^", "█": "#",
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

class Plan(FPDF):
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
        self.cell(120, 5, san("Woodex Master Plan v1.0  |  Confidential  |  28 Sep 2026"),
                  new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(54, 5, f"Page {self.page_no()}", align="R",
                  new_x=XPos.RIGHT, new_y=YPos.TOP)

pdf = Plan(format="A4", unit="mm")
pdf.set_auto_page_break(True, margin=16)
pdf.set_margins(18, 16, 18)
EPW = pdf.w - 18 * 2  # 174mm

# ---------------- cover ------------------------------------------------------
pdf.add_page()
pdf.set_fill_color(*NAVY)
pdf.rect(0, 0, 210, 297, "F")
# gold accent bar
pdf.set_fill_color(*GOLD)
pdf.rect(18, 56, 46, 1.6, "F")
pdf.set_text_color(*GOLD)
pdf.set_font("Helvetica", "B", 11)
pdf.set_xy(18, 46)
pdf.cell(0, 6, san("WOODEX INTERIOR  ·  DIGITAL OPERATIONS"))
pdf.set_text_color(*WHITE)
pdf.set_font("Helvetica", "B", 33)
pdf.set_xy(18, 70)
pdf.multi_cell(174, 15, san("Master Plan"))
pdf.set_font("Helvetica", "B", 19)
pdf.set_xy(18, 100)
pdf.multi_cell(174, 9.5, san("Master Dashboard · Live Page Builder\nCRM · Quotations & Invoices · Go-Live"))
pdf.set_draw_color(*GOLD)
pdf.set_line_width(0.4)
pdf.line(18, 132, 90, 132)
pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(200, 205, 215)
pdf.set_xy(18, 140)
pdf.multi_cell(174, 6.5, san(
    "Full-stack implementation plan based on the completed deep audit,\n"
    "the approved design mockup and the five locked decisions.\n"
    "87-page website · No-code block builder · Lead-gen CRM with live chat & WhatsApp · "
    "Server-PDF quotation pipeline · Vercel hosting."))
# meta block
pdf.set_fill_color(*CARD)
pdf.rect(18, 196, 174, 54, "F")
rows = [
    ("Status", "FOR APPROVAL - development starts after sign-off"),
    ("Version", "1.0  ·  28 September 2026"),
    ("Scope", "Phases 0-6  ·  13 weeks"),
    ("Hosting", "Vercel (site + admin + API)  ·  Hostinger = domain only"),
    ("Based on", "AUDIT-REPORT-2026-09-28.md + design mockup + admin screenshots"),
]
y = 202
for k, v in rows:
    pdf.set_xy(24, y)
    pdf.set_font("Helvetica", "B", 9.5)
    pdf.set_text_color(*GOLD)
    pdf.cell(26, 8, san(k))
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(235, 238, 244)
    pdf.cell(0, 8, san(v))
    y += 9.5
pdf.set_xy(18, 262)
pdf.set_font("Helvetica", "", 8)
pdf.set_text_color(150, 156, 170)
pdf.cell(0, 5, san("marketingwoodex-cloud/-marketingwoodex  ·  arena branch  ·  Confidential"))
pdf.add_page()  # content starts on page 2

# ---------------- parser state ----------------------------------------------
H1_COUNT = [0]

def ensure(mm_needed):
    if pdf.get_y() + mm_needed > pdf.h - 16:
        pdf.add_page()

def heading(level, text):
    text = san(text)
    if level == 1:
        H1_COUNT[0] += 1
        if H1_COUNT[0] > 1:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 18)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(EPW, 9, text)
        y = pdf.get_y() + 1.2
        pdf.set_fill_color(*GOLD)
        pdf.rect(18, y, 60, 1.2, "F")
        pdf.set_y(y + 5)
    elif level == 2:
        ensure(16)
        pdf.ln(3.5)
        pdf.set_font("Helvetica", "B", 13.5)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(EPW, 7, text)
        pdf.set_draw_color(*GOLD)
        pdf.set_line_width(0.5)
        pdf.line(18, pdf.get_y() + 0.6, 192, pdf.get_y() + 0.6)
        pdf.ln(3)
    else:
        ensure(12)
        pdf.ln(2.5)
        pdf.set_font("Helvetica", "B", 11.5)
        pdf.set_text_color(*CARD)
        pdf.multi_cell(EPW, 6.2, text)
        pdf.ln(1.2)

def paragraph(text, size=9.8, color=TEXT, indent=0.0):
    pdf.set_font("Helvetica", "", size)
    pdf.set_text_color(*color)
    w = EPW - indent
    if indent:
        pdf.set_x(18 + indent)
    pdf.multi_cell(w, 5.1, san(text.replace("`", "")), markdown=True)
    pdf.ln(1.6)

def bullets(items, numbered=False):
    for i, it in enumerate(items, 1):
        ensure(8)
        m = re.match(r"^(\d+)\.\s+(.*)$", it)
        if m:
            marker, body = m.group(1) + ".", m.group(2)
        else:
            marker, body = "-", it
        pdf.set_font("Helvetica", "B", 9.8)
        pdf.set_text_color(*NAVY)
        pdf.set_x(18)
        pdf.cell(7, 5.1, marker)
        pdf.set_font("Helvetica", "", 9.8)
        pdf.set_text_color(*TEXT)
        pdf.multi_cell(EPW - 7, 5.1, san(body.replace("`", "")), markdown=True,
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1.4)

def callout(text):
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 9.8)
    # measure
    lines = wrap(san(strip_md(text)), EPW - 10, "", "", 9.8)
    h = len(lines) * 5.1 + 6
    ensure(h + 4)
    y0 = pdf.get_y()
    pdf.set_fill_color(252, 247, 233)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.3)
    pdf.rect(18, y0, EPW, h, "DF")
    pdf.set_fill_color(*GOLD)
    pdf.rect(18, y0, 1.6, h, "F")
    pdf.set_xy(23, y0 + 2.6)
    pdf.set_font("Helvetica", "", 9.6)
    pdf.set_text_color(*TEXT)
    pdf.multi_cell(EPW - 10, 5.1, san(text.replace("`", "")), markdown=True)
    pdf.set_y(y0 + h + 3)

def codeblock(lines_in):
    pdf.set_font("Courier", "", 8.2)
    wrapped = []
    for ln in lines_in:
        wrapped.extend(wrap(san(ln), EPW - 8, "Courier", "", 8.2) or [""])
    h = len(wrapped) * 4.2 + 6
    ensure(h + 4)
    y0 = pdf.get_y()
    pdf.set_fill_color(240, 242, 246)
    pdf.rect(18, y0, EPW, h, "F")
    pdf.set_xy(22, y0 + 3)
    pdf.set_font("Courier", "", 8.2)
    pdf.set_text_color(40, 44, 54)
    for ln in wrapped:
        pdf.cell(EPW - 8, 4.2, ln, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_x(22)
    pdf.set_y(y0 + h + 3)

def wrap(text, width, family, style, size):
    pdf.set_font(family or "Helvetica", style or "", size)
    words = text.split(" ")
    out, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if pdf.get_string_width(trial) <= width or not cur:
            cur = trial
        else:
            out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out

def render_table(rows):
    if not rows:
        return
    ncol = max(len(r) for r in rows)
    rows = [r + [""] * (ncol - len(r)) for r in rows]
    # widths from content length (capped)
    weights = []
    for c in range(ncol):
        m = max(len(strip_md(r[c])) for r in rows)
        weights.append(min(max(m, 6), 70))
    tot = sum(weights)
    widths = [EPW * w / tot for w in weights]
    # ensure min width
    widths = [max(w, 14 if i == 0 else 18) for i, w in enumerate(widths)]
    sc = EPW / sum(widths)
    widths = [w * sc for w in widths]

    fs = 8.2 if ncol >= 5 else (8.6 if ncol == 4 else 9.0)
    lh = fs * 0.42

    def draw_row(cells, header=False, alt=False):
        nonlocal widths
        cell_lines = []
        for i, c in enumerate(cells):
            txt = san(strip_md(c))
            cell_lines.append(wrap(txt, widths[i] - 3, "Helvetica",
                                   "B" if header else "", fs))
        rowh = max(len(cl) for cl in cell_lines) * lh + 2.6
        if pdf.get_y() + rowh > pdf.h - 16:
            pdf.add_page()
            draw_row(rows[0], header=True)
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
                pdf.set_xy(x + 1.5, ty)
                pdf.cell(widths[i] - 3, lh, ln)
                ty += lh
            x += widths[i]
        pdf.set_y(y0 + rowh)

    pdf.ln(2)
    draw_row(rows[0], header=True)
    for i, r in enumerate(rows[1:], 1):
        draw_row(r, alt=(i % 2 == 0))
    pdf.ln(3.5)

# ---------------- main parse -------------------------------------------------
lines = open(SRC, encoding="utf-8").read().split("\n")
i = 0
skip_first_hr = True
para_buf = []
bullet_buf = []

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
    # code fence
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
    # table
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
    # headings
    m = re.match(r"^(#{1,3})\s+(.*)$", ln)
    if m:
        flush_para(); flush_bullets()
        heading(len(m.group(1)), m.group(2))
        i += 1
        continue
    # hr
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
    # callout
    if ln.startswith("> "):
        flush_para(); flush_bullets()
        buf = [ln[2:]]
        i += 1
        while i < len(lines) and lines[i].startswith("> "):
            buf.append(lines[i][2:])
            i += 1
        callout(" ".join(buf))
        continue
    # bullets
    m = re.match(r"^(\s*)-\s+(.*)$", ln)
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
    # blank
    if not ln.strip():
        flush_para(); flush_bullets()
        i += 1
        continue
    # continuation of bullet (indented)
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
