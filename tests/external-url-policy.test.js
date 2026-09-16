// ======= اختبار Node عادي (من غير Electron/متصفح) لسياسة الروابط الخارجية =======
// main.js بيستخدم lib/externalUrlPolicy.js عشان يقرر أي روابط يسمح بفتحها في
// برنامج خارجي (shell.openExternal) لما window.open() تتنادى جوه الواجهة. مهم
// إننا نتأكد إن الرابط الجديد (whatsapp://) مسموح بيه (عشان حل شكوى "بيفتح كروم
// الأول")، وإن أي حاجة خطيرة (file://, javascript:) لسه ممنوعة زي ما هي تمامًا —
// من غير ما نحتاج نشغّل Electron كامل عشان نتأكد.
const { isAllowedExternalUrl } = require('../lib/externalUrlPolicy');

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; console.log(`  ✓ ${desc}`); }
  else { fail++; console.log(`  ✗ ${desc}`); }
}

console.log('\n===== external-url-policy.test.js =====');

ok('رابط https عادي مسموح', isAllowedExternalUrl('https://wa.me/201012345678?text=hi'));
ok('رابط http عادي مسموح', isAllowedExternalUrl('http://example.com'));
ok('رابط whatsapp:// (تطبيق سطح المكتب) مسموح', isAllowedExternalUrl('whatsapp://send?phone=201012345678&text=hi'));
ok('حروف كبيرة في بداية whatsapp:// برضه مسموحة', isAllowedExternalUrl('WhatsApp://send?phone=201012345678'));
ok('رابط file:// ممنوع (أمان)', !isAllowedExternalUrl('file:///C:/Windows/System32/cmd.exe'));
ok('رابط javascript: ممنوع (أمان)', !isAllowedExternalUrl('javascript:alert(1)'));
ok('رابط فاضي/غير موجود ممنوع', !isAllowedExternalUrl('') && !isAllowedExternalUrl(undefined));
ok('بروتوكول عشوائي غير معروف ممنوع', !isAllowedExternalUrl('myapp://open'));

console.log(`\nexternal-url-policy: ${pass} نجحت، ${fail} فشلت\n`);
process.exitCode = fail === 0 ? 0 : 1;
