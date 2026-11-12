// test-save.js — Save test results to Firestore (one attempt per person).
// Drop-in for the existing test page. Does not change its look.
// Requires firebase-init.js (GOAT) loaded first.
//
// Scores are keyed by the person's NAME (public), never by their code.
// The admin (identity.admin) never gets a score saved.
//
// 1) On load (after the code is entered):
//      checkCanTakeTest().then(r => { if (!r.allowed) { /* show r.reason, hide the test */ } });
// 2) When finished:
//      saveTestResults({ speed, memory, reasoning, overall }).then(...)
// A Firestore transaction blocks retakes; a notification is added on save.
// If Firebase/Firestore is unavailable, both functions fail gracefully:
// checkCanTakeTest resolves { allowed:true } (localStorage still gates),
// and saveTestResults resolves without saving (the letter-code screen
// stays as the fallback).

(function () {
  var clamp = function (n) { return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); };

  // Returns { allowed:boolean, reason?:string, loginNeeded?:boolean, name?:string }
  window.checkCanTakeTest = async function () {
    var id = (window.GOAT && GOAT.getIdentity && GOAT.getIdentity()) || null;
    var name = id && id.name;
    if (!name) {
      return { allowed: false, reason: "Please log in first.", loginNeeded: true };
    }
    if (!window.GOAT || !GOAT.db) {
      // No Firestore — fall back to the test page's own localStorage gate.
      return { allowed: true, name: name };
    }
    try {
      await GOAT.ensureAuth();
      var snap = await GOAT.db.collection("scores").doc(name).get();
      if (snap.exists && snap.data() && snap.data().taken) {
        return { allowed: false, reason: "You've already taken the test. One attempt per code." };
      }
      return { allowed: true, name: name };
    } catch (e) {
      // Firestore unreachable (no database, rules deny, offline).
      // Do not block the test — localStorage still gates retakes.
      if (window.console) console.warn("[GOAT] checkCanTakeTest failed, falling through:", e && e.message);
      return { allowed: true, name: name };
    }
  };

  // Saves { speed, memory, reasoning, overall }. Throws "Already taken."
  // if the person already has scores. Resolves silently (no save) when
  // Firestore is unavailable, so the letter-code screen still works.
  window.saveTestResults = async function (r) {
    var id = (window.GOAT && GOAT.getIdentity && GOAT.getIdentity()) || null;
    var name = id && id.name;
    if (!name) throw new Error("Not logged in.");
    // The admin's HP stays "???" by design — never save a score for him.
    if (id.admin) return;
    if (!window.GOAT || !GOAT.db) return; // no Firestore — nothing to save to
    await GOAT.ensureAuth();
    var ref = GOAT.db.collection("scores").doc(name);
    // Optional per-question breakdown (what they got right/wrong, their
    // answers, timing) for the admin Test results view. Kept only if it
    // serialises to a sane size; the four scores save either way.
    var details = null;
    if (r.details && typeof r.details === 'object') {
      try {
        if (JSON.stringify(r.details).length <= 90000) details = r.details;
      } catch (e) { details = null; }
    }
    var doc = {
      speed: clamp(r.speed),
      memory: clamp(r.memory),
      reasoning: clamp(r.reasoning),
      overall: clamp(r.overall),
      taken: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (details) doc.details = details;
    await GOAT.db.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      if (snap.exists && snap.data() && snap.data().taken) throw new Error("Already taken.");
      tx.set(ref, doc);
    });
    // Fire-and-forget notification; a failure here must not fail the save.
    try {
      await GOAT.notify(name + " finished the test.", "test_complete", name);
    } catch (e) { /* notification is best-effort */ }
  };
})();
