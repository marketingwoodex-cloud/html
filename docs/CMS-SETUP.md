# Woodex website — Sveltia CMS setup

The site is static. Editable text lives in `content/*.json` files, managed
visually at `/admin/` (Sveltia CMS — free, no server, MIT licence).
The loader `assets/js/wx-loader.js` fills `[data-wx]` elements from those
files at page load. If a file or key is missing, the baked-in HTML stays.

## Go-live checklist

1. **Create a GitHub repo** (e.g. `woodex/woodex-website`) and push this
   directory (`git remote add origin <url> && git push -u origin main`).
2. **Set the repo in `admin/config.yml`**: replace `OWNER/REPO` with your
   `user/repo`, commit and push.
3. **Netlify**: Team "Marketing woodex" → Add new site → Import from Git →
   select the repo. Build settings: **no build command**, publish directory
   **`.`** (repo root). Deploy.
4. **Editor login**: GitHub → Settings → Developer settings → Personal access
   tokens → Fine-grained token → select the repo → Repository permissions:
   **Contents: Read and write**. Open `https://<your-site>/admin/` →
   **Sign In Using Access Token** → paste the token.
5. **Edit**: change text in `/admin/`, save → commits to the repo → Netlify
   rebuilds → live in ~1–2 minutes.

## Adding editable fields

1. Add a field in `admin/config.yml` under the page's file
   (name `hero_kicker` ↔ `data-wx="home.hero_kicker"` on the page;
   names ending in `_image` are treated as images by the loader).
2. Add the matching key to `content/<page>.json`.
3. Add `data-wx="<page>.<section>.<field>"` to the element in the HTML.

To make a whole new page editable: add its JSON file, a `files:` entry in
`config.yml`, and `data-wx` attributes in its HTML.
