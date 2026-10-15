# Woodex P19 — Security Audit Report
> **Update:** all findings are fixed in the new `woodex-live-p19-full.zip`. See `REMEDIATION.md`.

Method: Cloudflare `security-audit-skill`, **quick profile**, source review only (no PHP runtime, nothing run against the live site). One agent played every role, so findings were **not independently verified**. Treat severities as the reviewer's best estimate.

## Summary
| # | Severity | Finding | Who can exploit |
|---|---|---|---|
| F-03 | **High** | Backup restore can overwrite `_private/` secrets and `.htaccess` | Admin → Owner (maybe code execution) |
| F-04 | **High** | DB restore replaces the users table | Admin → Owner |
| F-01 | Medium | Public form sends auto-replies to any phone/email; `form=whatsapp` skips Turnstile | Anyone (spam relay, WhatsApp bill, sender reputation) |
| F-02 | Medium | WhatsApp webhook accepts unsigned events when App secret is empty | Anyone (fake chats/leads, forged STOP opt-outs) |
| F-05 | Medium | Editor `<script>` runs inside admin previews (unsandboxed iframe) | Editor → Owner session |
| F-06 | Low | URL import follows redirects to private addresses (SSRF) | Editor |
| NV-1 | Needs validation | Public AI chat cost limited only per IP | Anyone (AI spend) |

8 candidate issues were checked and **rejected** (protections hold): CSRF, DB reconnect, mail header injection, chat IDOR, quote-link guessing, upload execution, empty cron key, `.htaccess` redirect injection.

## Recommended fixes (priority order)
1. F-03/F-04: make backup/DB restore **Owner-only**; restore only an allow-list (pages, assets, data) and never `_private/`, `.htaccess` or `wx_users`.
2. F-02: reject webhook POSTs when the App secret is not set (fail closed).
3. F-01: Turnstile on every form type; auto-reply only once per number/email per day, global daily cap.
4. F-05: add `sandbox="allow-same-origin"` without `allow-scripts` (or a separate preview origin) to admin preview iframes.
5. F-06: `follow_location=0`, re-check each redirect target.
6. NV-1: daily global AI-message cap in chat settings.

Details: `FINDINGS-DETAIL.md`. Open questions: `NEEDS-VALIDATION.md`. Machine data: `findings.json`, `coverage-ledger.json`.
