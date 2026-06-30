/**
 * 独立数据库迁移脚本 — 为已有 sleep_care.db 添加 noise_json 和 sleep_stages_json 列
 * 并将已有行中的 NULL 值初始化为 '[]'
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

  // 当前列清单
  const columns = [];
  const stmt = db.prepare("PRAGMA table_info('sleep_reports');");
  while (stmt.step()) columns.push(stmt.getAsObject().name);
  stmt.free();
  console.log('当前 sleep_reports 列:', columns.join(', '));

  // 目标新列列表（新列 + 已有列，重复时 ALTER 自动忽略）
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

  // 将已有 NULL 值初始化为 '[]'
  for (const col of newColumns) {
    db.run(`UPDATE sleep_reports SET ${col} = '[]' WHERE ${col} IS NULL;`);
    const nullCheck = [];
    const ns = db.prepare(`SELECT COUNT(*) AS cnt FROM sleep_reports WHERE ${col} IS NULL;`);
    if (ns.step()) nullCheck.push(ns.getAsObject());
    ns.free();
    console.log(`${col} 剩余 NULL 行数:`, nullCheck[0]?.cnt || 0);
  }

  // 写回磁盘
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  console.log('已持久化到', DB_PATH);

  // 验证
  const db2 = new SQL.Database(buffer);
  const verifyColumns = [];
  const stmt2 = db2.prepare("PRAGMA table_info('sleep_reports');");
  while (stmt2.step()) verifyColumns.push(stmt2.getAsObject().name);
  stmt2.free();
  db2.close();

  console.log('验证 — 最终 sleep_reports 列:', verifyColumns.join(', '));
  const ok = ['noise_json', 'sleep_stages_json'].every(c => verifyColumns.includes(c));
  console.log(ok ? '✅ 迁移成功' : '❌ 迁移失败');
})();
