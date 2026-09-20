// ======= اختبار: قطع مقترحة أوتوماتيك في مودال "تفكيك جهاز لقطع غيار" =======
// المشكلة اللي بيحلها الكود ده: لما تفتح مودال تفكيك جهاز (زي "مفرمة mg510")، كان
// المفروض يظهرلك على طول كل القطع المرتبطة بنفس موديل الجهاز ده (موتور mg510، ترس
// mg510، جيربوكس mg510، سويتش باور mg510...)، بدل ما تفضل تدور بنفسك وسط كل قطع
// الغيار (المخزن كله). دلوقتي openDismantle() بتستخرج رقم الموديل من اسم الجهاز
// نفسه، وتورّي قايمة "قطع مقترحة" فوق على طول بكل القطع اللي في اسمها نفس الرقم ده —
// دوسة واحدة على أي واحدة بتملى خانة البحث جاهزة.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('dismantle-related-parts');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز: جهاز "مفرمة mg510" + قطعه المرتبطة (نفس أمثلة العميل بالظبط) +
  // كمية كبيرة من قطع غيار مالهاش أي علاقة (تمثّل "المخزن كله") =====
  const seed = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    DB.products = [
      { id: 'PRD-DEV-MG510', name: 'مفرمة mg510', cat: 'أجهزة', section: 'devices', buy: 3000, sell: 4000, qty: 5, alert: 1 },
      { id: 'PRD-MOTOR-MG510', name: 'موتور mg510', cat: 'قطع غيار', section: 'parts', buy: 900, sell: 1200, qty: 8, alert: 1 },
      { id: 'PRD-GEAR-MG510', name: 'ترس mg510', cat: 'قطع غيار', section: 'parts', buy: 150, sell: 220, qty: 15, alert: 1 },
      { id: 'PRD-GEARBOX-MG510', name: 'شاسية بالتروس جيربوكس mg510', cat: 'قطع غيار', section: 'parts', buy: 1100, sell: 1500, qty: 4, alert: 1 },
      { id: 'PRD-SWITCH-MG510', name: 'سويتش باور mg510', cat: 'قطع غيار', section: 'parts', buy: 40, sell: 70, qty: 20, alert: 1 },
    ];
    for (let i = 1; i <= 500; i++) {
      DB.products.push({ id: 'PRD-X' + i, name: 'صنف تجريبي غير مرتبط رقم ' + i, cat: 'قطع غيار', section: 'parts', buy: 10, sell: 20, qty: 5, alert: 1 });
    }
    return { total: DB.products.length };
  });
  r.ok('المخزون التجريبي فيه أكتر من ٥٠٠ صنف غير مرتبط (عشان الاختبار يبقى ذو معنى)', seed.total > 500);

  // ===== فتح مودال التفكيك للجهاز "مفرمة mg510" =====
  const t1 = await page.evaluate(() => {
    openDismantle('PRD-DEV-MG510');
    const wrap = document.getElementById('dm-related-wrap');
    const list = document.getElementById('dm-related-list');
    return {
      visible: wrap.style.display !== 'none',
      token: document.getElementById('dm-related-token').textContent,
      chipsCount: list.querySelectorAll('button').length,
      html: list.innerHTML,
    };
  });
  r.ok('قايمة "قطع مقترحة" ظهرت أوتوماتيك أول ما فتحنا مودال التفكيك (من غير ما نكتب حاجة)', t1.visible);
  r.eq('رقم الموديل المستخرج من اسم الجهاز = mg510', t1.token, 'mg510');
  r.eq('عدد القطع المقترحة = ٤ بالظبط (نفس أمثلة العميل)، مش المخزن كله', t1.chipsCount, 4);
  r.ok('القايمة فيها "موتور mg510"', t1.html.includes('موتور mg510'));
  r.ok('القايمة فيها "ترس mg510"', t1.html.includes('ترس mg510'));
  r.ok('القايمة فيها "شاسية بالتروس جيربوكس mg510"', t1.html.includes('شاسية بالتروس جيربوكس mg510'));
  r.ok('القايمة فيها "سويتش باور mg510"', t1.html.includes('سويتش باور mg510'));
  r.ok('القايمة ما فيهاش أي صنف من الـ٥٠٠ الغير مرتبطين', !t1.html.includes('صنف تجريبي غير مرتبط'));

  // ===== الدوسة على قطعة من القايمة المقترحة بتملى خانة البحث والـid صح =====
  const t2 = await page.evaluate(() => {
    dmChoosePart('PRD-MOTOR-MG510');
    return { partVal: $('dm-part').value, partId: $('dm-part-id').value };
  });
  r.eq('دوسة على "موتور mg510" ملت خانة البحث بالاسم صح', t2.partVal, 'موتور mg510');
  r.eq('دوسة على "موتور mg510" ملت الـid الصح', t2.partId, 'PRD-MOTOR-MG510');

  // ===== جهاز من غير رقم موديل واضح في اسمه = مفيش قايمة مقترحة تظهر (مفيش تعطل) =====
  const t3 = await page.evaluate(() => {
    DB.products.push({ id: 'PRD-DEV-PLAIN', name: 'جهاز تجريبي بدون موديل', cat: 'أجهزة', section: 'devices', buy: 1000, sell: 1500, qty: 2, alert: 1 });
    openDismantle('PRD-DEV-PLAIN');
    return document.getElementById('dm-related-wrap').style.display;
  });
  r.eq('جهاز من غير رقم موديل واضح = قايمة القطع المقترحة مقفولة (مفيش أخطاء)', t3, 'none');

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
