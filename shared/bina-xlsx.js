/*!
 * BINA spreadsheet adapter. Builds and reads BINA_Content_Catalogue.xlsx with ExcelJS (MIT).
 * Works in the browser (window.ExcelJS) and in Node (require('exceljs')). Pure layout + IO:
 * all validation and diff rules live in bina-core.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./bina-core.js'));
  else root.BinaXlsx = factory(root.BinaCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var LIMITS = { max_file_bytes: 5 * 1024 * 1024, max_rows_per_sheet: 5000, max_csv_bytes: 2 * 1024 * 1024 };
  var BRAND = { teal: 'FF009B96', deep: 'FF062B2B', cream: 'FFF5F1E8', mint: 'FFDFF5E6', line: 'FFD8E3DF', amber: 'FFF2A93B' };

  var NOTES = {
    meaning_id: 'Stable key. CAPITALS, digits and _ only, e.g. WATER. Never rename an existing ID: add a new row instead.',
    canonical_ar: 'Arabic text shown and spoken for this meaning.',
    canonical_en: 'English text shown and spoken for this meaning.',
    category: 'One of: ' + Object.keys(C.CATEGORIES).join(', '),
    enabled: 'TRUE or FALSE',
    lifecycle: 'draft, active or archived. Only active meanings reach customers.',
    version: 'Leave as exported. BINA uses it to detect edits made after this file was exported.',
    cv_class: 'Class name the sign-recognition model outputs for this meaning. Must be unique.',
    ar_audio_asset_id: 'Asset ID of the Arabic audio (see Assets sheet). Or leave empty and fill the file name.',
    ar_audio_file: 'File name, e.g. WATER_ar-SA.mp3. Upload the file in Admin > Excel CMS > Media files.',
    en_audio_asset_id: 'Asset ID of the English audio (see Assets sheet).',
    en_audio_file: 'File name, e.g. WATER_en.mp3',
    semantic_hints: 'Words people say for this meaning, separated by | . Optional language tag: air@ms, hi@en. Each phrase may belong to ONE meaning only.',
    avatar_asset_id: 'Asset ID of the avatar clip (see Assets sheet).',
    avatar_file: 'File name, e.g. WATER_avatar.mp4',
    review_status: C.REVIEW.join(', '),
    rights_status: C.RIGHTS.join(', '),
    asset_id: 'AUD_<MEANING>_<AR|EN>_001 for audio, AVA_<MEANING>_001 for avatar clips.',
    asset_type: 'audio or avatar_video',
    filename: 'Exact file name. No folders.',
    language: 'ar or en (audio only)',
    locale: 'e.g. ar-SA, en-US',
    source: 'Where the file came from, e.g. MOCK_FIXTURE, TALKBIM_COLLAB_REFERENCE, BINA_RECORDING'
  };
  var VALIDATION = {
    category: Object.keys(C.CATEGORIES), enabled: ['TRUE', 'FALSE'], lifecycle: C.LIFECYCLE, review_status: C.REVIEW,
    rights_status: C.RIGHTS, asset_type: C.ASSET_TYPES, language: ['ar', 'en']
  };
  var WIDTH = { meaning_id: 18, canonical_ar: 22, canonical_en: 22, category: 13, enabled: 10, lifecycle: 12, version: 9, cv_class: 18, ar_audio_asset_id: 22, ar_audio_file: 24, en_audio_asset_id: 22, en_audio_file: 24, semantic_hints: 52, avatar_asset_id: 20, avatar_file: 24, review_status: 16, rights_status: 14, asset_id: 22, asset_type: 14, filename: 28, language: 10, locale: 10, source: 26 };

  function getExcel(ExcelJS) {
    var X = ExcelJS || (typeof window !== 'undefined' && window.ExcelJS);
    if (!X) throw new Error('ExcelJS is not loaded');
    return X;
  }

  function addReadme(wb, meta, template) {
    var ws = wb.addWorksheet('README', { properties: { tabColor: { argb: BRAND.teal } }, views: [{ showGridLines: false }] });
    ws.columns = [{ width: 4 }, { width: 120 }];
    var lines = [
      ['BINA Content Catalogue', 'title'],
      [template ? 'Empty template. Fill the four sheets, then import in Admin > Excel CMS.' : ('Export of catalogue version ' + meta.catalogue_version + ' (' + meta.environment + ') at ' + meta.exported_at + (meta.exported_by ? ' by ' + meta.exported_by : '')), 'sub'],
      ['', ''],
      ['How BINA reads this file', 'h'],
      ['1. Meaning ID is the stable key. The same ID in every sheet is the same meaning. Re-importing never creates a second WATER.', ''],
      ['2. Core_Meanings = the meaning itself. Flow1_Sign_to_Speech and Flow2_Speech_to_Sign are two independent profiles of that meaning.', ''],
      ['3. Assets lists every audio and avatar file. Profiles point at assets by Asset ID (or by exact file name).', ''],
      ['4. Import never overwrites anything directly: you get a preview with NEW / UPDATED / UNCHANGED / WARNING / CONFLICT / ERROR, a diff, and you commit.', ''],
      ['5. Keep the version column as exported. If someone changed a row in Admin after your export, that row shows as CONFLICT.', ''],
      ['6. Semantic hints: separate with | . Add @ms / @en / @ar to tag a language, e.g.  مويه | موية | air@ms', ''],
      ['7. A phrase can belong to one meaning only. If two meanings share a phrase, import shows ALIAS_COLLISION and you must fix it.', ''],
      ['8. Formulas are not accepted. Type plain values.', ''],
      ['9. Do not rename the sheets. Extra columns are ignored. Known header variations are mapped automatically and shown in the preview.', ''],
      ['', ''],
      ['قواعد سريعة', 'h'],
      ['• معرّف المعنى (meaning_id) هو المفتاح الثابت. نفس المعرّف في كل الأوراق = نفس المعنى، والاستيراد لا ينشئ نسخة ثانية.', 'rtl'],
      ['• التدفق الأول (إشارة إلى صوت) والتدفق الثاني (صوت إلى إشارة) ملفان مستقلان لنفس المعنى.', 'rtl'],
      ['• الاستيراد يعرض معاينة وفروقات قبل الحفظ، ولا يستبدل شيئًا مباشرة.', 'rtl'],
      ['• افصل التلميحات بعلامة | ويمكن تحديد اللغة هكذا: air@ms', 'rtl'],
      ['', ''],
      ['Allowed values', 'h'],
      ['category: ' + VALIDATION.category.join(', '), ''],
      ['lifecycle: ' + VALIDATION.lifecycle.join(', '), ''],
      ['review_status: ' + VALIDATION.review_status.join(', '), ''],
      ['rights_status: ' + VALIDATION.rights_status.join(', '), ''],
      ['asset_type: ' + VALIDATION.asset_type.join(', '), ''],
      ['', ''],
      ['Media naming convention (used by bulk media upload)', 'h'],
      ['WATER_ar-SA.mp3 -> WATER, Flow 1 Arabic audio      WATER_en.mp3 -> WATER, Flow 1 English audio      WATER_avatar.mp4 -> WATER, Flow 2 avatar', ''],
      ['', ''],
      ['Demo media rule', 'h'],
      ['Assets marked demo_asset are for the prototype only. TalkBIM reference clips keep source TALKBIM_COLLAB_REFERENCE and are not production approved.', '']
    ];
    lines.forEach(function (l, i) {
      var row = ws.getRow(i + 1); var cell = row.getCell(2);
      cell.value = l[0];
      if (l[1] === 'title') { cell.font = { size: 18, bold: true, color: { argb: BRAND.deep } }; row.height = 28; }
      else if (l[1] === 'sub') cell.font = { size: 11, italic: true, color: { argb: 'FF315252' } };
      else if (l[1] === 'h') { cell.font = { size: 12, bold: true, color: { argb: BRAND.teal } }; row.height = 20; }
      else if (l[1] === 'rtl') cell.alignment = { horizontal: 'right', readingOrder: 'rtl', wrapText: true };
      else cell.alignment = { wrapText: true, vertical: 'top' };
    });
    return ws;
  }

  function addDataSheet(wb, name, rows) {
    var def = C.SHEETS[name];
    var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }], properties: { tabColor: { argb: name === 'Core_Meanings' ? BRAND.deep : name === 'Assets' ? BRAND.amber : BRAND.teal } } });
    ws.columns = def.columns.map(function (c) { return { header: c.header, key: c.key, width: WIDTH[c.key] || 16 }; });
    var head = ws.getRow(1);
    head.height = 22;
    head.eachCell(function (cell, i) {
      var col = def.columns[i - 1];
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.required ? BRAND.deep : BRAND.teal } };
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: BRAND.line } } };
      if (NOTES[col.key]) cell.note = NOTES[col.key] + (col.required ? ' (required)' : '');
    });
    rows.forEach(function (r) {
      var values = {};
      def.columns.forEach(function (c) {
        var v = r[c.key];
        if (v === undefined || v === null) v = '';
        if (c.type === 'bool') v = !!v;
        else if (c.type === 'int') v = v === '' ? '' : Number(v);
        else v = String(v); // text cells are always written as text: never as formulas
        values[c.key] = v;
      });
      ws.addRow(values);
    });
    var last = Math.max(rows.length + 1, 200);
    def.columns.forEach(function (c, i) {
      var colLetter = ws.getColumn(i + 1).letter;
      if (c.key === 'canonical_ar' || (c.key === 'semantic_hints')) ws.getColumn(i + 1).alignment = { readingOrder: c.key === 'canonical_ar' ? 'rtl' : 'context', horizontal: c.key === 'canonical_ar' ? 'right' : 'left', wrapText: false };
      if (c.type !== 'bool' && c.type !== 'int') ws.getColumn(i + 1).numFmt = '@';
      var list = VALIDATION[c.key];
      if (list) {
        for (var r = 2; r <= last; r++) {
          ws.getCell(colLetter + r).dataValidation = {
            type: 'list', allowBlank: !c.required, formulae: ['"' + list.join(',') + '"'],
            showErrorMessage: true, errorStyle: 'warning', errorTitle: 'BINA', error: 'Use one of: ' + list.join(', ')
          };
        }
      }
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columns.length } };
    return ws;
  }

  /** Build the workbook. opts.template = true gives empty sheets with headers and validation. */
  function buildWorkbook(ExcelJS, state, opts) {
    opts = opts || {};
    var X = getExcel(ExcelJS);
    var wb = new X.Workbook();
    wb.creator = 'BINA Admin'; wb.created = new Date(opts.now || Date.now()); wb.modified = wb.created;
    var meta = { catalogue_version: (state && state.meta && state.meta.catalogue_version) || 0, environment: (state && state.meta && state.meta.environment) || 'DEMO', exported_at: new Date(opts.now || Date.now()).toISOString(), exported_by: opts.exportedBy || null };
    addReadme(wb, meta, !!opts.template);
    var model = opts.template ? { Core_Meanings: [], Flow1_Sign_to_Speech: [], Flow2_Speech_to_Sign: [], Assets: [] } : C.exportModel(state);
    C.SHEET_ORDER.forEach(function (name) { addDataSheet(wb, name, model[name]); });
    return wb;
  }
  function toBuffer(wb) { return wb.xlsx.writeBuffer(); }

  /** Read an .xlsx ArrayBuffer/Buffer into { SheetName: [[cell...]...] } for BinaCore.parseWorkbook. */
  function readWorkbook(ExcelJS, data) {
    var X = getExcel(ExcelJS);
    var size = data && (data.byteLength || data.length) || 0;
    if (!size) return Promise.reject(C.err('VALIDATION_ERROR', 'The file is empty'));
    if (size > LIMITS.max_file_bytes) return Promise.reject(C.err('PAYLOAD_TOO_LARGE', 'Workbook is larger than ' + Math.round(LIMITS.max_file_bytes / 1048576) + ' MB'));
    var wb = new X.Workbook();
    return wb.xlsx.load(data).then(function () {
      var raw = {};
      wb.eachSheet(function (ws) {
        if (ws.name === 'README' || ws.state === 'veryHidden') return;
        if (ws.rowCount > LIMITS.max_rows_per_sheet + 1) throw C.err('PAYLOAD_TOO_LARGE', 'Sheet ' + ws.name + ' has more than ' + LIMITS.max_rows_per_sheet + ' rows');
        var grid = [];
        ws.eachRow({ includeEmpty: true }, function (row, n) {
          var vals = Array.isArray(row.values) ? row.values.slice(1) : [];
          grid[n - 1] = vals.map(function (v) { return v === undefined ? null : v; });
        });
        for (var i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
        raw[ws.name] = grid;
      });
      return raw;
    }, function (e) {
      if (e && e.code) throw e;
      throw C.err('VALIDATION_ERROR', 'This is not a readable .xlsx workbook', { reason: String(e && e.message || e).slice(0, 200) });
    });
  }

  /** CSV for one sheet (formula-injection safe, UTF-8 BOM so Excel shows Arabic correctly). */
  function csvForSheet(state, sheet) { return C.toCSV(C.exportModel(state)[sheet], C.SHEETS[sheet].columns); }
  /** Which sheet does a CSV belong to? Picks the sheet whose required columns all appear and that matches most headers. */
  function detectSheetFromHeaders(headers) {
    var best = null;
    C.SHEET_ORDER.forEach(function (name) {
      var det = C.detectColumns(name, headers);
      var score = Object.keys(det.map).length;
      if (!det.missing.length && (!best || score > best.score)) best = { sheet: name, score: score };
    });
    return best ? best.sheet : null;
  }
  function rawFromCSV(text, sheetName) {
    if (String(text || '').length > LIMITS.max_csv_bytes) throw C.err('PAYLOAD_TOO_LARGE', 'CSV is too large');
    var grid = C.parseCSV(text);
    var name = sheetName || detectSheetFromHeaders(grid[0] || []);
    if (!name) throw C.err('VALIDATION_ERROR', 'Could not tell which sheet this CSV is. Check the header row.');
    var raw = {}; raw[name] = grid; return raw;
  }

  return { LIMITS: LIMITS, buildWorkbook: buildWorkbook, toBuffer: toBuffer, readWorkbook: readWorkbook, csvForSheet: csvForSheet, rawFromCSV: rawFromCSV, detectSheetFromHeaders: detectSheetFromHeaders, NOTES: NOTES, VALIDATION: VALIDATION };
});
