# Page Builder: To-Do (v3)
Reference: VvvebJs feature list and the 3 screenshots (Style: Display/Position/Linked styles; Typography; Content: Section/Background/Overlay/Separators/General).
Status: ☐ todo · ◐ partial (exists in v2) · ✅ done

## A. Fixes from the audit (do first)
- ✅ A1 Global header/footer: edits apply to all 87 pages (with backups), plus a warning
- ✅ A2 Content "Text" box must not remove bold, italic or links
- ✅ A3 Sanitize: strip `on*=` / `javascript:` on load and on code apply; sandbox the canvas
- ✅ A4 Code editor: block `<script>` / confirm `<iframe>`
- ✅ A5 "Enable link": no links inside links, no `<a>` around `<li>`
- ✅ A6 Save guard: check for the attribute, not the word "contenteditable"
- ✅ A7 Remove the leftover `S.open.add({})`

## B. Style tab (screenshots 1–2)
- ✅ B1 Display / Position / Top / Left / Bottom / Right / Float / z-index
- ✅ B2 Opacity slider + number
- ✅ B3 Colour fields with transparency (rgba) + swatch
- ✅ B4 Number + unit dropdowns (px, rem, em, %, vw, vh, auto)
- ✅ B5 Text decoration colour + style
- ✅ B6 Split into sections: Size, Margin, Padding, Border, Border radius (4 corners), Background image
- ✅ B7 "Linked styles" notice: warn when a class is shared, with a "this element only" option
- ✅ B8 Hover state styles (normal / hover switch)
- ✅ B9 Transitions / transform (rotate, scale)

## C. Content tab: sections (screenshot 3)
- ✅ C1 Section label (name shown in Layers)
- ✅ C2 Container width Boxed / Full; height Auto / Full screen
- ✅ C3 Background: None / Image / Video (mp4) / YouTube + parallax
- ✅ C4 Overlay: colour + opacity
- ✅ C5 Top / bottom separators (wave, slant, curve, triangle) with colour and height
- ✅ C6 General: id, title, classes (moved here as well as Advanced)

## D. Core editor features (VvvebJs list)
- ✅ D1 Drag and drop sections and elements, and click to insert
- ✅ D2 Undo / redo
- ✅ D3 One- or two-panel mode switch
- ◐ D4 File manager: page tree with folders + component hierarchy (Layers ✅)
- ✅ D5 (decided: new + duplicate only, no delete/rename) New page modal: template (blank / copy of a page) + folder, plus duplicate, rename, delete page
- ✅ D6 CodeMirror syntax highlighting in the code editor (also whole-page code view)
- ✅ D7 Image upload (PHP)
- ✅ D8 Export / download page HTML; ZIP of page + assets
- ✅ D9 Search box for Sections, Elements and Layers
- ✅ D10 Bootstrap-style components (tabs, accordion, cards, alerts, badges, progress, table, form)
- ◐ D11 Media gallery: search, delete, folders + free CC0 image search (Openverse/Pexels API)
- ✅ D12 Resize handles for image, video and iframe
- ✅ D13 Breadcrumb
- ◐ D14 Full Google Fonts list (1,500+, searchable) instead of 26
- ◐ D15 Widgets: YouTube ✅, Maps ✅, + Chart.js, counter, countdown, social icons, WhatsApp button
- ✅ D16 Better text toolbar (headings, lists, colour, size, align), a lightweight CKEditor-style editor
- ✅ D17 SVG icon picker (hundreds of free icons, e.g. Lucide/Tabler inline)
- ✅ D18 Animate on scroll (fade/slide/zoom, delay, duration), saved as data attributes + a small script
- ◐ D19 Theme: global typography + colour palette (link to the Google Fonts list, heading sizes, palette swatches used in the colour pickers)
- ✅ D20 Import / export: page, a single section (JSON/HTML), saved "My sections" library

## E. Improvements from the audit
- ✅ E1 Link picker: dropdown of all pages + #anchors
- ✅ E2 Autosave draft (localStorage) + recover prompt; re-login without a reload
- ✅ E3 SEO / accessibility checker: missing alt, several H1s, skipped headings, empty links
- ⏭ E4 (skipped: Google Fonts loaded from Google, by decision) Self-hosted chosen Google Fonts (optional)
- ✅ E5 SVG icons for the builder UI instead of emoji
- ✅ E6 Media: delete, search, unused-file cleanup
- ✅ E7 Keyboard shortcuts panel (Ctrl+C/V copy-paste an element, Ctrl+D duplicate)
- ✅ E8 Context menu (right-click): copy, paste, duplicate, delete, save as section

## F. From the latest screenshots (added)
- ✅ F1 Toolbar like VvvebJs: ✥ drag-move handle, parent, up, down, code, 🪄 quick styles, 💾 save as block, duplicate, delete
- ✅ F2 ➕ under **every** element (section picker for sections, element picker for elements)
- ✅ F3 Drag-move any element (and images) by dragging, with a drop line
- ✅ F4 Resize handles (8 points) on images, videos and iframes, saving width/height for the current device
- ✅ F5 Style tab: "State" dropdown (Normal / Hover / Focus / Active); all groups collapsed by default (Display, Typography, Size, Margin, Padding, Border, Border radius, Background image)
- ✅ F6 Content tab: Section / Background / Overlay / Separators / General (done in Phase 2)
- ☐ F7 🌐 Translate button (future: needs a translation API key; not in Phase 3)

## Suggested build phases
1. **Phase 1:** A1–A7, E1, E2 (stability & safety)
2. **Phase 2:** B1–B9, C1–C6 (the screenshot panels)
3. **Phase 3:** F1–F5, D5, D6, D8, D9, D12, D16, D20, E7, E8 (workflow + screenshot items)
4. **Phase 4:** D10, D11, D14, D15, D17, D18, D19, E3–E6 (components, media, polish)

## Decisions
- Build phase by phase, with a review after each phase.
- Header/footer edits update all pages automatically.
- Libraries are bundled locally; free photo search and Google Fonts are allowed online.
- Page management: new + duplicate only (no delete/rename, safer for SEO).
