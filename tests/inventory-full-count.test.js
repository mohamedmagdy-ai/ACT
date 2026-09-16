// ======= اختبار: جرد شامل للمخزن (كل الأصناف مرة واحدة) =======
// الميزة دي بتحل مشكلتين: (١) الجرد كان بيتم صنف صنف بس ("كشف حركة صنف")، دلوقتي
// فيه شاشة واحدة تدخل فيها العدد الفعلي لكل الأصناف مرة واحدة. (٢) لو النقص سببه
// كاشير معروف، تقدر تحمّله عليه (تحصيل نقدي فوري، أو خصم من مرتبه القادم) بدل ما
// يتسجل خسارة عادية على المحل. الاختبار ده بيتأكد من:
//  - الزيادة بتتسجل تلقائيًا كتعديل مخزون (زي المعتاد تمامًا).
//  - النقص من غير موظف محدد بيفضل بيتسجل خسارة عادية (السلوك القديم لسه شغال).
//  - النقص مع تحديد موظف: مفيش خسارة على المحل، وبيتحمّلها الموظف كـ"نقص جرد" معلّق.
//  - اختيار "نقدًا دلوقتي": بيقفل التحميل كمتسدد، وبيسجل تحصيل نقدي حقيقي (إيراد).
//  - اختيار "مع الراتب": مفيش أي أثر مالي فورًا، بس بيظهر في حساب المرتب القادم
//    ("السلف" بالظبط) ويتقفل تلقائيًا بمجرد ما الراتب يتصرف.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('inventory-full-count');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز بيانات الاختبار =====
  await page.evaluate(() => {
    CURRENT_USER = { role: 'admin', name: 'Test Admin' };
    DB.products.push(
      { id: 'PRD-TEST-9001', name: 'صنف زيادة', qty: 10, buy: 50, sell: 80 },
      { id: 'PRD-TEST-9002', name: 'صنف نقص عادي', qty: 5, buy: 20, sell: 35 },
      { id: 'PRD-TEST-9003', name: 'صنف نقص فوري', qty: 8, buy: 30, sell: 45 },
      { id: 'PRD-TEST-9004', name: 'صنف نقص مع الراتب', qty: 4, buy: 25, sell: 40 }
    );
    DB.employees.push({ id: 'EMP-TEST-9001', name: 'كاشير تجريبي', role: 'كاشير', salary: 1000, status: 'active', advances: [], bonuses: [], stockCharges: [] });
  });

  // ===== ١) زيادة في الجرد =====
  const t1 = await page.evaluate(() => {
    _ficCounts = { 'PRD-TEST-9001': '12' };
    _ficEmp = {};
    saveFullInventoryCount();
    const p = DB.products.find(x => x.id === 'PRD-TEST-9001');
    const exp = DB.expenses.find(e => e.prodId === 'PRD-TEST-9001' && e.type === 'فروق جرد');
    return { qty: p.qty, expenseFound: !!exp, expenseAmount: exp ? exp.amount : null };
  });
  r.ok('الرصيد اتحدث للعدد الفعلي الجديد (زيادة)', t1.qty === 12);
  r.ok('اتسجل مصروف "فروق جرد" تلقائي للزيادة', t1.expenseFound);
  r.eq('قيمة الزيادة اتسجلت كإيراد (مبلغ سالب) = -100 (2×50)', t1.expenseAmount, -100);

  // ===== ٢) نقص من غير تحديد موظف — لازم يفضل بيتسجل خسارة عادية زي الأول =====
  const t2 = await page.evaluate(() => {
    _ficCounts = { 'PRD-TEST-9002': '3' };
    _ficEmp = {};
    saveFullInventoryCount();
    const p = DB.products.find(x => x.id === 'PRD-TEST-9002');
    const exp = DB.expenses.find(e => e.prodId === 'PRD-TEST-9002' && e.type === 'فروق جرد');
    const emp = DB.employees.find(x => x.id === 'EMP-TEST-9001');
    return { qty: p.qty, expenseFound: !!exp, expenseAmount: exp ? exp.amount : null, empChargesCount: (emp.stockCharges || []).length };
  });
  r.ok('الرصيد اتحدث للعدد الفعلي الجديد (نقص عادي)', t2.qty === 3);
  r.ok('اتسجلت خسارة "فروق جرد" عادية على المحل زي المعتاد', t2.expenseFound);
  r.eq('قيمة الخسارة = 40 (2×20)', t2.expenseAmount, 40);
  r.eq('مفيش أي تحميل اتسجل على الموظف (مفيش موظف محدد)', t2.empChargesCount, 0);

  // ===== ٣) نقص محمّل على موظف — اختيار "نقدًا دلوقتي" =====
  const t3 = await page.evaluate(() => {
    _ficCounts = { 'PRD-TEST-9003': '6' };
    _ficEmp = { 'PRD-TEST-9003': 'EMP-TEST-9001' };
    saveFullInventoryCount();
    const p = DB.products.find(x => x.id === 'PRD-TEST-9003');
    const lossExp = DB.expenses.find(e => e.prodId === 'PRD-TEST-9003' && e.type === 'فروق جرد');
    const emp = DB.employees.find(x => x.id === 'EMP-TEST-9001');
    const chargeBefore = (emp.stockCharges || []).find(c => c.prodId === 'PRD-TEST-9003');
    // نلقط قيمة settled قبل الحل فورًا — chargeBefore مرجع لنفس الكائن، فلو قرأناها
    // بعد _sccResolve هنقرأ القيمة الجديدة (مرجع، مش نسخة) مش القديمة
    const chargeSettledBeforeSnapshot = chargeBefore ? chargeBefore.settled : null;
    // _sccResolve('now') بيتنادى تلقائيًا لأي تحميل جديد بعد الحفظ (الطابور بيفتح المودال)
    _sccResolve('now');
    const chargeAfter = (emp.stockCharges || []).find(c => c.prodId === 'PRD-TEST-9003');
    const collectExp = DB.expenses.find(e => e.type === 'تحصيل نقص جرد' && e.empId === 'EMP-TEST-9001');
    return {
      qty: p.qty,
      lossOnShopExists: !!lossExp,
      chargeCreated: !!chargeBefore,
      chargeAmount: chargeBefore ? chargeBefore.amount : null,
      chargeSettledBefore: chargeSettledBeforeSnapshot,
      chargeSettledAfter: chargeAfter ? chargeAfter.settled : null,
      chargeMode: chargeAfter ? chargeAfter.mode : null,
      collectExpenseFound: !!collectExp,
      collectExpenseAmount: collectExp ? collectExp.amount : null,
      collectExpenseNonCash: collectExp ? !!collectExp.nonCash : null,
    };
  });
  r.ok('الرصيد اتحدث للعدد الفعلي الجديد (نقص محمّل)', t3.qty === 6);
  r.ok('مفيش خسارة "فروق جرد" اتسجلت على المحل (النقص محمّل على الموظف بدلها)', !t3.lossOnShopExists);
  r.ok('اتسجل تحميل نقص جرد على الموظف', t3.chargeCreated);
  r.eq('قيمة التحميل = 60 (2×30)', t3.chargeAmount, 60);
  r.ok('التحميل كان لسه معلّق قبل اختيار طريقة التحصيل', t3.chargeSettledBefore === false);
  r.ok('بعد اختيار "نقدًا دلوقتي" — التحميل اتقفل كمتسدد', t3.chargeSettledAfter === true);
  r.eq('طريقة التحصيل المسجّلة = now', t3.chargeMode, 'now');
  r.ok('اتسجل تحصيل نقدي حقيقي (مصروف من نوع "تحصيل نقص جرد")', t3.collectExpenseFound);
  r.eq('قيمة التحصيل النقدي = -60 (سالب = دخل فعلي للخزنة)', t3.collectExpenseAmount, -60);
  r.ok('التحصيل مسجّل نقدي فعلي (nonCash=false) — بيدخل الخزنة فعلاً', t3.collectExpenseNonCash === false);

  // ===== ٤) نقص محمّل على موظف — اختيار "تُخصم من مرتبه" =====
  const t4 = await page.evaluate(() => {
    _ficCounts = { 'PRD-TEST-9004': '1' };
    _ficEmp = { 'PRD-TEST-9004': 'EMP-TEST-9001' };
    saveFullInventoryCount();
    const emp = DB.employees.find(x => x.id === 'EMP-TEST-9001');
    const chargeBefore = (emp.stockCharges || []).find(c => c.prodId === 'PRD-TEST-9004');
    const expCountBefore = DB.expenses.length;
    _sccResolve('salary');
    const chargeAfterChoice = (emp.stockCharges || []).find(c => c.prodId === 'PRD-TEST-9004');
    const noExpenseCreated = DB.expenses.length === expCountBefore;
    return {
      chargeAmount: chargeBefore ? chargeBefore.amount : null,
      settledAfterChoice: chargeAfterChoice ? chargeAfterChoice.settled : null,
      modeAfterChoice: chargeAfterChoice ? chargeAfterChoice.mode : null,
      noExpenseCreated,
    };
  });
  r.eq('قيمة التحميل = 75 (3×25)', t4.chargeAmount, 75);
  r.ok('اختيار "تُخصم من الراتب" — مفيش أي مصروف/إيراد بيتسجل فورًا', t4.noExpenseCreated);
  r.ok('التحميل لسه غير متسدد لحد ما الراتب يتصرف فعلاً', t4.settledAfterChoice === false);
  r.eq('طريقة التحصيل المسجّلة = salary', t4.modeAfterChoice, 'salary');

  // ===== ٥) نواقص الجرد المؤجّلة بتتخصم تلقائيًا عند صرف الراتب، زي السلف بالظبط =====
  const t5 = await page.evaluate(() => {
    openSalaryModal('EMP-TEST-9001');
    const shortInModal = SAL_SHORT;
    document.getElementById('sal-month').value = '2099-01'; // شهر مستقبلي وهمي عشان مايتعارضش مع أي سجل سابق
    calcSalaryNet();
    const netDisp = document.getElementById('sal-net-disp').textContent;
    saveSalary();
    const emp = DB.employees.find(x => x.id === 'EMP-TEST-9001');
    const chargeFinal = (emp.stockCharges || []).find(c => c.prodId === 'PRD-TEST-9004');
    const lastHist = emp.salaryHistory[emp.salaryHistory.length - 1];
    return {
      shortInModal,
      chargeSettledFinal: chargeFinal ? chargeFinal.settled : null,
      chargeSettledMonth: chargeFinal ? chargeFinal.settledMonth : null,
      histStockShort: lastHist ? lastHist.stockShort : null,
      histNet: lastHist ? lastHist.net : null,
      salAfterReset: SAL_SHORT,
    };
  });
  r.eq('نواقص الجرد المؤجّلة ظهرت في شاشة صرف المرتب (SAL_SHORT) = 75', t5.shortInModal, 75);
  r.ok('بمجرد ما الراتب اتصرف، نقص الجرد المؤجّل اتقفل كمتسدد', t5.chargeSettledFinal === true);
  r.eq('الشهر المسجّل للتسوية = شهر الراتب اللي اتصرف', t5.chargeSettledMonth, '2099-01');
  r.eq('سجل الراتب فيه قيمة نواقص الجرد المخصومة = 75', t5.histStockShort, 75);
  r.eq('الصافي المدفوع = 1000 - 75 = 925 (الراتب الأساسي 1000، مفيش استحقاقات/خصومات تانية)', t5.histNet, 925);
  r.eq('SAL_SHORT اترجع صفر بعد صرف الراتب', t5.salAfterReset, 0);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
