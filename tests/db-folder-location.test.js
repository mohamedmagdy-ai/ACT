// ======= اختبارات اختيار مكان نسخة قاعدة البيانات (شادو) =======
// الميزة دي مبنية على Electron IPC (main.js: choose-db-folder / get-db-folder-info /
// reset-db-folder)، فمش قادرين نختبر فتح نافذة اختيار المجلد الفعلية هنا (مفيش
// Electron في بيئة الاختبار دي أصلاً — راجع helpers.js). اللي بنتأكد منه هنا: إن
// الشاشة الجديدة بتظهر صح جوه تاب "متقدم"، وإن كل الأزرار محمية بفحص
// window.electronAPI (زي باقي ميزات Electron في البرنامج) فمينفعش ترمي أي خطأ JS
// لو حد فتح نفس ملف index.html من غير Electron خالص.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('db-folder-location');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    const btn = document.querySelector('.stab[onclick*="stab-advanced"]');
    switchStab('stab-advanced', btn);
    return {
      boxExists: !!document.getElementById('db-folder-box'),
      tabActive: document.getElementById('stab-advanced').classList.contains('active'),
    };
  });
  r.ok('بلوك مكان قاعدة البيانات موجود جوه تاب "متقدم"', t1.boxExists);
  r.ok('تاب "متقدم" بيتفعّل صح', t1.tabActive);

  const t2 = await page.evaluate(async () => {
    await renderDbFolderInfo();
    return document.getElementById('db-folder-path').textContent;
  });
  r.ok('من غير Electron، النص بيوضح إن الخاصية مش متاحة (مش بيفضل فاضي أو يرمي خطأ)', /غير متاح/.test(t2));

  const t3 = await page.evaluate(async () => {
    document.querySelectorAll('.app-toast-notification').forEach(n => n.remove());
    await chooseDbFolder();
    const toastEl = document.querySelector('.app-toast-notification');
    return toastEl ? toastEl.textContent : null;
  });
  r.ok('دوسة "اختيار مكان تاني" من غير Electron بتوري تنبيه واضح بدل ما تكسر الصفحة', !!t3 && /متاحة بس في نسخة البرنامج المثبّتة/.test(t3));

  const t4 = await page.evaluate(async () => {
    document.querySelectorAll('.app-toast-notification').forEach(n => n.remove());
    await resetDbFolderToDefault();
    const toastEl = document.querySelector('.app-toast-notification');
    return toastEl ? toastEl.textContent : null;
  });
  r.ok('زرار "الرجوع للمكان الافتراضي" برضه محمي بنفس الطريقة', !!t4 && /متاحة بس في نسخة البرنامج المثبّتة/.test(t4));

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
