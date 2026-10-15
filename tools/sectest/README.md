# Security attack tests (real PHP 8.3 via WebAssembly)
Setup: `mkdir -p ~/.cache/phpw && cd ~/.cache/phpw && npm i @php-wasm/node @php-wasm/universal && cp <repo>/tools/sectest/* .`
Build page list (t1 false-positive check): see FINAL-SECURITY-TEST.md. Run: `node h.mjs t1.php` (XSS filter + restore paths), `t2.php` (evil backup zip), `t3.php` (webhook, SSRF, form relay), `t8.php` (builder roles), `lint.php` (parse all PHP).
