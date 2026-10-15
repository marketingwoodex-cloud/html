/* Woodex Admin — P16 3.7 Users screens (Flowbite-style). Joins the existing Users, Activity, Profile and My security views with one tab bar,
   and adds stats, search, role filter and per-user activity links to the Users list. Existing views are wrapped, not rewritten. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, V = W.VIEWS, role = "all", q = "";
  function tabs(el, cur) {
    var ph = el.querySelector(".ph"); if (!ph || el.querySelector("#us-tabs")) return;
    var admin = W.can("owner,admin");
    var T = (admin ? [["users", "All users", "users"], ["activity", "Activity", "activity"]] : []).concat([["profile", "My profile", "user"], ["security", "My security", "shield"]]);
    ph.insertAdjacentHTML("afterend", '<div class="tabs us-tabs" id="us-tabs">' + T.map(function (t) { return '<a href="#/' + t[0] + '" class="' + (t[0] === cur ? "on" : "") + '">' + ic(t[2]) + t[1] + "</a>"; }).join("") + "</div>");
    W.fillIcons(el.querySelector("#us-tabs"));
  }
  function wrap(name, after) { var base = V[name]; if (!base) return; V[name] = function (el, parts) { var r = base(el, parts); try { tabs(el, name); after && after(el, parts || []); } catch (e) { console.error(e); } return r; }; }

  wrap("users", function (el) {
    var tbl = el.querySelector("#u-rows"); if (!tbl) return;
    var card = tbl.closest(".card");
    card.insertAdjacentHTML("beforebegin", '<div class="grid kpis us-kpis" id="us-k"></div>');
    card.insertAdjacentHTML("afterbegin", '<div class="us-bar"><input type="search" id="us-q" placeholder="Search name or email…"><div class="seg" id="us-r">' +
      [["all", "All"], ["owner", "Master"], ["admin", "Managers"], ["editor", "Developers"], ["sales", "Sales"], ["support", "Support"]].map(function (x) { return '<button data-r="' + x[0] + '"' + (x[0] === role ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div></div>");
    el.querySelector("#us-q").value = q;
    el.querySelector("#us-q").oninput = function () { q = this.value.toLowerCase(); apply(); };
    el.querySelector("#us-r").onclick = function (e) { var b = e.target.closest("[data-r]"); if (!b) return; role = b.dataset.r; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); apply(); };
    function apply() {
      var rows = [].slice.call(tbl.rows).filter(function (r) { return !r.querySelector(".empty"); }), k = { all: 0, active: 0, owner: 0, admin: 0, editor: 0, sales: 0, support: 0 };
      rows.forEach(function (r) {
        var t = r.textContent.toLowerCase(), rl = (r.cells[1] && r.cells[1].querySelector("[data-role]") ? r.cells[1].querySelector("[data-role]").dataset.role : ""), on = /active/i.test(r.cells[2] ? r.cells[2].textContent : "");
        k.all++; if (on) k.active++; if (k[rl] != null) k[rl]++;
        r.style.display = (!q || t.indexOf(q) >= 0) && (role === "all" || rl === role) ? "" : "none";
        var last = r.cells[r.cells.length - 1];
        if (last && !last.querySelector(".us-act")) { var nm = (r.querySelector(".who b") || {}).firstChild; nm = nm ? nm.textContent.trim() : "";
          last.insertAdjacentHTML("afterbegin", '<a class="btn sm us-act" href="#/activity" data-n="' + esc(nm) + '" title="See what this person changed">' + ic("activity") + "Activity</a> "); W.fillIcons(last); }
      });
      var kpi = function (icon, label, v, b) { return '<div class="card kpi"><div class="kpi-ic">' + ic(icon) + "</div><small>" + label + '</small><div class="kpi-row"><b>' + v + "</b>" + (b || "") + "</div></div>"; };
      el.querySelector("#us-k").innerHTML = kpi("users", "Team members", k.all, '<span class="badge ok">' + k.active + " active</span>") + kpi("shield", "Master & managers", k.owner + k.admin, '<span class="badge gold">whole system</span>') +
        kpi("square-pen", "Developers", k.editor, '<span class="badge">website</span>') + kpi("inbox", "Sales & support", k.sales + k.support, '<span class="badge info">CRM + inbox</span>');
      W.fillIcons(el.querySelector("#us-k"));
    }
    new MutationObserver(function () { if (!tbl.dataset.busy) { tbl.dataset.busy = 1; apply(); setTimeout(function () { delete tbl.dataset.busy; }, 0); } }).observe(tbl, { childList: true });
    el.addEventListener("click", function (e) { var a = e.target.closest(".us-act"); if (a) sessionStorage.setItem("wxActQ", a.dataset.n); });
    apply();
  });
  wrap("activity", function (el) {
    var s = sessionStorage.getItem("wxActQ"), i = el.querySelector("#a-q"); if (!s || !i) return; sessionStorage.removeItem("wxActQ");
    setTimeout(function () { i.value = s; i.dispatchEvent(new Event("input", { bubbles: true })); }, 50);
  });
  wrap("profile"); wrap("security");
})();
