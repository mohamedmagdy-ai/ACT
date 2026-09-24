// ======= اختبار: صور متعددة + وصف + ضمان + توفر قطع غيار على المنتج =======
// بيتأكد إن الحقول الجديدة (اللي بتغذي صفحة تفاصيل المنتج في الموقع) بتتسجل صح
// من شاشة "تعديل منتج"، وإن بناء الكتالوج بيوفّر توافق للخلف صح لأي صنف قديم
// عنده imageUrl واحدة بس من غير images[] (قبل التحديث ده).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const { browser, page, pageErrors } = await openApp();
  const r = new TestReporter('product-detail-fields-verify');
  try {
    const setup = await page.evaluate(() => {
      CURRENT_USER = { role: 'admin', name: 'Test Admin' };
      return {
        hasHandler: typeof handleProdImageSelect === 'function',
        hasRenderPreview: typeof renderProdImagesPreview === 'function',
        hasAddImage: typeof prAddImage === 'function',
      };
    });
    r.ok('دوال الصور المتعددة موجودة (handleProdImageSelect/renderProdImagesPreview/prAddImage)',
      setup.hasHandler && setup.hasRenderPreview && setup.hasAddImage);

    const saved = await page.evaluate(() => {
      openProdModal();
      $('pr-nm').value = 'غسالة تجربة';
      $('pr-cat').value = $('pr-cat').options[0] ? $('pr-cat').options[0].value : '';
      $('pr-sell').value = '5000';
      _prImagesDraft = ['https://img.example/1.jpg', 'https://img.example/2.jpg', 'https://img.example/3.jpg'];
      renderProdImagesPreview();
      $('pr-description').value = 'غسالة أوتوماتيك 8 كيلو';
      $('pr-warranty-text').value = 'سنتين';
      $('pr-parts-available').checked = true;
      saveProd();
      const p = DB.products.find(x => x.name === 'غسالة تجربة');
      return {
        found: !!p,
        images: p ? p.images : null,
        imageUrl: p ? p.imageUrl : null,
        description: p ? p.description : null,
        warrantyText: p ? p.warrantyText : null,
        partsAvailable: p ? p.partsAvailable : null,
      };
    });
    r.ok('المنتج اتحفظ فعليًا', saved.found);
    r.eq('الصور الثلاثة اتسجلت بالترتيب الصح', saved.images,
      ['https://img.example/1.jpg', 'https://img.example/2.jpg', 'https://img.example/3.jpg']);
    r.eq('أول صورة اتسجلت كـimageUrl (توافق للخلف)', saved.imageUrl, 'https://img.example/1.jpg');
    r.eq('الوصف الحر اتسجل صح', saved.description, 'غسالة أوتوماتيك 8 كيلو');
    r.eq('نص الضمان (اختياري لكل صنف، مش نص ثابت للكل) اتسجل صح', saved.warrantyText, 'سنتين');
    r.eq('توفر قطع الغيار اتسجل true', saved.partsAvailable, true);

    // منتج تاني من غير ضمان ومن غير توفر قطع غيار — يتأكد إن الاختيار حر فعلاً
    // ومش نص/حالة ثابتة لكل الأصناف
    const saved2 = await page.evaluate(() => {
      openProdModal();
      $('pr-nm').value = 'صنف تجربة من غير ضمان';
      $('pr-cat').value = $('pr-cat').options[0] ? $('pr-cat').options[0].value : '';
      $('pr-sell').value = '1000';
      _prImagesDraft = [];
      renderProdImagesPreview();
      $('pr-description').value = '';
      $('pr-warranty-text').value = '';
      $('pr-parts-available').checked = false;
      saveProd();
      const p = DB.products.find(x => x.name === 'صنف تجربة من غير ضمان');
      return { warrantyText: p ? p.warrantyText : null, partsAvailable: p ? p.partsAvailable : null, images: p ? p.images : null };
    });
    r.eq('صنف من غير ضمان: warrantyText فاضي (مفيش نص ثابت افتراضي)', saved2.warrantyText, '');
    r.eq('توفر قطع الغيار بقى false لما اتشال التيك', saved2.partsAvailable, false);
    r.eq('صنف من غير صور: images[] فاضية', saved2.images, []);

    // بناء عنصر الكتالوج (نفس منطق pushOnlineCatalogIfChanged) — نتأكد من توافق
    // الصنف القديم (imageUrl بس، من غير images[]) للخلف
    const catalogCheck = await page.evaluate(() => {
      const legacy = { id: 'LEGACY-1', name: 'صنف قديم', imageUrl: 'https://img.example/legacy.jpg', images: [], onlineVisible: true, qty: 1, section: 'devices' };
      const fresh = DB.products.find(x => x.name === 'غسالة تجربة');
      function buildCatalogItem(p) {
        return {
          images: (p.images && p.images.length) ? p.images : (p.imageUrl ? [p.imageUrl] : []),
          description: p.description || '',
          warrantyText: p.warrantyText || '',
          partsAvailable: p.partsAvailable !== false,
        };
      }
      return { legacy: buildCatalogItem(legacy), fresh: buildCatalogItem(fresh) };
    });
    r.eq('صنف قديم (imageUrl بس): الكتالوج بيبني images[] من الصورة الواحدة', catalogCheck.legacy.images, ['https://img.example/legacy.jpg']);
    r.eq('صنف جديد: الكتالوج بيبعت كل الصور التلاتة', catalogCheck.fresh.images.length, 3);

    r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
    if (pageErrors.length) console.log('  pageErrors:', pageErrors);
  } finally {
    await browser.close();
  }
  process.exit(r.close() ? 0 : 1);
})();
