// ======= اختبار: توضيح قطع الغيار الحقيقية تحت سطر "قطع الغيار — الجهاز" الملخّص =======
// المشكلة اللي بيحلها الكود ده: فاتورة الصيانة المرتبطة بأمر شغل بتخزّن سطر واحد
// ملخّص ("قطع الغيار — الجهاز") عشان تتفادى خصم مزدوج من المخزون. ده كان بيخلي
// المستخدم وهو شغال على الفاتورة (مش وقت الطباعة بس) محتاج يرجع لأمر الشغل نفسه
// عشان يعرف إيه اللي اتصرف فعليًا. الاختبار ده بيتأكد إن buildMIItemsTable/
// buildTMntItemsTable بيضيفوا سطر عرض إضافي (للقراءة بس) تحت السطر الملخّص، من
// غير ما يلمسوا القيمة المخزّنة/القابلة للتعديل نفسها (الحماية من الخصم المزدوج
// فاضلة زي ما هي تمامًا).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('maint-inv-parts-details');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    DB.workOrders = DB.workOrders || [];
    DB.workOrders.push({
      id: 'WO-TEST-9001',
      device: 'اسبريسو',
      cost: 250,
      partsItems: [
        { name: 'سويتش باور', qty: 1, sell: 150, buy: 100 },
        { name: 'كريان', qty: 2, sell: 50, buy: 30 },
      ],
    });
    document.getElementById('mi-wo-id').value = 'WO-TEST-9001';
    miItems = [{ name: 'قطع الغيار — اسبريسو', qty: 1, price: 250, disc: 0 }];
    buildMIItemsTable();
    const html = document.getElementById('mi-items-body').innerHTML;
    return {
      mentionsWO: html.includes('WO-TEST-9001'),
      mentionsPart1: html.includes('سويتش باور') && html.includes('×1'),
      mentionsPart2: html.includes('كريان') && html.includes('×2'),
      nameInputUntouched: html.includes('value="قطع الغيار — اسبريسو"'),
      storedDataUntouched: miItems[0].name === 'قطع الغيار — اسبريسو',
    };
  });
  r.ok('سطر التفاصيل بيوضح رقم أمر الشغل المرتبط', t1.mentionsWO);
  r.ok('سطر التفاصيل بيوضح أول قطعة فعلية باسمها وكميتها', t1.mentionsPart1);
  r.ok('سطر التفاصيل بيوضح تاني قطعة فعلية باسمها وكميتها', t1.mentionsPart2);
  r.ok('خانة اسم البند نفسها فضلت زي ما هي (السطر الملخّص) — قابلة للتعديل عادي', t1.nameInputUntouched);
  r.ok('البيانات المخزّنة (miItems) اتحفظت من غير أي تغيير — الحماية من الخصم المزدوج سليمة', t1.storedDataUntouched);

  const t2 = await page.evaluate(() => {
    document.getElementById('mi-wo-id').value = '';
    miItems = [{ name: 'فلتر مياه', qty: 1, price: 80, disc: 0 }];
    buildMIItemsTable();
    const html = document.getElementById('mi-items-body').innerHTML;
    return !html.includes('القطع المستخدمة فعليًا');
  });
  r.ok('بند عادي (مش ملخّص أمر شغل) — مفيش سطر تفاصيل إضافي بيظهر', t2);

  const t3 = await page.evaluate(() => {
    DB.workOrders.push({
      id: 'WO-TEST-9002',
      device: 'خلاط',
      cost: 100,
      partsItems: [{ name: 'سكينة خلاط', qty: 1, sell: 100, buy: 60 }],
    });
    document.getElementById('tmnt-wo-id').value = 'WO-TEST-9002';
    tmntItems = [{ name: 'قطع الغيار — خلاط', qty: 1, price: 100, disc: 0 }];
    buildTMntItemsTable();
    const html = document.getElementById('tmnt-items-body').innerHTML;
    return html.includes('WO-TEST-9002') && html.includes('سكينة خلاط') && html.includes('×1');
  });
  r.ok('نفس السلوك في الفاتورة الضريبية للصيانة (buildTMntItemsTable)', t3);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
