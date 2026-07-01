/**
 * 独立数据库迁移脚本 — 处理 sleep_reports 新增列 + doctor_authorizations 表重建
 *
 * 用法：node backend/db/migrate-add-column.js
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '..', '..', 'sleep_care.db');

(async () => {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);
  db.run('PRAGMA foreign_keys = ON;');

  // ============================================================
  // 1. sleep_reports 新增 noise_json / sleep_stages_json
  // ============================================================
  const columns = [];
  const stmt = db.prepare("PRAGMA table_info('sleep_reports');");
  while (stmt.step()) columns.push(stmt.getAsObject().name);
  stmt.free();
  console.log('当前 sleep_reports 列:', columns.join(', '));

  const newColumns = ['noise_json', 'sleep_stages_json'];
  for (const col of newColumns) {
    if (!columns.includes(col)) {
      console.log(`${col} 列不存在，执行 ALTER TABLE ADD COLUMN...`);
      try {
        db.run(`ALTER TABLE sleep_reports ADD COLUMN ${col} TEXT;`);
        console.log(`ALTER TABLE ADD ${col} 成功`);
      } catch (e) {
        console.error(`ALTER TABLE ADD ${col} 失败:`, e.message);
      }
    }
  }

  for (const col of newColumns) {
    db.run(`UPDATE sleep_reports SET ${col} = '[]' WHERE ${col} IS NULL;`);
  }

  // ============================================================
  // 2. doctor_authorizations 表结构升级
  //    检测 created_at/updated_at 判断是否需要重建
  // ============================================================
  const authCols = [];
  const astmt = db.prepare("PRAGMA table_info('doctor_authorizations');");
  while (astmt.step()) authCols.push(astmt.getAsObject().name);
  astmt.free();

  if (authCols.length > 0 && (!authCols.includes('created_at') || !authCols.includes('updated_at'))) {
    console.log('[migrate] doctor_authorizations 为旧版本，执行重建...');
    db.run('DROP TABLE IF EXISTS doctor_authorizations;');
    db.run(`
      CREATE TABLE doctor_authorizations (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id    INTEGER NOT NULL,
        doctor_id     INTEGER NOT NULL,
        status        TEXT    NOT NULL DEFAULT 'pending',
        expire_date   TEXT    NOT NULL,
        doctor_note   TEXT,
        requested_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        responded_at  TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id)  REFERENCES users(user_id) ON DELETE CASCADE
      );
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_auth_patient ON doctor_authorizations(patient_id);');
    db.run('CREATE INDEX IF NOT EXISTS idx_auth_doctor ON doctor_authorizations(doctor_id);');
    db.run('CREATE INDEX IF NOT EXISTS idx_auth_status ON doctor_authorizations(status);');
    console.log('[migrate] doctor_authorizations 已重建');
  } else if (authCols.length === 0) {
    console.log('[migrate] doctor_authorizations 表不存在，跳过程序（server 启动时自动创建）');
  } else {
    console.log('[migrate] doctor_authorizations 已是最新版本');
  }

  // ============================================================
  // 写回磁盘
  // ============================================================
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  console.log('已持久化到', DB_PATH);

  // 验证
  const db2 = new SQL.Database(buffer);
  const vCols = [];
  const vstmt = db2.prepare("PRAGMA table_info('sleep_reports');");
  while (vstmt.step()) vCols.push(vstmt.getAsObject().name);
  vstmt.free();

  const vAuthCols = [];
  const vastmt = db2.prepare("PRAGMA table_info('doctor_authorizations');");
  while (vastmt.step()) vAuthCols.push(vastmt.getAsObject().name);
  vastmt.free();
  db2.close();

  console.log('验证 — sleep_reports:', vCols.join(', '));
  console.log('验证 — doctor_authorizations:', vAuthCols.join(', '));
  const reportsOk = ['noise_json', 'sleep_stages_json'].every(c => vCols.includes(c));
  const authOk = ['patient_id', 'doctor_id', 'expire_date', 'doctor_note', 'requested_at', 'responded_at', 'created_at', 'updated_at'].every(c => vAuthCols.includes(c));
  console.log(reportsOk && authOk ? '✅ 迁移成功' : '⚠️ 部分迁移未完成');
})();
