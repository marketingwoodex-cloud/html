# Intake rules — what happens to an enquiry before it becomes a lead (P25.2 §5.1)

*Owner-approvable decision record. The code that enforces these rules is `frontend-v1/api/intake-lib.php`
with `frontend-v1/api/forms.php`; the rules are asserted in `tests/run.php`. If this document and the code
ever disagree, the tests are the referee and this file is wrong.*

## 1. Turnstile's failure mode — **decision: accept, and record as unverified**

The form optionally checks visitors with Cloudflare Turnstile. The question is what happens when the
**check cannot be run** (Cloudflare unreachable or timed out):

- **Unreachable Cloudflare → the enquiry is accepted**, and the delivery log records its Turnstile verdict
  as `unverified`. A real enquiry is the studio's income; a Cloudflare bad minute is not a reason to lose it.
- **A delivered answer of "no" → refused** ("Spam check failed — please try again").
- No keys configured → no check (`off`); the WhatsApp widget never has a check (it opens WhatsApp).

**Compensating controls**, which exist whether or not Turnstile is up:

| Control | Rule | Where |
|---|---|---|
| Honeypot | the hidden `company_hp`/`_hp` fields filled → pretended success, nothing stored, counted as a `bot` | `forms.php` |
| Rate limit | 5 enquiries per 10 minutes per connection | `forms.php`, `wx_throttle` |
| Duplicate guard | one enquiry is one lead for 5 minutes (below) | `intake-lib.php` |
| Auto-reply cap | at most one auto-reply per phone/email per 24 h, 60 per day site-wide | `forms.php` |
| Visibility | every submission's verdict (`new` / `duplicate` / `bot`, Turnstile `ok` / `fail` / `unverified` / `off`) lands in the intake log the console shows | `_private/intake-log.json` |

## 2. Duplicate submissions — **one enquiry is one lead**

- A submission is recognised by its **phone digits (last 10) and its email**, each together with the
  **form and the page**, inside a **5-minute window** (`INTAKE_DEDUPE_SECONDS`).
  `+92 322 4000768` and `0322 4000768` are the same person; the same person on another page or another form
  is a different enquiry.
- A duplicate is answered as a **success carrying the first lead's id** — the visitor sees nothing unusual,
  the studio sees **one** lead. The same person genuinely writing again after the window is a new lead.
- The claim is one row per identity in `wx_throttle` (the table already on the host); the INSERT is the
  atomic step, so two simultaneous double-taps still make exactly one lead.
- The window is the decision: **5 minutes**. It is one constant at the top of `intake-lib.php` if the owner
  wants it longer or shorter.

## 3. Attribution — every lead says where it came from

- Each lead stores `source` (the form's id) and `page` (the page it was sent from) — already true, now shown.
- The console's **Forms** screen shows, per form: totals and the last arrival (counted on the **server** from
  the rows), and **which pages the enquiries actually arrived from** — never only where the form markup sits.
- The browser prints the server's numbers; it never re-counts a list it was handed.

## 4. No silent loss — a failed alert is a fact on a screen

- The lead is saved **first**; alerts, the auto-reply and the Sheets push happen after the visitor has been
  answered, and any of them may fail without losing the lead.
- Each channel's outcome (`alert`, `reply`, `sheets`) is recorded in `_private/intake-log.json`:
  the last outcome per channel, every failure, and counters that survive trimming.
- The console's Forms screen reads that log: "Alerts: failed at 18:04 — SMTP connect failed" is visible
  without opening an error log or a server.
- Counters shown to a person are counts kept as numbers — never the length of a trimmed list.

## 5. What a test must prove (`tests/run.php`)

1. One submission makes one lead; a double-tap inside the window makes none; the same person after the
   window makes a second lead; the same phone on another page or form is a different enquiry.
2. Unreachable Cloudflare accepts and records `unverified`; a delivered "no" refuses; no keys = `off`.
3. A failed alert is visible in the intake log with its channel and reason; the lead still exists.
4. Counters survive trimming; the reader (`wx_intake_log()`) and the writer agree on the file's shape.
