# P18 A2: print17 totals/blocks/footer/PDF download. Idempotent.
R="/home/user/-marketingwoodex/"
def sub(path,old,new,tag):
    s=open(R+path).read()
    if tag in s: return
    assert old in s,(path,old[:70]); s=s.replace(old,new,1); open(R+path,"w").write(s)
F="frontend-v1/admin/admin-print17.js"
sub("frontend-v1/api/sales-lib.php","'email' => 'info@woodex.com.pk', 'web' => 'woodex.com.pk', 'ntn'","'email' => 'woodexinterior.pk@gmail.com', 'web' => 'woodex.com.pk', 'ntn'","woodexinterior.pk@gmail.com', 'web'")
s=open(R+"tools/frontend-v1-admin.mjs").read()
i=s.index("const companyCfg = () =>"); j=s.index("\n",i); line=s[i:j]
if "woodexinterior" not in line: s=s[:i]+line.replace('"info@woodex.com.pk"','"woodexinterior.pk@gmail.com"',1)+s[j:]; open(R+"tools/frontend-v1-admin.mjs","w").write(s)
# page: no browser header/footer (margin 0), spacers repeat on every page
sub(F,"""'@page{size:A4;margin:10mm 12mm 14mm;@bottom-right{content:\"Page \" counter(page) \" of \" counter(pages);font:7pt \"DM Sans\",Arial,sans-serif;color:#8a6a40}}' +""",
 """'@page{size:A4;margin:0}' + /*P18page*/""","P18page")
sub(F,"@media print{body{background:#fff}.doc{width:auto;margin:0;padding:0;box-shadow:none}.xf{position:fixed;left:0;right:0;bottom:0}.xf-sp{height:10mm}}@media screen{.xf{margin-top:9mm}.xf-sp{display:none}}",
 "@media print{body{background:#fff}.doc{width:auto;margin:0;padding:0 12mm;box-shadow:none}.xf{position:fixed;left:0;right:0;bottom:0}.xf-sp{height:21mm}.xh-sp{height:11mm}}@media screen{.xf{margin:10mm -12mm -14mm}.xf-sp,.xh-sp{display:none}}"
 "body.dl{background:#fff}.dl .doc{margin:0;box-shadow:none;padding:0 12mm}.dl .xf,.dl .xf-sp,.dl .xh-sp{display:none!important}","body.dl")
sub(F,""".xf{border-top:1px solid var(--line);padding-top:2mm;font-size:7pt;color:var(--mut);display:flex;justify-content:space-between;gap:6mm;background:#fff}.xf b{color:var(--g2);font-weight:600}""",
 """.xf{background:#fff}.xf-t{display:flex;justify-content:space-between;align-items:center;gap:6mm;padding:2.6mm 12mm 2.4mm;font-size:7.8pt;font-weight:600;letter-spacing:.03em;color:#1f2937;border-top:1px solid var(--line)}.xf-t i{font-style:normal;color:var(--gold);margin:0 2.2mm}.xf-t b{font-weight:700;letter-spacing:.06em}"""
 """.xf-bar{position:relative;height:6mm;background:#0b0f17}.xf-bar:before{content:'';position:absolute;right:0;top:0;bottom:0;width:72mm;background:#2b2f37;clip-path:polygon(7mm 0,100% 0,100% 100%,0 100%)}.xf-bar:after{content:'';position:absolute;right:0;top:0;width:65mm;height:.7mm;background:var(--gold)}/*P18foot*/""","P18foot")
# wrap: thead spacer
sub(F,"<table class='pg'><tbody><tr><td>\" + inner","<table class='pg'><thead><tr><td><div class='xh-sp'></div></td></tr></thead><tbody><tr><td>\" + inner","xh-sp'></div></td></tr></thead>")
# footer markup
sub(F,"""    var ph = String(c.phones || \"\").split(\"·\")[0].trim();
    return '<div class=\"xf\"><span>' + esc(ph) + \" &nbsp;|&nbsp; \" + esc(c.address) + \" &nbsp;|&nbsp; \" + esc(c.web) + \"</span><span><b>Thank you for your business</b> · \" + esc(label) + \"</span></div>\";""",
 """    var ph = String(c.phones || \"\").split(\"·\")[0].trim(); /*P18fm*/
    var bits = [ph, c.email, c.address, c.web].filter(Boolean).map(esc).join(\"<i>|</i>\");
    return '<div class=\"xf\"><div class=\"xf-t\"><span>' + bits + \"</span><b>Thank you for your business</b></div><div class='xf-bar'></div></div>\";""","P18fm")
# totals
sub(F,"""  function totals(d, label) {
    return""","""  function totals(d, label) { /*P18tot*/
    var rows = function (k, v, neg) { return \"<div><span>\" + k + \"</span><span>\" + (neg ? \"– \" : \"\") + money(v) + \"</span></div>\"; };
    var any = d.discount || d.tax || d.rent, adv = +d.advance || 0;
    return '<div class=\"foot2\"><div class=\"words\"><small>Amount in words</small>Rupees ' + P.words(adv ? d.total - adv : d.total) + ' Only' + (adv ? \"<small style='margin-top:1.4mm'>(balance payable after advance)</small>\" : \"\") + '</div><div class=\"tot\">' +
      (any ? rows(\"Subtotal\", d.subtotal) : \"\") + (d.discount ? rows(\"Discount\", d.discount, 1) : \"\") + (d.rent ? rows(\"Rent / transport\", d.rent) : \"\") +
      (d.tax ? rows(\"Total tax (\" + (+d.taxPct || 0) + \"%)\", d.tax) : \"\") + '<div class=\"g\"><span>' + (label || (any || adv ? \"GRAND TOTAL (Rs)\" : \"TOTAL (Rs)\")) + \"</span><span>\" + money(d.total) + \"</span></div>\" +
      (adv ? rows(\"Advance\", adv, 1) + '<div class=\"g\" style=\"background:#fff;color:var(--ink);border:1.5px solid var(--ink)\"><span>BALANCE PAYABLE (Rs)</span><span style=\"color:var(--ink)\">' + money(d.total - adv) + \"</span></div>\" : \"\") + \"</div></div>\";
  }
  function totalsOld(d, label) {
    return""","P18tot")
open(R+F,"a").close()
print("ok")
