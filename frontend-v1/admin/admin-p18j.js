/* Woodex Admin — P18 J: My account (TailAdmin-style profile). Replaces the simple profile screen; uses me_* actions
   (api/p18j-lib.php) plus the existing "password" action. Also shows your photo in the top bar. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var css = document.createElement("style");
  css.textContent =
    ".pr-cover{overflow:hidden;padding:0}.pr-band{height:132px;background:radial-gradient(600px 220px at 85% 120%,rgba(184,149,106,.55),transparent),radial-gradient(400px 200px at 0 0,rgba(184,149,106,.18),transparent),#0c1628}" +
    ".pr-row{display:flex;gap:22px;align-items:flex-end;padding:0 28px 24px;margin-top:-52px;flex-wrap:wrap}.pr-av{position:relative;width:112px;height:112px;border-radius:50%;border:4px solid var(--card);background:#f4efe7;display:grid;place-items:center;font-size:34px;font-weight:700;color:#8a6a43;overflow:hidden;flex:none;box-shadow:0 6px 18px rgba(12,22,40,.15)}" +
    ".pr-av img{width:100%;height:100%;object-fit:cover}.pr-cam{position:absolute;right:2px;bottom:2px;width:34px;height:34px;border-radius:50%;border:3px solid var(--card);background:#0c1628;color:#fff;display:grid;place-items:center;cursor:pointer}.pr-cam svg{width:15px;height:15px}" +
    ".pr-id{flex:1;min-width:240px;padding-bottom:4px}.pr-id h2{margin:0;font-size:22px;letter-spacing:-.01em}.pr-id p{margin:3px 0 10px;color:var(--mut);font-size:14px}.pr-chips{display:flex;gap:8px;flex-wrap:wrap}.pr-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--line);border-radius:99px;font-size:13px;color:var(--txt2);text-decoration:none;background:var(--card)}.pr-chip svg{width:14px;height:14px;color:#b8956a}a.pr-chip:hover{border-color:#b8956a}" +
    "@media(min-width:700px){.pr-id{padding-top:60px}.pr-acts{padding-bottom:10px}}" +
    ".pr-acts{display:flex;gap:8px;padding-bottom:6px}.pr-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:20px;margin-top:20px;align-items:start}@media(max-width:1000px){.pr-grid{grid-template-columns:1fr}.pr-row{padding:0 18px 20px}}" +
    ".pr-dl{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin:0}.pr-dl dt{font-size:12px;color:var(--mut);margin-bottom:4px}.pr-dl dd{margin:0;font-size:14.5px;font-weight:600;color:var(--txt);word-break:break-word}.pr-dl dd.e{color:var(--mut2);font-weight:400}.pr-dl .w{grid-column:1/-1}@media(max-width:600px){.pr-dl{grid-template-columns:1fr}}" +
    ".pr-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pr-st{padding:14px;border:1px solid var(--line);border-radius:12px}.pr-st b{display:block;font-size:24px;letter-spacing:-.02em}.pr-st small{color:var(--mut);font-size:12.5px}.pr-st.wide{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center}" +
    ".pr-sec{display:grid;gap:10px;font-size:14px}.pr-sec div{display:flex;justify-content:space-between;gap:10px;align-items:center}.pr-sec span{color:var(--mut)}" +
    ".pr-tl{list-style:none;margin:0;padding:0}.pr-tl li{position:relative;padding:0 0 16px 26px;font-size:14px}.pr-tl li:before{content:\"\";position:absolute;left:5px;top:6px;width:9px;height:9px;border-radius:50%;background:#b8956a;box-shadow:0 0 0 4px #f4efe7}.pr-tl li:after{content:\"\";position:absolute;left:9px;top:18px;bottom:0;width:1px;background:var(--line)}.pr-tl li:last-child:after{display:none}.pr-tl small{display:block;color:var(--mut);font-size:12px;margin-top:2px}" +
    ".pr-cnt{float:right;font-weight:400;color:var(--mut);font-size:12px}#u-av.has-img{background-size:cover;background-position:center;color:transparent}";
  document.head.appendChild(css);

  var VERB = { login: "Signed in", logout: "Signed out", "profile.update": "Updated profile", "profile.avatar": "Changed profile photo", "password.change": "Changed password", "2fa.enable": "Turned on two-step sign-in", "2fa.disable": "Turned off two-step sign-in" };
  function verb(a) { if (VERB[a]) return VERB[a]; var p = String(a).split("."); return (p[0].charAt(0).toUpperCase() + p[0].slice(1)).replace(/_/g, " ") + (p[1] ? " · " + p[1].replace(/_/g, " ") : ""); }
  function initials(n) { return String(n || "?").trim().split(/\s+/).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join(""); }
  function when(t) { return W.ago ? W.ago(t) : String(t || "").slice(0, 16); }
  function setTopAvatar(url) { var a = $("#u-av"); if (!a) return; if (url) { a.style.backgroundImage = "url('" + url + "')"; a.classList.add("has-img"); } else { a.style.backgroundImage = ""; a.classList.remove("has-img"); } }
  var avDone = false;
  setInterval(function () { if (avDone || !W.S.user) return; avDone = true; api("me_avatars").then(function (r) { if (r.ok) setTopAvatar(r.avatars[String(W.S.user.id)] || ""); else avDone = false; }); }, 1500);

  /** Crop to a centred square and shrink to 400px JPEG in the browser (keeps uploads small). */
  function squareJpeg(file) {
    return new Promise(function (res, rej) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error("Choose a JPG, PNG or WebP photo"));
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas"), n = Math.min(400, s); c.width = c.height = n;
        c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, n, n); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", 0.88)); };
      img.onerror = function () { rej(new Error("That file is not a valid image")); }; img.src = u;
    });
  }

  W.VIEWS.profile = function (el) {
    el.innerHTML = head("My account", "Profile") + '<div id="pr"><div class="empty">Loading…</div></div><input type="file" id="pr-file" accept="image/jpeg,image/png,image/webp" hidden>';
    var D;
    function load() { api("me_get").then(function (r) { if (!r.ok) return ($("#pr").innerHTML = '<div class="empty">' + esc(r.error) + "</div>"); D = r; draw(); }); }
    function draw() {
      var u = D.user, p = D.profile, s = D.stats, sc = D.security, ROLE = { owner: "Master", admin: "Manager", editor: "Developer", sales: "Sales", support: "Support" };
      var wa = (p.whatsapp || p.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "92");
      var row = function (k, v, wide) { return "<div" + (wide ? ' class="w"' : "") + "><dt>" + k + "</dt><dd" + (v ? "" : ' class="e"') + ">" + (v ? esc(v) : "Not added") + "</dd></div>"; };
      $("#pr").innerHTML =
        '<div class="card pr-cover"><div class="pr-band"></div><div class="pr-row"><div class="pr-av">' + (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : initials(u.name)) + '<button type="button" class="pr-cam" id="pr-cam" title="Change photo">' + ic("image") + "</button></div>" +
        '<div class="pr-id"><h2>' + esc(u.name) + "</h2><p>" + esc([p.title || ROLE[u.role], p.city].filter(Boolean).join(" · ")) + '</p><div class="pr-chips"><span class="pr-chip">' + ic("shield") + esc(ROLE[u.role] || u.role) + '</span><a class="pr-chip" href="mailto:' + esc(u.email) + '">' + ic("mail") + esc(u.email) + "</a>" +
        (p.phone ? '<a class="pr-chip" href="tel:' + esc(p.phone.replace(/\s/g, "")) + '">' + ic("phone") + esc(p.phone) + "</a>" : "") + (wa.length > 9 && p.whatsapp ? '<a class="pr-chip" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">' + ic("message-circle") + "WhatsApp</a>" : "") + "</div></div>" +
        '<div class="pr-acts">' + (p.avatar ? '<button class="btn" id="pr-rm">Remove photo</button>' : "") + '<button class="btn pri" id="pr-ed">' + ic("square-pen") + "Edit profile</button></div></div></div>" +
        '<div class="pr-grid"><div style="display:grid;gap:20px">' +
        '<div class="card"><div class="card-h"><h3>Personal information</h3><button class="btn sm" data-ed>' + ic("square-pen") + 'Edit</button></div><div class="card-b"><dl class="pr-dl">' +
        row("Full name", u.name) + row("Email", u.email) + row("Phone", p.phone) + row("WhatsApp", p.whatsapp) + row("Job title", p.title) + row("City", p.city) + row("About me", p.bio, true) + "</dl></div></div>" +
        '<div class="card"><div class="card-h"><h3>Recent activity</h3>' + (W.can("owner,admin") ? '<a class="btn sm" href="#/activity">All activity</a>' : "") + '</div><div class="card-b">' +
        (D.activity.length ? '<ul class="pr-tl">' + D.activity.map(function (a) { return "<li><b>" + esc(verb(a.action)) + "</b>" + (a.target ? " " + esc(a.target) : "") + "<small>" + esc(when(a.created_at)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No activity yet.</p>') + "</div></div></div>" +
        '<div style="display:grid;gap:20px"><div class="card"><div class="card-h"><h3>My work this month</h3></div><div class="card-b"><div class="pr-stats">' +
        [["leads", "Enquiry updates"], ["quotes", "Quotation actions"], ["invoices", "Invoices & payments"], ["messages", "Messages"]].map(function (x) { return '<div class="pr-st"><b>' + (+s[x[0]] || 0) + "</b><small>" + x[1] + "</small></div>"; }).join("") +
        '<div class="pr-st wide"><small>Website edits</small><b>' + (+s.pages || 0) + "</b></div></div></div></div>" +
        '<div class="card"><div class="card-h"><h3>Security</h3><a class="btn sm" href="#/security">Manage</a></div><div class="card-b pr-sec">' +
        "<div><span>Two-step sign-in</span>" + (sc.totp ? '<span class="badge ok">On</span>' : '<span class="badge warn">Off</span>') + "</div><div><span>Signed-in devices</span><b>" + sc.sessions + "</b></div>" +
        "<div><span>Previous sign-in</span><b>" + (sc.lastLogin ? esc(when(sc.lastLogin.created_at)) : "—") + "</b></div>" + (u.created_at ? "<div><span>Member since</span><b>" + esc(String(u.created_at).slice(0, 10)) + "</b></div>" : "") +
        '<button class="btn block" id="pr-pw" style="margin-top:6px">' + ic("lock") + "Change password</button></div></div></div></div>";
      W.fillIcons($("#pr"));
      $("#pr-ed").onclick = edit; $$("[data-ed]", $("#pr")).forEach(function (b) { b.onclick = edit; });
      $("#pr-cam").onclick = function () { $("#pr-file").click(); };
      if ($("#pr-rm")) $("#pr-rm").onclick = function () { if (!confirm("Remove your profile photo?")) return; api("me_avatar", { remove: true }).then(function (r) { if (!r.ok) return toast(r.error, true); D.profile = r.profile; setTopAvatar(""); draw(); toast("Photo removed"); }); };
      $("#pr-pw").onclick = pw;
    }
    $("#pr-file").onchange = function () {
      var f = this.files[0]; this.value = ""; if (!f) return;
      squareJpeg(f).then(function (data) { return api("me_avatar", { data: data }); }).then(function (r) { if (!r.ok) throw new Error(r.error); D.profile = r.profile; setTopAvatar(r.profile.avatar); draw(); toast("Photo updated ✓"); }).catch(function (e) { toast(e.message, true); });
    };
    function edit() {
      var u = D.user, p = D.profile, f = function (id, label, v, ph, type) { return "<label>" + label + '<input id="' + id + '" value="' + esc(v || "") + '" placeholder="' + esc(ph || "") + '"' + (type ? ' type="' + type + '"' : "") + "></label>"; };
      modal("<h2>Edit profile</h2><p class=\"muted\">Your name and photo show in the admin and on chats you take over.</p><form id=\"pe\"><div class=\"g2\">" + f("pe-n", "Full name", u.name, "e.g. Ahmed Khan") + '<label>Email <small>(ask the owner to change)</small><input value="' + esc(u.email) + '" disabled></label>' +
        f("pe-t", "Job title", p.title, "e.g. Senior interior designer") + f("pe-c", "City", p.city, "e.g. Lahore") + f("pe-p", "Phone", p.phone, "+92 300 1234567", "tel") + f("pe-w", "WhatsApp", p.whatsapp, "+92 300 1234567", "tel") + "</div>" +
        '<label>About me <span class="pr-cnt" id="pe-bc"></span><textarea id="pe-b" rows="3" maxlength="400" placeholder="A line or two about your work">' + esc(p.bio || "") + '</textarea></label><p class="err" id="pe-err"></p><div class="modal-actions"><button type="button" class="btn" id="pe-x">Cancel</button><button class="btn pri" id="pe-go">Save changes</button></div></form>', "wide");
      var bc = function () { $("#pe-bc").textContent = $("#pe-b").value.length + "/400"; }; $("#pe-b").oninput = bc; bc();
      $("#pe-x").onclick = closeModal; $("#pe-n").focus();
      $("#pe").onsubmit = function (e) {
        e.preventDefault(); var b = $("#pe-go"); b.disabled = true;
        api("me_save", { name: $("#pe-n").value, title: $("#pe-t").value, city: $("#pe-c").value, phone: $("#pe-p").value, whatsapp: $("#pe-w").value, bio: $("#pe-b").value }).then(function (r) {
          b.disabled = false; if (!r.ok) return ($("#pe-err").textContent = r.error);
          W.S.user.name = r.user.name; D.user.name = r.user.name; D.profile = r.profile; $("#u-name").textContent = r.user.name; if (!$("#u-av").classList.contains("has-img")) $("#u-av").textContent = initials(r.user.name);
          closeModal(); draw(); toast("Profile saved ✓");
        });
      };
    }
    function pw() {
      modal('<h2>Change password</h2><p class="muted">At least 8 characters. Your other devices will be signed out.</p><form id="pp"><label>Current password<input type="password" id="pp-c" required autocomplete="current-password"></label><label>New password<input type="password" id="pp-n" minlength="8" required autocomplete="new-password"></label><label>Repeat new password<input type="password" id="pp-r" minlength="8" required autocomplete="new-password"></label><p class="err" id="pp-err"></p><div class="modal-actions"><button type="button" class="btn" id="pp-x">Cancel</button><button class="btn pri">Change password</button></div></form>');
      $("#pp-x").onclick = closeModal; $("#pp-c").focus();
      $("#pp").onsubmit = function (e) {
        e.preventDefault(); if ($("#pp-n").value !== $("#pp-r").value) return ($("#pp-err").textContent = "The new passwords do not match");
        api("password", { current: $("#pp-c").value, next: $("#pp-n").value }).then(function (r) { if (!r.ok) return ($("#pp-err").textContent = r.error); W.S.token = r.token; sessionStorage.setItem("wxaTok", r.token); closeModal(); toast("Password changed ✓ Other devices were signed out."); load(); });
      };
    }
    load();
  };
  // the shell may have drawn the old profile screen before this file loaded
  if (/^#\/profile/.test(location.hash) && W.route) setTimeout(function () { if (!document.getElementById("pr")) W.route(); }, 0);
})();
