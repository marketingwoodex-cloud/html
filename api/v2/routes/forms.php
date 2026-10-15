<?php
/**
 * api/v2/routes/forms.php — the website's forms: where each one is, and where its enquiries go.
 *
 *   GET  /forms   `forms_get`   — every form, the pages it is on, where those pages post, and the leads that arrived
 *   POST /forms   `forms_save`  — one form's alert settings: who is emailed, who is WhatsApped, what the visitor is told back
 *
 * Both carry v2.1's own action names (`forms_get`, `forms_save` from `p18e-lib.php`), so the permission groups
 * and the approval policy are the ones the business already agreed to — nothing new to justify. A Manager's save
 * waits for the Master exactly as it did before the rewrite.
 *
 * **The read is the interesting one.** v2.1's screen listed six forms and looked for *its own* markup to say
 * which pages carried them. That answer is wrong in a way that matters here: the live pages post their enquiries
 * to Netlify functions, so a form can be on twenty pages and never reach `wx_leads` — and a screen that only
 * checked for its own patterns would show "0 submissions" with no reason given. So the read does not stop at
 * "this page has a form": it names the address the page posts to, and whether that address is one whose leads
 * land in this console. A form going somewhere else is labelled as such, by address, rather than shown as zero.
 */

declare(strict_types=1);

/** Who may read and edit the form settings: v2.1's `website` group, named here so a refusal reads well. */
const WX_FORM_EDIT = ['owner', 'admin', 'editor'];

/** GET /forms — the six forms, the pages each is on, where those pages post, and the leads so far. */
function wx_route_forms_get(array $ctx): array
{
    wx_require_user('forms_get', WX_FORM_EDIT);
    return ['data' => wx_form_report()];
}

/** POST /forms — save one or more forms' alert settings. */
function wx_route_forms_save(array $ctx): array
{
    return wx_appr_route('forms_save', $ctx, 'forms', 'wx_route_forms_save_do', static fn() => wx_route_forms_save_do($ctx));
}

function wx_route_forms_save_do(array $ctx): array
{
    $me = wx_require_user('forms_save', WX_FORM_EDIT);
    $forms = wx_form_save(is_array($ctx['body'] ?? null) ? $ctx['body'] : [], $me);
    return ['data' => ['forms' => $forms], 'meta' => ['message' => 'Saved — each form alerts to the addresses set here.']];
}
