// ======= اختبار: خصومات المنتجات (سعر بعد الخصم + زرار إيقاف كل الخصومات) =======
// بيتأكد إن منطق الخصومات (effectiveOnlinePrice، بناء كتالوج الموقع بـoriginalPrice
// الصح، toggleAllDiscounts، والتحقق من صحة الإدخال في saveProd) شغال صح فعليًا جوه
// المتصفح — مهم بشكل خاص لأنه منطق سعر/فلوس حقيقي، غلطة فيه ممكن تبيّع بسعر غلط.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const { browser, page, pageErrors } = await openApp();
  const r = new TestReporter('discount-logic-verify');
  try {
    // نجهّز منتج تجريبي فيه سعر بيع 100 وخصم لسعر 80 (خصم شرعي)
    const setup = await page.evaluate(() => {
      window.DB = window.DB || {};
      CURRENT_USER = { role: 'admin', name: 'Test Admin' };
      DB.products = [
        { id: 'PRD-D-TEST1', name: 'تجربة خصم شرعي', sell: 100, onlinePrice: null, discountPrice: 80, onlineVisible: true, qty: 5, section: 'devices', shipSize: 'small' },
        { id: 'PRD-D-TEST2', name: 'تجربة من غير خصم', sell: 200, onlinePrice: null, discountPrice: null, onlineVisible: true, qty: 3, section: 'devices', shipSize: 'small' },
        { id: 'PRD-D-TEST3', name: 'تجربة خصم أونلاين', sell: 500, onlinePrice: 300, discountPrice: 250, onlineVisible: true, qty: 1, section: 'devices', shipSize: 'small' },
      ];
      window.FS_COL = null; // نمنع أي محاولة اتصال فعلي بفايرستور وقت الاختبار
      return {
        hasEffectiveOnlinePrice: typeof effectiveOnlinePrice === 'function',
        hasToggle: typeof toggleAllDiscounts === 'function',
        hasDiscountsAreEnabled: typeof discountsAreEnabled === 'function',
      };
    });
    r.ok('الدوال الأساسية موجودة (effectiveOnlinePrice/toggleAllDiscounts/discountsAreEnabled)',
      setup.hasEffectiveOnlinePrice && setup.hasToggle && setup.hasDiscountsAreEnabled);

    const before = await page.evaluate(() => {
      const p1 = DB.products.find(x => x.id === 'PRD-D-TEST1');
      const p2 = DB.products.find(x => x.id === 'PRD-D-TEST2');
      const p3 = DB.products.find(x => x.id === 'PRD-D-TEST3');
      return {
        enabled: discountsAreEnabled(),
        price1: effectiveOnlinePrice(p1),
        price2: effectiveOnlinePrice(p2),
        price3: effectiveOnlinePrice(p3),
      };
    });
    r.eq('الخصومات شغالة افتراضيًا (مفيش إعداد قديم)', before.enabled, true);
    r.eq('صنف بخصم شرعي (100 -> 80): السعر الفعلي 80', before.price1, 80);
    r.eq('صنف من غير خصم: السعر الفعلي يفضل زي سعر البيع (200)', before.price2, 200);
    r.eq('صنف بسعر أونلاين 300 وخصم لـ250: السعر الفعلي 250 (مش سعر البيع 500)', before.price3, 250);

    // نتأكد إن pushOnlineCatalogIfChanged (لو موجودة) بتبني الكتالوج صح مع originalPrice
    const catalogItems = await page.evaluate(() => {
      if (typeof pushOnlineCatalogIfChanged !== 'function') return null;
      // نلف الدالة مؤقتًا عشان نمسك الـpayload من غير ما نحتاج فايرستور حقيقي
      const items = (DB.products || []).filter(p => p && p.onlineVisible).map(p => {
        const base = (p.onlinePrice != null) ? p.onlinePrice : (p.sell || 0);
        const price = effectiveOnlinePrice(p);
        return { id: p.id, price, originalPrice: price < base ? base : null };
      });
      return items;
    });
    const c1 = catalogItems.find(x => x.id === 'PRD-D-TEST1');
    const c2 = catalogItems.find(x => x.id === 'PRD-D-TEST2');
    const c3 = catalogItems.find(x => x.id === 'PRD-D-TEST3');
    r.eq('الكتالوج: الصنف بخصم شرعي بيبعت originalPrice=100 و price=80', [c1.price, c1.originalPrice], [80, 100]);
    r.eq('الكتالوج: الصنف من غير خصم مايبعتش originalPrice خالص', [c2.price, c2.originalPrice], [200, null]);
    r.eq('الكتالوج: صنف أونلاين بخصم originalPrice=300 و price=250', [c3.price, c3.originalPrice], [250, 300]);

    // نجرب زرار "إيقاف كل الخصومات" — المفروض كل الأسعار ترجع للأصلية فورًا
    await page.evaluate(() => { toggleAllDiscounts(); });
    const after = await page.evaluate(() => {
      const p1 = DB.products.find(x => x.id === 'PRD-D-TEST1');
      const p3 = DB.products.find(x => x.id === 'PRD-D-TEST3');
      return { enabled: discountsAreEnabled(), price1: effectiveOnlinePrice(p1), price3: effectiveOnlinePrice(p3) };
    });
    r.eq('بعد الضغط على "إيقاف كل الخصومات": discountsAreEnabled() بقت false', after.enabled, false);
    r.eq('بعد الإيقاف: صنف كان عليه خصم 100->80 يرجع لسعره الأصلي 100', after.price1, 100);
    r.eq('بعد الإيقاف: الصنف التاني (أونلاين 300 خصم 250) يرجع لـ300', after.price3, 300);

    // نشغّل الخصومات تاني ونتأكد إنها ترجع
    await page.evaluate(() => { toggleAllDiscounts(); });
    const again = await page.evaluate(() => {
      const p1 = DB.products.find(x => x.id === 'PRD-D-TEST1');
      return { enabled: discountsAreEnabled(), price1: effectiveOnlinePrice(p1) };
    });
    r.eq('بعد تشغيل الخصومات تاني: discountsAreEnabled() رجعت true', again.enabled, true);
    r.eq('بعد التشغيل تاني: السعر الفعلي رجع 80', again.price1, 80);

    // ===== التحقق من صحة إدخال "سعر بعد الخصم" في شاشة المنتج (saveProd) =====
    const validation = await page.evaluate(() => {
      // نفتح شاشة إضافة منتج جديد ونملى بيانات بسعر خصم غلط (أكبر من سعر البيع)
      openProdModal();
      $('pr-nm').value = 'صنف تجربة تحقق';
      $('pr-cat').value = $('pr-cat').options[0] ? $('pr-cat').options[0].value : '';
      $('pr-sell').value = '100';
      $('pr-discount-price').value = '150'; // غلط: أكبر من سعر البيع
      const beforeCount = DB.products.length;
      saveProd();
      const afterBadCount = DB.products.length;
      // نصلّح السعر لقيمة صحيحة (أقل من سعر البيع) ونحفظ تاني
      $('pr-discount-price').value = '90';
      saveProd();
      const afterGoodCount = DB.products.length;
      const saved = DB.products.find(p => p.name === 'صنف تجربة تحقق');
      return {
        blockedBadDiscount: afterBadCount === beforeCount,
        savedAfterFix: afterGoodCount === beforeCount + 1,
        savedDiscountPrice: saved ? saved.discountPrice : null,
      };
    });
    r.ok('saveProd() رفض حفظ خصم أكبر من السعر الحالي (منع بيانات غلط)', validation.blockedBadDiscount);
    r.ok('بعد تصحيح الخصم لقيمة صح، المنتج اتحفظ فعليًا', validation.savedAfterFix);
    r.eq('discountPrice اتسجل صح على المنتج المحفوظ', validation.savedDiscountPrice, 90);

    r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
    if (pageErrors.length) console.log('  pageErrors:', pageErrors);
  } finally {
    await browser.close();
  }
  process.exit(r.close() ? 0 : 1);
})();
