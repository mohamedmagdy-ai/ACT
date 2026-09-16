// ======= اختبارات الحسابات الحرجة: الضريبة، إجمالي الفاتورة، خصم المخزون =======
// دي أهم اختبار في المجموعة كلها — بتستدعي نفس دوال البرنامج الحقيقية (calcDtax،
// saveSale) بالظبط زي ما بتتنادى من الواجهة، مش بتعيد كتابة المعادلة في ملف الاختبار.
// يعني لو حد (أنا أو أي حد بعد كده) عدّل في منطق الحساب الحقيقي جوه index.html وكسر
// حاجة، الاختبار ده هيفشل فورًا.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('core-calculations');
  const { browser, page, pageErrors } = await openApp();

  // ===== ١) ضريبة القيمة المضافة على فاتورة ضريبية (calcDtax) =====
  const vat = await page.evaluate(() => {
    localStorage.setItem('sz_tax_rate', '14');
    dtaxItems = [
      { code: '', name: 'صنف تجريبي 1', serialNo: '', qty: 2, price: 100, discPct: 0 },
      { code: '', name: 'صنف تجريبي 2', serialNo: '', qty: 1, price: 50, discPct: 10 }
    ];
    if ($('dtax-inv-disc')) $('dtax-inv-disc').value = 5;
    calcDtax();
    return {
      sub: $('dtx-sub').textContent,
      base: $('dtx-base').textContent,
      tax: $('dtx-tax').textContent,
      total: $('dtx-total').textContent
    };
  });
  // حساب مستقل (بنفس ترتيب العمليات بالظبط) للمقارنة:
  // sub = 2*100 + 1*50 = 250 | discAmt = 50*10% = 5 | base = 245
  // baseAfterInv = 245*(1-5/100) = 232.75 | tax = 232.75*14% | total = baseAfterInv+tax
  const expectedSub = 250, expectedBase = (250 - 5) * (1 - 5 / 100);
  const expectedTax = expectedBase * 0.14, expectedTotal = expectedBase + expectedTax;
  r.eq('الوعاء (Subtotal) قبل أي خصم', vat.sub, expectedSub.toFixed(2) + ' ج');
  r.eq('الوعاء بعد خصم الصنف وخصم الفاتورة', vat.base, expectedBase.toFixed(2) + ' ج');
  r.eq('قيمة ضريبة 14%', vat.tax, expectedTax.toFixed(2) + ' ج');
  r.eq('الإجمالي شامل الضريبة', vat.total, expectedTotal.toFixed(2) + ' ج');

  // تغيير نسبة الضريبة من الإعدادات لازم يغيّر نتيجة الحساب فعليًا (مش رقم ثابت في الكود)
  const vat2 = await page.evaluate(() => {
    localStorage.setItem('sz_tax_rate', '10');
    calcDtax();
    return { tax: $('dtx-tax').textContent };
  });
  r.eq('الضريبة بتتغيّر فعليًا مع تغيير النسبة (10% بدل 14%)', vat2.tax, (expectedBase * 0.10).toFixed(2) + ' ج');
  await page.evaluate(() => localStorage.setItem('sz_tax_rate', '14')); // رجّع الوضع الافتراضي

  // ===== ٢) فاتورة مبيعات حقيقية: خصم صنف + خصم فاتورة + خصم المخزون تلقائيًا =====
  const sale = await page.evaluate(() => {
    DB.products = DB.products || [];
    DB.products.push({ id: 'TESTPROD-1', name: 'صنف اختبار المخزون', code: 'TST-1', qty: 20, qtyByBranch: {}, cost: 0, price: 100 });
    CURRENT_BRANCH = 'BR-MAIN';

    slItems = [{ code: 'TST-1', name: 'صنف اختبار المخزون', qty: 3, price: 100, disc: 30 }];
    $('sl-cname').value = 'عميل اختبار آلي';
    $('sl-phone').value = '';
    if ($('sl-inv-disc')) $('sl-inv-disc').value = 10;
    const before = DB.sales.length;
    const rec = saveSale(false);
    const prodAfter = DB.products.find(p => p.id === 'TESTPROD-1');
    return {
      created: !!rec && DB.sales.length === before + 1,
      total: rec ? rec.total : null,
      qtyAfter: prodAfter ? prodAfter.qty : null
    };
  });
  // itemSum = 3*100 - 30(خصم الصنف) = 270 | بعد خصم فاتورة 10% = 243
  r.ok('الفاتورة اتسجّلت فعليًا في DB.sales', sale.created);
  r.eq('إجمالي الفاتورة صح (خصم صنف + خصم فاتورة مجمّعين)', sale.total, 270 * 0.9);
  r.eq('المخزون اتخصم منه 3 قطع بالظبط بعد البيع (20 → 17)', sale.qtyAfter, 17);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
