// main.js — Electron main process
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
// مهم جدًا (إصلاح فعلي، مش تجميلي): لازم نحدد اسم التطبيق صراحة وأول حاجة قبل أي
// استخدام لـapp.getPath('userData') — من غيرها، Electron بيستخدم حقل "name" من
// package.json (اللي هو داخلي/تقني "sz-electron") بدل اسم واضح وثابت، فمجلد بياناتك
// الحقيقي (AppData) كان بيتحفظ باسم تقني مش متوقع، وده سبب اللخبطة اللي حصلت (كل
// نسخة كانت بتحفظ فعليًا في نفس المجلد القديم من غير ما تظهر). ملحوظة مهمة: جرّبت
// استخدام الاسم العربي الظاهر للبرنامج هنا مباشرة، لكن اكتشفت مشكلة حقيقية أثناء
// الاختبار — بيانات المسار مع اسم عربي فيه مسافات كانت بترجع المجلد الأب نفسه بدل
// مجلد فرعي مخصص للبرنامج (خطر حقيقي: ممكن يتلخبط مع برامج تانية أو يفشل الحفظ
// خالص). فاستخدمت اسم إنجليزي بسيط وثابت للتخزين الداخلي بس — الاسم اللي بيشوفه
// المستخدم في نافذة البرنامج والواجهة يفضل عربي زي ما هو تمامًا، من غير أي تغيير.
app.setName('SafiaZaghloulPOS');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { DataAccess } = require('./db/dataAccess');
const { isAllowedExternalUrl } = require('./lib/externalUrlPolicy');

// ============================================================
// ======= التحديث التلقائي المركزي (electron-updater + GitHub Releases) =======
// ============================================================
// الفكرة: البرنامج بيفحص لوحده عند الفتح (وكل كام ساعة بعد كده) لو فيه إصدار أحدث
// منشور على GitHub Releases بتاعتك، وينزّله في الخلفية من غير ما يوقف شغل المستخدم،
// وميركّبهوش إلا وقت ما يقفل ويفتح البرنامج تاني (أو لما يدوس "حدّث دلوقتي" بنفسه).
// إعداد "أين يبحث" مش هنا خالص — هو في حقل build.publish جوه package.json.
const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(win, status, extra) {
  try {
    if (win && !win.isDestroyed()) win.webContents.send('update-status', Object.assign({ status }, extra || {}));
  } catch (_e) { /* الشاشة اتقفلت أو مش جاهزة لسه — تجاهل، مش خطأ حقيقي */ }
}

function wireAutoUpdater(win) {
  // تشخيص: نوصّل حالة "isPackaged" نفسها دايمًا، حتى قبل أي حاجة تانية — عشان لو
  // حصلت مشكلة حتى قبل أي محاولة فحص، تفضل حاجة واحدة على الأقل ظاهرة في السجل.
  try { sendUpdateStatus(win, 'boot', { packaged: !!app.isPackaged }); } catch (_b) {}
  // في وضع التطوير (npm start من غير تثبيت فعلي) autoUpdater بيرمي خطأ "not packed"
  // دايمًا — ده متوقع تمامًا ومش مشكلة، فبنتجاهله بالكامل في الوضع ده.
  if (!app.isPackaged) return;
  try {
    autoUpdater.on('checking-for-update', () => sendUpdateStatus(win, 'checking'));
    autoUpdater.on('update-available', (info) => sendUpdateStatus(win, 'available', { version: info && info.version }));
    autoUpdater.on('update-not-available', () => sendUpdateStatus(win, 'not-available'));
    autoUpdater.on('download-progress', (p) => sendUpdateStatus(win, 'downloading', { percent: Math.round((p && p.percent) || 0) }));
    autoUpdater.on('update-downloaded', (info) => sendUpdateStatus(win, 'ready', { version: info && info.version }));
    autoUpdater.on('error', (err) => sendUpdateStatus(win, 'error', { message: err ? (err.message || String(err)) : 'خطأ غير معروف' }));

    // إصلاح تشخيصي مهم: كان أي استثناء متزامن (synchronous) من checkForUpdates() بيتبلع
    // هنا بصمت تام (catch فاضي) من غير ما يوصل ولا حتى لحدث 'error' — يعني لو فيه مشكلة
    // إعداد أو ملف app-update.yml ناقص/تالف، مفيش أي أثر ليها خالص في أي مكان. دلوقت
    // بنبعتها صراحة زي أي خطأ تاني عشان تظهر في سجل update-status.
    const checkNow = () => {
      try { autoUpdater.checkForUpdates(); }
      catch (_e) { sendUpdateStatus(win, 'error', { message: '(sync) ' + (_e && _e.message || String(_e)) }); }
    };
    win.webContents.once('did-finish-load', () => setTimeout(checkNow, 6000));
    // فحص دوري كل ٤ ساعات — كافي لبرنامج بيفضل شغال طول اليوم في المحل من غير ما نضغط على الشبكة كتير
    setInterval(checkNow, 4 * 60 * 60 * 1000);
    // زرار "تحقق من التحديث الآن" (شاشة الدعم الفني المخفية) — بيستخدم checkNow نفسها.
    // مهم جدًا للتشخيص: الفحص التلقائي عند الفتح بيحصل مرة واحدة بس (didFinishLoad
    // بتتفعّل مرة واحدة طول عمر النافذة)، فمفيش طريقة تانية تعيد تشغيله يدويًا غير كده.
    ipcMain.handle('check-for-updates-now', () => { checkNow(); return { success: true }; });
  } catch (_e) {
    // نفس المبدأ: لو المشكلة حصلت هنا (زي فشل تسجيل الأحداث نفسه)، برضه نوصّلها للواجهة
    // بدل ما تختفي بصمت تام ومحدش يعرف إن نظام التحديث كله واقف من الأساس.
    try { sendUpdateStatus(win, 'error', { message: '(setup) ' + (_e && _e.message || String(_e)) }); } catch (_e2) {}
  }
}

ipcMain.handle('install-update-now', () => {
  try { autoUpdater.quitAndInstall(); return { success: true }; }
  catch (err) { return { success: false, error: err && err.message }; }
});
// ======= END التحديث التلقائي =======

// ======= اختيار مكان حفظ نسخة قاعدة البيانات (شادو) على جهاز المستخدم =======
// افتراضيًا بتتحفظ جوه فولدر بيانات البرنامج بتاع الويندوز (AppData) اللي دايمًا
// على درايف C. بعض المستخدمين عايزين يختاروا درايف مختلف (زي D) عشان لو مشكلة
// حصلت في نظام التشغيل نفسه (فورمات/عطل) درايف البيانات يفضل سليم. الاختيار ده
// بيتحفظ في ملف إعداد صغير جوه AppData نفسها (مش بيتأثر لو غيّرنا مكان النسخة).
function getDbLocationConfigPath() {
  return path.join(app.getPath('userData'), 'db_location.json');
}

function readCustomDbFolder() {
  try {
    const raw = fs.readFileSync(getDbLocationConfigPath(), 'utf8');
    const cfg = JSON.parse(raw);
    return (cfg && typeof cfg.folder === 'string' && cfg.folder) ? cfg.folder : null;
  } catch (_e) {
    return null; // مفيش إعداد محفوظ، أو الملف تالف — نتجاهل ونستخدم الافتراضي
  }
}

// بيرجع المجلد اللي هنستخدمه فعليًا دلوقتي — لو المستخدم اختار مجلد مخصص لكنه بقى
// غير متاح حاليًا (فلاشة/درايف خارجي اتشال مثلاً)، نرجع تلقائيًا للمسار الافتراضي
// من غير ما نكسر البرنامج، بدل ما نرمي خطأ يوقف كل حاجة.
function resolveDbFolder() {
  const custom = readCustomDbFolder();
  if (custom) {
    try {
      if (fs.existsSync(custom) && fs.statSync(custom).isDirectory()) {
        fs.accessSync(custom, fs.constants.W_OK);
        return custom;
      }
    } catch (_e) { /* هنرجع تلقائيًا للمسار الافتراضي تحت */ }
  }
  return app.getPath('userData');
}

ipcMain.handle('choose-db-folder', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'اختر مكان حفظ نسخة قاعدة البيانات',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return { success: false, canceled: true };
    }
    const newFolder = result.filePaths[0];
    try {
      fs.accessSync(newFolder, fs.constants.W_OK);
    } catch (_e) {
      return { success: false, error: 'المجلد ده مش قابل للكتابة — اختر مجلد تاني.' };
    }
    fs.writeFileSync(getDbLocationConfigPath(), JSON.stringify({ folder: newFolder }), 'utf8');
    // نقفل النسخة الشغالة حاليًا (لو موجودة) عشان أول عملية حفظ جاية تفتح نسخة
    // جديدة في المكان المختار الجديد فورًا
    if (_shadowDA) { try { _shadowDA.close(); } catch (_e) { /* تجاهل */ } }
    _shadowDA = null;
    _shadowDAPromise = null;
    return { success: true, folder: newFolder };
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle('get-db-folder-info', () => {
  const custom = readCustomDbFolder();
  return { folder: resolveDbFolder(), isCustom: !!custom };
});

ipcMain.handle('reset-db-folder', () => {
  try {
    const p = getDbLocationConfigPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    if (_shadowDA) { try { _shadowDA.close(); } catch (_e) { /* تجاهل */ } }
    _shadowDA = null;
    _shadowDAPromise = null;
    return { success: true, folder: app.getPath('userData') };
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

// نسخة SQLite الموازية (شادو): بتتزامن تلقائيًا مع كل حفظ في localStorage، من غير
// ما تبقى المصدر الأساسي للبرنامج لسه. الهدف: نتأكد إنها بتتابع بياناتك الحقيقية صح
// أثناء استخدامك العادي للبرنامج، قبل ما نفكر نعتمد عليها بدل localStorage خالص.
let _shadowDA = null;
let _shadowDAPromise = null;
function getShadowDA() {
  if (_shadowDA) return Promise.resolve(_shadowDA);
  if (_shadowDAPromise) return _shadowDAPromise;
  const dbPath = path.join(resolveDbFolder(), 'sz_shadow.db');
  _shadowDAPromise = DataAccess.create(dbPath).then((da) => {
    _shadowDA = da;
    return da;
  }).catch((err) => {
    _shadowDAPromise = null; // نسمح بمحاولة تانية بدل ما تفضل عالقة على فشلة قديمة
    throw err;
  });
  return _shadowDAPromise;
}

ipcMain.handle('sync-to-sqlite', async (event, dbObject) => {
  try {
    const da = await getShadowDA();
    da.saveAll(dbObject);
    return { success: true };
  } catch (err) {
    // فشل هنا ميأثرش على حفظ localStorage خالص — بس بنسجّله في الـconsole عشان نتابعه
    console.error('SQLite shadow sync error:', err && err.message);
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle('load-from-sqlite', async () => {
  try {
    const da = await getShadowDA();
    const data = da.loadAll();
    return { success: true, data };
  } catch (err) {
    console.error('SQLite load error:', err && err.message);
    return { success: false, error: err && err.message };
  }
});

function createWindow() {
  // إصلاح مهم: قائمة Electron الافتراضية (File/Edit/View/Window/Help) كانت ممكن
  // تبان فوق النافذة الرئيسية من غير قصد — ده مش بس غير احترافي لبرنامج POS، لكن
  // فيه اختصارات خطيرة فعليًا زي Ctrl+R (إعادة تحميل الصفحة بالكامل) ممكن تتضغط
  // بالغلط أثناء إدخال فاتورة، فتضيع كل البيانات المكتوبة من غير أي تحذير. البرنامج
  // عنده تنقّله وواجهته الخاصة بالكامل، فمش محتاج القائمة الافتراضية دي خالص.
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // نستناها لحد ما تتحضّر عشان نكبّرها الأول ونتفادى وميض شكل صغير قبل التكبير
    title: 'ACT — نظام المبيعات والصيانة',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => {
    win.maximize(); // (1) فتح البرنامج مكبّر (Maximized) تلقائيًا كل مرة
    win.show();
  });

  // إصلاح حرج: window.open() (المُستخدمة في البرنامج لفتح روابط واتساب) كانت بتتبلع
  // بصمت من غير أي تأثير خالص — Electron افتراضيًا بيرفض فتح نوافذ جديدة لأسباب أمان،
  // من غير ما يقول للمستخدم أي حاجة. الإصلاح: أي رابط خارجي مسموح بيه (http/https،
  // أو whatsapp: لفتح تطبيق واتساب لسطح المكتب مباشرة — راجع lib/externalUrlPolicy.js)
  // بيتفتح في البرنامج المسجّل عليه على مستوى النظام، مش جوه نافذة Electron نفسها
  // (اللي أصلاً مش هيشتغل فيها واتساب صح).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // إصلاح: لصق/قص/نسخ بزرار الماوس اليمين (كليك يمين) مش شغالة في Electron افتراضيًا
  // خالص — عكس أي متصفح عادي بيوفّرها تلقائيًا. المستخدم كان مضطر يستخدم اختصار
  // الكيبورد (Ctrl+V) بس، لأن مفيش قائمة كليك-يمين بتظهر أصلاً. الحل: نبني القائمة
  // دي يدويًا ونوريها بس لما يكون المستخدم واقف فوق خانة إدخال قابلة للتعديل فعليًا.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return; // مش خانة إدخال (زي نص عادي أو صورة) — مفيش داعي لقائمة
    const items = [];
    if (params.editFlags.canCut) items.push({ label: 'قص', role: 'cut' });
    if (params.editFlags.canCopy) items.push({ label: 'نسخ', role: 'copy' });
    if (params.editFlags.canPaste) items.push({ label: 'لصق', role: 'paste' });
    if (params.editFlags.canSelectAll) items.push({ label: 'تحديد الكل', role: 'selectAll' });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  // إصلاح: Ctrl+F5 (تحديث كامل يتجاهل أي نسخة محفوظة) كان شغال تلقائيًا في أي متصفح
  // عادي، لكن Electron مالوش نفس السلوك التلقائي ده خالص — وده بقى أوضح بعد ما شلنا
  // قائمة Electron الافتراضية (اللي كانت بتوفره كجزء من قائمة Edit). النتيجة كانت
  // إن رسايل البرنامج بتقول "دوس Ctrl+F5" لكن الضغط عليه ما كانش بيعمل أي حاجة خالص،
  // والمستخدم كان مضطر يقفل البرنامج كله ويفتحه تاني. بنربطها هنا يدويًا صراحة.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.key === 'F5') {
      event.preventDefault();
      win.webContents.reloadIgnoringCache();
    }
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  if (process.env.SZ_DEV === '1') {
    win.webContents.openDevTools();
  }
  // ======= قفل أدوات المطوّر في النسخة النهائية =======
  // كانت F12 بتفتح أدوات المطوّر لأي حد من غير أي حماية خالص — ده كان مؤقت بس لتشخيص
  // مشكلة الدخول في وقتها. دلوقتي بقت مقفولة تمامًا: الطريقة الوحيدة لفتحها هي اختصار
  // مختلف تمامًا (Ctrl+Shift+Alt+D)، وحتى ده بيتطلب من المستخدم يأكّد كلمة سر مدير
  // صحيحة جوه البرنامج نفسه الأول (نفس آلية التحقق المستخدمة في كل الشاشات الحساسة
  // التانية بالبرنامج) قبل ما نسمح بفتحها فعليًا — مفيش سر جديد لازم تتذكره، هي نفس
  // كلمة سر المدير العادية اللي البرنامج أصلاً بيحميه بيها.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key.toLowerCase() === 'd' && input.control && input.shift && input.alt && input.type === 'keyDown') {
      win.webContents.send('request-devtools-auth');
    }
  });
  // بيتنادى من الواجهة (index.html) بس بعد ما تتأكد إن المستخدم كتب كلمة سر مدير
  // صحيحة فعلاً (التحقق نفسه بيحصل جوه الواجهة، مش هنا — هنا بس بننفّذ الفتح الفعلي)
  ipcMain.handle('open-devtools-confirmed', () => {
    try { win.webContents.openDevTools(); return { success: true }; }
    catch (err) { return { success: false, error: err && err.message }; }
  });

  // إصلاح حقيقي: خاصية "تكبير/تصغير حجم الخط" (A-/A+) كانت بتستخدم خاصية CSS
  // القديمة "zoom" على body مباشرة — دي بتكبّر شكل الصفحة فعلاً، لكن Chromium
  // عنده مشكلة معروفة قديمة إن أي قائمة اقتراحات تلقائية أصلية (datalist، زي
  // قايمة "اقتراح الأرقام" أو "اقتراح الأصناف" في أي شاشة منبثقة) بتترسم في
  // مكان غلط تمامًا لما body يكون عليه zoom مختلف عن 100% — وده كان بيحصل مع
  // كل مستخدم افتراضيًا لأن نسبة التكبير الافتراضية كانت 110% مش 100%. الحل:
  // نستخدم بدلها تكبير Chromium الحقيقي المدمج (setZoomFactor — نفس آلية
  // Ctrl+/Ctrl- في أي متصفح عادي)، وده بيحترم مكان القوائم المنبثقة صح لأنه
  // جزء من محرك الرسم نفسه، مش حيلة CSS خارجية.
  ipcMain.handle('set-zoom-factor', (_event, factor) => {
    try {
      const f = Math.max(0.5, Math.min(2, parseFloat(factor) || 1));
      win.webContents.setZoomFactor(f);
      return { success: true };
    } catch (err) { return { success: false, error: err && err.message }; }
  });

  wireAutoUpdater(win);

  if (process.env.SZ_TEST_PRINT === '1') {
    const fsT = require('node:fs');
    const osT = require('node:os');
    win.webContents.once('did-finish-load', async () => {
      const log = (m) => console.log('[TEST]', m);
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('sz_fb_cfg', JSON.stringify({apiKey:'test'}));`);
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`
        document.getElementById('login-user').value='admin';
        document.getElementById('login-pass').value='admin123';
        doLogin();
      `);
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(`
        document.getElementById('pw-new1').value='Admin@2026';
        document.getElementById('pw-new2').value='Admin@2026';
        confirmPassChange();
      `);
      await new Promise((r) => setTimeout(r, 1000));
      const zoomLevel = await win.webContents.executeJavaScript(`document.body.style.zoom`);
      log('مستوى الزووم الحالي: ' + zoomLevel);
      const tmpFiles = fsT.readdirSync(osT.tmpdir()).filter((f) => f.startsWith('sz-print-preview-'));
      tmpFiles.forEach((f) => { try { fsT.unlinkSync(path.join(osT.tmpdir(), f)); } catch (e) {} });
      await win.webContents.executeJavaScript(`
        printRcptDoc({id:'R-1', customer:'أحمد', customerPhone:'01000000000', device:'ثلاجة', brand:'توشيبا', model:'X1', mfg:'2024', acc:'بدون', issue:'مش بترد', notes:''});
      `);
      await new Promise((r) => setTimeout(r, 3000));
      const newFiles = fsT.readdirSync(osT.tmpdir()).filter((f) => f.startsWith('sz-print-preview-'));
      log('ملفات جديدة: ' + JSON.stringify(newFiles));
      if (newFiles.length) {
        const buf = fsT.readFileSync(path.join(osT.tmpdir(), newFiles[0]));
        const text = buf.toString('latin1');
        const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
        log('عدد الصفحات: ' + pages);
        fsT.copyFileSync(path.join(osT.tmpdir(), newFiles[0]), '/tmp/real_flow_test.pdf');
      }
      app.quit();
    });
  }

  if (process.env.SZ_TEST_SHADOW === '1') {
    win.webContents.once('did-finish-load', async () => {
      const log = (m) => console.log('[TEST]', m);
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('sz_fb_cfg', JSON.stringify({apiKey:'test'}));`);
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`
        document.getElementById('login-user').value='admin';
        document.getElementById('login-pass').value='admin123';
        doLogin();
      `);
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(`
        document.getElementById('pw-new1').value='Admin@2026';
        document.getElementById('pw-new2').value='Admin@2026';
        confirmPassChange();
      `);
      await new Promise((r) => setTimeout(r, 1000));
      log('userData path: ' + app.getPath('userData'));

      // عملية حفظ حقيقية بالظبط زي ما هيحصل عند المستخدم (إضافة عميل + saveDB())
      await win.webContents.executeJavaScript(`
        DB.customers.push({id:'C-SHADOW-TEST', name:'عميل اختبار الشادو', phone:'01000000000', branch:'BR-MAIN'});
        DB.sales.push({id:'S-SHADOW-TEST', date:'2026-08-31', customer:'عميل اختبار الشادو', total:250.5, status:'paid', branch:'BR-MAIN', items:[{name:'صنف اختبار',qty:1,price:250.5,disc:0}]});
        saveDB();
      `);
      log('استدعينا saveDB — مستنيين الـdebounce (500ms) + وقت المزامنة...');
      await new Promise((r) => setTimeout(r, 2000));

      const fsT = require('node:fs');
      const shadowPath = path.join(app.getPath('userData'), 'sz_shadow.db');
      log('ملف الشادو موجود؟ ' + fsT.existsSync(shadowPath));
      if (fsT.existsSync(shadowPath)) {
        log('حجم ملف الشادو: ' + fsT.statSync(shadowPath).size + ' بايت');
        const { DataAccess } = require('./db/dataAccess');
        const da = await DataAccess.create(shadowPath);
        const loaded = da.loadAll();
        log('عدد العملاء في الشادو: ' + loaded.customers.length);
        log('اسم العميل: ' + (loaded.customers[0] ? loaded.customers[0].name : 'مفيش'));
        log('عدد المبيعات في الشادو: ' + loaded.sales.length);
        log('إجمالي الفاتورة في الشادو (المفروض 250.5): ' + (loaded.sales[0] ? loaded.sales[0].total : 'مفيش'));
        da.close();
      }
      // اختبار الـdebounce: نستدعي saveDB خمس مرات سريعة ورا بعض (بالظبط زي ما بيحصل
      // وقت كتابة فاتورة فيها كذا صنف) — المفروض يحصل مزامنة واحدة بس في الآخر
      await win.webContents.executeJavaScript(`
        for(let i=1;i<=5;i++){
          DB.customers.push({id:'C-RAPID-'+i, name:'عميل سريع '+i, branch:'BR-MAIN'});
          saveDB();
        }
      `);
      log('استدعينا saveDB خمس مرات سريعة ورا بعض...');
      await new Promise((r) => setTimeout(r, 2000));
      {
        const { DataAccess } = require('./db/dataAccess');
        const da2 = await DataAccess.create(shadowPath);
        const loaded2 = da2.loadAll();
        const rapidCustomers = loaded2.customers.filter(c => c.id.startsWith('C-RAPID-'));
        log('عدد العملاء "السريعين" اللي وصلوا للشادو (المفروض 5، يعني كلهم وصلوا في آخر مزامنة واحدة): ' + rapidCustomers.length);
        da2.close();
      }

      app.quit();
    });
  }

  if (process.env.SZ_TEST_RECOVERY === '1') {
    win.webContents.once('did-finish-load', async () => {
      const log = (m) => console.log('[TEST]', m);
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('sz_fb_cfg', JSON.stringify({apiKey:'test'}));`);
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`
        document.getElementById('login-user').value='admin';
        document.getElementById('login-pass').value='admin123';
        doLogin();
      `);
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(`
        document.getElementById('pw-new1').value='Admin@2026';
        document.getElementById('pw-new2').value='Admin@2026';
        confirmPassChange();
      `);
      await new Promise((r) => setTimeout(r, 1000));

      // مرحلة ١: نسجل عميل وفاتورة حقيقيين، ونستنى المزامنة لـSQLite تخلص
      await win.webContents.executeJavaScript(`
        DB.customers.push({id:'C-RECOVER', name:'عميل مهم جدًا', phone:'01000000000', branch:'BR-MAIN'});
        DB.sales.push({id:'S-RECOVER', date:'2026-08-31', customer:'عميل مهم جدًا', total:999.75, status:'paid', branch:'BR-MAIN', items:[]});
        saveDB();
      `);
      await new Promise((r) => setTimeout(r, 1000));
      log('اتسجل عميل وفاتورة، واتستنى مزامنة SQLite');

      // مرحلة ٢: نحاكي "كارثة" — نمسح localStorage بالكامل (زي ما لو حصل مسح متصفح
      // بالغلط أو امتلاء مساحة)، بس من غير ما نلمس ملف SQLite خالص
      await win.webContents.executeJavaScript(`localStorage.removeItem('${'sz_db_v1'}');`);
      log('محاكينا كارثة: مسحنا localStorage بالكامل (زي مسح متصفح بالغلط)');
      const lsCheck = await win.webContents.executeJavaScript(`localStorage.getItem('sz_db_v1') === null`);
      log('تأكيد: localStorage فاضية فعليًا دلوقتي (قبل الريلود مباشرة)؟ ' + lsCheck);

      // مرحلة ٣: نعمل reload كامل للصفحة — البرنامج هيحمّل بادئ الأمر بيانات فاضية
      // من localStorage، وبعد ثانيتين المفروض reconcileWithSqlite() تسترجع العميل
      // والفاتورة تلقائيًا من غير أي تدخل من المستخدم
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      const customersRightAfterReload = await win.webContents.executeJavaScript(`JSON.stringify({count: DB.customers.length, firstName: DB.customers[0] ? DB.customers[0].name : null})`);
      log('العملاء فورًا بعد إعادة التحميل (قبل مهلة التصالح): ' + customersRightAfterReload);

      log('مستنيين مهلة التصالح مع SQLite (2200ms + وقت الاستعلام)...');
      await new Promise((r) => setTimeout(r, 3000));

      const recovered = await win.webContents.executeJavaScript(`
        JSON.stringify({
          customerCount: DB.customers.length,
          customerName: DB.customers[0] ? DB.customers[0].name : null,
          saleTotal: DB.sales[0] ? DB.sales[0].total : null,
        })
      `);
      log('بعد التصالح التلقائي مع SQLite: ' + recovered);

      app.quit();
    });
  }

  if (process.env.SZ_TEST_RESET_CLEARS_SQLITE === '1') {
    win.webContents.once('did-finish-load', async () => {
      const log = (m) => console.log('[TEST_RESET]', m);
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('sz_fb_cfg', JSON.stringify({apiKey:'test'}));`);
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`
        document.getElementById('login-user').value='admin';
        document.getElementById('login-pass').value='admin123';
        doLogin();
      `);
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(`
        document.getElementById('pw-new1').value='Admin@2026';
        document.getElementById('pw-new2').value='Admin@2026';
        confirmPassChange();
      `);
      await new Promise((r) => setTimeout(r, 1000));

      // نسجل عميل، ننتظر مزامنة SQLite تخلص فعليًا
      await win.webContents.executeJavaScript(`
        DB.customers.push({id:'C-BEFORE-RESET', name:'عميل قبل المسح', branch:'BR-MAIN'});
        saveDB();
      `);
      await new Promise((r) => setTimeout(r, 1200));
      log('اتسجل عميل، واتستنت مزامنة SQLite');

      // نعمل "مسح كل البيانات" فعليًا (نفس الزرار الحقيقي) — منستناش الدالة نفسها
      // تخلص هنا، عشان نلحق نفحص SQLite قبل ما الـreload الداخلي (بعد 1200ms) يحصل
      win.webContents.executeJavaScript(`_doResetAllData();`);

      // نفحص SQLite فورًا (قبل ما الـreload الداخلي يحصل) للتأكد هل الاستدعاء نفسه نظّفها ولا لأ
      await new Promise(r=>setTimeout(r, 800));
      const immediateCheck = await win.webContents.executeJavaScript(`
        (async function(){
          try {
            const res = await window.electronAPI.loadFromSqlite();
            return JSON.stringify({ customersInSqlite: (res.data.customers||[]).length });
          } catch(e) { return 'ERROR: ' + e.message; }
        })();
      `);
      log('فحص SQLite قبل الـreload الداخلي (بعد 800ms من نداء المسح): ' + immediateCheck);

      await new Promise((r) => setTimeout(r, 1500));

      // نتأكد من محتوى SQLite مباشرة (المفروض فاضية تمامًا من العميل القديم)
      const sqliteAfterReset = await win.webContents.executeJavaScript(`
        (async function(){
          const res = await window.electronAPI.loadFromSqlite();
          return JSON.stringify({ customersInSqlite: (res.data.customers||[]).length, oldCustomerStillThere: (res.data.customers||[]).some(c=>c.id==='C-BEFORE-RESET') });
        })();
      `);
      log('محتوى SQLite بعد المسح: ' + sqliteAfterReset);

      app.quit();
    });
  }

  if (process.env.SZ_TEST_DIRECT_SQLITE_CLEAR === '1') {
    win.webContents.once('did-finish-load', async () => {
      const log = (m) => console.log('[TEST_DIRECT]', m);
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('sz_fb_cfg', JSON.stringify({apiKey:'test'}));`);
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`
        document.getElementById('login-user').value='admin';
        document.getElementById('login-pass').value='admin123';
        doLogin();
      `);
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(`
        document.getElementById('pw-new1').value='Admin@2026';
        document.getElementById('pw-new2').value='Admin@2026';
        confirmPassChange();
      `);
      await new Promise((r) => setTimeout(r, 1000));

      // نتصل مباشرة بـsyncToSqlite ببيانات فيها عميل، ونستنى، بعدين نتصل تاني ببيانات فاضية، من غير أي reload خالص
      const step1 = await win.webContents.executeJavaScript(`
        (async function(){
          const withCustomer = {}; DB_KEYS.forEach(k=>withCustomer[k]=[]);
          withCustomer.customers = [{id:'C-DIRECT-1', name:'عميل مباشر'}];
          const r1 = await window.electronAPI.syncToSqlite(withCustomer);
          return JSON.stringify(r1);
        })();
      `);
      log('نتيجة الحفظ الأول (فيه عميل): ' + step1);
      await new Promise(r=>setTimeout(r,300));

      const step2 = await win.webContents.executeJavaScript(`
        (async function(){
          const empty = {}; DB_KEYS.forEach(k=>empty[k]=[]);
          const r2 = await window.electronAPI.syncToSqlite(empty);
          return JSON.stringify(r2);
        })();
      `);
      log('نتيجة الحفظ الثاني (فاضي): ' + step2);
      await new Promise(r=>setTimeout(r,300));

      const finalCheck = await win.webContents.executeJavaScript(`
        (async function(){
          const res = await window.electronAPI.loadFromSqlite();
          return JSON.stringify({ customersInSqlite: (res.data.customers||[]).length });
        })();
      `);
      log('النتيجة النهائية المباشرة (المفروض صفر): ' + finalCheck);

      app.quit();
    });
  }
}

// (2) معاينة الطباعة الحقيقية: بدل ما نطبع على طول، نولّد PDF من نفس محتوى الفاتورة
// (بنفس CSS الطباعة الموجود أصلاً)، ونفتحه في نافذة جديدة بعارض PDF المدمج في
// الكروميوم — بيدّي نفس تجربة "معاينة قبل الطباعة" اللي في جوجل كروم العادي.
ipcMain.handle('print-preview', async (event) => {
  const contents = event.sender;
  const pdfBuffer = await contents.printToPDF({
    printBackground: true,
    landscape: false,
    pageSize: 'A4',
    // مهم جدًا: من غير السطر ده، Electron بيضيف هوامشه الافتراضية الخاصة (~10مم) فوق
    // أي هامش الصفحة نفسها بتحدده (زي إذن الاستلام اللي متصمم بالظبط على 296مم جوه
    // ورقة 297مم من غير أي هامش) — وده كان بيخلي المحتوى يفيض لصفحة تانية فاضية.
    // marginType:'none' بيخلي الصفحة تتحكم في هوامشها بنفسها زي ما بيحصل بالظبط في
    // متصفح عادي (Ctrl+P)، مش Electron يفرض هامش زيادة من عنده.
    margins: { marginType: 'none' },
  });

  const tmpPath = path.join(os.tmpdir(), `sz-print-preview-${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, pdfBuffer);

  const previewWin = new BrowserWindow({
    width: 900,
    height: 1000,
    title: 'معاينة الطباعة',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  previewWin.setMenuBarVisibility(false);
  await previewWin.loadURL(`file://${tmpPath}`);

  previewWin.on('closed', () => {
    try { fs.unlinkSync(tmpPath); } catch (_e) { /* تجاهل */ }
  });

  return true;
});

app.whenReady().then(() => {
  if (process.env.SZ_COMPARE === '1') {
    (async () => {
      const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') } });
      win.loadFile(path.join(__dirname, 'app', 'index.html'));
      await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('sz_fb_cfg', JSON.stringify({apiKey:'test'}));`);
      await win.webContents.reload();
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript(`
        document.getElementById('login-user').value='admin';
        document.getElementById('login-pass').value='admin123';
        doLogin();
      `);
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(`
        document.getElementById('pw-new1').value='Admin@2026';
        document.getElementById('pw-new2').value='Admin@2026';
        confirmPassChange();
      `);
      await new Promise((r) => setTimeout(r, 1000));

      async function snap(name, jsCall) {
        await win.webContents.executeJavaScript(jsCall);
        await new Promise((r) => setTimeout(r, 300));
        const buf = await win.webContents.printToPDF({ printBackground: true, landscape: false, pageSize: 'A4', margins: { marginType: 'none' } });
        fs.writeFileSync(path.join('/tmp', name + '.pdf'), buf);
        console.log('[CMP] saved /tmp/' + name + '.pdf');
      }

      // فاتورة صيانة عادية (نفس بيانات صورة المستخدم بالظبط)
      await snap('cmp_maint_regular', `
        DB.maintInvoices.push({id:'MNT-INV-0007', customer:'صفية زغلول', customerPhone:'034040559', date:'2026-07-05', exit:'invoice', payment:'كاش',
          items:[{name:'جيروبوكس kvl8300', qty:1, price:14500}], cost:14500, total:14500});
        printMaintInvDoc(DB.maintInvoices[0]);
      `);

      // فاتورة صيانة ضريبية (نفس بيانات صورة المستخدم بالظبط)
      await snap('cmp_maint_tax', `
        (function(){
          const items=[{code:'PRD-P311',name:'موتور fdm788', qty:1, price:1955, discPct:30},{code:'PRD-P230',name:'اسلاك جار khc29', qty:1, price:156, discPct:18.5}];
          let sub=0,discAmt=0;
          items.forEach(r=>{const lt=r.qty*r.price;sub+=lt;discAmt+=lt*r.discPct/100;});
          const base=sub-discAmt, tax=base*0.14, total=base+tax;
          printDtaxDoc({taxType:'maint', id:'TAX-MAIN-0006', date:'2026-08-30', customer:'مركز سليمان الطيب', customerPhone:'01006009049',
            items, sub, discAmt, invDiscPct:0, base, tax, total});
        })();
      `);

      app.quit();
    })();
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
