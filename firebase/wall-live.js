// wall-live.js — Live HP + live people overrides on the GOAT wall.
// Listens to the Firestore "scores" collection. When a score document
// changes, it updates ONLY the HP number on that person's card
// (the element with data-hp inside the card with matching data-name).
// It NEVER touches move names or move numbers — those stay exactly as
// the wall hardcodes them.
//
// It also listens to the Firestore "people" collection (admin overrides).
// A people document (ID = the person's NAME) can:
//   removed: true  -> hide that person's card from the wall
//   name: "New"    -> rename the card (front + back)
//   title: "New"   -> retitle the card (front + back)
//   photo: "/x.jpg"-> swap the card photo
// Absent/empty fields restore the wall's hardcoded values. If Firestore
// is unavailable, it does nothing and the wall keeps its hardcoded data.
//
// Scores and people are keyed by NAME (public), never by access code.
// Requires firebase-init.js (GOAT) loaded first. Depends on the wall
// builder setting data-name="<display name>" on each card <article> and
// data-hp on the <b> that shows the HP number.

(function () {
  function log() {
    if (window.console) console.warn.apply(console, ["[GOAT wall-live]"].concat([].slice.call(arguments)));
  }

  // The wall's hardcoded name/title/photo per person, captured on load so
  // an override can be undone by clearing the field. Keyed by name.
  var originals = {};

  function cardName(card) {
    return card.getAttribute("data-name") || "";
  }

  function captureOne(card) {
    var name = cardName(card);
    if (!name || originals[name]) return;
    if (card.classList.contains("lock-tile")) return; // tiles hold no card data
    var nameEl = card.querySelector(".plate .name");
    var titleEl = card.querySelector(".plate .title span");
    var img = card.querySelector(".photo-wrap img");
    originals[name] = {
      name: nameEl ? nameEl.textContent : "",
      title: titleEl ? titleEl.textContent : "",
      photo: img ? img.getAttribute("src") : ""
    };
  }

  function captureOriginals() {
    var cards = document.querySelectorAll("[data-name]");
    for (var i = 0; i < cards.length; i++) captureOne(cards[i]);
  }
  window.GOATCaptureOriginals = captureOriginals;

  function setText(el, v) {
    if (el && el.textContent !== v) el.textContent = v;
  }

  function updateOne(name, overall) {
    // ajchapa's HP stays "???" by design — never overwrite it, even if
    // a score document somehow exists for his name.
    if (name === "ajchapa") return;
    if (overall === null || overall === undefined || overall === "") return;
    var n = Math.round(Number(overall));
    if (!isFinite(n)) return;
    var card = document.querySelector('[data-name="' + name + '"]');
    if (!card) return;
    var hp = card.querySelector("[data-hp]");
    if (!hp) return;
    // Only the number inside <b data-hp> changes. The "HP" label is
    // outside the <b>, so it is untouched.
    if (hp.textContent !== String(n)) hp.textContent = String(n);
  }

  function applyPerson(name, d) {
    var card = document.querySelector('[data-name="' + name + '"]');
    if (!card) return;
    if (!originals[name]) captureOne(card);
    var o = originals[name] || { name: "", title: "", photo: "" };
    d = d || {};
    // Remove / restore.
    card.style.display = d.removed ? "none" : "";
    // Name (front + back), title (front + back), photo.
    var newName = (typeof d.name === "string" && d.name) ? d.name : o.name;
    var title = (typeof d.title === "string" && d.title) ? d.title : o.title;
    var photo = (typeof d.photo === "string" && d.photo) ? d.photo : o.photo;
    setText(card.querySelector(".plate .name"), newName);
    setText(card.querySelector(".b-top .b-name"), newName);
    setText(card.querySelector(".plate .title span"), title);
    setText(card.querySelector(".back-title"), title);
    var img = card.querySelector(".photo-wrap img");
    if (img && photo && img.getAttribute("src") !== photo) {
      img.setAttribute("src", photo);
      img.setAttribute("alt", newName);
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
            // Lock v2: swap tiles <-> real cards to match who has a score.
            var taken = {};
            snap.forEach(function (doc) { var dd = doc.data() || {}; if (dd.taken) taken[doc.id] = true; });
            if (window.GOATLockSync) { try { window.GOATLockSync(taken); } catch (e) {} }
            snap.forEach(function (doc) {
              var d = doc.data() || {};
              if (d.taken) updateOne(doc.id, d.overall);
            });
            // A deleted score doc means the test was reset: HP goes back to "-".
            snap.docChanges().forEach(function (ch) {
              if (ch.type === "removed") {
                var name = ch.doc.id;
                if (name === "ajchapa") return;
                var card = document.querySelector('[data-name="' + name + '"]');
                if (!card) return;
                var hp = card.querySelector("[data-hp]");
                if (hp && hp.textContent !== "-") hp.textContent = "-";
              }
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
