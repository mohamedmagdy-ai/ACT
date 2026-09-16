// db/dataAccess.js — طبقة الوصول لبيانات SQLite (نسخة sql.js — بدون أي تجميع خاص
// بنظام التشغيل، عشان تشتغل من أي بيئة بناء من غير مشاكل التوافق اللي واجهناها مع
// better-sqlite3). الفرق الجوهري: sql.js بيشتغل بالكامل في الذاكرة، ولازم نصدّر
// (export) قاعدة البيانات ونكتبها كملف بأنفسنا بعد كل تغيير (دالة persist()).

const initSqlJs = require('sql.js');
const fs = require('node:fs');
const path = require('node:path');

const TABLE_MAP = {
  customers: { table: 'customers', hot: ['name', 'phone'] },
  products: { table: 'products', hot: ['name', 'sell', 'buy', 'qty'] },
  sales: { table: 'sales', hot: ['date', 'customer', 'customer_phone', 'status', 'total'] },
  maintenance: { table: 'maintenance', hot: ['date', 'customer', 'customer_phone', 'device', 'status'] },
  purchases: { table: 'purchases', hot: ['date', 'supplier', 'type', 'total'] },
  custody: { table: 'custody', hot: ['employee', 'date'] },
  expenses: { table: 'expenses', hot: ['date', 'category', 'amount'] },
  receipts: { table: 'receipts', hot: ['date', 'customer', 'status'] },
  workOrders: { table: 'work_orders', hot: ['date', 'customer', 'status', 'tech'] },
  maintInvoices: { table: 'maint_invoices', hot: ['date', 'customer', 'total'] },
  returns: { table: 'returns', hot: ['date'] },
  taxInvoices: { table: 'tax_invoices', hot: ['date', 'customer', 'total'] },
  employees: { table: 'employees', hot: ['name', 'role'] },
  payments: { table: 'payments', hot: ['date'] },
  insuranceLimits: { table: 'insurance_limits', hot: [] },
  insurancePayments: { table: 'insurance_payments', hot: ['date'] },
  fixedAssets: { table: 'fixed_assets', hot: [] },
  openingBalances: { table: 'opening_balances', hot: ['month', 'amount'] },
  withdrawals: { table: 'withdrawals', hot: ['date', 'partner', 'amount'] },
  logs: { table: 'audit_logs', hot: ['at', 'seq'] },
  disassemblies: { table: 'disassemblies', hot: ['date'] },
  partnerCapital: { table: 'partner_capital', hot: ['partner'] },
  branches: { table: 'branches', hot: ['name'] },
  serviceCenters: { table: 'service_centers', hot: [] },
  transfers: { table: 'transfers', hot: ['date', 'status'] },
  technicianCommissions: { table: 'technician_commissions', hot: ['tech_id', 'month'] },
  partnerCapitalInjections: { table: 'partner_capital_injections', hot: ['partner', 'date', 'amount'] },
  pendingWhatsapp: { table: 'pending_whatsapp', hot: ['sent'] },
  syncConflicts: { table: 'sync_conflicts', hot: ['time', 'table_name'] },
  loyaltyPoints: { table: 'loyalty_points', hot: ['customer_id', 'date'] },
};

const COLUMN_ALIASES = {
  customer_phone: 'customerPhone',
  from_branch: 'fromBranch',
  to_branch: 'toBranch',
  tech_id: 'techId',
  is_tax: 'isTax',
  exit_type: 'exit',
  customer_id: 'customerId',
  table_name: 'table',
};

function jsKeyForColumn(col) {
  return COLUMN_ALIASES[col] || col;
}

function colNameFromHot(hotField) {
  const reverseAlias = Object.entries(COLUMN_ALIASES).find(([, v]) => v === hotField);
  if (reverseAlias) return reverseAlias[0];
  return hotField.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

class DataAccess {
  // الإنشاء بيحصل عن طريق DataAccess.create() (async) مش constructor مباشر، لأن
  // sql.js نفسها محتاجة تحميل غير متزامن (WebAssembly) قبل أي استخدام
  constructor(db, dbFilePath) {
    this.db = db;
    this.dbFilePath = dbFilePath;
  }

  static async create(dbFilePath) {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // مهم جداً (إصلاح مشكلة تعليق حقيقية اتأكدت من مستخدم حقيقي على ويندوز): من غير
    // locateFile صريحة، sql.js بتحاول تحسب مسار ملف sql-wasm.wasm تلقائيًا (__dirname
    // + "/sql-wasm.wasm")، وده معروف إنه بيسبب تعليق أو فشل صامت جوه تطبيقات Electron
    // المُجمّعة (asar) على بعض أجهزة Windows تحديدًا — مشكلة موثّقة كتير في مجتمع
    // Electron/sql.js. الحل: نحدد المسار الفعلي بأنفسنا صراحة، ونحوّله لنسخة
    // "app.asar.unpacked" (الملفات الحقيقية على القرص بره الأرشيف الافتراضي، بفضل
    // إعداد asarUnpack في package.json) عشان WebAssembly تتحمّل من ملف حقيقي على
    // القرص مباشرة، مش من جوه أرشيف asar الافتراضي.
    const SQL = await initSqlJs({
      locateFile: (file) => {
        const p = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
        return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep).replace('app.asar/', 'app.asar.unpacked/');
      },
    });
    let db;
    if (fs.existsSync(dbFilePath)) {
      const fileBuffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.run(schema);
    return new DataAccess(db, dbFilePath);
  }

  // كتابة قاعدة البيانات الحالية (في الذاكرة) لملف حقيقي على القرص — لازم تتنادى
  // بعد أي تعديل (saveCollection / saveAll) عشان التغيير يتحفظ فعليًا
  // مهم جدًا للأمان: بنكتب في ملف مؤقت الأول، وبعدين نستبدل بيه الملف الأصلي دفعة واحدة
  // (rename ذرّي). لو كتبنا في الملف الأصلي مباشرة وانقطع الكهرباء أو البرنامج اتقفل
  // فجأة نص الكتابة، ممكن قاعدة البيانات كلها (مش بس آخر تعديل) تتلف وتبقى غير قابلة
  // للقراءة خالص. بالطريقة دي: لو الكتابة في الملف المؤقت فشلت أو انقطعت، الملف الأصلي
  // يفضل زي ما هو تمامًا (سليم) لحد ما نجرب نحفظ تاني.
  persist() {
    const data = this.db.export();
    const tmpPath = this.dbFilePath + '.tmp';
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, this.dbFilePath);
  }

  loadAll() {
    const out = {};
    for (const [key, cfg] of Object.entries(TABLE_MAP)) {
      // مهم جدًا: ORDER BY rowid صراحة، مش اعتماد على "سلوك افتراضي" لـSQLite. من غير
      // كده، الترتيب اللي بيرجع مش مضمون رسميًا (حتى لو في الغالب بيرجع بترتيب الإدخال)،
      // وده خطير تحديدًا لسجل التدقيق (audit_logs) اللي سلسلة الهاش بتاعته لازم تتقرأ
      // بترتيبها الصحيح بالظبط عشان فحص التلاعب يفضل دقيق
      const res = this.db.exec(`SELECT data FROM ${cfg.table} ORDER BY rowid ASC`);
      const rows = res.length ? res[0].values : [];
      out[key] = rows.map((r) => JSON.parse(r[0]));
    }
    return out;
  }

  saveCollection(key, records) {
    const cfg = TABLE_MAP[key];
    if (!cfg) throw new Error(`مجموعة غير معروفة: ${key}`);
    const isBranchesTable = key === 'branches';
    const isTransfersTable = key === 'transfers';
    this.db.run(`DELETE FROM ${cfg.table}`);
    const hotCols = cfg.hot.map((h) => colNameFromHot(h));
    let baseCols;
    if (isBranchesTable) baseCols = ['id'];
    else if (isTransfersTable) baseCols = ['id', 'from_branch', 'to_branch'];
    else baseCols = ['id', 'branch_id'];
    const colNames = [...baseCols, ...hotCols, 'data'].join(',');
    const placeholders = [...baseCols, ...hotCols, 'data'].map(() => '?').join(',');
    const stmt = this.db.prepare(`INSERT INTO ${cfg.table} (${colNames}) VALUES (${placeholders})`);
    try {
      for (const item of records || []) {
        const id = item.id != null ? String(item.id) : cryptoRandomId();
        const hotValues = cfg.hot.map((h) => {
          const jsKey = jsKeyForColumn(colNameFromHot(h));
          const v = item[jsKey];
          if (typeof v === 'boolean') return v ? 1 : 0;
          return v != null ? v : null;
        });
        if (isBranchesTable) {
          stmt.run([id, ...hotValues, JSON.stringify(item)]);
        } else if (isTransfersTable) {
          const fromB = item.fromBranch || item.from_branch || 'BR-MAIN';
          const toB = item.toBranch || item.to_branch || 'BR-MAIN';
          stmt.run([id, fromB, toB, ...hotValues, JSON.stringify(item)]);
        } else {
          const branchId = item.branch || item.branchId || item.branch_id || 'BR-MAIN';
          stmt.run([id, branchId, ...hotValues, JSON.stringify(item)]);
        }
      }
    } finally {
      stmt.free();
    }
  }

  saveAll(dbObj) {
    this.db.run('PRAGMA foreign_keys = OFF');
    this.db.run('BEGIN TRANSACTION');
    try {
      if (Array.isArray(dbObj.branches)) this.saveCollection('branches', dbObj.branches);
      for (const key of Object.keys(TABLE_MAP)) {
        if (key === 'branches') continue;
        if (Array.isArray(dbObj[key])) this.saveCollection(key, dbObj[key]);
      }
      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    } finally {
      this.db.run('PRAGMA foreign_keys = ON');
    }
    this.persist();
  }

  close() {
    this.db.close();
  }
}

function cryptoRandomId() {
  return 'ID-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = { DataAccess, TABLE_MAP };
