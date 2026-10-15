# Woodex hotfix P22.2: security fixes for the live admin (v2.0)

**Upload this after Phase 0** (Appendix A of the P25.1 plan — removed in the 15 Oct clean-up, in git history). Phase 0 covers the backup, deleting
the five risky files, and changing every password. This hotfix is the second wall: it does not replace those steps.

## What it changes

| Fix | What you will notice |
|---|---|
| The sign-in page and the reconnect message no longer show the first-install login | Nothing, except the hint is gone |
| The admin saves its settings files in one step (temp file + rename) | Nothing: no more empty or half-written settings after a crash |
| `.htaccess` and `sitemap.xml` are also written in one step | Nothing: a crash can no longer leave the site without `.htaccess` |
| If the session-secret file cannot be read, the admin answers "busy, try again" instead of signing everyone out | You are not signed out by surprise |
| Any unexpected error returns a short message with a reference (`ref 1a2b3c4d`) instead of a blank page | Give the reference to your developer; it is in the error log |
| The six sample studies on `/projects/` are called "design studies" | New label; the pages still say plainly that they are not built client projects |
| `.htaccess` lines (you paste them, step 4): `wx-*.php` answers 403, `downloads.html` and `blocks.html` answer 410 Gone | The installers can never run again, even if someone uploads them by mistake |

The zip holds 11 files: `api/admin.php`, `api/forms.php`, `admin/index.html`, `llms.txt` and the 7 pages in `projects/`.
It does **not** hold `.htaccess`, `sitemap.xml` or anything in `_private/`, so your redirects, pages and settings
are not touched.

## Install (about 10 minutes)

1. **Backup.** hPanel → Files → Backups: download a file backup. If you already made one today for Phase 0, use that.
2. **Upload.** hPanel → Files → File Manager → open `public_html` → Upload → `woodex-hotfix-P22.2.zip`.
   Right-click the zip → Extract → extract into `public_html` itself (not a new folder) → allow it to overwrite.
3. **Delete the zip** from `public_html` once it has been extracted.
4. **Paste the `.htaccess` lines.** In File Manager, right-click `public_html/.htaccess` → Edit. Find the **first**
   line that says `RewriteEngine On` and paste the contents of `htaccess-snippet.txt` directly below it. Save.
   Do not replace the file, and do not edit the block between `BEGIN WOODEX-ADMIN` and `END WOODEX-ADMIN`.
5. **Rebuild the sitemap.** In the admin, open **SEO** and press **Rebuild** on the "Pages in sitemap.xml" card.
   The admin rebuilds `sitemap.xml` from the `.html` files on the server, so `downloads` and `blocks` drop out
   once they are deleted (Phase 0, step 0.2).

## Check (5 minutes)

| Open | Expect |
|---|---|
| `https://woodex.com.pk/wx-install.php` | 403 Forbidden (or 404) |
| `https://woodex.com.pk/downloads.html` | 410 Gone (or 404) |
| `https://woodex.com.pk/sitemap.xml` | no `downloads` or `blocks` lines |
| `https://woodex.com.pk/admin/` | you can sign in; the setup screen no longer shows a default login |
| `https://woodex.com.pk/projects/` | the studies are called "design studies" |
| The contact form | a test enquiry arrives in the admin inbox |

**If anything looks wrong:** restore the 11 files (or the whole backup) from step 1, and remove the pasted lines from
`.htaccess`. Nothing in this hotfix changes the database.

**If you edited any `/projects/` page in the admin after 8 October:** skip the `projects/` folder when you extract
(or tell your developer), so your edits are not overwritten.

## For the developer

- Built with `python3 tools/make-hotfix.py --name P22.2 --snippet … api/admin.php api/forms.php admin/index.html projects llms.txt`.
- `MANIFEST.json` gives the commit, and the SHA-256 of every file before (`base_sha256`, from `main` at `aa96524`,
  i.e. P22.1) and after. After deploying, inventory `public_html` and compare it with the manifest (master plan §8.3).
- Never shipped: `wx-install.php`, `wx-check.php`, `wx-demo.php`, `downloads.html`, `blocks.html`, `_private/`.
