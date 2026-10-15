# Page Builder Audit (frontend-v1): 29 Sep 2026

Scope: `frontend-v1/builder/*` (UI, 690-line engine, 12 sections + 16 elements), `frontend-v1/api/builder.php` (Hostinger backend) and `tools/frontend-v1-server.mjs` (preview twin).
Method: code review, plus real Chromium tests of login, select, add section (click, ➕), add element, per-device styles, fonts, toolbar, layers, undo and save/backup. Drag and drop and "Enable link" were not tested.

**Overall: 7/10.** It works and the backend is solid. The main gaps are header/footer editing across pages, a few risks of losing content, and hardening of the editing canvas.

## ✅ What is good
| Area | Finding |
|---|---|
| Auth | bcrypt password, HMAC tokens (12h), sent in a header (not a cookie, so no CSRF). Changing the password rotates the secret, which logs out old sessions. Login is throttled to 8 tries per 10 min per IP. |
| File safety | Page paths are whitelisted (`.html` only, no `..`, `realpath` must stay inside root). `_private`, `api`, `builder` and `assets` cannot be edited. |
| Saves | Automatic backup before every save (30 kept) with restore. An mtime check catches two editors saving over each other. There is a size limit, and the save is refused if editor markup leaks into the page. |
| Uploads | Real image check (`getimagesize`), JPG/PNG/WebP/GIF only, 8 MB limit, random file names. `.htaccess` blocks scripts in `uploads/`. |
| Canvas | Page scripts are switched off while editing, so sliders and other JavaScript-built content are never saved as frozen HTML. |
| Responsive styles | Stored as CSS (desktop, then ≤1024px, then ≤640px), not inline styles. Unused styles are removed when saving. |
| Tested | Section and element insertion, spacing, desktop vs mobile values, Google Font link, save and backup all passed. |

## 🔴 High priority
1. **Header and footer are copied into all 87 pages.** Editing the menu, phone number or footer in the builder changes **only that one page**, and the site becomes inconsistent. *Fix:* a "Global" mode that applies header/footer edits to every page (with backups), or a warning shown when the header/footer is selected.
2. **The "Text" box in Content removes formatting.** Typing there replaces the element's text, which deletes bold, italic and links inside it. *Fix:* hide the box for elements that contain formatting, or edit only the plain text parts.
3. **The canvas iframe has no sandbox.** Page scripts are disabled, but *inline* handlers (`onerror=`, `onclick=`) still run with the builder's access. That means HTML pasted into the Code editor could read the login token. There are no such handlers in the site today (0 found), so the risk comes only from pasted code. *Fix:* strip `on*=` attributes and `javascript:` links when loading and when applying code.
4. **The Code editor allows `<script>` / `<iframe>`.** They don't run in the editor, but they **go live on the website** after saving. *Fix:* block them, or require a clear confirmation.

## 🟠 Medium
5. **"Enable link" can produce invalid HTML**, such as an `<a>` wrapped around an `<li>`, or links inside links. Limit it to images and blocks, and refuse it inside an existing link.
6. **The save guard rejects any page containing the word "contenteditable"**, for example a blog post about HTML. Check for the attribute instead of the word.
7. **Theme fonts ≠ element fonts.** The Theme panel offers only 3 fonts, while elements get 26 Google Fonts. Make them the same (this needs a whitelist update in PHP and Node).
8. **No link picker.** URLs are typed by hand, so typos cause 404s. Add a dropdown of the 87 pages.
9. **No SEO or accessibility warnings.** Nothing flags a missing image alt text, two H1s, or skipped heading levels. The SEO tab could show these.
10. **Unsaved work is lost if the tab crashes or the login expires** (12h). Add an autosave draft in localStorage, and ask to sign in again without reloading.
11. **Google Fonts** load from Google (privacy and speed). Consider hosting the chosen fonts on the site.

## 🟡 Low
12. The builder is unusable below about 1100px wide (no layout for small screens), which is fine for desktop admins only.
13. The icons are emoji, so they look different on different computers. Switch to SVG icons.
14. The media library has no delete, search or unused-image cleanup, so `uploads/` will grow.
15. Undo keeps 100 full-page snapshots in memory, which is fine for now.
16. Small bug: a leftover `S.open.add({})` call in `renderLayers`. Harmless.
17. `logout` does nothing on the server (tokens are stateless). A password change is the only way to force-logout all sessions. Document this.
18. Dragging an element into a section with no inner container drops it at the section root, which can break some section layouts.

## Recommended order
1 → 2 → 3/4 (one sanitize pass) → 8 → 10 → 5/6 → 7 → the rest.
Items 2–6 are about half a day together. Item 1 (global header/footer) is the largest, at about half a day.
