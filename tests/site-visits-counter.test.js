// ======= اختبار: عدّاد زوار الموقع (طلب المستخدم — يظهر له هو بس، في البرنامج والموبايل) =======
// الفكرة: الموقع (زائر مجهول، بدون تسجيل دخول) بيضيف مستند فاضي شبه تمامًا لكل زيارة
// جديدة جوه sz_data/_site_visits_incoming/items (نفس فكرة الرسائل/الطلبات الأونلاين
// بالظبط). البرنامج (مسجل دخول بحساب المدير) هو بس اللي بيقرا الـsubcollection دي كل ٣٠
// ثانية، يعدّها، يمسحها، ويزوّد رقم إجمالي الزيارات (sz_data/_site_visits) بعملية ذرّية
// (FieldValue.increment) — الاختبار ده بيتأكد من الآلية دي كاملة، وإن الرقم بيوصل صح
// للوحة تحكم البرنامج (renderDash) ولملخص الموبايل (buildOwnerDashboardSnapshot).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('site-visits-counter');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    return {
      hasFn: typeof pullIncomingSiteVisits === 'function',
      hasSetter: typeof _setSiteVisitsTotal === 'function',
      hasVar: typeof SITE_VISITS_TOTAL === 'number',
    };
  });
  r.ok('الدالة pullIncomingSiteVisits موجودة', t1.hasFn);
  r.ok('الدالة _setSiteVisitsTotal موجودة', t1.hasSetter);
  r.ok('المتغيّر SITE_VISITS_TOTAL موجود (رقم)', t1.hasVar);

  // ===== ١) تحديث الرقم محليًا (_setSiteVisitsTotal) بيتخزّن، وبيبان في لوحة التحكم =====
  const t2 = await page.evaluate(() => {
    _setSiteVisitsTotal(47);
    const stored = parseInt(localStorage.getItem('sz_site_visits_total') || '0', 10);
    const tileVisible = ($('dash-stats').innerHTML || '').indexOf('زوار الموقع') !== -1;
    return { total: SITE_VISITS_TOTAL, stored, tileVisible };
  });
  r.eq('SITE_VISITS_TOTAL اتحدّث محليًا لـ47', t2.total, 47);
  r.eq('الرقم اتخزّن في localStorage عشان يبان فورًا بعد إعادة فتح البرنامج', t2.stored, 47);
  r.ok('كارت "👁 زوار الموقع" ظاهر في لوحة التحكم (renderDash)', t2.tileVisible);

  // ===== ٢) رقم الزيارات بيوصل لملخص الموبايل (buildOwnerDashboardSnapshot) =====
  const t3 = await page.evaluate(() => {
    _setSiteVisitsTotal(103);
    const snap = buildOwnerDashboardSnapshot();
    return { siteVisitsTotal: snap ? snap.siteVisitsTotal : null };
  });
  r.eq('buildOwnerDashboardSnapshot() بترجّع siteVisitsTotal صح (اللي هيوصل للوحة متابعة الموبايل)', t3.siteVisitsTotal, 103);

  // ===== ٣) المحاكاة الكاملة: زيارتين جداد وصلوا من الموقع (زوار حقيقيين) — لازم:
  // (أ) يتعدّوا صح، (ب) المستندات المؤقتة دي تتمسح بعد المعالجة، (ج) الرقم الإجمالي
  // يزيد بمقدارهم فعليًا (مش يستبدل، يزيد) =====
  const t4 = await page.evaluate(async () => {
    const deletedRefs = [];
    const incomingDocs = [
      { ref: { delete: () => { deletedRefs.push('v1'); return Promise.resolve(); } } },
      { ref: { delete: () => { deletedRefs.push('v2'); return Promise.resolve(); } } },
    ];
    let totalSetCalls = [];
    let currentTotal = 100; // كان فيه ١٠٠ زيارة متجمّعة من قبل كده

    window.firebase = { firestore: { FieldValue: { increment: (n) => ({ __increment: n }) } } };
    FS_COL = {
      doc: (name) => {
        if (name === '_site_visits_incoming') {
          return { collection: () => ({ get: () => Promise.resolve({ empty: false, size: incomingDocs.length, forEach: (fn) => incomingDocs.forEach(fn) }) }) };
        }
        if (name === '_site_visits') {
          return {
            set: (data) => {
              totalSetCalls.push(data);
              if (data.total && data.total.__increment) currentTotal += data.total.__increment;
              return Promise.resolve();
            },
            get: () => Promise.resolve({ exists: true, data: () => ({ total: currentTotal }) }),
          };
        }
        return { collection: () => ({ get: () => Promise.resolve({ empty: true, size: 0, forEach: () => {} }) }) };
      },
    };

    pullIncomingSiteVisits();
    // بننتظر شوية عشان كل الـPromise chains الداخلية تخلص (مفيش شبكة حقيقية هنا فكله سريع)
    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      deletedCount: deletedRefs.length,
      incrementUsed: totalSetCalls.length ? totalSetCalls[0].total.__increment : null,
      totalAfter: SITE_VISITS_TOTAL,
    };
  });
  r.eq('المستندين المؤقتين (الزيارتين) اتمسحوا بعد المعالجة (٢ مستند)', t4.deletedCount, 2);
  r.eq('الزيادة المستخدمة في FieldValue.increment صح (٢ زيارة جديدة، مش استبدال)', t4.incrementUsed, 2);
  r.eq('الرقم الإجمالي بعد المعالجة زاد فعليًا (١٠٠ + ٢ = ١٠٢) ووصل للمتغيّر المحلي', t4.totalAfter, 102);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
