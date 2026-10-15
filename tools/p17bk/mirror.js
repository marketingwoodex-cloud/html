  // ---- P17 booking mirror (same actions as api/booking-lib.php)
  const BKF = path.join(PRIV, "booking.json"), BK_ST = { pending: "Waiting for approval", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled", noshow: "No-show" };
  const BK_DEF = { on: true, types: [{ k: "visit", label: "Site visit", dur: 60, on: true, hint: "Our designer visits your home, office or site to measure and discuss." }, { k: "office", label: "Office meeting", dur: 60, on: true, hint: "Meet the team at our Lahore studio and see materials." }, { k: "online", label: "Online call", dur: 30, on: true, hint: "A video or WhatsApp call to talk through your project." }],
    days: [1, 2, 3, 4, 5, 6], open: "10:00", last: "18:30", step: 60, maxDay: 3, minHours: 12, ahead: 30, areas: ["Lahore", "Other city (on request)"], blocked: [] };
  const bkCfg = () => Object.assign({}, BK_DEF, jr(BKF, {}));
  const pkNow = () => new Date(Date.now() + 5 * 3600e3); // Asia/Karachi (UTC+5, no DST) read with UTC getters
  const ymd = (d) => d.toISOString().slice(0, 10);
  const bkMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
  const bkHm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const bkLabel = (d, tm) => { const t = new Date(d + "T" + tm + ":00Z"); if (isNaN(t)) return d + " " + tm; const h = t.getUTCHours(); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][t.getUTCDay()] + " " + t.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()] + ", " + ((h % 12) || 12) + ":" + tm.slice(3) + " " + (h < 12 ? "am" : "pm"); };
  const bkType = (c, k) => c.types.find((t) => t.k === k) || null;
  const bkClosed = (c, d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + "T00:00:00Z"))) return "Invalid date";
    const today = ymd(pkNow()), lim = ymd(new Date(Date.parse(today + "T00:00:00Z") + c.ahead * 864e5));
    if (d < today) return "Past date"; if (d > lim) return "Too far ahead";
    const dow = new Date(d + "T00:00:00Z").getUTCDay() || 7; if (!c.days.map(Number).includes(dow)) return "Closed"; if ((c.blocked || []).includes(d)) return "Closed"; return "";
  };
  const bkFree = (db, c, d, dur, skip = 0, team = false) => {
    if (!team && bkClosed(c, d)) return [];
    const rows = (db.bookings || []).filter((b) => b.d === d && ["pending", "confirmed"].includes(b.status) && b.id !== skip);
    if (!team && rows.length >= c.maxDay) return [];
    const earliest = pkNow().getTime() + c.minHours * 3600e3, out = [];
    for (let m = bkMin(c.open); m <= bkMin(c.last); m += Math.max(15, c.step)) {
      if (!team && Date.parse(d + "T" + bkHm(m) + ":00Z") < earliest) continue;
      if (!rows.some((r) => m < bkMin(r.tm) + r.dur && bkMin(r.tm) < m + dur)) out.push(bkHm(m));
    }
    return out;
  };
  const bkRow = (b, c, db) => ({ ...b, type_label: (bkType(c, b.type) || {}).label || b.type, staff: b.staff_id ? ((db.users.find((u) => u.id === b.staff_id) || {}).name || "") : "", when: bkLabel(b.d, b.tm) });
  const bkNotify = (b, ev) => { const c = bkCfg(), t = bkType(c, b.type) || {}; const r = {}; const ref = (t.label || "Meeting") + " on " + bkLabel(b.d, b.tm);
    if (b.phone) { r.whatsapp = "sent (preview outbox)"; ntLog.unshift({ t: now(), event: ev, ref, name: b.name, channel: "wa", dest: b.phone, result: "sent" }); }
    if (b.email) { r.email = "sent (preview outbox)"; ntLog.unshift({ t: now(), event: ev, ref, name: b.name, channel: "email", dest: b.email, result: "sent" }); }
    fs.appendFileSync(OUTBOX, JSON.stringify({ t: now(), channel: "notify", event: ev, to: b.phone, ref }) + "\n"); return r; };
  const bkHits = new Map();
  async function bkPublic(req, inp) {
    const c = bkCfg(), db = load(); if (!db) throw new Fail("Booking is not available right now. Please WhatsApp us.", 503); ensureCrm(db); db.bookings = db.bookings || []; db.seqB = db.seqB || 0;
    if (inp.action === "book_cfg") { const days = {}, t0 = Date.parse(ymd(pkNow()) + "T00:00:00Z"); for (let i = 0; i <= c.ahead; i++) { const d = ymd(new Date(t0 + i * 864e5)); days[d] = !bkClosed(c, d) && bkFree(db, c, d, Math.min(...c.types.filter((t) => t.on).map((t) => t.dur), 480)).length ? 1 : 0; }
      return { ok: true, on: !!c.on, types: c.types.filter((t) => t.on).map((t) => ({ k: t.k, label: t.label, dur: t.dur, hint: t.hint || "" })), areas: c.areas, days, today: ymd(pkNow()) }; }
    if (!c.on) throw new Fail("Online booking is closed right now. Please WhatsApp us.", 503);
    if (inp.action === "book_slots") { const t = bkType(c, String(inp.type || "visit")); if (!t || !t.on) throw new Fail("Choose what you want to book"); return { ok: true, slots: bkFree(db, c, String(inp.date || ""), t.dur) }; }
    if (clip(inp._hp)) return { ok: true, id: 0 };
    const ip = req.socket.remoteAddress || "", h = (bkHits.get(ip) || []).filter((x) => Date.now() - x < 600000); if (h.length >= 3) throw new Fail("Too many bookings from this connection. Please WhatsApp us instead.", 429); h.push(Date.now()); bkHits.set(ip, h);
    const t = bkType(c, String(inp.type || "")); if (!t || !t.on) throw new Fail("Choose what you want to book");
    const name = clip(inp.name, 120), phone = clip(inp.phone, 40), email = clip(inp.email, 190);
    if (name.length < 2) throw new Fail("Please enter your name"); if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) throw new Fail("Please enter a valid phone number"); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fail("Please check your email address");
    const city = clip(inp.city, 80), address = clip(inp.address, 300), note = clip(inp.note, 1000), d = String(inp.date || ""), tm = String(inp.time || "");
    if (t.k === "visit" && address.length < 4) throw new Fail("Please enter the site address");
    if (!bkFree(db, c, d, t.dur).includes(tm)) throw new Fail("Sorry, that time was just taken — please pick another.", 409);
    const when = bkLabel(d, tm), fields = Object.fromEntries(Object.entries({ booking: t.label + " · " + when, city, address }).filter(([, v]) => v));
    const l = { id: ++db.seqL, created_at: now(), source: "booking", page: clip(inp.page || "/book-a-visit/", 200), name, phone, email, service: clip(inp.service, 120) || t.label, message: note, fields, stage: "visit", assigned_to: null, followup: d, next_at: d + " " + tm + ":00", next_type: t.k === "visit" ? "visit" : "meeting", value: 0, lost_reason: "", client_id: null, tags: [], notes: [], read: false, ip };
    db.leads.push(l);
    const b = { id: ++db.seqB, created_at: now(), lead_id: l.id, name, phone, email, type: t.k, city, address, d, tm, dur: t.dur, status: "pending", staff_id: 0, note, src: "web", reminded: 0 };
    db.bookings.push(b); save(db); sendAlerts({ ...l, service: t.label + " — " + when }).catch(() => {});
    return { ok: true, id: b.id, when, type: t.label };
  }
  async function pbk(action, inp, need, db, ip) {
    if (!["bk_list", "bk_save", "bk_status", "bk_cfg", "bk_cfg_save", "bk_slots", "bk_remind"].includes(action)) return null;
    ensureCrm(db); db.bookings = db.bookings || []; db.seqB = db.seqB || 0; const c = bkCfg(), done = (o) => { save(db); return o; }, today = ymd(pkNow());
    const team = db.users.filter((u) => u.active && SALES.includes(u.role)).map((u) => ({ id: u.id, name: u.name }));
    switch (action) {
      case "bk_list": { need(SALES); const from = /^\d{4}-\d{2}-\d{2}$/.test(inp.from || "") ? inp.from : ymd(new Date(pkNow() - 7 * 864e5)), to = /^\d{4}-\d{2}-\d{2}$/.test(inp.to || "") ? inp.to : ymd(new Date(+pkNow() + 60 * 864e5));
        const srt = (a, b) => (a.d + a.tm < b.d + b.tm ? -1 : 1);
        return { ok: true, items: db.bookings.filter((b) => b.d >= from && b.d <= to).sort(srt).map((b) => bkRow(b, c, db)), pending: db.bookings.filter((b) => b.status === "pending" && b.d >= today).sort(srt).map((b) => bkRow(b, c, db)), team, status: BK_ST, cfg: c, today }; }
      case "bk_slots": { need(SALES); const t = bkType(c, String(inp.type || "visit")) || { dur: 60 }; return { ok: true, slots: bkFree(db, c, String(inp.date || ""), t.dur, +inp.id || 0, true), closed: bkClosed(c, String(inp.date || "")) }; }
      case "bk_save": {
        const u = need(SALES), id = +inp.id || 0, t = bkType(c, String(inp.type || "")); if (!t) throw new Fail("Choose a booking type");
        const d = String(inp.d || ""), tm = String(inp.tm || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(tm)) throw new Fail("Choose a date and time");
        const name = clip(inp.name, 120), phone = clip(inp.phone, 40); if (name.length < 2 || !phone) throw new Fail("Name and phone are required");
        const dur = Math.max(15, Math.min(480, +inp.dur || t.dur));
        if (!inp.force) { const x = db.bookings.find((r) => r.d === d && r.id !== id && ["pending", "confirmed"].includes(r.status) && bkMin(tm) < bkMin(r.tm) + r.dur && bkMin(r.tm) < bkMin(tm) + dur); if (x) return { ok: false, clash: true, error: "Clashes with " + x.name + " at " + x.tm }; }
        const staff = +inp.staff_id || 0; if (staff && !team.some((m) => m.id === staff)) throw new Fail("Unknown team member");
        const v = { name, phone, email: clip(inp.email, 190), type: t.k, city: clip(inp.city, 80), address: clip(inp.address, 300), d, tm, dur, staff_id: staff, note: clip(inp.note, 1000) };
        let b; if (id) { b = db.bookings.find((r) => r.id === id); if (!b) throw new Fail("Booking not found", 404); if (b.d !== d || b.tm !== tm) b.reminded = 0; Object.assign(b, v); }
        else { b = { id: ++db.seqB, created_at: now(), lead_id: +inp.lead_id || 0, status: BK_ST[inp.status] ? inp.status : "confirmed", src: "team", reminded: 0, ...v }; db.bookings.push(b); }
        const l = b.lead_id && db.leads.find((x) => x.id === b.lead_id); if (l) { l.next_at = d + " " + tm + ":00"; l.followup = d; l.next_type = t.k === "visit" ? "visit" : "meeting"; }
        const sent = inp.notify && b.status === "confirmed" ? bkNotify(b, "booking") : {};
        log(db, u, "booking.save", "#" + b.id, ip); return done({ ok: true, item: bkRow(b, c, db), sent });
      }
      case "bk_status": {
        const u = need(SALES), b = db.bookings.find((r) => r.id === +inp.id); if (!b) throw new Fail("Booking not found", 404); if (!BK_ST[inp.status]) throw new Fail("Unknown status");
        b.status = inp.status; const l = b.lead_id && db.leads.find((x) => x.id === b.lead_id); if (l) l.notes.push({ t: now(), user: u.name, text: "Booking " + bkLabel(b.d, b.tm) + ": " + BK_ST[b.status], sys: true });
        const sent = b.status === "confirmed" && inp.notify !== false ? bkNotify(b, "booking") : {};
        log(db, u, "booking.status", "#" + b.id + " " + b.status, ip); return done({ ok: true, item: bkRow(b, c, db), sent });
      }
      case "bk_remind": { need(["owner", "admin"]); const tom = ymd(new Date(+pkNow() + 864e5)); let n = 0; for (const b of db.bookings) if (b.d === tom && b.status === "confirmed" && !b.reminded) { bkNotify(b, "remind"); b.reminded = 1; n++; } return done({ ok: true, reminders: n }); }
      case "bk_cfg": need(SALES); return { ok: true, cfg: c };
      case "bk_cfg_save": {
        const u = need(["owner", "admin"]), s = inp.cfg || {}, n = { ...c }, hm = /^([01]\d|2[0-3]):[0-5]\d$/;
        if ("on" in s) n.on = !!s.on;
        for (const k of ["open", "last"]) if (s[k] != null) { if (!hm.test(s[k])) throw new Fail("Check the opening hours"); n[k] = s[k]; }
        if (bkMin(n.last) < bkMin(n.open)) throw new Fail("Last slot must be after opening time");
        for (const [k, a, z] of [["step", 15, 240], ["maxDay", 1, 30], ["minHours", 0, 168], ["ahead", 1, 180]]) if (s[k] != null) n[k] = Math.max(a, Math.min(z, +s[k] || 0));
        if (s.days) n.days = [...new Set(s.days.map(Number).filter((x) => x >= 1 && x <= 7))];
        if (s.areas) n.areas = s.areas.map((x) => clip(x, 60)).filter(Boolean).slice(0, 30);
        if (s.blocked) n.blocked = [...new Set(s.blocked.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].slice(0, 200);
        if (s.types) { const ty = s.types.slice(0, 8).map((x) => ({ k: String(x.k || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20), label: clip(x.label, 40), dur: Math.max(15, Math.min(480, +x.dur || 60)), on: !!x.on, hint: clip(x.hint, 160) })).filter((x) => x.k && x.label); if (!ty.length) throw new Fail("Keep at least one booking type"); n.types = ty; }
        jw(BKF, n); log(db, u, "booking.settings", "", ip); return { ok: true, cfg: n };
      }
    }
    return null;
  }
