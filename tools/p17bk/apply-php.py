# re-applies P17 booking hooks to existing PHP files (idempotent)
import os
os.chdir(os.path.join(os.path.dirname(__file__), '../../frontend-v1/api'))
def ed(p, a, b):
    s = open(p).read()
    if b in s: return
    assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))
ed('admin.php', "require __DIR__ . '/notify-lib.php';", "require __DIR__ . '/notify-lib.php';\nrequire __DIR__ . '/booking-lib.php';")
ed('admin.php', "default: if (!sales17_actions($action, $in) &&", "default: if (!sales17_actions($action, $in) && !booking_actions($action, $in) &&")
ed('admin.php', "out(['ok' => true, 'published' => $n, 'backups' => $bk]);", "$rm = 0; try { $rm = bk_remind(); } catch (Throwable $e) { error_log('booking remind: ' . $e->getMessage()); } out(['ok' => true, 'published' => $n, 'backups' => $bk, 'reminders' => $rm]);")
ed('forms.php', "\ntry {\n    if (clip($in['_hp']", """
// P17 booking (site visit / meeting / online call)
if (in_array((string)($in['action'] ?? ''), ['book_cfg', 'book_slots', 'book_create'], true)) {
    require __DIR__ . '/booking-lib.php';
    try { booking_public($in); } catch (PDOException $e) { error_log('booking: ' . $e->getMessage()); fail('Could not save your booking. Please WhatsApp us.', 500); }
}

try {
    if (clip($in['_hp']""")
ed('crm-lib.php', "const CRM_SOURCES = ['contact' => 'Contact form', ", "const CRM_SOURCES = ['contact' => 'Contact form', 'booking' => 'Online booking', ")
ed('notify-lib.php', "'handover' => 'Handover'];", "'handover' => 'Handover', 'booking' => 'Booking confirmed', 'remind' => 'Booking reminder (day before)'];")
ed('notify-lib.php', """    ],
    'waLang' => 'en',""", """        'booking' => ['on' => true, 'subject' => 'Confirmed: {ref}', 'tpl' => '', 'text' =>
            "Dear {name},\\nYour {ref} is confirmed. Place: {project}.\\nNeed to change it? Just reply to this message.\\n\\nمحترم {name}، آپ کی ملاقات ({ref}) کنفرم ہو گئی ہے۔ جگہ: {project}۔ تبدیلی کے لیے اسی پیغام کا جواب دیں۔\\n\\n{company} · {phone}"],
        'remind' => ['on' => true, 'subject' => 'Reminder: {ref}', 'tpl' => '', 'text' =>
            "Dear {name},\\nA friendly reminder of your {ref} tomorrow. Place: {project}.\\nSee you then!\\n\\nمحترم {name}، یاد دہانی: کل آپ کی ملاقات ({ref}) ہے۔ جگہ: {project}۔\\n\\n{company} · {phone}"],
    ],
    'waLang' => 'en',""")
print('php hooks ok')
