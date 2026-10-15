// P17 S4 quotation layouts API test: "Interior Arch" project quotation (summary total 4,157,300) + single-page quotation.
const B = "http://127.0.0.1:8080/api/admin.php"; let T = "";
const call = async (action, o = {}) => (await fetch(B, { method: "POST", headers: { "content-type": "application/json", ...(T ? { "X-WX-ADM": T } : {}) }, body: JSON.stringify({ action, ...o }) })).json();
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
T = (await call("login", { email: "o@woodex.pk", password: "Woodex@2026x" })).token;
const co = (await call("company_get")).company;
ok(co.banks.length === 2 && co.banks[0].iban === "PK06ALFH0293001007869105" && co.wallets.length === 2 && co.signers[0].name === "Imtiaz Ahmad", "default banks / wallets / signers");
await call("company_save", { company: { payTerms: "50% advance with work order\n40% on completion of wood work\n10% on handover", signers: [...co.signers, { name: "  ", title: "" }], banks: [...co.banks, { bank: "Test", use: "hack" }] } });
const co2 = (await call("company_get")).company; ok(co2.signers.length === 2 && co2.banks.length === 3 && co2.banks[2].use === "all", "lists cleaned on save (blank signer dropped, bad 'use' → all)");
await call("company_save", { company: { banks: co.banks } });
const it = (desc, qty, unit, rate, extra = {}) => ({ desc, qty, unit, rate, ...extra });
const sections = [
  { name: "Civil work", area: 2200, items: [it("Brick masonry partition walls 4.5\" thick with cement sand mortar 1:4", 1100, "sft", 420), it("Cement plaster 1:4, 1/2\" thick on new walls", 2200, "sft", 100)] },
  { name: "Flooring", area: 2350, items: [it("Porcelain tiles 24x48 (Master / equivalent) incl. laying, grout and spacers", 2350, "sft", 650), it("Skirting 4\" matching tile", 425, "rft", 215)] },
  { name: "Ceiling", area: 1500, items: [it("Gypsum board false ceiling with GI framing, joint taping and putty", 1500, "sft", 80)] },
  { name: "Paint", area: 4250, items: [it("Emulsion paint (ICI Dulux Weathershield / equivalent) 2 coats over 2 coats putty", 4250, "sft", 31.0882353)] },
  { name: "Wood work", area: 0, items: [it("Media wall", 0, "job", 0, { kind: "head" }), it("Frame in kiln-dried solid wood, 18mm MDF base, 1mm HPL finish (Formica), concealed LED strip and soft-close drawers.", 0, "job", 0, { kind: "spec" }),
    it("TV panel with fluted veneer cladding 10' x 9'", 90, "sft", 4250), it("Low console 8' with 4 drawers", 1, "nos", 185000),
    it("Wardrobes", 0, "job", 0, { kind: "head" }), it("Master bedroom wardrobe 8' x 8', sliding shutters, lacquer finish", 64, "sft", 6875), it("Kids room wardrobe 6' x 8'", 48, "sft", 3753.125)] },
  { name: "Glass work", area: 380, items: [it("12mm tempered glass partition with patch fittings", 380, "sft", 1096.4473684)] },
  { name: "Curtain & blinds", area: 0, items: [] }, { name: "Electrical", area: 0, items: [] }, { name: "Plumbing", area: 0, items: [] }];
const q = await call("quote_save", { client: { name: "Mr. Faisal Rehman", company: "Interior Arch (Pvt) Ltd", phone: "0300 4441122", address: "Plot 14, DHA Phase 6, Lahore" }, project: "Corporate office interior", site: "DHA Phase 6, Lahore", sections, layout: "project", qtype: "interior", scope: "Civil and finishing works\nFlooring and ceiling\nWood work and wardrobes\nGlass partitions" });
ok(q.ok, "project quote saved " + (q.error || ""));
const x = q.quote, sub = Object.fromEntries(x.sections.map((s) => [s.name, Math.round(s.subtotal)]));
ok(sub["Civil work"] === 682000 && sub["Flooring"] === 1618875 && sub["Ceiling"] === 120000 && sub["Paint"] === 132125 && sub["Wood work"] === 1187650 && sub["Glass work"] === 416650, "trade subtotals " + JSON.stringify(sub));
ok(x.total === 4157300, "TOTAL 4,157,300 → " + x.total);
ok(x.layout === "project" && x.qtype === "interior" && x.scope.includes("Glass"), "layout / type / scope kept");
const w = x.sections[4].items; ok(w[0].kind === "head" && w[1].kind === "spec" && w[1].amount === 0 && x.sections[1].area === 2350, "heading/spec rows + area kept");
const s1 = await call("quote_save", { client: { name: "Dr Sana Malik", company: "Gulberg Dental Clinic", phone: "0321 7654321" }, project: "Clinic renovation", layout: "single", qtype: "renovation",
  sections: [{ name: "Electrical and HVAC", items: [it("Complete wiring with Pakistan Cables 3/29, DB and breakers", 1, "lumpsum", 285000), it("Split AC 1.5 ton installation incl. copper piping", 3, "nos", 18500)] }, { name: "Wood work", items: [it("Reception counter with Corian top", 1, "nos", 165000)] }], discount: 15000, taxPct: 0, terms: "" });
ok(s1.ok && s1.quote.total === 285000 + 55500 + 165000 - 15000, "single-page quote total " + (s1.quote && s1.quote.total));
const cp = await call("quote_copy", { id: x.id, mode: "option" }); ok(cp.ok && (cp.quote || {}).layout === "project", "option copy keeps layout");
console.log(JSON.stringify({ project: x.id, single: s1.quote.id }));
