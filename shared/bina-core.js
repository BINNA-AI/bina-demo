/*!
 * BINA core (shared contract + business rules)
 * One Core Meaning ID, two independent flow profiles.
 * Used by: Admin prototype, Customer prototype, reference Worker, tests.
 * Plain JavaScript, no dependencies. UMD: window.BinaCore / module.exports.
 * "OpenAI understands. BINA controls."
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BinaCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CORE_VERSION = '1.0.0';

  // ---------------------------------------------------------------- enums
  var LIFECYCLE = ['draft', 'active', 'archived'];
  var REVIEW = ['pending', 'approved', 'changes_requested', 'rejected'];
  var RIGHTS = ['cleared', 'demo_only', 'pending', 'restricted'];
  var ASSET_TYPES = ['audio', 'avatar_video'];
  var ASSET_LIFECYCLE = ['active', 'superseded', 'archived'];
  var HINT_LANGS = ['ar', 'en', 'ms', 'any'];
  var CATEGORIES = {
    daily: { ar: 'يومي', en: 'Daily' },
    greeting: { ar: 'ترحيب', en: 'Greeting' },
    emergency: { ar: 'طوارئ', en: 'Emergency' },
    health: { ar: 'صحة', en: 'Health' },
    food: { ar: 'طعام', en: 'Food' },
    family: { ar: 'عائلة', en: 'Family' },
    numbers: { ar: 'أرقام', en: 'Numbers' },
    colors: { ar: 'ألوان', en: 'Colors' },
    other: { ar: 'أخرى', en: 'Other' }
  };
  var ROLES = {
    FLOW1_AR_AUDIO: { flow: 'flow1', field: 'ar_audio_asset_id', asset_type: 'audio', language: 'ar' },
    FLOW1_EN_AUDIO: { flow: 'flow1', field: 'en_audio_asset_id', asset_type: 'audio', language: 'en' },
    FLOW2_AVATAR: { flow: 'flow2', field: 'avatar_asset_id', asset_type: 'avatar_video', language: null }
  };
  var ERROR_CODES = [
    'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'CONFLICT',
    'UNSUPPORTED_MEANING', 'MEDIA_NOT_READY', 'OPENAI_UNAVAILABLE', 'IMPORT_CONFLICT',
    'RATE_LIMITED', 'PAYLOAD_TOO_LARGE', 'INTERNAL'
  ];
  var MEANING_ID_RE = /^[A-Z][A-Z0-9_]{1,47}$/;
  var ASSET_ID_RE = /^(AUD|AVA)_[A-Z0-9_]{2,60}_\d{3}$/;
  var CV_CLASS_RE = /^[A-Za-z0-9_.-]{1,64}$/;
  var AUDIO_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'aac'];
  var VIDEO_EXT = ['mp4', 'webm', 'mov'];
  var MIME_BY_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  var LIMITS = { audio_max_bytes: 5 * 1024 * 1024, video_max_bytes: 25 * 1024 * 1024, audio_max_ms: 8000, video_max_ms: 12000, hints_max: 30, hint_max_len: 60 };

  // ---------------------------------------------------------------- utils
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function nowIso() { return new Date().toISOString(); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function byId(list, key, id) { for (var i = 0; i < (list || []).length; i++) if (list[i][key] === id) return list[i]; return null; }
  function uniq(arr) { var s = {}, out = []; arr.forEach(function (x) { var k = typeof x === 'string' ? x : JSON.stringify(x); if (!s[k]) { s[k] = 1; out.push(x); } }); return out; }
  function ext(name) { var m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function err(code, message, details) { return { code: code, message: message || code, details: details || null }; }

  // ---------------------------------------------------------------- text normalisation
  var AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
  function normalizeArabic(s) {
    return String(s || '')
      .replace(AR_DIACRITICS, '')
      .replace(/ـ/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  }
  function normalizeText(s) {
    var t = String(s || '');
    if (t.normalize) t = t.normalize('NFKC');
    t = normalizeArabic(t).toLowerCase();
    t = t.replace(/[،؛؟٪-٭.,;:!?"'`~@#$%^&*()\[\]{}<>\/\\|+=_\-–—«»]/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }
  var MS_MARKERS = ['saya', 'mahu', 'nak', 'tolong', 'terima', 'kasih', 'boleh', 'minta', 'sila', 'selamat', 'apa', 'mana', 'tidak', 'ya', 'awak', 'kamu', 'ada', 'di', 'ke', 'tandas', 'doktor', 'lapar', 'makan', 'minum', 'dah', 'sudah', 'pergi', 'mari', 'tak', 'aku'];
  var EN_MARKERS = ['i', 'need', 'want', 'please', 'the', 'a', 'is', 'are', 'to', 'can', 'you', 'me', 'my', 'where', 'what', 'how', 'thank', 'thanks', 'hello', 'hi', 'help', 'some', 'have', 'do', 'it', 'of', 'and', 'for', 'water', 'doctor'];
  /** Heuristic language guess. confident=false means a single ambiguous Latin word ("air", "salam"). */
  function detectLanguageDetailed(s) {
    var raw = String(s || '');
    if (!raw.trim()) return { lang: null, confident: false };
    var ar = (raw.match(/[؀-ۿ]/g) || []).length;
    var latin = (raw.match(/[A-Za-z]/g) || []).length;
    if (ar > 0 && ar >= latin) return { lang: 'ar', confident: true };
    var words = normalizeText(raw).split(' ');
    var ms = 0, en = 0;
    words.forEach(function (w) { if (MS_MARKERS.indexOf(w) >= 0) ms++; if (EN_MARKERS.indexOf(w) >= 0) en++; });
    if (ms > en) return { lang: 'ms', confident: true };
    if (en > ms) return { lang: 'en', confident: true };
    return { lang: 'en', confident: false };
  }
  function detectLanguage(s) { return detectLanguageDetailed(s).lang; }

  // ---------------------------------------------------------------- hints
  /** Hint as stored: { text, lang } where lang in ar|en|ms|any. Text form for Excel: "air@ms". */
  function parseHint(x) {
    if (isObj(x)) return { text: String(x.text || '').trim(), lang: HINT_LANGS.indexOf(x.lang) >= 0 ? x.lang : 'any' };
    var s = String(x || '').trim();
    var m = /^(.*?)@(ar|en|ms|any)$/i.exec(s);
    if (m) return { text: m[1].trim(), lang: m[2].toLowerCase() };
    return { text: s, lang: /[؀-ۿ]/.test(s) ? 'ar' : 'any' };
  }
  function defaultHintLang(text) { return /[؀-ۿ]/.test(text) ? 'ar' : 'any'; }
  /** Lossless text form: the @lang suffix is written only when it differs from the default for that script. */
  function hintToText(h) { h = parseHint(h); return h.lang === defaultHintLang(h.text) ? h.text : h.text + '@' + h.lang; }
  function parseHintList(v) {
    if (Array.isArray(v)) return uniqHints(v.map(parseHint).filter(function (h) { return h.text; }));
    var s = String(v == null ? '' : v);
    if (!s.trim()) return [];
    return uniqHints(s.split(/\s*(?:\||\n|;|,|،|؛|·)\s*/).map(parseHint).filter(function (h) { return h.text; }));
  }
  /** Keep the admin's literal spellings (مويه and موية are both kept); drop only exact repeats. */
  function uniqHints(list) {
    var seen = {}, out = [];
    list.forEach(function (h) { var k = h.text.replace(/\s+/g, ' ').toLowerCase() + '@' + h.lang; if (!seen[k]) { seen[k] = 1; out.push(h); } });
    return out;
  }
  function hintsToText(list) { return (list || []).map(hintToText).join(' | '); }

  // ---------------------------------------------------------------- state helpers
  function emptyState() {
    return { schema: 'bina.catalogue/1', meta: { environment: 'DEMO', catalogue_version: 1, updated_at: nowIso() }, meanings: [], flow1_profiles: [], flow2_profiles: [], assets: [], unsupported_requests: [], feedback: [], users: [], watches: [], team: [], integrations: [], audit_log: [] };
  }
  function getMeaning(state, id) { return byId(state.meanings, 'meaning_id', id); }
  function getFlow1(state, id) { return byId(state.flow1_profiles, 'meaning_id', id); }
  function getFlow2(state, id) { return byId(state.flow2_profiles, 'meaning_id', id); }
  function getAsset(state, id) { return id ? byId(state.assets, 'asset_id', id) : null; }
  function envOf(state, env) { var e = env || {}; return { allowDemoRights: e.allowDemoRights !== undefined ? !!e.allowDemoRights : ((state.meta && state.meta.environment) !== 'PRODUCTION') }; }

  // ---------------------------------------------------------------- validation
  function fieldError(field, code, en, ar) { return { field: field, code: code, message: en, message_ar: ar || en }; }
  function validateMeaningId(id) {
    if (id === undefined || id === null || String(id).trim() === '') return fieldError('meaning_id', 'REQUIRED', 'Meaning ID is required', 'معرّف المعنى مطلوب');
    if (!MEANING_ID_RE.test(String(id))) return fieldError('meaning_id', 'INVALID_ID', 'Use CAPITALS, digits and _ (start with a letter, 2–48 chars)', 'استخدم حروفًا إنجليزية كبيرة وأرقامًا و _ (يبدأ بحرف، ٢–٤٨)');
    return null;
  }
  function validateCoreMeaning(m, state, opts) {
    opts = opts || {};
    var errors = [];
    var e = validateMeaningId(m.meaning_id); if (e) errors.push(e);
    if (!String(m.canonical_ar || '').trim()) errors.push(fieldError('canonical_ar', 'REQUIRED', 'Arabic text is required', 'النص العربي مطلوب'));
    if (!String(m.canonical_en || '').trim()) errors.push(fieldError('canonical_en', 'REQUIRED', 'English text is required', 'النص الإنجليزي مطلوب'));
    if (String(m.canonical_ar || '').length > 80) errors.push(fieldError('canonical_ar', 'TOO_LONG', 'Max 80 characters', '٨٠ حرفًا كحد أقصى'));
    if (String(m.canonical_en || '').length > 80) errors.push(fieldError('canonical_en', 'TOO_LONG', 'Max 80 characters', '٨٠ حرفًا كحد أقصى'));
    if (m.category && !CATEGORIES[m.category]) errors.push(fieldError('category', 'INVALID_ENUM', 'Unknown category', 'تصنيف غير معروف'));
    if (m.lifecycle && LIFECYCLE.indexOf(m.lifecycle) < 0) errors.push(fieldError('lifecycle', 'INVALID_ENUM', 'Lifecycle must be draft, active or archived', 'الحالة: مسودة أو نشط أو مؤرشف'));
    if (typeof m.enabled !== 'boolean') errors.push(fieldError('enabled', 'INVALID_TYPE', 'Enabled must be true or false', 'التفعيل: نعم أو لا'));
    if (opts.isNew && state && getMeaning(state, m.meaning_id)) errors.push(fieldError('meaning_id', 'DUPLICATE_ID', 'Duplicate Meaning ID', 'معرّف المعنى مكرر'));
    return errors;
  }
  function validateFlow1(p, state) {
    var errors = [];
    if (!getMeaning(state, p.meaning_id)) errors.push(fieldError('meaning_id', 'UNKNOWN_MEANING', 'Unknown Core Meaning', 'معنى أساسي غير موجود'));
    if (p.cv_class && !CV_CLASS_RE.test(String(p.cv_class))) errors.push(fieldError('cv_class', 'INVALID_CV_CLASS', 'CV class: letters, digits, _ . - only', 'فئة الرؤية: حروف وأرقام و _ . - فقط'));
    if (p.cv_class) {
      (state.flow1_profiles || []).forEach(function (o) { if (o.meaning_id !== p.meaning_id && o.cv_class && String(o.cv_class).toUpperCase() === String(p.cv_class).toUpperCase()) errors.push(fieldError('cv_class', 'DUPLICATE_CV_CLASS', 'CV class already used by ' + o.meaning_id, 'فئة الرؤية مستخدمة في ' + o.meaning_id)); });
    }
    ['ar', 'en'].forEach(function (lang) {
      var f = lang + '_audio_asset_id', id = p[f];
      if (!id) return;
      var a = getAsset(state, id);
      if (!a) errors.push(fieldError(f, 'UNKNOWN_ASSET', 'Unknown asset ' + id, 'ملف غير موجود ' + id));
      else if (a.asset_type !== 'audio') errors.push(fieldError(f, 'WRONG_ASSET_TYPE', 'Asset is not audio', 'الملف ليس صوتًا'));
      else if (a.language && a.language !== lang) errors.push(fieldError(f, 'WRONG_LANGUAGE', 'Audio language is ' + a.language, 'لغة الصوت ' + a.language));
    });
    if (p.review_status && REVIEW.indexOf(p.review_status) < 0) errors.push(fieldError('review_status', 'INVALID_ENUM', 'Unknown review status', 'حالة مراجعة غير معروفة'));
    if (typeof p.enabled !== 'boolean') errors.push(fieldError('enabled', 'INVALID_TYPE', 'Enabled must be true or false', 'التفعيل: نعم أو لا'));
    return errors;
  }
  function validateFlow2(p, state) {
    var errors = [];
    if (!getMeaning(state, p.meaning_id)) errors.push(fieldError('meaning_id', 'UNKNOWN_MEANING', 'Unknown Core Meaning', 'معنى أساسي غير موجود'));
    var hints = parseHintList(p.semantic_hints);
    if (hints.length > LIMITS.hints_max) errors.push(fieldError('semantic_hints', 'TOO_MANY', 'Max ' + LIMITS.hints_max + ' hints', 'الحد ' + LIMITS.hints_max + ' تلميحًا'));
    hints.forEach(function (h) { if (h.text.length > LIMITS.hint_max_len) errors.push(fieldError('semantic_hints', 'TOO_LONG', 'Hint too long: ' + h.text.slice(0, 20), 'تلميح طويل: ' + h.text.slice(0, 20))); });
    hintCollisions(state, p.meaning_id, hints).forEach(function (c) { errors.push(fieldError('semantic_hints', 'ALIAS_COLLISION', '"' + c.value + '" already points to ' + c.other, '"' + c.value + '" مربوط مسبقًا بـ ' + c.other)); });
    if (p.avatar_asset_id) {
      var a = getAsset(state, p.avatar_asset_id);
      if (!a) errors.push(fieldError('avatar_asset_id', 'UNKNOWN_ASSET', 'Unknown asset ' + p.avatar_asset_id, 'ملف غير موجود'));
      else if (a.asset_type !== 'avatar_video') errors.push(fieldError('avatar_asset_id', 'WRONG_ASSET_TYPE', 'Asset is not an avatar video', 'الملف ليس فيديو أفاتار'));
      (state.flow2_profiles || []).forEach(function (o) { if (o.meaning_id !== p.meaning_id && o.avatar_asset_id === p.avatar_asset_id) errors.push(fieldError('avatar_asset_id', 'ASSET_LINKED_ELSEWHERE', 'Avatar already linked to ' + o.meaning_id, 'الأفاتار مربوط بـ ' + o.meaning_id)); });
    }
    if (p.review_status && REVIEW.indexOf(p.review_status) < 0) errors.push(fieldError('review_status', 'INVALID_ENUM', 'Unknown review status', 'حالة مراجعة غير معروفة'));
    if (p.rights_status && RIGHTS.indexOf(p.rights_status) < 0) errors.push(fieldError('rights_status', 'INVALID_ENUM', 'Unknown rights status', 'حالة حقوق غير معروفة'));
    if (typeof p.enabled !== 'boolean') errors.push(fieldError('enabled', 'INVALID_TYPE', 'Enabled must be true or false', 'التفعيل: نعم أو لا'));
    return errors;
  }
  /** Phrases that would point at two meanings. Checked on manual edit and on import. */
  function hintCollisions(state, meaningId, hints) {
    var out = [], seen = {};
    parseHintList(hints).forEach(function (h) {
      var hn = normalizeText(h.text);
      (state.flow2_profiles || []).forEach(function (o) {
        if (o.meaning_id === meaningId || seen[hn + '|' + o.meaning_id]) return;
        var hit = parseHintList(o.semantic_hints).some(function (oh) { return normalizeText(oh.text) === hn && (oh.lang === h.lang || oh.lang === 'any' || h.lang === 'any'); });
        var om = getMeaning(state, o.meaning_id);
        if (!hit && om) hit = normalizeText(om.canonical_ar) === hn || normalizeText(om.canonical_en) === hn;
        if (hit) { seen[hn + '|' + o.meaning_id] = 1; out.push({ value: h.text, other: o.meaning_id }); }
      });
    });
    return out;
  }
  function validateAsset(a, state, opts) {
    opts = opts || {};
    var errors = [];
    if (!a.asset_id || !ASSET_ID_RE.test(a.asset_id)) errors.push(fieldError('asset_id', 'INVALID_ID', 'Asset ID like AUD_WATER_AR_001 or AVA_WATER_001', 'معرّف الملف مثل AUD_WATER_AR_001'));
    if (ASSET_TYPES.indexOf(a.asset_type) < 0) errors.push(fieldError('asset_type', 'INVALID_ENUM', 'Type must be audio or avatar_video', 'النوع: صوت أو فيديو أفاتار'));
    var x = ext(a.filename);
    if (a.filename) {
      if (a.asset_type === 'audio' && AUDIO_EXT.indexOf(x) < 0) errors.push(fieldError('filename', 'WRONG_FILE_TYPE', 'Audio must be ' + AUDIO_EXT.join(', '), 'الصوت يجب أن يكون ' + AUDIO_EXT.join('، ')));
      if (a.asset_type === 'avatar_video' && VIDEO_EXT.indexOf(x) < 0) errors.push(fieldError('filename', 'WRONG_FILE_TYPE', 'Video must be ' + VIDEO_EXT.join(', '), 'الفيديو يجب أن يكون ' + VIDEO_EXT.join('، ')));
      if (/(\.\.|[\\\/]|^\.)/.test(a.filename)) errors.push(fieldError('filename', 'UNSAFE_NAME', 'File name must not contain paths', 'اسم الملف لا يحتوي مسارات'));
    }
    if (a.asset_type === 'audio' && a.language && ['ar', 'en'].indexOf(a.language) < 0) errors.push(fieldError('language', 'INVALID_ENUM', 'Audio language must be ar or en', 'لغة الصوت ar أو en'));
    if (a.rights_status && RIGHTS.indexOf(a.rights_status) < 0) errors.push(fieldError('rights_status', 'INVALID_ENUM', 'Unknown rights status', 'حالة حقوق غير معروفة'));
    if (a.review_status && REVIEW.indexOf(a.review_status) < 0) errors.push(fieldError('review_status', 'INVALID_ENUM', 'Unknown review status', 'حالة مراجعة غير معروفة'));
    if (opts.isNew && state && getAsset(state, a.asset_id)) errors.push(fieldError('asset_id', 'DUPLICATE_ID', 'Duplicate Asset ID', 'معرّف الملف مكرر'));
    return errors;
  }
  /** Validate an uploaded media file (metadata the browser/Worker can read). */
  function validateMediaFile(file, role) {
    var r = ROLES[role]; var errors = [];
    if (!r) return [fieldError('role', 'INVALID_ENUM', 'Unknown media role', 'دور غير معروف')];
    var x = ext(file.name);
    var allowed = r.asset_type === 'audio' ? AUDIO_EXT : VIDEO_EXT;
    if (allowed.indexOf(x) < 0) errors.push(fieldError('file', 'WRONG_FILE_TYPE', 'Allowed: ' + allowed.join(', '), 'المسموح: ' + allowed.join('، ')));
    if (file.type && file.type.split('/')[0] !== (r.asset_type === 'audio' ? 'audio' : 'video')) errors.push(fieldError('file', 'WRONG_MIME', 'File content type is ' + file.type, 'نوع المحتوى ' + file.type));
    if (!file.size) errors.push(fieldError('file', 'EMPTY_FILE', 'File is empty', 'الملف فارغ'));
    var max = r.asset_type === 'audio' ? LIMITS.audio_max_bytes : LIMITS.video_max_bytes;
    if (file.size > max) errors.push(fieldError('file', 'TOO_LARGE', 'Max ' + Math.round(max / 1048576) + ' MB', 'الحد ' + Math.round(max / 1048576) + ' ميغابايت'));
    if (file.duration_ms !== undefined && file.duration_ms !== null) {
      var maxMs = r.asset_type === 'audio' ? LIMITS.audio_max_ms : LIMITS.video_max_ms;
      if (!(file.duration_ms > 0)) errors.push(fieldError('file', 'UNREADABLE', 'Could not read duration (corrupt file?)', 'تعذرت قراءة المدة (ملف تالف؟)'));
      else if (file.duration_ms > maxMs) errors.push(fieldError('file', 'TOO_LONG', 'Max ' + (maxMs / 1000) + ' s', 'الحد ' + (maxMs / 1000) + ' ث'));
    }
    return errors;
  }

  // ---------------------------------------------------------------- readiness
  function assetState(state, id, env) {
    var a = getAsset(state, id);
    if (!id) return { usable: false, reason: 'MISSING' };
    if (!a) return { usable: false, reason: 'UNKNOWN_ASSET' };
    if (!a.enabled || a.lifecycle !== 'active') return { usable: false, reason: 'ASSET_DISABLED', asset: a };
    if (a.missing_file) return { usable: false, reason: 'FILE_MISSING', asset: a };
    if (a.review_status !== 'approved') return { usable: false, reason: 'ASSET_NOT_APPROVED', asset: a };
    if (!(a.rights_status === 'cleared' || (a.rights_status === 'demo_only' && envOf(state, env).allowDemoRights))) return { usable: false, reason: 'RIGHTS_NOT_CLEARED', asset: a };
    return { usable: true, reason: null, asset: a };
  }
  function coreState(m) {
    if (!m) return 'CORE_UNKNOWN';
    if (m.lifecycle === 'archived') return 'CORE_ARCHIVED';
    if (m.lifecycle === 'draft') return 'CORE_DRAFT';
    if (!m.enabled) return 'CORE_DISABLED';
    return null;
  }
  function cvClassDuplicated(state, p) {
    if (!p || !p.cv_class) return false;
    return (state.flow1_profiles || []).some(function (o) { return o.meaning_id !== p.meaning_id && o.enabled && o.cv_class && String(o.cv_class).toUpperCase() === String(p.cv_class).toUpperCase(); });
  }
  /** Flow 1 readiness. ready | partial (text works, some audio missing) | blocked | disabled | none */
  function flow1Readiness(state, id, env) {
    var m = getMeaning(state, id), p = getFlow1(state, id);
    if (!p) return { state: 'none', reasons: ['FLOW1_NO_PROFILE'], audio: { ar: false, en: false } };
    var c = coreState(m);
    if (c) return { state: 'disabled', reasons: [c], audio: { ar: false, en: false } };
    if (!p.enabled) return { state: 'disabled', reasons: ['FLOW1_DISABLED'], audio: { ar: false, en: false } };
    var reasons = [];
    if (!p.cv_class) reasons.push('FLOW1_NO_CV_CLASS');
    if (cvClassDuplicated(state, p)) reasons.push('FLOW1_CV_CLASS_DUPLICATE');
    if (p.review_status !== 'approved') reasons.push('FLOW1_NOT_APPROVED');
    if (reasons.length) return { state: 'blocked', reasons: reasons, audio: { ar: false, en: false } };
    var ar = assetState(state, p.ar_audio_asset_id, env), en = assetState(state, p.en_audio_asset_id, env);
    if (!ar.usable) reasons.push('FLOW1_AR_AUDIO_' + ar.reason);
    if (!en.usable) reasons.push('FLOW1_EN_AUDIO_' + en.reason);
    return { state: reasons.length ? 'partial' : 'ready', reasons: reasons, audio: { ar: ar.usable, en: en.usable } };
  }
  /** Flow 2 readiness. ready (OpenAI-eligible) | blocked | disabled | none */
  function flow2Readiness(state, id, env) {
    var m = getMeaning(state, id), p = getFlow2(state, id);
    if (!p) return { state: 'none', reasons: ['FLOW2_NO_PROFILE'], eligible: false, warnings: [] };
    var c = coreState(m);
    if (c) return { state: 'disabled', reasons: [c], eligible: false, warnings: [] };
    if (!p.enabled) return { state: 'disabled', reasons: ['FLOW2_DISABLED'], eligible: false, warnings: [] };
    var reasons = [], warnings = [];
    if (p.review_status !== 'approved') reasons.push('FLOW2_NOT_APPROVED');
    if (!(p.rights_status === 'cleared' || (p.rights_status === 'demo_only' && envOf(state, env).allowDemoRights))) reasons.push('FLOW2_RIGHTS_NOT_CLEARED');
    var av = assetState(state, p.avatar_asset_id, env);
    if (!av.usable) reasons.push('FLOW2_AVATAR_' + av.reason);
    if (!parseHintList(p.semantic_hints).length) warnings.push('FLOW2_NO_HINTS');
    return { state: reasons.length ? 'blocked' : 'ready', reasons: reasons, eligible: !reasons.length, warnings: warnings };
  }
  function coverage(state, env) {
    return (state.meanings || []).map(function (m) {
      var f1 = flow1Readiness(state, m.meaning_id, env), f2 = flow2Readiness(state, m.meaning_id, env);
      var p1 = getFlow1(state, m.meaning_id), p2 = getFlow2(state, m.meaning_id);
      function aState(id) { if (!id) return 'missing'; var s = assetState(state, id, env); return s.usable ? 'ready' : (s.reason === 'ASSET_NOT_APPROVED' ? 'review' : 'blocked'); }
      return {
        meaning_id: m.meaning_id, canonical_ar: m.canonical_ar, canonical_en: m.canonical_en, category: m.category,
        lifecycle: m.lifecycle, enabled: m.enabled,
        flow1: f1.state, flow1_reasons: f1.reasons, flow2: f2.state, flow2_reasons: f2.reasons,
        ar_audio: p1 ? aState(p1.ar_audio_asset_id) : 'n/a', en_audio: p1 ? aState(p1.en_audio_asset_id) : 'n/a', avatar: p2 ? aState(p2.avatar_asset_id) : 'n/a'
      };
    });
  }
  function summary(state, env) {
    var cov = coverage(state, env);
    var s = { meanings: cov.length, active: 0, draft: 0, archived: 0, disabled: 0, flow1_ready: 0, flow1_partial: 0, flow2_ready: 0, needs_review: 0, missing_ar_audio: 0, missing_en_audio: 0, missing_avatar: 0, unsupported_open: 0, feedback_open: 0 };
    cov.forEach(function (r) {
      if (r.lifecycle === 'active') s.active++; if (r.lifecycle === 'draft') s.draft++; if (r.lifecycle === 'archived') s.archived++; if (!r.enabled) s.disabled++;
      if (r.flow1 === 'ready') s.flow1_ready++; if (r.flow1 === 'partial') s.flow1_partial++; if (r.flow2 === 'ready') s.flow2_ready++;
      if (r.ar_audio === 'missing') s.missing_ar_audio++; if (r.en_audio === 'missing') s.missing_en_audio++; if (r.avatar === 'missing') s.missing_avatar++;
    });
    s.needs_review = reviewQueue(state).length;
    s.unsupported_open = (state.unsupported_requests || []).filter(function (u) { return u.status === 'new' || u.status === 'triaged'; }).length;
    s.feedback_open = (state.feedback || []).filter(function (f) { return f.status !== 'resolved' && f.status !== 'dismissed'; }).length;
    return s;
  }
  function reviewQueue(state) {
    var q = [];
    (state.flow1_profiles || []).forEach(function (p) { if (p.review_status === 'pending' || p.review_status === 'changes_requested') q.push({ kind: 'flow1', meaning_id: p.meaning_id, object_id: p.meaning_id, review_status: p.review_status }); });
    (state.flow2_profiles || []).forEach(function (p) { if (p.review_status === 'pending' || p.review_status === 'changes_requested') q.push({ kind: 'flow2', meaning_id: p.meaning_id, object_id: p.meaning_id, review_status: p.review_status }); if (p.rights_status === 'pending') q.push({ kind: 'rights', meaning_id: p.meaning_id, object_id: p.meaning_id, review_status: 'pending' }); });
    (state.assets || []).forEach(function (a) {
      if (a.lifecycle === 'active' && (a.review_status === 'pending' || a.review_status === 'changes_requested')) {
        var owner = assetOwner(state, a.asset_id) || pendingReplacementOwner(state, a);
        q.push({ kind: a.asset_type === 'audio' ? 'flow1_audio' : 'flow2_avatar', meaning_id: owner ? owner.meaning_id : null, object_id: a.asset_id, review_status: a.review_status, replaces_asset_id: a.replaces_asset_id || null });
      }
    });
    return q;
  }
  function assetOwner(state, assetId) {
    var o = null;
    (state.flow1_profiles || []).forEach(function (p) { if (p.ar_audio_asset_id === assetId) o = { meaning_id: p.meaning_id, role: 'FLOW1_AR_AUDIO' }; if (p.en_audio_asset_id === assetId) o = { meaning_id: p.meaning_id, role: 'FLOW1_EN_AUDIO' }; });
    (state.flow2_profiles || []).forEach(function (p) { if (p.avatar_asset_id === assetId) o = { meaning_id: p.meaning_id, role: 'FLOW2_AVATAR' }; });
    return o;
  }
  function pendingReplacementOwner(state, a) { return a.replaces_asset_id ? assetOwner(state, a.replaces_asset_id) : (a.pending_for ? { meaning_id: a.pending_for.meaning_id, role: a.pending_for.role } : null); }

  // ---------------------------------------------------------------- catalogues
  /** Compact Flow 2 catalogue for OpenAI. Only active eligible meanings; only id/ar/en/hints. */
  function buildOpenAICatalogue(state, env) {
    return (state.meanings || []).filter(function (m) { return flow2Readiness(state, m.meaning_id, env).eligible; })
      .map(function (m) {
        var p = getFlow2(state, m.meaning_id);
        return { id: m.meaning_id, ar: m.canonical_ar, en: m.canonical_en, hints: parseHintList(p.semantic_hints).map(function (h) { return h.text; }) };
      })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }
  /** Flow 1 catalogue the phone caches. Keyed by cv_class for O(1) lookup after recognition. */
  function buildFlow1Catalogue(state, env, mediaUrl) {
    var items = [];
    (state.flow1_profiles || []).forEach(function (p) {
      var r = flow1Readiness(state, p.meaning_id, env);
      if (r.state !== 'ready' && r.state !== 'partial') return;
      var m = getMeaning(state, p.meaning_id);
      function aud(id, ok) { if (!ok) return null; var a = getAsset(state, id); return { asset_id: a.asset_id, url: mediaUrl ? mediaUrl(a) : a.object_key, mime_type: a.mime_type, mock: !!a.mock }; }
      items.push({ meaning_id: p.meaning_id, cv_class: p.cv_class, text: { ar: m.canonical_ar, en: m.canonical_en }, audio: { ar: aud(p.ar_audio_asset_id, r.audio.ar), en: aud(p.en_audio_asset_id, r.audio.en) }, readiness: r.state, version: p.version });
    });
    return { catalogue_version: (state.meta || {}).catalogue_version || 1, items: items };
  }
  function lookupFlow1(flow1Catalogue, cvClass) {
    var k = String(cvClass || '').toUpperCase();
    for (var i = 0; i < flow1Catalogue.items.length; i++) if (String(flow1Catalogue.items[i].cv_class).toUpperCase() === k) return flow1Catalogue.items[i];
    return null;
  }
  function buildManifest(state, env) {
    var cov = coverage(state, env);
    return {
      catalogue_version: (state.meta || {}).catalogue_version || 1,
      updated_at: (state.meta || {}).updated_at || null,
      counts: { meanings: cov.length, flow1_available: cov.filter(function (r) { return r.flow1 === 'ready' || r.flow1 === 'partial'; }).length, flow2_available: cov.filter(function (r) { return r.flow2 === 'ready'; }).length },
      items: (state.meanings || []).map(function (m) { var p1 = getFlow1(state, m.meaning_id), p2 = getFlow2(state, m.meaning_id); return { meaning_id: m.meaning_id, version: m.version, flow1_version: p1 ? p1.version : null, flow2_version: p2 ? p2.version : null, updated_at: m.updated_at }; })
    };
  }

  // ---------------------------------------------------------------- Flow 2 resolution
  var AR_PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ف', 'ل', 'ك'];
  function arVariants(tok) { var v = [tok]; AR_PREFIXES.forEach(function (p) { if (tok.length > p.length + 1 && tok.indexOf(p) === 0) v.push(tok.slice(p.length)); }); return v; }
  function containsTerm(textTokens, termTokens, isArabic) {
    if (!termTokens.length) return false;
    for (var i = 0; i + termTokens.length <= textTokens.length; i++) {
      var ok = true;
      for (var j = 0; j < termTokens.length; j++) {
        var t = textTokens[i + j], w = termTokens[j];
        if (isArabic) { if (arVariants(t).indexOf(w) < 0 && arVariants(w).indexOf(t) < 0) { ok = false; break; } }
        else if (t !== w) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  /**
   * SIMULATED resolver (deterministic normalisation). Stands in for OpenAI in MOCK mode.
   * Returns the same logical shape the OpenAI adapter must return: transcript, language, meaning_id|null, supported.
   */
  function mockResolve(text, state, env) {
    var transcript = String(text || '').trim();
    var det = detectLanguageDetailed(transcript), language = det.lang;
    var base = { transcript: transcript, language: language, meaning_id: null, supported: false, provider: 'MOCK', simulated: true, candidates: [] };
    if (!transcript) { base.reason = 'empty'; return base; }
    var cat = buildOpenAICatalogue(state, env);
    var norm = normalizeText(transcript), tokens = norm.split(' ');
    var scores = {};
    cat.forEach(function (entry) {
      var p = getFlow2(state, entry.id);
      var terms = [{ text: entry.ar, lang: 'ar' }, { text: entry.en, lang: 'en' }].concat(parseHintList(p.semantic_hints));
      terms.forEach(function (term) {
        // A language-tagged Latin hint only counts when the input language is clear and matches,
        // so "I need air" (English) does not hit the Malay hint "air" (= water).
        var termIsArabic = /[؀-ۿ]/.test(term.text);
        if (!termIsArabic && term.lang && term.lang !== 'any' && det.confident && term.lang !== language) return;
        var tt = normalizeText(term.text).split(' ').filter(Boolean);
        var isAr = /[؀-ۿ]/.test(term.text);
        if (containsTerm(tokens, tt, isAr)) {
          var sc = tt.join(' ').length;
          if (!scores[entry.id] || scores[entry.id] < sc) scores[entry.id] = sc;
        }
      });
    });
    var ids = Object.keys(scores);
    if (!ids.length) { base.reason = 'no_match'; return base; }
    ids.sort(function (a, b) { return scores[b] - scores[a]; });
    base.candidates = ids.map(function (id) { return { id: id, score: scores[id] }; });
    if (ids.length > 1 && scores[ids[0]] === scores[ids[1]]) { base.reason = 'ambiguous'; return base; }
    base.meaning_id = ids[0]; base.supported = true; return base;
  }
  /** Check that a provider (OpenAI or mock) output has the agreed shape. */
  function checkProviderOutput(o) {
    if (!isObj(o)) return 'not an object';
    if (typeof o.supported !== 'boolean') return 'supported must be boolean';
    if (o.supported && (typeof o.meaning_id !== 'string' || !o.meaning_id)) return 'meaning_id required when supported';
    if (!o.supported && o.meaning_id !== null && o.meaning_id !== undefined) return 'meaning_id must be null when not supported';
    if (o.transcript !== undefined && typeof o.transcript !== 'string') return 'transcript must be string';
    if (o.language !== undefined && o.language !== null && typeof o.language !== 'string') return 'language must be string';
    return null;
  }
  /**
   * BINA control layer. Never trust the provider: the meaning must exist, be active, Flow 2 must be
   * enabled and approved, rights acceptable and the avatar usable. Only then is an avatar returned.
   */
  function validateResolve(providerOut, state, env, mediaUrl) {
    var shapeErr = checkProviderOutput(providerOut);
    if (shapeErr) return { ok: false, error: err('OPENAI_UNAVAILABLE', 'Malformed provider response', { reason: shapeErr }) };
    var base = { transcript: providerOut.transcript || '', language: providerOut.language || null, provider: providerOut.provider || 'UNKNOWN', simulated: !!providerOut.simulated };
    if (!providerOut.supported) {
      return { ok: true, data: Object.assign(base, { supported: false, meaning_id: null, reason: providerOut.reason || 'no_match' }) };
    }
    var id = providerOut.meaning_id;
    var m = getMeaning(state, id);
    if (!m) return { ok: false, error: err('UNSUPPORTED_MEANING', 'Provider returned an unknown Meaning ID', { meaning_id: id, invented: true }), data: Object.assign(base, { supported: false, meaning_id: null }) };
    var r = flow2Readiness(state, id, env);
    if (!r.eligible) {
      var mediaIssue = r.reasons.some(function (x) { return x.indexOf('FLOW2_AVATAR_') === 0; });
      return { ok: false, error: err(mediaIssue ? 'MEDIA_NOT_READY' : 'UNSUPPORTED_MEANING', 'Meaning is not available for Flow 2', { meaning_id: id, reasons: r.reasons }), data: Object.assign(base, { supported: false, meaning_id: null }) };
    }
    var p = getFlow2(state, id), a = getAsset(state, p.avatar_asset_id);
    return {
      ok: true,
      data: Object.assign(base, {
        supported: true, meaning_id: id,
        display: { ar: m.canonical_ar, en: m.canonical_en },
        avatar: { asset_id: a.asset_id, url: mediaUrl ? mediaUrl(a) : a.object_key, mime_type: a.mime_type, version: a.version, mock: !!a.mock, demo_asset: !!a.demo_asset }
      })
    };
  }
  function resolveTextMock(text, state, env, mediaUrl) { return validateResolve(mockResolve(text, state, env), state, env, mediaUrl); }

  var OPENAI_ENUM_MAX = 250;
  /** The instruction + JSON schema the Worker sends to OpenAI (kept here so all sides share it). */
  function openAIResolveSchema(catalogueIds) {
    return {
      name: 'bina_resolve',
      strict: true,
      schema: {
        type: 'object', additionalProperties: false,
        required: ['transcript', 'language', 'meaning_id', 'supported'],
        properties: {
          transcript: { type: 'string' },
          language: { type: ['string', 'null'] },
          // Enum = defence in depth for small candidate sets (top-k). OpenAI limits enum size, so large catalogues
          // fall back to a plain string; validateResolve() rejects any ID outside the catalogue either way.
          meaning_id: catalogueIds && catalogueIds.length && catalogueIds.length <= OPENAI_ENUM_MAX ? { anyOf: [{ type: 'string', enum: catalogueIds }, { type: 'null' }] } : { type: ['string', 'null'] },
          supported: { type: 'boolean' }
        }
      }
    };
  }
  var OPENAI_RESOLVE_INSTRUCTIONS = [
    'You map a short spoken or typed message to ONE meaning from the provided BINA catalogue.',
    'The message may be in Arabic (any dialect, including Saudi and Gulf), English, Malay or mixed.',
    'Return the catalogue id whose meaning best matches what the speaker wants to express.',
    'Only use ids that appear in the catalogue. Never invent an id.',
    'If no catalogue meaning clearly matches, or the message is unclear, set supported=false and meaning_id=null.',
    'transcript = the message text as understood; language = ISO 639-1 code (ar, en, ms) or null.'
  ].join('\n');

  // ---------------------------------------------------------------- lifecycle operations (pure)
  function dependencyCheck(state, id) {
    var deps = [];
    if (getFlow1(state, id)) deps.push({ type: 'flow1_profile', id: id });
    if (getFlow2(state, id)) deps.push({ type: 'flow2_profile', id: id });
    (state.feedback || []).forEach(function (f) { if (f.meaning_id === id) deps.push({ type: 'feedback', id: f.id }); });
    (state.unsupported_requests || []).forEach(function (u) { if (u.linked_meaning_id === id) deps.push({ type: 'unsupported_request', id: u.id }); });
    (state.assets || []).forEach(function (a) { if (a.pending_for && a.pending_for.meaning_id === id) deps.push({ type: 'pending_asset', id: a.asset_id }); });
    return deps;
  }
  function bump(obj, actor) { obj.version = (obj.version || 0) + 1; obj.updated_at = nowIso(); if (actor) obj.updated_by = actor; return obj; }
  function bumpCatalogue(state) { state.meta = state.meta || {}; state.meta.catalogue_version = (state.meta.catalogue_version || 0) + 1; state.meta.updated_at = nowIso(); }
  function audit(state, actor, action, objectType, objectId, before, after, note) {
    state.audit_log = state.audit_log || [];
    var n = state.audit_log.length + 1;
    var entry = { id: 'AUD_LOG_' + String(n).padStart(4, '0'), at: nowIso(), actor: actor || 'unknown', action: action, object_type: objectType, object_id: objectId, before: before === undefined ? null : clone(before), after: after === undefined ? null : clone(after), note: note || null };
    state.audit_log.push(entry);
    return entry;
  }
  function nextAssetId(state, meaningId, role) {
    var r = ROLES[role];
    var prefix = r.asset_type === 'audio' ? 'AUD_' + meaningId + '_' + r.language.toUpperCase() + '_' : 'AVA_' + meaningId + '_';
    var n = 1;
    (state.assets || []).forEach(function (a) { if (a.asset_id.indexOf(prefix) === 0) { var k = parseInt(a.asset_id.slice(prefix.length), 10); if (k >= n) n = k + 1; } });
    return prefix + String(n).padStart(3, '0');
  }
  /** Upload a new version for a role. It is NOT used by customers until a human approves it. */
  function stageAssetVersion(state, meaningId, role, meta, actor) {
    var r = ROLES[role];
    if (!r) return fail('VALIDATION_ERROR', 'Unknown media role');
    if (!getMeaning(state, meaningId)) return fail('NOT_FOUND', 'Core Meaning not found');
    meta = meta || {};
    var fileErrors = validateMediaFile({ name: meta.filename, type: meta.mime_type, size: meta.bytes, duration_ms: meta.duration_ms }, role);
    if (fileErrors.length) return fail('VALIDATION_ERROR', 'Invalid media file', { fields: fileErrors });
    var p = r.flow === 'flow1' ? getFlow1(state, meaningId) : getFlow2(state, meaningId);
    var current = p ? getAsset(state, p[r.field]) : null;
    var id = nextAssetId(state, meaningId, role);
    var a = {
      asset_id: id, asset_type: r.asset_type, language: r.language, locale: meta.locale || (r.language === 'ar' ? 'ar-SA' : r.language === 'en' ? 'en-US' : null),
      filename: meta.filename, object_key: meta.object_key || ('uploads/' + id + '.' + ext(meta.filename)), mime_type: meta.mime_type || MIME_BY_EXT[ext(meta.filename)] || 'application/octet-stream',
      bytes: meta.bytes || null, duration_ms: meta.duration_ms || null, width: meta.width || null, height: meta.height || null,
      version: current ? (current.version || 1) + 1 : 1, source: meta.source || 'UPLOAD', rights_status: meta.rights_status || 'pending', review_status: 'pending',
      enabled: true, lifecycle: 'active', replaces_asset_id: current ? current.asset_id : null, pending_for: { meaning_id: meaningId, role: role },
      demo_asset: meta.demo_asset !== undefined ? !!meta.demo_asset : true, production_approved: false, mock: !!meta.mock, local_blob: !!meta.local_blob, created_at: nowIso(), updated_at: nowIso(), created_by: actor || null
    };
    state.assets.push(a);
    audit(state, actor, 'asset.upload', 'asset', id, null, a, role + ' for ' + meaningId + (current ? ' (replaces ' + current.asset_id + ')' : ''));
    return { ok: true, data: a };
  }
  /** Approve a staged asset: switch the profile pointer, supersede the old one. The Core Meaning is untouched. */
  function approveAsset(state, assetId, actor) {
    var a = getAsset(state, assetId);
    if (!a) return fail('NOT_FOUND', 'Asset not found');
    if (a.lifecycle !== 'active') return fail('CONFLICT', 'Only active assets can be approved');
    var before = clone(a);
    a.review_status = 'approved';
    if (a.rights_status === 'pending' && !(state.meta && state.meta.environment === 'PRODUCTION')) a.rights_status = 'demo_only';
    bump(a, actor);
    if (a.pending_for) {
      var r = ROLES[a.pending_for.role];
      var made = ensureProfile(state, r.flow, a.pending_for.meaning_id, actor);
      if (!made.ok) return made;
      var p = made.data;
      var old = getAsset(state, p[r.field]);
      var pBefore = clone(p);
      p[r.field] = a.asset_id; bump(p, actor);
      if (old && old.asset_id !== a.asset_id) { var ob = clone(old); old.lifecycle = 'superseded'; bump(old, actor); audit(state, actor, 'asset.supersede', 'asset', old.asset_id, ob, old, 'replaced by ' + a.asset_id); }
      audit(state, actor, r.flow + '.relink', r.flow + '_profile', p.meaning_id, pBefore, p, r.field + ' -> ' + a.asset_id);
      delete a.pending_for;
    }
    audit(state, actor, 'asset.approve', 'asset', assetId, before, a);
    return { ok: true, data: a };
  }
  function rejectAsset(state, assetId, actor, reason) {
    var a = getAsset(state, assetId); if (!a) return fail('NOT_FOUND', 'Asset not found');
    if (assetOwner(state, assetId)) return fail('CONFLICT', 'This file is live. Upload a replacement or unlink it first.');
    var before = clone(a); a.review_status = 'rejected'; a.lifecycle = 'archived'; bump(a, actor);
    audit(state, actor, 'asset.reject', 'asset', assetId, before, a, reason || null); return { ok: true, data: a };
  }
  function unlinkAsset(state, meaningId, role, actor) {
    var r = ROLES[role]; if (!r) return fail('VALIDATION_ERROR', 'Unknown media role');
    var p = r.flow === 'flow1' ? getFlow1(state, meaningId) : getFlow2(state, meaningId);
    if (!p || !p[r.field]) return fail('NOT_FOUND', 'Nothing linked');
    var before = clone(p); var was = p[r.field]; p[r.field] = null; bump(p, actor);
    audit(state, actor, r.flow + '.unlink', r.flow + '_profile', meaningId, before, p, role + ' (' + was + ')'); return { ok: true, data: p };
  }
  function archiveAsset(state, assetId, actor) {
    var a = getAsset(state, assetId); if (!a) return fail('NOT_FOUND', 'Asset not found');
    var owner = assetOwner(state, assetId);
    if (owner) return fail('CONFLICT', 'Unlink the asset from ' + owner.meaning_id + ' first', owner);
    var before = clone(a); a.lifecycle = 'archived'; bump(a, actor); audit(state, actor, 'asset.archive', 'asset', assetId, before, a); return { ok: true, data: a };
  }

  // ---------------------------------------------------------------- CRUD with validation, optimistic concurrency and mass-assignment protection
  var EDITABLE = {
    core_meaning: ['canonical_ar', 'canonical_en', 'category', 'enabled', 'lifecycle'],
    flow1_profile: ['cv_class', 'ar_audio_asset_id', 'en_audio_asset_id', 'enabled', 'review_status'],
    flow2_profile: ['semantic_hints', 'avatar_asset_id', 'enabled', 'review_status', 'rights_status'],
    asset: ['enabled', 'review_status', 'rights_status', 'source']
  };
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o && Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; }); return r; }
  function fail(code, message, details) { return { ok: false, error: err(code, message, details) }; }
  function checkPatch(type, patch) {
    if (!isObj(patch)) return fail('VALIDATION_ERROR', 'Body must be a JSON object');
    var bad = Object.keys(patch).filter(function (k) { return EDITABLE[type].indexOf(k) < 0; });
    if (bad.length) return fail('VALIDATION_ERROR', 'Fields not editable: ' + bad.join(', '), { fields: bad });
    return null;
  }
  function checkVersion(obj, expected) {
    if (expected === undefined || expected === null) return null;
    if (Number(expected) !== Number(obj.version)) return fail('CONFLICT', 'This item changed since you opened it', { expected_version: Number(expected), current_version: obj.version });
    return null;
  }
  function normalizeMeaningInput(input) {
    var m = pick(input || {}, ['meaning_id', 'canonical_ar', 'canonical_en', 'category', 'enabled', 'lifecycle']);
    if (typeof m.meaning_id === 'string') m.meaning_id = m.meaning_id.trim().toUpperCase().replace(/[\s-]+/g, '_');
    ['canonical_ar', 'canonical_en'].forEach(function (k) { if (typeof m[k] === 'string') m[k] = m[k].trim(); });
    return m;
  }
  function createMeaning(state, input, actor) {
    if (!isObj(input)) return fail('VALIDATION_ERROR', 'Body must be a JSON object');
    var m = normalizeMeaningInput(input);
    m.category = m.category || 'other'; m.enabled = m.enabled === undefined ? true : m.enabled; m.lifecycle = m.lifecycle || 'draft';
    var errors = validateCoreMeaning(m, state, { isNew: true });
    if (errors.length) return fail(errors.some(function (e) { return e.code === 'DUPLICATE_ID'; }) ? 'CONFLICT' : 'VALIDATION_ERROR', 'Invalid Core Meaning', { fields: errors });
    m.demo = false; m.version = 0; bump(m, actor); m.created_at = m.updated_at;
    state.meanings.push(m); audit(state, actor, 'meaning.create', 'core_meaning', m.meaning_id, null, m);
    return { ok: true, data: m };
  }
  function updateMeaning(state, id, patch, actor, expectedVersion) {
    var m = getMeaning(state, id); if (!m) return fail('NOT_FOUND', 'Core Meaning not found');
    var bad = checkPatch('core_meaning', patch); if (bad) return bad;
    var stale = checkVersion(m, expectedVersion); if (stale) return stale;
    var next = Object.assign(clone(m), normalizeMeaningInput(Object.assign({ meaning_id: m.meaning_id }, patch)));
    var errors = validateCoreMeaning(next, state, {}); if (errors.length) return fail('VALIDATION_ERROR', 'Invalid Core Meaning', { fields: errors });
    var before = clone(m); Object.assign(m, pick(next, EDITABLE.core_meaning)); bump(m, actor);
    audit(state, actor, 'meaning.update', 'core_meaning', id, before, m);
    return { ok: true, data: m };
  }
  function archiveMeaning(state, id, actor) { return updateMeaning(state, id, { lifecycle: 'archived' }, actor); }
  function restoreMeaning(state, id, actor) { return updateMeaning(state, id, { lifecycle: 'active' }, actor); }
  function deleteMeaning(state, id, actor) {
    var m = getMeaning(state, id); if (!m) return fail('NOT_FOUND', 'Core Meaning not found');
    var deps = dependencyCheck(state, id);
    if (deps.length) return fail('CONFLICT', 'Has linked profiles or records. Archive it instead.', { dependencies: deps });
    state.meanings = state.meanings.filter(function (x) { return x.meaning_id !== id; });
    audit(state, actor, 'meaning.delete', 'core_meaning', id, m, null);
    return { ok: true, data: { deleted: id } };
  }
  function ensureProfile(state, flow, id, actor) {
    var list = flow === 'flow1' ? state.flow1_profiles : state.flow2_profiles;
    var p = flow === 'flow1' ? getFlow1(state, id) : getFlow2(state, id);
    if (p) return { ok: true, data: p, created: false };
    if (!getMeaning(state, id)) return fail('NOT_FOUND', 'Core Meaning not found');
    p = flow === 'flow1'
      ? { meaning_id: id, cv_class: null, ar_audio_asset_id: null, en_audio_asset_id: null, enabled: false, review_status: 'pending', version: 0 }
      : { meaning_id: id, semantic_hints: [], avatar_asset_id: null, enabled: false, review_status: 'pending', rights_status: 'pending', version: 0 };
    bump(p, actor); list.push(p);
    audit(state, actor, flow + '.create', flow + '_profile', id, null, p);
    return { ok: true, data: p, created: true };
  }
  function updateProfile(state, flow, id, patch, actor, expectedVersion) {
    var type = flow + '_profile';
    var p = flow === 'flow1' ? getFlow1(state, id) : getFlow2(state, id);
    if (!p) return fail('NOT_FOUND', (flow === 'flow1' ? 'Flow 1' : 'Flow 2') + ' profile not found');
    var bad = checkPatch(type, patch); if (bad) return bad;
    var stale = checkVersion(p, expectedVersion); if (stale) return stale;
    var next = Object.assign(clone(p), patch);
    if (flow === 'flow2' && patch.semantic_hints !== undefined) next.semantic_hints = parseHintList(patch.semantic_hints);
    ['cv_class', 'ar_audio_asset_id', 'en_audio_asset_id', 'avatar_asset_id'].forEach(function (k) { if (next[k] === '') next[k] = null; });
    var errors = flow === 'flow1' ? validateFlow1(next, state) : validateFlow2(next, state);
    if (errors.length) return fail('VALIDATION_ERROR', 'Invalid ' + (flow === 'flow1' ? 'Flow 1' : 'Flow 2') + ' profile', { fields: errors });
    var before = clone(p); Object.assign(p, pick(next, EDITABLE[type])); bump(p, actor);
    audit(state, actor, flow + '.update', type, id, before, p);
    return { ok: true, data: p };
  }
  function updateAsset(state, assetId, patch, actor, expectedVersion) {
    var a = getAsset(state, assetId); if (!a) return fail('NOT_FOUND', 'Asset not found');
    var bad = checkPatch('asset', patch); if (bad) return bad;
    var stale = checkVersion(a, expectedVersion); if (stale) return stale;
    var next = Object.assign(clone(a), patch);
    var errors = validateAsset(next, state, {}); if (errors.length) return fail('VALIDATION_ERROR', 'Invalid asset', { fields: errors });
    var before = clone(a); Object.assign(a, pick(next, EDITABLE.asset)); bump(a, actor);
    audit(state, actor, 'asset.update', 'asset', assetId, before, a);
    return { ok: true, data: a };
  }
  var CATALOGUE_COLLECTIONS = ['meanings', 'flow1_profiles', 'flow2_profiles', 'assets'];
  /** Stable fingerprint of customer-visible catalogue content. Persistence layers bump catalogue_version when it changes. */
  function catalogueFingerprint(state) {
    var s = JSON.stringify(CATALOGUE_COLLECTIONS.map(function (k) { return state[k] || []; })), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8) + ':' + s.length;
  }
  /** Compare two states (e.g. before/after an import, or a snapshot vs now). */
  function diffStates(published, working) {
    var out = [], ignore = ['version', 'updated_at', 'updated_by', 'created_at'];
    function cmp(type, key, listA, listB) {
      var A = {}, B = {};
      (listA || []).forEach(function (x) { A[x[key]] = x; });
      (listB || []).forEach(function (x) { B[x[key]] = x; });
      Object.keys(B).forEach(function (id) {
        if (!A[id]) { out.push({ object_type: type, id: id, change: 'added', fields: [] }); return; }
        var fields = [];
        Object.keys(Object.assign({}, A[id], B[id])).forEach(function (f) {
          if (ignore.indexOf(f) >= 0) return;
          var a = A[id][f] === undefined ? null : A[id][f], b = B[id][f] === undefined ? null : B[id][f];
          if (!eq(a, b)) fields.push({ field: f, before: a, after: b });
        });
        if (fields.length) out.push({ object_type: type, id: id, change: 'modified', fields: fields });
      });
      Object.keys(A).forEach(function (id) { if (!B[id]) out.push({ object_type: type, id: id, change: 'removed', fields: [] }); });
    }
    cmp('core_meaning', 'meaning_id', published.meanings, working.meanings);
    cmp('flow1_profile', 'meaning_id', published.flow1_profiles, working.flow1_profiles);
    cmp('flow2_profile', 'meaning_id', published.flow2_profiles, working.flow2_profiles);
    cmp('asset', 'asset_id', published.assets, working.assets);
    return out;
  }
  /** Customer-facing release: everything a phone needs, nothing it must not see. */
  function buildRelease(state, env, mediaUrl) {
    var avatars = {};
    buildOpenAICatalogue(state, env).forEach(function (e) { var p = getFlow2(state, e.id), a = getAsset(state, p.avatar_asset_id); avatars[e.id] = { asset_id: a.asset_id, url: mediaUrl ? mediaUrl(a) : a.object_key, mime_type: a.mime_type, version: a.version, mock: !!a.mock, demo_asset: !!a.demo_asset }; });
    return { catalogue_version: (state.meta || {}).catalogue_version || 1, published_at: (state.meta || {}).published_at || null, flow1: buildFlow1Catalogue(state, env, mediaUrl), flow2: { catalogue: buildOpenAICatalogue(state, env), avatars: avatars } };
  }

  // ---------------------------------------------------------------- Excel / spreadsheet model
  var SHEETS = {
    Core_Meanings: {
      key: 'meaning_id',
      columns: [
        { key: 'meaning_id', header: 'meaning_id', required: true, aliases: ['id', 'meaning id', 'meaningid', 'shared_id', 'shared id', 'core meaning', 'core_meaning_id', 'معرف المعنى', 'المعرف'] },
        { key: 'canonical_ar', header: 'canonical_ar', required: true, aliases: ['arabic', 'ar', 'canonical arabic', 'arabic text', 'العربية', 'النص العربي'] },
        { key: 'canonical_en', header: 'canonical_en', required: true, aliases: ['english', 'en', 'canonical english', 'english text', 'الإنجليزية', 'النص الإنجليزي'] },
        { key: 'category', header: 'category', aliases: ['cat', 'التصنيف'] },
        { key: 'enabled', header: 'enabled', type: 'bool', aliases: ['active', 'is_enabled', 'مفعل'] },
        { key: 'lifecycle', header: 'lifecycle', aliases: ['status', 'state', 'الحالة'] },
        { key: 'version', header: 'version', type: 'int', aliases: ['ver', 'الإصدار'] }
      ]
    },
    Flow1_Sign_to_Speech: {
      key: 'meaning_id',
      columns: [
        { key: 'meaning_id', header: 'meaning_id', required: true, aliases: ['id', 'meaning id', 'meaning', 'shared_id', 'معرف المعنى'] },
        { key: 'cv_class', header: 'cv_class', aliases: ['cv class', 'class', 'model class', 'فئة الرؤية'] },
        { key: 'ar_audio_asset_id', header: 'arabic_audio_asset_id', aliases: ['arabic audio asset id', 'ar_audio_asset_id', 'ar audio id'] },
        { key: 'ar_audio_file', header: 'arabic_audio_file', aliases: ['arabic audio', 'arabic audio file', 'ar_audio', 'ar audio file', 'الصوت العربي'] },
        { key: 'en_audio_asset_id', header: 'english_audio_asset_id', aliases: ['english audio asset id', 'en_audio_asset_id', 'en audio id'] },
        { key: 'en_audio_file', header: 'english_audio_file', aliases: ['english audio', 'english audio file', 'en_audio', 'en audio file', 'الصوت الإنجليزي'] },
        { key: 'enabled', header: 'enabled', type: 'bool', aliases: ['active', 'flow1_enabled', 'مفعل'] },
        { key: 'review_status', header: 'review_status', aliases: ['review', 'المراجعة'] },
        { key: 'version', header: 'version', type: 'int', aliases: ['ver'] }
      ]
    },
    Flow2_Speech_to_Sign: {
      key: 'meaning_id',
      columns: [
        { key: 'meaning_id', header: 'meaning_id', required: true, aliases: ['id', 'meaning id', 'meaning', 'shared_id', 'معرف المعنى'] },
        { key: 'semantic_hints', header: 'semantic_hints', aliases: ['hints', 'aliases', 'semantic hints', 'synonyms', 'التلميحات', 'المرادفات'] },
        { key: 'avatar_asset_id', header: 'avatar_asset_id', aliases: ['avatar id', 'avatar asset id', 'avatar_id'] },
        { key: 'avatar_file', header: 'avatar_file', aliases: ['avatar', 'avatar file', 'video', 'ملف الأفاتار'] },
        { key: 'enabled', header: 'enabled', type: 'bool', aliases: ['active', 'flow2_enabled', 'مفعل'] },
        { key: 'review_status', header: 'review_status', aliases: ['review', 'المراجعة'] },
        { key: 'rights_status', header: 'rights_status', aliases: ['rights', 'الحقوق'] },
        { key: 'version', header: 'version', type: 'int', aliases: ['ver'] }
      ]
    },
    Assets: {
      key: 'asset_id',
      columns: [
        { key: 'asset_id', header: 'asset_id', required: true, aliases: ['id', 'asset id', 'معرف الملف'] },
        { key: 'asset_type', header: 'asset_type', required: true, aliases: ['type', 'asset type', 'النوع'] },
        { key: 'filename', header: 'filename', aliases: ['file', 'file name', 'اسم الملف'] },
        { key: 'language', header: 'language', aliases: ['lang', 'اللغة'] },
        { key: 'locale', header: 'locale', aliases: [] },
        { key: 'source', header: 'source', aliases: ['المصدر'] },
        { key: 'rights_status', header: 'rights_status', aliases: ['rights', 'الحقوق'] },
        { key: 'review_status', header: 'review_status', aliases: ['review', 'المراجعة'] },
        { key: 'version', header: 'version', type: 'int', aliases: ['ver'] }
      ]
    }
  };
  var SHEET_ORDER = ['Core_Meanings', 'Flow1_Sign_to_Speech', 'Flow2_Speech_to_Sign', 'Assets'];
  var SHEET_ALIASES = { core_meanings: 'Core_Meanings', core: 'Core_Meanings', meanings: 'Core_Meanings', flow1_sign_to_speech: 'Flow1_Sign_to_Speech', flow1: 'Flow1_Sign_to_Speech', flow_1: 'Flow1_Sign_to_Speech', flow2_speech_to_sign: 'Flow2_Speech_to_Sign', flow2: 'Flow2_Speech_to_Sign', flow_2: 'Flow2_Speech_to_Sign', assets: 'Assets', media: 'Assets' };

  function exportModel(state) {
    var assets = state.assets || [];
    function fname(id) { var a = id ? byId(assets, 'asset_id', id) : null; return a ? a.filename : ''; }
    return {
      Core_Meanings: (state.meanings || []).map(function (m) { return { meaning_id: m.meaning_id, canonical_ar: m.canonical_ar, canonical_en: m.canonical_en, category: m.category || '', enabled: !!m.enabled, lifecycle: m.lifecycle, version: m.version || 1 }; }),
      Flow1_Sign_to_Speech: (state.flow1_profiles || []).map(function (p) { return { meaning_id: p.meaning_id, cv_class: p.cv_class || '', ar_audio_asset_id: p.ar_audio_asset_id || '', ar_audio_file: fname(p.ar_audio_asset_id), en_audio_asset_id: p.en_audio_asset_id || '', en_audio_file: fname(p.en_audio_asset_id), enabled: !!p.enabled, review_status: p.review_status, version: p.version || 1 }; }),
      Flow2_Speech_to_Sign: (state.flow2_profiles || []).map(function (p) { return { meaning_id: p.meaning_id, semantic_hints: hintsToText(parseHintList(p.semantic_hints)), avatar_asset_id: p.avatar_asset_id || '', avatar_file: fname(p.avatar_asset_id), enabled: !!p.enabled, review_status: p.review_status, rights_status: p.rights_status, version: p.version || 1 }; }),
      Assets: assets.filter(function (a) { return a.lifecycle !== 'archived'; }).map(function (a) { return { asset_id: a.asset_id, asset_type: a.asset_type, filename: a.filename, language: a.language || '', locale: a.locale || '', source: a.source || '', rights_status: a.rights_status, review_status: a.review_status, version: a.version || 1 }; })
    };
  }
  function normHeader(h) { return String(h == null ? '' : h).replace(/[‏‎]/g, '').trim().toLowerCase().replace(/[\s\-]+/g, ' '); }
  /** Map raw header names to column keys. Returns { map: {index: key}, suggestions, missing, extra }. */
  function detectColumns(sheetName, headers) {
    var def = SHEETS[sheetName]; var map = {}, used = {}, extra = [], suggestions = [];
    headers.forEach(function (h, i) {
      var n = normHeader(h); if (!n) return;
      var hit = null;
      def.columns.forEach(function (c) { if (hit) return; if (normHeader(c.header) === n || normHeader(c.key) === n || n.replace(/ /g, '_') === c.key || c.aliases.some(function (a) { return normHeader(a) === n; })) hit = c.key; });
      if (hit && !used[hit]) { map[i] = hit; used[hit] = true; if (normHeader(def.columns.filter(function (c) { return c.key === hit; })[0].header) !== n) suggestions.push({ index: i, header: h, key: hit }); }
      else extra.push({ index: i, header: h });
    });
    var missing = def.columns.filter(function (c) { return c.required && !used[c.key]; }).map(function (c) { return c.header; });
    return { map: map, suggestions: suggestions, missing: missing, extra: extra };
  }
  function coerceBool(v) {
    if (typeof v === 'boolean') return v;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on', 'نعم', 'مفعل', 'صح'].indexOf(s) >= 0) return true;
    if (['false', 'no', 'n', '0', 'off', 'لا', 'معطل', 'خطأ'].indexOf(s) >= 0) return false;
    return undefined;
  }
  function stripCsvGuard(s) { return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s; }
  /** cellValue may be a primitive or an ExcelJS cell value object. */
  function readCell(v) {
    if (v === null || v === undefined) return { value: '' };
    if (isObj(v)) {
      if (v.formula !== undefined || v.sharedFormula !== undefined) return { value: '', formula: true };
      if (v.error !== undefined) return { value: '', cellError: String(v.error) };
      if (v.richText) return { value: v.richText.map(function (r) { return r.text; }).join('') };
      if (v.text !== undefined) return { value: String(v.text) };
      if (v.result !== undefined) return { value: v.result };
      if (v instanceof Date) return { value: v.toISOString() };
      return { value: String(v) };
    }
    if (typeof v === 'string') return { value: stripCsvGuard(v.trim()) };
    return { value: v };
  }
  /**
   * Parse raw sheets: { SheetName: [[header...], [row...], ...] }.
   * Returns rows normalised to model keys plus per-cell issues. Never touches state.
   */
  function parseWorkbook(raw, overrides) {
    overrides = overrides || {};
    var out = { sheets: {}, missingSheets: [], unknownSheets: [], issues: [] };
    var present = {};
    Object.keys(raw || {}).forEach(function (name) {
      var canon = SHEETS[name] ? name : SHEET_ALIASES[normHeader(name).replace(/ /g, '_')];
      if (!canon) { out.unknownSheets.push(name); return; }
      if (present[canon]) { out.issues.push({ level: 'warning', code: 'DUPLICATE_SHEET', sheet: name }); return; }
      present[canon] = name;
      var grid = raw[name] || [];
      var headerIdx = 0; while (headerIdx < grid.length && !(grid[headerIdx] || []).some(function (c) { return String(readCell(c).value || '').trim(); })) headerIdx++;
      var headers = (grid[headerIdx] || []).map(function (c) { return readCell(c).value; });
      var det = detectColumns(canon, headers);
      if (overrides[canon]) {
        Object.keys(overrides[canon]).forEach(function (i) { var k = overrides[canon][i]; if (k) det.map[i] = k; else delete det.map[i]; });
        var mapped = {}; Object.keys(det.map).forEach(function (i) { mapped[det.map[i]] = true; });
        det.missing = SHEETS[canon].columns.filter(function (c) { return c.required && !mapped[c.key]; }).map(function (c) { return c.header; });
        det.extra = det.extra.filter(function (x) { return !det.map[x.index]; });
      }
      var def = SHEETS[canon]; var rows = [];
      for (var r = headerIdx + 1; r < grid.length; r++) {
        var cells = grid[r] || [];
        var values = {}, cellIssues = [], any = false;
        Object.keys(det.map).forEach(function (i) {
          var key = det.map[i], col = def.columns.filter(function (c) { return c.key === key; })[0];
          var rc = readCell(cells[i]);
          if (rc.formula) { cellIssues.push({ level: 'error', code: 'FORMULA_NOT_ALLOWED', field: key }); any = true; return; }
          if (rc.cellError) { cellIssues.push({ level: 'error', code: 'CELL_ERROR', field: key, value: rc.cellError }); any = true; return; }
          var v = rc.value;
          if (v !== '' && v !== null && v !== undefined) any = true;
          if (col.type === 'bool') { if (v === '' || v === null) v = undefined; else { var b = coerceBool(v); if (b === undefined) cellIssues.push({ level: 'error', code: 'INVALID_BOOLEAN', field: key, value: v }); v = b; } }
          else if (col.type === 'int') { if (v === '' || v === null) v = undefined; else { var n = parseInt(v, 10); if (isNaN(n)) { cellIssues.push({ level: 'error', code: 'INVALID_NUMBER', field: key, value: v }); v = undefined; } else v = n; } }
          else v = (v === null || v === undefined) ? '' : String(v).trim();
          values[key] = v;
        });
        if (!any) continue; // blank row
        rows.push({ row: r + 1, values: values, issues: cellIssues });
      }
      out.sheets[canon] = { source_name: name, columns: det, rows: rows };
    });
    SHEET_ORDER.forEach(function (s) { if (!present[s]) out.missingSheets.push(s); });
    return out;
  }

  /** Build the import preview (dry run). Pure: returns a description of what WOULD change. */
  function buildImportPreview(state, parsed, opts) {
    opts = opts || {};
    var items = [];
    var summary = { NEW: 0, UPDATED: 0, UNCHANGED: 0, WARNING: 0, CONFLICT: 0, ERROR: 0 };
    var incomingMeaningIds = {};
    var core = (parsed.sheets.Core_Meanings || { rows: [] }).rows;
    core.forEach(function (r) { if (r.values.meaning_id) incomingMeaningIds[r.values.meaning_id] = true; });
    function meaningKnown(id) { return !!getMeaning(state, id) || !!incomingMeaningIds[id]; }
    var incomingAssets = {};
    ((parsed.sheets.Assets || { rows: [] }).rows).forEach(function (r) { if (r.values.asset_id) incomingAssets[r.values.asset_id] = r.values; });
    function assetKnown(id) { return !!getAsset(state, id) || !!incomingAssets[id]; }
    function assetTypeOf(id) { var a = incomingAssets[id] || getAsset(state, id); return a ? a.asset_type : null; }
    function assetIdByFilename(fn) {
      var f = String(fn || '').toLowerCase(), hit = null;
      Object.keys(incomingAssets).forEach(function (id) { if (!hit && String(incomingAssets[id].filename || '').toLowerCase() === f) hit = id; });
      (state.assets || []).forEach(function (a) { if (!hit && a.lifecycle !== 'archived' && String(a.filename || '').toLowerCase() === f) hit = a.asset_id; });
      return hit;
    }
    /** "Auto-map media" step: a row that names a file but no asset ID is linked by exact declared filename. */
    function mapByFilename(item, v, next, idField, fileField) {
      if ((v[idField] === undefined || v[idField] === '') && v[fileField]) {
        var found = assetIdByFilename(v[fileField]);
        if (found) { next[idField] = found; (item.mapped = item.mapped || []).push({ field: idField, file: v[fileField], asset_id: found, status: 'exact', via: 'filename' }); }
        else item.issues.push({ level: 'warning', code: 'FILE_NOT_UPLOADED', field: fileField, value: v[fileField] });
      }
    }
    function assetLangOf(id) { var a = incomingAssets[id] || getAsset(state, id); return a ? (a.language || null) : null; }

    // Post-import view of cross-row data, so collisions are checked against what the catalogue WILL be
    // (a workbook may move a hint from one meaning to another in the same import).
    var finalCv = {}, finalAvatar = {}, finalHints = {}, finalCanon = {};
    (state.flow1_profiles || []).forEach(function (p) { finalCv[p.meaning_id] = p.cv_class || null; });
    ((parsed.sheets.Flow1_Sign_to_Speech || { rows: [] }).rows).forEach(function (r) { var k = r.values.meaning_id; if (k && r.values.cv_class !== undefined) finalCv[k] = r.values.cv_class || null; });
    (state.flow2_profiles || []).forEach(function (p) { finalAvatar[p.meaning_id] = p.avatar_asset_id || null; finalHints[p.meaning_id] = parseHintList(p.semantic_hints); });
    ((parsed.sheets.Flow2_Speech_to_Sign || { rows: [] }).rows).forEach(function (r) {
      var k = r.values.meaning_id; if (!k) return;
      if (r.values.avatar_asset_id) finalAvatar[k] = r.values.avatar_asset_id;
      else if (r.values.avatar_asset_id === '' || r.values.avatar_file) finalAvatar[k] = r.values.avatar_file ? assetIdByFilename(r.values.avatar_file) : null;
      if (r.values.semantic_hints !== undefined) finalHints[k] = parseHintList(r.values.semantic_hints); else if (!finalHints[k]) finalHints[k] = [];
    });
    (state.meanings || []).forEach(function (m) { finalCanon[m.meaning_id] = [m.canonical_ar, m.canonical_en]; });
    core.forEach(function (r) { var k = r.values.meaning_id; if (!k) return; var c = finalCanon[k] || ['', '']; finalCanon[k] = [r.values.canonical_ar !== undefined ? r.values.canonical_ar : c[0], r.values.canonical_en !== undefined ? r.values.canonical_en : c[1]]; });
    function langsCompatible(a, b) { return a === b || a === 'any' || b === 'any'; }
    // Index every phrase once (normalised text -> meanings that use it as a hint or canonical text), so the
    // collision check is O(hints) instead of O(hints x meanings). Same results, ~100x faster at 500+ meanings.
    var phraseIdx = { hint: {}, canon: {} };
    Object.keys(finalHints).forEach(function (k, pos) {
      finalHints[k].forEach(function (oh) { var n = '$' + normalizeText(oh.text); (phraseIdx.hint[n] = phraseIdx.hint[n] || []).push({ k: k, pos: pos, lang: oh.lang }); });
      (finalCanon[k] || []).forEach(function (c) { if (c) { var n = '$' + normalizeText(c); (phraseIdx.canon[n] = phraseIdx.canon[n] || []).push({ k: k, pos: pos }); } });
    });

    SHEET_ORDER.forEach(function (sheet) {
      var ps = parsed.sheets[sheet]; if (!ps) return;
      var def = SHEETS[sheet]; var seen = {};
      ps.rows.forEach(function (r) {
        var v = r.values, key = v[def.key];
        var item = { sheet: sheet, key: key || null, row: r.row, status: null, changes: [], issues: r.issues.slice(), values: clone(v), decision: null };
        // --- required + id checks
        if (!key) item.issues.push({ level: 'error', code: 'MISSING_KEY', field: def.key });
        if (sheet !== 'Assets' && key && !MEANING_ID_RE.test(key)) item.issues.push({ level: 'error', code: 'INVALID_ID', field: 'meaning_id', value: key });
        if (sheet === 'Assets' && key && !ASSET_ID_RE.test(key)) item.issues.push({ level: 'error', code: 'INVALID_ID', field: 'asset_id', value: key });
        if (key && seen[key]) item.issues.push({ level: 'conflict', code: sheet === 'Assets' ? 'DUPLICATE_ASSET_ID' : 'DUPLICATE_MEANING_ID', field: def.key, other_row: seen[key] });
        if (key) seen[key] = r.row;
        var cur = null, next = null;
        if (sheet === 'Core_Meanings') {
          cur = getMeaning(state, key);
          next = { meaning_id: key, canonical_ar: v.canonical_ar !== undefined ? v.canonical_ar : (cur ? cur.canonical_ar : ''), canonical_en: v.canonical_en !== undefined ? v.canonical_en : (cur ? cur.canonical_en : ''), category: v.category || (cur ? cur.category : 'other'), enabled: v.enabled !== undefined ? v.enabled : (cur ? cur.enabled : true), lifecycle: v.lifecycle || (cur ? cur.lifecycle : 'draft') };
          if (!String(next.canonical_ar).trim()) item.issues.push({ level: 'error', code: 'REQUIRED', field: 'canonical_ar' });
          if (!String(next.canonical_en).trim()) item.issues.push({ level: 'error', code: 'REQUIRED', field: 'canonical_en' });
          if (next.category && !CATEGORIES[next.category]) item.issues.push({ level: 'error', code: 'INVALID_ENUM', field: 'category', value: next.category });
          if (LIFECYCLE.indexOf(next.lifecycle) < 0) item.issues.push({ level: 'error', code: 'INVALID_ENUM', field: 'lifecycle', value: next.lifecycle });
          if (cur && !next.enabled && cur.enabled) item.issues.push({ level: 'warning', code: 'DISABLES_MEANING', field: 'enabled' });
        } else if (sheet === 'Flow1_Sign_to_Speech') {
          cur = getFlow1(state, key);
          if (key && !meaningKnown(key)) item.issues.push({ level: 'error', code: 'UNKNOWN_CORE_MEANING', field: 'meaning_id' });
          next = { meaning_id: key, cv_class: v.cv_class !== undefined ? (v.cv_class || null) : (cur ? cur.cv_class : null), ar_audio_asset_id: v.ar_audio_asset_id !== undefined ? (v.ar_audio_asset_id || null) : (cur ? cur.ar_audio_asset_id : null), en_audio_asset_id: v.en_audio_asset_id !== undefined ? (v.en_audio_asset_id || null) : (cur ? cur.en_audio_asset_id : null), enabled: v.enabled !== undefined ? v.enabled : (cur ? cur.enabled : true), review_status: v.review_status || (cur ? cur.review_status : 'pending') };
          if (next.cv_class && !CV_CLASS_RE.test(next.cv_class)) item.issues.push({ level: 'error', code: 'INVALID_CV_CLASS', field: 'cv_class' });
          mapByFilename(item, v, next, 'ar_audio_asset_id', 'ar_audio_file');
          mapByFilename(item, v, next, 'en_audio_asset_id', 'en_audio_file');
          ['ar', 'en'].forEach(function (lang) {
            var f = lang + '_audio_asset_id', id = next[f];
            if (!id) { item.issues.push({ level: 'warning', code: lang === 'ar' ? 'MISSING_AR_AUDIO' : 'MISSING_EN_AUDIO', field: f }); return; }
            if (!assetKnown(id)) item.issues.push({ level: 'error', code: 'UNKNOWN_ASSET', field: f, value: id });
            else if (assetTypeOf(id) !== 'audio') item.issues.push({ level: 'error', code: 'WRONG_ASSET_TYPE', field: f, value: id });
            else if (assetLangOf(id) && assetLangOf(id) !== lang) item.issues.push({ level: 'error', code: 'WRONG_LANGUAGE', field: f, value: id });
            var fileKey = lang + '_audio_file';
            if (v[fileKey]) { var a = incomingAssets[id] || getAsset(state, id); if (a && a.filename && a.filename !== v[fileKey]) item.issues.push({ level: 'warning', code: 'FILENAME_MISMATCH', field: fileKey, value: v[fileKey], expected: a.filename }); }
          });
          if (REVIEW.indexOf(next.review_status) < 0) item.issues.push({ level: 'error', code: 'INVALID_ENUM', field: 'review_status', value: next.review_status });
          if (next.cv_class) {
            Object.keys(finalCv).forEach(function (k) { if (k !== key && finalCv[k] && String(finalCv[k]).toUpperCase() === String(next.cv_class).toUpperCase()) item.issues.push({ level: 'conflict', code: 'CV_CLASS_COLLISION', field: 'cv_class', value: next.cv_class, other: k }); });
          }
        } else if (sheet === 'Flow2_Speech_to_Sign') {
          cur = getFlow2(state, key);
          if (key && !meaningKnown(key)) item.issues.push({ level: 'error', code: 'UNKNOWN_CORE_MEANING', field: 'meaning_id' });
          next = { meaning_id: key, semantic_hints: v.semantic_hints !== undefined ? parseHintList(v.semantic_hints) : (cur ? parseHintList(cur.semantic_hints) : []), avatar_asset_id: v.avatar_asset_id !== undefined ? (v.avatar_asset_id || null) : (cur ? cur.avatar_asset_id : null), enabled: v.enabled !== undefined ? v.enabled : (cur ? cur.enabled : true), review_status: v.review_status || (cur ? cur.review_status : 'pending'), rights_status: v.rights_status || (cur ? cur.rights_status : 'pending') };
          mapByFilename(item, v, next, 'avatar_asset_id', 'avatar_file');
          if (!next.avatar_asset_id) item.issues.push({ level: 'warning', code: 'MISSING_AVATAR', field: 'avatar_asset_id' });
          else if (!assetKnown(next.avatar_asset_id)) item.issues.push({ level: 'error', code: 'UNKNOWN_ASSET', field: 'avatar_asset_id', value: next.avatar_asset_id });
          else if (assetTypeOf(next.avatar_asset_id) !== 'avatar_video') item.issues.push({ level: 'error', code: 'WRONG_ASSET_TYPE', field: 'avatar_asset_id', value: next.avatar_asset_id });
          if (next.avatar_asset_id) Object.keys(finalAvatar).forEach(function (k) { if (k !== key && finalAvatar[k] === next.avatar_asset_id) item.issues.push({ level: 'conflict', code: 'AVATAR_LINKED_TO_OTHER_MEANING', field: 'avatar_asset_id', value: next.avatar_asset_id, other: k }); });
          if (REVIEW.indexOf(next.review_status) < 0) item.issues.push({ level: 'error', code: 'INVALID_ENUM', field: 'review_status', value: next.review_status });
          if (RIGHTS.indexOf(next.rights_status) < 0) item.issues.push({ level: 'error', code: 'INVALID_ENUM', field: 'rights_status', value: next.rights_status });
          if (next.rights_status === 'restricted' && next.enabled) item.issues.push({ level: 'conflict', code: 'RIGHTS_CONFLICT', field: 'rights_status' });
          // alias collision: the same phrase may not point at two meanings (checked against the post-import catalogue)
          var reported = {};
          next.semantic_hints.forEach(function (h) {
            var hn = normalizeText(h.text), hits = {};
            (phraseIdx.hint['$' + hn] || []).forEach(function (o) { if (langsCompatible(o.lang, h.lang)) hits[o.pos] = o.k; });
            (phraseIdx.canon['$' + hn] || []).forEach(function (o) { hits[o.pos] = o.k; });
            Object.keys(hits).sort(function (a, b) { return a - b; }).forEach(function (pos) {
              var k = hits[pos];
              if (k === key || reported[hn + '|' + k]) return;
              reported[hn + '|' + k] = 1; item.issues.push({ level: 'conflict', code: 'ALIAS_COLLISION', field: 'semantic_hints', value: h.text, other: k });
            });
          });
          var tooLong = next.semantic_hints.filter(function (h) { return h.text.length > LIMITS.hint_max_len; });
          if (tooLong.length) item.issues.push({ level: 'error', code: 'HINT_TOO_LONG', field: 'semantic_hints' });
          if (next.semantic_hints.length > LIMITS.hints_max) item.issues.push({ level: 'error', code: 'TOO_MANY_HINTS', field: 'semantic_hints', value: next.semantic_hints.length });
        } else if (sheet === 'Assets') {
          cur = getAsset(state, key);
          next = { asset_id: key, asset_type: v.asset_type || (cur ? cur.asset_type : ''), filename: v.filename !== undefined ? v.filename : (cur ? cur.filename : ''), language: v.language !== undefined ? (v.language || null) : (cur ? cur.language : null), locale: v.locale !== undefined ? (v.locale || null) : (cur ? cur.locale : null), source: v.source || (cur ? cur.source : 'IMPORT'), rights_status: v.rights_status || (cur ? cur.rights_status : 'pending'), review_status: v.review_status || (cur ? cur.review_status : 'pending') };
          validateAsset(next, state, {}).forEach(function (e) { if (e.field !== 'asset_id' || !item.issues.some(function (i) { return i.code === 'INVALID_ID'; })) item.issues.push({ level: 'error', code: e.code, field: e.field }); });
          if (cur && cur.asset_type !== next.asset_type) item.issues.push({ level: 'conflict', code: 'ASSET_TYPE_CHANGED', field: 'asset_type' });
          if (key && !cur) item.issues.push({ level: 'warning', code: 'FILE_NOT_UPLOADED', field: 'filename', value: next.filename });
        }
        // --- stale version (someone edited after this workbook was exported)
        if (cur && v.version !== undefined && cur.version !== undefined && v.version < cur.version) item.issues.push({ level: 'conflict', code: 'STALE_VERSION', field: 'version', value: v.version, current: cur.version });
        // --- changes
        if (cur && next) {
          Object.keys(next).forEach(function (f) {
            var before = cur[f], after = next[f];
            if (f === 'semantic_hints') { before = hintsToText(parseHintList(before)); after = hintsToText(after); }
            if (before === undefined) before = null; if (after === undefined) after = null;
            if (!eq(before, after)) item.changes.push({ field: f, before: before, after: after });
          });
        }
        item.next = next;
        var hasErr = item.issues.some(function (i) { return i.level === 'error'; });
        var hasConf = item.issues.some(function (i) { return i.level === 'conflict'; });
        var hasWarn = item.issues.some(function (i) { return i.level === 'warning'; });
        if (hasErr) item.status = 'ERROR';
        else if (hasConf) item.status = 'CONFLICT';
        else if (!cur) item.status = 'NEW';
        else if (item.changes.length) item.status = 'UPDATED';
        else item.status = 'UNCHANGED';
        item.warning = hasWarn;
        item.issues.forEach(function (i) { if (i.level === 'conflict') i.overridable = OVERRIDABLE_CONFLICTS.indexOf(i.code) >= 0; });
        item.overridable = hasConf && item.issues.every(function (i) { return i.level !== 'conflict' || i.overridable; });
        item.id = sheet + '|' + (key || ('row' + r.row)) + '|' + r.row;
        item.decision = item.status === 'ERROR' ? 'blocked' : item.status === 'CONFLICT' ? 'needs_resolution' : item.status === 'UNCHANGED' ? 'skip' : 'apply';
        summary[item.status]++;
        if (hasWarn && item.status !== 'ERROR') summary.WARNING++;
        items.push(item);
      });
    });
    var sheetsInfo = {};
    SHEET_ORDER.forEach(function (s) { sheetsInfo[s] = parsed.sheets[s] ? parsed.sheets[s].rows.length : null; });
    var blocking = [];
    if (parsed.missingSheets.length === SHEET_ORDER.length) blocking.push({ code: 'NO_KNOWN_SHEETS' });
    Object.keys(parsed.sheets).forEach(function (s) { var miss = parsed.sheets[s].columns.missing; if (miss.length) blocking.push({ code: 'MISSING_REQUIRED_COLUMNS', sheet: s, columns: miss }); });
    return { summary: summary, items: items, sheets: sheetsInfo, missingSheets: parsed.missingSheets, unknownSheets: parsed.unknownSheets, blocking: blocking, catalogue_version: (state.meta || {}).catalogue_version };
  }
  /** Only a stale version can be overridden ("keep my spreadsheet value"). Collisions must be fixed or skipped. */
  var OVERRIDABLE_CONFLICTS = ['STALE_VERSION'];
  /** Allowed decisions per status. ERROR rows must be fixed or explicitly skipped. */
  function allowedDecisions(item) {
    if (item.status === 'ERROR') return ['blocked', 'skip'];
    if (item.status === 'CONFLICT') return item.overridable ? ['needs_resolution', 'overwrite', 'skip'] : ['needs_resolution', 'skip'];
    if (item.status === 'UNCHANGED') return ['skip'];
    return ['apply', 'skip'];
  }
  function setDecision(preview, itemId, decision) {
    var it = null; preview.items.forEach(function (i) { if (i.id === itemId) it = i; });
    if (!it) return err('NOT_FOUND', 'Import row not found');
    if (allowedDecisions(it).indexOf(decision) < 0) return err('VALIDATION_ERROR', 'Decision ' + decision + ' not allowed for ' + it.status, { allowed: allowedDecisions(it) });
    it.decision = decision; return null;
  }
  /** Re-apply remembered decisions after the preview is rebuilt (e.g. after a cell was edited). */
  function applyDecisions(preview, decisions) {
    Object.keys(decisions || {}).forEach(function (id) { var it = null; preview.items.forEach(function (i) { if (i.id === id) it = i; }); if (it && allowedDecisions(it).indexOf(decisions[id]) >= 0) it.decision = decisions[id]; });
    return preview;
  }
  /** Edit one parsed cell (the "Edit rows/cells" step). Returns false if the row is unknown. */
  function editParsedCell(parsed, sheet, rowNumber, field, value) {
    var s = parsed.sheets[sheet]; if (!s) return false;
    var r = null; s.rows.forEach(function (x) { if (x.row === rowNumber) r = x; });
    if (!r) return false;
    var col = SHEETS[sheet].columns.filter(function (c) { return c.key === field; })[0];
    if (!col) return false;
    var v = value;
    if (col.type === 'bool') v = coerceBool(value);
    else if (col.type === 'int') { v = parseInt(value, 10); if (isNaN(v)) v = undefined; }
    else v = String(value == null ? '' : value).trim();
    r.values[field] = v;
    r.issues = r.issues.filter(function (i) { return i.field !== field; });
    r.edited = r.edited || {}; r.edited[field] = true;
    return true;
  }
  function previewCounts(preview) {
    var c = { apply: 0, overwrite: 0, skip: 0, needs_resolution: 0, blocked: 0 };
    preview.items.forEach(function (i) { c[i.decision] = (c[i.decision] || 0) + 1; });
    return c;
  }
  function previewCanCommit(preview) {
    if (preview.blocking && preview.blocking.length) return false;
    var applying = preview.items.filter(function (i) { return i.decision === 'apply' || i.decision === 'overwrite'; });
    if (!applying.length) return false;
    return !preview.items.some(function (i) { return i.decision === 'needs_resolution' || i.decision === 'blocked' || (i.decision === 'apply' && (i.status === 'ERROR' || i.status === 'CONFLICT')) || (i.decision === 'overwrite' && !i.overridable); });
  }
  /**
   * Commit a preview into a NEW state object (transaction: all or nothing).
   * Items with decision 'apply' (non-conflict) or 'overwrite' (conflict accepted) are written.
   */
  function applyImport(state, preview, actor, batchInfo) {
    if (!previewCanCommit(preview)) return { ok: false, error: err('IMPORT_CONFLICT', 'Resolve conflicts and errors first') };
    var s = clone(state);
    try {
      var order = ['Assets', 'Core_Meanings', 'Flow1_Sign_to_Speech', 'Flow2_Speech_to_Sign'];
      var counts = { created: 0, updated: 0 };
      order.forEach(function (sheet) {
        preview.items.filter(function (i) { return i.sheet === sheet && (i.decision === 'apply' || i.decision === 'overwrite'); }).forEach(function (i) {
          var n = clone(i.next);
          if (sheet === 'Assets') {
            var a = getAsset(s, i.key);
            if (a) { var b = clone(a); Object.assign(a, n); bump(a, actor); audit(s, actor, 'import.update', 'asset', i.key, b, a); counts.updated++; }
            else { a = Object.assign({ object_key: 'uploads/' + n.filename, mime_type: MIME_BY_EXT[ext(n.filename)] || null, enabled: true, lifecycle: 'active', replaces_asset_id: null, demo_asset: true, production_approved: false, mock: false, missing_file: true, version: 1, created_at: nowIso(), updated_at: nowIso() }, n); s.assets.push(a); audit(s, actor, 'import.create', 'asset', i.key, null, a); counts.created++; }
          } else if (sheet === 'Core_Meanings') {
            var m = getMeaning(s, i.key);
            if (m) { var bm = clone(m); Object.assign(m, n); bump(m, actor); audit(s, actor, 'import.update', 'core_meaning', i.key, bm, m); counts.updated++; }
            else { m = Object.assign({ version: 0, demo: false }, n); bump(m, actor); s.meanings.push(m); audit(s, actor, 'import.create', 'core_meaning', i.key, null, m); counts.created++; }
          } else if (sheet === 'Flow1_Sign_to_Speech') {
            var p1 = getFlow1(s, i.key);
            if (p1) { var b1 = clone(p1); Object.assign(p1, n); bump(p1, actor); audit(s, actor, 'import.update', 'flow1_profile', i.key, b1, p1); counts.updated++; }
            else { p1 = Object.assign({ version: 0 }, n); bump(p1, actor); s.flow1_profiles.push(p1); audit(s, actor, 'import.create', 'flow1_profile', i.key, null, p1); counts.created++; }
          } else if (sheet === 'Flow2_Speech_to_Sign') {
            var p2 = getFlow2(s, i.key);
            if (p2) { var b2 = clone(p2); Object.assign(p2, n); bump(p2, actor); audit(s, actor, 'import.update', 'flow2_profile', i.key, b2, p2); counts.updated++; }
            else { p2 = Object.assign({ version: 0 }, n); bump(p2, actor); s.flow2_profiles.push(p2); audit(s, actor, 'import.create', 'flow2_profile', i.key, null, p2); counts.created++; }
          }
        });
      });
      // integrity: no duplicate keys after commit
      var dupe = function (list, key) { var seen = {}; return list.some(function (x) { if (seen[x[key]]) return true; seen[x[key]] = 1; return false; }); };
      if (dupe(s.meanings, 'meaning_id') || dupe(s.flow1_profiles, 'meaning_id') || dupe(s.flow2_profiles, 'meaning_id') || dupe(s.assets, 'asset_id')) throw new Error('duplicate key after import');
      audit(s, actor, 'import.commit', 'import_batch', (batchInfo && batchInfo.batch_id) || ('IMP_' + Date.now()), null, { filename: batchInfo && batchInfo.filename, created: counts.created, updated: counts.updated }, 'Excel import');
      return { ok: true, state: s, counts: counts };
    } catch (e) {
      return { ok: false, error: err('INTERNAL', 'Import failed and nothing was changed', { reason: String(e && e.message || e) }) };
    }
  }

  // ---------------------------------------------------------------- media auto-mapping
  var LOCALE_ROLE = { 'ar': 'FLOW1_AR_AUDIO', 'ar-sa': 'FLOW1_AR_AUDIO', 'ar_sa': 'FLOW1_AR_AUDIO', 'en': 'FLOW1_EN_AUDIO', 'en-us': 'FLOW1_EN_AUDIO', 'en_us': 'FLOW1_EN_AUDIO', 'en-gb': 'FLOW1_EN_AUDIO', 'avatar': 'FLOW2_AVATAR' };
  function levenshtein(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; } for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  /**
   * Deterministic media mapping. Order: explicit asset ID, exact declared filename, meaning ID + suffix,
   * locale/type suffix, fuzzy suggestion. States: exact | suggested | missing | conflict | invalid.
   */
  function automapFiles(fileNames, state, declared) {
    declared = declared || {};
    var results = [];
    var assetByFile = {};
    (state.assets || []).forEach(function (a) { if (a.filename) assetByFile[a.filename.toLowerCase()] = a; });
    Object.keys(declared).forEach(function (f) { assetByFile[f.toLowerCase()] = declared[f]; });
    var meaningIds = (state.meanings || []).map(function (m) { return m.meaning_id; });
    fileNames.forEach(function (name) {
      var res = { file: name, meaning_id: null, role: null, asset_id: null, status: 'missing', via: null, reason: null };
      var x = ext(name), base = String(name).replace(/\.[^.]+$/, '');
      var isAudio = AUDIO_EXT.indexOf(x) >= 0, isVideo = VIDEO_EXT.indexOf(x) >= 0;
      if (!isAudio && !isVideo) { res.status = 'invalid'; res.reason = 'UNSUPPORTED_FILE_TYPE'; results.push(res); return; }
      // 1. explicit asset id
      var idm = /^((AUD|AVA)_[A-Z0-9_]+_\d{3})/.exec(base);
      if (idm && getAsset(state, idm[1])) { var ea = getAsset(state, idm[1]); var own = assetOwner(state, ea.asset_id); res.asset_id = ea.asset_id; res.meaning_id = own ? own.meaning_id : null; res.role = own ? own.role : null; res.status = 'exact'; res.via = 'asset_id'; }
      // 2. exact declared filename
      else if (assetByFile[String(name).toLowerCase()]) { var da = assetByFile[String(name).toLowerCase()]; var o2 = assetOwner(state, da.asset_id); res.asset_id = da.asset_id; res.meaning_id = o2 ? o2.meaning_id : (da.meaning_id || null); res.role = o2 ? o2.role : (da.role || null); res.status = 'exact'; res.via = 'filename'; }
      else {
        // 3/4. MEANING_suffix convention
        var mm = /^([A-Za-z][A-Za-z0-9_]*?)_(ar-SA|ar_SA|ar|en-US|en_US|en-GB|en|avatar)$/i.exec(base);
        if (mm) {
          var mid = mm[1].toUpperCase(), role = LOCALE_ROLE[mm[2].toLowerCase()];
          if (role === 'FLOW2_AVATAR' && !isVideo) { res.status = 'invalid'; res.reason = 'AVATAR_MUST_BE_VIDEO'; }
          else if (role !== 'FLOW2_AVATAR' && !isAudio) { res.status = 'invalid'; res.reason = 'AUDIO_MUST_BE_AUDIO'; }
          else if (meaningIds.indexOf(mid) >= 0) { res.meaning_id = mid; res.role = role; res.status = 'exact'; res.via = 'convention'; }
          else {
            var best = null; meaningIds.forEach(function (id) { var dd = levenshtein(id, mid); if (dd <= 2 && (!best || dd < best.d)) best = { id: id, d: dd }; });
            if (best) { res.meaning_id = best.id; res.role = role; res.status = 'suggested'; res.via = 'fuzzy'; res.reason = 'CLOSE_TO_' + best.id; }
            else { res.status = 'missing'; res.reason = 'UNKNOWN_MEANING_' + mid; }
          }
        } else {
          var sfx = /_([A-Za-z]{2}(?:[-_][A-Za-z]{2})?)$/.exec(base);
          res.status = 'invalid'; res.reason = sfx ? 'UNKNOWN_SUFFIX_' + sfx[1] : 'NAME_NOT_RECOGNISED';
        }
      }
      results.push(res);
    });
    // conflicts: two files mapped to the same meaning+role
    var seen = {};
    results.forEach(function (r) { if (r.meaning_id && r.role && (r.status === 'exact' || r.status === 'suggested')) { var k = r.meaning_id + '|' + r.role; if (seen[k]) { r.status = 'conflict'; r.reason = 'SAME_TARGET_AS ' + seen[k].file; seen[k].status = 'conflict'; seen[k].reason = 'SAME_TARGET_AS ' + r.file; } else seen[k] = r; } });
    return results;
  }

  // ---------------------------------------------------------------- CSV (formula-injection safe)
  function sanitizeCell(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s;
  }
  function toCSV(rows, columns) {
    var head = columns.map(function (c) { return c.header || c.key; });
    var lines = [head].concat(rows.map(function (r) { return columns.map(function (c) { return sanitizeCell(r[c.key]); }); }));
    return '﻿' + lines.map(function (cells) { return cells.map(function (c) { return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n') + '\r\n';
  }
  function parseCSV(text) {
    var s = String(text || '').replace(/^﻿/, ''), rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // ---------------------------------------------------------------- API envelope
  function envelope(data, error, requestId) { return { ok: !error, data: error ? null : (data === undefined ? null : data), error: error || null, request_id: requestId || null }; }

  return {
    CORE_VERSION: CORE_VERSION, LIFECYCLE: LIFECYCLE, REVIEW: REVIEW, RIGHTS: RIGHTS, ASSET_TYPES: ASSET_TYPES, ASSET_LIFECYCLE: ASSET_LIFECYCLE, CATEGORIES: CATEGORIES, ROLES: ROLES, ERROR_CODES: ERROR_CODES, HINT_LANGS: HINT_LANGS,
    MEANING_ID_RE: MEANING_ID_RE, ASSET_ID_RE: ASSET_ID_RE, CV_CLASS_RE: CV_CLASS_RE, AUDIO_EXT: AUDIO_EXT, VIDEO_EXT: VIDEO_EXT, MIME_BY_EXT: MIME_BY_EXT, LIMITS: LIMITS,
    clone: clone, nowIso: nowIso, ext: ext, err: err, eq: eq,
    normalizeArabic: normalizeArabic, normalizeText: normalizeText, detectLanguage: detectLanguage, detectLanguageDetailed: detectLanguageDetailed, hintCollisions: hintCollisions,
    CATALOGUE_COLLECTIONS: CATALOGUE_COLLECTIONS, catalogueFingerprint: catalogueFingerprint, EDITABLE: EDITABLE, createMeaning: createMeaning, updateMeaning: updateMeaning, archiveMeaning: archiveMeaning, restoreMeaning: restoreMeaning, deleteMeaning: deleteMeaning, ensureProfile: ensureProfile, updateProfile: updateProfile, updateAsset: updateAsset, diffStates: diffStates, buildRelease: buildRelease,
    OVERRIDABLE_CONFLICTS: OVERRIDABLE_CONFLICTS, allowedDecisions: allowedDecisions, setDecision: setDecision, applyDecisions: applyDecisions, editParsedCell: editParsedCell, previewCounts: previewCounts,
    parseHint: parseHint, parseHintList: parseHintList, hintsToText: hintsToText, hintToText: hintToText,
    emptyState: emptyState, getMeaning: getMeaning, getFlow1: getFlow1, getFlow2: getFlow2, getAsset: getAsset, assetOwner: assetOwner,
    validateMeaningId: validateMeaningId, validateCoreMeaning: validateCoreMeaning, validateFlow1: validateFlow1, validateFlow2: validateFlow2, validateAsset: validateAsset, validateMediaFile: validateMediaFile,
    assetState: assetState, flow1Readiness: flow1Readiness, flow2Readiness: flow2Readiness, coverage: coverage, summary: summary, reviewQueue: reviewQueue,
    buildOpenAICatalogue: buildOpenAICatalogue, buildFlow1Catalogue: buildFlow1Catalogue, lookupFlow1: lookupFlow1, buildManifest: buildManifest,
    mockResolve: mockResolve, checkProviderOutput: checkProviderOutput, validateResolve: validateResolve, resolveTextMock: resolveTextMock, openAIResolveSchema: openAIResolveSchema, OPENAI_RESOLVE_INSTRUCTIONS: OPENAI_RESOLVE_INSTRUCTIONS, OPENAI_ENUM_MAX: OPENAI_ENUM_MAX,
    dependencyCheck: dependencyCheck, checkVersion: checkVersion, bump: bump, bumpCatalogue: bumpCatalogue, audit: audit, nextAssetId: nextAssetId, stageAssetVersion: stageAssetVersion, approveAsset: approveAsset, rejectAsset: rejectAsset, unlinkAsset: unlinkAsset, archiveAsset: archiveAsset,
    SHEETS: SHEETS, SHEET_ORDER: SHEET_ORDER, exportModel: exportModel, detectColumns: detectColumns, parseWorkbook: parseWorkbook, buildImportPreview: buildImportPreview, previewCanCommit: previewCanCommit, applyImport: applyImport, coerceBool: coerceBool,
    automapFiles: automapFiles, levenshtein: levenshtein, sanitizeCell: sanitizeCell, toCSV: toCSV, parseCSV: parseCSV, envelope: envelope
  };
});
