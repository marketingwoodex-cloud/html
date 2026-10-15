# Final security and bug test (P19), 5 Oct 2026
Tested locally on a copy of the site, never against the live server. PHP code ran in **real PHP 8.3** (WebAssembly build). The admin ran in a real Chromium browser against the Node preview mirror.

## Attack tests: 229 checks, 0 open issues
| Test | What we tried | Result |
|---|---|---|
| PHP syntax | All 28 API files compiled by real PHP 8.3 | Pass |
| XSS filter (F-05) | 45 XSS payloads (`<svg/onload>`, entity-encoded `javascript:`, `srcdoc`, `data:` URLs, `meta refresh`, `base`, `formaction`…) plus an edit on every one of the 91 real pages for false alarms | **5 bypasses found and fixed**, now 178/178 |
| Evil backup zip (F-03/F-04) | Real zip with overwrites of `config.json`/`security.json`/`.htaccess`, `.user.ini`, PHP shells, `../` zip-slip, `api/` overwrite and a fake Owner in `wx_users` | 12/12 blocked; normal files still restore |
| WhatsApp webhook (F-02) | No secret, fake signature, wrong key, tampered body, case tricks | All refused; real Meta signature accepted |
| SSRF (F-06) | `http:`, `127.0.0.1`, `[::1]`, decimal/hex IPs, `nip.io`, cloud metadata, DNS rebinding, ports, user@host, `file:`/`gopher:` | All blocked; normal image link OK |
| Spam relay (F-01) | 201 victim numbers/emails, reformatted phone, email case | Only 60 messages (daily cap); repeats blocked |
| Builder roles | Editor/Admin/Sales/anonymous add token-stealing script; Owner; Editor reusing existing site scripts | Only the Owner can add scripts; normal editing unaffected |
| Access-control sweep | Every action in every API file must check permissions | All checked. `db_reconnect` needs the builder password; `sec_*` only affect the user's own account; the Owner's sessions are protected |
| Stored XSS in admin | 404 log, lead/client names, toasts | All escaped (`esc()`, `textContent`) |

## Bug and regression tests: 166 browser checks
P19 suites: p19-q 31, p19-f 8, p19-ct 6, p19-sf 12, p19-et 8. Also qa-edge 20, qa-leak 3, p18-e 10, p18-chat 13, p18-h 26, all admin screens open, and 87 public pages × 2 widths with 0 layout issues.
- 3 old P18 checks expect pre-P19 behaviour: the chat bubble now hides on minimise (P19 bug fix), and the new countdown coming-soon page has new wording. These are not bugs.
- **Fixed:** the system pages (404/500/503/coming-soon) were listed under Service pages.

## Not covered (needs the live server)
Hostinger/Apache config, TLS, Cloudflare/WAF, real MySQL, real Meta/Turnstile calls, DoS and load. No exploit was run against woodex.com.pk. Re-run tests: `tools/sectest/`.
