// ======= اختبار: تحويل طلب صيانة أونلاين لإذن استلام رسمي =======
// بيتأكد إن convertMaintReqToRcpt() بتعبّي شاشة "إذن استلام جديد" ببيانات الطلب
// صح، وإن الحفظ الفعلي (saveRcpt) بيربط الطلب الأصلي بالإذن الجديد ويعلّمه
// "اتحول" — وإن فتح إذن استلام عادي (مش عن طريق تحويل) بيصفّر أي تحويل معلّق
// قديم عشان محدش يرتبط غلط بإذن مش بتاعه.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const { browser, page, pageErrors } = await openApp();
  const r = new TestReporter('maint-request-convert-verify');
  try {
    const setup = await page.evaluate(() => {
      CURRENT_USER = { role: 'admin', name: 'Test Admin' };
      DB.onlineMaintRequests = DB.onlineMaintRequests || [];
      DB.onlineMaintRequests.unshift({
        id: 'MREQ-0001', createdAt: Date.now(),
        device: 'غسالة', brand: 'LG', model: 'F4V5',
        issue: 'مش بتلف والمياه مش بتخرج',
        customerName: 'أحمد تجربة', customerPhone: '01099998888',
        status: 'pending', rcptId: '',
      });
      return {
        hasConvert: typeof convertMaintReqToRcpt === 'function',
        hasPull: typeof pullIncomingMaintRequests === 'function',
        hasDismiss: typeof dismissMaintReq === 'function',
      };
    });
    r.ok('دوال طلبات الصيانة الأونلاين موجودة (convert/pull/dismiss)',
      setup.hasConvert && setup.hasPull && setup.hasDismiss);

    const prefill = await page.evaluate(() => {
      convertMaintReqToRcpt('MREQ-0001');
      return {
        pendingId: _pendingMaintReqConvertId,
        cname: $('rn-cname').value,
        phone: $('rn-phone').value,
        dev: $('rn-dev') ? $('rn-dev').value : null,
        brand: $('rn-brand').value,
        model: $('rn-model').value,
        issue: $('rn-issue').value,
        notes: $('rn-notes').value,
      };
    });
    r.eq('_pendingMaintReqConvertId اتحط على الطلب الصح', prefill.pendingId, 'MREQ-0001');
    r.eq('اسم العميل اتعبّى صح', prefill.cname, 'أحمد تجربة');
    r.eq('رقم الموبايل اتعبّى صح', prefill.phone, '01099998888');
    r.eq('نوع الجهاز اتعبّى صح', prefill.dev, 'غسالة');
    r.eq('الماركة اتعبّت صح', prefill.brand, 'LG');
    r.eq('الموديل اتعبّى صح', prefill.model, 'F4V5');
    r.eq('وصف العطل اتعبّى صح', prefill.issue, 'مش بتلف والمياه مش بتخرج');
    r.ok('الملاحظات فيها إشارة إن الإذن ده جاي من طلب أونلاين', prefill.notes.indexOf('MREQ-0001') > -1);

    const afterSave = await page.evaluate(() => {
      const rec = saveRcpt();
      const req = DB.onlineMaintRequests.find(x => x.id === 'MREQ-0001');
      return {
        saved: !!rec,
        rcptId: rec ? rec.id : null,
        reqStatus: req ? req.status : null,
        reqRcptId: req ? req.rcptId : null,
        pendingAfter: _pendingMaintReqConvertId,
      };
    });
    r.ok('إذن الاستلام اتحفظ فعليًا', afterSave.saved);
    r.eq('حالة الطلب الأصلي بقت "اتحولت"', afterSave.reqStatus, 'converted');
    r.eq('رقم إذن الاستلام الجديد اتسجل على الطلب الأصلي', afterSave.reqRcptId, afterSave.rcptId);
    r.eq('_pendingMaintReqConvertId اتصفّر بعد الحفظ (منعًا لربط غلط لاحقًا)', afterSave.pendingAfter, null);

    const freshOpen = await page.evaluate(() => {
      _pendingMaintReqConvertId = 'SOME-STALE-ID';
      openRcptModal();
      return _pendingMaintReqConvertId;
    });
    r.eq('فتح "إذن استلام جديد" عادي بيصفّر أي تحويل معلّق قديم', freshOpen, null);

    // طلب تاني — لو اتجاهل، لازم يفضل قابل للتجاهل بس مش للتحويل تاني
    const dismissCheck = await page.evaluate(() => {
      DB.onlineMaintRequests.unshift({
        id: 'MREQ-0002', createdAt: Date.now(),
        device: 'تلاجة', brand: '', model: '',
        issue: 'صوت غريب', customerName: 'سارة تجربة', customerPhone: '01011112222',
        status: 'pending', rcptId: '',
      });
      dismissMaintReq('MREQ-0002');
      const req = DB.onlineMaintRequests.find(x => x.id === 'MREQ-0002');
      return { status: req ? req.status : null };
    });
    r.eq('طلب اتجاهل: الحالة بقت "متجاهلة"', dismissCheck.status, 'dismissed');

    r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
    if (pageErrors.length) console.log('  pageErrors:', pageErrors);
  } finally {
    await browser.close();
  }
  process.exit(r.close() ? 0 : 1);
})();
