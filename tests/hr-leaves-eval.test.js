// ======= اختبار: نظام الإجازات وتقييم الموظفين (HR) =======
// الميزة دي بتضيف لملف الموظف: أرصدة إجازات (سنوية/مرضية/عارضة) بتتخصم عند التسجيل،
// وإجازة "بدون أجر" (مفيش رصيد ليها، لكن بتتخصم تلقائيًا من صافي الراتب عند الصرف
// زي السلف ونواقص الجرد بالظبط)، وتقييم أداء متعدد المحاور (١-٥ لكل محور + متوسط).
// (ملحوظة: التأمينات الاجتماعية كانت موجودة ومفصّلة بالفعل من قبل — مالهاش اختبار هنا)
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('hr-leaves-eval');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز بيانات الاختبار =====
  await page.evaluate(() => {
    CURRENT_USER = { role: 'admin', name: 'Test Admin' };
    DB.employees.push({
      id: 'EMP-HR-9001', name: 'موظف تجريبي', role: 'فني', salary: 3000, status: 'active',
      advances: [], bonuses: [], stockCharges: []
    });
  });

  // ===== ١) أرصدة الإجازات الافتراضية تتنشئ تلقائيًا أول مرة =====
  const t1 = await page.evaluate(() => {
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const bal = _ensureLeaveBalances(e);
    return { annual: bal.annual, sick: bal.sick, casual: bal.casual };
  });
  r.eq('الرصيد الافتراضي للإجازة السنوية = 21 يوم', t1.annual, 21);
  r.eq('الرصيد الافتراضي للإجازة المرضية = 15 يوم', t1.sick, 15);
  r.eq('الرصيد الافتراضي للإجازة العارضة = 6 أيام', t1.casual, 6);

  // ===== ٢) تسجيل إجازة سنوية بيخصم من الرصيد =====
  const t2 = await page.evaluate(() => {
    $('lv-emp-id').value = 'EMP-HR-9001';
    $('lv-type').value = 'annual';
    $('lv-from').value = '2026-09-01';
    $('lv-to').value = '2026-09-03';
    $('lv-days').value = 3;
    $('lv-notes').value = 'إجازة عادية';
    saveLeaveRequest();
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    return { balance: e.leaveBalances.annual, requestsCount: e.leaveRequests.length, lastType: e.leaveRequests[0].type, lastSettled: e.leaveRequests[0].settled };
  });
  r.eq('الرصيد السنوي اتخصم منه 3 أيام (بقى 18)', t2.balance, 18);
  r.eq('اتسجل طلب إجازة واحد', t2.requestsCount, 1);
  r.eq('نوع الطلب المسجل = annual', t2.lastType, 'annual');
  r.ok('الإجازة المدفوعة تتسجل settled فورًا (مفيش خصم راتب مستقبلي معلّق)', t2.lastSettled === true);

  // ===== ٣) حذف إجازة بيرجّع الرصيد (بيمر على مودال تأكيد showDangerConfirm) =====
  const t3 = await page.evaluate(() => {
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const lvId = e.leaveRequests[0].id;
    deleteLeaveRequest('EMP-HR-9001', lvId);
    document.getElementById('danger-confirm-btn').click(); // تأكيد المودال
    return { balance: e.leaveBalances.annual, requestsCount: e.leaveRequests.length };
  });
  r.eq('الرصيد رجع 21 بعد حذف الإجازة', t3.balance, 21);
  r.eq('اتشالت من سجل الطلبات', t3.requestsCount, 0);

  // ===== ٤) إجازة بدون أجر: مفيش خصم من أي رصيد، بس بتظهر معلّقة لحد الراتب =====
  const t4 = await page.evaluate(() => {
    $('lv-emp-id').value = 'EMP-HR-9001';
    $('lv-type').value = 'unpaid';
    $('lv-from').value = '2026-09-10';
    $('lv-to').value = '2026-09-11';
    $('lv-days').value = 2;
    $('lv-notes').value = '';
    saveLeaveRequest();
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const unpaidReq = e.leaveRequests.find(x => x.type === 'unpaid');
    return {
      annualBalanceUnchanged: e.leaveBalances.annual,
      sickBalanceUnchanged: e.leaveBalances.sick,
      unpaidFound: !!unpaidReq,
      unpaidSettled: unpaidReq ? unpaidReq.settled : null,
      unpaidDays: unpaidReq ? unpaidReq.days : null
    };
  });
  r.eq('رصيد السنوية ماتأثرش بإجازة بدون أجر', t4.annualBalanceUnchanged, 21);
  r.eq('رصيد المرضية ماتأثرش بإجازة بدون أجر', t4.sickBalanceUnchanged, 15);
  r.ok('اتسجل طلب إجازة بدون أجر', t4.unpaidFound);
  r.ok('الإجازة بدون أجر تتسجل غير مسدّدة (settled=false) لحد ما تتخصم من الراتب', t4.unpaidSettled === false);
  r.eq('عدد أيامها = 2', t4.unpaidDays, 2);

  // ===== ٥) صرف الراتب: خصم إجازة بدون أجر = أيام × (الراتب الأساسي / 30) =====
  const t5 = await page.evaluate(() => {
    openSalaryModal('EMP-HR-9001');
    const salUnpaidBeforeSave = SAL_UNPAID; // المفروض = 2 * (3000/30) = 200
    $('sal-month').value = '2099-02'; // شهر بعيد ومضمون إنه مش اتصرف قبل كده
    calcSalaryNet();
    const netBefore = parseFloat($('sal-net-disp').textContent);
    saveSalary();
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const unpaidReq = e.leaveRequests.find(x => x.type === 'unpaid');
    const hist = e.salaryHistory[e.salaryHistory.length - 1];
    return {
      salUnpaidBeforeSave,
      unpaidSettledAfter: unpaidReq.settled,
      unpaidSettledMonth: unpaidReq.settledMonth,
      historyUnpaidLeave: hist.unpaidLeave,
      net: hist.net,
      salUnpaidResetAfterSave: SAL_UNPAID
    };
  });
  r.eq('خصم إجازة بدون الأجر المحسوب = 200 ج (2 يوم × 3000/30)', t5.salUnpaidBeforeSave, 200);
  r.ok('طلب الإجازة بدون أجر اتقفل كمتسدد بعد صرف الراتب', t5.unpaidSettledAfter === true);
  r.eq('اتسجل الشهر الصحيح في طلب الإجازة', t5.unpaidSettledMonth, '2099-02');
  r.eq('سجل الراتب فيه قيمة خصم الإجازة بدون أجر = 200', t5.historyUnpaidLeave, 200);
  r.eq('الصافي = 3000 - 200 = 2800 (مفيش خصومات تانية)', t5.net, 2800);
  r.eq('SAL_UNPAID اترجعت صفر بعد صرف الراتب', t5.salUnpaidResetAfterSave, 0);

  // ===== ٦) تقييم الموظف متعدد المحاور =====
  const t6 = await page.evaluate(() => {
    openEvalModal('EMP-HR-9001');
    $('ev-date').value = '2026-09-15';
    $('ev-punctuality').value = 5;
    $('ev-performance').value = 4;
    $('ev-behavior').value = 3;
    $('ev-skill').value = 4;
    $('ev-notes').value = 'أداء جيد جدًا';
    saveEvaluation();
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const ev = e.evaluations[0];
    return {
      count: e.evaluations.length,
      avg: ev.avg,
      punctuality: ev.scores.punctuality,
      performance: ev.scores.performance,
      behavior: ev.scores.behavior,
      skill: ev.scores.skill,
      hasEvaluator: !!ev.evaluator && ev.evaluator !== '—'
    };
  });
  r.eq('اتسجل تقييم واحد', t6.count, 1);
  r.eq('المتوسط = (5+4+3+4)/4 = 4', t6.avg, 4);
  r.eq('محور الالتزام اتسجل صح', t6.punctuality, 5);
  r.eq('محور الأداء اتسجل صح', t6.performance, 4);
  r.eq('محور السلوك اتسجل صح', t6.behavior, 3);
  r.eq('محور المهارة اتسجل صح', t6.skill, 4);
  r.ok('اسم المُقيِّم اتسجل (من المستخدم الحالي)', t6.hasEvaluator);

  // ===== ٧) درجات التقييم بتتحصر بين 1 و5 حتى لو حد كتب رقم برّه النطاق =====
  const t7 = await page.evaluate(() => {
    openEvalModal('EMP-HR-9001');
    $('ev-date').value = '2026-09-20';
    $('ev-punctuality').value = 99; // برّه النطاق عمدًا
    $('ev-performance').value = -5; // برّه النطاق عمدًا
    $('ev-behavior').value = 3;
    $('ev-skill').value = 3;
    saveEvaluation();
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const ev = e.evaluations[e.evaluations.length - 1];
    return { punctuality: ev.scores.punctuality, performance: ev.scores.performance };
  });
  r.eq('الدرجة الأعلى من 5 بتتحصر عند 5', t7.punctuality, 5);
  r.eq('الدرجة الأقل من 1 بتتحصر عند 1', t7.performance, 1);

  // ===== ٨) حذف تقييم (بيمر على مودال تأكيد showDangerConfirm) =====
  const t8 = await page.evaluate(() => {
    const e = DB.employees.find(x => x.id === 'EMP-HR-9001');
    const beforeCount = e.evaluations.length;
    const evId = e.evaluations[0].id;
    deleteEvaluation('EMP-HR-9001', evId);
    document.getElementById('danger-confirm-btn').click(); // تأكيد المودال
    return { beforeCount, afterCount: e.evaluations.length };
  });
  r.eq('عدد التقييمات كان 2 قبل الحذف', t8.beforeCount, 2);
  r.eq('اتحذف تقييم واحد فبقى 1', t8.afterCount, 1);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  أخطاء JS:', pageErrors);

  await browser.close();
  process.exit(r.close() ? 0 : 1);
})();
