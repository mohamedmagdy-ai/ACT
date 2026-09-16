// ======= اختبار: تكبير/تصغير الخط بيستخدم تكبير Chromium الحقيقي مش CSS zoom =======
// المشكلة اللي بيحلها الكود ده: نسبة التكبير الافتراضية 110% كانت بتتطبّق كـ
// "document.body.style.zoom" (حيلة CSS)، وده كان بيلخبط مكان أي قائمة اقتراحات
// تلقائية أصلية (زي قائمة "أرقام تليفون سابقة" اللي بتظهر تحت خانة رقم التليفون)
// في كل شاشة منبثقة في البرنامج — مشكلة Chromium معروفة ومش مرتبطة بأي تصميم CSS
// عندنا. الحل: استخدام electronAPI.setZoomFactor (تكبير Chromium المدمج نفسه،
// زي Ctrl+/Ctrl- في أي متصفح) بدل الحيلة دي، مع رجوع تلقائي لـCSS zoom لو
// electronAPI مش متاحة (بيئة اختبار أو متصفح عادي بدون Electron).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('zoom-native');
  const { browser, page, pageErrors } = await openApp();

  // ١) من غير electronAPI (زي بيئة الاختبار دي بالظبط) — لازم يرجع لطريقة CSS
  // القديمة كحل احتياطي، عشان الخاصية تفضل شغالة برضه لو حصل أي عطل في الـIPC.
  const t1 = await page.evaluate(() => {
    delete window.electronAPI;
    document.body.style.zoom = '';
    applyZoom(1.2);
    return document.body.style.zoom;
  });
  r.eq('من غير electronAPI: بيرجع لطريقة CSS zoom كحل احتياطي', t1, '1.2');

  // ٢) مع وجود electronAPI (الحالة الحقيقية جوه Electron المُعبّأ) — لازم ينادي
  // setZoomFactor بالقيمة الصح، ويمسح CSS zoom تمامًا عشان منستخدمش الاتنين مع بعض.
  const t2 = await page.evaluate(() => {
    let captured = null;
    window.electronAPI = { setZoomFactor: (v) => { captured = v; return Promise.resolve({ success: true }); } };
    document.body.style.zoom = '1.2';
    applyZoom(1.35);
    return { captured, cssZoom: document.body.style.zoom };
  });
  r.eq('مع electronAPI: بينادي setZoomFactor بالقيمة الصح', t2.captured, 1.35);
  r.eq('مع electronAPI: بيمسح CSS zoom تمامًا (منعًا لتضارب الاتنين)', t2.cssZoom, '');

  // ٣) القيمة المحفوظة (localStorage) بتتحدث في الحالتين بنفس الطريقة
  const t3 = await page.evaluate(() => {
    applyZoom(1.25);
    return parseFloat(localStorage.getItem('sz_zoom_level'));
  });
  r.eq('القيمة بتتحفظ في localStorage عادي في الحالتين', t3, 1.25);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
