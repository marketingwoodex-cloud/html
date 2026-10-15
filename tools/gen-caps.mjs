#!/usr/bin/env node
/**
 * tools/gen-caps.mjs — generate db/migrations/001_roles.sql from the live v2.1 authority.
 *
 * The capability matrix decides who may do what. It exists today in `frontend-v1/api/roles-lib.php`
 * (consts and a switch) and it will exist in v2.5 as six MySQL tables. Those two must be the same
 * answer, and the only way to be sure is to extract one from the other rather than type it twice.
 *
 * So this reads v2.1's code and writes the migration. `--check` re-extracts and compares against the
 * file on disk (CI runs it), which is what makes "the matrix did not change" a fact rather than a hope.
 *
 *   node tools/gen-caps.mjs            write db/migrations/001_roles.sql
 *   node tools/gen-caps.mjs --check    fail if the file on disk differs from the generated one
 *   node tools/gen-caps.mjs --json     print the extracted matrix (for review)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "frontend-v1/api/roles-lib.php");
const TARGET = join(ROOT, "db/migrations/001_roles.sql");

const check = process.argv.includes("--check");
const asJson = process.argv.includes("--json");

const src = readFileSync(SOURCE, "utf8");
const fail = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/* ------------------------------------------------------------------ extraction */

/** const NAME = ['a' => 'b', ...]; → [[a, b], ...] */
function pairs(name) {
  const m = new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(src);
  if (!m) fail(`could not find const ${name} in ${SOURCE}`);
  const out = [];
  for (const p of m[1].matchAll(/'([^']+)'\s*=>\s*'([^']*)'/g)) out.push([p[1], p[2]]);
  if (!out.length) fail(`const ${name} parsed to nothing`);
  return out;
}

/** const NAME = ['a' => ['b', 'c'], ...]; → [[a, [b, c]], ...] */
function mapLists(name) {
  const m = new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(src);
  if (!m) fail(`could not find const ${name}`);
  const out = [];
  for (const p of m[1].matchAll(/'([^']+)'\s*=>\s*\[([^\]]*)\]/g)) {
    out.push([p[1], [...p[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]);
  }
  if (!out.length) fail(`const ${name} parsed to nothing`);
  return out;
}

/** The role → groups switch. */
function roleGroups() {
  const fn = /function wx_role_groups\(string \$role\): array \{([\s\S]*?)\n\}/.exec(src);
  if (!fn) fail("could not find wx_role_groups()");
  const out = [];
  for (const c of fn[1].matchAll(/case '([a-z]+)':\s*return \[([^\]]*)\];/g)) {
    out.push([c[1], [...c[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]);
  }
  if (!out.length) fail("wx_role_groups() has no cases");
  return out;
}

/** The ordered action → pattern map inside wx_action_group(). */
function actionGroups() {
  const fn = /function wx_action_group\(string \$a\): \?string \{([\s\S]*?)\n\}/.exec(src);
  if (!fn) fail("could not find wx_action_group()");
  const block = fn[1].slice(fn[1].indexOf("$map = ["), fn[1].indexOf("\n    ];"));
  const out = [];
  for (const line of block.split("\n")) {
    const m = /^\s*'([a-z_]+)'\s*=>\s*'(~[\s\S]*~)',?\s*$/.exec(line.replace(/\/\/.*$/, ""));
    if (m) out.push([m[1], m[2]]);
  }
  if (!out.length) fail("wx_action_group() has no patterns");
  return out;
}

/** The role list a screen is restricted to, where v2.1 hardcodes it inside wx_allowed(). */
function restrictedActions() {
  const fn = /function wx_allowed\(([\s\S]*?)\n\}/.exec(src);
  if (!fn) fail("could not find wx_allowed()");
  const m = /in_array\(\$action,\s*\[([^\]]*)\],\s*true\)\)\s*return in_array\(\$role,\s*\[([^\]]*)\],\s*true\);/.exec(fn[1]);
  if (!m) fail("wx_allowed() no longer has a role-restricted list — read it before regenerating");
  const actions = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const roles = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const out = [];
  for (const a of actions) for (const r of roles) out.push([a, r]);
  return out;
}

const roles = pairs("ROLE_LABELS");
const roleGroupsMap = roleGroups();
const expand = mapLists("EXPAND");
const shared = mapLists("SHARED");
const groups = actionGroups();
const restricted = restrictedActions();

const expandSet = new Set();
for (const [grp, roleList] of expand) for (const r of roleList) expandSet.add(r + "|" + grp);

const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const groupRows = roleGroupsMap.flatMap(([role, list]) =>
  list.map((grp) => `  (${sqlStr(role)}, ${sqlStr(grp)}, ${expandSet.has(role + "|" + grp) ? 1 : 0})`),
);
const sharedRows = shared.flatMap(([action, list]) => list.map((grp) => `  (${sqlStr(action)}, ${sqlStr(grp)})`));
const restrictedRows = restricted.map(([action, role]) => `  (${sqlStr(action)}, ${sqlStr(role)})`);
const actionRows = groups.map(
  ([grp, pattern], i) => `  ('${String(i + 1).padStart(2, "0")}', ${sqlStr(grp)}, ${sqlStr(pattern)})`,
);

const generated = `-- db/migrations/001_roles.sql
--
-- GENERATED FILE — do not edit by hand.
-- Source: frontend-v1/api/roles-lib.php (the live v2.1 authority) via tools/gen-caps.mjs.
-- Regenerate:  node tools/gen-caps.mjs
-- Verify:      node tools/gen-caps.mjs --check   (CI fails when this file drifts from v2.1)
--
-- Why a generated file rather than a table someone edits: the capability answer must not change when
-- v2.1 is replaced. v2.1 built its matrix out of five consts and two functions; if v2.5 typed that
-- matrix out again the two would disagree within a release, and the disagreement would show up as
-- somebody losing access they have today — or keeping access they should not. So the matrix is
-- extracted from the code that is running in production right now.
--
-- What each table is:
--
--   wx_roles          role id → the word a person reads
--   wx_role_groups    what each role may do in general, plus \`expand\` (see below)
--   wx_action_groups  group → the pattern its actions match, in evaluation order
--   wx_action_shared  screens of more than one group: allowed when the user has ANY of them
--   wx_action_roles   screens restricted to named roles, overriding the group answer
--   wx_user_perms     per-user grants on top of the role, which v2.1 kept in a JSON column
--
-- \`expand\` is v2.1's EXPAND const: it lets a role perform an action whose own role list was narrower,
-- where the *screen* belongs to that role. It is the mechanism that lets a developer save a page
-- without holding the permissions of whoever wrote the page list.
--
-- Re-running this file is safe: every row is INSERT IGNORE and nothing is ever deleted, so a host that
-- has granted per-user permissions keeps them.

CREATE TABLE IF NOT EXISTS wx_roles (
  id VARCHAR(20) NOT NULL PRIMARY KEY,
  label VARCHAR(40) NOT NULL,
  sort INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_role_groups (
  role VARCHAR(20) NOT NULL,
  grp VARCHAR(40) NOT NULL,
  expand TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (role, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* 400 characters: one of the patterns below is longer than 300, and a truncated pattern is a
   permission that quietly stops matching. */
CREATE TABLE IF NOT EXISTS wx_action_groups (
  ord VARCHAR(4) NOT NULL PRIMARY KEY,
  grp VARCHAR(40) NOT NULL,
  pattern VARCHAR(400) NOT NULL,
  is_regex TINYINT(1) NOT NULL DEFAULT 1,
  INDEX wx_action_groups_grp (grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_action_shared (
  action VARCHAR(80) NOT NULL,
  grp VARCHAR(40) NOT NULL,
  PRIMARY KEY (action, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_action_roles (
  action VARCHAR(80) NOT NULL,
  role VARCHAR(20) NOT NULL,
  PRIMARY KEY (action, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_user_perms (
  user_id INT NOT NULL,
  grp VARCHAR(40) NOT NULL,
  granted_at DATETIME NULL,
  granted_by INT NULL,
  PRIMARY KEY (user_id, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------------------------------------------------------------- generated content */
INSERT IGNORE INTO wx_roles (id, label, sort) VALUES
${roles.map(([id, label], i) => `  (${sqlStr(id)}, ${sqlStr(label)}, ${i + 1})`).join(",\n")};

INSERT IGNORE INTO wx_role_groups (role, grp, expand) VALUES
${groupRows.join(",\n")};

INSERT IGNORE INTO wx_action_shared (action, grp) VALUES
${sharedRows.join(",\n")};

/* Screens that stay owner+admin even where a broader pattern also matches them. v2.1 hardcoded this
   list inside wx_allowed(); it is data here so the answer is visible without reading PHP. */
INSERT IGNORE INTO wx_action_roles (action, role) VALUES
${restrictedRows.join(",\n")};

/* The patterns, in the order wx_action_group() evaluates them. Order decides the answer where two
   patterns match the same action, which is why \`ord\` is part of the table rather than a comment. */
INSERT IGNORE INTO wx_action_groups (ord, grp, pattern, is_regex) VALUES
${actionRows.join(",\n")};
`;

if (asJson) {
  console.log(JSON.stringify({ roles, roleGroups: roleGroupsMap, expand, shared, groups: groups.map(([g]) => g), restricted }, null, 2));
  process.exit(0);
}

if (check) {
  const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
  if (current !== generated) {
    fail("db/migrations/001_roles.sql is out of date with frontend-v1/api/roles-lib.php — run: node tools/gen-caps.mjs");
  }
  console.log(`✓ 001_roles.sql matches v2.1 (${roles.length} roles · ${groupRows.length} role/group rows · ${groups.length} group patterns · ${sharedRows.length} shared rows · ${restrictedRows.length} role-restricted rows)`);
  process.exit(0);
}

writeFileSync(TARGET, generated);
console.log(`✓ wrote db/migrations/001_roles.sql (${generated.length} bytes)`);
console.log(`  ${roles.length} roles · ${groupRows.length} role/group rows · ${groups.length} group patterns · ${sharedRows.length} shared rows · ${restrictedRows.length} restricted rows`);
