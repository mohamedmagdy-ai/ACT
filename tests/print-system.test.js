// ======= اختبار: نظام الطباعة الجديد (معاينة داخل البرنامج + طباعة سريعة + PDF) =======
// السياق (بلاغين من صاحب المحل):
// (١) الطباعة القديمة كانت بتاخد وقت كبير عقبال ما الفاتورة تتفتح (توليد PDF كامل +
//     نافذة معاينة Electron جديدة في كل مرة).
// (٢) بعد أول تعديل (طباعة مباشرة فورية)، لقى إن نافذة طباعة ويندوز نفسها بتقول
//     "This app doesn't support print preview" — قيد معروف في Electron نفسه مش قابل
//     للإصلاح من جوه نافذة الطباعة دي — وكمان مالقاش زرار تحميل PDF بسهولة.
// الحل النهائي: doPrintPreview() (اللي كل الفواتير/الإيصالات بتنده عليها) بقت تفتح
// نفس مودال معاينة التقارير الموجود بالفعل ("m-report-preview" — شغال ومُختبر من زمان
// لكل التقارير) بدل ما تطبع على طول، فالمستخدم يشوف شكل المستند فعليًا جوه البرنامج
// (سريع، من غير توليد PDF)، وبعدين يختار "🖨️ طباعة" أو "⬇️ PDF" من نفس المكان.
// الاختبار ده بيتأكد من:
// - getSavedPrintCopies/setSavedPrintCopies بيحفظوا ويقروا صح من localStorage.
// - doPrintPreview() بتفتح مودال المعاينة (م-report-preview) بمحتوى الفاتورة، من
//   غير ما تنده printDirect على طول (يعني معندهاش "طباعة صامتة" غير متوقعة).
// - زرار "🖨️ طباعة" جوه المودال (rpPrint) هو اللي بينده فعليًا electronAPI.printDirect
//   بعدد النسخ المحفوظ.
// - زرار "⬇️ PDF" جوه المودال (downloadLastPrintAsPdf) بينده electronAPI.savePdf.
// - زرار Excel بيتخفي تلقائيًا لو المحتوى مفيهوش جدول (زي فاتورة عادية).
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
  // ===== ٢) doPrintPreview() بتفتح مودال المعاينة، مش طباعة فورية =====
  // ============================================================
  const t2 = await page.evaluate(() => {
    let printDirectCalled = false;
    window.electronAPI = {
      printDirect: () => { printDirectCalled = true; return Promise.resolve({ success: true }); },
      savePdf: () => Promise.resolve({ success: true, filePath: '/tmp/x.pdf' }),
    };
    $('print-output').innerHTML = '<div class="inv-wrap">فاتورة اختبار رقم ١٢٣</div>';
    doPrintPreview('فاتورة اختبار');
    const modal = $('m-report-preview');
    return {
      modalOpen: modal && modal.classList.contains('open'),
      titleText: $('rp-title') ? $('rp-title').textContent : '',
      bodyHtml: $('rp-body') ? $('rp-body').innerHTML : '',
      printDirectCalled,
    };
  });
  r.ok('doPrintPreview() فتحت مودال المعاينة فعليًا', t2.modalOpen);
  r.ok('عنوان المودال بيوضح اسم المستند اللي اتبعت', t2.titleText.includes('فاتورة اختبار'));
  r.ok('محتوى الفاتورة فعليًا ظاهر جوه المودال', t2.bodyHtml.includes('فاتورة اختبار رقم ١٢٣'));
  r.ok('doPrintPreview() لوحدها متنديش على printDirect (لسه محتاجة تأكيد المستخدم بالضغط على طباعة)', !t2.printDirectCalled);

  // ============================================================
  // ===== ٣) زرار "🖨️ طباعة" جوه المودال (rpPrint) بينده printDirect بعدد النسخ =====
  // ============================================================
  const t3 = await page.evaluate(() => {
    setSavedPrintCopies(3);
    let calledWith = null;
    window.electronAPI = {
      printDirect: (copies) => { calledWith = copies; return Promise.resolve({ success: true }); },
      savePdf: () => Promise.resolve({ success: true, filePath: '/tmp/x.pdf' }),
    };
    $('print-output').innerHTML = '<div>فاتورة تانية</div>';
    doPrintPreview('فاتورة تانية');
    rpPrint();
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTimeout(() => resolve({ calledWith }), 30);
      }));
    });
  });
  r.eq('زرار الطباعة جوه المودال بينده printDirect بعدد النسخ المحفوظ (3)', t3.calledWith, 3);

  // ============================================================
  // ===== ٤) زرار "⬇️ PDF" جوه المودال (downloadLastPrintAsPdf) =====
  // ============================================================
  const t4 = await page.evaluate(() => {
    let savePdfCalled = false;
    window.electronAPI = {
      printDirect: () => Promise.resolve({ success: true }),
      savePdf: () => { savePdfCalled = true; return Promise.resolve({ success: true, filePath: '/tmp/x.pdf' }); },
    };
    $('print-output').innerHTML = '<div>فاتورة للـPDF</div>';
    doPrintPreview('فاتورة للـPDF');
    downloadLastPrintAsPdf();
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTimeout(() => resolve({ savePdfCalled }), 30);
      }));
    });
  });
  r.ok('زرار PDF جوه المودال بينده savePdf فعليًا', t4.savePdfCalled);

  const t5 = await page.evaluate(() => {
    let savePdfCalled = false;
    window.electronAPI = {
      printDirect: () => Promise.resolve({ success: true }),
      savePdf: () => { savePdfCalled = true; return Promise.resolve({ success: true }); },
    };
    $('print-output').innerHTML = '';
    downloadLastPrintAsPdf();
    return { savePdfCalled };
  });
  r.ok('downloadLastPrintAsPdf متبقتش تنده savePdf لو print-output فاضي (تحذير بس)', !t5.savePdfCalled);

  // ============================================================
  // ===== ٥) زرار Excel بيتخفي تلقائيًا لو المحتوى فاتورة (مفيهوش جدول) =====
  // ============================================================
  const t6 = await page.evaluate(() => {
    $('print-output').innerHTML = '<div class="inv-wrap">فاتورة من غير جدول HTML (تفاصيلها في divs)</div>';
    doPrintPreview('فاتورة');
    const excelBtnHiddenForInvoice = $('rp-excel-btn') ? getComputedStyle($('rp-excel-btn')).display === 'none' : null;
    $('print-output').innerHTML = '<table><tr><td>صف تقرير</td></tr></table>';
    doPrintPreview('تقرير');
    const excelBtnVisibleForReport = $('rp-excel-btn') ? getComputedStyle($('rp-excel-btn')).display !== 'none' : null;
    return { excelBtnHiddenForInvoice, excelBtnVisibleForReport };
  });
  r.ok('زرار Excel مختفي لو الفاتورة مفيهاش جدول', t6.excelBtnHiddenForInvoice === true);
  r.ok('زرار Excel ظاهر لو التقرير فيه جدول فعلي', t6.excelBtnVisibleForReport === true);

  // ============================================================
  // ===== ٦) عنصر إدخال عدد النسخ موجود جوه مودال المعاينة بس (مش في الشريط العلوي =====
  // =====    العام — بناءً على طلب المستخدم إن الخيار يظهر وهو بيطبع الفاتورة بس) =====
  // ============================================================
  const t7 = await page.evaluate(() => {
    const topbarInp = $('print-copies-input');
    const modalInp = $('rp-copies-input');
    if (modalInp) { modalInp.value = 7; modalInp.dispatchEvent(new Event('change')); }
    return {
      topbarRemoved: !topbarInp,
      modalExists: !!modalInp,
      savedAfterModalChange: getSavedPrintCopies(),
    };
  });
  r.ok('عنصر النسخ اتشال من الشريط العلوي العام (زي ما المستخدم طلب)', t7.topbarRemoved);
  r.ok('عنصر إدخال عدد النسخ جوه مودال المعاينة موجود (بيظهر وقت الطباعة بس)', t7.modalExists);
  r.eq('تغيير القيمة من جوه المودال بيتحفظ فعليًا', t7.savedAfterModalChange, 7);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
