// ======= اختبار: أمر الشغل ميتقفلش أبدًا على فاتورة "شبح" مش موجودة فعليًا =======
// السياق (بلاغ حقيقي من صاحب المحل): عمل فاتورة صيانة مربوطة بأمر شغل، أمر الشغل اتقفل
// (وحجز رقم الفاتورة)، لكن الفاتورة نفسها ماتسجلتش فعليًا — لا في سجل الفواتير ولا في
// الخزنة — ومفيش طريقة يعمل فاتورة تانية لأن أمر الشغل شايف نفسه "مقفول بالفعل".
// السبب الجذري: الترتيب القديم كان بيقفل أمر الشغل (ويسجل رقم الفاتورة عليه) الأول،
// وبعدين يحاول يبني/يضيف سجل الفاتورة — فلو حصل أي استثناء (خطأ JS) في أي خطوة بين
// الاتنين (خصم المخزون، حفظ قاعدة البيانات، ...)، أمر الشغل يفضل "مقفول" على فاتورة
// ماتضافتش خالص لسجل الفواتير.
// الإصلاح: نفس الترتيب الآمن في الدالتين اللي بتقفلوا أمر شغل (saveMaintInv وsaveTaxMaint):
// ١) نضيف سجل الفاتورة لقاعدة البيانات (DB.maintInvoices / DB.taxInvoices) الأول.
// ٢) وبعد كده بس نعلّم أمر الشغل/الإذن كـ"مفوتر".
// كده لو حصل أي استثناء بعد الخطوة التانية، أمر الشغل (لو اتقفل) هيبقى دايمًا مشاير
// لفاتورة موجودة فعليًا في السجل — مش أبدًا لرقم "شبح". والاختبار ده بيتأكد من الخاصية
// دي فعليًا (مش بس بالقراءة) عن طريق تعمّد فشل خطوة لاحقة (خصم المخزون) ومراقبة الحالة.
// كمان بيتأكد إن آليات "التعافي" الموجودة (تنظيف مرجع فاتورة معلّق) شغالة صح لو حصل
// نوع تاني من عدم الاتساق (بيانات قديمة اتسجلت بالترتيب الغلط قبل الإصلاح ده).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('wo-invoice-atomicity');
  const { browser, page, pageErrors } = await openApp();

  await page.evaluate(() => {
    CURRENT_USER = { role: 'admin', name: 'Test Admin', perms: { all: true } };
    CURRENT_BRANCH = 'BR-MAIN';
    DB.workOrders = []; DB.receipts = []; DB.maintInvoices = []; DB.taxInvoices = [];
    DB.products = DB.products || [];
  });

  // ============================================================
  // ===== ١) المسار العادي (بدون أي عطل): الفاتورة الضريبية للصيانة =====
  // ============================================================
  const t1 = await page.evaluate(() => {
    DB.workOrders.unshift({ id: 'WO-ATOM-1', status: 'open', customer: 'عميل اختبار', device: 'لابتوب', date: '2026-09-01', cost: 0, branch: 'BR-MAIN' });
    openTaxMaintModal();
    $('tmnt-wo-id').value = 'WO-ATOM-1';
    $('tmnt-cname').value = 'عميل اختبار';
    tmntItems = [{ name: 'خدمات صيانة', qty: 1, price: 200 }];
    buildTMntItemsTable(); calcTMnt();
    const rec = saveTaxMaint(false);
    const wo = DB.workOrders.find(x => x.id === 'WO-ATOM-1');
    return {
      recOk: !!rec, recInDB: rec ? DB.taxInvoices.some(x => x.id === rec.id) : false,
      woStatus: wo.status, woInvId: wo.invId,
      invIdMatchesReal: wo.invId ? DB.taxInvoices.some(x => x.id === wo.invId) : false,
    };
  });
  r.ok('الفاتورة الضريبية اتحفظت بنجاح', t1.recOk);
  r.ok('الفاتورة فعليًا موجودة في DB.taxInvoices', t1.recInDB);
  r.eq('أمر الشغل اتقفل ("done")', t1.woStatus, 'done');
  r.ok('رقم الفاتورة المسجّل على أمر الشغل بيشاور على فاتورة حقيقية موجودة فعلاً (مش شبح)', t1.invIdMatchesReal);

  // ============================================================
  // ===== ٢) الخاصية الحرجة: لو حصل عطل في خطوة لاحقة (خصم المخزون)، أمر الشغل =====
  // =====    لازم يفضل إما "مفتوح" أو مقفول على فاتورة حقيقية — أبدًا فاتورة شبح =====
  // ============================================================
  const t2 = await page.evaluate(() => {
    DB.workOrders.unshift({ id: 'WO-ATOM-2', status: 'open', customer: 'عميل عطل', device: 'موبايل', date: '2026-09-01', cost: 0, branch: 'BR-MAIN' });
    openTaxMaintModal();
    $('tmnt-wo-id').value = 'WO-ATOM-2';
    $('tmnt-cname').value = 'عميل عطل';
    tmntItems = [{ name: 'خدمات صيانة', qty: 1, price: 150 }];
    buildTMntItemsTable(); calcTMnt();
    // نعطّل خصم المخزون عمدًا (زي أي خطأ JS غير متوقع ممكن يحصل فعليًا) عشان نتأكد
    // إن الفاتورة اتسجلت قبل ما تحصل المحاولة دي، مش بعدها
    const _origInvApply = window.invApplyItems;
    window.invApplyItems = function () { throw new Error('عطل متعمد لاختبار الحماية'); };
    let threw = false;
    try { saveTaxMaint(false); } catch (e) { threw = true; }
    window.invApplyItems = _origInvApply;
    const wo = DB.workOrders.find(x => x.id === 'WO-ATOM-2');
    const invExists = wo.invId ? (DB.taxInvoices.some(x => x.id === wo.invId) || DB.maintInvoices.some(x => x.id === wo.invId)) : true;
    return {
      threw,
      invoicePushedBeforeCrash: DB.taxInvoices.some(x => x.woId === 'WO-ATOM-2'),
      woInvId: wo.invId, woStatus: wo.status,
      noPhantomReference: invExists,
    };
  });
  r.ok('العطل المتعمد فعلاً وقف تنفيذ الدالة (استثناء اتلقط)', t2.threw);
  r.ok('رغم العطل، سجل الفاتورة كان اتسجل فعليًا في DB.taxInvoices قبل ما العطل يحصل', t2.invoicePushedBeforeCrash);
  r.ok('لا يوجد أي مرجع "فاتورة شبح": لو أمر الشغل عليه رقم فاتورة، الفاتورة دي موجودة فعليًا', t2.noPhantomReference);

  // ===== نفس الخاصية بالظبط لفاتورة الصيانة العادية (saveMaintInv) — كانت مصلّحة من قبل =====
  const t3 = await page.evaluate(() => {
    DB.workOrders.unshift({ id: 'WO-ATOM-3', status: 'open', customer: 'عميل عطل ٢', device: 'تابلت', date: '2026-09-01', cost: 0, branch: 'BR-MAIN' });
    openMaintInvModal();
    $('mi-wo-id').value = 'WO-ATOM-3';
    $('mi-cname').value = 'عميل عطل ٢';
    miItems = [{ name: 'خدمات صيانة', qty: 1, price: 100, disc: 0 }];
    buildMIItemsTable(); calcMITotal();
    const _origInvApply = window.invApplyItems;
    window.invApplyItems = function () { throw new Error('عطل متعمد لاختبار الحماية'); };
    let threw = false;
    try { saveMaintInv(false); } catch (e) { threw = true; }
    window.invApplyItems = _origInvApply;
    const wo = DB.workOrders.find(x => x.id === 'WO-ATOM-3');
    const invExists = wo.invId ? DB.maintInvoices.some(x => x.id === wo.invId) : true;
    return { threw, invoicePushedBeforeCrash: DB.maintInvoices.some(x => x.woId === 'WO-ATOM-3'), noPhantomReference: invExists };
  });
  r.ok('(فاتورة الصيانة العادية) العطل المتعمد اتلقط', t3.threw);
  r.ok('(فاتورة الصيانة العادية) الفاتورة اتسجلت قبل العطل', t3.invoicePushedBeforeCrash);
  r.ok('(فاتورة الصيانة العادية) لا يوجد مرجع فاتورة شبح', t3.noPhantomReference);

  // ============================================================
  // ===== ٣) آليات التعافي: لو (بسبب بيانات قديمة من قبل الإصلاح) أمر شغل اتقفل =====
  // =====    على مرجع فاتورة مش موجود فعليًا — النظام ينضف المرجع ويسمح تعمل فاتورة =====
  // ============================================================
  const t4 = await page.evaluate(() => {
    // نفس الحالة اللي حصلت فعليًا مع صاحب المحل: أمر شغل "مقفول" (status=done, invId
    // مسجل) لكن مفيش أي فاتورة بالرقم ده في السجل خالص
    DB.workOrders.unshift({ id: 'WO-PHANTOM-1', status: 'done', invId: 'INV-MAIN-9999', invRef: 'INV-MAIN-9999', customer: 'عميل قديم', device: 'جهاز', date: '2026-09-01', cost: 0, branch: 'BR-MAIN' });
    openMaintInvFromWO('WO-PHANTOM-1');
    const wo = DB.workOrders.find(x => x.id === 'WO-PHANTOM-1');
    const modalOpened = document.getElementById('m-maintinv-new') && getComputedStyle(document.getElementById('m-maintinv-new')).display !== 'none';
    return { woInvIdCleared: !wo.invId, woStatusReopened: wo.status === 'open', modalOpened };
  });
  r.ok('مرجع الفاتورة "الشبح" القديم اتنظف تلقائيًا', t4.woInvIdCleared);
  r.ok('أمر الشغل رجع "مفتوح" عشان تقدر تعمل الفاتورة الحقيقية', t4.woStatusReopened);
  r.ok('مودال فاتورة الصيانة اتفتح فعليًا (السماح بإصدار الفاتورة الناقصة)', t4.modalOpened);

  // نفس الشيء لكن وهو بيحاول يلغي أمر الشغل (cancelWO) — لازم يسمح، مش يمنعه ظلمًا
  const t5 = await page.evaluate(() => {
    DB.workOrders.unshift({ id: 'WO-PHANTOM-2', status: 'done', invId: 'INV-MAIN-8888', invRef: 'INV-MAIN-8888', customer: 'عميل قديم ٢', device: 'جهاز', date: '2026-09-01', cost: 0, branch: 'BR-MAIN', partsItems: [] });
    // showDangerConfirm هنا بتفتح مودال تأكيد بدل confirm() الأصلي — نحاكي الضغط على "تأكيد" مباشرة
    const _origConfirm = window.showDangerConfirm;
    window.showDangerConfirm = (msg, onYes) => onYes();
    cancelWO('WO-PHANTOM-2');
    window.showDangerConfirm = _origConfirm;
    const stillExists = DB.workOrders.some(x => x.id === 'WO-PHANTOM-2');
    return { cancelled: !stillExists };
  });
  r.ok('مرجع الفاتورة الشبح متمنعش إلغاء أمر الشغل — الإلغاء نجح', t5.cancelled);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار (غير العطل المتعمد اللي اتلقط)', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
