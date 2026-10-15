# WOODEX Admin — Design System (from approved mockup boards)

**Source:** user-attached mockup boards, 2026-09-29 (two boards: Live Chat /
Quotations / Projects / Settings / System + CRM Dashboard / Leads / Clients /
Media). PNG originals live in chat uploads (not persistent); this spec is the
durable source of truth for every admin view build.

**Sidebar:** already rebuilt per blueprint §29 — keep as-is (dark navy, gold
active pill, group headers, badges).

---

## 1. Theme

| Token | Value | Used for |
|---|---|---|
| Sidebar bg | `#0a0f1e` (navy) | app sidebar (unchanged) |
| Content bg | `#f4f6fa` (light gray-blue) | main area behind cards |
| Panel/card bg | `#ffffff` | all cards, tables, forms |
| Heading text | `#1a2233` | view titles, card titles |
| Body/muted text | `#5b6478` | labels, secondary |
| Border | `#e6e9f2` | card borders, table rules, inputs |
| **Primary action** | **`#2563eb` blue**, white text | “+ New Quotation”, “Save”, “+ New Lead”… |
| Secondary action | white bg + `#d7dbe8` border + `#333c55` text | “Templates”, “Settings”, “Filter” |
| Brand accent | `#e9c97b` gold | logo, active sidebar pill, KPI highlights |
| Success / danger / warn / info | `#16a34a` / `#dc2626` / `#d97706` / `#0891b2` | pills, deltas, toggles |
| Font | Inter 400–800 (self-hosted) | all text |

Dark theme stays only in: sign-in gate + sidebar. **All `.wx-view` content
converts to light** (this is the D0 conversion).

## 2. Layout

- **Topbar (light):** search pill (`Search anything…`), right side: “Live Site”
  chip, notification bell (badge), avatar + `Admin / Super Admin ▾`.
- **View header:** big title (20–22px/700) + one-line description under it;
  right-aligned header actions: secondary outline button(s) + blue primary.
- **Footer strip:** “Powerful Control · Seamless Management · Grow Your Business”
  + version chip (optional, dashboard only).

## 3. Components

### KPI card (4–5 across)
White card, 1px border, radius 10. Left: **tinted icon tile** (40×40, radius 8,
soft color bg + saturated icon). Right: label (12px muted), **value (24px/700)**,
**delta chip** (`▲ +18%` green / `▼ -8%` red, 11px, soft bg).

### Data table
White card; header row 12px uppercase muted; rows 46px, hover `#f8fafd`;
status **pills** (soft bg + dark text, radius 999): Draft=amber, Sent=blue,
Approved=green, Rejected=red, New=blue, Contacted=indigo, Site Visit=purple,
Quoted=orange, Converted=green, Active=green. Actions: icon buttons right-aligned.
Pagination bar under table: `Showing 1–8 of 32` + page chips (active = blue).

### Filter bar (above tables/boards)
One white row: selects (All Status, All Services…), date-range pill
(`Sep 1, 2026 – Sep 30, 2026`), right-aligned search input.

### Buttons
- Primary: `#2563eb`, white, radius 8, 13px/600, optional `+` icon.
- Secondary: white, border `#d7dbe8`.
- Danger outline: red text/border, soft red hover.
- Icon buttons in table rows: ghost, muted → blue on hover.

### Forms (Settings)
Label 13px/600 dark; input white, border `#d7dbe8`, radius 8; required `*` red.
Selects same. Toggles: green when ON (Live Chat), gray when OFF (Maintenance).
Logo/favicon upload rows = bordered preview box + `Change` / `Remove` links.
Settings left menu: vertical tab list (General, Contact, Social Media, WhatsApp,
Estimator Rates, Integrations, Publishing) — active item = soft blue tint.

### Charts (Chart.js)
Area (multi-series, soft fills), donut (lead sources, center total), bars
(monthly value). Palette: `#2563eb, #16a34a, #f59e0b, #0891b2, #8b5cf6`.

### Kanban (Leads & Estimator)
Columns = white cards; header = tinted strip with stage name + count chip;
lead cards: avatar, name, service, date, soft border; “+N more” footer link.
Bottom detail row (3 panels): Lead Details (contact + Call/WhatsApp/Email
buttons), Activity Timeline (dot + event + relative time), Convert to
Quotation (select service, value input, blue Convert).

### Live Chat layout (3 columns)
Left: conversation list (tabs All/Online/Offline, search, avatar rows w/
online dot, unread pill). Center: thread header (name, Online, location),
bubbles (visitor white/gray left, agent blue right), composer (attach, mic,
input, blue Send). Right: Lead Details card (fields), `Create Quote` +
`Create Project` buttons, Quick Actions (Call / WhatsApp / Email tiles).

### Dashboard (CRM Dashboard)
Row 1: 5 KPI cards. Row 2: Leads Overview area chart (2/3) + Lead Sources
donut (1/3) + Quotation Value bars (1/3). Row 3: Recent Leads table (2/3) +
Quick Actions grid (6 tiles, 1/3). Row 4: Sales Performance card
(Rs value, bars, Avg Response Time, Conversion Rate).

### System / Status
Status list rows: name + colored dot + label (Online/Connected/Deployed/
Healthy/Ready). Recent Activity feed: icon + text + relative time.
Server Info: two-column key/value.

## 4. View build matrix

| View | Mockup | Current state | Target |
|---|---|---|---|
| Dashboard / CRM Dashboard | ✅ board 2 | dark widgets (Phase 1) | light + KPI deltas + funnel |
| Reports | built (dark) | range/CSV done | light theme restyle |
| Enquiries | existing | list | light + pills + filter bar |
| Leads & Estimator | ✅ kanban board | list-style | **kanban + detail row** |
| Quotations | ✅ table board | basic list | KPIs + filter bar + table + pagination |
| Invoices | existing | basic | same table system as Quotations |
| Clients | ✅ table board | basic | search + table + Active pills |
| Live Chat | ✅ 3-column | placeholder | **B5.1 full build** |
| Projects | ✅ grid board | list | card grid w/ images + badges |
| Media Library | ✅ folder board | basic | folders + grid + upload |
| Settings | ✅ tabbed form | single scroll page | vertical tabs + toggles |
| System/Health | ✅ status board | basic rows | status dots + activity + server info |
| Pages (B1) | — | combined editor | manager table (plan §B1) |

## 5. Dashboard-only widgets (from first mockup, already built)
Growth badge, 4 KPIs, 4-tab chart, right rail — keep, restyle to light tokens.
