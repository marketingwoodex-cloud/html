<?php
/**
 * api/v2/lib/templates.php — the quotation templates: one per type of work.
 *
 * A template is a quotation with no client: sections, line items and default terms, priced or left for the
 * estimator to fill in per job. v2.1 kept them in `wx_templates` as a JSON document with the name mirrored
 * into a UNIQUE column, and its screen offered exactly four things — list, save, delete, import. That shape
 * is kept, because the studio's habits are in it, and the rules are the ones v2.1's `tpl_row()` enforced:
 *
 *   · a name is required, and two templates cannot share one (the column is UNIQUE, so this is also the
 *     database's rule, not only the screen's);
 *   · the kind is one of four, and anything else is stored as `other` rather than refused — v2.1 substituted
 *     the default, and a template that suddenly cannot be saved because a console sent a new kind is worse
 *     than a template filed under Other;
 *   · sections go through `wx_clean_sections()`, the same cleaner a quotation's own sections go through, so a
 *     template can never hold a line a quotation would refuse: a line with no description is refused by field
 *     (not stored empty), a unit outside v2.1's list becomes `job`, and a heading or a specification line
 *     carries no quantity and no price;
 *   · the total is derived with `wx_doc_totals()` — the one implementation of document arithmetic — so the
 *     figure the list shows is the figure a quotation built from the template would come to.
 *
 * The starter set is content, not code: `assets/js/quotation-templates.js` is what the live site loads
 * (`window.WX_QUOT_TEMPLATES`), and `api/v2/data/quote-starters.json` is generated from it by
 * `node tools/gen-quote-starters.mjs`. Two copies of nine BOQ templates typed by hand would drift on the
 * first edit; one generated from the other cannot. `node tools/gen-quote-starters.mjs --check` is what keeps
 * that true, and it runs in the gate.
 */

declare(strict_types=1);

/** The four kinds v2.1 has, with the labels its screen showed. Anything else is `other`. */
const WX_TPL_KINDS = [
    'design' => 'Interior design',
    'fitout' => 'Fit-out',
    'renovation' => 'Renovation',
    'other' => 'Other',
];

/** v2.1's limits: name 80, description 400, terms 3000, and 50 templates in one import. */
const WX_TPL_NAME_MAX = 80;
const WX_TPL_DESC_MAX = 400;
const WX_TPL_TERMS_MAX = 3000;
const WX_TPL_IMPORT_MAX = 50;

/** The file the starter set is generated into. */
const WX_TPL_STARTER_FILE = '/data/quote-starters.json';

/** One of the four kinds, or `other` — v2.1's substitution, kept. */
function wx_tpl_kind($kind): string
{
    $k = is_scalar($kind) ? strtolower(trim((string) $kind)) : '';
    return isset(WX_TPL_KINDS[$k]) ? $k : 'other';
}

/**
 * A template from client input, validated and normalised.
 *
 * Throws with the field named rather than silently writing a half a template: a name is the one field a
 * person would notice missing, and the caller decides what to do about the others (the save route refuses,
 * the import route skips the row and says which one).
 *
 * @param array $old the stored template when this is an update, so nothing typed stays lost
 */
function wx_tpl_clean(array $in, array $old = []): array
{
    $name = wx_v_string($in['name'] ?? '', 'name', 1, WX_TPL_NAME_MAX);
    $description = wx_v_opt_string($in['description'] ?? '', 'description', WX_TPL_DESC_MAX) ?? '';
    $terms = wx_v_opt_string($in['terms'] ?? '', 'terms', WX_TPL_TERMS_MAX) ?? '';
    $kind = array_key_exists('kind', $in) ? wx_tpl_kind($in['kind']) : wx_tpl_kind($old['kind'] ?? 'other');
    $sections = wx_clean_sections($in['sections'] ?? ($old['sections'] ?? []));

    return [
        'name' => $name,
        'kind' => $kind,
        'description' => $description,
        'sections' => $sections,
        'terms' => $terms,
    ];
}

/**
 * A template as a screen reads it: the document, plus the four figures a list can show without opening it.
 *
 * `priced` is the count of lines that carry a rate. A template whose rates are all zero is the normal case
 * for a new one — the estimator fills them per job — and the screen says "rates to fill" instead of "Rs 0",
 * which is a claim about the client rather than about the template.
 */
function wx_tpl_row(array $t): array
{
    $t = wx_doc_totals($t);
    $items = 0;
    $priced = 0;
    foreach ($t['sections'] as $s) {
        foreach ($s['items'] as $it) {
            $items++;
            if (wx_numv($it['rate'] ?? 0) > 0) {
                $priced++;
            }
        }
    }
    $terms = (string) ($t['terms'] ?? '');
    $firstTerm = '';
    foreach (preg_split('~\r\n|\r|\n~', $terms) ?: [] as $line) {
        if (trim($line) !== '') {
            $firstTerm = trim($line);
            break;
        }
    }

    return [
        'id' => (int) ($t['id'] ?? 0),
        'name' => (string) $t['name'],
        'kind' => (string) $t['kind'],
        'kindLabel' => WX_TPL_KINDS[(string) $t['kind']] ?? WX_TPL_KINDS['other'],
        'description' => (string) ($t['description'] ?? ''),
        'sections' => $t['sections'],
        'sectionCount' => count($t['sections']),
        'lineCount' => $items,
        'pricedCount' => $priced,
        'subtotal' => (int) $t['subtotal'],
        'total' => (int) $t['total'],
        'totalDisplay' => wx_pkr_out((int) $t['total']),
        'terms' => $terms,
        'termsFirst' => $firstTerm,
        'created_at' => (string) ($t['created_at'] ?? ''),
        'updated_at' => (string) ($t['updated_at'] ?? ''),
    ];
}

/**
 * The templates that ship with the product, ready to import — read from the generated file.
 *
 * Each one goes through `wx_tpl_clean()`, the same as a template posted from a screen, so a starter that
 * would not survive a save cannot be imported either. A malformed file is a product bug, not a user error,
 * and it throws rather than importing what it can: silently importing six of nine templates is how a studio
 * ends up with an incomplete BOQ and no idea which part is missing. The gate proves the file parses.
 */
function wx_tpl_starters(): array
{
    $file = WX_V2_DIR . WX_TPL_STARTER_FILE;
    if (!is_file($file)) {
        return [];
    }
    $rows = json_decode((string) file_get_contents($file), true);
    if (!is_array($rows)) {
        throw ApiError::internal('The shipped quotation templates are not valid JSON — run node tools/gen-quote-starters.mjs');
    }
    $out = [];
    foreach ($rows as $r) {
        if (is_array($r)) {
            $out[] = wx_tpl_clean($r);
        }
    }
    return $out;
}

/**
 * The starter set as a list row, for the screen's import button: what it would add, before it is added.
 *
 * `imported` is decided by name, because that is the rule the import itself uses — a template whose name is
 * already saved is skipped, so the button can say "six of nine" honestly instead of offering to import nine
 * and quietly adding six.
 */
function wx_tpl_starter_rows(array $savedNames): array
{
    $saved = [];
    foreach ($savedNames as $n) {
        $saved[(string) $n] = true;
    }
    $out = [];
    foreach (wx_tpl_starters() as $s) {
        $row = wx_tpl_row($s);
        $row['imported'] = isset($saved[$row['name']]);
        unset($row['id']);
        $out[] = $row;
    }
    return $out;
}
