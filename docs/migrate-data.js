/**
 * SQLite → MySQL 数据迁移脚本
 *
 * 用法：
 *   1. 先执行 docs/migration.sql 在 MySQL 中建表
 *   2. npm install better-sqlite3 mysql2
 *   3. 修改下方 MYSQL_CONFIG 连接配置
 *   4. node docs/migrate-data.js
 *
 * 要求：Node.js 18+，MySQL 服务已运行
 */

const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// ── 配置 ──────────────────────────────────────────────────
const SQLITE_PATH = path.resolve(__dirname, '..', 'sleep_care.db');

const MYSQL_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'your_password',
  database: 'sleep_care'
};

// 表迁移顺序（满足外键依赖：先父表后子表）
const TABLES = [
  'users',
  'devices',
  'user_settings',
  'sleep_reports',
  'doctor_authorizations'
];

// ── 工具 ──────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`); }
function ok(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); process.exit(1); }

// ── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log('\n📦 SQLite → MySQL 数据迁移');
  console.log('═══════════════════════════\n');

  // 1. 连接 SQLite
  log('1. 连接 SQLite');
  if (!fs.existsSync(SQLITE_PATH)) {
    fail('SQLite 文件不存在: ' + SQLITE_PATH);
  }
  const sqlite = new Database(SQLITE_PATH);
  sqlite.pragma('foreign_keys = ON');
  ok('SQLite 已连接: ' + SQLITE_PATH);

  // 2. 连接 MySQL
  log('2. 连接 MySQL');
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  ok('MySQL 已连接: ' + MYSQL_CONFIG.host + ':' + MYSQL_CONFIG.port + '/' + MYSQL_CONFIG.database);
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0;');

  let totalInserted = 0;

  // 3. 逐表迁移
  for (var i = 0; i < TABLES.length; i++) {
    var table = TABLES[i];
    console.log('\n── ' + table + ' ─────────────────────────────');

    // 3a. 从 SQLite 导出
    log('导出数据...');
    var rows;
    try {
      rows = sqlite.prepare('SELECT * FROM ' + table).all();
      log('  → 导出 ' + rows.length + ' 行');
    } catch (e) {
      log('  → 表不存在或无数据，跳过 (' + e.message + ')');
      continue;
    }

    if (rows.length === 0) {
      ok('空表，跳过');
      continue;
    }

    // 3b. 写入 MySQL
    log('导入 MySQL...');
    var inserted = 0;
    var skipped = 0;

    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      var columns = Object.keys(row).filter(function (c) {
        return row[c] !== undefined && row[c] !== null;
      });

      // 转换 datetime 格式：SQLite 文本 → MySQL DATETIME
      var values = columns.map(function (c) { return row[c]; });

      try {
        // 使用 REPLACE INTO 处理可能的重复主键
        var colsStr = columns.join(', ');
        var placeholders = columns.map(function () { return '?'; }).join(', ');
        await conn.execute(
          'REPLACE INTO ' + table + ' (' + colsStr + ') VALUES (' + placeholders + ')',
          values
        );
        inserted++;
      } catch (e) {
        // 跳过冲突行（如重复唯一索引）
        if (e.code === 'ER_DUP_ENTRY') {
          skipped++;
        } else {
          throw e;
        }
      }

      // 进度：每 10 行打印一次
      if ((j + 1) % 10 === 0 || j === rows.length - 1) {
        process.stdout.write('\r  → 进度: ' + (j + 1) + '/' + rows.length);
      }
    }

    console.log('');
    ok('导入完成: ' + inserted + ' 行' + (skipped > 0 ? ', ' + skipped + ' 跳过(重复)' : ''));
    totalInserted += inserted;
  }

  // 4. 验证
  console.log('\n── 验证 ─────────────────────────────');
  await conn.execute('SET FOREIGN_KEY_CHECKS = 1;');

  for (var k = 0; k < TABLES.length; k++) {
    var t = TABLES[k];
    try {
      var [countRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM ' + t);
      var sqliteCount;
      try {
        var sqliteRow = sqlite.prepare('SELECT COUNT(*) AS cnt FROM ' + t).get();
        sqliteCount = sqliteRow.cnt;
      } catch (e) {
        sqliteCount = 0;
      }
      log(t + ': MySQL=' + countRows[0].cnt + ', SQLite=' + sqliteCount);
    } catch (e) {
      log(t + ': (跳过) ' + e.message);
    }
  }

  // 5. 关闭连接
  await conn.end();
  sqlite.close();

  console.log('\n═══════════════════════════');
  ok('迁移完成! 共导入 ' + totalInserted + ' 行');
  console.log('═══════════════════════════\n');
}

// ── 运行 ──────────────────────────────────────────────────
main().catch(function (err) {
  console.error('\n❌ 迁移失败:', err.message);
  console.error(err);
  process.exit(1);
});
