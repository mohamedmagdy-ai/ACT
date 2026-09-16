// ======= اختبار: نظام الطباعة الجديد (سريع + منفصل عن تحميل PDF) =======
// السياق (بلاغ من صاحب المحل): الطباعة القديمة كانت بتاخد وقت كبير عقبال ما الفاتورة
// تتفتح (توليد PDF كامل + نافذة معاينة جديدة في كل مرة)، وطلب: (١) زرار طباعة مباشرة
// سريع بيحفظ عدد النسخ اللي بيطبعها عادةً (نسختين: عميل + محاسب)، و(٢) زرار منفصل
// لتحميل نفس المستند كـ PDF عشان يقدر يبعته. الاختبار ده بيتأكد من:
// - getSavedPrintCopies/setSavedPrintCopies بيحفظوا ويقروا صح من localStorage (مع حدود
//   القيمة المسموحة 1-50 والقيمة الافتراضية 2).
// - doPrintPreview() بينده window.electronAPI.printDirect بعدد النسخ المحفوظ (مش
//   printPreview القديمة البطيئة) لو electronAPI متاحة.
// - downloadLastPrintAsPdf() بينده window.electronAPI.savePdf لو فيه محتوى في
//   #print-output، وبيرفض (تحذير بس، من غير أي نداء) لو #print-output فاضي.
// ملحوظة: مفيش عملية Electron حقيقية (main process/طابعة نظام تشغيل فعلية) متاحة في
// بيئة الاختبار دي (Playwright/Chromium بس) — فالاختبار بيتحقق من إن الكود بينده
// الدوال الصح بالمعاملات الصح، مش من سلوك الطباعة الفعلي على جهاز حقيقي (ده محتاج
// تجربة يدوية من صاحب المحل على نسخة سطح المكتب الحقيقية).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('print-system');
  const { browser, page, pageErrors } = await openApp();

  // ============================================================
  // ===== ١) حفظ/قراءة عدد النسخ =====
  // ============================================================
  const t1 = await page.evaluate(() => {
    localStorage.removeItem('sz_print_copies');
    const defaultVal = getSavedPrintCopies();
    setSavedPrintCopies(5);
    const afterSet5 = getSavedPrintCopies();
    setSavedPrintCopies(999); // فوق الحد الأقصى — المفروض يتقص لـ50
    const clampedHigh = getSavedPrintCopies();
    setSavedPrintCopies(0); // أقل من الحد الأدنى — المفروض يرجع للافتراضي
    const clampedLow = getSavedPrintCopies();
    setSavedPrintCopies('abc'); // قيمة مش رقم أصلاً
    const nonNumeric = getSavedPrintCopies();
    return { defaultVal, afterSet5, clampedHigh, clampedLow, nonNumeric };
  });
  r.eq('القيمة الافتراضية لعدد النسخ = 2', t1.defaultVal, 2);
  r.eq('حفظ 5 نسخ بيترجع 5 صح', t1.afterSet5, 5);
  r.eq('999 نسخة بتتقص لأقصى حد مسموح (50)', t1.clampedHigh, 50);
  r.eq('0 نسخة بترجع للقيمة الافتراضية (2)', t1.clampedLow, 2);
  r.eq('قيمة مش رقمية بترجع للقيمة الافتراضية (2)', t1.nonNumeric, 2);

  // ============================================================
  // ===== ٢) doPrintPreview() بينده printDirect بعدد النسخ المحفوظ =====
  // ============================================================
  const t2 = await page.evaluate(() => {
    setSavedPrintCopies(3);
    let calledWith = null;
    let oldPreviewCalled = false;
    window.electronAPI = {
      printDirect: (copies) => { calledWith = copies; return Promise.resolve({ success: true }); },
      printPreview: () => { oldPreviewCalled = true; return Promise.resolve(true); },
      savePdf: () => Promise.resolve({ success: true, filePath: '/tmp/x.pdf' }),
    };
    $('print-output').innerHTML = '<div>فاتورة اختبار</div>';
    doPrintPreview();
    return new Promise(resolve => {
      // نستنى فريمين (زي المنطق الداخلي) قبل ما نتأكد من النتيجة
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTimeout(() => resolve({ calledWith, oldPreviewCalled }), 30);
      }));
    });
  });
  r.eq('doPrintPreview بينده printDirect بعدد النسخ المحفوظ (3)', t2.calledWith, 3);
  r.ok('doPrintPreview مبقاش بينده printPreview القديمة البطيئة', !t2.oldPreviewCalled);

  // ============================================================
  // ===== ٣) downloadLastPrintAsPdf() =====
  // ============================================================
  const t3 = await page.evaluate(() => {
    let savePdfCalled = false;
    window.electronAPI = {
      printDirect: () => Promise.resolve({ success: true }),
      savePdf: () => { savePdfCalled = true; return Promise.resolve({ success: true, filePath: '/tmp/x.pdf' }); },
    };
    $('print-output').innerHTML = '<div>فاتورة اختبار للـPDF</div>';
    downloadLastPrintAsPdf();
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTimeout(() => resolve({ savePdfCalled }), 30);
      }));
    });
  });
  r.ok('downloadLastPrintAsPdf بينده savePdf لما فيه محتوى في print-output', t3.savePdfCalled);

  const t4 = await page.evaluate(() => {
    let savePdfCalled = false;
    window.electronAPI = {
      printDirect: () => Promise.resolve({ success: true }),
      savePdf: () => { savePdfCalled = true; return Promise.resolve({ success: true }); },
    };
    $('print-output').innerHTML = '';
    downloadLastPrintAsPdf();
    return { savePdfCalled };
  });
  r.ok('downloadLastPrintAsPdf متبقتش تنده savePdf لو print-output فاضي (تحذير بس)', !t4.savePdfCalled);

  // ============================================================
  // ===== ٤) عنصر إدخال عدد النسخ في الـtopbar بيتحدّث صح =====
  // ============================================================
  const t5 = await page.evaluate(() => {
    const inp = $('print-copies-input');
    const existsBeforeChange = !!inp;
    if (inp) { inp.value = 7; inp.dispatchEvent(new Event('change')); }
    return { existsBeforeChange, savedAfterChange: getSavedPrintCopies() };
  });
  r.ok('عنصر إدخال عدد النسخ موجود فعليًا في الصفحة', t5.existsBeforeChange);
  r.eq('تغيير القيمة من الـtopbar بيتحفظ فعليًا', t5.savedAfterChange, 7);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
