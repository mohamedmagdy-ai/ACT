// ======= اختبار: التمرير الافتراضي على باقي الجداول (مش المخزن بس) =======
// بعد ما اتأكد حل التمرير الافتراضي لجدول المخزن (prod-tbl) شغال صح، المستخدم طلب
// صراحةً تعميم نفس الحل على كل الجداول التانية اللي كانت بتستخدم العلاج المؤقت
// (applyDisplayCap + زرار "عرض الكل"): المبيعات، الإيصالات، أوامر الشغل، فواتير
// الصيانة، المشتريات، العهدة، المصروفات، المرتجعات، الآجل. الاختبار ده بيتأكد
// فعليًا إن renderVirtualTable (الأداة العامة الواحدة اللي بتخدم كل الجداول دي)
// شغالة صح: عدد صفوف الـDOM يفضل صغير مهما كان حجم البيانات، السكرول بيغيّر
// الصفوف الظاهرة صح، والبحث بقى فلترة على مستوى البيانات (مش إخفاء DOM قديم).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('tables-virtual-scroll');
  const { browser, page, pageErrors } = await openApp();

  await page.evaluate(() => { CURRENT_USER = { role: 'admin', name: 'Test Admin' }; });

  // ===== ١) جدول المبيعات (sales-tbl) — اختبار عميق: بيانات + DOM + سكرول + بحث =====
  const salesN = 4000;
  const sales1 = await page.evaluate((N) => {
    DB.sales = [];
    for (let i = 0; i < N; i++) {
      DB.sales.push({
        id: 'S-' + String(i).padStart(5, '0'),
        status: 'done',
        customer: (i === 1234 ? 'عميل مميز نادر جدًا' : 'عميل ' + i),
        total: 100 + i,
        payment: 'كاش',
        date: '2026-01-01',
        items: [{ name: 'صنف ' + i, qty: 1 }],
      });
    }
    DB.taxInvoices = [];
    showTab('sales');
    return {
      realRows: document.querySelectorAll('#sales-tbl tr').length,
      virtTotal: VTABLE_STATE['sales-tbl'].rows.length,
    };
  }, salesN);
  r.eq('المبيعات: كل البيانات (4000) موجودة في حالة الجدول (مفيش قص عند البيانات)', sales1.virtTotal, salesN);
  r.ok('المبيعات: عدد صفوف DOM الحقيقية أقل بكتير من 4000 (أقل من 100)', sales1.realRows > 0 && sales1.realRows < 100);

  await page.evaluate(() => {
    const wrap = document.getElementById('sales-tbl').closest('.tbl-wrap');
    wrap.scrollTop = wrap.scrollHeight / 2;
    wrap.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(150);
  const sales2 = await page.evaluate(() => ({
    firstRowText: document.querySelector('#sales-tbl tr td strong')?.textContent || '',
  }));
  r.ok('المبيعات: بعد السكرول لنص الجدول، أول صف ظاهر اتغيّر (مش لسه S-00000)', sales2.firstRowText !== 'S-00000');

  const sales3 = await page.evaluate(() => {
    srch('sales-tbl', 'مميز نادر جدًا');
    return {
      virtTotal: VTABLE_STATE['sales-tbl'].rows.length,
      realRows: document.querySelectorAll('#sales-tbl tr').length,
    };
  });
  r.eq('المبيعات: البحث برجّع نتيجة واحدة بس (العميل المميز النادر)', sales3.virtTotal, 1);
  r.eq('المبيعات: صف واحد بس ظاهر في الـDOM بعد البحث', sales3.realRows, 1);
  await page.evaluate(() => srch('sales-tbl', ''));

  // ===== ٢) جدول أوامر الشغل (wo-tbl) — اختبار عميق تاني (قالب مختلف تمامًا) =====
  const woN = 3500;
  const wo1 = await page.evaluate((N) => {
    DB.workOrders = [];
    for (let i = 0; i < N; i++) {
      DB.workOrders.push({
        id: 'WO-' + String(i).padStart(5, '0'),
        status: 'open',
        rcptId: 'R-' + i,
        customer: (i === 2000 ? 'عميل أمر شغل نادر' : 'عميل ' + i),
        device: 'جهاز', brand: 'براند',
        works: 'صيانة عامة',
        total: 200 + i, exit: 'normal', date: '2026-01-01',
      });
    }
    showTab('wo');
    return {
      realRows: document.querySelectorAll('#wo-tbl tr').length,
      virtTotal: VTABLE_STATE['wo-tbl'].rows.length,
    };
  }, woN);
  r.eq('أوامر الشغل: كل البيانات موجودة في حالة الجدول (' + woN + ')', wo1.virtTotal, woN);
  r.ok('أوامر الشغل: عدد صفوف DOM الحقيقية محدود (أقل من 100)', wo1.realRows > 0 && wo1.realRows < 100);

  await page.evaluate(() => {
    const wrap = document.getElementById('wo-tbl').closest('.tbl-wrap');
    wrap.scrollTop = wrap.scrollHeight;
    wrap.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(150);
  const wo2 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#wo-tbl tr')).map(tr => tr.querySelector('td strong')?.textContent).filter(Boolean);
    return { hasOldest: rows.includes('WO-00000') };
  });
  r.ok('أوامر الشغل: عند آخر الجدول، أقدم أمر شغل (WO-00000) ظاهر فعليًا', wo2.hasOldest);

  const wo3 = await page.evaluate(() => {
    srch('wo-tbl', 'أمر شغل نادر');
    return VTABLE_STATE['wo-tbl'].rows.length;
  });
  r.eq('أوامر الشغل: البحث برجّع نتيجة واحدة بس', wo3, 1);
  await page.evaluate(() => srch('wo-tbl', ''));

  // ===== ٣) فواتير الصيانة (maintinv-tbl) =====
  const MI_N = 2500;
  const mi1 = await page.evaluate((N) => {
    DB.maintInvoices = [];
    DB.taxInvoices = [];
    for (let i = 0; i < N; i++) {
      DB.maintInvoices.push({ id: 'MI-' + String(i).padStart(5, '0'), customer: (i === 500 ? 'عميل صيانة نادر' : 'عميل ' + i), device: 'جهاز', cost: 50 + i, exit: 'normal', payment: 'كاش', date: '2026-01-01' });
    }
    showTab('maintinv');
    return { realRows: document.querySelectorAll('#maintinv-tbl tr').length, virtTotal: VTABLE_STATE['maintinv-tbl'].rows.length };
  }, MI_N);
  r.eq('فواتير الصيانة: كل البيانات (' + MI_N + ') موجودة في حالة الجدول', mi1.virtTotal, MI_N);
  r.ok('فواتير الصيانة: عدد صفوف DOM الحقيقية محدود (أقل من 100)', mi1.realRows > 0 && mi1.realRows < 100);
  const mi2 = await page.evaluate(() => { srch('maintinv-tbl', 'صيانة نادر'); const v = VTABLE_STATE['maintinv-tbl'].rows.length; srch('maintinv-tbl', ''); return v; });
  r.eq('فواتير الصيانة: البحث برجّع نتيجة واحدة بس', mi2, 1);

  // ===== ٤) المشتريات (purch-tbl) =====
  const PU_N = 2500;
  const pu1 = await page.evaluate((N) => {
    DB.purchases = [];
    for (let i = 0; i < N; i++) {
      DB.purchases.push({ id: 'PU-' + String(i).padStart(5, '0'), type: 'device', supplier: (i === 700 ? 'مورد نادر جدًا' : 'مورد ' + i), product: 'صنف ' + i, unitCost: 10, sellPrice: 20, qty: 1, total: 10 + i, payment: 'كاش', date: '2026-01-01' });
    }
    showTab('purch');
    return { realRows: document.querySelectorAll('#purch-tbl tr').length, virtTotal: VTABLE_STATE['purch-tbl'].rows.length };
  }, PU_N);
  r.eq('المشتريات: كل البيانات (' + PU_N + ') موجودة في حالة الجدول', pu1.virtTotal, PU_N);
  r.ok('المشتريات: عدد صفوف DOM الحقيقية محدود (أقل من 100)', pu1.realRows > 0 && pu1.realRows < 100);
  const pu2 = await page.evaluate(() => { srch('purch-tbl', 'مورد نادر جدًا'); const v = VTABLE_STATE['purch-tbl'].rows.length; srch('purch-tbl', ''); return v; });
  r.eq('المشتريات: البحث برجّع نتيجة واحدة بس', pu2, 1);

  // ===== ٥) العهدة (custody-tbl) =====
  const CU_N = 2500;
  const cu1 = await page.evaluate((N) => {
    DB.custody = [];
    for (let i = 0; i < N; i++) {
      DB.custody.push({ id: 'CU-' + String(i).padStart(5, '0'), person: (i === 300 ? 'موظف عهدة نادر' : 'موظف ' + i), custodyType: 'نقدية', items: 'بيان العهدة', value: 100 + i, date: '2026-01-01', status: 'open' });
    }
    showTab('custody');
    return { realRows: document.querySelectorAll('#custody-tbl tr').length, virtTotal: VTABLE_STATE['custody-tbl'].rows.length };
  }, CU_N);
  r.eq('العهدة: كل البيانات (' + CU_N + ') موجودة في حالة الجدول', cu1.virtTotal, CU_N);
  r.ok('العهدة: عدد صفوف DOM الحقيقية محدود (أقل من 100)', cu1.realRows > 0 && cu1.realRows < 100);
  const cu2 = await page.evaluate(() => { srch('custody-tbl', 'عهدة نادر'); const v = VTABLE_STATE['custody-tbl'].rows.length; srch('custody-tbl', ''); return v; });
  r.eq('العهدة: البحث برجّع نتيجة واحدة بس', cu2, 1);

  // ===== ٦) الإيصالات (rcpt-tbl) =====
  const RC_N = 2500;
  const rc1 = await page.evaluate((N) => {
    DB.receipts = [];
    for (let i = 0; i < N; i++) {
      DB.receipts.push({ id: 'RC-' + String(i).padStart(5, '0'), status: 'open', customer: (i === 900 ? 'عميل إيصال نادر' : 'عميل ' + i), customerPhone: '01000000000', device: 'جهاز', brand: 'براند', model: 'موديل', issue: 'عطل', date: '2026-01-01' });
    }
    showTab('rcpt');
    return { realRows: document.querySelectorAll('#rcpt-tbl tr').length, virtTotal: VTABLE_STATE['rcpt-tbl'].rows.length };
  }, RC_N);
  r.eq('الإيصالات: كل البيانات (' + RC_N + ') موجودة في حالة الجدول', rc1.virtTotal, RC_N);
  r.ok('الإيصالات: عدد صفوف DOM الحقيقية محدود (أقل من 100)', rc1.realRows > 0 && rc1.realRows < 100);
  const rc2 = await page.evaluate(() => { srch('rcpt-tbl', 'إيصال نادر'); const v = VTABLE_STATE['rcpt-tbl'].rows.length; srch('rcpt-tbl', ''); return v; });
  r.eq('الإيصالات: البحث برجّع نتيجة واحدة بس', rc2, 1);

  // ===== ٧) المصروفات (exp-tbl) =====
  const EX_N = 2500;
  const ex1 = await page.evaluate((N) => {
    DB.expenses = [];
    for (let i = 0; i < N; i++) {
      DB.expenses.push({ id: 'EX-' + String(i).padStart(5, '0'), type: (i === 400 ? 'مصروف نادر جدًا' : 'إيجار'), amount: 50 + i, date: '2026-01-01', payment: 'كاش', hasInvoice: false });
    }
    showTab('exp');
    return { realRows: document.querySelectorAll('#exp-tbl tr').length, virtTotal: VTABLE_STATE['exp-tbl'].rows.length };
  }, EX_N);
  r.eq('المصروفات: كل البيانات (' + EX_N + ') موجودة في حالة الجدول', ex1.virtTotal, EX_N);
  r.ok('المصروفات: عدد صفوف DOM الحقيقية محدود (أقل من 100)', ex1.realRows > 0 && ex1.realRows < 100);
  const ex2 = await page.evaluate(() => { srch('exp-tbl', 'مصروف نادر جدًا'); const v = VTABLE_STATE['exp-tbl'].rows.length; srch('exp-tbl', ''); return v; });
  r.eq('المصروفات: البحث برجّع نتيجة واحدة بس', ex2, 1);

  // ===== ٨) المرتجعات (returns-tbl) =====
  const RT_N = 2500;
  const rt1 = await page.evaluate((N) => {
    DB.returns = [];
    for (let i = 0; i < N; i++) {
      DB.returns.push({ id: 'RT-' + String(i).padStart(5, '0'), type: 'sale', ref: 'S-' + i, party: (i === 250 ? 'عميل مرتجع نادر' : 'عميل ' + i), item: 'صنف', amount: 10 + i, reason: 'عيب', date: '2026-01-01' });
    }
    showTab('returns');
    return { realRows: document.querySelectorAll('#returns-tbl tr').length, virtTotal: VTABLE_STATE['returns-tbl'].rows.length };
  }, RT_N);
  r.eq('المرتجعات: كل البيانات (' + RT_N + ') موجودة في حالة الجدول', rt1.virtTotal, RT_N);
  r.ok('المرتجعات: عدد صفوف DOM الحقيقية محدود (أقل من 100)', rt1.realRows > 0 && rt1.realRows < 100);
  const rt2 = await page.evaluate(() => { srch('returns-tbl', 'مرتجع نادر'); const v = VTABLE_STATE['returns-tbl'].rows.length; srch('returns-tbl', ''); return v; });
  r.eq('المرتجعات: البحث برجّع نتيجة واحدة بس', rt2, 1);

  // ===== ٩) الآجل (deferred-tbl) — فحص دخان: بيانات كبيرة من مصدر مبيعات آجلة =====
  const DF_N = 2000;
  const df1 = await page.evaluate((N) => {
    DB.sales = [];
    DB.payments = [];
    for (let i = 0; i < N; i++) {
      DB.sales.push({ id: 'SD-' + String(i).padStart(5, '0'), status: 'pending', payment: 'آجل', customer: 'عميل ' + i, total: 100 + i, date: '2026-01-01' });
    }
    showTab('deferred');
    return { realRows: document.querySelectorAll('#deferred-tbl tr').length, virtTotal: (VTABLE_STATE['deferred-tbl'] || { rows: [] }).rows.length };
  }, DF_N);
  r.eq('الآجل: كل الفواتير الآجلة (' + DF_N + ') موجودة في حالة الجدول', df1.virtTotal, DF_N);
  r.ok('الآجل: عدد صفوف DOM الحقيقية محدود (أقل من 100)', df1.realRows > 0 && df1.realRows < 100);

  // ===== ١٠) العملاء (cust-tbl) — فيها كمان إصلاح أداء لحساب عدد فواتير كل عميل =====
  const CS_N = 3000;
  const cs1 = await page.evaluate((N) => {
    DB.customers = [];
    DB.sales = [];
    for (let i = 0; i < N; i++) {
      DB.customers.push({ id: 'C-' + String(i).padStart(5, '0'), name: (i === 600 ? 'عميل بحث نادر جدًا' : 'زبون ' + i), phone: '01000000000', address: 'القاهرة', type: 'عادي' });
      // كل تالت عميل عنده فاتورة مبيعات وحدة، عشان نتأكد إن حساب عدد الفواتير لسه صح بعد التحسين
      if (i % 3 === 0) DB.sales.push({ id: 'SC-' + i, customer: 'زبون ' + i, total: 50, date: '2026-01-01' });
    }
    DB.taxInvoices = [];
    DB.maintInvoices = [];
    showTab('customers');
    return {
      realRows: document.querySelectorAll('#cust-tbl tr').length,
      virtTotal: VTABLE_STATE['cust-tbl'].rows.length,
    };
  }, CS_N);
  r.eq('العملاء: كل البيانات (' + CS_N + ') موجودة في حالة الجدول', cs1.virtTotal, CS_N);
  r.ok('العملاء: عدد صفوف DOM الحقيقية محدود (أقل من 100)', cs1.realRows > 0 && cs1.realRows < 100);
  const cs2 = await page.evaluate(() => {
    srch('cust-tbl', 'بحث نادر جدًا');
    const v = VTABLE_STATE['cust-tbl'].rows.length;
    srch('cust-tbl', '');
    return v;
  });
  r.eq('العملاء: البحث برجّع نتيجة واحدة بس', cs2, 1);
  const cs3 = await page.evaluate(() => VTABLE_STATE['cust-tbl'].rows.find(c => c.name === 'زبون 0')._txCount);
  r.eq('العملاء: حساب عدد الفواتير لسه صحيح بعد تحسين الأداء (زبون 0 عنده فاتورة واحدة)', cs3, 1);
  const cs4 = await page.evaluate(() => VTABLE_STATE['cust-tbl'].rows.find(c => c.name === 'زبون 1')._txCount);
  r.eq('العملاء: عميل من غير فواتير يورّي صفر صح', cs4, 0);

  // ===== ١١) مفيش أي خطأ JS غير متوقع طول الاختبار =====
  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  pageErrors:', pageErrors.slice(0, 5));

  await browser.close();
  process.exit(r.close() ? 0 : 1);
})();
