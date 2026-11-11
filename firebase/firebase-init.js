// firebase-init.js — Firebase setup for the GOAT wall members app.
// Load AFTER the three Firebase compat SDK <script> tags:
//   firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
// Exposes a single global: GOAT.
// This file never throws on load. If Firebase is unreachable (no Firestore yet,
// Anonymous auth off, domain not authorized), it logs and keeps going.
//
// SECURITY (2026-11-11): no access codes live in this file or in any page.
// A code is verified by hashing it (SHA-256) and fetching the matching
// document from the Firestore "accessCodes" collection, whose document ID
// is that hash. The codes themselves are never in client-side code, and
// the collection denies listing, so the hashes cannot be enumerated.
// Scores / people / requests / notifications are keyed by the person's
// NAME (public), never by their code.

(function () {
  // Firebase web config for project "log-in-for-ajchapa-wall".
  // Public by design — it is meant to live in client-side code. The API
  // key identifies the project; it grants nothing by itself. The Firestore
  // security rules are the actual access control. (Restrict the key to
  // ajchapa.com in Google Cloud Console so it cannot be used elsewhere.)
  var firebaseConfig = {
    apiKey: "AIzaSyBbjRZRXrMO03JxPztMklbhewERCXYVaZQ",
    authDomain: "log-in-for-ajchapa-wall.firebaseapp.com",
    projectId: "log-in-for-ajchapa-wall",
    storageBucket: "log-in-for-ajchapa-wall.firebasestorage.app",
    messagingSenderId: "97279862033",
    appId: "1:97279862033:web:a860aa2d7aa36e0a2198b0",
    measurementId: "G-7JCKDW141T"
  };

  var CODE_KEY = "goatCode";
  var IDENTITY_KEY = "goatIdentity";

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

  // SHA-256 of a string, as lowercase hex. Uses Web Crypto (available on
  // HTTPS and localhost). Resolves null if Web Crypto is unavailable.
  function sha256Hex(str) {
    try {
      if (!window.crypto || !crypto.subtle || !crypto.subtle.digest) return Promise.resolve(null);
      var data = new TextEncoder().encode(String(str));
      return crypto.subtle.digest("SHA-256", data).then(function (buf) {
        var bytes = new Uint8Array(buf);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) {
          hex += ("0" + bytes[i].toString(16)).slice(-2);
        }
        return hex;
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // The verified identity of the logged-in person, stored in sessionStorage
  // at login: { code, name, title, photo, admin }. Null when not logged in.
  // The code here is the person's OWN code, kept only in their session —
  // it is never written into page source.
  function getIdentity() {
    try {
      var raw = sessionStorage.getItem(IDENTITY_KEY);
      if (!raw) return null;
      var id = JSON.parse(raw);
      if (!id || typeof id.name !== "string" || !id.name) return null;
      return id;
    } catch (e) { return null; }
  }

  function setIdentity(id) {
    try {
      if (!id) sessionStorage.removeItem(IDENTITY_KEY);
      else sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
    } catch (e) {}
  }

  function clearIdentity() {
    try { sessionStorage.removeItem(IDENTITY_KEY); } catch (e) {}
  }

  // Verify a 4-digit member code. Hashes it and fetches the matching
  // accessCodes document (ID = the hash). Resolves the identity
  // { code, name, title, photo, admin } when the code is valid, or null
  // when it is not. Rejects only when Firestore itself cannot be reached
  // (so callers can tell "wrong code" apart from "database down").
  // Never reveals the code list: only the single hash for the entered
  // code is ever requested, and the collection denies listing.
  function verifyCode(code) {
    code = String(code || "").trim();
    if (!/^\d{4}$/.test(code)) return Promise.resolve(null);
    if (!db) return Promise.reject(new Error("Firestore unavailable"));
    return ensureAuth().then(function () {
      return sha256Hex(code);
    }).then(function (hash) {
      if (!hash) throw new Error("Crypto unavailable");
      return db.collection("accessCodes").doc(hash).get();
    }).then(function (snap) {
      if (!snap || !snap.exists) return null;
      var d = snap.data() || {};
      if (d.kind !== "member" || typeof d.name !== "string" || !d.name) return null;
      var id = {
        code: code,
        name: d.name,
        title: (typeof d.title === "string") ? d.title : "",
        photo: (typeof d.photo === "string") ? d.photo : "",
        admin: d.admin === true
      };
      setIdentity(id);
      setCode(code);
      return id;
    });
  }

  // Verify one of the two admin gate codes. step is 1 or 2.
  // Resolves true when the entered code is the right admin code for
  // that step, false when it is not. Rejects when Firestore is down.
  function verifyAdminCode(code, step) {
    code = String(code || "").trim();
    if (!/^\d{4}$/.test(code)) return Promise.resolve(false);
    if (!db) return Promise.reject(new Error("Firestore unavailable"));
    return ensureAuth().then(function () {
      return sha256Hex(code);
    }).then(function (hash) {
      if (!hash) throw new Error("Crypto unavailable");
      return db.collection("accessCodes").doc(hash).get();
    }).then(function (snap) {
      if (!snap || !snap.exists) return false;
      var d = snap.data() || {};
      return d.kind === "admin" && d.step === step;
    });
  }

  // Add a notification document. `name` is the recipient's display name.
  // Never throws; no-ops when Firestore is down.
  function notify(message, type, name) {
    try {
      if (!db) return Promise.resolve(null);
      return db.collection("notifications").add({
        message: String(message || ""),
        type: String(type || "info"),
        name: String(name || ""),
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
    getCode: getCode,
    setCode: setCode,
    clearCode: clearCode,
    getIdentity: getIdentity,
    setIdentity: setIdentity,
    clearIdentity: clearIdentity,
    verifyCode: verifyCode,
    verifyAdminCode: verifyAdminCode,
    sha256Hex: sha256Hex,
    ensureAuth: ensureAuth,
    notify: notify,
    // True when Firebase initialized and Firestore is reachable.
    // Note: db existing does not guarantee the Firestore database or
    // Anonymous auth is actually enabled — calls may still fail.
    ready: !!db
  };
})();
