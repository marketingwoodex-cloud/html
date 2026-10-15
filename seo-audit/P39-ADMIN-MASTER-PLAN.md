# P39 Admin master plan: roles, approvals, organised dashboard, chat + WhatsApp agent
7 Oct 2026 · Your choices: 5 roles · Manager changes wait for Master approval · keep navy + gold look · improve every existing feature + add what's missing, per role.
Deploy happens AFTER this plan is finished.

---
## 1. How the sections connect today (and the gaps)

```
Website chat bubble ─┐                         ┌─> Enquiries & leads ─> Pipeline ─> Quotes ─> Invoices
WhatsApp (Cloud API) ┼─> Inbox (chat) ─ AI ────┤        (CRM: one record per phone/email)
Website forms ───────┘     │   uses Train AI   └─> Clients ─> Projects ─> Client updates (WhatsApp + email at 4 steps)
                           │
Offers & broadcasts ───────┴─ sends WhatsApp templates to CRM contacts (segments)
Automation & templates ─── auto-replies, welcome / away / follow-up messages, template library
Train AI ───────────────── Q&A + business facts the AI uses in Inbox (web + WhatsApp)
```

| Section | What it does now | What is connected | Gap / problem |
|---|---|---|---|
| Inbox | Website chat + WhatsApp threads, AI first, team takeover, files | Train AI, CRM ([LEAD] tag saves lead) | No "assigned to", no notes, no SLA timer, no tags, no canned replies, everyone sees all chats |
| Offers & broadcasts | Send a WhatsApp template to a list | CRM contacts | No segments by stage/service/city, no schedule, no delivery/read report per send, no opt-out list |
| Automation & templates | Auto-reply rules, templates | Inbox, Offers | No visual flow (if/then), no follow-up sequences (day 1/3/7), no "no reply in X hours" alerts |
| Client updates | 4 project steps, EN + UR, WhatsApp + email | Projects, Clients | Not triggered automatically by project stage change; no photo attach |
| Train AI | Q&A, facts, test box | Inbox AI | No "unanswered questions" list to learn from, no per-channel tone, no AI score report |
| WhatsApp (menu item) | Connect screen + stats | Everything above | Spread over 5 screens; no single "WhatsApp hub" |
| Theme, colours & fonts | Website theme | Website only | Listed twice (Website + Settings) |
| Settings group | 10 screens in one long list | — | Hard to find; mixes owner-only (Database, Backups) with daily items |

---
## 2. Roles (new)

| Role | Who | Home dashboard | Can do | Cannot |
|---|---|---|---|---|
| **Master** (was Owner) | Owner | Business overview + **Approvals** | Everything; approves/rejects changes; users & roles; database; backups | — |
| **Manager** | Office manager | Whole-business overview | Sees everything; prepares any change | Change goes **live only after Master approves** |
| **Developer** | Web person | Website health | Pages & builder, hero slides, theme, content, SEO, redirects, media, integrations | Leads, clients, quotes, money, users |
| **Sales / Lead** | Sales team | My leads today | Enquiries, pipeline, clients, bookings, quotes, inbox (own + unassigned) | Website, settings, other people's money reports |
| **Support** | Chat team | My chats | Inbox, client updates, view client/project | Quotes, website, settings |

- Old roles map automatically: owner → Master, admin → Manager, editor → Developer, sales → Sales.
- Server checks every action (not only hidden menus).
- Master can tick extra permissions per user (e.g. Sales person allowed to send broadcasts).

## 3. Master approval flow
1. Manager edits something (page, price, theme, setting, broadcast, user) → saved as **Pending** (not live).
2. Master gets bell + email + WhatsApp: "Ali changed Home hero, approve?"
3. Approvals screen: before / after view → **Approve** (goes live) / **Reject** with note / **Edit then approve**.
4. Everything logged in Activity log. Pending items expire after 14 days.
5. Developer changes: go live directly (they are the builder), but Master can switch on "Developer needs approval too".

## 4. Organised menu (per role, same navy + gold look)
- **Home** (role dashboard) · **Approvals** (Master; badge count)
- **Sales**: Leads · Pipeline · Bookings · Clients · Quotes & invoices · Projects
- **Conversations**: Inbox · WhatsApp hub (Broadcasts · Automations · Templates · Connect) · Client updates · AI agent (Train · Unanswered · Settings)
- **Website**: Pages & builder · Hero slides · Section library · Content · Media · SEO · Theme
- **Admin** (Master only): Users & roles · Business info · Integrations · Backups · Database · File manager · Maintenance · Activity log · System check
- **Me**: My profile · My security
- Each role sees only its groups. Search (Ctrl K) respects roles.

## 5. Dashboards per role
- **Master/Manager**: today's leads, pipeline value, quotes waiting, won this month, chats waiting, approvals waiting, site health, WhatsApp delivery.
- **Sales**: my follow-ups due today, new unassigned leads, my pipeline, my quotes awaiting reply, my chats.
- **Support**: chats waiting + oldest wait time, my open chats, AI hand-offs, client updates due.
- **Developer**: SEO health, broken links, speed score, pages edited recently, form errors, 404s.

## 6. Conversations + AI agent upgrade
**Inbox**
- Assign to person (auto round-robin to Sales/Support who are online), "Mine / Unassigned / All" tabs
- Internal notes, tags (hot, quote, complaint), status (open / waiting / closed)
- SLA timer: first reply under 5 min (red after), alert manager if no reply in 30 min
- Canned replies (/ shortcuts), quick buttons: send brochure, book visit, send quote
- Contact side panel: CRM stage, past quotes, project, previous chats; "Create lead / quote" in one click
**AI agent**
- AI answers first, hands off on: price request, complaint, "talk to human", low confidence, VIP
- Hand-off goes to the assigned person with a 2-line summary
- Books site visits (Bookings), collects name/phone/area/budget → lead with stage New
- Unanswered-questions list → one click "add to Train AI"
- Office hours aware (Mon–Sat 9:30–6:30): after hours AI + "team replies at 9:30"
- Reports: AI handled %, hand-offs, leads created, avg reply time
**WhatsApp hub**
- Broadcasts: segments (stage, service, city, last contact), schedule, test send, delivery/read/reply report, opt-out list respected
- Automations: simple if/then builder (trigger → wait → message → tag/assign), follow-up sequences (day 1/3/7 after quote), "no reply 24h" reminder
- Templates: Meta approval status, variables preview, EN + UR
**Client updates**: send automatically when project stage changes; attach photos; client reply goes back to Inbox.

## 7. Phases (review with you after each)
| Phase | Scope |
|---|---|
| 1 | Roles + permissions (server + menu), role mapping, per-user extra permissions, Users screen update |
| 2 | Master approval system: pending changes, approvals screen, before/after, alerts, log |
| 3 | Organised menu + 5 role dashboards |
| 4 | Inbox upgrade: assign, notes, tags, status, SLA, canned replies, contact panel |
| 5 | AI agent upgrade: hand-off rules + summary, bookings, unanswered list, reports |
| 6 | WhatsApp hub: broadcasts segments/schedule/reports, automation builder, follow-ups, client updates auto |
| 7 | Full QA (every role logs in and tests), security check, fresh P20 zip → deploy |

Test logins after Phase 1 (preview only): master / manager / developer / sales / support.
