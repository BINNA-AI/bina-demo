/*!
 * BINA Admin: Excel module for Core Meanings.
 *   ctx.tab 'excel'  : Excel View (presets Overview / Flow 1 / Flow 2 / All, inline edit, keyboard, copy, media chips)
 *   ctx.tab 'import' : Import / Export (workbook, template, CSV, JSON; import preview per meaning; bulk media mapping)
 *   ctx.tab 'media'  : bulk media upload for the Media Library (pending versions only)
 * Classic script. Uses the Admin's own classes and tokens (.card .t .tw .btn .chip .badge .filters .seg .ov .dlg .bulk .note).
 * Data only through BinaRepo (local demo store or the Worker API). Rules only from BinaCore. The preview never writes.
 * Public API: window.BinaAdminExcel = { version, mount(el, ctx), unmount() }.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var STYLE_ID = 'xcms-style-' + VERSION;
  var CORE = 'Core_Meanings', F1 = 'Flow1_Sign_to_Speech', F2 = 'Flow2_Speech_to_Sign', ASSETS = 'Assets';
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var C, R, P, X, I;

  // =====================================================================================================
  // Strings [EN, AR]. No emoji, no em dashes, no exclamation marks.
  // =====================================================================================================
  var L = {
    'x.missingDeps': ['This page needs BinaCore, BinaRepo, BinaProviders, BinaXlsx and ExcelJS. One of them did not load.', 'تحتاج هذه الصفحة إلى BinaCore وBinaRepo وBinaProviders وBinaXlsx وExcelJS، ولم يُحمَّل أحدها.'],
    'x.loading': ['Loading the catalogue', 'جارٍ تحميل الكتالوج'],
    'x.mode.local': ['Local demo data', 'بيانات تجريبية محلية'],
    'x.mode.api': ['Worker API', 'واجهة Worker'],
    'x.version': ['Catalogue version {v}', 'إصدار الكتالوج {v}'],
    'x.key.t': ['Meaning ID is the stable key', 'معرّف المعنى هو المفتاح الثابت'],
    'x.key.b': ['A row with the ID SALAM updates SALAM. Importing the same file again never creates a second SALAM. To add a meaning, add a row with a new ID.', 'الصف الذي يحمل المعرّف SALAM يحدّث SALAM نفسه. إعادة استيراد الملف لا تنشئ SALAM ثانيًا أبدًا. لإضافة معنى أضف صفًا بمعرّف جديد.'],
    'yes': ['Yes', 'نعم'], 'no': ['No', 'لا'],

    // Excel View
    'xv.grid': ['Core meanings, Excel view', 'المعاني الأساسية، عرض Excel'],
    'xv.presets': ['Column preset', 'مجموعة الأعمدة'],
    'xv.p.overview': ['Overview', 'نظرة عامة'], 'xv.p.flow1': ['Flow 1', 'التدفق 1'], 'xv.p.flow2': ['Flow 2', 'التدفق 2'], 'xv.p.all': ['All', 'الكل'],
    'xv.search': ['Search ID, Arabic, English, CV class or hints', 'ابحث بالمعرّف أو العربي أو الإنجليزي أو فئة الرؤية أو التلميحات'],
    'xv.f.cat': ['All categories', 'كل التصنيفات'], 'xv.f.life': ['Any lifecycle', 'أي دورة حياة'], 'xv.f.f1': ['Flow 1: any', 'التدفق 1: الكل'], 'xv.f.f2': ['Flow 2: any', 'التدفق 2: الكل'],
    'xv.f.catL': ['Category', 'التصنيف'], 'xv.f.lifeL': ['Lifecycle', 'دورة الحياة'], 'xv.f.f1L': ['Flow 1 readiness', 'جاهزية التدفق 1'], 'xv.f.f2L': ['Flow 2 readiness', 'جاهزية التدفق 2'],
    'xv.shown': ['Showing {n} of {total} meanings', 'المعروض {n} من {total} معنى'],
    'xv.empty': ['No meanings match these filters.', 'لا توجد معانٍ مطابقة لهذه التصفية.'],
    'xv.help': ['Arrow keys move between cells. Enter or F2 edits, Esc cancels, Tab saves and moves on. Shift with the arrows selects a range and Ctrl+C copies it.', 'تنقّل بين الخلايا بالأسهم. Enter أو F2 للتعديل، وEsc للإلغاء، وTab للحفظ والانتقال. Shift مع الأسهم لتحديد نطاق، وCtrl+C لنسخه.'],
    'xv.g.core': ['CORE', 'الأساسي'], 'xv.g.flow1': ['FLOW 1', 'التدفق 1'], 'xv.g.flow2': ['FLOW 2', 'التدفق 2'],
    'xv.c.id': ['Meaning ID', 'معرّف المعنى'], 'xv.c.f1': ['Flow 1', 'التدفق 1'], 'xv.c.f2': ['Flow 2', 'التدفق 2'], 'xv.c.review': ['Review', 'المراجعة'],
    'xv.c.audAr': ['Arabic audio', 'الصوت العربي'], 'xv.c.audEn': ['English audio', 'الصوت الإنجليزي'], 'xv.c.f1on': ['Flow 1 enabled', 'تفعيل التدفق 1'],
    'xv.c.avatar': ['Avatar', 'الأفاتار'], 'xv.c.elig': ['OpenAI eligible', 'مؤهل لـ OpenAI'], 'xv.c.f2on': ['Flow 2 enabled', 'تفعيل التدفق 2'],
    'xv.c.f1r': ['Flow 1 readiness', 'جاهزية التدفق 1'], 'xv.c.f2r': ['Flow 2 readiness', 'جاهزية التدفق 2'], 'xv.c.status': ['Status', 'الحالة'], 'xv.c.cv': ['CV', 'فئة الرؤية'], 'xv.c.hints': ['Hints', 'التلميحات'],
    'xv.saved': ['Saved {id}: {field}.', 'تم حفظ {id}: {field}.'],
    'xv.err': ['{id}, {field}: not saved. {msg}', '{id}، {field}: لم يُحفظ. {msg}'],
    'xv.copied': ['Copied {n} cells.', 'نُسخت الخلايا: {n}.'],
    'xv.edit': ['Edit {field} for {id}', 'تعديل {field} لـ {id}'],
    'xv.toggle': ['{field}, {id}', '{field}، {id}'],
    'xv.notSetUp': ['Not set up', 'غير مُعد'],
    'xv.empty1': ['(empty)', '(فارغ)'],
    'xv.saving': ['Saving', 'جارٍ الحفظ'],
    'lc.active': ['Active', 'نشط'], 'lc.draft': ['Draft', 'مسودة'], 'lc.archived': ['Archived', 'مؤرشف'],
    'rd.ready': ['Ready', 'جاهز'], 'rd.demo': ['Demo ready', 'جاهز للعرض'], 'rd.partial': ['Partial', 'جزئي'], 'rd.blocked': ['Blocked', 'متوقف'], 'rd.disabled': ['Off', 'معطّل'], 'rd.none': ['Not set up', 'غير مُعد'],
    'rv.pending': ['In review: {n}', 'قيد المراجعة: {n}'], 'rv.ok': ['Approved', 'معتمد'], 'rv.none': ['Nothing to review', 'لا شيء للمراجعة'],
    'mc.FLOW1_AR_AUDIO': ['AR', 'العربي'], 'mc.FLOW1_EN_AUDIO': ['EN', 'الإنجليزي'], 'mc.FLOW2_AVATAR': ['Avatar', 'الأفاتار'],
    'mc.ready': ['{r} ready', '{r} جاهز'], 'mc.missing': ['{r} missing', '{r} ناقص'], 'mc.review': ['{r} in review', '{r} قيد المراجعة'], 'mc.blocked': ['{r} blocked', '{r} متوقف'],
    'mc.pending': ['new version pending', 'إصدار جديد بانتظار المراجعة'],
    'mc.open': ['Preview {r} for {id}', 'معاينة {r} للمعنى {id}'],
    'why.FLOW2_AVATAR_MISSING': ['No avatar', 'بلا أفاتار'], 'why.FLOW2_NOT_APPROVED': ['Not approved', 'غير معتمد'], 'why.FLOW2_RIGHTS_NOT_CLEARED': ['Rights not cleared', 'الحقوق غير مستوفاة'],
    'why.FLOW2_AVATAR_ASSET_NOT_APPROVED': ['Avatar in review', 'الأفاتار قيد المراجعة'], 'why.FLOW2_AVATAR_FILE_MISSING': ['Avatar file missing', 'ملف الأفاتار مفقود'], 'why.FLOW2_AVATAR_RIGHTS_NOT_CLEARED': ['Avatar rights not cleared', 'حقوق الأفاتار غير مستوفاة'],
    'why.FLOW1_NO_CV_CLASS': ['No CV class', 'بلا فئة رؤية'], 'why.FLOW1_NOT_APPROVED': ['Not approved', 'غير معتمد'], 'why.FLOW1_CV_CLASS_DUPLICATE': ['CV class used twice', 'فئة الرؤية مكررة'],
    'why.FLOW1_EN_AUDIO_MISSING': ['No English audio', 'بلا صوت إنجليزي'], 'why.FLOW1_AR_AUDIO_MISSING': ['No Arabic audio', 'بلا صوت عربي'],
    'why.FLOW1_EN_AUDIO_ASSET_NOT_APPROVED': ['English audio in review', 'الصوت الإنجليزي قيد المراجعة'], 'why.FLOW1_AR_AUDIO_ASSET_NOT_APPROVED': ['Arabic audio in review', 'الصوت العربي قيد المراجعة'],
    'why.CORE_DRAFT': ['Meaning is a draft', 'المعنى مسودة'], 'why.CORE_ARCHIVED': ['Meaning is archived', 'المعنى مؤرشف'], 'why.CORE_DISABLED': ['Meaning is off', 'المعنى معطّل'],
    'why.FLOW1_DISABLED': ['Flow 1 is off', 'التدفق 1 معطّل'], 'why.FLOW2_DISABLED': ['Flow 2 is off', 'التدفق 2 معطّل'], 'why.FLOW1_NO_PROFILE': ['Not set up', 'غير مُعد'], 'why.FLOW2_NO_PROFILE': ['Not set up', 'غير مُعد'],

    // media preview dialog
    'pv.t': ['{id}: {role}', '{id}: {role}'],
    'pv.live': ['Live file', 'الملف الحالي'], 'pv.pending': ['Pending version, not live yet', 'إصدار بانتظار المراجعة، غير منشور بعد'],
    'pv.none': ['No file is linked for this role.', 'لا يوجد ملف مرتبط بهذا الدور.'],
    'pv.asset': ['Asset ID', 'معرّف الملف'], 'pv.file': ['File name', 'اسم الملف'], 'pv.review': ['Review', 'المراجعة'], 'pv.rights': ['Rights', 'الحقوق'], 'pv.source': ['Source', 'المصدر'], 'pv.ver': ['Version', 'الإصدار'], 'pv.len': ['Length', 'المدة'],
    'pv.demo': ['DEMO FILE, NOT PRODUCTION APPROVED', 'ملف تجريبي، غير معتمد للإنتاج'],
    'pv.mock': ['MOCK AUDIO, synthetic voice', 'صوت تجريبي بصوت اصطناعي'],
    'pv.ref': ['Reference clip from the TalkBIM collaboration', 'مقطع مرجعي من تعاون TalkBIM'],
    'pv.err': ['This file cannot be played here: {msg}', 'لا يمكن تشغيل هذا الملف هنا: {msg}'],
    'pv.manage': ['Manage media in the meaning', 'إدارة الوسائط في صفحة المعنى'],
    'close': ['Close', 'إغلاق'],

    // sheets + fields
    'sheet.Core_Meanings': ['The meaning itself: ID, Arabic and English text, category, enabled and lifecycle.', 'المعنى نفسه: المعرّف والنص العربي والإنجليزي والتصنيف والتفعيل ودورة الحياة.'],
    'sheet.Flow1_Sign_to_Speech': ['Flow 1, sign to speech: CV class and the Arabic and English audio.', 'التدفق 1 (إشارة إلى كلام): فئة الرؤية والصوت العربي والإنجليزي.'],
    'sheet.Flow2_Speech_to_Sign': ['Flow 2, speech to sign: semantic hints and the avatar clip.', 'التدفق 2 (كلام إلى إشارة): التلميحات الدلالية ومقطع الأفاتار.'],
    'sheet.Assets': ['Every audio file and avatar clip, with rights and review status.', 'كل ملفات الصوت ومقاطع الأفاتار مع حالة الحقوق والمراجعة.'],
    'short.Core_Meanings': ['Core', 'الأساسي'], 'short.Flow1_Sign_to_Speech': ['Flow 1', 'التدفق 1'], 'short.Flow2_Speech_to_Sign': ['Flow 2', 'التدفق 2'], 'short.Assets': ['Files', 'الملفات'],
    'f.meaning_id': ['Meaning ID', 'معرّف المعنى'], 'f.canonical_ar': ['Arabic', 'العربية'], 'f.canonical_en': ['English', 'الإنجليزية'], 'f.category': ['Category', 'التصنيف'],
    'f.enabled': ['Enabled', 'مفعّل'], 'f.lifecycle': ['Lifecycle', 'دورة الحياة'], 'f.version': ['Version', 'الإصدار'], 'f.cv_class': ['CV class', 'فئة الرؤية'],
    'f.ar_audio_asset_id': ['Arabic audio', 'الصوت العربي'], 'f.ar_audio_file': ['Arabic audio file', 'ملف الصوت العربي'], 'f.en_audio_asset_id': ['English audio', 'الصوت الإنجليزي'], 'f.en_audio_file': ['English audio file', 'ملف الصوت الإنجليزي'],
    'f.semantic_hints': ['Semantic hints', 'التلميحات الدلالية'], 'f.avatar_asset_id': ['Avatar', 'الأفاتار'], 'f.avatar_file': ['Avatar file', 'ملف الأفاتار'],
    'f.review_status': ['Review status', 'حالة المراجعة'], 'f.rights_status': ['Rights status', 'حالة الحقوق'], 'f.asset_id': ['Asset ID', 'معرّف الملف'], 'f.asset_type': ['File type', 'نوع الملف'],
    'f.filename': ['File name', 'اسم الملف'], 'f.language': ['Language', 'اللغة'], 'f.locale': ['Locale', 'الإعداد المحلي'], 'f.source': ['Source', 'المصدر'],

    // export
    'exp.t': ['Export', 'التصدير'],
    'exp.s': ['One workbook holds the whole catalogue in four sheets plus a README. Edit it in Excel and import it back here.', 'مصنف واحد يحمل الكتالوج كله في أربع أوراق مع ورقة README. عدّله في Excel ثم استورده هنا.'],
    'exp.th.sheet': ['Sheet', 'الورقة'], 'exp.th.holds': ['What it holds', 'المحتوى'], 'exp.th.rows': ['Rows', 'الصفوف'],
    'exp.xlsx': ['Download catalogue (.xlsx)', 'تنزيل الكتالوج (.xlsx)'],
    'exp.tpl': ['Empty template', 'قالب فارغ'],
    'exp.json': ['JSON catalogue', 'الكتالوج JSON'],
    'exp.csv': ['CSV, one file per sheet', 'CSV، ملف لكل ورقة'],
    'exp.csvLabel': ['Download {sheet} as CSV, {n} rows', 'تنزيل {sheet} بصيغة CSV، الصفوف: {n}'],
    'exp.guard': ['Formula guard: a CSV cell that starts with = + - or @ is written with a leading apostrophe so Excel and Sheets show it as text and never run it. BINA removes the apostrophe on import. Formulas in an .xlsx file are rejected on import, never run.', 'حماية من الصيغ: خلية CSV التي تبدأ بـ = أو + أو - أو @ تُكتب مسبوقة بفاصلة عليا ليعرضها Excel وSheets كنص ولا ينفّذاها. تزيل BINA الفاصلة عند الاستيراد. الصيغ في ملفات .xlsx تُرفض عند الاستيراد ولا تُنفَّذ.'],
    'exp.file': ['File name', 'اسم الملف'],
    'exp.building': ['Preparing {file}', 'جارٍ تجهيز {file}'],
    'exp.done': ['Saved {file}.', 'تم حفظ {file}.'],
    'exp.declined': ['Download cancelled. Nothing was saved.', 'أُلغي التنزيل. لم يُحفظ شيء.'],
    'exp.failed': ['The file could not be saved: {msg}', 'تعذّر حفظ الملف: {msg}'],

    // import: upload
    'imp.t': ['Import', 'الاستيراد'],
    'imp.s': ['Upload the edited workbook. You see every change per meaning before anything is written.', 'ارفع المصنف المعدّل. ترى كل تغيير لكل معنى قبل كتابة أي شيء.'],
    'imp.steps': ['Upload|Read|Validate|Compare|Preview|Fix conflicts|Commit', 'الرفع|القراءة|التحقق|المقارنة|المعاينة|حل التعارضات|الاعتماد'],
    'imp.stepsL': ['Import steps', 'خطوات الاستيراد'],
    'imp.drop': ['Drop an .xlsx workbook or CSV files here', 'أفلت مصنف .xlsx أو ملفات CSV هنا'],
    'imp.choose': ['Choose a file', 'اختر ملفًا'],
    'imp.limits': ['Up to {mb} MB per workbook, {csvmb} MB per CSV file and {rows} rows per sheet. One workbook at a time, or several CSV files together.', 'حتى {mb} ميغابايت للمصنف و{csvmb} ميغابايت لملف CSV و{rows} صف لكل ورقة. مصنف واحد في كل مرة، أو عدة ملفات CSV معًا.'],
    'imp.safe': ['Nothing changes until you commit. Conflicts are decided by a person, and the commit writes everything in one step.', 'لا يتغير شيء قبل الاعتماد. يقرر شخص ما يحدث في التعارضات، ويكتب الاعتماد كل شيء دفعة واحدة.'],
    'imp.reading': ['Reading {file}', 'جارٍ قراءة {file}'],
    'imp.err.t': ['The file was not imported.', 'لم يُستورد الملف.'],
    'imp.err.type': ['Only .xlsx and .csv files can be imported. Not read: {files}', 'يمكن استيراد ملفات .xlsx و.csv فقط. لم يُقرأ: {files}'],
    'imp.err.mix': ['Import one workbook at a time, or one or more CSV files.', 'استورد مصنفًا واحدًا في كل مرة، أو ملف CSV واحدًا أو أكثر.'],
    'imp.err.size': ['{file} is larger than {mb} MB.', 'حجم {file} أكبر من {mb} ميغابايت.'],
    'imp.err.empty': ['{file} is empty.', 'الملف {file} فارغ.'],
    'imp.err.rows': ['A sheet has more than {rows} rows. Split the file into smaller batches.', 'تحتوي إحدى الأوراق على أكثر من {rows} صف. قسّم الملف إلى دفعات أصغر.'],
    'imp.err.unreadable': ['{file} is not a readable .xlsx workbook. Save it again from Excel as .xlsx and retry.', 'تعذرت قراءة {file} كمصنف .xlsx. احفظه من Excel بصيغة .xlsx ثم أعد المحاولة.'],
    'imp.err.csvSheet': ['Could not tell which sheet {file} belongs to. Keep the header row as exported, or name the file after the sheet, for example Flow2_Speech_to_Sign.csv. If it was saved with semicolons, save it again as CSV UTF-8 (comma delimited).', 'تعذّر تحديد الورقة التي ينتمي إليها {file}. أبقِ صف العناوين كما صُدّر، أو سمِّ الملف باسم الورقة مثل Flow2_Speech_to_Sign.csv. وإذا حُفظ بفواصل منقوطة فاحفظه مجددًا بصيغة CSV UTF-8 (مفصول بفواصل).'],
    'imp.err.csvDup': ['Two CSV files are for the same sheet ({sheet}). Import one of them.', 'ملفا CSV للورقة نفسها ({sheet}). استورد أحدهما فقط.'],
    'imp.err.server': ['BINA could not check this file: {msg}', 'تعذّر على BINA فحص هذا الملف: {msg}'],
    'imp.note.enc': ['{file} was not UTF-8, so it was read as Arabic Windows (1256). Check the Arabic text in the preview.', 'الملف {file} ليس بترميز UTF-8، فقُرئ بترميز Windows العربي (1256). تحقق من النص العربي في المعاينة.'],

    // import: preview
    'pr.t': ['Import preview', 'معاينة الاستيراد'],
    'pr.compared': ['Compared with catalogue version {v}', 'تمت المقارنة بإصدار الكتالوج {v}'],
    'pr.over': ['Start over', 'البدء من جديد'],
    'pr.one': ['One BINA catalogue: {m} meanings in this file, {r} rows in {s} sheets.', 'كتالوج BINA واحد: {m} معنى في هذا الملف، و{r} صف في {s} أوراق.'],
    'pr.missingSheet': ['{sheet}: not in this file, left unchanged', '{sheet}: غير موجودة في الملف، تبقى كما هي'],
    'pr.unknownSheet': ['"{name}" is not a BINA sheet and was ignored.', '"{name}" ليست ورقة BINA وتم تجاهلها.'],
    'pr.dupSheet': ['Sheet "{name}" maps to a sheet that was already read. Only the first one is used.', 'الورقة "{name}" تقابل ورقة قُرئت من قبل. تُستخدم الأولى فقط.'],
    'pr.csv': ['A CSV file holds one sheet. Only {sheets} is compared; the other sheets are not touched.', 'ملف CSV يحتوي ورقة واحدة. تُقارن {sheets} فقط، ولا تُمس الأوراق الأخرى.'],
    'pr.changed': ['The catalogue changed while you were reviewing (version {from} to {to}). The preview was rebuilt against the latest catalogue, keeping your edits and decisions where they still apply. Check the meanings again.', 'تغيّر الكتالوج أثناء مراجعتك (من الإصدار {from} إلى {to}). أُعيد بناء المعاينة على أحدث كتالوج مع الإبقاء على تعديلاتك وقراراتك حيث ما زالت تنطبق. راجع المعاني مرة أخرى.'],
    'pr.dismiss': ['Dismiss', 'إخفاء'],
    'pr.block': ['This file cannot be committed yet.', 'لا يمكن اعتماد هذا الملف بعد.'],
    'pr.block.cols': ['Sheet {sheet} is missing required columns: {cols}. Map a column of your file to them under Columns, or fix the header row.', 'الورقة {sheet} ينقصها أعمدة مطلوبة: {cols}. اربط بها عمودًا من ملفك في "الأعمدة"، أو صحّح صف العناوين.'],
    'pr.block.none': ['No BINA sheets were found. Sheet names must be Core_Meanings, Flow1_Sign_to_Speech, Flow2_Speech_to_Sign or Assets.', 'لم تُعثر على أوراق BINA. يجب أن تكون أسماء الأوراق Core_Meanings أو Flow1_Sign_to_Speech أو Flow2_Speech_to_Sign أو Assets.'],
    'pr.rows': ['Rows', 'الصفوف'],
    'pr.filter': ['Show meanings by status', 'عرض المعاني حسب الحالة'],
    'pr.search': ['Find a meaning', 'ابحث عن معنى'],
    'pr.shown': ['Showing {n} of {total} meanings', 'المعروض {n} من {total} معنى'],
    'pr.none': ['No meanings match this filter.', 'لا توجد معانٍ مطابقة لهذا التصفية.'],
    'st.ALL': ['All', 'الكل'], 'st.NEW': ['NEW', 'جديد'], 'st.UPDATED': ['UPDATED', 'محدّث'], 'st.UNCHANGED': ['UNCHANGED', 'بلا تغيير'], 'st.WARNING': ['WARNING', 'تنبيه'], 'st.CONFLICT': ['CONFLICT', 'تعارض'], 'st.ERROR': ['ERROR', 'خطأ'],
    'th.meaning': ['Meaning', 'المعنى'], 'th.core': ['Core', 'الأساسي'], 'th.f1': ['Flow 1', 'التدفق 1'], 'th.f2': ['Flow 2', 'التدفق 2'], 'th.files': ['Files', 'الملفات'], 'th.status': ['Status', 'الحالة'], 'th.dec': ['Decision', 'القرار'],
    'g.review': ['Review', 'مراجعة'], 'g.reviewFor': ['Review {id}', 'مراجعة {id}'],
    'grp.noMeaning': ['Files not linked to a meaning', 'ملفات غير مرتبطة بمعنى'], 'grp.noKey': ['Row without an ID ({sheet}, row {row})', 'صف بلا معرّف ({sheet}، الصف {row})'],
    'sum.notInFile': ['Not in file', 'غير موجود في الملف'], 'sum.same': ['No changes', 'بلا تغييرات'],
    'sum.newCore': ['New meaning', 'معنى جديد'], 'sum.newFlow': ['New profile', 'ملف جديد'], 'sum.newAsset': ['New file record', 'سجل ملف جديد'],
    'sum.upd': ['{fields} updated', 'تم تحديث {fields}'], 'sum.more': ['+{n} more', '+{n} أخرى'], 'sum.files': ['File rows: {n}', 'صفوف الملفات: {n}'],
    'dec.write': ['Will write {n}', 'سيُكتب {n}'], 'dec.skip': ['Skipped', 'متخطى'], 'dec.need': ['Needs a decision', 'بانتظار قرار'], 'dec.blocked': ['Blocked: fix or skip', 'متوقف: صحّح أو تخطَّ'], 'dec.nothing': ['Nothing to write', 'لا شيء للكتابة'],
    'tb.skipErrors': ['Skip all errors ({n})', 'تخطي كل الأخطاء ({n})'], 'tb.skipConflicts': ['Skip all conflicts ({n})', 'تخطي كل التعارضات ({n})'], 'tb.skipUnchanged': ['Skip all unchanged ({n})', 'تخطي كل ما لم يتغير ({n})'], 'tb.reset': ['Reset decisions', 'إعادة القرارات الافتراضية'], 'tb.bulk': ['Bulk decisions', 'قرارات جماعية'], 'tb.done': ['Decisions updated: {n}', 'حُدّثت القرارات: {n}'],
    'bar.write': ['Will write {n} rows', 'سيُكتب {n} صف'], 'bar.detail': ['new {nw}, updated {up}, overwrite {ow}', 'جديد {nw}، محدّث {up}، استبدال {ow}'], 'bar.skip': ['skipped {n}', 'متخطى {n}'], 'bar.decide': ['need a decision {n}', 'بانتظار قرار {n}'], 'bar.blocked': ['blocked {n}', 'متوقف {n}'],
    'bar.commit': ['Commit import', 'اعتماد الاستيراد'],
    'bar.why.blocking': ['Fix the file problems listed above first.', 'أصلح مشكلات الملف المذكورة أعلاه أولًا.'], 'bar.why.decide': ['Decide the conflicts first: fix the values, skip the rows, or overwrite stale rows.', 'قرّر بشأن التعارضات أولًا: صحّح القيم أو تخطَّ الصفوف أو استبدل الصفوف القديمة.'], 'bar.why.blocked': ['Fix or skip the rows with errors first.', 'صحّح الصفوف التي فيها أخطاء أو تخطَّها أولًا.'], 'bar.why.nothing': ['Nothing to write: every row is unchanged or skipped.', 'لا شيء للكتابة: كل الصفوف بلا تغيير أو متخطاة.'], 'bar.ready': ['Ready to commit.', 'جاهز للاعتماد.'],
    // columns + automap
    'cols.t': ['Columns', 'الأعمدة'],
    'cols.sum': ['{exact} exact, {alias} auto-mapped, {user} set by you, {ignored} ignored, {missing} missing', 'مطابق {exact}، رُبط تلقائيًا {alias}، حدّدته أنت {user}، متجاهل {ignored}، ناقص {missing}'],
    'cols.help': ['Known header variations are mapped automatically, for example "Arabic" is read as canonical_ar. Extra columns are ignored. Change a mapping if a column was read the wrong way, then re-read.', 'تُربط الصيغ المعروفة للعناوين تلقائيًا، فمثلًا يُقرأ "Arabic" على أنه canonical_ar. وتُتجاهل الأعمدة الإضافية. غيّر الربط إن قُرئ عمود بشكل خاطئ ثم أعد القراءة.'],
    'cols.th.col': ['Column in your file', 'العمود في ملفك'], 'cols.th.as': ['Read as', 'يُقرأ على أنه'], 'cols.th.st': ['Status', 'الحالة'],
    'cols.st.exact': ['Exact', 'مطابق'], 'cols.st.alias': ['Auto-mapped', 'رُبط تلقائيًا'], 'cols.st.user': ['Set by you', 'حدّدته أنت'], 'cols.st.ignored': ['Ignored', 'متجاهل'], 'cols.st.missing': ['Missing, required', 'ناقص ومطلوب'],
    'cols.ignore': ['Ignore this column', 'تجاهل هذا العمود'], 'cols.sel': ['Read column "{col}" of {sheet} as', 'قراءة العمود "{col}" في {sheet} على أنه'],
    'cols.apply': ['Re-read with these columns', 'إعادة القراءة بهذه الأعمدة'], 'cols.reset': ['Use detected columns', 'استخدام الأعمدة المكتشفة'], 'cols.noCol': ['No column in your file', 'لا يوجد عمود في ملفك'], 'cols.applied': ['The file was read again with your column choices.', 'أُعيدت قراءة الملف باختياراتك للأعمدة.'],
    'am.t': ['Media links in this file', 'روابط الوسائط في هذا الملف'], 'am.linked': ['Linked by exact file name: {n}', 'رُبط بالاسم المطابق للملف: {n}'], 'am.missing': ['Named but not uploaded yet: {n}', 'مذكور ولم يُرفع بعد: {n}'],
    'am.none': ['A row that names a file but has no Asset ID is linked by exact file name.', 'الصف الذي يذكر اسم ملف دون معرّف ملف يُربط بالاسم المطابق للملف.'],
    'am.upload': ['Upload missing files under Bulk media upload after you commit. They are added as pending versions for review.', 'ارفع الملفات الناقصة من "رفع الوسائط دفعة واحدة" بعد الاعتماد، وستُضاف كإصدارات بانتظار المراجعة.'],
    'am.via': ['{file} to {asset}', '{file} إلى {asset}'],
    // meaning dialog
    'md.where': ['row {row}', 'الصف {row}'],
    'md.sheet.Core_Meanings': ['Core meaning', 'المعنى الأساسي'], 'md.sheet.Flow1_Sign_to_Speech': ['Flow 1: sign to speech', 'التدفق 1: إشارة إلى كلام'], 'md.sheet.Flow2_Speech_to_Sign': ['Flow 2: speech to sign', 'التدفق 2: كلام إلى إشارة'], 'md.sheet.Assets': ['File {id}', 'الملف {id}'],
    'md.NEW.core': ['{id} is not in the catalogue yet. Commit creates it.', 'المعنى {id} غير موجود في الكتالوج بعد. يُنشأ عند الاعتماد.'],
    'md.NEW.flow': ['A new {flow} profile is created for {id}.', 'يُنشأ ملف {flow} جديد للمعنى {id}.'],
    'md.NEW.asset': ['File record {id} is added. The file itself is uploaded under Bulk media upload.', 'يُضاف سجل الملف {id}. يُرفع الملف نفسه من "رفع الوسائط دفعة واحدة".'],
    'md.UPDATED': ['Fields that change: {n}.', 'الحقول التي تتغير: {n}.'],
    'md.UNCHANGED': ['This row matches the catalogue. Nothing to write.', 'هذا الصف مطابق للكتالوج. لا شيء للكتابة.'],
    'md.CONFLICT': ['This row conflicts with the catalogue or with another row. A person decides what happens.', 'هذا الصف يتعارض مع الكتالوج أو مع صف آخر. يقرر شخص ما يحدث.'],
    'md.CONFLICT.ow': ['Skip it to keep the catalogue, or overwrite to keep your spreadsheet values.', 'تخطَّه للإبقاء على الكتالوج، أو استبدل للإبقاء على قيم جدولك.'],
    'md.CONFLICT.fix': ['Fix the values below, or skip the row. This kind of conflict cannot be overwritten.', 'صحّح القيم أدناه أو تخطَّ الصف. هذا النوع من التعارض لا يمكن استبداله.'],
    'md.ERROR': ['This row cannot be imported as it is. Fix the values below or skip the row.', 'لا يمكن استيراد هذا الصف كما هو. صحّح القيم أدناه أو تخطَّ الصف.'],
    'md.issues': ['Issues', 'الملاحظات'], 'md.diff': ['Before and after', 'قبل وبعد'], 'md.newVals': ['Values in the file', 'القيم في الملف'], 'md.same': ['Same as the catalogue.', 'مطابق للكتالوج.'],
    'md.before': ['Before', 'قبل'], 'md.after': ['After', 'بعد'], 'md.field': ['Field', 'الحقل'], 'md.empty': ['(empty)', '(فارغ)'], 'md.added': ['added', 'مضاف'], 'md.removed': ['removed', 'محذوف'], 'md.uses': ['also used by {id}', 'مستخدم أيضًا في {id}'],
    'lv.error': ['Error', 'خطأ'], 'lv.conflict': ['Conflict', 'تعارض'], 'lv.warning': ['Warning', 'تنبيه'],
    'md.edit': ['Fix values', 'تصحيح القيم'], 'md.edit.help': ['Edits apply to this import only, not to your file. The whole file is checked again.', 'تنطبق التعديلات على هذا الاستيراد فقط وليس على ملفك. يُعاد فحص الملف كله.'],
    'md.apply': ['Apply edits', 'تطبيق التعديلات'], 'md.noEdit': ['No value was changed.', 'لم تتغير أي قيمة.'], 'md.edited': ['Edits applied. {id} is now {status}.', 'طُبّقت التعديلات. حالة {id} الآن: {status}.'],
    'md.notInFile': ['Not in the file: keeps the current value', 'غير موجود في الملف: تبقى القيمة الحالية'], 'md.ver': ['Read-only. It detects edits made after the export; use Overwrite instead of changing it.', 'للقراءة فقط. يكشف التعديلات التي تمت بعد التصدير؛ استخدم "استبدال" بدلًا من تغييره.'],
    'md.idWarn': ['Changing the ID makes this row a different item.', 'تغيير المعرّف يجعل هذا الصف عنصرًا مختلفًا.'], 'md.type': ['Type the value', 'اكتب القيمة'], 'md.notset': ['(not set)', '(غير محدد)'],
    'md.hint.rm': ['Remove {hint}', 'إزالة {hint}'], 'md.hint.text': ['Hints as written in the cell, separated by |', 'التلميحات كما في الخلية، مفصولة بـ |'], 'md.hint.add': ['Add a hint', 'إضافة تلميح'], 'md.hint.addBtn': ['Add', 'إضافة'],
    'md.decision': ['Decision', 'القرار'], 'md.open': ['Open {id}', 'فتح {id}'], 'md.gone': ['This meaning is no longer in the preview.', 'لم يعد هذا المعنى موجودًا في المعاينة.'],
    'd.apply': ['Apply', 'تطبيق'], 'd.skip': ['Skip', 'تخطي'], 'd.overwrite': ['Overwrite', 'استبدال'], 'd.needs_resolution': ['Decide', 'بانتظار قرار'], 'd.blocked': ['Blocked', 'متوقف'],
    'dh.apply': ['Write this row to the catalogue.', 'اكتب هذا الصف في الكتالوج.'], 'dh.skip': ['Leave the catalogue as it is for this row.', 'اترك الكتالوج كما هو لهذا الصف.'], 'dh.overwrite': ['Use the spreadsheet values even though this item changed after your export.', 'استخدم قيم الجدول رغم أن هذا العنصر تغيّر بعد تصديرك.'], 'dh.needs_resolution': ['Not decided yet. Commit stays off until you choose.', 'لم يُتخذ قرار بعد. يبقى الاعتماد معطّلًا حتى تختار.'], 'dh.blocked': ['Cannot be written as it is. Fix the values or skip the row.', 'لا يمكن كتابته كما هو. صحّح القيم أو تخطَّ الصف.'],
    // commit + result + history
    'cf.t': ['Commit this import?', 'اعتماد هذا الاستيراد؟'], 'cf.b': ['BINA writes these rows in one step. If any part fails, nothing is changed. The server checks everything again.', 'تكتب BINA هذه الصفوف دفعة واحدة. إذا فشل أي جزء فلن يتغير شيء. ويعيد الخادم فحص كل شيء.'],
    'cf.new': ['New', 'جديد'], 'cf.upd': ['Updated', 'محدّث'], 'cf.ow': ['Overwrite stale rows', 'استبدال صفوف قديمة'], 'cf.skip': ['Skipped', 'متخطى'], 'cf.ver': ['Catalogue version', 'إصدار الكتالوج'], 'cf.cancel': ['Cancel', 'إلغاء'], 'cf.ok': ['Commit import', 'اعتماد الاستيراد'],
    'cm.stale': ['The catalogue changed just before the commit. Nothing was written. The preview was rebuilt; check it and commit again.', 'تغيّر الكتالوج قبل الاعتماد مباشرة، فلم يُكتب شيء. أُعيد بناء المعاينة؛ راجعها ثم اعتمد مرة أخرى.'],
    'cm.failed': ['The import was not committed and nothing changed: {msg}', 'لم يُعتمد الاستيراد ولم يتغير شيء: {msg}'], 'cm.toast': ['Import committed. Catalogue version {v}.', 'تم اعتماد الاستيراد. إصدار الكتالوج {v}.'], 'cm.busy': ['Committing', 'جارٍ الاعتماد'],
    'res.t': ['Import committed', 'تم اعتماد الاستيراد'], 'res.ver': ['Catalogue version', 'إصدار الكتالوج'], 'res.created': ['Created', 'أُنشئ'], 'res.updated': ['Updated', 'حُدّث'], 'res.skipped': ['Skipped', 'متخطى'], 'res.batch': ['Batch', 'الدفعة'], 'res.file': ['File', 'الملف'],
    'res.new': ['New meanings', 'معانٍ جديدة'], 'res.upd': ['Updated meanings', 'معانٍ محدّثة'], 'res.open': ['Open {id}', 'فتح {id}'], 'res.audit': ['View in audit log', 'عرض في سجل التدقيق'], 'res.review': ['Open review queue', 'فتح قائمة المراجعة'], 'res.again': ['Import another file', 'استيراد ملف آخر'],
    'res.note': ['New meanings and new profiles still need review before customers can use them.', 'تحتاج المعاني والملفات الجديدة إلى مراجعة قبل أن يستخدمها العملاء.'], 'res.lc': ['lifecycle: {lc}', 'دورة الحياة: {lc}'],
    'h.t': ['Import history', 'سجل الاستيراد'], 'h.empty': ['No imports yet.', 'لا توجد عمليات استيراد بعد.'], 'h.when': ['When', 'الوقت'], 'h.who': ['By', 'بواسطة'], 'h.file': ['File', 'الملف'], 'h.created': ['Created', 'أُنشئ'], 'h.updated': ['Updated', 'حُدّث'], 'h.items': ['Changed items', 'العناصر المتغيرة'], 'h.audit': ['Open audit log', 'فتح سجل التدقيق'],
    'more': ['+{n} more', '+{n} أخرى'],

    // media
    'm.t': ['Bulk media upload', 'رفع الوسائط دفعة واحدة'],
    'm.s': ['Drop many audio and avatar files at once. Each file is mapped to a meaning and role by its name, and you confirm before anything is uploaded.', 'أفلت عدة ملفات صوت وأفاتار معًا. يُربط كل ملف بمعنى ودور حسب اسمه، وتؤكد أنت قبل رفع أي شيء.'],
    'm.rule': ['New files never replace live files directly. Each file becomes a pending version; the current file keeps serving customers until a reviewer approves the new one in Review. Nothing is approved automatically.', 'الملفات الجديدة لا تستبدل الملفات الحالية مباشرة. يصبح كل ملف إصدارًا بانتظار المراجعة، ويستمر الملف الحالي في خدمة العملاء حتى يوافق مراجع على الجديد في قائمة المراجعة. لا يُعتمد شيء تلقائيًا.'],
    'm.naming': ['Name files like this', 'سمِّ الملفات هكذا'], 'm.order': ['Matching order', 'ترتيب المطابقة'],
    'm.orderList': ['Asset ID in the file name, for example AUD_SALAM_AR_001.mp3|Same file name as a current asset|Meaning ID plus suffix: _ar-SA, _en or _avatar|A close spelling of a Meaning ID is only suggested, never applied for you', 'معرّف الملف في الاسم، مثل AUD_SALAM_AR_001.mp3|اسم مطابق لاسم ملف حالي|معرّف المعنى مع لاحقة: _ar-SA أو _en أو _avatar|التهجئة القريبة من معرّف معنى تُقترح فقط ولا تُطبَّق تلقائيًا'],
    'm.noPct': ['Every match says how it was found. No confidence scores, and file names are matched by fixed rules, not by OpenAI.', 'كل مطابقة توضح كيف وُجدت. لا نسب ثقة، وتُطابق أسماء الملفات بقواعد ثابتة وليس عبر OpenAI.'],
    'm.drop': ['Drop audio and avatar video files here', 'أفلت ملفات الصوت وفيديو الأفاتار هنا'], 'm.choose': ['Choose files', 'اختر ملفات'],
    'm.limits': ['Audio: {aext}, up to {amb} MB and {as} s. Avatar video: {vext}, up to {vmb} MB and {vs} s.', 'الصوت: {aext} حتى {amb} ميغابايت و{as} ث. فيديو الأفاتار: {vext} حتى {vmb} ميغابايت و{vs} ث.'],
    'm.th.file': ['File', 'الملف'], 'm.th.match': ['Match', 'المطابقة'], 'm.th.target': ['Target', 'الهدف'], 'm.th.how': ['How it was matched', 'طريقة المطابقة'], 'm.th.checks': ['Checks', 'الفحص'], 'm.th.up': ['Upload', 'الرفع'],
    'ms.exact': ['Exact', 'مطابق'], 'ms.suggested': ['Suggested', 'مقترح'], 'ms.missing': ['Missing', 'مفقود'], 'ms.conflict': ['Conflict', 'تعارض'], 'ms.invalid': ['Invalid', 'غير صالح'], 'ms.uploaded': ['Uploaded', 'تم الرفع'],
    'm.via.asset_id': ['Asset ID {asset} in the file name.', 'معرّف الملف {asset} موجود في الاسم.'], 'm.via.filename': ['Same file name as the current asset {asset}.', 'الاسم مطابق للملف الحالي {asset}.'], 'm.via.convention': ['Meaning ID and suffix in the file name.', 'معرّف المعنى واللاحقة موجودان في اسم الملف.'],
    'm.via.fuzzy': ['No meaning is called {name}. The closest ID is {id}. Check it before you accept.', 'لا يوجد معنى باسم {name}. أقرب معرّف هو {id}. تحقق منه قبل القبول.'],
    'm.r.UNSUPPORTED_FILE_TYPE': ['Not an audio or video file. Allowed: {ext}.', 'ليس ملف صوت أو فيديو. المسموح: {ext}.'], 'm.r.AVATAR_MUST_BE_VIDEO': ['Named as an avatar clip, but it is not a video file.', 'سُمّي كمقطع أفاتار لكنه ليس ملف فيديو.'], 'm.r.AUDIO_MUST_BE_AUDIO': ['Named as audio, but it is not an audio file.', 'سُمّي كملف صوتي لكنه ليس ملفًا صوتيًا.'],
    'm.r.UNKNOWN_MEANING': ['No meaning has the ID {id}. Create it first, or pick a meaning.', 'لا يوجد معنى بالمعرّف {id}. أنشئه أولًا أو اختر معنى.'], 'm.r.UNKNOWN_SUFFIX': ['The suffix _{sfx} is not recognised. Use _ar-SA, _en or _avatar, or pick the target.', 'اللاحقة _{sfx} غير معروفة. استخدم _ar-SA أو _en أو _avatar، أو اختر الهدف.'],
    'm.r.NAME_NOT_RECOGNISED': ['The name does not follow MEANING_ar-SA, MEANING_en or MEANING_avatar. Pick the target.', 'الاسم لا يتبع النمط MEANING_ar-SA أو MEANING_en أو MEANING_avatar. اختر الهدف.'], 'm.r.SAME_TARGET': ['Another file targets the same meaning and role: {file}. Keep one.', 'ملف آخر يستهدف المعنى والدور نفسيهما: {file}. أبقِ واحدًا.'], 'm.r.NO_OWNER': ['Asset {asset} is not linked to a meaning. Pick the target.', 'الملف {asset} غير مرتبط بمعنى. اختر الهدف.'],
    'm.manual': ['Set by you', 'حدّدته أنت'], 'm.accept': ['Use {id}', 'استخدام {id}'], 'm.meaning': ['Meaning ID', 'معرّف المعنى'], 'm.pickRole': ['Choose a role', 'اختر دورًا'],
    'm.meaningFor': ['Target meaning for {file}', 'المعنى المستهدف للملف {file}'], 'm.roleFor': ['Role for {file}', 'الدور للملف {file}'], 'm.upFor': ['Upload {file}', 'رفع {file}'], 'm.rmFor': ['Remove {file} from the list', 'إزالة {file} من القائمة'],
    'm.unknownId': ['{id} is not a Meaning ID in the catalogue.', '{id} ليس معرّف معنى في الكتالوج.'], 'm.checking': ['Checking', 'جارٍ الفحص'], 'm.ok': ['OK, {dur}', 'سليم، {dur}'], 'm.okNoDur': ['OK', 'سليم'],
    'm.notDecodable': ['This browser cannot play this format, so the file cannot be checked or uploaded here. Upload it from a browser that plays it (for MP4 video: Chrome, Edge or Safari).', 'هذا المتصفح لا يشغّل هذه الصيغة، فلا يمكن فحص الملف أو رفعه هنا. ارفعه من متصفح يشغّلها (لفيديو MP4: Chrome أو Edge أو Safari).'],
    'm.replaces': ['Replaces {asset} only after approval.', 'يحل محل {asset} بعد الموافقة فقط.'], 'm.first': ['First file for this role.', 'أول ملف لهذا الدور.'],
    'm.upload': ['Upload {n} as new versions', 'رفع {n} كإصدارات جديدة'], 'm.clear': ['Clear list', 'مسح القائمة'], 'm.uploading': ['Uploading {i} of {n}', 'جارٍ رفع {i} من {n}'],
    'm.uploaded': ['Uploaded as {asset}, pending review.', 'رُفع باسم {asset}، بانتظار المراجعة.'], 'm.failed': ['Not uploaded: {msg}', 'لم يُرفع: {msg}'],
    'm.done': ['New versions waiting for review: {n}. The live files keep serving until a reviewer approves them.', 'إصدارات جديدة بانتظار المراجعة: {n}. تستمر الملفات الحالية في العمل حتى يوافق عليها مراجع.'], 'm.review': ['Open review queue', 'فتح قائمة المراجعة'],
    'm.why.none': ['Choose at least one file to upload.', 'اختر ملفًا واحدًا على الأقل للرفع.'], 'm.why.conflict': ['Two files target the same meaning and role. Keep one.', 'ملفان يستهدفان المعنى والدور نفسيهما. أبقِ واحدًا.'], 'm.why.checking': ['Wait for the checks to finish.', 'انتظر حتى ينتهي الفحص.'],
    'm.files': ['Files: {n}', 'الملفات: {n}'], 'm.ready': ['Ready to upload: {n}', 'جاهز للرفع: {n}'], 'm.toast': ['{n} files uploaded as pending versions.', 'رُفعت الملفات كإصدارات بانتظار المراجعة: {n}.'],
    'role.FLOW1_AR_AUDIO': ['Flow 1, Arabic audio', 'التدفق 1، الصوت العربي'], 'role.FLOW1_EN_AUDIO': ['Flow 1, English audio', 'التدفق 1، الصوت الإنجليزي'], 'role.FLOW2_AVATAR': ['Flow 2, avatar clip', 'التدفق 2، مقطع الأفاتار'],
    'unit.s': ['{n} s', '{n} ث']
  };

  /** Plain-language explanation for every issue code the shared core can produce. */
  var ISSUE = {
    FORMULA_NOT_ALLOWED: ['The {field} cell contains a formula. BINA accepts typed values only and never runs formulas. Type the value itself, or skip this row.', 'خلية {field} تحتوي على صيغة. تقبل BINA القيم المكتوبة فقط ولا تنفّذ الصيغ أبدًا. اكتب القيمة نفسها أو تخطَّ هذا الصف.'],
    CELL_ERROR: ['The {field} cell shows a spreadsheet error ({value}). Replace it with a plain value.', 'خلية {field} تعرض خطأ جدول ({value}). استبدله بقيمة عادية.'],
    INVALID_BOOLEAN: ['{field} must be TRUE or FALSE (نعم and لا also work). Found: {value}.', 'يجب أن تكون {field} إما TRUE أو FALSE (أو نعم ولا). الموجود: {value}.'],
    INVALID_NUMBER: ['{field} must be a whole number. Found: {value}.', 'يجب أن يكون {field} عددًا صحيحًا. الموجود: {value}.'],
    MISSING_KEY: ['The {field} cell is empty. Without an ID BINA cannot tell which item this row is.', 'خلية {field} فارغة. بدون معرّف لا تعرف BINA أي عنصر يقصده هذا الصف.'],
    INVALID_ID: ['{value} is not a valid ID. Meaning IDs use capital letters, digits and _ and start with a letter, for example SALAM or THANK_YOU. Asset IDs look like AUD_SALAM_AR_001 or AVA_SALAM_001.', '{value} ليس معرّفًا صالحًا. تستخدم معرّفات المعاني الحروف الإنجليزية الكبيرة والأرقام و _ وتبدأ بحرف، مثل SALAM أو THANK_YOU. ومعرّفات الملفات مثل AUD_SALAM_AR_001 أو AVA_SALAM_001.'],
    DUPLICATE_MEANING_ID: ['This Meaning ID also appears on row {other_row} of the same sheet. Keep one row per meaning: delete or merge the other row.', 'معرّف المعنى هذا موجود أيضًا في الصف {other_row} من الورقة نفسها. أبقِ صفًا واحدًا لكل معنى: احذف الصف الآخر أو ادمجه.'],
    DUPLICATE_ASSET_ID: ['This Asset ID also appears on row {other_row}. Each file needs its own ID.', 'معرّف الملف هذا موجود أيضًا في الصف {other_row}. لكل ملف معرّف خاص به.'],
    REQUIRED: ['{field} is required.', '{field} مطلوب.'],
    INVALID_ENUM: ['{value} is not an allowed value for {field}. Allowed: {allowed}.', '{value} ليست قيمة مسموحة لـ {field}. المسموح: {allowed}.'],
    DISABLES_MEANING: ['This turns the meaning off. It disappears from both flows for customers until it is enabled again.', 'هذا يوقف المعنى، فيختفي من التدفقين لدى العملاء حتى يُفعَّل من جديد.'],
    UNKNOWN_CORE_MEANING: ['{key} is not in Core_Meanings, neither in the catalogue nor in this file. Add the meaning to Core_Meanings first.', '{key} غير موجود في Core_Meanings، لا في الكتالوج ولا في هذا الملف. أضف المعنى إلى Core_Meanings أولًا.'],
    INVALID_CV_CLASS: ['The CV class may use letters, digits, _ . and - only.', 'فئة الرؤية تقبل الحروف والأرقام و _ و . و - فقط.'],
    MISSING_AR_AUDIO: ['No Arabic audio is linked. Flow 1 shows the Arabic text without sound until a file is linked.', 'لا يوجد صوت عربي مرتبط. يعرض التدفق 1 النص العربي بدون صوت حتى يُربط ملف.'],
    MISSING_EN_AUDIO: ['No English audio is linked. Flow 1 shows the English text without sound until a file is linked.', 'لا يوجد صوت إنجليزي مرتبط. يعرض التدفق 1 النص الإنجليزي بدون صوت حتى يُربط ملف.'],
    UNKNOWN_ASSET: ['Asset {value} is not in the catalogue or in the Assets sheet. Check the ID, or clear it and give the file name instead.', 'الملف {value} غير موجود في الكتالوج ولا في ورقة Assets. تحقق من المعرّف، أو امسحه واكتب اسم الملف بدلًا منه.'],
    WRONG_ASSET_TYPE: ['{value} is the wrong kind of file for {field}. Audio fields need audio assets and the avatar field needs an avatar video.', 'الملف {value} من نوع غير مناسب لـ {field}. حقول الصوت تحتاج ملفات صوتية وحقل الأفاتار يحتاج فيديو أفاتار.'],
    WRONG_LANGUAGE: ['{value} is audio in the other language. Arabic audio must be an ar asset and English audio an en asset.', 'الملف {value} صوت باللغة الأخرى. الصوت العربي يجب أن يكون ملف ar والإنجليزي ملف en.'],
    FILENAME_MISMATCH: ['The file name {value} does not match the file of this asset, {expected}. BINA keeps the Asset ID, so check that the name is right.', 'اسم الملف {value} لا يطابق ملف هذا المعرّف {expected}. تعتمد BINA معرّف الملف، فتحقق من صحة الاسم.'],
    CV_CLASS_COLLISION: ['CV class {value} is also used by {other}. One recognised sign can only mean one thing. Change one of them.', 'فئة الرؤية {value} مستخدمة أيضًا في {other}. الإشارة الواحدة لا يمكن أن تعني شيئين. غيّر إحداهما.'],
    MISSING_AVATAR: ['No avatar clip is linked. Flow 2 stays blocked for this meaning until a verified clip is uploaded and approved.', 'لا يوجد مقطع أفاتار مرتبط. يبقى التدفق 2 متوقفًا لهذا المعنى حتى يُرفع مقطع موثّق ويُعتمد.'],
    AVATAR_LINKED_TO_OTHER_MEANING: ['Avatar {value} is already the clip for {other}. One clip cannot sign two meanings.', 'الأفاتار {value} هو مقطع {other} أصلًا. لا يمكن لمقطع واحد أن يمثّل معنيين.'],
    RIGHTS_CONFLICT: ['Rights are restricted but the profile is enabled. Disable the profile or clear the rights first.', 'الحقوق مقيّدة بينما الملف مفعّل. عطّل الملف أو امنح الحقوق أولًا.'],
    ALIAS_COLLISION: ['The phrase "{value}" already points to {other}. If two meanings shared it, BINA could not tell which sign to show. Remove it from one of them.', 'العبارة "{value}" مرتبطة مسبقًا بـ {other}. لو اشترك فيها معنيان لما عرفت BINA أي إشارة تعرض. احذفها من أحدهما.'],
    HINT_TOO_LONG: ['A hint is longer than {max} characters. Keep hints short, the way people say them.', 'أحد التلميحات أطول من {max} حرفًا. اجعل التلميحات قصيرة كما يقولها الناس.'],
    WRONG_FILE_TYPE: ['The file name does not fit the asset type: audio needs {aext} and avatar video needs {vext}.', 'اسم الملف لا يناسب نوعه: الصوت يحتاج {aext} وفيديو الأفاتار يحتاج {vext}.'],
    UNSAFE_NAME: ['File names cannot contain folders or "..".', 'لا يجوز أن يحتوي اسم الملف على مجلدات أو "..".'],
    ASSET_TYPE_CHANGED: ['This asset is {current} in the catalogue and {value} in the file. The type of an existing asset cannot change. Add a new asset instead.', 'هذا الملف من نوع {current} في الكتالوج ومن نوع {value} في ملفك. لا يمكن تغيير نوع ملف موجود؛ أضف ملفًا جديدًا بدلًا من ذلك.'],
    FILE_NOT_UPLOADED: ['The file {value} is named here but BINA does not have it yet. Upload it under Bulk media upload; until then this link stays empty.', 'الملف {value} مذكور هنا لكنه غير موجود لدى BINA بعد. ارفعه من "رفع الوسائط دفعة واحدة"؛ وحتى ذلك الحين يبقى هذا الرابط فارغًا.'],
    FILE_NOT_UPLOADED_ASSET: ['File record {key} is new. Its file {value} is not uploaded yet, so it is listed as missing until you upload it.', 'سجل الملف {key} جديد. لم يُرفع ملفه {value} بعد، لذا يُدرج كمفقود حتى ترفعه.'],
    STALE_VERSION: ['Someone changed this item after your file was exported: your file has version {value}, the catalogue has version {current}. Skip to keep the catalogue, or overwrite to keep your spreadsheet values.', 'غيّر أحدهم هذا العنصر بعد تصدير ملفك: في ملفك الإصدار {value} وفي الكتالوج الإصدار {current}. تخطَّه للإبقاء على الكتالوج، أو استبدل للإبقاء على قيم جدولك.'],
    _: ['Issue {code}.', 'ملاحظة {code}.']
  };
  /** Short labels used in the per-meaning summary cells. */
  var SHORT = {
    ALIAS_COLLISION: ['"{value}" is used by {other}', '"{value}" مستخدمة في {other}'], STALE_VERSION: ['Changed after export', 'تغيّر بعد التصدير'], DUPLICATE_MEANING_ID: ['Duplicate row', 'صف مكرر'], DUPLICATE_ASSET_ID: ['Duplicate file ID', 'معرّف ملف مكرر'],
    CV_CLASS_COLLISION: ['CV class used by {other}', 'فئة الرؤية مستخدمة في {other}'], AVATAR_LINKED_TO_OTHER_MEANING: ['Avatar used by {other}', 'الأفاتار مستخدم في {other}'], RIGHTS_CONFLICT: ['Rights restricted', 'الحقوق مقيّدة'], ASSET_TYPE_CHANGED: ['File type changed', 'تغيّر نوع الملف'],
    FORMULA_NOT_ALLOWED: ['Formula in {field}', 'صيغة في {field}'], CELL_ERROR: ['Spreadsheet error in {field}', 'خطأ جدول في {field}'], INVALID_BOOLEAN: ['{field} is not TRUE or FALSE', '{field} ليست TRUE أو FALSE'], INVALID_NUMBER: ['{field} is not a number', '{field} ليس رقمًا'],
    MISSING_KEY: ['No ID', 'بلا معرّف'], INVALID_ID: ['Invalid ID', 'معرّف غير صالح'], REQUIRED: ['{field} is empty', '{field} فارغ'], INVALID_ENUM: ['Invalid {field}', '{field} غير صالح'], UNKNOWN_CORE_MEANING: ['Meaning not found', 'المعنى غير موجود'], INVALID_CV_CLASS: ['Invalid CV class', 'فئة رؤية غير صالحة'],
    UNKNOWN_ASSET: ['Unknown file {value}', 'ملف غير معروف {value}'], WRONG_ASSET_TYPE: ['Wrong kind of file', 'نوع ملف غير مناسب'], WRONG_LANGUAGE: ['Audio in the other language', 'صوت باللغة الأخرى'], HINT_TOO_LONG: ['Hint too long', 'تلميح طويل'], WRONG_FILE_TYPE: ['File name does not fit the type', 'اسم الملف لا يناسب النوع'], UNSAFE_NAME: ['Unsafe file name', 'اسم ملف غير آمن'],
    MISSING_AVATAR: ['No avatar', 'بلا أفاتار'], MISSING_AR_AUDIO: ['No Arabic audio', 'بلا صوت عربي'], MISSING_EN_AUDIO: ['No English audio', 'بلا صوت إنجليزي'], FILE_NOT_UPLOADED: ['File not uploaded yet', 'الملف لم يُرفع بعد'], FILENAME_MISMATCH: ['File name differs', 'اسم الملف مختلف'], DISABLES_MEANING: ['Turns the meaning off', 'يوقف المعنى'],
    _: ['{code}', '{code}']
  };

  // =====================================================================================================
  // State kept across mounts (a language switch or route change restores the work in progress)
  // =====================================================================================================
  var mem = { tab: null, xv: { preset: 'overview', q: '', cat: '', life: '', f1: '', f2: '', cur: { r: 0, c: 0 }, anchor: null, edit: null, err: null, scroll: 0 }, exp: { busy: null, msg: null }, imp: null, med: null };
  var view = null;
  var perf = root.__binaPerf = root.__binaPerf || {};

  // =====================================================================================================
  // Helpers
  // =====================================================================================================
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lang() { return view && view.lang === 'ar' ? 'ar' : 'en'; }
  function li() { return lang() === 'ar' ? 1 : 0; }
  function raw(key) { var e = L[key]; return e ? e[li()] : key; }
  function fill(s, vars) { return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] === undefined || vars[k] === null ? m : String(vars[k]); }) : s; }
  function t(key, vars) { return fill(raw(key), vars); }
  /** HTML-safe text; each var is escaped and bidi-isolated; a var given as {html:'...'} is inserted as is. */
  function th(key, vars, tpl) {
    var s = esc(tpl !== undefined ? tpl : raw(key));
    if (!vars) return s;
    return '<span>' + s.replace(/\{(\w+)\}/g, function (m, k) {
      var v = vars[k];
      if (v === undefined || v === null) return m;
      if (typeof v === 'object' && v.html !== undefined) return v.html;
      return '<bdi>' + esc(v) + '</bdi>';
    }) + '</span>';
  }
  function icon(name) { return I && I.svg ? I.svg(name) : ''; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString(lang() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso); } }
  function fmtBytes(b) { b = Number(b) || 0; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
  function fmtSec(ms) { return t('unit.s', { n: ((Number(ms) || 0) / 1000).toFixed(1) }); }
  function st() { return (R && R.state()) || null; }
  function ver(s) { return (s && s.meta && s.meta.catalogue_version) || 0; }
  function actor() { return (view && view.ctx && view.ctx.actor) || 'admin'; }
  function toast(msg, kind) { try { if (view && typeof view.ctx.toast === 'function') view.ctx.toast(msg, kind || 'ok'); } catch (e) { /* shell toast failed */ } }
  function q(sel) { return view ? view.root.querySelector(sel) : null; }
  function qa(sel) { return view ? Array.prototype.slice.call(view.root.querySelectorAll(sel)) : []; }
  function now() { return root.performance && performance.now ? performance.now() : Date.now(); }
  function later(fn, ms) { var v = view; var id = setTimeout(function () { if (v) v.timers = v.timers.filter(function (x) { return x !== id; }); fn(); }, ms || 0); if (v) v.timers.push(id); return id; }
  function announce(msg) { var el = q('#xcms-live'); if (!el) return; el.textContent = ''; later(function () { if (el.isConnected) el.textContent = msg; }, 40); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function errText(e) {
    if (!e) return '';
    if (e.details && e.details.fields && e.details.fields.length) return e.details.fields.map(function (f) { return lang() === 'ar' ? (f.message_ar || f.message) : f.message; }).join(' ');
    return e.message || e.code || String(e);
  }
  function fieldHeader(sheet, field) { var d = C.SHEETS[sheet]; var c = d ? d.columns.filter(function (x) { return x.key === field; })[0] : null; return c ? c.header : field; }
  function fieldLabel(f) { return L['f.' + f] ? t('f.' + f) : f; }
  function allowedValues(field) {
    if (field === 'category') return Object.keys(C.CATEGORIES);
    if (field === 'lifecycle') return C.LIFECYCLE.slice();
    if (field === 'review_status') return C.REVIEW.slice();
    if (field === 'rights_status') return C.RIGHTS.slice();
    if (field === 'asset_type') return C.ASSET_TYPES.slice();
    if (field === 'language') return ['ar', 'en'];
    return null;
  }
  function catLabel(k) { var c = C.CATEGORIES[k]; return c ? c[lang()] : (k || ''); }
  function navLink(hash, html, cls) { return '<a class="' + (cls || 'btn cream sm') + '" href="' + esc(hash) + '" data-nav="' + esc(hash) + '">' + html + '</a>'; }
  function nav(hash) { if (view && typeof view.ctx.navigate === 'function') { view.ctx.navigate(hash); return true; } return false; }
  function openMeaning(id) { if (view && typeof view.ctx.openMeaning === 'function') { view.ctx.openMeaning(id); return true; } return nav('#meaning-' + id); }

  // =====================================================================================================
  // Scoped CSS: only what the Admin baseline lacks (sticky header and first column, grouped header row,
  // cell focus and range, compact cell editor, diff highlights, status variants of .note and .chip).
  // Colours come from the baseline tokens and the baseline badge palette.
  // =====================================================================================================
  var CSS = [
    '.xcms{display:block;min-width:0}',
    '.xcms [hidden]{display:none!important}',
    '.xcms .tw,.xcms .xv-scroll,.xcms .x-db{position:relative}',
    '.xcms .x-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
    '.xcms .x-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
    '.xcms .x-sp{flex:1;min-width:0}',
    '.xcms .ch{flex-wrap:wrap}',
    '.xcms .sub,.xcms .kv dd,.xcms .x-idlist li{overflow-wrap:anywhere}',
    '.xcms .x-stack{display:flex;flex-direction:column;gap:16px;min-width:0}',
    '.xcms .x-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;direction:ltr;unicode-bidi:isolate}',
    '.xcms .x-muted{color:var(--ink2)}',
    '.xcms .note{margin-bottom:12px;min-width:0;overflow-wrap:anywhere}',
    '.xcms .note .x-mono,.xcms .x-sum,.xcms .x-mt .x-mono{word-break:break-all}',
    '.xcms .note.warn{background:#FCEBCD;color:#7A4C05}.xcms .note.err{background:#F8DEDA;color:#8E2B22}.xcms .note.plain{background:var(--chip);color:var(--ink)}',
    '[data-theme=dark] .xcms .note.warn{background:#4E3A12;color:#FFD38A}[data-theme=dark] .xcms .note.err{background:#4E211D;color:var(--dsoft,#FF9B8F)}',
    '.xcms .note .x-sp{min-width:0}',
    '.xcms .note .btn{flex:none}',
    '.xcms .chip.c-green{background:#DDF5E7;color:#13693D}.xcms .chip.c-amber{background:#FCEBCD;color:#7A4C05}.xcms .chip.c-red{background:#F8DEDA;color:#8E2B22}.xcms .chip.c-grey{background:#E5EAE8;color:#40524F}.xcms .chip.c-teal{background:#D2EFED;color:#00605B}',
    '[data-theme=dark] .xcms .chip.c-green{background:#14513A;color:#9BEBC0}[data-theme=dark] .xcms .chip.c-amber{background:#4E3A12;color:#FFD38A}[data-theme=dark] .xcms .chip.c-red{background:#4E211D;color:#FF9B8F}[data-theme=dark] .xcms .chip.c-grey{background:#244947;color:#C5D6D2}[data-theme=dark] .xcms .chip.c-teal{background:#0D5552;color:#9DE8E3}',
    '.xcms .chip .ic{width:16px;height:16px}',
    '.xcms .chip .badge{margin-inline-start:2px}',
    '.xcms .chip[aria-pressed=true]{box-shadow:inset 0 0 0 2px currentColor}',
    // Excel View
    '.xcms .xv-scroll{overflow:auto;max-height:min(70vh,760px);border-radius:22px}',
    '.xcms table.t.xv{border-collapse:separate;border-spacing:0;min-width:100%}',
    '.xcms .xv thead th{position:sticky;top:0;z-index:2;background:var(--card)}',
    '.xcms .xv thead tr.xv-grp th{top:0;text-align:center;font-size:11px;letter-spacing:.08em;color:var(--tealtext);padding:8px 12px}',
    '.xcms .xv thead tr.xv-grp+tr th{top:var(--xv-h1,34px)}',
    '.xcms .xv .xv-gs{border-inline-start:2px solid var(--rule)}',
    '.xcms .xv .xv-first{position:sticky;inset-inline-start:0;z-index:1;background:var(--card);box-shadow:inset -1px 0 0 var(--rule)}',
    '.xcms[dir=rtl] .xv .xv-first{box-shadow:inset 1px 0 0 var(--rule)}',
    '.xcms .xv thead .xv-first{z-index:3}',
    '.xcms .xv tbody tr:hover .xv-first{background:var(--hover)}',
    '.xcms .xv td,.xcms .xv tbody th{white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis;text-align:start;font-weight:inherit}',
    '.xcms .xv tbody th{font-weight:700}',
    '.xcms .xv .xv-cell{outline:0;cursor:default}',
    '.xcms .xv .xv-cell.xv-ed{cursor:cell}',
    '.xcms .xv .xv-cell:focus{box-shadow:inset 0 0 0 2px var(--teal)}',
    '.xcms .xv .xv-cell:focus-visible{box-shadow:inset 0 0 0 3px var(--amber)}',
    '.xcms .xv .xv-cell.xv-sel{background:color-mix(in srgb,var(--teal) 13%,var(--card))}',
    '.xcms .xv .xv-cell.xv-bad{box-shadow:inset 0 0 0 2px var(--danger)}',
    '.xcms .xv .xv-cell[aria-busy=true]{opacity:.6}',
    '.xcms .xv .inp.xv-inp{min-height:34px;border-radius:12px;padding:0 10px;min-width:160px}',
    '.xcms .xv .chip{min-height:30px;padding:0 10px;font-size:12.5px}',
    '.xcms .xv .sw{vertical-align:middle}',
    '.xcms .xv .hint{margin-inline-start:6px}',
    '.xcms .xv a.xv-id{color:var(--tealtext);font-weight:800;text-decoration:none}',
    '.xcms .xv a.xv-id:hover{text-decoration:underline}',
    '.xcms .xv-tools .inp{width:auto;flex:1;min-width:200px;max-width:340px;min-height:38px;border-radius:999px;font-size:13px}',
    // import preview
    '.xcms .x-labels{display:flex;gap:6px;flex-wrap:wrap;margin:-8px 0 16px}',
    '.xcms .x-labels .chip{min-height:28px;font-size:12px;cursor:default}',
    '.xcms details.x-det{border:1px solid var(--rule);border-radius:18px;margin-bottom:12px}',
    '.xcms details.x-det>summary{cursor:pointer;list-style:none;padding:10px 14px;display:flex;align-items:center;gap:10px;font-weight:700;min-height:44px;flex-wrap:wrap}',
    '.xcms details.x-det>summary::-webkit-details-marker{display:none}',
    '.xcms details.x-det[open]>summary .x-chev{transform:rotate(180deg)}',
    '.xcms details.x-det>.x-db{padding:0 14px 14px}',
    '.xcms .x-grp td{vertical-align:top}',
    '.xcms .x-grp .x-sum{display:flex;flex-direction:column;gap:4px;align-items:flex-start;font-size:13px}',
    '.xcms .x-grp .x-warn{color:#7A4C05;font-size:12px;font-weight:600;display:inline-flex;gap:4px;align-items:center}',
    '[data-theme=dark] .xcms .x-grp .x-warn{color:#FFD38A}',
    '.xcms .x-warn .ic,.xcms .x-ok .ic,.xcms .x-bad .ic{width:15px;height:15px}',
    '.xcms .x-ok{color:#13693D;font-weight:700}.xcms .x-bad{color:#8E2B22;font-weight:700}',
    '[data-theme=dark] .xcms .x-ok{color:#9BEBC0}[data-theme=dark] .xcms .x-bad{color:#FF9B8F}',
    '.xcms .bulk{flex-wrap:wrap}',
    '.xcms .bulk .x-why{font-size:12px;opacity:.9;flex-basis:100%}',
    '.xcms .dlg .x-sec{border:1px solid var(--rule);border-radius:18px;padding:14px;margin-bottom:12px}',
    '.xcms .dlg .x-sec h3{margin:0;font-size:15px}',
    '.xcms .x-iss{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:8px}',
    '.xcms .x-iss li{background:var(--chip);border-radius:14px;padding:8px 12px;font-size:13px}',
    '.xcms .x-iss li p{margin:4px 0 0}',
    '.xcms .x-hl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
    '.xcms .x-hl li{border-radius:10px;padding:2px 8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
    '.xcms .x-hl li.add{background:#DDF5E7;color:#13693D;font-weight:700}.xcms .x-hl li.del{background:#F8DEDA;color:#8E2B22}.xcms .x-hl li.del bdi{text-decoration:line-through}',
    '[data-theme=dark] .xcms .x-hl li.add{background:#14513A;color:#9BEBC0}[data-theme=dark] .xcms .x-hl li.del{background:#4E211D;color:#FF9B8F}',
    '.xcms .x-hl li.hit{box-shadow:inset 0 0 0 2px var(--amber)}',
    '.xcms .x-mk{font-weight:800;width:1em;text-align:center;flex:none}',
    '.xcms .x-hchips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}',
    '.xcms .x-hchips .chip{cursor:default;padding-inline-end:4px}',
    '.xcms .x-hchips .chip button{width:32px;height:32px;border-radius:50%;border:0;background:transparent;display:grid;place-items:center;cursor:pointer;color:inherit}',
    '.xcms .x-hchips .chip button:hover{background:var(--hover)}',
    '.xcms .x-decs{display:flex;flex-direction:column;gap:8px}',
    '.xcms .x-decs label{display:flex;gap:10px;align-items:flex-start;border:1.5px solid var(--rule);border-radius:16px;padding:10px 12px;cursor:pointer;min-height:44px}',
    '.xcms .x-decs label:has(input:checked){border-color:var(--teal)}',
    '.xcms .x-decs input{margin-top:3px;accent-color:var(--teal);width:18px;height:18px;flex:none}',
    '.xcms .x-decs small{display:block;color:var(--ink2)}',
    '.xcms .dlg.x-wide{width:min(980px,100%)}',
    '.xcms .confirm .wi.x-okwi{background:var(--teal)}',
    '.xcms .diff b{font-weight:800}',
    '.xcms .x-idlist{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:6px 0 0}',
    '.xcms .x-idlist li{display:inline-flex;align-items:center;gap:6px;background:var(--chip);border-radius:999px;padding:4px 4px 4px 12px}',
    '.xcms[dir=rtl] .x-idlist li{padding:4px 12px 4px 4px}',
    '.xcms .x-player{background:#062B2B;border-radius:22px;overflow:hidden;display:grid;place-items:center;min-height:120px}',
    '.xcms .x-player video{width:100%;max-height:360px;object-fit:contain;background:#062B2B;display:block}',
    '.xcms .x-player audio{width:calc(100% - 24px);margin:16px 12px}',
    '.xcms .x-file:focus-visible+.btn{outline:3px solid var(--amber);outline-offset:2px}',
    '.xcms .drop.over{background:color-mix(in srgb,var(--teal) 14%,transparent)}',
    '.xcms .drop{cursor:default}',
    '.xcms .x-mt .x-target{display:flex;flex-direction:column;gap:6px;min-width:180px}',
    '.xcms .x-mt .x-target .inp{min-height:38px;border-radius:14px}',
    '.xcms .x-mt td{vertical-align:top}',
    '.xcms .x-mt label.x-cbl{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;cursor:pointer}',
    '.xcms .x-mt input[type=checkbox]{width:18px;height:18px;accent-color:var(--teal)}',
    '.xcms .x-spin{animation:xcms-spin 1s linear infinite}',
    '@keyframes xcms-spin{to{transform:rotate(360deg)}}',
    '@media (prefers-reduced-motion:reduce){.xcms .x-spin{animation:none}}',
    '@media (max-width:760px){',
    '.xcms .xv-tools .inp{max-width:none;flex-basis:100%}',
    '.xcms .x-mt thead{display:none}',
    '.xcms .x-mt,.xcms .x-mt tbody,.xcms .x-mt tr,.xcms .x-mt td{display:block;width:100%}',
    '.xcms .x-mt tr{border:1px solid var(--rule);border-radius:16px;margin-bottom:10px;padding:6px 0}',
    '.xcms .x-mt td{border-bottom:0;padding:6px 12px}',
    '.xcms .x-mt td[data-label]::before{content:attr(data-label);display:block;font-size:11.5px;font-weight:700;color:var(--ink2)}',
    '.xcms .bulk{border-radius:22px}',
    '.xcms .bulk .btn{width:100%}',
    '.xcms .dlg .t th:first-child,.xcms .dlg .t td:first-child{white-space:normal}',
    '}'
  ].join('\n');
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // =====================================================================================================
  // Mount / unmount
  // =====================================================================================================
  function tabFrom(ctx) {
    var tb = ctx && ctx.tab;
    if (tb === 'excel' || tb === 'import' || tb === 'media') return tb;
    if (tb === 'export') return 'import';
    var h = String((root.location && root.location.hash) || '');
    if (/^#excel-(import|export)\b|[?&]tab=(import|export)\b/.test(h)) return 'import';
    if (/^#excel-media\b|[?&]tab=media\b/.test(h)) return 'media';
    return mem.tab || 'excel';
  }
  function deps() {
    C = root.BinaCore; R = root.BinaRepo; P = root.BinaProviders; X = root.BinaXlsx; I = root.BinaIcons;
    return !!(C && R && P && X && root.ExcelJS && C.buildImportPreview && R.state);
  }
  function mount(el, ctx) {
    if (view) unmount();
    ctx = ctx || {};
    var lg = ctx.lang === 'en' ? 'en' : 'ar';
    var rootEl = document.createElement('div');
    rootEl.className = 'xcms';
    rootEl.setAttribute('dir', ctx.dir === 'ltr' || ctx.dir === 'rtl' ? ctx.dir : (lg === 'ar' ? 'rtl' : 'ltr'));
    rootEl.setAttribute('lang', lg);
    el.appendChild(rootEl);
    view = { el: el, root: rootEl, ctx: ctx, lang: lg, dir: rootEl.getAttribute('dir'), off: [], timers: [], urls: [], dialog: null, lastFocus: null, ready: false };
    injectCss();
    if (!deps()) { rootEl.innerHTML = '<div class="note err" role="alert">' + icon('error') + th('x.missingDeps') + '</div>'; return; }
    mem.tab = tabFrom(ctx);
    ['click', 'change', 'input', 'submit', 'keydown', 'dblclick', 'copy', 'dragover', 'dragenter', 'dragleave', 'drop', 'scroll'].forEach(function (type) {
      on(rootEl, type, function (e) { route(type, e); }, type === 'scroll');
    });
    on(rootEl, 'focusout', function (e) { if (mem.xv.edit && e.target && e.target.id === 'xv-edit') later(function () { if (mem.xv.edit && !mem.xv.edit.saving) xvCommit(null); }, 0); });
    on(document, 'keydown', onDocKey);
    rootEl.innerHTML = '<div id="xcms-main"></div><div id="xcms-overlay"></div><div class="x-sr" id="xcms-live" role="status" aria-live="polite" aria-atomic="true"></div>';
    var v = view;
    var init = R.init ? R.init({ role: 'admin' }) : Promise.resolve();
    if (st()) { view.ready = true; render(); }
    else q('#xcms-main').innerHTML = '<div class="card x-row" role="status">' + icon('loading') + th('x.loading') + '</div>';
    Promise.resolve(init).then(function () {
      if (view !== v) return;
      v.off.push(R.on(onRepo));
      if (!v.ready) { v.ready = true; render(); }
      else if (mem.tab === 'import' && mem.imp && mem.imp.stage === 'preview' && mem.imp.baseFp !== C.catalogueFingerprint(st())) onRepo({ kind: 'external' });
    }, function () { if (view === v) { v.ready = true; render(); } });
  }
  function on(target, type, fn, capture) { target.addEventListener(type, fn, !!capture); view.off.push(function () { target.removeEventListener(type, fn, !!capture); }); }
  function unmount() {
    if (!view) return;
    var v = view;
    v.off.forEach(function (f) { try { f(); } catch (e) { /* already gone */ } });
    v.timers.forEach(function (id) { clearTimeout(id); });
    v.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    if (v.root && v.root.parentNode) v.root.parentNode.removeChild(v.root);
    mem.xv.edit = null;
    view = null;
  }
  function render() {
    if (!view || !view.ready) return;
    if (mem.tab === 'excel') renderXV(true);
    else if (mem.tab === 'import') renderImportPage();
    else renderMediaPage();
    renderOverlay();
  }
  function onRepo(evt) {
    if (!view) return;
    var k = evt && evt.kind;
    if (k !== 'commit' && k !== 'external' && k !== 'reset') return;
    if (mem.tab === 'excel') { if (!mem.xv.edit) renderXV(false); return; }
    var imp = mem.imp;
    if (imp && imp.stage === 'preview' && !imp.committing && imp.baseFp !== C.catalogueFingerprint(st())) {
      var from = imp.baseVersion;
      recompute();
      imp.notice = { from: from, to: imp.baseVersion };
      if (mem.tab === 'import') { renderPreview(); announce(t('pr.changed', imp.notice)); }
    } else if (mem.tab === 'import' && (!imp || imp.stage !== 'preview')) renderImportPage();
    if (mem.med && !mem.med.uploading) { remapMedia(); renderMediaSection(); }
  }

  // ---------------------------------------------------------------- event routing
  function route(type, e) {
    if (type === 'click') return onClick(e);
    if (type === 'change') return onChange(e);
    if (type === 'input') return onInput(e);
    if (type === 'submit') return onSubmit(e);
    if (type === 'keydown') return onKey(e);
    if (type === 'dblclick') { var td = e.target.closest('.xv-cell'); if (td) { e.preventDefault(); xvActivate(+td.getAttribute('data-r'), +td.getAttribute('data-c'), 'dbl'); } return; }
    if (type === 'copy') return xvCopy(e);
    if (type === 'scroll') { if (e.target && e.target.classList && e.target.classList.contains('xv-scroll')) mem.xv.scroll = e.target.scrollTop; return; }
    if (type === 'dragover' || type === 'dragenter') return onDragOver(e);
    if (type === 'dragleave') { var z = e.target.closest && e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); return; }
    if (type === 'drop') return onDrop(e);
  }
  function onClick(e) {
    var a = e.target.closest('[data-nav],[data-meaning]');
    if (a && view.root.contains(a)) {
      if (a.hasAttribute('data-meaning')) { if (openMeaning(a.getAttribute('data-meaning'))) e.preventDefault(); return; }
      if (nav(a.getAttribute('data-nav'))) e.preventDefault();
      return;
    }
    var b = e.target.closest('[data-act]');
    if (b && b.getAttribute('data-act') === 'ov-close' && e.target !== b) b = null;
    if (!b) {
      var td = e.target.closest('.xv-cell');
      if (td) xvClick(e, td);
      return;
    }
    if (b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    var act = b.getAttribute('data-act'), arg = b.getAttribute('data-arg');
    switch (act) {
      case 'xv-preset': mem.xv.preset = arg; mem.xv.cur = { r: 0, c: 0 }; mem.xv.anchor = null; renderXV(true); var pb = q('[data-act="xv-preset"][data-arg="' + arg + '"]'); if (pb) pb.focus(); break;
      case 'xv-media': var td2 = b.closest('.xv-cell'); if (td2) xvMove(+td2.getAttribute('data-r'), +td2.getAttribute('data-c'), false, true); openMediaPreview(arg.split('|')[0], arg.split('|')[1]); break;
      case 'xv-toggle': var td3 = b.closest('.xv-cell'); if (td3) xvActivate(+td3.getAttribute('data-r'), +td3.getAttribute('data-c'), 'click'); break;
      case 'ov-close': case 'dlg-cancel': closeDialog(false); break;
      case 'dlg-ok': closeDialog(true); break;
      case 'exp-xlsx': doExport('xlsx'); break;
      case 'exp-tpl': doExport('tpl'); break;
      case 'exp-csv': doExport('csv', arg); break;
      case 'exp-json': doExport('json'); break;
      case 'imp-pick': var fi = q('#xcms-imp-file'); if (fi) fi.click(); break;
      case 'imp-over': confirmDiscard(); break;
      case 'imp-notice-x': if (mem.imp) { mem.imp.notice = null; renderPreview(); } break;
      case 'chip': setStatusFilter(arg); break;
      case 'bulk': bulk(arg); break;
      case 'open-group': openGroup(arg); break;
      case 'cols-apply': applyColumns(); break;
      case 'cols-reset': resetColumns(); break;
      case 'commit': openCommitDialog(); break;
      case 'hint-rm': removeHint(b.getAttribute('data-form'), arg); break;
      case 'hint-add': addHint(b.getAttribute('data-form')); break;
      case 'res-again': mem.imp = null; renderImportPage(); later(function () { var x = q('[data-act="imp-pick"]'); if (x) x.focus(); }, 0); break;
      case 'm-pick': var mf = q('#xcms-med-file'); if (mf) mf.click(); break;
      case 'm-accept': mediaAccept(arg); break;
      case 'm-rm': mediaRemove(arg); break;
      case 'm-upload': uploadMedia(); break;
      case 'm-clear': mem.med = null; renderMediaSection(); break;
      default: break;
    }
  }
  function onChange(e) {
    var tg = e.target;
    if (tg.id === 'xcms-imp-file') { readImportFiles(tg.files); tg.value = ''; return; }
    if (tg.id === 'xcms-med-file') { addMediaFiles(tg.files); tg.value = ''; return; }
    if (tg.id === 'xv-cat' || tg.id === 'xv-life' || tg.id === 'xv-f1' || tg.id === 'xv-f2') { mem.xv[tg.id.slice(3)] = tg.value; mem.xv.cur = { r: 0, c: mem.xv.cur.c }; mem.xv.anchor = null; renderXVTable(); return; }
    if (tg.hasAttribute('data-decide')) { decide(tg.getAttribute('data-decide'), tg.value); return; }
    if (tg.hasAttribute('data-colmap')) { stageColumn(tg.getAttribute('data-sheet'), tg.getAttribute('data-index'), tg.value); return; }
    if (tg.hasAttribute('data-mtarget')) { mediaTarget(tg.getAttribute('data-mtarget'), tg.value, null); return; }
    if (tg.hasAttribute('data-mrole')) { mediaTarget(tg.getAttribute('data-mrole'), null, tg.value); return; }
    if (tg.hasAttribute('data-minc')) { mediaInclude(tg.getAttribute('data-minc'), tg.checked); return; }
    if (tg.form && tg.form.hasAttribute('data-editform')) tg.setAttribute('data-dirty', '1');
  }
  var searchTimer = null;
  function onInput(e) {
    var tg = e.target;
    if (tg.id === 'xv-q' || tg.id === 'pr-q') {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchTimer = null; if (!view) return;
        if (tg.id === 'xv-q') { mem.xv.q = tg.value; mem.xv.cur = { r: 0, c: mem.xv.cur.c }; mem.xv.anchor = null; renderXVTable(); }
        else if (mem.imp) { mem.imp.filter.q = tg.value; renderGroupsTable(); }
      }, 150);
      return;
    }
    if (tg.form && tg.form.hasAttribute('data-editform')) { tg.setAttribute('data-dirty', '1'); if (tg.name === 'semantic_hints') renderHintChips(tg.form); }
  }
  function onSubmit(e) {
    var f = e.target;
    if (f.hasAttribute('data-editform')) { e.preventDefault(); applyEditForm(f); }
  }
  function onKey(e) {
    if (e.target.id === 'xv-edit') return xvEditKey(e);
    var td = e.target.closest && e.target.closest('.xv-cell');
    if (td) return xvKey(e, td);
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('x-hint-new')) { e.preventDefault(); addHint(e.target.getAttribute('data-form')); }
  }
  function onDocKey(e) {
    if (!view || !view.dialog) return;
    var box = q('#xcms-overlay .dlg'); if (!box) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(false); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),audio[controls],video[controls]'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function onDragOver(e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault();
    var z = e.target.closest && e.target.closest('[data-drop]');
    e.dataTransfer.dropEffect = z ? 'copy' : 'none';
    if (z) z.classList.add('over');
  }
  function onDrop(e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    var z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return;
    z.classList.remove('over');
    if (z.getAttribute('data-drop') === 'import') readImportFiles(e.dataTransfer.files); else addMediaFiles(e.dataTransfer.files);
  }

  // ---------------------------------------------------------------- dialogs (Admin .ov + .dlg pattern)
  function openDialog(html, onClose, focusSel) {
    view.lastFocus = view.dialog ? view.lastFocus : document.activeElement;
    view.dialog = { html: html, onClose: onClose || null };
    renderOverlay();
    var f = (focusSel && q(focusSel)) || q('#xcms-overlay .dlg .x') || q('#xcms-overlay .dlg button');
    if (f) f.focus();
  }
  function closeDialog(ok) {
    if (!view || !view.dialog) return;
    var d = view.dialog; view.dialog = null;
    if (mem.imp) mem.imp.openGroup = null;
    renderOverlay();
    if (view.lastFocus && view.lastFocus.isConnected) view.lastFocus.focus();
    if (d.onClose) d.onClose(!!ok);
  }
  function renderOverlay() {
    var host = q('#xcms-overlay'), main = q('#xcms-main'); if (!host) return;
    if (!view.dialog) { host.innerHTML = ''; if (main) main.inert = false; return; }
    host.innerHTML = '<div class="ov" data-act="ov-close">' + view.dialog.html + '</div>';
    if (main) main.inert = true;
  }
  function dlgHead(id, titleHtml) { return '<div class="dh"><h2 id="' + id + '" tabindex="-1">' + titleHtml + '</h2><button type="button" class="x" data-act="dlg-cancel" aria-label="' + esc(t('close')) + '">' + icon('close') + '</button></div>'; }

  // =====================================================================================================
  // EXCEL VIEW
  // =====================================================================================================
  var XVC = {
    id: { kind: 'id', label: 'xv.c.id', group: 'core' },
    ar: { kind: 'text', label: 'f.canonical_ar', group: 'core', field: 'canonical_ar', target: 'meaning', dir: 'rtl' },
    en: { kind: 'text', label: 'f.canonical_en', group: 'core', field: 'canonical_en', target: 'meaning', dir: 'ltr' },
    cat: { kind: 'enum', label: 'f.category', group: 'core', field: 'category', target: 'meaning' },
    review: { kind: 'review', label: 'xv.c.review', group: 'core' },
    cv: { kind: 'text', label: 'f.cv_class', group: 'flow1', field: 'cv_class', target: 'flow1', dir: 'ltr' },
    aud_ar: { kind: 'media', label: 'xv.c.audAr', group: 'flow1', role: 'FLOW1_AR_AUDIO' },
    aud_en: { kind: 'media', label: 'xv.c.audEn', group: 'flow1', role: 'FLOW1_EN_AUDIO' },
    f1on: { kind: 'toggle', label: 'xv.c.f1on', group: 'flow1', flow: 'flow1' },
    f1: { kind: 'ready', label: 'xv.c.f1', group: 'flow1', flow: 'flow1' },
    hints: { kind: 'hints', label: 'f.semantic_hints', group: 'flow2', field: 'semantic_hints', target: 'flow2', dir: 'auto' },
    avatar: { kind: 'media', label: 'xv.c.avatar', group: 'flow2', role: 'FLOW2_AVATAR' },
    elig: { kind: 'elig', label: 'xv.c.elig', group: 'flow2' },
    f2on: { kind: 'toggle', label: 'xv.c.f2on', group: 'flow2', flow: 'flow2' },
    f2: { kind: 'ready', label: 'xv.c.f2', group: 'flow2', flow: 'flow2' }
  };
  var PRESETS = {
    overview: ['id', 'ar', 'en', 'cat', 'f1', 'f2', 'review'],
    flow1: ['id', 'ar', 'en', 'cv', 'aud_ar', 'aud_en', 'f1on', 'f1'],
    flow2: ['id', 'ar', 'en', 'hints', 'avatar', 'elig', 'f2on', 'f2'],
    all: ['id', 'ar', 'en', 'cat', 'cv', 'aud_ar', 'aud_en', 'f1', 'hints', 'avatar', 'f2']
  };
  function xvCols() {
    var p = PRESETS[mem.xv.preset] ? mem.xv.preset : 'overview';
    return PRESETS[p].map(function (k) { var c = Object.assign({ key: k }, XVC[k]); if (p === 'all' && (k === 'f1' || k === 'f2')) c.label = 'xv.c.status'; if (p === 'all' && k === 'cv') c.label = 'xv.c.cv'; if (p === 'all' && k === 'hints') c.label = 'xv.c.hints'; if (p !== 'overview' && p !== 'all' && k === 'f1') c.label = 'xv.c.f1r'; if (p !== 'overview' && p !== 'all' && k === 'f2') c.label = 'xv.c.f2r'; return c; });
  }
  function editable(col, row) {
    if (col.kind === 'text' || col.kind === 'enum' || col.kind === 'hints') return true;
    if (col.kind === 'toggle') return !!(col.flow === 'flow1' ? row.p1 : row.p2);
    return false;
  }
  function xvAllRows(s) {
    var pend = {}, rq = {};
    (s.assets || []).forEach(function (a) { if (a.lifecycle === 'active' && a.review_status === 'pending' && a.pending_for) pend[a.pending_for.meaning_id + '|' + a.pending_for.role] = a; });
    C.reviewQueue(s).forEach(function (x) { if (x.meaning_id) rq[x.meaning_id] = (rq[x.meaning_id] || 0) + 1; });
    var f1 = {}, f2 = {};
    (s.flow1_profiles || []).forEach(function (p) { f1[p.meaning_id] = p; });
    (s.flow2_profiles || []).forEach(function (p) { f2[p.meaning_id] = p; });
    return (s.meanings || []).map(function (m) {
      var id = m.meaning_id;
      return { id: id, m: m, p1: f1[id] || null, p2: f2[id] || null, r1: C.flow1Readiness(s, id), r2: C.flow2Readiness(s, id), pend: pend, rq: rq[id] || 0, s: s };
    });
  }
  function xvFilter(rows) {
    var f = mem.xv, qn = C.normalizeText(f.q || '');
    return rows.filter(function (r) {
      if (f.cat && r.m.category !== f.cat) return false;
      if (f.life && r.m.lifecycle !== f.life) return false;
      if (f.f1 && r.r1.state !== f.f1) return false;
      if (f.f2 && r.r2.state !== f.f2) return false;
      if (qn) {
        var hay = [r.id, r.m.canonical_ar, r.m.canonical_en, r.p1 && r.p1.cv_class, r.p2 && C.hintsToText(C.parseHintList(r.p2.semantic_hints))].join(' | ');
        if (C.normalizeText(hay).indexOf(qn) < 0 && String(r.id).toLowerCase().indexOf(String(f.q).trim().toLowerCase()) < 0) return false;
      }
      return true;
    });
  }
  function mediaInfo(r, role) {
    var ro = C.ROLES[role], p = ro.flow === 'flow1' ? r.p1 : r.p2;
    var pend = r.pend[r.id + '|' + role] || null;
    if (!p) return { s: 'na', pend: pend };
    var id = p[ro.field];
    if (!id) return { s: 'missing', pend: pend };
    var a = C.assetState(r.s, id);
    return { s: a.usable ? 'ready' : a.reason === 'ASSET_NOT_APPROVED' ? 'review' : 'blocked', asset: C.getAsset(r.s, id), pend: pend };
  }
  function readyInfo(r, flow) {
    var rd = flow === 'flow1' ? r.r1 : r.r2, s = rd.state;
    var label = s === 'ready' && flow === 'flow2' && r.p2 && r.p2.rights_status === 'demo_only' ? 'rd.demo' : 'rd.' + s;
    var cls = s === 'ready' ? 'b-green' : s === 'partial' ? 'b-amber' : s === 'blocked' ? 'b-red' : 'b-grey';
    var why = (rd.reasons || []).filter(function (x) { return s !== 'none'; }).map(function (x) { return L['why.' + x] ? t('why.' + x) : x; });
    return { label: t(label), cls: cls, why: why };
  }
  function cellText(r, col) {
    var m = r.m;
    switch (col.kind) {
      case 'id': return r.id;
      case 'text': return col.target === 'meaning' ? (m[col.field] || '') : ((col.target === 'flow1' ? r.p1 : r.p2) || {})[col.field] || '';
      case 'enum': return m.category || '';
      case 'hints': return r.p2 ? C.hintsToText(C.parseHintList(r.p2.semantic_hints)) : '';
      case 'media': var mi = mediaInfo(r, col.role); return mi.s === 'na' ? t('xv.notSetUp') : t('mc.' + mi.s, { r: t('mc.' + col.role) });
      case 'toggle': var p = col.flow === 'flow1' ? r.p1 : r.p2; return p ? (p.enabled ? 'TRUE' : 'FALSE') : '';
      case 'ready': return readyInfo(r, col.flow).label;
      case 'elig': return r.r2.eligible ? t('yes') : t('no');
      case 'review': return r.rq ? t('rv.pending', { n: r.rq }) : (r.p1 || r.p2 ? t('rv.ok') : t('rv.none'));
      default: return '';
    }
  }
  function cellHtml(r, col, ri) {
    var m = r.m;
    switch (col.kind) {
      case 'id':
        return '<a class="xv-id" href="#meaning-' + esc(r.id) + '" data-meaning="' + esc(r.id) + '" tabindex="-1"><bdi>' + esc(r.id) + '</bdi></a>' + (m.lifecycle !== 'active' ? ' <span class="badge ' + (m.lifecycle === 'draft' ? 'b-amber' : 'b-grey') + '">' + esc(t('lc.' + m.lifecycle)) + '</span>' : '');
      case 'text':
        var v = cellText(r, col);
        if (col.target !== 'meaning' && !(col.target === 'flow1' ? r.p1 : r.p2)) return '<span class="hint">' + th('xv.notSetUp') + '</span>';
        return v ? '<bdi dir="' + col.dir + '">' + esc(v) + '</bdi>' : '<span class="hint">' + th('xv.empty1') + '</span>';
      case 'enum': return esc(catLabel(m.category));
      case 'hints':
        if (!r.p2) return '<span class="hint">' + th('xv.notSetUp') + '</span>';
        var hs = C.parseHintList(r.p2.semantic_hints);
        return hs.length ? '<span class="badge b-grey">' + hs.length + '</span> <bdi dir="auto">' + esc(hs.map(function (h) { return h.text; }).join(' · ')) + '</bdi>' : '<span class="hint">' + th('xv.empty1') + '</span>';
      case 'media':
        var mi = mediaInfo(r, col.role), rl = t('mc.' + col.role);
        if (mi.s === 'na') return '<span class="hint">' + th('xv.notSetUp') + '</span>';
        var ic = col.role === 'FLOW2_AVATAR' ? 'play' : 'speaker';
        var cls = mi.s === 'ready' ? 'c-green' : mi.s === 'review' ? 'c-amber' : mi.s === 'blocked' ? 'c-red' : 'c-grey';
        var label = t('mc.' + mi.s, { r: rl });
        var pend = mi.pend ? ' <span class="badge b-amber">' + th('mc.pending') + '</span>' : '';
        if (mi.s === 'missing' && !mi.pend) return '<span class="chip ' + cls + '">' + icon(ic) + esc(label) + '</span>';
        return '<button type="button" class="chip ' + cls + '" tabindex="-1" data-act="xv-media" data-arg="' + esc(r.id + '|' + col.role) + '" aria-label="' + esc(t('mc.open', { r: t('role.' + col.role), id: r.id }) + ': ' + label) + '">' + icon(ic) + esc(label) + '</button>' + pend;
      case 'toggle':
        var p = col.flow === 'flow1' ? r.p1 : r.p2;
        if (!p) return '<span class="hint">' + th('xv.notSetUp') + '</span>';
        return '<button type="button" class="sw' + (p.enabled ? ' on' : '') + '" role="switch" aria-checked="' + !!p.enabled + '" tabindex="-1" data-act="xv-toggle" aria-label="' + esc(t('xv.toggle', { field: t(col.label), id: r.id })) + '"></button>';
      case 'ready':
        var ri2 = readyInfo(r, col.flow);
        return '<span class="badge ' + ri2.cls + '"' + (ri2.why.length ? ' title="' + esc(ri2.why.join(', ')) + '"' : '') + '>' + esc(ri2.label) + '</span>' + (ri2.why.length && ri2.cls !== 'b-green' ? '<span class="hint">' + esc(ri2.why[0]) + '</span>' : '');
      case 'elig': return r.r2.eligible ? '<span class="badge b-teal">' + th('yes') + '</span>' : '<span class="badge b-grey">' + th('no') + '</span>';
      case 'review': return r.rq ? '<span class="badge b-amber">' + th('rv.pending', { n: r.rq }) + '</span>' : (r.p1 || r.p2 ? '<span class="badge b-green">' + th('rv.ok') + '</span>' : '<span class="hint">' + th('rv.none') + '</span>');
      default: return '';
    }
  }
  function renderXV(full) {
    var main = q('#xcms-main'); if (!main || mem.tab !== 'excel') return;
    if (full || !q('#xv-table-host')) {
      var s = st(), p = mem.xv.preset, f = mem.xv;
      var sel = function (id, label, allLabel, opts, val) {
        return '<label class="x-sr" for="' + id + '">' + esc(t(label)) + '</label><select class="inp" id="' + id + '"><option value="">' + esc(t(allLabel)) + '</option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
      };
      main.innerHTML =
        '<div class="filters xv-tools">' +
          '<div class="seg" role="group" aria-label="' + esc(t('xv.presets')) + '">' + ['overview', 'flow1', 'flow2', 'all'].map(function (k) { return '<button type="button" class="' + (p === k ? 'on' : '') + '" aria-pressed="' + (p === k) + '" data-act="xv-preset" data-arg="' + k + '">' + th('xv.p.' + k) + '</button>'; }).join('') + '</div>' +
          '<label class="x-sr" for="xv-q">' + th('xv.search') + '</label><input class="inp" type="search" id="xv-q" placeholder="' + esc(t('xv.search')) + '" value="' + esc(f.q) + '" autocomplete="off">' +
          sel('xv-cat', 'xv.f.catL', 'xv.f.cat', Object.keys(C.CATEGORIES).map(function (k) { return [k, catLabel(k)]; }), f.cat) +
          sel('xv-life', 'xv.f.lifeL', 'xv.f.life', C.LIFECYCLE.map(function (k) { return [k, t('lc.' + k)]; }), f.life) +
          sel('xv-f1', 'xv.f.f1L', 'xv.f.f1', ['ready', 'partial', 'blocked', 'disabled', 'none'].map(function (k) { return [k, t('rd.' + k)]; }), f.f1) +
          sel('xv-f2', 'xv.f.f2L', 'xv.f.f2', ['ready', 'blocked', 'disabled', 'none'].map(function (k) { return [k, t('rd.' + k)]; }), f.f2) +
          '<span class="badge b-grey">' + esc(R.mode && R.mode() === 'api' ? t('x.mode.api') : t('x.mode.local')) + '</span>' +
          '<span class="hint" id="xv-count" aria-live="polite"></span>' +
        '</div>' +
        '<p class="hint" id="xv-help" style="margin:-6px 0 10px">' + th('xv.help') + '</p>' +
        '<div id="xv-msg"></div>' +
        '<div class="card" style="padding:0" id="xv-table-host"></div>';
      void s;
    }
    renderXVTable();
  }
  function renderXVTable() {
    var host = q('#xv-table-host'); if (!host) return;
    var t0 = now();
    var s = st(), all = xvAllRows(s), rows = xvFilter(all), cols = xvCols();
    view.xvRows = rows; view.xvCols = cols;
    var cur = mem.xv.cur;
    cur.r = Math.max(0, Math.min(cur.r, rows.length - 1)); cur.c = Math.max(0, Math.min(cur.c, cols.length - 1));
    var hadFocus = document.activeElement && host.contains(document.activeElement);
    host.innerHTML = '<div class="xv-scroll" id="xv-scroll">' + xvTableHtml(rows, cols) + '</div>';
    var sc = q('#xv-scroll'); if (sc && mem.xv.scroll) sc.scrollTop = mem.xv.scroll;
    var grp = host.querySelector('tr.xv-grp'); if (grp) host.style.setProperty('--xv-h1', grp.getBoundingClientRect().height + 'px');
    xvPaintSel();
    var cnt = q('#xv-count'); if (cnt) cnt.textContent = t('xv.shown', { n: rows.length, total: all.length });
    xvRenderMsg();
    if (hadFocus) xvFocus(cur.r, cur.c);
    perf.excel_view_render = { rows: rows.length, cols: cols.length, ms: Math.round((now() - t0) * 10) / 10, preset: mem.xv.preset };
  }
  function xvTableHtml(rows, cols) {
    var p = mem.xv.preset, cur = mem.xv.cur, hdr = p === 'all' ? 2 : 1;
    var grpRow = '';
    if (p === 'all') {
      var spans = [], last = null;
      cols.forEach(function (c) { if (c.group !== last) { spans.push({ g: c.group, n: 1 }); last = c.group; } else spans[spans.length - 1].n++; });
      grpRow = '<tr class="xv-grp" aria-rowindex="1">' + spans.map(function (s, i) { return '<th scope="colgroup" colspan="' + s.n + '" class="' + (i === 0 ? 'xv-first' : 'xv-gs') + '">' + th('xv.g.' + s.g) + '</th>'; }).join('') + '</tr>';
    }
    var head = '<tr aria-rowindex="' + hdr + '">' + cols.map(function (c, ci) { return '<th scope="col" class="' + (ci === 0 ? 'xv-first' : '') + (p === 'all' && ci > 0 && cols[ci - 1].group !== c.group ? ' xv-gs' : '') + '">' + th(c.label) + '</th>'; }).join('') + '</tr>';
    var body = rows.length ? rows.map(function (r, ri) {
      return '<tr aria-rowindex="' + (ri + hdr + 1) + '" data-id="' + esc(r.id) + '">' + cols.map(function (c, ci) {
        var tag = ci === 0 ? 'th' : 'td';
        var ed = editable(c, r);
        var bad = mem.xv.err && mem.xv.err.id === r.id && mem.xv.err.col === c.key;
        return '<' + tag + (ci === 0 ? ' scope="row"' : '') + ' role="' + (ci === 0 ? 'rowheader' : 'gridcell') + '" class="xv-cell' + (ci === 0 ? ' xv-first' : '') + (ed ? ' xv-ed' : '') + (bad ? ' xv-bad' : '') + (p === 'all' && ci > 0 && cols[ci - 1].group !== c.group ? ' xv-gs' : '') + '" data-r="' + ri + '" data-c="' + ci + '" data-col="' + c.key + '" tabindex="' + (ri === cur.r && ci === cur.c ? '0' : '-1') + '"' + (c.kind === 'text' || c.kind === 'hints' ? ' title="' + esc(cellText(r, c)) + '"' : '') + '>' + cellHtml(r, c, ri) + '</' + tag + '>';
      }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + cols.length + '"><div class="empty"><p>' + th('xv.empty') + '</p></div></td></tr>';
    return '<table class="t xv" role="grid" aria-label="' + esc(t('xv.grid')) + '" aria-rowcount="' + (rows.length + hdr) + '" aria-colcount="' + cols.length + '" aria-multiselectable="true" aria-describedby="xv-help"><thead>' + grpRow + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function xvRenderMsg() {
    var el = q('#xv-msg'); if (!el) return;
    var e = mem.xv.err;
    el.innerHTML = e ? '<div class="note err" role="alert">' + icon('error') + '<span class="x-sp">' + esc(e.text) + '</span></div>' : '';
  }
  function xvCellEl(r, c) { return q('#xv-scroll .xv-cell[data-r="' + r + '"][data-c="' + c + '"]'); }
  function xvFocus(r, c) {
    var el = xvCellEl(r, c); if (!el) return;
    qa('#xv-scroll .xv-cell[tabindex="0"]').forEach(function (x) { if (x !== el) x.setAttribute('tabindex', '-1'); });
    el.setAttribute('tabindex', '0');
    el.focus({ preventScroll: false });
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function xvPaintSel() {
    qa('#xv-scroll .xv-sel').forEach(function (x) { x.classList.remove('xv-sel'); x.removeAttribute('aria-selected'); });
    var a = mem.xv.anchor, c = mem.xv.cur; if (!a) return;
    var r0 = Math.min(a.r, c.r), r1 = Math.max(a.r, c.r), c0 = Math.min(a.c, c.c), c1 = Math.max(a.c, c.c);
    for (var r = r0; r <= r1; r++) for (var k = c0; k <= c1; k++) { var el = xvCellEl(r, k); if (el) { el.classList.add('xv-sel'); el.setAttribute('aria-selected', 'true'); } }
  }
  function xvMove(r, c, extend, noFocus) {
    var rows = view.xvRows || [], cols = view.xvCols || [];
    if (!rows.length) return;
    r = Math.max(0, Math.min(r, rows.length - 1)); c = Math.max(0, Math.min(c, cols.length - 1));
    if (extend) { if (!mem.xv.anchor) mem.xv.anchor = { r: mem.xv.cur.r, c: mem.xv.cur.c }; }
    else mem.xv.anchor = null;
    mem.xv.cur = { r: r, c: c };
    xvPaintSel();
    if (!noFocus) xvFocus(r, c);
  }
  function xvClick(e, td) {
    var r = +td.getAttribute('data-r'), c = +td.getAttribute('data-c');
    if (mem.xv.edit) { if (mem.xv.edit.r === r && mem.xv.edit.c === c) return; xvCommit(null); }
    xvMove(r, c, e.shiftKey);
  }
  function xvKey(e, td) {
    var r = +td.getAttribute('data-r'), c = +td.getAttribute('data-c');
    var rtl = view.dir === 'rtl', nr = r, nc = c, cols = view.xvCols || [], rows = view.xvRows || [];
    var k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'C')) return; // native copy event handles it
    if ((e.ctrlKey || e.metaKey) && (k === 'a' || k === 'A')) { e.preventDefault(); mem.xv.anchor = { r: 0, c: 0 }; mem.xv.cur = { r: rows.length - 1, c: cols.length - 1 }; xvPaintSel(); xvFocus(mem.xv.cur.r, mem.xv.cur.c); return; }
    switch (k) {
      case 'ArrowDown': nr = r + 1; break;
      case 'ArrowUp': nr = r - 1; break;
      case 'ArrowRight': nc = rtl ? c - 1 : c + 1; break;
      case 'ArrowLeft': nc = rtl ? c + 1 : c - 1; break;
      case 'Home': if (e.ctrlKey) nr = 0; nc = 0; break;
      case 'End': if (e.ctrlKey) nr = rows.length - 1; nc = cols.length - 1; break;
      case 'PageDown': nr = r + 10; break;
      case 'PageUp': nr = r - 10; break;
      case 'Tab':
        nc = e.shiftKey ? c - 1 : c + 1;
        if (nc >= cols.length) { if (r >= rows.length - 1) return; nr = r + 1; nc = 0; }
        if (nc < 0) { if (r <= 0) return; nr = r - 1; nc = cols.length - 1; }
        e.preventDefault(); xvMove(nr, nc, false); return;
      case 'Enter': case 'F2': e.preventDefault(); xvActivate(r, c, k); return;
      case ' ': if (cols[c] && cols[c].kind === 'toggle') { e.preventDefault(); xvActivate(r, c, k); } return;
      case 'Escape': if (mem.xv.anchor) { mem.xv.anchor = null; xvPaintSel(); } return;
      default:
        if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && cols[c] && (cols[c].kind === 'text' || cols[c].kind === 'hints')) { e.preventDefault(); xvStartEdit(r, c, k); }
        return;
    }
    e.preventDefault();
    xvMove(nr, nc, e.shiftKey);
  }
  function xvActivate(r, c, how) {
    var row = (view.xvRows || [])[r], col = (view.xvCols || [])[c]; if (!row || !col) return;
    xvMove(r, c, false, how === 'click');
    if (col.kind === 'id') { openMeaning(row.id); return; }
    if (col.kind === 'media') { var mi = mediaInfo(row, col.role); if (mi.s !== 'na' && (mi.s !== 'missing' || mi.pend)) openMediaPreview(row.id, col.role); return; }
    if (col.kind === 'toggle') { var p = col.flow === 'flow1' ? row.p1 : row.p2; if (!p) return; xvSave(row, col, !p.enabled, r, c, { r: r, c: c }); return; }
    if (col.kind === 'text' || col.kind === 'enum' || col.kind === 'hints') xvStartEdit(r, c, how === 'F2' ? 'F2' : null);
  }
  function xvStartEdit(r, c, firstKey) {
    var row = view.xvRows[r], col = view.xvCols[c], td = xvCellEl(r, c); if (!row || !col || !td) return;
    var orig = col.kind === 'enum' ? (row.m.category || '') : cellText(row, col);
    mem.xv.edit = { id: row.id, col: col.key, r: r, c: c, orig: orig };
    var label = esc(t('xv.edit', { field: t(col.label), id: row.id }));
    if (col.kind === 'enum') {
      td.innerHTML = '<select class="inp xv-inp" id="xv-edit" aria-label="' + label + '">' + Object.keys(C.CATEGORIES).map(function (k) { return '<option value="' + esc(k) + '"' + (k === orig ? ' selected' : '') + '>' + esc(catLabel(k)) + '</option>'; }).join('') + '</select>';
    } else {
      td.innerHTML = '<input class="inp xv-inp" id="xv-edit" dir="' + (col.dir || 'auto') + '" aria-label="' + label + '" autocomplete="off" value="' + esc(orig) + '">';
    }
    var inp = q('#xv-edit'); if (!inp) return;
    inp.focus();
    if (inp.tagName === 'INPUT') {
      if (firstKey && firstKey.length === 1) inp.value = firstKey;
      var n = inp.value.length; try { inp.setSelectionRange(firstKey === null ? 0 : n, n); } catch (e) { /* ignore */ }
    }
  }
  function xvEditKey(e) {
    var ed = mem.xv.edit; if (!ed) return;
    var cols = view.xvCols || [], rows = view.xvRows || [];
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mem.xv.edit = null; renderXVTable(); xvFocus(ed.r, ed.c); return; }
    if (e.key === 'Enter') { e.preventDefault(); xvCommit({ r: Math.min(rows.length - 1, Math.max(0, ed.r + (e.shiftKey ? -1 : 1))), c: ed.c }); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      var nc = ed.c + (e.shiftKey ? -1 : 1), nr = ed.r;
      if (nc >= cols.length) { nc = 0; nr = Math.min(rows.length - 1, nr + 1); } else if (nc < 0) { nc = cols.length - 1; nr = Math.max(0, nr - 1); }
      xvCommit({ r: nr, c: nc });
    }
  }
  function xvCommit(next) {
    var ed = mem.xv.edit; if (!ed || ed.saving) return;
    var inp = q('#xv-edit'); var val = inp ? inp.value : ed.orig;
    var row = (view.xvRows || []).filter(function (x) { return x.id === ed.id; })[0], col = (view.xvCols || []).filter(function (x) { return x.key === ed.col; })[0];
    if (!row || !col || String(val).trim() === String(ed.orig).trim()) { mem.xv.edit = null; renderXVTable(); if (next) xvMove(next.r, next.c, false); else xvFocusIfInside(ed); return; }
    ed.saving = true;
    xvSave(row, col, String(val).trim(), ed.r, ed.c, next);
  }
  function xvFocusIfInside(ed) { var h = q('#xv-table-host'); if (h && (!document.activeElement || document.activeElement === document.body || h.contains(document.activeElement))) xvFocus(ed.r, ed.c); }
  function xvSave(row, col, value, r, c, next) {
    var patch = {}, req, a = actor();
    var td = xvCellEl(r, c); if (td) td.setAttribute('aria-busy', 'true');
    if (col.kind === 'toggle') {
      var p = col.flow === 'flow1' ? row.p1 : row.p2;
      req = R.updateFlow(col.flow, row.id, { enabled: !!value }, p ? p.version : undefined, a);
    } else if (col.target === 'meaning') {
      patch[col.field] = value;
      req = R.updateMeaning(row.id, patch, row.m.version, a);
    } else {
      var pf = col.target === 'flow1' ? row.p1 : row.p2;
      patch[col.field] = col.field === 'cv_class' && value === '' ? null : value;
      req = R.updateFlow(col.target, row.id, patch, pf ? pf.version : undefined, a);
    }
    var fieldName = t(col.label);
    Promise.resolve(req).then(function (env) {
      if (!view) return;
      mem.xv.edit = null;
      if (env && env.ok) {
        mem.xv.err = null;
        announce(t('xv.saved', { id: row.id, field: fieldName }));
      } else {
        mem.xv.err = { id: row.id, col: col.key, text: t('xv.err', { id: row.id, field: fieldName, msg: errText(env && env.error) }) };
        announce(mem.xv.err.text);
      }
      renderXVTable();
      var tgt = env && env.ok && next ? next : { r: r, c: c };
      xvMove(tgt.r, tgt.c, false);
    }, function (e) {
      if (!view) return;
      mem.xv.edit = null;
      mem.xv.err = { id: row.id, col: col.key, text: t('xv.err', { id: row.id, field: fieldName, msg: String(e && e.message || e) }) };
      renderXVTable(); xvMove(r, c, false);
    });
  }
  function xvCopy(e) {
    if (mem.xv.edit || mem.tab !== 'excel') return;
    var host = q('#xv-table-host'); if (!host || !host.contains(document.activeElement)) return;
    var rows = view.xvRows || [], cols = view.xvCols || [];
    var a = mem.xv.anchor || mem.xv.cur, c = mem.xv.cur;
    var r0 = Math.min(a.r, c.r), r1 = Math.max(a.r, c.r), c0 = Math.min(a.c, c.c), c1 = Math.max(a.c, c.c);
    var lines = [], n = 0;
    for (var r = r0; r <= r1; r++) { var cells = []; for (var k = c0; k <= c1; k++) { cells.push(String(cellText(rows[r], cols[k])).replace(/[\t\r\n]+/g, ' ')); n++; } lines.push(cells.join('\t')); }
    var tsv = lines.join('\n');
    if (e.clipboardData) { e.clipboardData.setData('text/plain', tsv); e.preventDefault(); }
    view.lastCopy = tsv;
    announce(t('xv.copied', { n: n }));
  }

  // ---------------------------------------------------------------- media preview dialog
  function openMediaPreview(id, role) {
    var s = st(), ro = C.ROLES[role]; if (!ro) return;
    var p = ro.flow === 'flow1' ? C.getFlow1(s, id) : C.getFlow2(s, id);
    var live = p && p[ro.field] ? C.getAsset(s, p[ro.field]) : null;
    var pend = null;
    (s.assets || []).forEach(function (a) { if (a.lifecycle === 'active' && a.review_status === 'pending' && a.pending_for && a.pending_for.meaning_id === id && a.pending_for.role === role) pend = a; });
    function block(a, title, slot) {
      if (!a) return '';
      var honest = [];
      if (a.mock && ro.asset_type === 'audio') honest.push(t('pv.mock'));
      if (/TALKBIM/.test(a.source || '')) honest.push(t('pv.ref'));
      if (!a.production_approved) honest.push(t('pv.demo'));
      return '<div class="x-sec"><div class="x-row" style="margin-bottom:10px"><h3>' + esc(title) + '</h3>' + honest.map(function (h) { return '<span class="badge b-amber">' + esc(h) + '</span>'; }).join('') + '</div>' +
        '<div class="x-player" id="xcms-pv-' + slot + '"><span class="hint" style="color:#A9C9C2">' + icon('loading') + '</span></div>' +
        '<dl class="kv" style="margin-top:12px"><dt>' + th('pv.asset') + '</dt><dd><bdi class="x-mono">' + esc(a.asset_id) + '</bdi></dd><dt>' + th('pv.file') + '</dt><dd><bdi>' + esc(a.filename || '') + '</bdi></dd>' +
        '<dt>' + th('pv.review') + '</dt><dd>' + esc(a.review_status) + '</dd><dt>' + th('pv.rights') + '</dt><dd>' + esc(a.rights_status) + '</dd><dt>' + th('pv.source') + '</dt><dd>' + esc(a.source_label_en && lang() === 'en' ? a.source_label_en : a.source_label_ar && lang() === 'ar' ? a.source_label_ar : (a.source || '')) + '</dd>' +
        '<dt>' + th('pv.ver') + '</dt><dd>' + esc(a.version || 1) + '</dd>' + (a.duration_ms ? '<dt>' + th('pv.len') + '</dt><dd>' + esc(fmtSec(a.duration_ms)) + '</dd>' : '') + '</dl></div>';
    }
    var html = '<div class="dlg wide" role="dialog" aria-modal="true" aria-labelledby="xcms-pv-t">' + dlgHead('xcms-pv-t', th('pv.t', { id: id, role: t('role.' + role) })) +
      (live ? block(live, t('pv.live'), 'live') : '<p class="hint">' + th('pv.none') + '</p>') + block(pend, t('pv.pending'), 'pend') +
      '<div class="x-row">' + '<a class="btn cream sm" href="#meaning-' + esc(id) + '" data-meaning="' + esc(id) + '">' + icon('external_link') + th('pv.manage') + '</a></div></div>';
    openDialog(html, null, '#xcms-overlay .dlg .x');
    [[live, 'live'], [pend, 'pend']].forEach(function (pair) {
      var a = pair[0]; if (!a) return;
      Promise.resolve(R.mediaUrl(a)).then(function (url) {
        var slot = q('#xcms-pv-' + pair[1]); if (!slot) return;
        var label = esc(t('role.' + role) + ', ' + id);
        slot.innerHTML = ro.asset_type === 'audio' ? '<audio controls preload="metadata" src="' + esc(url) + '" aria-label="' + label + '"></audio>' : '<video controls playsinline preload="metadata" src="' + esc(url) + '" aria-label="' + label + '"></video>';
        var md = slot.querySelector('audio,video'); if (md) md.addEventListener('error', function () { slot.innerHTML = '<p class="hint" style="color:#F5F1E8;padding:16px">' + th('pv.err', { msg: (md.error && md.error.message) || 'format' }) + '</p>'; });
      }, function (e) { var slot = q('#xcms-pv-' + pair[1]); if (slot) slot.innerHTML = '<p class="hint" style="color:#F5F1E8;padding:16px">' + th('pv.err', { msg: errText(e) }) + '</p>'; });
    });
  }

  // =====================================================================================================
  // IMPORT / EXPORT page
  // =====================================================================================================
  function renderImportPage() {
    var main = q('#xcms-main'); if (!main || mem.tab !== 'import') return;
    var imp = mem.imp, active = imp && (imp.stage === 'preview' || imp.stage === 'reading' || imp.stage === 'done');
    main.innerHTML =
      '<div class="note plain">' + icon('id') + '<span class="x-sp"><b>' + th('x.key.t') + '.</b> ' + th('x.key.b') + '</span></div>' +
      (active ? '<div id="xcms-import" class="mb"></div><div class="g g2 mb"><section class="card" id="xcms-export" aria-labelledby="xcms-exp-t"></section><section class="card" id="xcms-hist" aria-labelledby="xcms-h-t"></section></div>'
        : '<div class="g g2 mb"><section class="card" id="xcms-export" aria-labelledby="xcms-exp-t"></section><section class="card" id="xcms-import" aria-labelledby="xcms-imp-t"></section></div><section class="card mb" id="xcms-hist" aria-labelledby="xcms-h-t"></section>') +
      '<section class="card" id="xcms-media" aria-labelledby="xcms-m-t"></section>';
    renderExport(); renderImport(); renderHistory(); renderMediaSection();
  }
  function renderMediaPage() {
    var main = q('#xcms-main'); if (!main || mem.tab !== 'media') return;
    main.innerHTML = '<section class="card" id="xcms-media" aria-labelledby="xcms-m-t"></section>';
    renderMediaSection();
  }

  // ---------------------------------------------------------------- export
  function xlsxName(s) { return 'BINA_Content_Catalogue_v' + ver(s) + '_' + today() + '.xlsx'; }
  function renderExport() {
    var el = q('#xcms-export'); if (!el) return;
    var s = st(), model = C.exportModel(s), busy = mem.exp.busy;
    function btn(act, arg, html, cls, aria) {
      var isBusy = busy === act + (arg || '');
      return '<button type="button" class="btn ' + cls + '" data-act="' + act + '"' + (arg ? ' data-arg="' + esc(arg) + '"' : '') + (busy ? ' disabled' : '') + (aria ? ' aria-label="' + esc(aria) + '"' : '') + (isBusy ? ' aria-busy="true"' : '') + '>' + (isBusy ? icon('loading') : '') + html + '</button>';
    }
    el.innerHTML =
      '<div class="ch"><span class="disc">' + icon('download') + '</span><div class="x-sp"><h3 id="xcms-exp-t">' + th('exp.t') + '</h3><p class="sub">' + th('exp.s') + '</p></div></div>' +
      '<div class="note plain" style="margin-bottom:10px">' + icon('file') + '<span class="x-sr">' + th('exp.file') + '</span><bdi class="x-mono" id="xcms-xlsx-name">' + esc(xlsxName(s)) + '</bdi></div>' +
      '<div class="tw"><table class="t"><thead><tr><th scope="col">' + th('exp.th.sheet') + '</th><th scope="col">' + th('exp.th.holds') + '</th><th scope="col">' + th('exp.th.rows') + '</th></tr></thead><tbody>' +
        C.SHEET_ORDER.map(function (sh) { return '<tr><td><bdi class="x-mono">' + esc(sh) + '</bdi></td><td>' + th('sheet.' + sh) + '</td><td>' + model[sh].length + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="x-row" style="margin-top:14px">' + btn('exp-xlsx', '', icon('download') + th('exp.xlsx'), 'dark') + btn('exp-tpl', '', icon('file') + th('exp.tpl'), 'cream') + btn('exp-json', '', icon('code_boxes') + th('exp.json'), 'cream') + '</div>' +
      '<p class="hint" style="margin:14px 0 6px">' + th('exp.csv') + '</p>' +
      '<div class="chips">' + C.SHEET_ORDER.map(function (sh) { return btn('exp-csv', sh, icon('download') + '<bdi>' + esc(sh) + '.csv</bdi>', 'cream sm', t('exp.csvLabel', { sheet: sh, n: model[sh].length })); }).join('') + '</div>' +
      '<p class="hint" style="margin-top:12px">' + th('exp.guard') + '</p>' +
      (busy ? '<p class="hint" role="status">' + th('exp.building', { file: busy }) + '</p>' : mem.exp.msg ? '<p class="' + (mem.exp.msg.kind === 'err' ? 'x-bad' : mem.exp.msg.kind === 'ok' ? 'x-ok' : 'hint') + '" role="status" style="margin-top:10px">' + esc(mem.exp.msg.text) + '</p>' : '');
  }
  function catalogueJson(s, who) {
    var m = s.meta || {};
    return { schema: s.schema || 'bina.catalogue/1', exported_at: C.nowIso(), exported_by: who, meta: { environment: m.environment || null, catalogue_version: m.catalogue_version || null, updated_at: m.updated_at || null }, meanings: s.meanings || [], flow1_profiles: s.flow1_profiles || [], flow2_profiles: s.flow2_profiles || [], assets: s.assets || [] };
  }
  function doExport(kind, sheet) {
    if (mem.exp.busy) return;
    var s = st(), v = ver(s), who = actor(), date = today(), filename, make;
    if (kind === 'xlsx') { filename = 'BINA_Content_Catalogue_v' + v + '_' + date + '.xlsx'; make = function () { return X.toBuffer(X.buildWorkbook(root.ExcelJS, s, { exportedBy: who })).then(function (b) { return new Blob([b], { type: XLSX_MIME }); }); }; }
    else if (kind === 'tpl') { filename = 'BINA_Content_Catalogue_Template.xlsx'; make = function () { return X.toBuffer(X.buildWorkbook(root.ExcelJS, s, { template: true, exportedBy: who })).then(function (b) { return new Blob([b], { type: XLSX_MIME }); }); }; }
    else if (kind === 'csv') { if (C.SHEET_ORDER.indexOf(sheet) < 0) return; filename = 'BINA_' + sheet + '_v' + v + '_' + date + '.csv'; make = function () { return Promise.resolve(X.csvForSheet(s, sheet)); }; }
    else { filename = 'BINA_Content_Catalogue_v' + v + '_' + date + '.json'; make = function () { return Promise.resolve(JSON.stringify(catalogueJson(s, who), null, 2)); }; }
    mem.exp.busy = 'exp-' + kind + (sheet || ''); mem.exp.msg = null;
    renderExport();
    announce(t('exp.building', { file: filename }));
    var done = function (msg) { mem.exp.busy = null; mem.exp.msg = msg; if (view) { renderExport(); announce(msg.text); } };
    Promise.resolve().then(make).then(function (data) { return P.Files.save(filename, data); }).then(function (res) {
      if (res && res.ok) { done({ kind: 'ok', text: t('exp.done', { file: filename }) }); toast(t('exp.done', { file: filename }), 'ok'); }
      else if (res && res.error && res.error.code === 'declined') done({ kind: 'info', text: t('exp.declined') });
      else { var m = t('exp.failed', { msg: errText(res && res.error) }); done({ kind: 'err', text: m }); toast(m, 'err'); }
    }, function (e) { var m = t('exp.failed', { msg: errText(e) || String(e) }); done({ kind: 'err', text: m }); toast(m, 'err'); });
  }

  // ---------------------------------------------------------------- import: reading
  function cellValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && !Array.isArray(v)) {
      if (v.formula !== undefined || v.sharedFormula !== undefined || v.error !== undefined) return '';
      if (v.richText) return v.richText.map(function (x) { return x.text; }).join('');
      if (v.text !== undefined) return String(v.text);
      if (v.result !== undefined) return String(v.result);
      if (v instanceof Date) return v.toISOString();
      return String(v);
    }
    return String(v).trim();
  }
  function headerRowIndex(grid) { var i = 0; while (i < grid.length && !(grid[i] || []).some(function (c) { return String(cellValue(c) || '').trim(); })) i++; return i; }
  function sheetFromFilename(name) {
    var n = String(name || '').toLowerCase().replace(/\.csv$/, ''), hit = null;
    C.SHEET_ORDER.forEach(function (s) { if (!hit && n.indexOf(s.toLowerCase()) >= 0) hit = s; });
    if (hit) return hit;
    var simple = { flow1: F1, flow2: F2, core: CORE, meanings: CORE, assets: ASSETS, media: ASSETS };
    Object.keys(simple).forEach(function (k) { if (!hit && new RegExp('(^|[^a-z0-9])' + k + '([^a-z0-9]|$)').test(n)) hit = simple[k]; });
    return hit;
  }
  function readImportFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length || !view) return;
    var lim = X.LIMITS;
    var bad = files.filter(function (f) { return !/\.(xlsx|csv)$/i.test(f.name); });
    var xlsx = files.filter(function (f) { return /\.xlsx$/i.test(f.name); });
    var csv = files.filter(function (f) { return /\.csv$/i.test(f.name); });
    function fail(msg) { mem.imp = { stage: 'error', error: msg }; renderImportPage(); announce(msg); toast(msg, 'err'); }
    if (bad.length) return fail(t('imp.err.type', { files: bad.map(function (f) { return f.name; }).join(', ') }));
    if (xlsx.length > 1 || (xlsx.length && csv.length)) return fail(t('imp.err.mix'));
    var big = files.filter(function (f) { return f.size > (/\.csv$/i.test(f.name) ? lim.max_csv_bytes : lim.max_file_bytes); })[0];
    if (big) return fail(t('imp.err.size', { file: big.name, mb: Math.round((/\.csv$/i.test(big.name) ? lim.max_csv_bytes : lim.max_file_bytes) / 1048576) }));
    var empty = files.filter(function (f) { return !f.size; })[0];
    if (empty) return fail(t('imp.err.empty', { file: empty.name }));
    var name = xlsx.length ? xlsx[0].name : csv.map(function (f) { return f.name; }).join(', ');
    mem.imp = { stage: 'reading', file: { name: name, size: files.reduce(function (a, f) { return a + f.size; }, 0), kind: xlsx.length ? 'xlsx' : 'csv', parts: [] } };
    renderImportPage();
    announce(t('imp.reading', { file: name }));
    var notes = [];
    var p = xlsx.length
      ? xlsx[0].arrayBuffer().then(function (buf) {
          return X.readWorkbook(root.ExcelJS, buf).then(null, function (e) {
            if (e && e.code === 'PAYLOAD_TOO_LARGE') throw { mine: t('imp.err.rows', { rows: lim.max_rows_per_sheet }) };
            throw { mine: t('imp.err.unreadable', { file: name }) };
          });
        })
      : Promise.all(csv.map(readCsvFile)).then(function (parts) {
          var all = {};
          parts.forEach(function (pt) {
            if (pt.note) notes.push(pt.note);
            var sh = Object.keys(pt.raw)[0];
            if (all[sh]) throw { mine: t('imp.err.csvDup', { sheet: sh }) };
            all[sh] = pt.raw[sh]; mem.imp.file.parts.push({ name: pt.name, sheet: sh });
          });
          return all;
        });
    p.then(function (rawData) { if (view && mem.imp && mem.imp.stage === 'reading') startPreview(rawData, notes); }, function (e) { fail(e && e.mine ? e.mine : (e && e.message) || String(e)); });
  }
  function readCsvFile(f) {
    return f.arrayBuffer().then(function (buf) {
      var text, note = null;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch (e) { try { text = new TextDecoder('windows-1256').decode(buf); note = t('imp.note.enc', { file: f.name }); } catch (e2) { text = new TextDecoder('utf-8').decode(buf); } }
      var rawData;
      try { rawData = X.rawFromCSV(text); }
      catch (e) {
        if (e && e.code === 'PAYLOAD_TOO_LARGE') throw { mine: t('imp.err.size', { file: f.name, mb: Math.round(X.LIMITS.max_csv_bytes / 1048576) }) };
        var guess = sheetFromFilename(f.name);
        if (!guess) throw { mine: t('imp.err.csvSheet', { file: f.name }) };
        rawData = X.rawFromCSV(text, guess);
      }
      var sh = Object.keys(rawData)[0];
      if ((rawData[sh] || []).length - 1 > X.LIMITS.max_rows_per_sheet) throw { mine: t('imp.err.rows', { rows: X.LIMITS.max_rows_per_sheet }) };
      return { name: f.name, raw: rawData, note: note };
    });
  }
  function startPreview(rawData, notes) {
    var imp = mem.imp;
    imp.raw = rawData; imp.notes = notes || [];
    imp.colOverrides = {}; imp.colPending = {}; imp.edits = []; imp.decisions = {};
    imp.filter = { status: '', q: '' }; imp.notice = null; imp.openGroup = null;
    var p0 = C.parseWorkbook(rawData);
    imp.sheetMap = {}; imp.origCols = {};
    Object.keys(p0.sheets).forEach(function (canon) {
      var src = p0.sheets[canon].source_name, grid = rawData[src] || [], hi = headerRowIndex(grid), hd = (grid[hi] || []).map(cellValue);
      imp.sheetMap[src] = canon; imp.origCols[canon] = { headers: hd, det: C.detectColumns(canon, hd) };
    });
    imp.parseIssues = p0.issues || [];
    imp.colsOpen = Object.keys(p0.sheets).some(function (s) { var d = p0.sheets[s].columns; return d.suggestions.length || d.missing.length || d.extra.length; });
    requestPreview();
  }
  /** Column choices are applied by rewriting header cells, so detectColumns recomputes exact / missing / extra itself. */
  function effectiveRaw(imp) {
    var out = {};
    Object.keys(imp.raw).forEach(function (name) {
      var grid = imp.raw[name], canon = imp.sheetMap[name], ov = canon ? imp.colOverrides[canon] : null;
      if (!ov || !Object.keys(ov).length) { out[name] = grid; return; }
      var hi = headerRowIndex(grid), headers = (grid[hi] || []).slice(), orig = C.detectColumns(canon, headers.map(cellValue));
      Object.keys(ov).forEach(function (i) {
        var key = ov[i];
        if (key) { Object.keys(orig.map).forEach(function (j) { if (j !== i && orig.map[j] === key && !own(ov, j)) headers[j] = ''; }); headers[i] = fieldHeader(canon, key); }
        else headers[i] = '';
      });
      if (!headers.some(function (h) { return String(cellValue(h)).trim(); })) { out[name] = grid; return; }
      var g = grid.slice(); g[hi] = headers; out[name] = g;
    });
    return out;
  }
  /** Ask the repository for a batch: local mode runs BinaCore in this browser, api mode the Worker (which re-validates on commit). */
  function requestPreview() {
    var imp = mem.imp, eff = effectiveRaw(imp), t0 = now(), fpAt = C.catalogueFingerprint(st());
    imp.busy = true;
    return Promise.resolve(R.importPreview(imp.file.name, eff)).then(function (env) {
      if (!view || mem.imp !== imp) return;
      imp.busy = false;
      if (!env || !env.ok || !env.data) { mem.imp = { stage: 'error', error: t('imp.err.server', { msg: errText(env && env.error) }) }; renderImportPage(); announce(mem.imp.error); return; }
      perf.import_preview_last = { rows: rowCount(eff), ms: Math.round(now() - t0), mode: R.mode ? R.mode() : 'local' };
      imp.batch = env.data;
      imp.parsedBase = env.data.parsed || C.parseWorkbook(eff);
      imp.serverPreview = env.data.preview || null; imp.serverFp = fpAt;
      recompute();
      imp.stage = 'preview';
      renderImportPage();
      var sm = imp.preview.summary;
      announce(STATUS_ORDER.map(function (k) { return t('st.' + k) + ' ' + sm[k]; }).join(', '));
    }, function (e) { if (view && mem.imp === imp) { mem.imp = { stage: 'error', error: t('imp.err.server', { msg: errText(e) }) }; renderImportPage(); } });
  }
  function rowCount(rawData) { var n = 0; Object.keys(rawData).forEach(function (k) { n += Math.max(0, (rawData[k] || []).length - 1); }); return n; }
  /** Dry run against the latest catalogue with the user's edits and remembered decisions. Never writes. */
  function recompute() {
    var imp = mem.imp, s = st();
    imp.parsed = C.clone(imp.parsedBase);
    imp.edits.forEach(function (e) { C.editParsedCell(imp.parsed, e.sheet, e.row, e.field, e.value); });
    var fp = C.catalogueFingerprint(s);
    var pv = !imp.edits.length && imp.serverPreview && imp.serverFp === fp ? C.clone(imp.serverPreview) : C.buildImportPreview(s, imp.parsed);
    C.applyDecisions(pv, imp.decisions);
    imp.preview = pv;
    imp.byId = {}; pv.items.forEach(function (it) { imp.byId[it.id] = it; });
    imp.groups = groupByMeaning(pv, s);
    imp.baseFp = fp; imp.baseVersion = ver(s);
    if (imp.filter.status && !imp.groups.some(function (g) { return groupMatches(g, imp.filter.status); })) imp.filter.status = '';
  }
  var STATUS_ORDER = ['NEW', 'UPDATED', 'UNCHANGED', 'WARNING', 'CONFLICT', 'ERROR'];
  var STATUS_BADGE = { NEW: 'b-teal', UPDATED: 'b-green', UNCHANGED: 'b-grey', WARNING: 'b-amber', CONFLICT: 'b-amber', ERROR: 'b-red' };
  var SHEET_RANK = {}; SHEET_RANK[CORE] = 0; SHEET_RANK[F1] = 1; SHEET_RANK[F2] = 2; SHEET_RANK[ASSETS] = 3;
  /** ONE BINA CATALOGUE: the four sheets of the workbook are shown per meaning. */
  function groupByMeaning(pv, s) {
    var byKey = {}, order = [], assetRef = {};
    pv.items.forEach(function (it) { if (it.sheet !== ASSETS && it.next && it.key) ['ar_audio_asset_id', 'en_audio_asset_id', 'avatar_asset_id'].forEach(function (f) { if (it.next[f]) assetRef[it.next[f]] = it.key; }); });
    function meaningOfAsset(id) {
      if (!id) return null;
      var o = C.assetOwner(s, id); if (o) return o.meaning_id;
      var a = C.getAsset(s, id); if (a && a.pending_for) return a.pending_for.meaning_id;
      if (assetRef[id]) return assetRef[id];
      var m = /^AUD_(.+)_(AR|EN)_\d{3}$/.exec(id) || /^AVA_(.+)_\d{3}$/.exec(id);
      return m ? m[1] : null;
    }
    pv.items.forEach(function (it) {
      var mid = it.sheet === ASSETS ? meaningOfAsset(it.key) : it.key;
      var gk = mid ? 'M:' + mid : it.sheet === ASSETS && it.key ? 'A:' : 'R:' + it.sheet + ':' + it.row;
      if (!byKey[gk]) { byKey[gk] = { gk: gk, meaning: mid, items: [] }; order.push(gk); }
      byKey[gk].items.push(it);
    });
    return order.map(function (gk) {
      var g = byKey[gk];
      g.items.sort(function (a, b) { return SHEET_RANK[a.sheet] - SHEET_RANK[b.sheet] || a.row - b.row; });
      var sts = g.items.map(function (i) { return i.status; });
      var core = g.items.filter(function (i) { return i.sheet === CORE; })[0];
      g.status = sts.indexOf('ERROR') >= 0 ? 'ERROR' : sts.indexOf('CONFLICT') >= 0 ? 'CONFLICT' : (core && core.status === 'NEW') ? 'NEW' : (sts.indexOf('NEW') >= 0 || sts.indexOf('UPDATED') >= 0) ? 'UPDATED' : 'UNCHANGED';
      g.warning = g.items.some(function (i) { return i.warning && i.status !== 'ERROR'; });
      var m = g.meaning ? C.getMeaning(s, g.meaning) : null;
      g.ar = core && core.next ? core.next.canonical_ar : m ? m.canonical_ar : '';
      g.en = core && core.next ? core.next.canonical_en : m ? m.canonical_en : '';
      g.label = g.meaning || (gk === 'A:' ? t('grp.noMeaning') : t('grp.noKey', { sheet: g.items[0].sheet, row: g.items[0].row }));
      g.find = C.normalizeText([g.label, g.ar, g.en].join(' ')) + ' ' + String(g.label).toLowerCase();
      return g;
    });
  }
  function groupMatches(g, status) { return !status || (status === 'WARNING' ? g.warning : g.status === status); }

  // ---------------------------------------------------------------- import: rendering
  function stepsHtml(cur, all) {
    var steps = raw('imp.steps').split('|');
    return '<div class="steps" aria-hidden="true">' + steps.map(function (s, i) { return '<div class="' + (all || i <= cur ? 'on' : '') + '"></div>'; }).join('') + '</div>' +
      '<ol class="x-labels" aria-label="' + esc(t('imp.stepsL')) + '" style="list-style:none;padding:0">' + steps.map(function (s, i) { var c = !all && i === cur; return '<li class="chip' + (c ? ' on' : '') + '"' + (c ? ' aria-current="step"' : '') + '>' + (all || i < cur ? icon('check') : '') + esc(s) + '</li>'; }).join('') + '</ol>';
  }
  function renderSteps() { var el = q('#xcms-steps'); if (el && mem.imp && mem.imp.preview) el.innerHTML = stepsHtml(previewStep()); }
  function previewStep() { var pv = mem.imp.preview, c = C.previewCounts(pv); return pv.blocking.length || c.blocked || c.needs_resolution ? 5 : 6; }
  function renderImport() {
    var el = q('#xcms-import'); if (!el) return;
    var imp = mem.imp, lim = X.LIMITS;
    if (imp && imp.stage === 'preview') { el.className = 'card mb'; el.setAttribute('aria-labelledby', 'xcms-pr-t'); renderPreview(); return; }
    if (imp && imp.stage === 'reading') { el.className = 'card mb'; el.innerHTML = stepsHtml(1) + '<p class="x-row" role="status">' + icon('loading') + th('imp.reading', { file: imp.file.name }) + '</p>'; return; }
    if (imp && imp.stage === 'done') { el.className = 'card mb'; el.innerHTML = stepsHtml(6, true) + resultHtml(imp.result); return; }
    el.innerHTML =
      '<div class="ch"><span class="disc">' + icon('upload') + '</span><div class="x-sp"><h3 id="xcms-imp-t">' + th('imp.t') + '</h3><p class="sub">' + th('imp.s') + '</p></div></div>' +
      stepsHtml(0) +
      (imp && imp.stage === 'error' ? '<div class="note err" role="alert">' + icon('error') + '<span class="x-sp"><b>' + th('imp.err.t') + '</b> ' + esc(imp.error) + '</span></div>' : '') +
      '<div class="drop" data-drop="import"><div class="disc">' + icon('upload') + '</div><b style="font-size:16px">' + th('imp.drop') + '</b>' +
        '<p class="hint">' + th('imp.limits', { mb: Math.round(lim.max_file_bytes / 1048576), csvmb: Math.round(lim.max_csv_bytes / 1048576), rows: lim.max_rows_per_sheet }) + '</p>' +
        '<input type="file" id="xcms-imp-file" class="x-sr x-file" multiple accept=".xlsx,.csv,' + XLSX_MIME + ',text/csv" tabindex="-1" aria-hidden="true">' +
        '<button type="button" class="btn dark" data-act="imp-pick">' + icon('file') + th('imp.choose') + '</button></div>' +
      '<p class="note" style="margin-top:14px">' + icon('shield_check') + th('imp.safe') + '</p>';
  }
  function renderPreview() {
    var el = q('#xcms-import'); if (!el || !mem.imp || mem.imp.stage !== 'preview') return;
    var imp = mem.imp, pv = imp.preview;
    var sheetsIn = C.SHEET_ORDER.filter(function (s) { return imp.parsed.sheets[s]; });
    var rows = 0; sheetsIn.forEach(function (s) { rows += pv.sheets[s] || 0; });
    var notes = '';
    (imp.notes || []).forEach(function (n) { notes += '<div class="note warn">' + icon('info') + '<span class="x-sp">' + esc(n) + '</span></div>'; });
    if (imp.notice) notes += '<div class="note warn" role="status" data-notice="changed">' + icon('sync') + '<span class="x-sp">' + th('pr.changed', imp.notice) + '</span><button type="button" class="btn sm cream" data-act="imp-notice-x">' + th('pr.dismiss') + '</button></div>';
    if (pv.blocking.length) notes += '<div class="note err" role="alert">' + icon('error') + '<span class="x-sp"><b>' + th('pr.block') + '</b> ' + pv.blocking.map(function (b) { return b.code === 'MISSING_REQUIRED_COLUMNS' ? th('pr.block.cols', { sheet: b.sheet, cols: b.columns.join(', ') }) : th('pr.block.none'); }).join(' ') + '</span></div>';
    (imp.parseIssues || []).forEach(function (i) { if (i.code === 'DUPLICATE_SHEET') notes += '<div class="note warn">' + icon('warning') + '<span class="x-sp">' + th('pr.dupSheet', { name: i.sheet }) + '</span></div>'; });
    var sheetChips = C.SHEET_ORDER.map(function (s) {
      if (imp.parsed.sheets[s]) return '<span class="chip c-teal">' + icon('check') + '<bdi class="x-mono">' + esc(s) + '</bdi><span class="badge b-grey">' + (pv.sheets[s] || 0) + '</span></span>';
      return '<span class="chip c-grey">' + icon('minus') + th('pr.missingSheet', { sheet: s }) + '</span>';
    }).join('') + (pv.unknownSheets || []).map(function (n) { return '<span class="chip c-grey">' + icon('x_small') + th('pr.unknownSheet', { name: n }) + '</span>'; }).join('');
    el.innerHTML =
      '<div class="ch"><span class="disc">' + icon('diff') + '</span><div class="x-sp"><h3 id="xcms-pr-t">' + th('pr.t') + '</h3><p class="sub">' + '<bdi>' + esc(imp.file.name) + '</bdi> · <bdi dir="ltr">' + esc(fmtBytes(imp.file.size)) + '</bdi> · ' + th('pr.compared', { v: imp.baseVersion }) + '</p></div>' +
        '<button type="button" class="btn line sm" data-act="imp-over">' + icon('refresh') + th('pr.over') + '</button></div>' +
      '<div id="xcms-steps">' + stepsHtml(previewStep()) + '</div>' + notes +
      '<p style="margin:0 0 8px"><b>' + th('pr.one', { m: imp.groups.filter(function (g) { return g.meaning; }).length, r: rows, s: sheetsIn.length }) + '</b></p>' +
      '<div class="chips mb">' + sheetChips + '</div>' +
      (imp.file.kind === 'csv' ? '<p class="hint">' + th('pr.csv', { sheets: sheetsIn.join(', ') }) + '</p>' : '') +
      '<div id="xcms-cols"></div><div id="xcms-am"></div>' +
      '<div id="xcms-summary"></div>' +
      '<div class="tw"><div id="xcms-groups"></div></div>' +
      '<div class="bulk" id="xcms-bar"></div>';
    renderCols(); renderAutomap(); renderSummary(); renderGroupsTable(); renderBar();
    if (imp.openGroup) renderGroupDialog(imp.openGroup, true);
  }
  function renderSummary() {
    var el = q('#xcms-summary'); if (!el) return;
    var imp = mem.imp, sm = imp.preview.summary, gs = imp.groups, cnt = { ALL: gs.length };
    STATUS_ORDER.forEach(function (s) { cnt[s] = gs.filter(function (g) { return groupMatches(g, s); }).length; });
    var n = decisionCounts();
    el.setAttribute('data-counts', JSON.stringify(sm));
    el.setAttribute('data-meanings', JSON.stringify(cnt));
    el.innerHTML =
      '<div class="filters"><div class="chips" role="group" aria-label="' + esc(t('pr.filter')) + '">' + ['ALL'].concat(STATUS_ORDER).map(function (k) {
        var pressed = (imp.filter.status || 'ALL') === k;
        return '<button type="button" class="chip' + (pressed ? ' on' : '') + '" aria-pressed="' + pressed + '" data-act="chip" data-arg="' + k + '" data-chip="' + k + '"' + (k !== 'ALL' && !cnt[k] ? ' disabled' : '') + '>' + th('st.' + k) + ' <span class="badge ' + (k === 'ALL' ? 'b-grey' : STATUS_BADGE[k]) + '" data-count="' + k + '">' + cnt[k] + '</span></button>';
      }).join('') + '</div>' +
      '<span class="x-sp"></span><label class="x-sr" for="pr-q">' + th('pr.search') + '</label><input class="inp" type="search" id="pr-q" placeholder="' + esc(t('pr.search')) + '" value="' + esc(imp.filter.q) + '" autocomplete="off" style="width:auto;min-width:200px;max-width:280px;min-height:38px;border-radius:999px;font-size:13px"></div>' +
      '<p class="hint" style="margin:-8px 0 10px" id="xcms-rowcounts">' + th('pr.rows') + ': ' + STATUS_ORDER.map(function (k) { return esc(t('st.' + k)) + ' ' + sm[k]; }).join(' · ') + '</p>' +
      '<div class="x-row mb" role="group" aria-label="' + esc(t('tb.bulk')) + '">' +
        '<button type="button" class="btn sm cream" data-act="bulk" data-arg="errors"' + (n.err ? '' : ' disabled') + '>' + th('tb.skipErrors', { n: n.err }) + '</button>' +
        '<button type="button" class="btn sm cream" data-act="bulk" data-arg="conflicts"' + (n.conf ? '' : ' disabled') + '>' + th('tb.skipConflicts', { n: n.conf }) + '</button>' +
        '<button type="button" class="btn sm cream" data-act="bulk" data-arg="unchanged"' + (n.unch ? '' : ' disabled') + '>' + th('tb.skipUnchanged', { n: n.unch }) + '</button>' +
        '<button type="button" class="btn sm ghost" data-act="bulk" data-arg="reset">' + th('tb.reset') + '</button></div>';
  }
  function decisionCounts() {
    var n = { err: 0, conf: 0, unch: 0 };
    mem.imp.preview.items.forEach(function (i) { if (i.status === 'ERROR' && i.decision !== 'skip') n.err++; if (i.status === 'CONFLICT' && i.decision !== 'skip') n.conf++; if (i.status === 'UNCHANGED') n.unch++; });
    return n;
  }
  var FIELD_SHORT = { ar_audio_asset_id: 'f.ar_audio_asset_id', en_audio_asset_id: 'f.en_audio_asset_id', avatar_asset_id: 'f.avatar_asset_id' };
  function shortIssue(it, iss) {
    var tpl = (SHORT[iss.code] || SHORT._)[li()];
    return th(null, { value: iss.value, other: iss.other, field: { html: '<bdi class="x-mono">' + esc(fieldHeader(it.sheet, iss.field)) + '</bdi>' }, code: iss.code }, tpl);
  }
  function sheetSummary(items, sheet) {
    if (!items.length) return '<span class="hint">' + th('sum.notInFile') + '</span>';
    if (sheet === ASSETS) {
      var worst = items.filter(function (i) { return i.status === 'ERROR' || i.status === 'CONFLICT'; })[0];
      var ch = items.filter(function (i) { return i.status === 'NEW' || i.status === 'UPDATED'; }).length;
      return '<div class="x-sum"><span>' + th('sum.files', { n: items.length }) + '</span>' + (worst ? '<span class="badge ' + STATUS_BADGE[worst.status] + '">' + th('st.' + worst.status) + '</span><span>' + shortIssue(worst, worst.issues.filter(function (i) { return i.level !== 'warning'; })[0] || worst.issues[0]) + '</span>' : ch ? '<span class="badge b-green">' + th('st.UPDATED') + '</span>' : '<span class="hint">' + th('sum.same') + '</span>') + '</div>';
    }
    var rank = { ERROR: 0, CONFLICT: 1, NEW: 2, UPDATED: 3, UNCHANGED: 4 };
    var it = items.slice().sort(function (a, b) { return rank[a.status] - rank[b.status]; })[0], out = '';
    if (it.status === 'UNCHANGED') out = '<span class="hint">' + th('sum.same') + '</span>';
    else if (it.status === 'NEW') out = '<span class="badge b-teal">' + th(sheet === CORE ? 'sum.newCore' : 'sum.newFlow') + '</span>';
    else if (it.status === 'UPDATED') {
      var names = it.changes.map(function (c) { return t(FIELD_SHORT[c.field] || ('f.' + c.field)); });
      out = '<span>' + th('sum.upd', { fields: names.slice(0, 2).join(', ') + (names.length > 2 ? ' ' + t('sum.more', { n: names.length - 2 }) : '') }) + '</span>';
    } else {
      var main = it.issues.filter(function (i) { return i.level === (it.status === 'ERROR' ? 'error' : 'conflict'); })[0] || it.issues[0];
      out = '<span class="badge ' + STATUS_BADGE[it.status] + '">' + th('st.' + it.status) + '</span><span>' + shortIssue(it, main) + '</span>';
    }
    var warn = it.status !== 'ERROR' ? it.issues.filter(function (i) { return i.level === 'warning'; })[0] : null;
    if (warn) out += '<span class="x-warn">' + icon('warning') + shortIssue(it, warn) + '</span>';
    if (items.length > 1) out += '<span class="hint">' + th('sum.more', { n: items.length - 1 }) + '</span>';
    return '<div class="x-sum">' + out + '</div>';
  }
  function groupDecision(g) {
    var w = 0, sk = 0, need = 0, bl = 0;
    g.items.forEach(function (i) { if (i.decision === 'apply' || i.decision === 'overwrite') w++; else if (i.decision === 'skip') sk++; else if (i.decision === 'needs_resolution') need++; else if (i.decision === 'blocked') bl++; });
    if (bl) return '<span class="badge b-red">' + th('dec.blocked') + '</span>';
    if (need) return '<span class="badge b-amber">' + th('dec.need') + '</span>';
    if (w) return '<span class="badge b-green">' + th('dec.write', { n: w }) + '</span>';
    return '<span class="hint">' + th(g.status === 'UNCHANGED' ? 'dec.nothing' : 'dec.skip') + '</span>';
  }
  function renderGroupsTable() {
    var el = q('#xcms-groups'); if (!el) return;
    var imp = mem.imp, f = imp.filter, qn = C.normalizeText(f.q || ''), ql = String(f.q || '').trim().toLowerCase();
    var gs = imp.groups.filter(function (g) { return groupMatches(g, f.status) && (!ql || g.find.indexOf(qn) >= 0 || g.find.indexOf(ql) >= 0); });
    var rows = gs.map(function (g) {
      var by = function (sh) { return g.items.filter(function (i) { return i.sheet === sh; }); };
      return '<tr class="click" data-group="' + esc(g.gk) + '"><td><b><bdi>' + esc(g.label) + '</bdi></b>' + (g.ar || g.en ? '<div class="hint"><bdi dir="rtl">' + esc(g.ar || '') + '</bdi> · <bdi dir="ltr">' + esc(g.en || '') + '</bdi></div>' : '') + '</td>' +
        '<td>' + sheetSummary(by(CORE), CORE) + '</td><td>' + sheetSummary(by(F1), F1) + '</td><td>' + sheetSummary(by(F2), F2) + '</td><td>' + sheetSummary(by(ASSETS), ASSETS) + '</td>' +
        '<td><span class="badge ' + STATUS_BADGE[g.status] + '" data-gstatus="' + g.status + '">' + th('st.' + g.status) + '</span></td><td>' + groupDecision(g) + '</td>' +
        '<td><button type="button" class="btn sm cream" data-act="open-group" data-arg="' + esc(g.gk) + '" aria-label="' + esc(t('g.reviewFor', { id: g.label })) + '">' + th('g.review') + '</button></td></tr>';
    }).join('');
    el.innerHTML = '<table class="t x-grp"><thead><tr><th scope="col">' + th('th.meaning') + '</th><th scope="col">' + th('th.core') + '</th><th scope="col">' + th('th.f1') + '</th><th scope="col">' + th('th.f2') + '</th><th scope="col">' + th('th.files') + '</th><th scope="col">' + th('th.status') + '</th><th scope="col">' + th('th.dec') + '</th><th scope="col"><span class="x-sr">' + th('g.review') + '</span></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8"><div class="empty"><p>' + th('pr.none') + '</p></div></td></tr>') + '</tbody></table>' +
      '<p class="hint" aria-live="polite">' + th('pr.shown', { n: gs.length, total: imp.groups.length }) + '</p>';
    Array.prototype.forEach.call(el.querySelectorAll('tr.click'), function (tr) { tr.addEventListener('click', function (e) { if (!e.target.closest('button,a,input,select')) openGroup(tr.getAttribute('data-group')); }); });
  }
  function renderBar() {
    var el = q('#xcms-bar'); if (!el) return;
    var pv = mem.imp.preview, c = C.previewCounts(pv), nw = 0, up = 0;
    pv.items.forEach(function (i) { if (i.decision === 'apply') { if (i.status === 'NEW') nw++; else up++; } });
    var can = C.previewCanCommit(pv) && !mem.imp.committing;
    var why = can ? 'bar.ready' : pv.blocking.length ? 'bar.why.blocking' : c.needs_resolution ? 'bar.why.decide' : c.blocked ? 'bar.why.blocked' : 'bar.why.nothing';
    el.innerHTML = '<span class="x-sp"><b>' + th('bar.write', { n: nw + up + c.overwrite }) + '</b> (' + th('bar.detail', { nw: nw, up: up, ow: c.overwrite }) + ') · ' + th('bar.skip', { n: c.skip }) + ' · ' + th('bar.decide', { n: c.needs_resolution }) + ' · ' + th('bar.blocked', { n: c.blocked }) + '</span>' +
      '<button type="button" class="btn green" data-act="commit" id="xcms-commit"' + (can ? '' : ' disabled aria-describedby="xcms-why"') + '>' + (mem.imp.committing ? icon('loading') : icon('publish')) + th('bar.commit') + '</button>' +
      '<span class="x-why" id="xcms-why">' + th(why) + '</span>';
  }
  function setStatusFilter(code) {
    var imp = mem.imp; if (!imp) return;
    imp.filter.status = code === 'ALL' || imp.filter.status === code ? '' : code;
    renderSummary(); renderGroupsTable();
    var b = q('[data-chip="' + (imp.filter.status || 'ALL') + '"]'); if (b) b.focus();
  }
  function bulk(kind) {
    var imp = mem.imp; if (!imp) return;
    var n = 0;
    imp.preview.items.forEach(function (it) {
      if (kind === 'reset') { var d = it.status === 'ERROR' ? 'blocked' : it.status === 'CONFLICT' ? 'needs_resolution' : it.status === 'UNCHANGED' ? 'skip' : 'apply'; if (it.decision !== d) { it.decision = d; n++; } return; }
      var match = (kind === 'errors' && it.status === 'ERROR') || (kind === 'conflicts' && it.status === 'CONFLICT') || (kind === 'unchanged' && it.status === 'UNCHANGED');
      if (match && !C.setDecision(imp.preview, it.id, 'skip')) { imp.decisions[it.id] = 'skip'; n++; }
    });
    if (kind === 'reset') imp.decisions = {};
    imp.groups = groupByMeaning(imp.preview, st());
    renderSummary(); renderGroupsTable(); renderBar(); renderSteps();
    announce(t('tb.done', { n: n }));
    var b = q('[data-act="bulk"][data-arg="' + kind + '"]'); if (b && !b.disabled) b.focus(); else { var c2 = q('#xcms-commit'); if (c2 && !c2.disabled) c2.focus(); }
  }
  function decide(id, decision) {
    var imp = mem.imp; if (!imp) return;
    var e = C.setDecision(imp.preview, id, decision);
    if (e) { toast(e.message, 'warn'); return; }
    imp.decisions[id] = decision;
    imp.groups = groupByMeaning(imp.preview, st());
    renderSummary(); renderGroupsTable(); renderBar(); renderSteps();
    var it = imp.byId[id];
    announce(t('d.' + decision) + ': ' + (it && it.key ? it.key : ''));
  }

  // ---------------------------------------------------------------- columns + media links panels
  function renderCols() {
    var el = q('#xcms-cols'); if (!el) return;
    var imp = mem.imp, tot = { exact: 0, alias: 0, user: 0, ignored: 0, missing: 0 }, body = '', pendingAny = false;
    C.SHEET_ORDER.forEach(function (canon) {
      var ps = imp.parsed.sheets[canon]; if (!ps || !imp.origCols[canon]) return;
      var det = ps.columns, ov = imp.colOverrides[canon] || {}, pend = imp.colPending[canon] || {}, sugg = {};
      det.suggestions.forEach(function (s) { sugg[s.index] = true; });
      var trs = '';
      imp.origCols[canon].headers.forEach(function (h, i) {
        var idx = String(i);
        if (!String(h).trim() && !own(ov, idx)) return;
        var key = det.map[idx] || '', status = own(ov, idx) ? 'user' : key ? (sugg[idx] ? 'alias' : 'exact') : 'ignored';
        tot[status]++;
        var curVal = own(pend, idx) ? pend[idx] : key;
        if (own(pend, idx) && pend[idx] !== key) pendingAny = true;
        var opts = '<option value="">' + th('cols.ignore') + '</option>' + C.SHEETS[canon].columns.map(function (c) { return '<option value="' + esc(c.key) + '"' + (curVal === c.key ? ' selected' : '') + '>' + esc(c.header) + (c.required ? ' *' : '') + '</option>'; }).join('');
        var badge = status === 'exact' ? 'b-green' : status === 'alias' ? 'b-teal' : status === 'user' ? 'b-amber' : 'b-grey';
        trs += '<tr><td><bdi>' + esc(h) + '</bdi></td><td><label class="x-sr" for="xcms-col-' + canon + '-' + idx + '">' + th('cols.sel', { col: h, sheet: canon }) + '</label><select class="inp" style="min-height:38px;border-radius:14px" id="xcms-col-' + canon + '-' + idx + '" data-colmap data-sheet="' + esc(canon) + '" data-index="' + idx + '">' + opts + '</select></td><td><span class="badge ' + badge + '">' + th('cols.st.' + status) + '</span></td></tr>';
      });
      det.missing.forEach(function (m) { tot.missing++; trs += '<tr><td class="hint">' + th('cols.noCol') + '</td><td><bdi class="x-mono">' + esc(m) + '</bdi></td><td><span class="badge b-red">' + th('cols.st.missing') + '</span></td></tr>'; });
      body += '<h4 style="margin:12px 0 4px"><bdi class="x-mono">' + esc(canon) + '</bdi></h4><div class="tw"><table class="t"><thead><tr><th scope="col">' + th('cols.th.col') + '</th><th scope="col">' + th('cols.th.as') + '</th><th scope="col">' + th('cols.th.st') + '</th></tr></thead><tbody>' + trs + '</tbody></table></div>';
    });
    var hasOv = Object.keys(imp.colOverrides).some(function (k) { return Object.keys(imp.colOverrides[k]).length; });
    el.innerHTML = '<details class="x-det" id="xcms-cols-det"' + (imp.colsOpen ? ' open' : '') + '><summary>' + icon('columns') + '<span>' + th('cols.t') + '</span><span class="hint">' + th('cols.sum', tot) + '</span><span class="x-sp"></span><span class="x-chev">' + icon('chevron_down') + '</span></summary>' +
      '<div class="x-db"><p class="hint">' + th('cols.help') + '</p>' + body + '<div class="x-row" style="margin-top:12px"><button type="button" class="btn sm dark" data-act="cols-apply"' + (pendingAny ? '' : ' disabled') + '>' + icon('refresh') + th('cols.apply') + '</button>' + (hasOv ? '<button type="button" class="btn sm cream" data-act="cols-reset">' + th('cols.reset') + '</button>' : '') + '</div></div></details>';
    var det = q('#xcms-cols-det'); if (det) det.addEventListener('toggle', function () { if (mem.imp) mem.imp.colsOpen = det.open; });
  }
  function stageColumn(canon, index, value) {
    var imp = mem.imp; if (!imp) return;
    (imp.colPending[canon] = imp.colPending[canon] || {})[index] = value;
    var b = q('[data-act="cols-apply"]'); if (b) b.disabled = false;
  }
  function applyColumns() {
    var imp = mem.imp; if (!imp) return;
    Object.keys(imp.colPending).forEach(function (canon) {
      var auto = imp.origCols[canon] ? imp.origCols[canon].det.map : {}, ov = imp.colOverrides[canon] = imp.colOverrides[canon] || {};
      Object.keys(imp.colPending[canon]).forEach(function (i) { var v = imp.colPending[canon][i]; if ((auto[i] || '') === v) delete ov[i]; else ov[i] = v; });
    });
    imp.colPending = {}; imp.colsOpen = true;
    requestPreview().then(function () { announce(t('cols.applied')); var s = q('#xcms-cols-det summary'); if (s) s.focus(); });
  }
  function resetColumns() { var imp = mem.imp; if (!imp) return; imp.colOverrides = {}; imp.colPending = {}; requestPreview().then(function () { announce(t('cols.applied')); }); }
  function renderAutomap() {
    var el = q('#xcms-am'); if (!el) return;
    var linked = [], missing = [];
    mem.imp.preview.items.forEach(function (it) {
      (it.mapped || []).forEach(function (m) { linked.push({ key: it.key, file: m.file, asset: m.asset_id }); });
      it.issues.forEach(function (i) { if (i.code === 'FILE_NOT_UPLOADED') missing.push({ key: it.key, file: i.value }); });
    });
    var list = function (arr, fn) { var s = arr.slice(0, 12); return '<ul style="margin:4px 0 0;padding-inline-start:20px">' + s.map(fn).join('') + (arr.length > s.length ? '<li>' + th('more', { n: arr.length - s.length }) + '</li>' : '') + '</ul>'; };
    el.innerHTML = '<details class="x-det"' + (missing.length ? ' open' : '') + '><summary>' + icon('link') + '<span>' + th('am.t') + '</span><span class="hint">' + th('am.linked', { n: linked.length }) + ' · ' + th('am.missing', { n: missing.length }) + '</span><span class="x-sp"></span><span class="x-chev">' + icon('chevron_down') + '</span></summary><div class="x-db">' +
      (!linked.length && !missing.length ? '<p class="hint">' + th('am.none') + '</p>' : '') +
      (linked.length ? '<p><b>' + th('am.linked', { n: linked.length }) + '</b></p>' + list(linked, function (m) { return '<li><bdi class="x-mono">' + esc(m.key) + '</bdi>: ' + th('am.via', { file: m.file, asset: m.asset }) + '</li>'; }) : '') +
      (missing.length ? '<p style="margin-top:8px"><b>' + th('am.missing', { n: missing.length }) + '</b></p>' + list(missing, function (m) { return '<li><bdi class="x-mono">' + esc(m.key || '') + '</bdi>: <bdi>' + esc(m.file || '') + '</bdi></li>'; }) + '<p class="hint" style="margin-top:6px">' + th('am.upload') + '</p>' : '') +
      '</div></details>';
  }

  // ---------------------------------------------------------------- per-meaning dialog (Before / After, fix values, decisions)
  function openGroup(gk) {
    var imp = mem.imp; if (!imp) return;
    imp.openGroup = gk;
    view.lastFocus = document.activeElement;
    renderGroupDialog(gk, false);
  }
  function renderGroupDialog(gk, keep) {
    var imp = mem.imp, g = imp.groups.filter(function (x) { return x.gk === gk; })[0];
    if (!g) { imp.openGroup = null; if (view.dialog) closeDialog(false); return; }
    var oldBox = keep ? q('#xcms-overlay .dlg') : null, scroll = oldBox ? oldBox.scrollTop : 0;
    var html = '<div class="dlg x-wide" role="dialog" aria-modal="true" aria-labelledby="xcms-g-t" data-group="' + esc(gk) + '">' +
      dlgHead('xcms-g-t', '<bdi>' + esc(g.label) + '</bdi> <span class="badge ' + STATUS_BADGE[g.status] + '">' + th('st.' + g.status) + '</span>') +
      (g.ar || g.en ? '<p class="hint" style="margin:-8px 0 14px"><bdi dir="rtl">' + esc(g.ar) + '</bdi> · <bdi dir="ltr">' + esc(g.en) + '</bdi></p>' : '') +
      g.items.map(itemSection).join('') +
      (g.meaning && C.getMeaning(st(), g.meaning) ? '<a class="btn cream sm" href="#meaning-' + esc(g.meaning) + '" data-meaning="' + esc(g.meaning) + '">' + icon('external_link') + th('md.open', { id: g.meaning }) + '</a>' : '') +
      '</div>';
    var had = !!view.dialog;
    if (!had) view.lastFocus = view.lastFocus || document.activeElement;
    view.dialog = { html: html, onClose: null };
    renderOverlay();
    var box = q('#xcms-overlay .dlg');
    if (box && scroll) box.scrollTop = scroll;
    qa('#xcms-overlay form[data-editform]').forEach(renderHintChips);
    if (!keep) { var h = q('#xcms-g-t'); if (h) h.focus(); }
  }
  function itemSection(it) {
    var title = it.sheet === ASSETS ? t('md.sheet.Assets', { id: it.key || '' }) : t('md.sheet.' + it.sheet);
    return '<section class="x-sec" data-item="' + esc(it.id) + '"><div class="x-row" style="margin-bottom:6px"><h3>' + esc(title) + '</h3><span class="badge ' + STATUS_BADGE[it.status] + '" data-istatus="' + it.status + '">' + th('st.' + it.status) + '</span><span class="hint">' + th('md.where', { row: it.row }) + ' · <bdi class="x-mono">' + esc(it.sheet) + '</bdi></span></div>' +
      '<p style="margin:0 0 8px">' + whatHappens(it) + '</p>' +
      issuesHtml(it) + diffHtml(it) + decisionHtml(it) + editFormHtml(it) + '</section>';
  }
  function whatHappens(it) {
    var flow = t('short.' + it.sheet);
    if (it.status === 'NEW') return it.sheet === CORE ? th('md.NEW.core', { id: it.key }) : it.sheet === ASSETS ? th('md.NEW.asset', { id: it.key }) : th('md.NEW.flow', { flow: flow, id: it.key });
    if (it.status === 'UPDATED') return th('md.UPDATED', { n: it.changes.length });
    if (it.status === 'UNCHANGED') return th('md.UNCHANGED');
    if (it.status === 'CONFLICT') return th('md.CONFLICT') + ' ' + th(it.overridable ? 'md.CONFLICT.ow' : 'md.CONFLICT.fix');
    return th('md.ERROR');
  }
  function issueText(it, iss) {
    var code = iss.code === 'FILE_NOT_UPLOADED' && it.sheet === ASSETS ? 'FILE_NOT_UPLOADED_ASSET' : iss.code;
    var cur = it.sheet === ASSETS ? C.getAsset(st(), it.key) : null, allowed = allowedValues(iss.field);
    var vars = {
      field: { html: '<bdi class="x-mono">' + esc(fieldHeader(it.sheet, iss.field)) + '</bdi>' },
      value: iss.value !== undefined && iss.value !== null ? iss.value : (iss.code === 'ASSET_TYPE_CHANGED' && it.next ? it.next.asset_type : ''),
      other: iss.other, other_row: iss.other_row, expected: iss.expected, current: iss.current !== undefined ? iss.current : (cur ? cur.asset_type : ''),
      key: it.key || '', allowed: allowed ? allowed.join(', ') : '', max: C.LIMITS.hint_max_len, aext: C.AUDIO_EXT.join(', '), vext: C.VIDEO_EXT.join(', '), code: iss.code
    };
    return th(null, vars, (ISSUE[code] || ISSUE._)[li()]);
  }
  function issuesHtml(it) {
    if (!it.issues.length) return '';
    return '<ul class="x-iss">' + it.issues.map(function (iss) {
      var lv = iss.level === 'error' ? 'b-red' : iss.level === 'conflict' ? 'b-amber' : 'b-grey';
      return '<li data-code="' + esc(iss.code) + '"><span class="badge ' + lv + '">' + th('lv.' + iss.level) + '</span> <bdi class="x-mono">' + esc(iss.code) + '</bdi><p>' + issueText(it, iss) + '</p></li>';
    }).join('') + '</ul>';
  }
  function valHtml(v) {
    if (v === null || v === undefined || v === '') return '<span class="hint">' + th('md.empty') + '</span>';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (Array.isArray(v)) return '<bdi>' + esc(C.hintsToText(v)) + '</bdi>';
    return '<bdi>' + esc(String(v)) + '</bdi>';
  }
  function hasArabic(s) { return /[\u0600-\u06FF]/.test(s); }
  function hintsLists(it, before, after) {
    var B = C.parseHintList(before || ''), A = C.parseHintList(after || ''), bk = {}, ak = {}, hits = {};
    it.issues.forEach(function (i) { if (i.code === 'ALIAS_COLLISION') hits[C.normalizeText(i.value)] = i.other; });
    B.forEach(function (h) { bk[C.hintToText(h)] = 1; }); A.forEach(function (h) { ak[C.hintToText(h)] = 1; });
    function li2(h, cls, mark, sr, hit) {
      return '<li class="' + cls + (hit ? ' hit' : '') + '" data-hint="' + esc(C.hintToText(h)) + '">' + (mark ? '<span class="x-mk" aria-hidden="true">' + mark + '</span>' : '') + (sr ? '<span class="x-sr">' + esc(sr) + ': </span>' : '') + '<bdi>' + esc(h.text) + '</bdi>' +
        (h.lang !== (hasArabic(h.text) ? 'ar' : 'any') ? ' <span class="badge b-grey">' + esc(h.lang) + '</span>' : '') + (hit ? ' <span class="badge b-amber">' + th('md.uses', { id: hit }) + '</span>' : '') + '</li>';
    }
    var bl = B.map(function (h) { var gone = !ak[C.hintToText(h)]; return li2(h, gone ? 'del' : '', gone ? '\u2212' : '', gone ? t('md.removed') : '', null); }).join('');
    var al = A.map(function (h) { var add = !bk[C.hintToText(h)]; return li2(h, add ? 'add' : '', add ? '+' : '', add ? t('md.added') : '', hits[C.normalizeText(h.text)] || null); }).join('');
    return { before: '<ul class="x-hl" data-list="before">' + (bl || '<li class="hint">' + th('md.empty') + '</li>') + '</ul>', after: '<ul class="x-hl" data-list="after">' + (al || '<li class="hint">' + th('md.empty') + '</li>') + '</ul>' };
  }
  function diffHtml(it) {
    var head = '<thead><tr><th scope="col">' + th('md.field') + '</th><th scope="col">' + th('md.before') + '</th><th scope="col">' + th('md.after') + '</th></tr></thead>';
    if (it.changes.length) {
      return '<p class="hint" style="margin:10px 0 4px">' + th('md.diff') + '</p><div class="tw"><table class="t" data-diff="1">' + head + '<tbody>' + it.changes.map(function (ch) {
        var name = '<b>' + esc(fieldLabel(ch.field)) + '</b><div class="hint"><bdi class="x-mono">' + esc(fieldHeader(it.sheet, ch.field)) + '</bdi></div>';
        if (ch.field === 'semantic_hints') { var hl = hintsLists(it, ch.before, ch.after); return '<tr data-field="semantic_hints"><td>' + name + '</td><td>' + hl.before + '</td><td>' + hl.after + '</td></tr>'; }
        return '<tr data-field="' + esc(ch.field) + '"><td>' + name + '</td><td>' + valHtml(ch.before) + '</td><td>' + valHtml(ch.after) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    if ((it.status === 'NEW' || it.status === 'ERROR' || it.status === 'CONFLICT') && it.next && !curObj(it)) {
      return '<p class="hint" style="margin:10px 0 4px">' + th('md.newVals') + '</p><div class="tw"><table class="t">' + head + '<tbody>' + Object.keys(it.next).map(function (f) {
        var name = '<b>' + esc(fieldLabel(f)) + '</b>';
        if (f === 'semantic_hints') { var hl = hintsLists(it, '', C.hintsToText(it.next.semantic_hints)); return '<tr data-field="semantic_hints"><td>' + name + '</td><td>' + hl.before + '</td><td>' + hl.after + '</td></tr>'; }
        return '<tr><td>' + name + '</td><td><span class="hint">' + th('md.empty') + '</span></td><td>' + valHtml(it.next[f]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    return it.status === 'UNCHANGED' ? '' : '<p class="hint">' + th('md.same') + '</p>';
  }
  function curObj(it) {
    var s = st(); if (!it.key) return null;
    if (it.sheet === CORE) return C.getMeaning(s, it.key);
    if (it.sheet === F1) return C.getFlow1(s, it.key);
    if (it.sheet === F2) return C.getFlow2(s, it.key);
    return C.getAsset(s, it.key);
  }
  function decisionHtml(it) {
    var allowed = C.allowedDecisions(it);
    if (allowed.length === 1) return '';
    var name = 'xcms-dec-' + it.id.replace(/[^A-Za-z0-9_]/g, '_');
    return '<fieldset class="x-decs" style="border:0;padding:0;margin:12px 0 0"><legend class="hint" style="padding:0;margin-bottom:6px">' + th('md.decision') + '</legend>' + allowed.map(function (d) {
      return '<label><input type="radio" name="' + esc(name) + '" value="' + d + '" data-decide="' + esc(it.id) + '"' + (it.decision === d ? ' checked' : '') + '><span><b>' + th('d.' + d) + '</b><small>' + th('dh.' + d) + '</small></span></label>';
    }).join('') + '</fieldset>';
  }
  function parsedRow(it) { var s = mem.imp.parsed.sheets[it.sheet]; if (!s) return null; var r = null; s.rows.forEach(function (x) { if (x.row === it.row) r = x; }); return r; }
  function editFormHtml(it) {
    var r = parsedRow(it); if (!r || it.status === 'UNCHANGED') return '';
    var ps = mem.imp.parsed.sheets[it.sheet], inFile = {}, cellIssue = {}, fid = 'xf' + it.id.replace(/[^A-Za-z0-9_]/g, '_');
    Object.keys(ps.columns.map).forEach(function (i) { inFile[ps.columns.map[i]] = true; });
    (r.issues || []).forEach(function (i) { cellIssue[i.field] = i; });
    var key = C.SHEETS[it.sheet].key, open = it.status === 'ERROR' || (it.status === 'CONFLICT' && !it.overridable);
    var fields = C.SHEETS[it.sheet].columns.map(function (col) {
      var f = col.key, v = r.values[f], id = fid + '-' + f, present = own(r.values, f);
      var lab = '<label for="' + id + '">' + esc(fieldLabel(f)) + ' <bdi class="x-mono hint">' + esc(col.header) + '</bdi></label>';
      var note = cellIssue[f] ? '<p class="hint x-bad">' + issueText(it, cellIssue[f]) + '</p>' : (!inFile[f] && !present ? '<p class="hint">' + th('md.notInFile') + '</p>' : '');
      if (col.type === 'int') return '<div class="field">' + lab + '<input class="inp" id="' + id + '" value="' + esc(v === undefined ? '' : v) + '" readonly aria-describedby="' + id + '-h"><p class="hint" id="' + id + '-h">' + th('md.ver') + '</p></div>';
      if (col.type === 'bool') { var bv = v === true ? 'TRUE' : v === false ? 'FALSE' : ''; return '<div class="field">' + lab + '<select class="inp" id="' + id + '" name="' + f + '" data-orig="' + bv + '">' + ['', 'TRUE', 'FALSE'].map(function (o) { return '<option value="' + o + '"' + (o === bv ? ' selected' : '') + '>' + (o || esc(t('md.notset'))) + '</option>'; }).join('') + '</select>' + note + '</div>'; }
      var sv = v === undefined || v === null ? '' : String(v), allowed = allowedValues(f);
      if (allowed) { var opts = [''].concat(allowed); if (sv && opts.indexOf(sv) < 0) opts.push(sv); return '<div class="field">' + lab + '<select class="inp" id="' + id + '" name="' + f + '" data-orig="' + esc(sv) + '">' + opts.map(function (o) { return '<option value="' + esc(o) + '"' + (o === sv ? ' selected' : '') + '>' + (o ? esc(o) : esc(t('md.notset'))) + '</option>'; }).join('') + '</select>' + note + '</div>'; }
      if (f === 'semantic_hints') {
        return '<div class="field"><span class="hint" style="font-weight:600;color:var(--ink)">' + esc(fieldLabel(f)) + ' <bdi class="x-mono hint">' + esc(col.header) + '</bdi></span><div class="x-hchips" role="list"></div>' +
          '<div class="x-row"><label class="x-sr" for="' + id + '-new">' + th('md.hint.add') + '</label><input class="inp x-hint-new" id="' + id + '-new" data-form="' + fid + '" placeholder="' + esc(t('md.hint.add')) + '" autocomplete="off" style="flex:1;width:auto"><button type="button" class="btn sm cream" data-act="hint-add" data-form="' + fid + '">' + icon('plus') + th('md.hint.addBtn') + '</button></div>' +
          '<label for="' + id + '" class="hint" style="margin-top:6px">' + th('md.hint.text') + '</label><textarea class="inp" style="padding:10px 16px;min-height:72px" id="' + id + '" name="' + f + '" data-orig="' + esc(sv) + '" dir="auto" rows="3">' + esc(sv) + '</textarea>' + note + '</div>';
      }
      return '<div class="field">' + lab + '<input class="inp" id="' + id + '" name="' + f + '" value="' + esc(sv) + '" data-orig="' + esc(sv) + '" dir="auto" autocomplete="off"' + (cellIssue[f] ? ' placeholder="' + esc(t('md.type')) + '"' : '') + '>' + (f === key ? '<p class="hint">' + th('md.idWarn') + '</p>' : '') + note + '</div>';
    }).join('');
    return '<details class="x-det" style="margin:12px 0 0"' + (open ? ' open' : '') + '><summary>' + icon('edit') + th('md.edit') + '<span class="x-sp"></span><span class="x-chev">' + icon('chevron_down') + '</span></summary><div class="x-db">' +
      '<p class="hint" style="margin:0 0 10px">' + th('md.edit.help') + '</p><form id="' + fid + '" data-editform data-item="' + esc(it.id) + '" novalidate>' + fields +
      '<button type="submit" class="btn dark sm">' + icon('check') + th('md.apply') + '</button></form></div></details>';
  }
  function renderHintChips(form) {
    if (!form) return;
    var ta = form.querySelector('textarea[name="semantic_hints"]'), box = form.querySelector('.x-hchips'); if (!ta || !box) return;
    var it = mem.imp && mem.imp.byId[form.getAttribute('data-item')], hits = {};
    if (it) it.issues.forEach(function (i) { if (i.code === 'ALIAS_COLLISION') hits[C.normalizeText(i.value)] = i.other; });
    box.innerHTML = C.parseHintList(ta.value).map(function (h) {
      var txt = C.hintToText(h), other = hits[C.normalizeText(h.text)];
      return '<span class="chip' + (other ? ' c-amber' : '') + '" role="listitem" data-hint="' + esc(txt) + '"><bdi>' + esc(h.text) + '</bdi>' + (h.lang !== (hasArabic(h.text) ? 'ar' : 'any') ? '<span class="badge b-grey">' + esc(h.lang) + '</span>' : '') + (other ? '<span class="hint">' + th('md.uses', { id: other }) + '</span>' : '') +
        '<button type="button" data-act="hint-rm" data-form="' + esc(form.id) + '" data-arg="' + esc(txt) + '" aria-label="' + esc(t('md.hint.rm', { hint: txt })) + '">' + icon('close') + '</button></span>';
    }).join('');
  }
  function removeHint(formId, txt) {
    var form = document.getElementById(formId); if (!form) return;
    var ta = form.querySelector('textarea[name="semantic_hints"]'); if (!ta) return;
    ta.value = C.hintsToText(C.parseHintList(ta.value).filter(function (h) { return C.hintToText(h) !== txt; }));
    ta.setAttribute('data-dirty', '1'); renderHintChips(form);
    var b = form.querySelector('.x-hchips button'); if (b) b.focus(); else { var n = form.querySelector('.x-hint-new'); if (n) n.focus(); }
  }
  function addHint(formId) {
    var form = document.getElementById(formId); if (!form) return;
    var inp = form.querySelector('.x-hint-new'), ta = form.querySelector('textarea[name="semantic_hints"]'); if (!inp || !ta) return;
    var add = C.parseHintList(inp.value); if (!add.length) return;
    ta.value = C.hintsToText(C.parseHintList(C.parseHintList(ta.value).concat(add))); ta.setAttribute('data-dirty', '1');
    inp.value = ''; renderHintChips(form); inp.focus();
  }
  function applyEditForm(form) {
    var imp = mem.imp, it = imp && imp.byId[form.getAttribute('data-item')]; if (!it) return;
    var r = parsedRow(it); if (!r) return;
    var cellIssue = {}; (r.issues || []).forEach(function (i) { cellIssue[i.field] = true; });
    var edits = [];
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (el) {
      if (el.readOnly || !el.hasAttribute('data-dirty')) return;
      var val = el.value, orig = el.getAttribute('data-orig') || '';
      if (el.name === 'semantic_hints') { val = val.trim(); orig = orig.trim(); }
      if (val === orig && !cellIssue[el.name]) return;
      edits.push({ sheet: it.sheet, row: it.row, field: el.name, value: val });
    });
    if (!edits.length) { announce(t('md.noEdit')); toast(t('md.noEdit'), 'warn'); return; }
    edits.forEach(function (e) { imp.edits.push(e); });
    delete imp.decisions[it.id];
    recompute();
    var now2 = null; imp.preview.items.forEach(function (x) { if (x.sheet === it.sheet && x.row === it.row) now2 = x; });
    var g = now2 ? imp.groups.filter(function (x) { return x.items.indexOf(now2) >= 0; })[0] : null;
    if (g) imp.openGroup = g.gk;
    renderPreview();
    if (now2) {
      var msg = t('md.edited', { id: now2.key || '', status: t('st.' + now2.status) });
      announce(msg); toast(msg, 'ok');
      var sec = q('#xcms-overlay section[data-item="' + cssEsc(now2.id) + '"] h3'); if (sec) { sec.setAttribute('tabindex', '-1'); sec.focus(); }
    }
  }

  // ---------------------------------------------------------------- commit, result, history
  function confirmDiscard() {
    var imp = mem.imp; if (!imp) return;
    var dirty = (imp.edits && imp.edits.length) || Object.keys(imp.decisions || {}).length;
    var go = function () { mem.imp = null; renderImportPage(); later(function () { var x = q('[data-act="imp-pick"]'); if (x) x.focus(); }, 0); };
    if (!dirty) return go();
    openDialog('<div class="dlg confirm" role="alertdialog" aria-modal="true" aria-labelledby="xcms-dc-t" aria-describedby="xcms-dc-b"><div class="wi">' + icon('warning') + '</div><h2 id="xcms-dc-t">' + th('pr.over') + '</h2><p id="xcms-dc-b">' + esc(lang() === 'ar' ? 'ستضيع تعديلات القيم والقرارات الخاصة بهذا الملف. لن يتغير الكتالوج.' : 'Your value edits and decisions for this file will be lost. The catalogue is not changed.') + '</p>' +
      '<div class="acts"><button type="button" class="btn danger" data-act="dlg-ok">' + icon('trash') + th('pr.over') + '</button><button type="button" class="btn line" data-act="dlg-cancel">' + icon('close') + th('cf.cancel') + '</button></div></div>', function (ok) { if (ok) go(); }, '#xcms-overlay [data-act="dlg-cancel"].btn');
  }
  function openCommitDialog() {
    var imp = mem.imp; if (!imp) return;
    if (imp.baseFp !== C.catalogueFingerprint(st())) { var from = imp.baseVersion; recompute(); imp.notice = { from: from, to: imp.baseVersion }; renderPreview(); announce(t('pr.changed', imp.notice)); return; }
    if (!C.previewCanCommit(imp.preview)) return;
    var c = C.previewCounts(imp.preview), nw = 0, up = 0, v = ver(st());
    imp.preview.items.forEach(function (i) { if (i.decision === 'apply') { if (i.status === 'NEW') nw++; else up++; } });
    openDialog('<div class="dlg confirm" role="alertdialog" aria-modal="true" aria-labelledby="xcms-cf-t" aria-describedby="xcms-cf-b"><div class="wi x-okwi">' + icon('publish') + '</div><h2 id="xcms-cf-t">' + th('cf.t') + '</h2><p id="xcms-cf-b">' + th('cf.b') + '</p>' +
      '<div class="diff"><div><span>' + th('cf.new') + '</span><b data-k="new">' + nw + '</b></div><div><span>' + th('cf.upd') + '</span><b data-k="updated">' + up + '</b></div><div><span>' + th('cf.ow') + '</span><b data-k="overwrite">' + c.overwrite + '</b></div><div><span>' + th('cf.skip') + '</span><b data-k="skip">' + c.skip + '</b></div><div><span>' + th('cf.ver') + '</span><b>' + v + ' → ' + (v + 1) + '</b></div><div><span>' + th('res.batch') + '</span><b><bdi class="x-mono">' + esc(imp.batch.batch_id) + '</bdi></b></div></div>' +
      '<div class="acts"><button type="button" class="btn dark" data-act="dlg-ok" id="xcms-cf-ok">' + icon('success') + th('cf.ok') + '</button><button type="button" class="btn line" data-act="dlg-cancel">' + icon('close') + th('cf.cancel') + '</button></div></div>', function (ok) { if (ok) commitImport(); }, '#xcms-overlay [data-act="dlg-cancel"].btn');
  }
  function commitImport() {
    var imp = mem.imp; if (!imp || imp.stage !== 'preview' || imp.committing) return;
    var before = ver(st()), preview = imp.preview;
    imp.committing = true; renderBar(); announce(t('cm.busy'));
    Promise.resolve(R.importCommit(imp.batch, imp.decisions, imp.edits, actor())).then(function (env) {
      imp.committing = false;
      if (!view || mem.imp !== imp) return;
      if (!env || !env.ok) {
        var code = env && env.error && env.error.code;
        if (code === 'IMPORT_CONFLICT' || code === 'CONFLICT') { var from = imp.baseVersion; recompute(); imp.notice = { from: from, to: imp.baseVersion }; renderPreview(); toast(t('cm.stale'), 'warn'); announce(t('cm.stale')); return; }
        var m = t('cm.failed', { msg: errText(env && env.error) }); toast(m, 'err'); announce(m); renderBar(); return;
      }
      var after = (env.data && env.data.catalogue_version) || ver(st());
      var res = { at: C.nowIso(), batchId: imp.batch.batch_id, filename: imp.file.name, counts: (env.data && env.data.counts) || { created: 0, updated: 0 }, from: before, to: after, newMeanings: [], updated: [], skipped: 0, review: false };
      var seenNew = {}, seenUpd = {};
      preview.items.forEach(function (i) {
        if (i.decision !== 'apply' && i.decision !== 'overwrite') { res.skipped++; return; }
        if (i.sheet === ASSETS) { res.review = true; return; }
        if (i.sheet === CORE && i.status === 'NEW') { if (!seenNew[i.key]) { seenNew[i.key] = 1; res.newMeanings.push({ id: i.key, lifecycle: i.next && i.next.lifecycle }); } return; }
        if (i.status === 'NEW' && i.next && i.next.review_status === 'pending') res.review = true;
        if (!seenUpd[i.key]) { seenUpd[i.key] = 1; res.updated.push(i.key); }
      });
      res.updated = res.updated.filter(function (id) { return !seenNew[id]; });
      if (res.newMeanings.length) res.review = true;
      mem.imp = { stage: 'done', result: res };
      renderImportPage();
      var msg = t('cm.toast', { v: after }); toast(msg, 'ok'); announce(msg);
      later(function () { var h = q('#xcms-res-t'); if (h) h.focus(); }, 0);
    }, function (e) { imp.committing = false; var m = t('cm.failed', { msg: errText(e) }); toast(m, 'err'); if (view) renderBar(); });
  }
  function resultHtml(r) {
    if (!r) return '';
    var ids = function (list, isNew) { return '<ul class="x-idlist">' + list.map(function (x) { var id = isNew ? x.id : x; return '<li><bdi class="x-mono">' + esc(id) + '</bdi>' + (isNew && x.lifecycle ? ' <span class="badge b-amber">' + th('res.lc', { lc: x.lifecycle }) + '</span>' : '') + '<a class="btn sm cream" href="#meaning-' + esc(id) + '" data-meaning="' + esc(id) + '">' + th('res.open', { id: id }) + '</a></li>'; }).join('') + '</ul>'; };
    return '<div data-result="1"><div class="ch"><span class="disc">' + icon('success') + '</span><div class="x-sp"><h3 id="xcms-res-t" tabindex="-1">' + th('res.t') + '</h3><p class="sub">' + esc(fmtDate(r.at)) + '</p></div></div>' +
      '<dl class="kv mb"><dt>' + th('res.ver') + '</dt><dd data-k="version">' + r.from + ' → ' + r.to + '</dd><dt>' + th('res.created') + '</dt><dd data-k="created">' + r.counts.created + '</dd><dt>' + th('res.updated') + '</dt><dd data-k="updated">' + r.counts.updated + '</dd><dt>' + th('res.skipped') + '</dt><dd>' + r.skipped + '</dd><dt>' + th('res.batch') + '</dt><dd><bdi class="x-mono">' + esc(r.batchId) + '</bdi></dd><dt>' + th('res.file') + '</dt><dd><bdi>' + esc(r.filename) + '</bdi></dd></dl>' +
      (r.newMeanings.length ? '<p class="hint">' + th('res.new') + '</p>' + ids(r.newMeanings, true) : '') +
      (r.updated.length ? '<p class="hint" style="margin-top:12px">' + th('res.upd') + '</p>' + ids(r.updated, false) : '') +
      (r.review ? '<p class="note" style="margin-top:14px">' + icon('review') + th('res.note') + '</p>' : '') +
      '<div class="x-row" style="margin-top:14px">' + navLink('#audit', icon('history') + th('res.audit')) + (r.review ? navLink('#review', icon('review') + th('res.review')) : '') + '<button type="button" class="btn dark sm" data-act="res-again">' + icon('upload') + th('res.again') + '</button></div></div>';
  }
  function renderHistory() {
    var el = q('#xcms-hist'); if (!el) return;
    var log = st().audit_log || [], imports = [];
    log.forEach(function (e, i) { if (e.action === 'import.commit') imports.push({ e: e, idx: i }); });
    imports.reverse();
    var rows = imports.slice(0, 12).map(function (x) {
      var e = x.e, a = e.after || {}, ids = [], j = x.idx - 1;
      while (j >= 0 && /^import\.(create|update)$/.test(log[j].action) && ids.length < 400) { if (ids.indexOf(log[j].object_id) < 0) ids.push(log[j].object_id); j--; }
      ids.reverse();
      return '<tr><td>' + esc(fmtDate(e.at)) + '</td><td><bdi>' + esc(e.actor) + '</bdi></td><td><bdi>' + esc(a.filename || '') + '</bdi><div class="hint"><bdi class="x-mono">' + esc(e.object_id) + '</bdi></div></td><td>' + (a.created || 0) + '</td><td>' + (a.updated || 0) + '</td><td class="hint">' + ids.slice(0, 6).map(function (id) { return '<bdi class="x-mono">' + esc(id) + '</bdi>'; }).join(', ') + (ids.length > 6 ? ' ' + th('more', { n: ids.length - 6 }) : '') + '</td></tr>';
    }).join('');
    el.innerHTML = '<div class="ch"><span class="disc">' + icon('history') + '</span><div class="x-sp"><h3 id="xcms-h-t">' + th('h.t') + '</h3></div>' + navLink('#audit', icon('history') + th('h.audit')) + '</div>' +
      (rows ? '<div class="tw"><table class="t"><thead><tr><th scope="col">' + th('h.when') + '</th><th scope="col">' + th('h.who') + '</th><th scope="col">' + th('h.file') + '</th><th scope="col">' + th('h.created') + '</th><th scope="col">' + th('h.updated') + '</th><th scope="col">' + th('h.items') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="hint">' + th('h.empty') + '</p>');
  }

  // =====================================================================================================
  // BULK MEDIA (Media Library and Import / Export). Pending versions only, uploaded with BinaRepo.uploadMedia.
  // =====================================================================================================
  var LOCALE_ROLE = { 'ar': 'FLOW1_AR_AUDIO', 'ar-sa': 'FLOW1_AR_AUDIO', 'ar_sa': 'FLOW1_AR_AUDIO', 'en': 'FLOW1_EN_AUDIO', 'en-us': 'FLOW1_EN_AUDIO', 'en_us': 'FLOW1_EN_AUDIO', 'en-gb': 'FLOW1_EN_AUDIO', 'avatar': 'FLOW2_AVATAR' };
  function mediaKind(name) { var x = C.ext(name); return C.AUDIO_EXT.indexOf(x) >= 0 ? 'audio' : C.VIDEO_EXT.indexOf(x) >= 0 ? 'video' : null; }
  function rolesFor(kind) { return kind === 'audio' ? ['FLOW1_AR_AUDIO', 'FLOW1_EN_AUDIO'] : kind === 'video' ? ['FLOW2_AVATAR'] : []; }
  function roleFromName(name) { var m = /_(ar-SA|ar_SA|ar|en-US|en_US|en-GB|en|avatar)$/i.exec(String(name).replace(/\.[^.]+$/, '')); return m ? LOCALE_ROLE[m[1].toLowerCase()] : null; }
  function addMediaFiles(list) {
    var files = Array.prototype.slice.call(list || []); if (!files.length || !view) return;
    if (!mem.med) mem.med = { files: [], seq: 0, uploading: false, progress: null, last: null };
    var med = mem.med, fresh = [];
    files.forEach(function (file) {
      med.files = med.files.filter(function (f) { return f.name !== file.name || f.upload.state === 'done'; });
      var f = { id: 'f' + (++med.seq), file: file, name: file.name, size: file.size, type: file.type || '', kind: mediaKind(file.name), auto: null, target: { meaning_id: null, role: null }, manual: false, decision: 'pending', userDecision: false, probe: null, errors: [], warnings: [], idError: null, upload: { state: 'idle' } };
      med.files.push(f); fresh.push(f);
    });
    med.last = null;
    remapMedia(); renderMediaSection();
    announce(t('m.files', { n: med.files.length }));
    var chain = Promise.resolve();
    fresh.forEach(function (f) { chain = chain.then(function () { return probeFile(f); }).then(function () { if (view) renderMediaSection(true); }); });
  }
  function remapMedia() {
    var med = mem.med; if (!med) return;
    var s = st(), live = med.files.filter(function (f) { return f.upload.state !== 'done'; });
    var res = C.automapFiles(live.map(function (f) { return f.name; }), s);
    live.forEach(function (f, i) {
      var a = res[i] || {}; f.auto = a;
      if (!f.manual) {
        var m = a.meaning_id, r = a.role;
        if ((!m || !r) && a.asset_id) { var as = C.getAsset(s, a.asset_id); if (as && as.pending_for) { m = as.pending_for.meaning_id; r = as.pending_for.role; } }
        if (!r && f.kind) { var rr = roleFromName(f.name); if (rr && rolesFor(f.kind).indexOf(rr) >= 0) r = rr; }
        if (r && rolesFor(f.kind).indexOf(r) < 0) r = null;
        f.target = { meaning_id: m || null, role: r || (f.kind === 'video' ? 'FLOW2_AVATAR' : null) };
      }
      if (!f.userDecision) f.decision = !f.kind ? 'exclude' : (a.status === 'exact' && f.target.meaning_id && f.target.role) ? 'include' : 'pending';
      checkFile(f);
    });
  }
  function underlying(f) { var a = f.auto || {}; if (!f.kind) return 'invalid'; if (a.status === 'conflict') return a.via === 'fuzzy' ? 'suggested' : 'exact'; return a.status || 'missing'; }
  function targetKey(f) { return f.target && f.target.meaning_id && f.target.role ? f.target.meaning_id + '|' + f.target.role : null; }
  function mediaGroups() { var g = {}; (mem.med ? mem.med.files : []).forEach(function (f) { var k = targetKey(f); if (k && f.kind && f.decision !== 'exclude' && f.upload.state !== 'done') (g[k] = g[k] || []).push(f); }); return g; }
  function mediaStatus(f, groups) { if (f.upload.state === 'done') return 'uploaded'; if (!f.kind) return 'invalid'; var k = targetKey(f); if (k && groups[k] && groups[k].length > 1) return 'conflict'; return underlying(f); }
  function durForCheck(f) { if (!f.probe) return undefined; if (f.probe.unreadable) return 0; return f.probe.duration_ms; }
  function checkFile(f) {
    f.errors = []; f.warnings = [];
    if (!f.kind) return;
    if (f.probe && f.probe.unreadable && f.probe.notDecodable) { f.errors = [{ code: 'NOT_DECODABLE' }]; return; }
    var role = f.target.role || (f.kind === 'video' ? 'FLOW2_AVATAR' : 'FLOW1_AR_AUDIO');
    f.errors = C.validateMediaFile({ name: f.name, type: f.type, size: f.size, duration_ms: durForCheck(f) }, role);
  }
  /** "This browser cannot decode the codec" is reported separately from a corrupt file. */
  function probeFile(f) {
    if (!f.kind) { f.probe = { skipped: true }; return Promise.resolve(); }
    return P.Media.probe(f.file).then(function (meta) {
      if (!meta || !meta.unreadable) { f.probe = meta || { unreadable: true }; return; }
      return sniffCodec(f.file).then(function (codec) { f.probe = Object.assign({}, meta, { notDecodable: canPlayHere(f, codec) === '' }); });
    }).then(function () { checkFile(f); }, function () { f.probe = { unreadable: true }; checkFile(f); });
  }
  function canPlayHere(f, codec) { try { var el = document.createElement(f.kind === 'video' ? 'video' : 'audio'); return el.canPlayType((f.type || C.MIME_BY_EXT[C.ext(f.name)] || '') + (codec ? '; codecs="' + codec + '"' : '')); } catch (e) { return ''; } }
  function sniffCodec(file) {
    var x = C.ext(file.name);
    if (['mp4', 'mov', 'm4a'].indexOf(x) < 0 || !file.slice) return Promise.resolve(null);
    var max = 4 * 1048576, parts = file.size <= max ? [file] : [file.slice(0, max / 2), file.slice(file.size - max / 2)];
    var tags = { avc1: 'avc1.42E01E', avc3: 'avc1.42E01E', hvc1: 'hvc1.1.6.L93.B0', hev1: 'hvc1.1.6.L93.B0', av01: 'av01.0.05M.08', vp09: 'vp09.00.10.08', mp4a: 'mp4a.40.2' };
    return Promise.all(parts.map(function (p) { return p.arrayBuffer(); })).then(function (bufs) {
      var video = null, audio = null;
      bufs.forEach(function (b) { var u = new Uint8Array(b); for (var i = 0; i + 4 <= u.length && !video; i++) { var c0 = u[i]; if (c0 !== 0x61 && c0 !== 0x68 && c0 !== 0x6d && c0 !== 0x76) continue; var s = String.fromCharCode(c0, u[i + 1], u[i + 2], u[i + 3]); if (tags[s]) { if (s === 'mp4a') audio = audio || tags[s]; else video = tags[s]; } } });
      return x === 'm4a' ? audio : (video || audio);
    }, function () { return null; });
  }
  function mediaById(id) { var hit = null; (mem.med ? mem.med.files : []).forEach(function (f) { if (f.id === id) hit = f; }); return hit; }
  function mediaTarget(id, meaning, role) {
    var f = mediaById(id); if (!f || f.upload.state === 'done') return;
    f.manual = true;
    if (meaning !== null) { var m = String(meaning || '').trim().toUpperCase().replace(/[\s-]+/g, '_'); f.idError = m && !C.getMeaning(st(), m) ? m : null; f.target.meaning_id = m && !f.idError ? m : null; }
    if (role !== null) f.target.role = rolesFor(f.kind).indexOf(role) >= 0 ? role : null;
    if (f.decision !== 'exclude' || !f.userDecision) { f.decision = f.target.meaning_id && f.target.role ? 'include' : 'pending'; f.userDecision = true; }
    checkFile(f); renderMediaSection(true);
  }
  function mediaAccept(id) { var f = mediaById(id); if (!f) return; f.decision = 'include'; f.userDecision = true; checkFile(f); renderMediaSection(true); var cb = q('[data-minc="' + cssEsc(id) + '"]'); if (cb) cb.focus(); }
  function mediaInclude(id, onn) { var f = mediaById(id); if (!f) return; f.decision = onn ? 'include' : 'exclude'; f.userDecision = true; renderMediaSection(true); }
  function mediaRemove(id) { if (!mem.med) return; mem.med.files = mem.med.files.filter(function (f) { return f.id !== id; }); remapMedia(); renderMediaSection(); var b = q('[data-act="m-pick"]'); if (b) b.focus(); }
  function readyToUpload(f, groups) {
    if (f.upload.state === 'done' || f.upload.state === 'uploading' || f.decision !== 'include' || !f.kind) return false;
    if (!f.target.meaning_id || !f.target.role || !C.getMeaning(st(), f.target.meaning_id) || !f.probe || f.errors.length) return false;
    return !(groups[targetKey(f)] && groups[targetKey(f)].length > 1);
  }
  function reasonHtml(f, status) {
    var a = f.auto || {}, out = '';
    if (status === 'uploaded') return f.upload.replaces ? th('m.replaces', { asset: f.upload.replaces }) : th('m.first');
    if (!f.kind) return th('m.r.UNSUPPORTED_FILE_TYPE', { ext: C.AUDIO_EXT.concat(C.VIDEO_EXT).join(', ') });
    if (status === 'conflict') out = th('m.r.SAME_TARGET', { file: (mediaGroups()[targetKey(f)] || []).filter(function (x) { return x !== f; }).map(function (x) { return x.name; }).join(', ') });
    else if (a.via === 'asset_id') out = th('m.via.asset_id', { asset: a.asset_id });
    else if (a.via === 'filename') out = th('m.via.filename', { asset: a.asset_id });
    else if (a.via === 'convention') out = th('m.via.convention');
    else if (a.via === 'fuzzy') { var mm = /^([A-Za-z][A-Za-z0-9_]*?)_(ar-SA|ar_SA|ar|en-US|en_US|en-GB|en|avatar)$/i.exec(String(f.name).replace(/\.[^.]+$/, '')); out = th('m.via.fuzzy', { name: mm ? mm[1].toUpperCase() : f.name, id: String(a.reason || '').replace(/^CLOSE_TO_/, '') || a.meaning_id }); }
    else if (a.reason) {
      var r = a.reason;
      if (/^UNKNOWN_MEANING_/.test(r)) out = th('m.r.UNKNOWN_MEANING', { id: r.replace(/^UNKNOWN_MEANING_/, '') });
      else if (/^UNKNOWN_SUFFIX_/.test(r)) out = th('m.r.UNKNOWN_SUFFIX', { sfx: r.replace(/^UNKNOWN_SUFFIX_/, '') });
      else if (L['m.r.' + r]) out = th('m.r.' + r, { ext: C.AUDIO_EXT.concat(C.VIDEO_EXT).join(', ') });
      else out = esc(r);
    }
    if (a.status === 'exact' && a.asset_id && !a.meaning_id && !f.manual && !f.target.meaning_id) out += ' ' + th('m.r.NO_OWNER', { asset: a.asset_id });
    if (f.target.meaning_id && f.target.role) {
      var s = st(), ro = C.ROLES[f.target.role], p = ro.flow === 'flow1' ? C.getFlow1(s, f.target.meaning_id) : C.getFlow2(s, f.target.meaning_id), live = p ? p[ro.field] : null;
      out += ' <span class="hint">' + (live ? th('m.replaces', { asset: live }) : th('m.first')) + '</span>';
    }
    return out;
  }
  function checksHtml(f) {
    if (!f.kind) return '<span class="x-bad">' + th('ms.invalid') + '</span>';
    if (f.upload.state === 'failed') return '<span class="x-bad">' + th('m.failed', { msg: errText(f.upload.error) }) + '</span>';
    if (!f.probe) return '<span class="hint">' + th('m.checking') + '</span>';
    if (f.errors.length) return '<span class="x-bad">' + f.errors.map(function (e) { return e.code === 'NOT_DECODABLE' ? th('m.notDecodable') : esc(lang() === 'ar' ? (e.message_ar || e.message) : e.message); }).join(' ') + '</span>';
    return '<span class="x-ok">' + (f.probe.duration_ms > 0 ? th('m.ok', { dur: fmtSec(f.probe.duration_ms) }) : th('m.okNoDur')) + '</span>';
  }
  function focusKey() { var a = document.activeElement; if (!a || !view || !view.root.contains(a)) return null; var at = ['data-mtarget', 'data-mrole', 'data-minc', 'data-act']; for (var i = 0; i < at.length; i++) if (a.hasAttribute(at[i])) return { attr: at[i], val: a.getAttribute(at[i]), arg: a.getAttribute('data-arg') }; return a.id ? { id: a.id } : null; }
  function restoreFocus(k) { var el = k.id ? document.getElementById(k.id) : k.arg ? q('[' + k.attr + '="' + cssEsc(k.val) + '"][data-arg="' + cssEsc(k.arg) + '"]') : q('[' + k.attr + '="' + cssEsc(k.val) + '"]'); if (el && !el.disabled) el.focus(); }
  function renderMediaSection(keepFocus) {
    var el = q('#xcms-media'); if (!el) return;
    var active = keepFocus ? focusKey() : null;
    var med = mem.med, lim = C.LIMITS, s = st(), groups = mediaGroups(), files = med ? med.files : [];
    var ready = files.filter(function (f) { return readyToUpload(f, groups); });
    var probing = files.some(function (f) { return f.kind && !f.probe; });
    var conflicted = files.some(function (f) { return f.decision === 'include' && mediaStatus(f, groups) === 'conflict'; });
    var why = med && med.uploading ? th('m.uploading', { i: med.progress.i, n: med.progress.n }) : conflicted ? th('m.why.conflict') : probing ? th('m.why.checking') : !ready.length ? th('m.why.none') : th('m.ready', { n: ready.length });
    var rows = files.map(function (f) {
      var status = mediaStatus(f, groups), done = f.upload.state === 'done', busy = f.upload.state === 'uploading', dis = done || busy || (med && med.uploading);
      var badge = { exact: 'b-green', suggested: 'b-teal', missing: 'b-grey', conflict: 'b-amber', invalid: 'b-red', uploaded: 'b-green' }[status];
      var target = !f.kind ? '<span class="hint">-</span>' : done ? '<bdi class="x-mono">' + esc(f.target.meaning_id) + '</bdi><div class="hint">' + th('role.' + f.target.role) + '</div>' :
        '<div class="x-target"><label class="x-sr" for="xcms-mt-' + f.id + '">' + th('m.meaningFor', { file: f.name }) + '</label><input class="inp x-mono" id="xcms-mt-' + f.id + '" list="xcms-mids" data-mtarget="' + f.id + '" value="' + esc(f.target.meaning_id || f.idError || '') + '" placeholder="' + esc(t('m.meaning')) + '" autocomplete="off"' + (dis ? ' disabled' : '') + '>' +
        (f.idError ? '<span class="hint x-bad">' + th('m.unknownId', { id: f.idError }) + '</span>' : '') +
        '<label class="x-sr" for="xcms-mr-' + f.id + '">' + th('m.roleFor', { file: f.name }) + '</label><select class="inp" id="xcms-mr-' + f.id + '" data-mrole="' + f.id + '"' + (dis ? ' disabled' : '') + '><option value="">' + th('m.pickRole') + '</option>' + rolesFor(f.kind).map(function (r) { return '<option value="' + r + '"' + (f.target.role === r ? ' selected' : '') + '>' + th('role.' + r) + '</option>'; }).join('') + '</select></div>';
      var canInc = f.kind && f.target.meaning_id && f.target.role && !f.errors.length && f.probe && !dis;
      var accept = status === 'suggested' && f.decision !== 'include' && f.target.meaning_id && !dis ? '<div style="margin-top:6px"><button type="button" class="btn sm cream" data-act="m-accept" data-arg="' + f.id + '">' + th('m.accept', { id: f.target.meaning_id }) + '</button></div>' : '';
      var up = done ? '<span class="x-ok">' + icon('check') + '</span>' : '<div class="x-row" style="gap:4px"><label class="x-cbl" for="xcms-mi-' + f.id + '"><input type="checkbox" id="xcms-mi-' + f.id + '" data-minc="' + f.id + '"' + (f.decision === 'include' ? ' checked' : '') + (canInc || (f.decision === 'include' && !dis) ? '' : ' disabled') + '><span class="x-sr">' + th('m.upFor', { file: f.name }) + '</span></label>' + (dis ? '' : '<button type="button" class="x" data-act="m-rm" data-arg="' + f.id + '" aria-label="' + esc(t('m.rmFor', { file: f.name })) + '">' + icon('trash') + '</button>') + '</div>';
      return '<tr data-mfile="' + esc(f.name) + '" data-mstatus="' + status + '">' +
        '<td data-label="' + esc(t('m.th.file')) + '"><b><bdi>' + esc(f.name) + '</bdi></b><div class="hint"><bdi dir="ltr">' + esc(fmtBytes(f.size)) + (f.type ? ' · ' + esc(f.type) : '') + '</bdi></div></td>' +
        '<td data-label="' + esc(t('m.th.match')) + '"><span class="badge ' + badge + '" data-match="' + status + '">' + th('ms.' + status) + '</span>' + (f.manual && !done ? ' <span class="badge b-grey">' + th('m.manual') + '</span>' : '') + '</td>' +
        '<td data-label="' + esc(t('m.th.target')) + '">' + target + '</td>' +
        '<td data-label="' + esc(t('m.th.how')) + '" class="hint" style="color:var(--ink)">' + reasonHtml(f, status) + accept + '</td>' +
        '<td data-label="' + esc(t('m.th.checks')) + '">' + (done ? '<span class="x-ok">' + th('m.uploaded', { asset: f.upload.asset_id }) + '</span>' : busy ? icon('loading') : checksHtml(f)) + '</td>' +
        '<td data-label="' + esc(t('m.th.up')) + '">' + up + '</td></tr>';
    }).join('');
    var order = raw('m.orderList').split('|');
    var naming = [['SALAM_ar-SA.mp3', 'FLOW1_AR_AUDIO'], ['SALAM_en.mp3', 'FLOW1_EN_AUDIO'], ['SALAM_avatar.mp4', 'FLOW2_AVATAR']];
    el.innerHTML =
      '<div class="ch"><span class="disc">' + icon('audio_file') + '</span><div class="x-sp"><h3 id="xcms-m-t">' + th('m.t') + '</h3><p class="sub">' + th('m.s') + '</p></div></div>' +
      '<div class="note warn">' + icon('shield_check') + '<span class="x-sp">' + th('m.rule') + '</span></div>' +
      '<div class="g g2 mb">' +
        '<div class="drop" data-drop="media"><div class="disc">' + icon('upload') + '</div><b style="font-size:16px">' + th('m.drop') + '</b>' +
          '<p class="hint">' + th('m.limits', { aext: C.AUDIO_EXT.join(', '), amb: Math.round(lim.audio_max_bytes / 1048576), as: lim.audio_max_ms / 1000, vext: C.VIDEO_EXT.join(', '), vmb: Math.round(lim.video_max_bytes / 1048576), vs: lim.video_max_ms / 1000 }) + '</p>' +
          '<input type="file" id="xcms-med-file" class="x-sr x-file" multiple tabindex="-1" aria-hidden="true" accept="' + esc(C.AUDIO_EXT.concat(C.VIDEO_EXT).map(function (x) { return '.' + x; }).join(',') + ',audio/*,video/*') + '"' + (med && med.uploading ? ' disabled' : '') + '>' +
          '<button type="button" class="btn dark" data-act="m-pick"' + (med && med.uploading ? ' disabled' : '') + '>' + icon('file') + th('m.choose') + '</button></div>' +
        '<div class="card" style="box-shadow:none;border:1px solid var(--rule)"><b>' + th('m.naming') + '</b><ul style="margin:6px 0 10px;padding-inline-start:20px">' + naming.map(function (n) { return '<li><bdi class="x-mono">' + esc(n[0]) + '</bdi>: ' + th('role.' + n[1]) + '</li>'; }).join('') + '</ul>' +
          '<b>' + th('m.order') + '</b><ol style="margin:6px 0 10px;padding-inline-start:20px" class="hint">' + order.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol><p class="hint">' + th('m.noPct') + '</p></div>' +
      '</div>' +
      '<datalist id="xcms-mids">' + (s.meanings || []).map(function (m) { return '<option value="' + esc(m.meaning_id) + '">' + esc(m.canonical_ar + ' · ' + m.canonical_en) + '</option>'; }).join('') + '</datalist>' +
      (files.length ? '<div class="tw"><table class="t x-mt"><thead><tr><th scope="col">' + th('m.th.file') + '</th><th scope="col">' + th('m.th.match') + '</th><th scope="col">' + th('m.th.target') + '</th><th scope="col">' + th('m.th.how') + '</th><th scope="col">' + th('m.th.checks') + '</th><th scope="col">' + th('m.th.up') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="x-row" style="margin-top:12px"><p class="x-sp hint" role="status" style="margin:0">' + why + '</p><button type="button" class="btn cream" data-act="m-clear"' + (med && med.uploading ? ' disabled' : '') + '>' + th('m.clear') + '</button>' +
        '<button type="button" class="btn dark" data-act="m-upload" id="xcms-m-upload"' + (ready.length && !conflicted && !(med && med.uploading) ? '' : ' disabled') + '>' + icon('upload') + th('m.upload', { n: ready.length }) + '</button></div>' : '') +
      (med && med.last ? '<div class="note" style="margin-top:14px" role="status" data-media-done="1">' + icon('success') + '<span class="x-sp">' + th('m.done', { n: med.last.n }) + '</span>' + navLink('#review', icon('review') + th('m.review')) + '</div>' : '');
    if (active) restoreFocus(active);
  }
  function uploadMedia() {
    var med = mem.med; if (!med || med.uploading) return;
    var groups = mediaGroups(), list = med.files.filter(function (f) { return readyToUpload(f, groups); });
    if (!list.length) return;
    med.uploading = true; med.progress = { i: 0, n: list.length }; med.last = null;
    renderMediaSection();
    var who = actor(), done = 0, chain = Promise.resolve();
    list.forEach(function (f, idx) {
      chain = chain.then(function () {
        med.progress.i = idx + 1; f.upload = { state: 'uploading' }; if (view) renderMediaSection();
        return Promise.resolve(R.uploadMedia(f.target.meaning_id, f.target.role, f.file, who)).then(function (env) {
          if (env && env.ok) { var a = env.data || {}; f.upload = { state: 'done', asset_id: a.asset_id, replaces: a.replaces_asset_id, version: a.version }; done++; }
          else f.upload = { state: 'failed', error: env && env.error };
        }, function (e) { f.upload = { state: 'failed', error: { message: String(e && e.message || e) } }; });
      });
    });
    chain.then(function () {
      med.uploading = false; med.progress = null; med.last = { n: done, at: C.nowIso() };
      remapMedia();
      if (done) { var m = t('m.toast', { n: done }); toast(m, 'ok'); announce(m); }
      if (view) renderMediaSection();
    });
  }

  // =====================================================================================================
  // Measurements for the report (rendering the real code paths on synthetic catalogues; nothing is stored)
  // =====================================================================================================
  function syntheticState(n) {
    var base = st(), s = C.clone(base);
    s.meanings = []; s.flow1_profiles = []; s.flow2_profiles = [];
    var src = base.meanings || [];
    for (var i = 0; i < n; i++) {
      var m0 = src[i % src.length], id = 'SYN_' + String(i).padStart(4, '0'), p1 = C.getFlow1(base, m0.meaning_id), p2 = C.getFlow2(base, m0.meaning_id);
      s.meanings.push(Object.assign(C.clone(m0), { meaning_id: id, canonical_en: m0.canonical_en + ' ' + i, canonical_ar: m0.canonical_ar + ' ' + i }));
      if (p1) s.flow1_profiles.push(Object.assign(C.clone(p1), { meaning_id: id, cv_class: 'CV_' + id }));
      if (p2) s.flow2_profiles.push(Object.assign(C.clone(p2), { meaning_id: id, avatar_asset_id: null, semantic_hints: C.parseHintList(p2.semantic_hints).map(function (h) { return { text: h.text + ' ' + i, lang: h.lang }; }) }));
    }
    return s;
  }
  function measureExcelView(counts) {
    counts = counts || [50, 500];
    var out = {}, host = document.createElement('div');
    host.className = 'card'; host.style.cssText = 'position:absolute;inset-inline-start:-99999px;top:0;width:1400px;visibility:hidden';
    (view ? view.root : document.body).appendChild(host);
    var savedPreset = mem.xv.preset;
    ['overview', 'all'].forEach(function (preset) {
      mem.xv.preset = preset;
      counts.forEach(function (n) {
        var s = syntheticState(n), t0 = now();
        var rows = xvAllRows(s), html = xvTableHtml(rows, xvCols());
        host.innerHTML = '<div class="xv-scroll" style="max-height:none">' + html + '</div>';
        void host.offsetHeight;
        out[preset + '_' + n] = Math.round((now() - t0) * 10) / 10;
      });
    });
    mem.xv.preset = savedPreset;
    host.parentNode.removeChild(host);
    perf.excel_view = Object.assign({ measured_at: C.nowIso(), note: 'ms to compute readiness for every row, build and lay out the table' }, out);
    return perf.excel_view;
  }
  function measureImportPreview(counts) {
    counts = counts || [50, 500];
    var out = {};
    counts.forEach(function (n) {
      var s = syntheticState(n), model = C.exportModel(s), rawData = {};
      C.SHEET_ORDER.forEach(function (sh) { var cols = C.SHEETS[sh].columns; rawData[sh] = [cols.map(function (c) { return c.header; })].concat(model[sh].map(function (r) { return cols.map(function (c) { return r[c.key]; }); })); });
      var t0 = now(), parsed = C.parseWorkbook(rawData), pv = C.buildImportPreview(s, parsed);
      out['meanings_' + n] = { ms: Math.round(now() - t0), rows: pv.items.length };
    });
    perf.import_preview = Object.assign({ measured_at: C.nowIso(), note: 'BinaCore.parseWorkbook + buildImportPreview (the local BinaRepo.importPreview path)' }, out);
    return perf.import_preview;
  }

  // =====================================================================================================
  // Public API
  // =====================================================================================================
  var api = { version: VERSION, mount: mount, unmount: unmount };
  Object.defineProperty(api, '_internals', { enumerable: false, value: { measureExcelView: function (c) { deps(); return measureExcelView(c); }, measureImportPreview: function (c) { deps(); return measureImportPreview(c); }, lastCopy: function () { return view ? view.lastCopy || null : null; } } });
  root.BinaAdminExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
