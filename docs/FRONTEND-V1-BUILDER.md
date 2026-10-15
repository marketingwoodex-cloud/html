# Woodex Live Page Builder (frontend-v1)

Open **`/builder/`** on the site to edit any page visually. Changes are saved straight into the page HTML, so they appear on the live site as soon as you save.

## First use
1. Open `https://your-domain/builder/`.
2. **First run:** choose the admin password (minimum 8 characters). Do this **straight after uploading** the site, because the first person to open `/builder/` sets the password.
3. After that, sign in with that password.

## What you can do
| Tab | What it does |
|---|---|
| **Sections** | List of every section on the page: drag to reorder, and ↑ ↓ move, ⧉ duplicate, 👁 hide/show, 🗑 delete. Selected-section options: background (white / light / beige / navy), spacing (compact / normal / spacious), centre-align, swap image side |
| **Edit** | Click any text in the preview and type directly. Toolbar: bold, italic, link, clear formatting, alignment. Links and buttons: address, new tab, button style. Images: upload, choose from library, alt text. Element: duplicate, move, delete, select parent |
| **+ Add** | Section library: CTA band, text + image, image + text, feature cards, numbers strip, process steps, gallery, testimonials, FAQ, text block, logos strip, Why Woodex |
| **Theme** | Site-wide brand colours, body and heading fonts, base text size, section spacing, content width, button and card roundness. Saved to `/assets/theme.css`, so it applies to all pages |
| **SEO** | Page title and meta description, with a Google preview and length counters |

Top bar: page picker, desktop/tablet/mobile preview, undo/redo (Ctrl+Z / Ctrl+Y), **Save (Ctrl+S)**, View page, and the ⋯ menu (page history/restore, change password, sign out).

Keyboard while editing text: **Enter** finishes editing, **Shift+Enter** adds a line break, **Esc** deselects. Pasted text is inserted as plain text.

## Safety
- Password login (hashed with `password_hash`), CSRF token on every change, and a limit on login attempts.
- **A backup is made automatically before every save.** The last 30 are kept per page and can be restored from ⋯ → Page history.
- If a page has been changed elsewhere since you opened it, you are warned before overwriting it.
- Uploads: JPG/PNG/WebP/GIF only, checked as real images, max 8 MB. PHP can't run in `/assets/uploads/`.
- `/_private/` (password hash, sessions, backups) is blocked by `.htaccess` and excluded from git.
- `/builder/`, `/api/` and `/_private/` are disallowed in `robots.txt`, and the builder page is `noindex`.

## Files
```
frontend-v1/
  builder/index.html, builder.css, builder.js, blocks.js   ← editor UI + section library
  api/builder.php                                          ← PHP backend (Hostinger)
  assets/v1.css                                            ← design system + section styles
  assets/theme.css                                         ← written by Theme panel
  assets/uploads/                                          ← uploaded images
  _private/                                                ← auto-created: config, sessions, backups
  .htaccess                                                ← HTTPS, 404, headers, cache, private block
tools/frontend-v1-server.mjs                               ← local preview server (not deployed)
```

## Deploy to Hostinger
Upload the **contents** of `frontend-v1/` to `public_html/`. It needs PHP 7.4 or newer (Hostinger default is 8.x) and no database. Make sure `public_html` is writable by PHP (the default on Hostinger).

## Local preview
```
mkdir -p ~/.local/phpwasm && cd ~/.local/phpwasm && npm i @php-wasm/cli
node tools/frontend-v1-server.mjs     # http://localhost:8080/builder/
```

## Adding your own blocks
Add an entry to `builder/blocks.js` (`{id, name, icon, html}`) using `v1.css` classes, and put any new styles in `assets/v1.css`.

## Notes
- The header and footer are edited per page. A change there applies only to the page you're editing.
- Page scripts (sliders, animations) are paused inside the editor, so all content is visible and editable. They run normally on the live site.
- The builder edits `frontend-v1` HTML directly. The old admin block builder (`/admin/`, `content/pages/*.json`) is not connected to it.

## Builder v2 (VvvebJs-style)
- **Left:** Sections (drag or click), Elements (16 small blocks), Layers tree (drag sections to reorder), Theme, SEO.
- **Canvas:** hover outline; selected toolbar (parent / up / down / duplicate / HTML / delete); ➕ adds a section below.
- **Right:** Content (text, tag, link, image, video, map, section presets), Style (typography with 26 Google Fonts, background, margin/padding, size, border, shadow, opacity), Advanced (id, classes, aria, hide per device, custom CSS).
- **Per-device styles:** the top device switch decides which one you edit (desktop base, tablet ≤1024px, mobile ≤640px). Saved into the page as `<style id="wx-custom-css">` + `<script id="wx-style-data" type="application/json">`; elements get `data-wx-s="…"`.
- **Bottom:** breadcrumb + HTML code editor.
