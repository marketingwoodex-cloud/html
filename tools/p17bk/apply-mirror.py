import os
os.chdir(os.path.join(os.path.dirname(__file__), '../..'))
p='tools/frontend-v1-admin.mjs'; s=open(p).read()
def ed(a,b):
    global s
    if b in s: return
    assert a in s, a[:60]; s=s.replace(a,b,1)
blk=open('tools/p17bk/mirror.js').read()
if 'P17 booking mirror' not in s: ed("  async function a17(action, inp, need, db, ip) {", blk + "  async function a17(action, inp, need, db, ip) {")
ed('const r = (await a2(action, inp, need, db, ip)) ||', 'const r = (await pbk(action, inp, need, db, ip)) || (await a2(action, inp, need, db, ip)) ||')
ed('  async function formsApi(req, inp) {\n    const c = crmCfg();', '  async function formsApi(req, inp) {\n    if (["book_cfg", "book_slots", "book_create"].includes(inp.action)) return bkPublic(req, inp);\n    const c = crmCfg();')
ed('const SOURCES = { contact: "Contact form", ', 'const SOURCES = { contact: "Contact form", booking: "Online booking", ')
ed('handover: "Handover" };', 'handover: "Handover", booking: "Booking confirmed", remind: "Booking reminder (day before)" };')
ed('''    handover: { on: true,''', '''    booking: { on: true, subject: "Confirmed: {ref}", tpl: "", text: ntMsg("Your {ref} is confirmed. Place: {project}.", "آپ کی ملاقات ({ref}) کنفرم ہو گئی ہے۔ جگہ: {project}۔") },
    remind: { on: true, subject: "Reminder: {ref}", tpl: "", text: ntMsg("A friendly reminder of your {ref} tomorrow. Place: {project}.", "یاد دہانی: کل آپ کی ملاقات ({ref}) ہے۔ جگہ: {project}۔") },
    handover: { on: true,''')
open(p,'w').write(s); print('mirror ok')
