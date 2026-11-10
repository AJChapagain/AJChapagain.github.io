// wall-live.js — Live HP on the GOAT wall.
// Listens to the Firestore "scores" collection. When a score document
// changes, it updates ONLY the HP number on that person's card
// (the element with data-hp inside the card with matching data-code).
// It NEVER touches move names or move numbers — those stay exactly as
// the wall hardcodes them. If Firestore is unavailable, it does nothing
// and the wall keeps its hardcoded HP values.
//
// Requires firebase-init.js (GOAT) loaded first. Depends on the wall
// builder setting data-code="<4-digit code>" on each card <article> and
// data-hp on the <b> that shows the HP number.

(function () {
  function log() {
    if (window.console) console.warn.apply(console, ["[GOAT wall-live]"].concat([].slice.call(arguments)));
  }

  function updateOne(code, overall) {
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

  function start() {
    try {
      if (!window.GOAT || !GOAT.db) {
        // Firebase not set up yet — leave the hardcoded HP alone.
        log("Firestore unavailable; keeping hardcoded HP.");
        return;
      }
      // Anonymous sign-in first so Firestore rules see an authed user.
      GOAT.ensureAuth().then(function () {
        var unsub;
        try {
          unsub = GOAT.db.collection("scores").onSnapshot(function (snap) {
            snap.forEach(function (doc) {
              var d = doc.data() || {};
              if (d.taken) updateOne(doc.id, d.overall);
            });
          }, function (e) {
            // Listener error (e.g. database missing, rules deny). Keep
            // the hardcoded HP and stop listening quietly.
            log("scores listener stopped:", e && e.message);
            if (unsub) unsub();
          });
        } catch (e) {
          log("could not start scores listener:", e && e.message);
        }
      }).catch(function () {
        log("auth failed; keeping hardcoded HP.");
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
