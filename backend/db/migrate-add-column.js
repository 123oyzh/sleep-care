/**
 * 独立数据库迁移脚本 — 将已有行中 sleep_stages_json = NULL 初始化为 '[]'
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

  // 检查 sleep_stages_json 列是否存在，不存在则先添加
  const columns = [];
  const stmt = db.prepare("PRAGMA table_info('sleep_reports');");
  while (stmt.step()) columns.push(stmt.getAsObject().name);
  stmt.free();

  console.log('当前 sleep_reports 列:', columns.join(', '));

  if (!columns.includes('sleep_stages_json')) {
    console.log('sleep_stages_json 列不存在，执行 ALTER TABLE ADD COLUMN...');
    db.run('ALTER TABLE sleep_reports ADD COLUMN sleep_stages_json TEXT;');
    console.log('ALTER TABLE 成功');
  }

  // 将已有数据中 sleep_stages_json IS NULL 的行统一初始化为 '[]'
  const updated = db.run(
    "UPDATE sleep_reports SET sleep_stages_json = '[]' WHERE sleep_stages_json IS NULL;"
  );
  // sql.js db.run() 不返回影响行数，手动查一下
  const nullRows = [];
  const stmt2 = db.prepare('SELECT COUNT(*) AS cnt FROM sleep_reports WHERE sleep_stages_json IS NULL;');
  if (stmt2.step()) nullRows.push(stmt2.getAsObject());
  stmt2.free();

  console.log('剩余 NULL 行数:', nullRows[0]?.cnt || 0);

  // 写回磁盘
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  console.log('已持久化到', DB_PATH);

  // 验证
  const db2 = new SQL.Database(buffer);
  const verify = [];
  const stmt3 = db2.prepare('SELECT report_id, sleep_stages_json FROM sleep_reports LIMIT 3;');
  while (stmt3.step()) verify.push(stmt3.getAsObject());
  stmt3.free();
  db2.close();

  console.log('验证 — 前 3 行:', JSON.stringify(verify));
  const allNull = verify.every(r => r.sleep_stages_json === '[]');
  console.log(allNull ? '✅ 迁移成功，所有 NULL 已初始化为 []' : '⚠️ 仍有 NULL 值');
})();
