// ======= اختبار: التمرير الافتراضي (Virtual Scrolling) لجدول المخزن =======
// المشكلة اللي بيصلحها الاختبار ده: تاجر عنده مخزن كبير (مئات/آلاف الأصناف) كان
// بيحس إن شاشة "المخزن" بتتقل وتبقى بطيئة وهو بيقلّب في الأصناف (خصوصًا وقت
// البحث، اللي كان بيفرض عرض كل الصفوف مرة واحدة تلقائيًا — راجع srch() القديمة).
// الحل: renderProdsFiltered بقت تبني بس الصفوف الظاهرة فعليًا على الشاشة (+ هامش
// أمان)، مهما كان إجمالي عدد الأصناف. الاختبار ده بيتأكد فعليًا (مش افتراضًا) إن:
//  - مع ٣٠٠٠ صنف، عدد صفوف الـDOM الحقيقية يفضل صغير جدًا (مش ٣٠٠٠ صف).
//  - السكرول لأسفل بيغيّر الصفوف الظاهرة صح (مش نفس الصفوف، ومفيش فجوة فاضية).
//  - البحث بيفلتر صح على مستوى البيانات (مش بيفرض عرض كل حاجة زي قبل كده).
//  - فلتر "لسه مش متعلّم للمتجر الأونلاين" وزرار التعليم السريع شغالين صح مع
//    التمرير الافتراضي، والقايمة بتقصر فعليًا لما تعلّم على صنف.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('products-virtual-scroll');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز ٣٠٠٠ صنف تجريبي (زي مخزن كبير جدًا فعليًا) =====
  await page.evaluate(() => {
    CURRENT_USER = { role: 'admin', name: 'Test Admin' };
    DB.products = [];
    for (let i = 0; i < 3000; i++) {
      DB.products.push({
        id: 'VS-' + String(i).padStart(5, '0'),
        name: (i % 137 === 0 ? 'غسالة كينوود مميزة ' : 'صنف تجريبي ') + i,
        section: i % 5 === 0 ? 'parts' : 'devices',
        cat: 'فئة ' + (i % 10),
        brand: 'براند ' + (i % 7),
        buy: 10 + i,
        sell: 20 + i,
        qty: 5,
        alert: 2,
        onlineVisible: false,
      });
    }
    showTab('products');
  });
  await page.waitForTimeout(200);

  // ===== ١) عدد صفوف الـDOM الحقيقية يفضل صغير جدًا مقارنة بـ٣٠٠٠ صنف =====
  const initial = await page.evaluate(() => ({
    realRows: document.querySelectorAll('#prod-tbl tr[data-pid]').length,
    totalRows: document.querySelectorAll('#prod-tbl tr').length, // بما فيها صفوف التباعد الفاضية
    virtTotal: _prodVirtRows.length,
  }));
  r.ok('إجمالي البيانات المفلترة = 3000 (كل الأصناف، مفيش قص عند البيانات)', initial.virtTotal === 3000);
  r.ok('عدد صفوف DOM الحقيقية أقل بكتير من 3000 (أقل من 100 مثلاً)', initial.realRows > 0 && initial.realRows < 100);
  r.ok('عدد كل صفوف الجدول (شامل صفوف التباعد) ≤ عدد الصفوف الحقيقية + 2 بس', initial.totalRows <= initial.realRows + 2);

  // ===== ٢) أول صف ظاهر فعلاً هو صنف الترتيب الافتراضي (الأحدث فوق = أعلى رقم
  // تسلسلي في الكود، يعني VS-02999) قبل أي سكرول — ده سلوك الترتيب الافتراضي
  // الموجود أصلاً (sortByNewest)، مش حاجة غيّرناها إحنا
  const firstVisible = await page.evaluate(() => {
    const row = document.querySelector('#prod-tbl tr[data-pid]');
    return row ? row.getAttribute('data-pid') : null;
  });
  r.eq('أول صف ظاهر قبل السكرول هو أحدث صنف (الترتيب الافتراضي)', firstVisible, 'VS-02999');

  // ===== ٣) السكرول لنص الصفحة تقريبًا بيغيّر الصفوف الظاهرة (مش لسه نفس الأول) =====
  // ملحوظة: .tbl-wrap (مش window) هي حاوية السكرول الحقيقية للجدول — عندها
  // overflow-x:auto بس في الـCSS، لكن المتصفح بيحسب overflow-y:auto تلقائيًا
  // معاها برضه، فهي اللي بتتحرك فعليًا وانت بتقلّب في الأصناف
  await page.evaluate(() => {
    const wrap = document.getElementById('prod-tbl').closest('.tbl-wrap');
    wrap.scrollTop = wrap.scrollHeight / 2;
    wrap.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(150);
  const afterScroll = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#prod-tbl tr[data-pid]')).map(r => r.getAttribute('data-pid'));
    return { count: rows.length, first: rows[0] };
  });
  r.ok('بعد السكرول لنص الصفحة، الصفوف الظاهرة اتغيّرت (مش أول صنف تاني)', afterScroll.first !== 'VS-02999');
  r.ok('عدد الصفوف الحقيقية فضل محدود برضه بعد السكرول (أقل من 100)', afterScroll.count > 0 && afterScroll.count < 100);

  // ===== ٤) السكرول لآخر الصفحة بيوري أقدم صنف (VS-00000، آخر الترتيب الافتراضي) =====
  await page.evaluate(() => {
    const wrap = document.getElementById('prod-tbl').closest('.tbl-wrap');
    wrap.scrollTop = wrap.scrollHeight;
    wrap.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(150);
  const atEnd = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#prod-tbl tr[data-pid]')).map(r => r.getAttribute('data-pid'));
    return { last: rows[rows.length - 1], hasFirstProduct: rows.includes('VS-00000') };
  });
  r.ok('عند آخر الصفحة، أقدم صنف (VS-00000) موجود فعليًا في الصفوف الظاهرة', atEnd.hasFirstProduct);

  // ===== ٥) البحث بيفلتر على مستوى البيانات (منتج نادر باسم مميز) =====
  await page.evaluate(() => {
    const wrap = document.getElementById('prod-tbl').closest('.tbl-wrap');
    if (wrap) wrap.scrollTop = 0;
  });
  const searchResult = await page.evaluate(() => {
    prodSearch('كينوود مميزة');
    return {
      virtTotal: _prodVirtRows.length,
      realRows: document.querySelectorAll('#prod-tbl tr[data-pid]').length,
      allMatch: _prodVirtRows.every(p => p.name.includes('كينوود مميزة')),
    };
  });
  // 3000/137 ≈ 22 صنف مطابق
  r.ok('البحث رجّع عدد منطقي من النتائج المطابقة (وليس كل الـ3000)', searchResult.virtTotal > 0 && searchResult.virtTotal < 50);
  r.ok('كل النتائج فعليًا بتحتوي على نص البحث', searchResult.allMatch);
  r.ok('عدد صفوف DOM الحقيقية بعد البحث = عدد النتائج المطابقة نفسه (لسه فوق حد التمرير الافتراضي مش محتاج)', searchResult.realRows === searchResult.virtTotal);

  // إعادة تصفير البحث للاختبارات الجاية
  await page.evaluate(() => prodSearch(''));

  // ===== ٦) فلتر "لسه مش متعلّم للمتجر الأونلاين" + التعليم السريع =====
  await page.evaluate(() => {
    DB.products[0].onlineVisible = true; // أول صنف اتعلّم بالفعل
    toggleProdOnlineFilter();
  });
  const filterOn = await page.evaluate(() => ({
    virtTotal: _prodVirtRows.length,
    excludesMarked: !_prodVirtRows.some(p => p.id === 'VS-00000'),
  }));
  r.eq('فلتر "لسه مش متعلّم" بيستثني الصنف اللي اتعلّم بالفعل (2999 من 3000)', filterOn.virtTotal, 2999);
  r.ok('الصنف المتعلّم فعليًا مش موجود في القايمة المفلترة', filterOn.excludesMarked);

  const afterQuickToggle = await page.evaluate(() => {
    const firstUnmarkedId = _prodVirtRows[0].id;
    quickToggleOnlineVisible(firstUnmarkedId);
    return {
      virtTotal: _prodVirtRows.length,
      stillExcluded: !_prodVirtRows.some(p => p.id === firstUnmarkedId),
      actuallyMarked: DB.products.find(p => p.id === firstUnmarkedId).onlineVisible === true,
    };
  });
  r.eq('بعد التعليم السريع على صنف، القايمة قصرت واحد كمان (2998)', afterQuickToggle.virtTotal, 2998);
  r.ok('الصنف اللي اتعلّم سريعًا اختفى من قايمة "لسه مش متعلّم"', afterQuickToggle.stillExcluded);
  r.ok('البيانات الحقيقية في DB.products فعليًا اتحدثت (onlineVisible=true)', afterQuickToggle.actuallyMarked);

  await page.evaluate(() => { toggleProdOnlineFilter(); });

  // ===== ٧) مفيش أي خطأ JS غير متوقع طول الاختبار =====
  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  pageErrors:', pageErrors);

  await browser.close();
  process.exit(r.close() ? 0 : 1);
})();
