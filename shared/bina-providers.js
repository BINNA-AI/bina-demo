/*!
 * BINA provider adapters (browser). Same calls in MOCK and LIVE; the UI never changes when a provider switches.
 *   Resolve  : MOCK (deterministic matcher, labelled SIMULATED)  | LIVE (Worker -> OpenAI -> BINA validation)
 *   Auth     : MOCK (local demo accounts, labelled SIMULATED)    | FIREBASE (Firebase Authentication web SDK)
 *   Media    : LOCAL (prototype_data files + IndexedDB uploads)   | R2 (Worker streams private R2 objects)
 * Never logs or stores tokens or keys. Never falls back from LIVE to MOCK silently.
 */
(function (root) {
  'use strict';
  var C = root.BinaCore, Store = root.BinaStore;
  if (!C || !Store) throw new Error('Load bina-core.js, bina-data.js and bina-store.js before bina-providers.js');

  var FIREBASE_VERSION = '13.1.0'; // Apache-2.0. Loaded only when Auth mode = FIREBASE.
  var FIREBASE_CDN = 'https://cdn.jsdelivr.net/npm/firebase@' + FIREBASE_VERSION + '/';

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function requestId() { return 'local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function ok(data, extra) { return Object.assign({ ok: true, data: data === undefined ? null : data, error: null, request_id: requestId() }, extra || {}); }
  function bad(code, message, details, extra) { return Object.assign({ ok: false, data: null, error: C.err(code, message, details), request_id: requestId() }, extra || {}); }

  // ================================================================== HTTP (LIVE modes)
  function apiFetch(path, opts) {
    opts = opts || {};
    var env = Store.env();
    if (!env.api_base) return Promise.resolve(bad('INTERNAL', 'API base URL is not set. Add it in Admin > API & Integrations.'));
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    var tokenP = opts.auth === false ? Promise.resolve(null) : Auth.idToken().catch(function () { return null; });
    return tokenP.then(function (token) {
      if (token) headers.Authorization = 'Bearer ' + token;
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout_ms || 15000) : null;
      var t0 = now();
      return fetch(env.api_base + '/api/v1' + path, { method: opts.method || 'GET', headers: headers, body: opts.body, signal: ctl ? ctl.signal : undefined, credentials: 'same-origin', cache: 'no-store' })
        .then(function (res) {
          if (opts.raw) { if (timer) clearTimeout(timer); return res; }
          return res.json().catch(function () { return null; }).then(function (j) {
            if (timer) clearTimeout(timer);
            var ms = Math.round(now() - t0);
            if (j && typeof j.ok === 'boolean') { j.http_status = res.status; j.timing_ms = ms; return j; }
            var code = res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : res.status === 413 ? 'PAYLOAD_TOO_LARGE' : res.status === 429 ? 'RATE_LIMITED' : 'INTERNAL';
            return bad(code, 'Unexpected response from the service (HTTP ' + res.status + ')', null, { http_status: res.status, timing_ms: ms });
          });
        })
        .catch(function (e) {
          if (timer) clearTimeout(timer);
          var aborted = e && e.name === 'AbortError';
          return bad(aborted ? 'OPENAI_UNAVAILABLE' : 'INTERNAL', aborted ? 'The service took too long to answer' : 'Could not reach the service', { network: true });
        });
    });
  }

  // ================================================================== AUTH
  var SESSION_KEY = 'bina.proto.session.v1';
  var ACCOUNTS_KEY = 'bina.proto.accounts.v1';
  var authListeners = [];
  var fb = null; // { app, auth } when FIREBASE mode is initialised

  function ls(key, val) {
    try {
      if (val === undefined) return JSON.parse(root.localStorage.getItem(key) || 'null');
      if (val === null) root.localStorage.removeItem(key); else root.localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
    return null;
  }
  function emitAuth() { var u = Auth.current(); authListeners.slice().forEach(function (fn) { try { fn(u); } catch (e) { if (root.console) console.error(e); } }); }
  function validEmail(e) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(String(e || '').trim()); }
  function sha256Hex(text) {
    if (!(root.crypto && root.crypto.subtle && root.TextEncoder)) return Promise.reject(new Error('Web Crypto unavailable'));
    return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function randomId(n) {
    var a = new Uint8Array(n || 12);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var failed = []; // mock brute-force guard
  function authErr(code, message) { return { ok: false, data: null, error: { code: code, message: message, details: null } }; }
  function mapFirebaseError(e) {
    var code = (e && e.code) || 'auth/internal-error';
    var map = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Use at least 8 characters.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/user-not-found': 'Email or password is incorrect.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
      'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
      'auth/popup-blocked': 'The browser blocked the Google sign-in window.',
      'auth/network-request-failed': 'No connection. Check the internet and try again.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase.',
      'auth/unauthorized-domain': 'This domain is not authorised in Firebase Authentication settings.'
    };
    return authErr(code, map[code] || 'Sign-in failed. Try again.');
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); }; s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function firebaseReady() {
    if (fb) return Promise.resolve(fb);
    var cfg = Store.env().firebase || {};
    if (!cfg.apiKey || !cfg.projectId || !cfg.authDomain || !cfg.appId) return Promise.reject(authErr('auth/not-configured', 'Firebase web config is missing. Add it in Admin > API & Integrations.'));
    var p = root.firebase && root.firebase.auth ? Promise.resolve() : loadScript(FIREBASE_CDN + 'firebase-app-compat.js').then(function () { return loadScript(FIREBASE_CDN + 'firebase-auth-compat.js'); });
    return p.then(function () {
      var app = root.firebase.apps && root.firebase.apps.length ? root.firebase.app() : root.firebase.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId });
      var auth = app.auth();
      auth.onAuthStateChanged(function () { emitAuth(); });
      fb = { app: app, auth: auth };
      return fb;
    });
  }
  function fbUser(u) {
    if (!u) return null;
    var prov = (u.providerData && u.providerData[0] && u.providerData[0].providerId) || 'password';
    return { uid: u.uid, email: u.email, display_name: u.displayName || null, provider: prov === 'google.com' ? 'google.com' : 'password', email_verified: !!u.emailVerified, simulated: false };
  }

  var Auth = {
    mode: function () { return Store.env().auth; },
    /** Current user or null. MOCK users carry simulated:true. */
    current: function () {
      if (Auth.mode() === 'FIREBASE') return fb && fb.auth.currentUser ? fbUser(fb.auth.currentUser) : null;
      var s = ls(SESSION_KEY); return s && s.user ? s.user : null;
    },
    onChange: function (fn) { authListeners.push(fn); return function () { authListeners = authListeners.filter(function (x) { return x !== fn; }); }; },
    init: function () {
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function () { return Auth.current(); }, function (e) { return Promise.reject(e); });
      return Promise.resolve(Auth.current());
    },
    signUp: function (email, password, displayName) {
      email = String(email || '').trim().toLowerCase();
      if (!validEmail(email)) return Promise.resolve(authErr('auth/invalid-email', 'Enter a valid email address.'));
      if (String(password || '').length < 8) return Promise.resolve(authErr('auth/weak-password', 'Use at least 8 characters.'));
      if (Auth.mode() === 'FIREBASE') {
        return firebaseReady().then(function (f) {
          return f.auth.createUserWithEmailAndPassword(email, password).then(function (cred) {
            var p = displayName ? cred.user.updateProfile({ displayName: displayName }) : Promise.resolve();
            return p.then(function () { return cred.user.sendEmailVerification(); }).then(function () { emitAuth(); return { ok: true, data: fbUser(cred.user), error: null }; });
          });
        }).catch(function (e) { return e && e.ok === false ? e : mapFirebaseError(e); });
      }
      var accounts = ls(ACCOUNTS_KEY) || {};
      if (accounts[email]) return Promise.resolve(authErr('auth/email-already-in-use', 'An account with this email already exists.'));
      var salt = randomId(8);
      return sha256Hex(salt + ':' + password).then(function (hash) {
        var user = { uid: 'mock_' + randomId(10), email: email, display_name: displayName || null, provider: 'password', email_verified: false, simulated: true };
        accounts[email] = { salt: salt, hash: hash, user: user, created_at: C.nowIso() };
        ls(ACCOUNTS_KEY, accounts); ls(SESSION_KEY, { user: user, at: C.nowIso() }); emitAuth();
        return { ok: true, data: user, error: null };
      });
    },
    signIn: function (email, password) {
      email = String(email || '').trim().toLowerCase();
      if (!validEmail(email)) return Promise.resolve(authErr('auth/invalid-email', 'Enter a valid email address.'));
      if (Auth.mode() === 'FIREBASE') {
        return firebaseReady().then(function (f) { return f.auth.signInWithEmailAndPassword(email, password).then(function (cred) { emitAuth(); return { ok: true, data: fbUser(cred.user), error: null }; }); })
          .catch(function (e) { return e && e.ok === false ? e : mapFirebaseError(e); });
      }
      var t = Date.now(); failed = failed.filter(function (x) { return t - x < 60000; });
      if (failed.length >= 5) return Promise.resolve(authErr('auth/too-many-requests', 'Too many attempts. Wait a minute and try again.'));
      var acc = (ls(ACCOUNTS_KEY) || {})[email];
      if (!acc) { failed.push(t); return Promise.resolve(authErr('auth/invalid-credential', 'Email or password is incorrect.')); }
      return sha256Hex(acc.salt + ':' + String(password || '')).then(function (hash) {
        if (hash !== acc.hash) { failed.push(t); return authErr('auth/invalid-credential', 'Email or password is incorrect.'); }
        ls(SESSION_KEY, { user: acc.user, at: C.nowIso() }); emitAuth();
        return { ok: true, data: acc.user, error: null };
      });
    },
    signInWithGoogle: function () {
      if (Auth.mode() === 'FIREBASE') {
        return firebaseReady().then(function (f) {
          var provider = new root.firebase.auth.GoogleAuthProvider();
          return f.auth.signInWithPopup(provider).then(function (cred) { emitAuth(); return { ok: true, data: fbUser(cred.user), error: null }; });
        }).catch(function (e) { return e && e.ok === false ? e : mapFirebaseError(e); });
      }
      var user = { uid: 'mock_google_demo', email: 'google.demo@bina.demo', display_name: 'Demo Google user', provider: 'google.com', email_verified: true, simulated: true };
      ls(SESSION_KEY, { user: user, at: C.nowIso() }); emitAuth();
      return Promise.resolve({ ok: true, data: user, error: null });
    },
    /** MOCK only: start a session without a password (no stored credential). */
    continueAsDemo: function () {
      if (Auth.mode() !== 'MOCK') return Promise.resolve(authErr('auth/operation-not-allowed', 'Demo sign-in exists only in MOCK mode.'));
      var user = { uid: 'mock_demo_user', email: 'demo.user@bina.demo', display_name: 'Demo user', provider: 'password', email_verified: true, simulated: true };
      ls(SESSION_KEY, { user: user, at: C.nowIso() }); emitAuth();
      return Promise.resolve({ ok: true, data: user, error: null });
    },
    sendVerification: function () {
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function (f) { if (!f.auth.currentUser) return authErr('auth/no-current-user', 'Sign in first.'); return f.auth.currentUser.sendEmailVerification().then(function () { return { ok: true, data: { sent: true }, error: null }; }); }).catch(function (e) { return e && e.ok === false ? e : mapFirebaseError(e); });
      return Promise.resolve({ ok: true, data: { sent: true, simulated: true }, error: null });
    },
    /** Re-check verification. FIREBASE: reloads the user. MOCK: simulates opening the emailed link. */
    refreshVerification: function (simulateClick) {
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function (f) { if (!f.auth.currentUser) return authErr('auth/no-current-user', 'Sign in first.'); return f.auth.currentUser.reload().then(function () { emitAuth(); return { ok: true, data: fbUser(f.auth.currentUser), error: null }; }); }).catch(function (e) { return e && e.ok === false ? e : mapFirebaseError(e); });
      var s = ls(SESSION_KEY); if (!s || !s.user) return Promise.resolve(authErr('auth/no-current-user', 'Sign in first.'));
      if (simulateClick) {
        s.user.email_verified = true; ls(SESSION_KEY, s);
        var accounts = ls(ACCOUNTS_KEY) || {}; if (accounts[s.user.email]) { accounts[s.user.email].user.email_verified = true; ls(ACCOUNTS_KEY, accounts); }
        emitAuth();
      }
      return Promise.resolve({ ok: true, data: s.user, error: null });
    },
    sendPasswordReset: function (email) {
      email = String(email || '').trim().toLowerCase();
      if (!validEmail(email)) return Promise.resolve(authErr('auth/invalid-email', 'Enter a valid email address.'));
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function (f) { return f.auth.sendPasswordResetEmail(email).then(function () { return { ok: true, data: { sent: true }, error: null }; }); }).catch(function (e) { return e && e.ok === false ? e : (e && e.code === 'auth/user-not-found' ? { ok: true, data: { sent: true }, error: null } : mapFirebaseError(e)); });
      // Same answer whether or not the account exists (no account enumeration).
      return Promise.resolve({ ok: true, data: { sent: true, simulated: true }, error: null });
    },
    signOut: function () {
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function (f) { return f.auth.signOut(); }).then(function () { emitAuth(); return { ok: true, data: null, error: null }; }, function () { emitAuth(); return { ok: true, data: null, error: null }; });
      ls(SESSION_KEY, null); emitAuth(); return Promise.resolve({ ok: true, data: null, error: null });
    },
    deleteAccount: function () {
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function (f) { if (!f.auth.currentUser) return authErr('auth/no-current-user', 'Sign in first.'); return f.auth.currentUser.delete().then(function () { emitAuth(); return { ok: true, data: null, error: null }; }); }).catch(function (e) { return e && e.ok === false ? e : mapFirebaseError(e); });
      var s = ls(SESSION_KEY); if (s && s.user) { var a = ls(ACCOUNTS_KEY) || {}; delete a[s.user.email]; ls(ACCOUNTS_KEY, a); }
      ls(SESSION_KEY, null); emitAuth(); return Promise.resolve({ ok: true, data: null, error: null });
    },
    /** Bearer token for the Worker. FIREBASE: a real ID token (never logged). MOCK: an explicit non-token marker the Worker rejects in production. */
    idToken: function () {
      if (Auth.mode() === 'FIREBASE') return firebaseReady().then(function (f) { return f.auth.currentUser ? f.auth.currentUser.getIdToken() : null; });
      var u = Auth.current(); return Promise.resolve(u ? 'mock.' + u.uid : null);
    }
  };

  // ================================================================== MEDIA
  var objectUrls = {};
  var Media = {
    mode: function () { return Store.env().media; },
    /** Promise<string> playable URL for an asset object. Rejects with a BINA error when the file is not available. */
    url: function (asset, opts) {
      if (!asset) return Promise.reject(C.err('MEDIA_NOT_READY', 'No file linked'));
      if (Media.mode() === 'R2') {
        var key = 'r2:' + asset.asset_id + ':' + (asset.version || 1);
        if (objectUrls[key]) return Promise.resolve(objectUrls[key]);
        return apiFetch('/media/' + encodeURIComponent(asset.asset_id) + '?v=' + encodeURIComponent(asset.version || 1), { raw: true, timeout_ms: 20000, auth: opts && opts.auth === false ? false : undefined }).then(function (res) {
          if (!res || typeof res.blob !== 'function') return Promise.reject((res && res.error) || C.err('MEDIA_NOT_READY', 'Media service unreachable'));
          if (!res.ok) return Promise.reject(C.err(res.status === 404 ? 'NOT_FOUND' : res.status === 401 ? 'UNAUTHORIZED' : 'MEDIA_NOT_READY', 'Media request failed (HTTP ' + res.status + ')'));
          return res.blob().then(function (b) { objectUrls[key] = URL.createObjectURL(b); return objectUrls[key]; });
        });
      }
      if (asset.local_blob) {
        var lk = 'idb:' + asset.asset_id;
        if (objectUrls[lk]) return Promise.resolve(objectUrls[lk]);
        return Store.getBlob(asset.asset_id).then(function (b) {
          if (!b) return Promise.reject(C.err('MEDIA_NOT_READY', 'This uploaded file is stored in another browser. Upload it again here.'));
          objectUrls[lk] = URL.createObjectURL(b); return objectUrls[lk];
        });
      }
      if (asset.missing_file) return Promise.reject(C.err('MEDIA_NOT_READY', 'File listed but not uploaded yet'));
      return Promise.resolve(asset.object_key);
    },
    urlForAssetId: function (assetId, state) { return Media.url(C.getAsset(state || Store.state(), assetId)); },
    /** Store an uploaded file in this browser (LOCAL mode) or send it to the Worker (R2 mode, admin only). */
    putUpload: function (assetId, file) {
      if (Media.mode() === 'R2') return Promise.resolve(bad('FORBIDDEN', 'R2 uploads go through the Admin API with Cloudflare Access. Not available from this prototype.'));
      return Store.putBlob(assetId, file).then(function () { return ok({ asset_id: assetId, stored: 'indexeddb' }); }, function (e) { return bad('INTERNAL', 'Could not store the file in this browser', { reason: String(e && e.message || e) }); });
    },
    /** Read duration/size metadata for validation before upload. */
    probe: function (file) {
      return new Promise(function (resolve) {
        var isVideo = /^video\//.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
        var el = document.createElement(isVideo ? 'video' : 'audio');
        var url = URL.createObjectURL(file), done = false;
        function finish(meta) { if (done) return; done = true; URL.revokeObjectURL(url); resolve(meta); }
        el.preload = 'metadata'; el.muted = true;
        el.onloadedmetadata = function () { finish({ name: file.name, type: file.type, size: file.size, duration_ms: isFinite(el.duration) ? Math.round(el.duration * 1000) : 0, width: el.videoWidth || null, height: el.videoHeight || null }); };
        el.onerror = function () { finish({ name: file.name, type: file.type, size: file.size, duration_ms: 0, unreadable: true }); };
        setTimeout(function () { finish({ name: file.name, type: file.type, size: file.size, duration_ms: 0, unreadable: true }); }, 8000);
        el.src = url;
      });
    }
  };

  // ================================================================== RESOLVE (Flow 2 understanding)
  var Resolve = {
    mode: function () { return Store.env().resolve; },
    /**
     * input: { text } or { audio: Blob, filename }.
     * opts.state: catalogue to test against (Admin tester). Customers always use the shared catalogue.
     * Resolves to an API v1 envelope; data is a ResolveResult. Every result carries provider + simulated.
     */
    resolve: function (input, opts) {
      opts = opts || {};
      input = input || {};
      var t0 = now();
      if (Resolve.mode() === 'LIVE') {
        var body, headers = {};
        if (input.audio) { body = new FormData(); body.append('audio', input.audio, input.filename || 'speech.webm'); }
        else { body = JSON.stringify({ text: String(input.text || '') }); headers['Content-Type'] = 'application/json'; }
        return apiFetch('/flow2/resolve', { method: 'POST', body: body, headers: headers, timeout_ms: 25000 }).then(function (env) {
          // Label from the Worker's own answer: a Worker running OPENAI_MODE=mock returns simulated:true (never relabel it LIVE).
          var sim = !!((env.data && env.data.simulated) || (env.error && env.error.details && env.error.details.simulated));
          env.mode = sim ? 'MOCK' : 'LIVE';
          return env;
        });
      }
      if (input.audio) return Promise.resolve(bad('OPENAI_UNAVAILABLE', 'Speech-to-text is not connected in MOCK mode. Type the words or pick a demo phrase.', { mode: 'MOCK', needs_text: true }, { mode: 'MOCK' }));
      var text = String(input.text || '');
      if (text.length > 500) return Promise.resolve(bad('PAYLOAD_TOO_LARGE', 'Keep it under 500 characters', null, { mode: 'MOCK' }));
      var state = opts.state || Store.state();
      var raw = C.mockResolve(text, state);
      var v = C.validateResolve(raw, state);
      var out = v.ok ? ok(v.data) : { ok: false, data: v.data || null, error: v.error, request_id: requestId() };
      out.mode = 'MOCK';
      out.trace = { input: text, normalized: C.normalizeText(text), language: raw.language, provider_output: { transcript: raw.transcript, language: raw.language, meaning_id: raw.meaning_id, supported: raw.supported }, candidates: raw.candidates, catalogue_size: C.buildOpenAICatalogue(state).length };
      out.timing_ms = Math.round(now() - t0);
      return Promise.resolve(out);
    }
  };

  // ================================================================== CATALOGUE (customer reads)
  var Catalogue = {
    manifest: function () {
      if (Resolve.mode() === 'LIVE') return apiFetch('/catalogue/manifest');
      return Promise.resolve(ok(C.buildManifest(Store.state()), { mode: 'MOCK' }));
    },
    flow1: function () {
      if (Resolve.mode() === 'LIVE') return apiFetch('/flow1/catalogue');
      return Promise.resolve(ok(C.buildFlow1Catalogue(Store.state()), { mode: 'MOCK' }));
    }
  };

  // ================================================================== RECORDS (customer-generated operational data)
  function stamp(prefix, list) { var n = (list || []).length + 1; return prefix + '_' + String(n).padStart(4, '0') + '_' + randomId(2); }
  var Records = {
    /** In LIVE mode the Worker logs NO_MATCH itself during /flow2/resolve, so the app does nothing. */
    logUnsupported: function (text, language, source) {
      if (Resolve.mode() === 'LIVE') return Promise.resolve(ok({ logged_by: 'server' }));
      var clean = String(text || '').trim().slice(0, 200);
      if (!clean) return Promise.resolve(bad('VALIDATION_ERROR', 'Nothing to log'));
      return Promise.resolve(Store.commit('unsupported.log', function (s) {
        s.unsupported_requests = s.unsupported_requests || [];
        var norm = C.normalizeText(clean), existing = null;
        s.unsupported_requests.forEach(function (u) { if (C.normalizeText(u.text) === norm) existing = u; });
        if (existing) { existing.count = (existing.count || 1) + 1; existing.last_seen_at = C.nowIso(); return { ok: true, data: existing }; }
        var rec = { id: stamp('UNS', s.unsupported_requests), text: clean, language: language || C.detectLanguage(clean), source: source || 'customer_flow2', count: 1, status: 'new', linked_meaning_id: null, first_seen_at: C.nowIso(), last_seen_at: C.nowIso() };
        s.unsupported_requests.push(rec); return { ok: true, data: rec };
      }));
    },
    sendFeedback: function (fbk) {
      var REASONS = ['wrong_meaning', 'wrong_ar_audio', 'wrong_en_audio', 'avatar_quality', 'avatar_wrong_sign', 'too_slow', 'other'];
      if (!fbk || ['flow1', 'flow2'].indexOf(fbk.flow) < 0 || REASONS.indexOf(fbk.reason) < 0) return Promise.resolve(bad('VALIDATION_ERROR', 'Choose what went wrong'));
      var clean = { flow: fbk.flow, meaning_id: fbk.meaning_id || null, asset_id: fbk.asset_id || null, reason: fbk.reason, note: String(fbk.note || '').slice(0, 500), input_text: fbk.input_text ? String(fbk.input_text).slice(0, 200) : null };
      if (Resolve.mode() === 'LIVE') return apiFetch('/feedback', { method: 'POST', body: JSON.stringify(clean), headers: { 'Content-Type': 'application/json' } });
      var u = Auth.current();
      return Promise.resolve(Store.commit('feedback.create', function (s) {
        s.feedback = s.feedback || [];
        var rec = Object.assign({ id: stamp('FB', s.feedback), user_uid: u ? u.uid : null, status: 'new', created_at: C.nowIso(), simulated: true }, clean);
        s.feedback.push(rec); return { ok: true, data: rec };
      }));
    },
    /** Firebase is identity only; BINA keeps its own profile (preferences, watch) keyed by uid. */
    ensureProfile: function (user, prefs) {
      if (!user) return Promise.resolve(bad('UNAUTHORIZED', 'Sign in first'));
      if (Resolve.mode() === 'LIVE') return prefs ? apiFetch('/me', { method: 'PATCH', body: JSON.stringify(prefs), headers: { 'Content-Type': 'application/json' } }) : apiFetch('/me', { method: 'GET' });
      return Promise.resolve(Store.commit('user.profile', function (s) {
        s.users = s.users || [];
        var p = null; s.users.forEach(function (x) { if (x.uid === user.uid) p = x; });
        if (!p) { p = { uid: user.uid, provider: user.provider, email: user.email, display_name: user.display_name || null, email_verified: !!user.email_verified, disabled: false, created_at: C.nowIso(), last_sign_in_at: C.nowIso(), profile: { preferred_language: 'ar', paired_watch_id: null }, simulated: !!user.simulated }; s.users.push(p); }
        else { p.last_sign_in_at = C.nowIso(); p.email_verified = !!user.email_verified; if (user.display_name) p.display_name = user.display_name; }
        p.profile = p.profile || {};
        if (prefs) Object.keys(prefs).forEach(function (k) { if (['preferred_language', 'paired_watch_id'].indexOf(k) >= 0) p.profile[k] = prefs[k]; else if (k === 'display_name') p.display_name = String(prefs[k] || '').slice(0, 60) || null; });
        return { ok: true, data: p };
      }));
    }
  };

  // ================================================================== HEALTH (truthful integration status)
  var Health = {
    /** Never reports Connected without a successful call. */
    check: function () {
      var env = Store.env();
      var local = {
        resolve: env.resolve, auth: env.auth, media: env.media, api_base_set: !!env.api_base,
        firebase_config_set: !!(env.firebase.apiKey && env.firebase.projectId && env.firebase.authDomain && env.firebase.appId)
      };
      if (!env.api_base) return Promise.resolve(ok({ reachable: false, checked_at: C.nowIso(), local: local, server: null, note: 'No API base URL. Worker, D1, R2, OpenAI and Access cannot be checked.' }));
      return apiFetch('/health', { auth: false, timeout_ms: 8000 }).then(function (r) {
        return ok({ reachable: !!r.ok, checked_at: C.nowIso(), local: local, server: r.ok ? r.data : null, error: r.ok ? null : r.error, timing_ms: r.timing_ms || null });
      });
    }
  };

  // ================================================================== FILES (offer a generated file to the user)
  var MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv;charset=utf-8', json: 'application/json', md: 'text/markdown', txt: 'text/plain', zip: 'application/zip' };
  var Files = {
    /**
     * Save a generated file. Inside a claude.ai artifact viewer this uses the platform `downloads` capability
     * (the viewer confirms); elsewhere (local server, file://) it falls back to a normal browser download.
     * Resolves {ok:true, data:{status}} or {ok:false, error:{code,message}} (code 'declined' when the viewer says no).
     */
    save: function (filename, data) {
      var ext = (/\.([a-z0-9]+)$/i.exec(filename) || [])[1] || 'txt';
      var blob = data instanceof Blob ? data : new Blob([data], { type: MIME[ext.toLowerCase()] || 'application/octet-stream' });
      function fallback() {
        try {
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
          return ok({ status: 'saved', via: 'browser' });
        } catch (e) { return bad('INTERNAL', 'The browser blocked the download'); }
      }
      var host = root.claude && typeof root.claude.use === 'function' ? root.claude : null;
      if (!host) return Promise.resolve(fallback());
      return host.use('downloads').then(function (d) {
        if (!d) return fallback();
        return d.save({ filename: filename, data: blob }).then(function (r) { return ok({ status: r && r.status, via: 'viewer' }); }, function (e) {
          var code = e && e.code;
          return bad(code === 'declined' ? 'declined' : code === 'rate_limited' ? 'RATE_LIMITED' : 'INTERNAL', code === 'declined' ? 'Download cancelled' : 'Download not available here (' + (code || 'unknown') + ')');
        });
      }, function () { return fallback(); });
    }
  };

  root.BinaProviders = { Auth: Auth, Media: Media, Resolve: Resolve, Catalogue: Catalogue, Records: Records, Health: Health, Files: Files, apiFetch: apiFetch, FIREBASE_VERSION: FIREBASE_VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
