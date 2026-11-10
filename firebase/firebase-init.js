// firebase-init.js — Firebase setup for the GOAT wall members app.
// Load AFTER the three Firebase compat SDK <script> tags:
//   firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
// Exposes a single global: GOAT.
// This file never throws on load. If Firebase is unreachable (no Firestore yet,
// Anonymous auth off, domain not authorized), it logs and keeps going — the
// wall keeps its hardcoded HP, the test keeps its letter-code fallback, and
// the members page shows a clear message instead of crashing.

(function () {
  // Firebase web config for project "log-in-for-ajchapa-wall".
  // Public by design — it is meant to live in client-side code.
  var firebaseConfig = {
    apiKey: "AIzaSyBbjRZRXrMO03JxPztMklbhewERCXYVaZQ",
    authDomain: "log-in-for-ajchapa-wall.firebaseapp.com",
    projectId: "log-in-for-ajchapa-wall",
    storageBucket: "log-in-for-ajchapa-wall.firebasestorage.app",
    messagingSenderId: "97279862033",
    appId: "1:97279862033:web:a860aa2d7aa36e0a2198b0",
    measurementId: "G-7JCKDW141T"
  };

  // code -> display name. Used by test-save.js (string concatenation).
  // Banananana's code is 2468 (added 2026-11-09).
  var PEOPLE = {
    "1175": "ajchapa",
    "1606": "Alex",
    "1809": "Kush",
    "2986": "Mae",
    "5693": "GaryBoy",
    "5831": "Mijo",
    "6936": "Helen",
    "8321": "Noel",
    "8453": "Kelketra",
    "2468": "Banananana"
  };

  // code -> { name, title, photo }. Used by the members dashboard to render
  // each person's card. Photo paths are the wall's live paths.
  var PROFILES = {
    "1175": { name: "ajchapa",   title: "Thee Goat?",               photo: "/ajchapa.JPG" },
    "1606": { name: "Alex",      title: "Goat of Fortnite",         photo: "/Alex.jpg" },
    "1809": { name: "Kush",      title: "Goat of Excel",             photo: "/5E063B38-E541-412F-B0DE-A586461C325A.jpeg" },
    "2986": { name: "Mae",       title: "Goat of Crafts",            photo: "/Mae.JPG" },
    "5693": { name: "GaryBoy",   title: "Walking Lunch Money",       photo: "/Gary.png" },
    "5831": { name: "Mijo",      title: "Goat of Money",             photo: "/miho.JPG" },
    "6936": { name: "Helen",     title: "Keller",                    photo: "/helen.JPG" },
    "8321": { name: "Noel",      title: "Goat of Style",             photo: "/Noel.png" },
    "8453": { name: "Kelketra",  title: "Goat of Golf With Friends", photo: "/kelketra.jpg" },
    "2468": { name: "Banananana", title: "Goat of Hosting", photo: "/BANANNA (1).jpeg" }
  };

  var CODE_KEY = "goatCode";

  var db = null;        // Firestore instance, or null if Firebase failed to init
  var authPromise = null;

  // Initialize Firebase. Never throws.
  try {
    if (typeof firebase === "undefined" || !firebase.initializeApp) {
      throw new Error("Firebase SDK not loaded");
    }
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
  } catch (e) {
    // Firebase not available (SDK missing, or project not reachable).
    // Everything downstream degrades gracefully.
    if (window.console) console.warn("[GOAT] Firebase unavailable:", e && e.message);
    db = null;
  }

  // Sign in anonymously. Resolves (to a user object, or null) once the
  // attempt is done; never rejects. Callers do Firestore work after this.
  function ensureAuth() {
    if (authPromise) return authPromise;
    authPromise = (function () {
      try {
        if (!db || !firebase.auth) return Promise.resolve(null);
        var auth = firebase.auth();
        if (auth.currentUser) return Promise.resolve(auth.currentUser);
        return auth.signInAnonymously()
          .then(function (cred) { return cred.user || null; })
          .catch(function (e) {
            if (window.console) console.warn("[GOAT] anonymous sign-in failed:", e && e.message);
            return null;
          });
      } catch (e) {
        if (window.console) console.warn("[GOAT] ensureAuth failed:", e && e.message);
        return Promise.resolve(null);
      }
    })();
    return authPromise;
  }

  function getCode() {
    try { return sessionStorage.getItem(CODE_KEY) || ""; } catch (e) { return ""; }
  }

  function setCode(code) {
    try { sessionStorage.setItem(CODE_KEY, String(code || "")); } catch (e) {}
  }

  function clearCode() {
    try { sessionStorage.removeItem(CODE_KEY); } catch (e) {}
  }

  // Add a notification document. Never throws; no-ops when Firestore is down.
  function notify(message, type, code) {
    try {
      if (!db) return Promise.resolve(null);
      return db.collection("notifications").add({
        message: String(message || ""),
        type: String(type || "info"),
        code: String(code || ""),
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function (e) {
        if (window.console) console.warn("[GOAT] notify failed:", e && e.message);
        return null;
      });
    } catch (e) {
      if (window.console) console.warn("[GOAT] notify failed:", e && e.message);
      return Promise.resolve(null);
    }
  }

  window.GOAT = {
    db: db,
    PEOPLE: PEOPLE,
    PROFILES: PROFILES,
    getCode: getCode,
    setCode: setCode,
    clearCode: clearCode,
    ensureAuth: ensureAuth,
    notify: notify,
    // True when Firebase initialized and Firestore is reachable.
    // Note: db existing does not guarantee the Firestore database or
    // Anonymous auth is actually enabled — calls may still fail.
    ready: !!db
  };
})();
