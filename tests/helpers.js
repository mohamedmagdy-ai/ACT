// ======= أداة مساعدة مشتركة لكل ملفات الاختبار =======
// بتفتح index.html فعليًا جوه متصفح حقيقي (Chromium عبر Playwright) وتمنع أي طلب شبكة
// خارجي (Firebase/CDN) عشان الاختبارات تفحص منطق الكود نفسه بس، وتشتغل من غير إنترنت
// وبدون أي بيانات حقيقية.
const { chromium } = require('playwright');
const path = require('path');

async function openApp(opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('**/*', route => {
    if (route.request().url().startsWith('file://')) route.continue();
    else route.abort();
  });
  const filePath = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(filePath);
  await page.waitForTimeout(opts.waitMs ?? 300);
  return { browser, page, pageErrors };
}

// إطار تقارير بسيط جدًا (زيرو dependencies) — بيطبع ✓/✗ لكل حالة وبيرجع true/false
// في النهاية عشان run-all.js يقرر كود الخروج (exit code) المناسب لأي CI مستقبلي.
class TestReporter {
  constructor(name) { this.name = name; this.pass = 0; this.fail = 0; this.failures = []; }
  ok(desc, cond) {
    if (cond) { this.pass++; console.log(`  ✓ ${desc}`); }
    else { this.fail++; this.failures.push(desc); console.log(`  ✗ ${desc}`); }
  }
  eq(desc, actual, expected) {
    const cond = JSON.stringify(actual) === JSON.stringify(expected);
    this.ok(`${desc} (الناتج: ${JSON.stringify(actual)} — المتوقع: ${JSON.stringify(expected)})`, cond);
  }
  close() {
    console.log(`\n${this.name}: ${this.pass} نجحت، ${this.fail} فشلت\n`);
    return this.fail === 0;
  }
}

module.exports = { openApp, TestReporter };
