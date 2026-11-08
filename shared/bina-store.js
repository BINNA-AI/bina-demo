/*!
 * BINA prototype store (browser only).
 * One shared catalogue for Admin and Customer: same origin -> same localStorage document.
 * Uploaded media blobs live in IndexedDB. Every write is atomic (draft copy, then swap).
 * In production this role is played by the Worker + D1 + R2; nothing here is a backend.
 */
(function (root) {
  'use strict';
  var C = root.BinaCore;
  if (!C) throw new Error('bina-core.js must load before bina-store.js');

  var KEY = 'bina.proto.catalogue.v1';
  var ENV_KEY = 'bina.proto.env.v1';
  var SCHEMA = 'bina.store/1';
  var AUDIT_CAP = 400;
  var IDB_NAME = 'bina-proto-media', IDB_STORE = 'blobs';

  var storageOk = (function () { try { var k = '__bina_probe'; root.localStorage.setItem(k, '1'); root.localStorage.removeItem(k); return true; } catch (e) { return false; } })();
  var memory = { doc: null, env: null };
  var listeners = [];

  function seed() {
    if (!root.BINA_SEED) throw new Error('bina-data.js must load before bina-store.js');
    var s = C.clone(root.BINA_SEED);
    s.meta = s.meta || {};
    s.meta.fingerprint = C.catalogueFingerprint(s);
    return { schema: SCHEMA, rev: 1, state: s, saved_at: C.nowIso() };
  }
  function readDoc() {
    if (storageOk) {
      try {
        var raw = root.localStorage.getItem(KEY);
        if (raw) { var d = JSON.parse(raw); if (d && d.schema === SCHEMA && d.state && Array.isArray(d.state.meanings)) return d; }
      } catch (e) { /* corrupt or blocked: fall through to seed */ }
    } else if (memory.doc) return memory.doc;
    var f = seed(); writeDoc(f); return f;
  }
  function writeDoc(d) {
    d.saved_at = C.nowIso();
    if (d.state.audit_log && d.state.audit_log.length > AUDIT_CAP) d.state.audit_log = d.state.audit_log.slice(-AUDIT_CAP);
    memory.doc = d;
    if (!storageOk) return false;
    try { root.localStorage.setItem(KEY, JSON.stringify(d)); return true; }
    catch (e) { storageOk = false; emit('storage-error', { reason: String(e && e.message || e) }); return false; }
  }
  function emit(kind, detail) {
    listeners.slice().forEach(function (fn) { try { fn({ kind: kind, detail: detail || null, rev: doc ? doc.rev : 0 }); } catch (e) { if (root.console) console.error(e); } });
  }

  var doc = readDoc();

  if (root.addEventListener) {
    root.addEventListener('storage', function (e) {
      if (e.key === KEY) { doc = readDoc(); emit('external'); }
      else if (e.key === ENV_KEY) emit('env');
      else if (e.key === null) { doc = readDoc(); emit('external'); }
    });
  }

  // ------------------------------------------------------------ environment (provider modes)
  var DEFAULT_ENV = {
    resolve: 'MOCK',          // MOCK | LIVE      (Flow 2 understanding: deterministic mock vs Worker -> OpenAI)
    auth: 'MOCK',             // MOCK | FIREBASE  (customer sign-in)
    media: 'LOCAL',           // LOCAL | R2       (where audio/avatar files come from)
    api_base: '',             // e.g. https://api.example.com  (no trailing slash). Never a secret.
    firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' } // public web config, entered by the team, never hardcoded
  };
  function readEnv() {
    var e = null;
    if (storageOk) { try { e = JSON.parse(root.localStorage.getItem(ENV_KEY) || 'null'); } catch (x) { e = null; } }
    else e = memory.env;
    e = Object.assign({}, DEFAULT_ENV, e || {});
    e.firebase = Object.assign({}, DEFAULT_ENV.firebase, (e && e.firebase) || {});
    return e;
  }

  // ------------------------------------------------------------ IndexedDB blobs (uploaded media)
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var r;
      try { r = root.indexedDB.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore(IDB_STORE); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('IndexedDB open failed')); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(IDB_STORE, mode), st = t.objectStore(IDB_STORE), out;
        var req = fn(st);
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
      });
    });
  }

  var Store = {
    SCHEMA: SCHEMA,
    storageAvailable: function () { return storageOk; },
    /** Current catalogue state. Treat as read-only; change it through commit(). */
    state: function () { return doc.state; },
    rev: function () { return doc.rev; },
    savedAt: function () { return doc.saved_at; },
    /** Re-read from storage (another tab may have written). */
    refresh: function () { doc = readDoc(); return doc.state; },
    /**
     * Atomic change. mutator(draft) edits a copy. Return {ok:false, error} to abort with no change,
     * or {ok:true, state:newState} to replace the whole state (used by Excel import).
     * catalogue_version is bumped once if customer-visible content changed.
     */
    commit: function (label, mutator) {
      doc = readDoc(); // merge on the latest copy written by any tab
      var draft = C.clone(doc.state), res;
      try { res = mutator(draft); }
      catch (e) { return { ok: false, error: C.err('INTERNAL', 'Change failed and was not saved', { reason: String(e && e.message || e) }) }; }
      if (res && res.ok === false) return res;
      if (res && res.state) draft = res.state;
      var fp = C.catalogueFingerprint(draft);
      if (fp !== doc.state.meta.fingerprint) { C.bumpCatalogue(draft); draft.meta.fingerprint = fp; }
      draft.meta.updated_at = C.nowIso();
      doc = { schema: SCHEMA, rev: doc.rev + 1, state: draft, saved_at: doc.saved_at };
      var persisted = writeDoc(doc);
      emit('commit', { label: label || null, persisted: persisted });
      if (res && typeof res === 'object' && 'ok' in res) { var out = Object.assign({}, res); delete out.state; return out; }
      return { ok: true, data: res === undefined ? null : res };
    },
    /** Restore the demo catalogue from prototype_data (keeps provider settings). */
    reset: function () {
      doc = seed(); writeDoc(doc);
      return Store.clearBlobs().catch(function () { }).then(function () { emit('reset'); return true; });
    },
    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },

    // environment
    DEFAULT_ENV: C.clone(DEFAULT_ENV),
    env: function () { return readEnv(); },
    saveEnv: function (patch) {
      var e = readEnv();
      Object.keys(patch || {}).forEach(function (k) {
        if (!(k in DEFAULT_ENV)) return; // mass-assignment guard
        if (k === 'firebase') e.firebase = Object.assign({}, e.firebase, C.clone(patch.firebase || {}));
        else e[k] = patch[k];
      });
      if (['MOCK', 'LIVE'].indexOf(e.resolve) < 0) e.resolve = 'MOCK';
      if (['MOCK', 'FIREBASE'].indexOf(e.auth) < 0) e.auth = 'MOCK';
      if (['LOCAL', 'R2'].indexOf(e.media) < 0) e.media = 'LOCAL';
      e.api_base = String(e.api_base || '').trim().replace(/\/+$/, '');
      if (e.api_base && !/^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(e.api_base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s?#]*)?$/i.test(e.api_base)) {
        return { ok: false, error: C.err('VALIDATION_ERROR', 'API base must be an https URL (or http://localhost for development)') };
      }
      memory.env = e;
      if (storageOk) { try { root.localStorage.setItem(ENV_KEY, JSON.stringify(e)); } catch (x) { /* ignore */ } }
      emit('env');
      return { ok: true, data: e };
    },

    // media blobs
    putBlob: function (key, blob) { return tx('readwrite', function (st) { return st.put(blob, key); }).then(function () { return key; }); },
    getBlob: function (key) { return tx('readonly', function (st) { return st.get(key); }); },
    deleteBlob: function (key) { return tx('readwrite', function (st) { return st.delete(key); }); },
    clearBlobs: function () { return tx('readwrite', function (st) { return st.clear(); }); }
  };

  root.BinaStore = Store;
})(typeof window !== 'undefined' ? window : globalThis);
