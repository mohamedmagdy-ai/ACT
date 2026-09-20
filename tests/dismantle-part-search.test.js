// ======= اختبار: البحث عن قطعة برقم الموديل في مودال "تفكيك جهاز لقطع غيار" =======
// المشكلة اللي بيحلها الكود ده: خانة "القطعة" في مودال التفكيك كانت بتعتمد على
// <datalist> الأصلية بتاعة المتصفح للفلترة أثناء الكتابة. لما تكتب رقم موديل لاتيني
// جوه اسم عربي (زي "جيربوكس kmm770")، الفلترة المدمجة في بعض إصدارات Chromium/
// Electron كانت بتفشل (بتطابق أول الاسم بس، مش أي جزء منه)، فالنتيجة إن القايمة
// كانت بترجع كل قطع الغيار (المخزن كله — أكتر من ٥٠٠ صنف) بدل ما تتفلتر لصنفين
// بس فيهم "kmm770". الحل: بحث substring بالـJS نفسه (dmRenderPartSuggest)، مستقل
// تمامًا عن سلوك المتصفح.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('dismantle-part-search');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز: مخزون تجريبي فيه كمية كبيرة من قطع الغيار (يمثّل "المخزن كله" اللي
  // كانت بترجع كاملة بالغلط)، وصنفين بس فيهم رقم الموديل "kmm770" =====
  const seed = await page.evaluate(() => {
    DB.products = [];
    for (let i = 1; i <= 500; i++) {
      DB.products.push({ id: 'PRD-X' + i, name: 'صنف تجريبي رقم ' + i, cat: 'قطع غيار', section: 'parts', buy: 10, sell: 20, qty: 5, alert: 1 });
    }
    DB.products.push({ id: 'PRD-KMM-1', name: 'جيربوكس kmm770', cat: 'قطع غيار', section: 'parts', buy: 7700, sell: 9000, qty: 10, alert: 1 });
    DB.products.push({ id: 'PRD-KMM-2', name: 'صرة عجان kmm770', cat: 'قطع غيار', section: 'parts', buy: 0, sell: 0, qty: 1, alert: 1 });
    DB.products.push({ id: 'PRD-EC685', name: 'فلوميتر ec685', cat: 'قطع غيار', section: 'parts', buy: 700, sell: 900, qty: 30, alert: 1 });
    DB.products.push({ id: 'PRD-DEV-1', name: 'جهاز كامل ديمو', cat: 'أجهزة', section: 'devices', buy: 5000, sell: 6000, qty: 3, alert: 1 });
    return {
      totalProducts: DB.products.length,
      kmm770Count: DB.products.filter((p) => p.name.includes('kmm770')).length,
    };
  });
  r.ok('في أكتر من ٥٠٠ صنف في المخزون التجريبي (عشان الاختبار يبقى ذو معنى)', seed.totalProducts > 500);
  r.eq('في صنفين بالظبط اسمهم فيه "kmm770" في البيانات التجريبية', seed.kmm770Count, 2);

  // ===== ١) البحث برقم الموديل بيرجّع الأصناف المطابقة بس، مش المخزن كله =====
  const t1 = await page.evaluate(() => {
    $('dm-part').value = 'kmm770';
    dmPickPart();
    const box = document.getElementById('dm-part-suggest');
    return {
      visible: box.style.display === 'block',
      rowsCount: box.querySelectorAll('div').length,
      html: box.innerHTML,
    };
  });
  r.ok('قايمة الاقتراحات ظهرت بعد كتابة رقم الموديل', t1.visible);
  r.eq('عدد الاقتراحات = صنفين بالظبط (مش المخزن كله)', t1.rowsCount, 2);
  r.ok('الاقتراحات فيها "جيربوكس kmm770"', t1.html.includes('جيربوكس kmm770'));
  r.ok('الاقتراحات فيها "صرة عجان kmm770"', t1.html.includes('صرة عجان kmm770'));
  r.ok('الاقتراحات ما فيهاش صنف غير مرتبط زي "فلوميتر ec685"', !t1.html.includes('فلوميتر ec685'));

  // ===== ٢) البحث بحروف كابيتال برضه بيشتغل (case-insensitive) =====
  const t2 = await page.evaluate(() => {
    $('dm-part').value = 'KMM770';
    dmPickPart();
    const box = document.getElementById('dm-part-suggest');
    return { rowsCount: box.querySelectorAll('div').length };
  });
  r.eq('البحث بحروف كبيرة (KMM770) برضه بيرجّع نفس الصنفين', t2.rowsCount, 2);

  // ===== ٣) اختيار صنف من الاقتراحات بيملى الخانة الصح ويقفل القايمة =====
  const t3 = await page.evaluate(() => {
    const p = DB.products.find((x) => x.name === 'جيربوكس kmm770');
    dmChoosePart(p.id);
    const box = document.getElementById('dm-part-suggest');
    return {
      partVal: $('dm-part').value,
      partId: $('dm-part-id').value,
      boxHidden: box.style.display === 'none',
    };
  });
  r.eq('اختيار الصنف ملى الاسم صح', t3.partVal, 'جيربوكس kmm770');
  r.ok('اختيار الصنف ملى الـid الصح', !!t3.partId);
  r.ok('قايمة الاقتراحات اتقفلت بعد الاختيار', t3.boxHidden);

  // ===== ٤) خانة فاضية = مفيش اقتراحات ظاهرة (مفيش "فلاش" لكل المخزن) =====
  const t4 = await page.evaluate(() => {
    $('dm-part').value = '';
    dmPickPart();
    return document.getElementById('dm-part-suggest').style.display;
  });
  r.eq('خانة فاضية = قايمة الاقتراحات مقفولة', t4, 'none');

  // ===== ٥) بحث بكلمة مش موجودة خالص = مفيش اقتراحات (يسمح بإضافة صنف جديد) =====
  const t5 = await page.evaluate(() => {
    $('dm-part').value = 'zzz999-غير موجود';
    dmPickPart();
    return document.getElementById('dm-part-suggest').style.display;
  });
  r.eq('بحث بكلمة مش موجودة = قايمة الاقتراحات مقفولة', t5, 'none');

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
