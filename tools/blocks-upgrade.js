#!/usr/bin/env node
// blocks-upgrade.js — classify raw blocks into typed blocks with fields.
// Only writes a block when extract() regenerates its html byte-identically
// (identity guarantee), otherwise it stays raw. html is never modified.
const fs = require("fs"), path = require("path");
const PB = require("../admin/pb-blocks.js");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "blocks.json") out.push(p);
  }
  return out;
}

let changed = 0, blocks = 0, stats = {};
for (const f of walk(path.join(__dirname, "..", "content", "pages"))) {
  const arr = JSON.parse(fs.readFileSync(f, "utf8"));
  let dirty = false;
  for (const b of arr) {
    blocks++;
    if (b.fields && b.type && b.type !== "raw") { stats[b.type] = (stats[b.type] || 0) + 1; continue; }
    const got = PB.extract(b.html);
    if (!got) continue;
    const back = PB.regen({ type: got.type, html: b.html, fields: got.fields });
    if (back !== b.html) continue;
    b.type = got.type;
    b.fields = got.fields;
    stats[got.type] = (stats[got.type] || 0) + 1;
    dirty = true; changed++;
  }
  if (dirty) {
    fs.writeFileSync(f, JSON.stringify(arr, null, 1) + "\n", "utf8");
  }
}
console.log(`blocks: ${blocks} | upgraded-now: ${changed} | typed totals:`, stats);
