/*!
 * BINA repository: ONE data access layer for Admin and Customer, two backends.
 *   mode 'api'   : the page is served by the BINA Worker (wrangler dev or Cloudflare). Every read and write goes
 *                  through API v1 (Worker -> D1 / R2 / OpenAI). This is the real integration path.
 *   mode 'local' : the page was opened directly (file://) or the Worker is not reachable. Same operations run
 *                  on the shared demo catalogue in this browser (BinaStore). Labelled LOCAL DEMO in the UI.
 * Both modes run the same BinaCore rules, so a result never depends on where it was computed.
 * Load after bina-core, bina-data, bina-store, bina-providers.
 */
(function (root) {
  'use strict';
  var C = root.BinaCore, Store = root.BinaStore, P = root.BinaProviders;
  if (!C || !Store || !P) throw new Error('Load bina-core, bina-data, bina-store and bina-providers before bina-repo.js');

  var mode = 'local', server = null, role = 'admin', snapshot = null, etag = null, listeners = [], timer = null, lastVersion = null, ready = null;
  function emit(kind, detail) { listeners.slice().forEach(function (fn) { try { fn({ kind: kind, detail: detail || null, mode: mode }); } catch (e) { if (root.console) console.error(e); } }); }
  function okEnv(data) { return { ok: true, data: data === undefined ? null : data, error: null, request_id: null }; }
  function errEnv(code, message, details) { return { ok: false, data: null, error: C.err(code, message, details), request_id: null }; }
  // Admin identity is Cloudflare Access (or the Worker's local dev admin), never a customer token: admin calls send none.
  function api(path, opts) { opts = Object.assign({}, opts || {}); if (role === 'admin') opts.auth = false; return P.apiFetch(path, opts); }
  function json(method, path, body) { return api(path, { method: method, body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'Content-Type': 'application/json' } }); }
  function withVersion(patch, v) { var b = Object.assign({}, patch || {}); if (v !== undefined && v !== null) b.version = v; return b; }

  // ------------------------------------------------------------------ local implementations (BinaStore + BinaCore)
  var local = {
    createMeaning: function (input, actor) { return Store.commit('meaning.create', function (s) { return C.createMeaning(s, input, actor); }); },
    updateMeaning: function (id, patch, v, actor) { return Store.commit('meaning.update', function (s) { return C.updateMeaning(s, id, patch, actor, v); }); },
    archiveMeaning: function (id, actor) { return Store.commit('meaning.archive', function (s) { return C.archiveMeaning(s, id, actor); }); },
    restoreMeaning: function (id, actor) { return Store.commit('meaning.restore', function (s) { return C.restoreMeaning(s, id, actor); }); },
    deleteMeaning: function (id, actor) { return Store.commit('meaning.delete', function (s) { return C.deleteMeaning(s, id, actor); }); },
    updateFlow: function (flow, id, patch, v, actor) {
      return Store.commit(flow + '.update', function (s) {
        var made = C.ensureProfile(s, flow, id, actor); if (!made.ok) return made;
        return C.updateProfile(s, flow, id, patch, actor, made.created ? undefined : v);
      });
    },
    approveAsset: function (id, actor) { return Store.commit('asset.approve', function (s) { return C.approveAsset(s, id, actor); }); },
    rejectAsset: function (id, reason, actor) { return Store.commit('asset.reject', function (s) { return C.rejectAsset(s, id, actor, reason); }); },
    unlinkAsset: function (meaningId, mediaRole, actor) { return Store.commit('asset.unlink', function (s) { return C.unlinkAsset(s, meaningId, mediaRole, actor); }); },
    archiveAsset: function (id, actor) { return Store.commit('asset.archive', function (s) { return C.archiveAsset(s, id, actor); }); }
  };

  function recordPatch(collection, id, patch, allowed, actor) {
    return Store.commit(collection + '.update', function (s) {
      var list = s[collection] || [], rec = null;
      list.forEach(function (r) { if (r.id === id) rec = r; });
      if (!rec) return { ok: false, error: C.err('NOT_FOUND', 'Record not found') };
      var bad = Object.keys(patch || {}).filter(function (k) { return allowed.indexOf(k) < 0; });
      if (bad.length) return { ok: false, error: C.err('VALIDATION_ERROR', 'Fields not editable: ' + bad.join(', ')) };
      var before = C.clone(rec); Object.assign(rec, patch); rec.updated_at = C.nowIso();
      C.audit(s, actor, collection + '.update', collection, id, before, rec);
      return { ok: true, data: rec };
    });
  }

  var Repo = {
    /** 'api' when served by the BINA Worker, else 'local'. */
    mode: function () { return mode; },
    /** Health data from the Worker in api mode (booleans only, never secrets). */
    server: function () { return server; },
    /**
     * Detect the backend. opts.role: 'admin' | 'customer'. opts.prefer: 'auto' (default) | 'local' | 'api'.
     * In api mode the providers are pointed at this origin (Resolve LIVE, Media via Worker); in local mode they are left as they are.
     */
    init: function (opts) {
      opts = opts || {};
      role = opts.role || 'admin';
      if (ready) return ready;
      var origin = root.location && /^https?:$/.test(root.location.protocol) ? root.location.origin : null;
      var tryApi = opts.prefer !== 'local' && origin;
      ready = (tryApi ? fetchHealth(origin) : Promise.resolve(null)).then(function (h) {
        if (h && h.ok && h.data && h.data.service === 'bina-api') {
          mode = 'api'; server = h.data;
          Store.saveEnv({ api_base: origin, resolve: 'LIVE', media: 'R2' });
          return Repo.refresh().then(function () { startPolling(opts.pollMs || 4000); return { mode: mode, server: server }; });
        }
        if (opts.prefer === 'api') return { mode: 'local', server: null, warning: 'Worker not reachable: using the local demo catalogue' };
        mode = 'local'; server = null;
        var env = Store.env();
        if (env.resolve === 'LIVE' && env.api_base === origin) Store.saveEnv({ resolve: 'MOCK', media: 'LOCAL' }); // stale api settings from an earlier session
        Store.on(function (e) { emit(e.kind === 'external' ? 'external' : e.kind, e.detail); });
        return { mode: mode, server: null };
      });
      return ready;
    },
    /** Current catalogue snapshot (BinaCore state shape). Read-only. */
    state: function () { return mode === 'api' ? snapshot : Store.state(); },
    version: function () { var s = Repo.state(); return s && s.meta ? s.meta.catalogue_version : null; },
    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    /** Re-read from the backend. Customer role only needs the manifest (catalogues are fetched by BinaProviders). */
    refresh: function () {
      if (mode !== 'api') return Promise.resolve(Store.refresh());
      if (role === 'customer' && P.Auth && !P.Auth.current()) return Promise.resolve(snapshot); // customer routes need a signed-in user
      if (role === 'customer') return api('/catalogue/manifest').then(function (r) { if (r.ok) { lastVersion = r.data.catalogue_version; snapshot = { meta: { catalogue_version: r.data.catalogue_version }, manifest: r.data }; } return snapshot; });
      return Promise.all([
        api('/admin/catalogue', { headers: etag ? { 'If-None-Match': etag } : {} }),
        api('/admin/unsupported?limit=200'), api('/admin/feedback?limit=200'), api('/admin/audit?limit=200')
      ]).then(function (rs) {
        var cat = rs[0];
        if (cat.http_status === 304 && snapshot) return snapshot;
        if (cat.ok && cat.data && cat.data.meta) etag = '"v' + cat.data.meta.catalogue_version + '"';
        if (!cat.ok) { emit('error', cat.error); return snapshot; }
        var s = cat.data;
        s.unsupported_requests = rs[1].ok ? (rs[1].data.items || []) : [];
        s.feedback = rs[2].ok ? (rs[2].data.items || []) : [];
        s.audit_log = rs[3].ok ? (rs[3].data.items || []).slice().reverse() : [];
        ['users', 'watches', 'team', 'integrations'].forEach(function (k) { if (!s[k]) s[k] = []; });
        snapshot = s; lastVersion = s.meta && s.meta.catalogue_version;
        return snapshot;
      });
    },

    // ---------------------------------------------------------------- Admin operations (Promise<envelope>)
    createMeaning: function (input, actor) { return mode === 'api' ? after(json('POST', '/admin/meanings', input)) : Promise.resolve(local.createMeaning(input, actor)); },
    updateMeaning: function (id, patch, v, actor) { return mode === 'api' ? after(json('PATCH', '/admin/meanings/' + enc(id), withVersion(patch, v))) : Promise.resolve(local.updateMeaning(id, patch, v, actor)); },
    archiveMeaning: function (id, actor) { return mode === 'api' ? after(json('POST', '/admin/meanings/' + enc(id) + '/archive', {})) : Promise.resolve(local.archiveMeaning(id, actor)); },
    restoreMeaning: function (id, actor) { return mode === 'api' ? after(json('POST', '/admin/meanings/' + enc(id) + '/restore', {})) : Promise.resolve(local.restoreMeaning(id, actor)); },
    deleteMeaning: function (id, actor) { return mode === 'api' ? after(json('DELETE', '/admin/meanings/' + enc(id), {})) : Promise.resolve(local.deleteMeaning(id, actor)); },
    /** flow: 'flow1' | 'flow2'. Creates the profile when the meaning has none yet. */
    updateFlow: function (flow, id, patch, v, actor) {
      if (flow !== 'flow1' && flow !== 'flow2') return Promise.resolve(errEnv('VALIDATION_ERROR', 'flow must be flow1 or flow2'));
      return mode === 'api' ? after(json('PATCH', '/admin/meanings/' + enc(id) + '/' + flow, withVersion(patch, v))) : Promise.resolve(local.updateFlow(flow, id, patch, v, actor));
    },
    /** Upload a file as a NEW pending version for a role (FLOW1_AR_AUDIO | FLOW1_EN_AUDIO | FLOW2_AVATAR). Never live until approved. */
    uploadMedia: function (meaningId, mediaRole, file, actor) {
      return P.Media.probe(file).then(function (meta) {
        // A browser without the codec (e.g. Chromium builds without H.264) cannot read the duration: do not call
        // the file corrupt for that; the Worker re-validates the bytes (magic-byte sniff) on upload.
        var el = root.document && root.document.createElement(/^video\//.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name) ? 'video' : 'audio');
        var cannotDecode = meta.unreadable && el && typeof el.canPlayType === 'function' && el.canPlayType(file.type || '') !== 'probably' && /\.(mp4|m4a|mov|aac)$/i.test(file.name);
        var dur = cannotDecode ? null : meta.duration_ms;
        var errors = C.validateMediaFile({ name: file.name, type: file.type, size: file.size, duration_ms: dur }, mediaRole);
        if (errors.length) return errEnv('VALIDATION_ERROR', 'Invalid media file', { fields: errors });
        if (mode === 'api') {
          var fd = new FormData();
          fd.append('meaning_id', meaningId); fd.append('role', mediaRole); fd.append('file', file, file.name);
          if (dur) fd.append('duration_ms', String(dur));
          if (meta.width) fd.append('width', String(meta.width));
          if (meta.height) fd.append('height', String(meta.height));
          return after(api('/admin/media', { method: 'POST', body: fd, timeout_ms: 60000 }));
        }
        var res = Store.commit('asset.upload', function (s) { return C.stageAssetVersion(s, meaningId, mediaRole, { filename: file.name, mime_type: file.type, bytes: file.size, duration_ms: dur, width: meta.width, height: meta.height, local_blob: true, source: 'ADMIN_UPLOAD', rights_status: 'pending' }, actor); });
        if (!res.ok) return res;
        return P.Media.putUpload(res.data.asset_id, file).then(function (u) { return u.ok ? res : u; });
      });
    },
    approveAsset: function (id, actor) { return mode === 'api' ? after(json('POST', '/admin/assets/' + enc(id) + '/approve', {})) : Promise.resolve(local.approveAsset(id, actor)); },
    rejectAsset: function (id, reason, actor) { return mode === 'api' ? after(json('POST', '/admin/assets/' + enc(id) + '/reject', { reason: reason || null })) : Promise.resolve(local.rejectAsset(id, reason, actor)); },
    unlinkAsset: function (meaningId, mediaRole, actor) { return mode === 'api' ? after(json('POST', '/admin/profiles/' + enc(meaningId) + '/unlink', { role: mediaRole })) : Promise.resolve(local.unlinkAsset(meaningId, mediaRole, actor)); },
    archiveAsset: function (id, actor) { return mode === 'api' ? after(json('POST', '/admin/assets/' + enc(id) + '/archive', {})) : Promise.resolve(local.archiveAsset(id, actor)); },

    /** Import step 1. raw = { SheetName: [[cells]] } (read in the browser with BinaXlsx.readWorkbook). Server re-validates everything. */
    importPreview: function (filename, raw) {
      if (mode === 'api') return json('POST', '/admin/import/preview', { filename: filename, sheets: raw });
      var parsed = C.parseWorkbook(raw);
      return Promise.resolve(okEnv({ batch_id: 'LOCAL_' + Date.now().toString(36), filename: filename, preview: C.buildImportPreview(Store.state(), parsed), parsed: parsed }));
    },
    /** Import step 2. edits = [{sheet,row,field,value}], decisions = {itemId: decision}. Atomic: all or nothing. */
    importCommit: function (batch, decisions, edits, actor) {
      if (mode === 'api') return after(json('POST', '/admin/import/commit', { batch_id: batch.batch_id, decisions: decisions || {}, edits: edits || [] }));
      var parsed = C.clone(batch.parsed);
      (edits || []).forEach(function (e) { C.editParsedCell(parsed, e.sheet, e.row, e.field, e.value); });
      var res = Store.commit('import', function (s) {
        var pv = C.applyDecisions(C.buildImportPreview(s, parsed), decisions || {});
        if (!C.previewCanCommit(pv)) return { ok: false, error: C.err('IMPORT_CONFLICT', 'Resolve conflicts and errors first') };
        return C.applyImport(s, pv, actor, { batch_id: batch.batch_id, filename: batch.filename });
      });
      return Promise.resolve(res.ok ? okEnv({ committed: true, counts: res.counts, catalogue_version: Store.state().meta.catalogue_version }) : res);
    },
    updateUnsupported: function (id, patch, v, actor) { return mode === 'api' ? after(json('PATCH', '/admin/unsupported/' + enc(id), withVersion(patch, v))) : Promise.resolve(recordPatch('unsupported_requests', id, patch, ['status', 'linked_meaning_id', 'note'], actor)); },
    updateFeedback: function (id, patch, v, actor) {
      if (mode === 'api') return after(json('PATCH', '/admin/feedback/' + enc(id), withVersion(patch, v)));
      // Same rule as the Worker: an admin `note` is stored as admin_note; the customer's own note is never overwritten.
      var p = Object.assign({}, patch || {}); if ('note' in p) { p.admin_note = p.note; delete p.note; }
      return Promise.resolve(recordPatch('feedback', id, p, ['status', 'assignee', 'admin_note'], actor));
    },
    /** Admin mapping tester. api: the Worker's configured provider (MOCK or LIVE OpenAI). local: the in-browser mock. */
    resolveTest: function (text) {
      if (mode === 'api') return json('POST', '/admin/resolve-test', { text: String(text || '') }).then(function (r) {
        // Same top-level mode/trace as local mode (the Worker puts trace in data, or in error.details on rejection).
        var t = (r && r.data && r.data.trace) || (r && r.error && r.error.details && r.error.details.trace) || null;
        if (t) { r.trace = t; r.mode = t.mode; }
        return r;
      });
      return P.Resolve.resolve({ text: text }, { state: Store.state() });
    },
    /** Record a client-side action (e.g. an Excel export) in the audit log. Local: audit entry. API: no server route; resolves {logged:false}. */
    logEvent: function (action, details, actor) {
      if (mode === 'api') return Promise.resolve(okEnv({ logged: false, reason: 'client-side action; the Worker records server-side changes itself' }));
      return Promise.resolve(Store.commit('audit.' + action, function (s) { C.audit(s, actor || 'unknown', action, 'client_action', action, null, details || null); return { ok: true, data: { logged: true } }; }));
    },
        /** Media URL for an asset (api: through the Worker; local: files / IndexedDB). */
    mediaUrl: function (asset) { return P.Media.url(asset, mode === 'api' && role === 'admin' ? { auth: false } : undefined); }
  };

  function enc(s) { return encodeURIComponent(String(s)); }
  function after(p) { return p.then(function (r) { if (!r.ok) return r; return Repo.refresh().then(function () { emit('commit', { request_id: r.request_id }); return r; }); }); }
  function fetchHealth(origin) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 2500) : null;
    return fetch(origin + '/api/v1/health', { cache: 'no-store', signal: ctl ? ctl.signal : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (t) clearTimeout(t); return j; }, function () { if (t) clearTimeout(t); return null; });
  }
  function startPolling(ms) {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (root.document && root.document.hidden) return;
      var before = lastVersion;
      if (role === 'customer') {
        if (P.Auth && !P.Auth.current()) return; // nothing to poll until someone signs in
        api('/catalogue/manifest').then(function (r) {
          if (!r.ok) return;
          if (before !== null && r.data.catalogue_version !== before) { lastVersion = r.data.catalogue_version; snapshot = { meta: { catalogue_version: lastVersion }, manifest: r.data }; emit('external', { catalogue_version: lastVersion }); }
          else lastVersion = r.data.catalogue_version;
        });
      } else {
        Repo.refresh().then(function () { if (before !== null && lastVersion !== before) emit('external', { catalogue_version: lastVersion }); });
      }
    }, ms);
  }

  root.BinaRepo = Repo;
})(typeof window !== 'undefined' ? window : globalThis);
