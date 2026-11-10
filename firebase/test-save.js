// test-save.js — Save test results to Firestore (one attempt per code).
// Drop-in for the existing test page. Does not change its look.
// Requires firebase-init.js (GOAT) loaded first.
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

  // Returns { allowed:boolean, reason?:string, loginNeeded?:boolean, code?:string }
  window.checkCanTakeTest = async function () {
    var code = (window.GOAT && GOAT.getCode()) || "";
    if (!code || !(window.GOAT && GOAT.PEOPLE[code])) {
      return { allowed: false, reason: "Please log in first.", loginNeeded: true };
    }
    if (!window.GOAT || !GOAT.db) {
      // No Firestore — fall back to the test page's own localStorage gate.
      return { allowed: true, code: code };
    }
    try {
      await GOAT.ensureAuth();
      var snap = await GOAT.db.collection("scores").doc(code).get();
      if (snap.exists && snap.data() && snap.data().taken) {
        return { allowed: false, reason: "You've already taken the test. One attempt per code." };
      }
      return { allowed: true, code: code };
    } catch (e) {
      // Firestore unreachable (no database, rules deny, offline).
      // Do not block the test — localStorage still gates retakes.
      if (window.console) console.warn("[GOAT] checkCanTakeTest failed, falling through:", e && e.message);
      return { allowed: true, code: code };
    }
  };

  // Saves { speed, memory, reasoning, overall }. Throws "Already taken."
  // if the code already has scores. Resolves silently (no save) when
  // Firestore is unavailable, so the letter-code screen still works.
  window.saveTestResults = async function (r) {
    var code = (window.GOAT && GOAT.getCode()) || "";
    if (!code || !(window.GOAT && GOAT.PEOPLE[code])) throw new Error("Not logged in.");
    // ajchapa's HP stays "???" by design — never save a score for him.
    if (code === "1175") return;
    if (!window.GOAT || !GOAT.db) return; // no Firestore — nothing to save to
    await GOAT.ensureAuth();
    var ref = GOAT.db.collection("scores").doc(code);
    await GOAT.db.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      if (snap.exists && snap.data() && snap.data().taken) throw new Error("Already taken.");
      tx.set(ref, {
        speed: clamp(r.speed),
        memory: clamp(r.memory),
        reasoning: clamp(r.reasoning),
        overall: clamp(r.overall),
        taken: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    // Fire-and-forget notification; a failure here must not fail the save.
    try {
      await GOAT.notify(GOAT.PEOPLE[code] + " finished the test.", "test_complete", code);
    } catch (e) { /* notification is best-effort */ }
  };
})();
