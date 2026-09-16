// preload.js — يعرض دالة آمنة واحدة بس للصفحة، من غير ما يدّيها أي وصول لـ Node/Electron مباشر
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printPreview: () => ipcRenderer.invoke('print-preview'),
  // طباعة سريعة مباشرة (بدون توليد PDF/نافذة معاينة وسيطة) — بتفتح نافذة طباعة نظام
  // التشغيل الأصلية على طول، وبتاخد عدد النسخ المطلوبة كمعامل
  printDirect: (copies) => ipcRenderer.invoke('print-direct', copies),
  // تحميل آخر مستند اتطبع كملف PDF (نافذة "حفظ باسم" حقيقية)
  savePdf: (suggestedName) => ipcRenderer.invoke('print-save-pdf', suggestedName),
  syncToSqlite: (dbObject) => ipcRenderer.invoke('sync-to-sqlite', dbObject),
  loadFromSqlite: () => ipcRenderer.invoke('load-from-sqlite'),
  // فتح أدوات المطوّر — بس بعد ما الواجهة نفسها تتأكد إن اللي بيطلب ده أدمن حقيقي
  // كاتب كلمة سره الصحيحة (راجع main.js وindex.html لتفاصيل التحقق)
  openDevToolsConfirmed: () => ipcRenderer.invoke('open-devtools-confirmed'),
  onRequestDevToolsAuth: (callback) => ipcRenderer.on('request-devtools-auth', callback),
  // تكبير/تصغير حجم الخط الحقيقي (Chromium zoom) — بديل خاصية CSS zoom اللي كانت
  // بتلخبط مكان قوائم الاقتراحات التلقائية (datalist) في كل الشاشات المنبثقة
  setZoomFactor: (factor) => ipcRenderer.invoke('set-zoom-factor', factor),

  // ======= التحديث التلقائي المركزي =======
  // البرنامج بيفحص لوحده لو فيه نسخة أحدث على GitHub Releases، وينزّلها في الخلفية
  // من غير ما يقاطع شغل المستخدم، ويورّي حالة التحديث جوه واجهة البرنامج نفسها
  // (مش نافذة نظام تشغيل منفصلة) عشان يفضل شكل البرنامج موحّد زي باقي الرسائل.
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, data) => callback(data)),
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
  checkForUpdatesNow: () => ipcRenderer.invoke('check-for-updates-now'),

  // ======= اختيار مكان حفظ نسخة قاعدة البيانات (شادو) =======
  chooseDbFolder: () => ipcRenderer.invoke('choose-db-folder'),
  getDbFolderInfo: () => ipcRenderer.invoke('get-db-folder-info'),
  resetDbFolder: () => ipcRenderer.invoke('reset-db-folder'),
});
