// wall-live.js — Live HP + live people overrides on the GOAT wall.
// Listens to the Firestore "scores" collection. When a score document
// changes, it updates ONLY the HP number on that person's card
// (the element with data-hp inside the card with matching data-code).
// It NEVER touches move names or move numbers — those stay exactly as
// the wall hardcodes them.
//
// It also listens to the Firestore "people" collection (admin overrides).
// A people document (ID = the person's 4-digit code) can:
//   removed: true  -> hide that person's card from the wall
//   name: "New"    -> rename the card (front + back)
//   title: "New"   -> retitle the card (front + back)
//   photo: "/x.jpg"-> swap the card photo
// Absent/empty fields restore the wall's hardcoded values. If Firestore
// is unavailable, it does nothing and the wall keeps its hardcoded data.
//
// Requires firebase-init.js (GOAT) loaded first. Depends on the wall
// builder setting data-code="<4-digit code>" on each card <article> and
// data-hp on the <b> that shows the HP number.

(function () {
  function log() {
    if (window.console) console.warn.apply(console, ["[GOAT wall-live]"].concat([].slice.call(arguments)));
  }

  // The wall's hardcoded name/title/photo per code, captured on load so
  // an override can be undone by clearing the field.
  var originals = {};

  function captureOriginals() {
    var cards = document.querySelectorAll("[data-code]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var code = card.getAttribute("data-code");
      if (!code || originals[code]) continue;
      var nameEl = card.querySelector(".plate .name");
      var titleEl = card.querySelector(".plate .title span");
      var img = card.querySelector(".photo-wrap img");
      originals[code] = {
        name: nameEl ? nameEl.textContent : "",
        title: titleEl ? titleEl.textContent : "",
        photo: img ? img.getAttribute("src") : ""
      };
    }
  }

  function setText(el, v) {
    if (el && el.textContent !== v) el.textContent = v;
  }

  function updateOne(code, overall) {
    // ajchapa's HP stays "???" by design — never overwrite it, even if
    // a score document somehow exists for his code.
    if (code === "1175") return;
    if (overall === null || overall === undefined || overall === "") return;
    var n = Math.round(Number(overall));
    if (!isFinite(n)) return;
    var card = document.querySelector('[data-code="' + code + '"]');
    if (!card) return;
    var hp = card.querySelector("[data-hp]");
    if (!hp) return;
    // Only the number inside <b data-hp> changes. The "HP" label is
    // outside the <b>, so it is untouched.
    if (hp.textContent !== String(n)) hp.textContent = String(n);
  }

  function applyPerson(code, d) {
    var card = document.querySelector('[data-code="' + code + '"]');
    if (!card) return;
    var o = originals[code] || { name: "", title: "", photo: "" };
    d = d || {};
    // Remove / restore.
    card.style.display = d.removed ? "none" : "";
    // Name (front + back), title (front + back), photo.
    var name = (typeof d.name === "string" && d.name) ? d.name : o.name;
    var title = (typeof d.title === "string" && d.title) ? d.title : o.title;
    var photo = (typeof d.photo === "string" && d.photo) ? d.photo : o.photo;
    setText(card.querySelector(".plate .name"), name);
    setText(card.querySelector(".b-top .b-name"), name);
    setText(card.querySelector(".plate .title span"), title);
    setText(card.querySelector(".back-title"), title);
    var img = card.querySelector(".photo-wrap img");
    if (img && photo && img.getAttribute("src") !== photo) {
      img.setAttribute("src", photo);
      img.setAttribute("alt", name);
    }
  }

  function start() {
    try {
      if (!window.GOAT || !GOAT.db) {
        // Firebase not set up yet — leave the hardcoded wall alone.
        log("Firestore unavailable; keeping hardcoded wall.");
        return;
      }
      captureOriginals();
      // Anonymous sign-in first so Firestore rules see an authed user.
      GOAT.ensureAuth().then(function () {
        try {
          GOAT.db.collection("scores").onSnapshot(function (snap) {
            snap.forEach(function (doc) {
              var d = doc.data() || {};
              if (d.taken) updateOne(doc.id, d.overall);
            });
          }, function (e) {
            log("scores listener stopped:", e && e.message);
          });
        } catch (e) {
          log("could not start scores listener:", e && e.message);
        }
        try {
          GOAT.db.collection("people").onSnapshot(function (snap) {
            snap.forEach(function (doc) {
              applyPerson(doc.id, doc.data() || {});
            });
            // A deleted people doc means "back to hardcoded": re-apply
            // defaults for any card whose doc is gone.
            snap.docChanges().forEach(function (ch) {
              if (ch.type === "removed") applyPerson(ch.doc.id, {});
            });
          }, function (e) {
            log("people listener stopped:", e && e.message);
          });
        } catch (e) {
          log("could not start people listener:", e && e.message);
        }
      }).catch(function () {
        log("auth failed; keeping hardcoded wall.");
      });
    } catch (e) {
      log("failed to start:", e && e.message);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
