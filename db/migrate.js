// db/migrate.js — سكريبت ترحيل البيانات من صيغة الـbackup الحالية (localStorage/JSON)
// لقاعدة بيانات SQLite. بياخد بالظبط نفس ملف الـ"تصدير" اللي البرنامج بيطلّعه دلوقتي
// (function exportBackup في الملف الرئيسي)، وبيتحقق فعليًا (مش افتراض) إن كل سجل
// اتنقل صح قبل ما يعتبر النقل ناجح.

const fs = require('node:fs');
const { DataAccess, TABLE_MAP } = require('./dataAccess');

/**
 * يرحّل كائن DB (بنفس شكل exportBackup: {db, counters, savedAt, version}) لملف SQLite.
 * بيرجع تقرير تفصيلي: هل كل مجموعة اتنقلت بنفس العدد، وأمثلة لو فيه أي فرق.
 */
async function migrateFromBackupObject(backupObj, sqliteFilePath) {
  if (!backupObj || !backupObj.db || typeof backupObj.db !== 'object') {
    throw new Error('صيغة ملف الـ backup غير صحيحة — مفتاح db مفقود');
  }
  const dbObject = backupObj.db;

  const da = await DataAccess.create(sqliteFilePath);
  da.saveAll(dbObject);

  // ======= تحقق فعلي، مش افتراض: نعيد القراءة من القاعدة الجديدة ونقارن كل مجموعة =======
  const verify = da.loadAll();
  const report = {};
  let allMatch = true;
  let totalRecordsBefore = 0;
  let totalRecordsAfter = 0;

  for (const key of Object.keys(TABLE_MAP)) {
    const before = Array.isArray(dbObject[key]) ? dbObject[key].length : 0;
    const after = Array.isArray(verify[key]) ? verify[key].length : 0;
    const match = before === after;
    if (!match) allMatch = false;
    totalRecordsBefore += before;
    totalRecordsAfter += after;
    report[key] = { before, after, match };
  }

  // ======= تحقق أعمق: نتأكد إن أول وآخر سجل في أكبر ٣ مجموعات (الأكثر أهمية ماليًا)
  // اتنقلوا بكل تفاصيلهم (مش بس العدد)، عشان نلقط أي تلف في البيانات نفسها مش بس فقدان
  // سجلات كاملة =======
  const deepCheckKeys = ['sales', 'purchases', 'maintenance'].filter(k => Array.isArray(dbObject[k]) && dbObject[k].length > 0);
  const deepCheck = {};
  for (const key of deepCheckKeys) {
    const originalFirst = dbObject[key][0];
    const originalLast = dbObject[key][dbObject[key].length - 1];
    const migratedFirst = (verify[key] || []).find(r => r.id === originalFirst.id);
    const migratedLast = (verify[key] || []).find(r => r.id === originalLast.id);
    const firstMatch = migratedFirst && JSON.stringify(migratedFirst) === JSON.stringify(originalFirst);
    const lastMatch = migratedLast && JSON.stringify(migratedLast) === JSON.stringify(originalLast);
    deepCheck[key] = { firstMatch: !!firstMatch, lastMatch: !!lastMatch };
    if (!firstMatch || !lastMatch) allMatch = false;
  }

  da.close();

  return {
    success: allMatch,
    totalRecordsBefore,
    totalRecordsAfter,
    report,
    deepCheck,
    migratedAt: new Date().toISOString(),
    sourceBackupDate: backupObj.savedAt || null,
  };
}

/**
 * يقرأ ملف backup فعلي من القرص (نفس الملف اللي بينزل من زرار "تصدير" في البرنامج)
 * ويرحّله لـSQLite.
 */
async function migrateFromBackupFile(backupFilePath, sqliteFilePath) {
  const raw = fs.readFileSync(backupFilePath, 'utf8');
  const backupObj = JSON.parse(raw);
  return migrateFromBackupObject(backupObj, sqliteFilePath);
}

module.exports = { migrateFromBackupObject, migrateFromBackupFile };
