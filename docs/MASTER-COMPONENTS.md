# Woodex Admin — Master Components (UI Kit)

Live demo: `frontend-v1/admin/master-components.html` (open `/admin/master-components.html`). It's a single file with no libraries, so it loads fast and works offline. It's organised like the [Preline components](https://preline.co/docs/components.html) docs: a searchable left menu, a live demo for each component, and code notes.

## Design tokens
| Token | Value | Use |
|---|---|---|
| `--navy` | `#0c1628` | Sidebar, primary buttons, headers |
| `--navy2` | `#16233d` | Hover / active menu |
| `--gold` | `#b8956a` | Accents only: active marker, focus, charts, stars |
| `--cream` | `#f4efe7` | Soft backgrounds, hover rows |
| `--ok / --warn / --bad / --info` | `#12b76a / #f79009 / #d92d20 / #2e90fa` | Status |
| Font | Plus Jakarta Sans | 14px base |
| Radius | 12px cards, 10px controls | |
| Dark mode | `html[data-theme=dark]` | Toggle at the top right |

## Component list (38)
| Group | Components | Class / hook |
|---|---|---|
| **Base** | Colors | `--navy` … |
| | Buttons (pri, gold, soft, ghost, danger, sm/lg, icon, disabled, loading) | `.btn .pri .gold .soft .ghost .danger .sm .lg .icon` |
| | Button group | `.bgroup` + `.on` |
| | Badges (stage + count) | `.badge .ok .warn .bad .info .gold`, `.dot` |
| | Alerts (dismissible) | `.alert .info/.ok/.warn/.bad`, `.x` |
| | Avatars (sizes, status, stack) | `.av .sm .lg .sq`, `.st`, `.avs` |
| | Cards (KPI, image, footer) | `.card .h .b .f`, `.kpi .v .l`, `.spark` |
| | Accordion | `.acc > button + .p` |
| | Blockquote and kbd | `blockquote`, `kbd` |
| | Progress (bar, ring, legend) | `.prog i`, `.ring --p`, `.leg` |
| | Spinner and skeleton | `.spin`, `.skel` |
| | Ratings | `.stars i.on` |
| | Timeline | `.tl > div` |
| | List group | `.list > div` |
| **Navigation** | Navbar | `.navbar` |
| | Sidebar (menu groups) | `.minside a.on` |
| | Tabs and pills | `.tabs[data-tabs]` + `.tabpane[data-p]`, `.pills` |
| | Breadcrumb | `.crumb` |
| | Pagination | `.pager` |
| | Stepper (pipeline stages) | `.steps .done/.now` |
| **Overlays** | Dropdown | `.dd > [data-dd] + .menu` |
| | Popover and tooltip | `.pop`, `.tip[data-tip]` |
| | Modal (Esc / backdrop closes it) | `.ov#id > .modal`, `[data-open=id]`, `[data-close]` |
| | Offcanvas drawer | `.drawer`, `[data-drawer]` |
| | Toasts | `toast(msg, "ok"/"bad")` |
| **Forms** | Inputs (validation, hint, group, select, textarea) | `label.f`, `.in .err`, `.hint`, `.ig` |
| | Checkbox, radio, switch | `.chk`, `.switch` |
| | Range, colour, date, time | native inputs |
| | Password show/hide and strength meter | `.pw`, `.meter` |
| | PIN input (2FA) | `.pin` |
| | Tags input | `.tags` |
| | File upload (drag and drop) | `.drop` |
| | Search / combobox | `.dd#cb` |
| **Data** | Table (sort and filter) | `table.t` |
| | Bar chart (no library) | `.chart` |
| | Kanban pipeline (drag) | `.kanban .col2 .kc` |
| | Chat bubbles | `.chat .msg.me/.them` |
| | Empty state | `.empty` |

## Rules
1. Gold is for small touches only. Never use it as a big background.
2. Every interactive element gets a visible focus ring (gold, 3px).
3. Use the stage colours everywhere: New = info, Contacted / Site visit = warn, Quote sent = gold, Won = ok, Lost = bad.
4. Put text into the page with `textContent` or `esc()`, never raw `innerHTML` (security audit rule).
5. Icons in the demo are emoji or Unicode stand-ins; the real admin uses its own icon set via `ic()`.
6. Mobile: below 900px the sidebar hides and the kanban becomes 2 columns.
