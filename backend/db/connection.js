/**
 * sql.js 数据库连接模块
 *
 * 使用 sql.js（SQLite WASM 版，无需原生编译）管理数据库连接单例。
 * - getDb0(): 异步获取数据库连接单例，首次调用自动初始化
 * - saveDb0(): 调用 db.export() + fs.writeFileSync 持久化到磁盘
 *
 * 数据库文件: 项目根目录/sleep_care.db
 * 依赖: sql.js
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// 数据库文件路径 —— 项目根目录下的 sleep_care.db
const DB_PATH = path.resolve(__dirname, '..', '..', 'sleep_care.db');

// 数据库连接单例（Promise<SQL.Database>）
let dbPromise = null;

/**
 * 获取 sql.js 数据库连接单例
 *
 * 首次调用流程：
 *   1. 加载 sql.js WASM 模块
 *   2. 若磁盘存在 sleep_care.db，则读取并恢复数据
 *   3. 若不存在，创建空白内存数据库
 *   4. 执行 PRAGMA foreign_keys = ON 启用外键约束
 *
 * @returns {Promise<SQL.Database>} 数据库连接实例
 */
async function getDb0() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = (async () => {
    // 加载 sql.js WASM 模块
    const SQL = await initSqlJs();

    let db;
    if (fs.existsSync(DB_PATH)) {
      // 从磁盘加载已有数据库文件
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      // 创建空白内存数据库
      db = new SQL.Database();
    }

    // 启用外键约束（SQLite 默认关闭，每次连接均需手动开启）
    db.run('PRAGMA foreign_keys = ON;');

    return db;
  })();

  return dbPromise;
}

/**
 * 将内存数据库持久化到磁盘
 *
 * 调用 db.export() 导出 Uint8Array，
 * 通过 fs.writeFileSync 写入项目根目录的 sleep_care.db。
 * 默认使用单例 getDb0() 获取连接。
 *
 * @param {SQL.Database} [db] - 数据库连接实例，不传则使用单例
 */
async function saveDb0(db) {
  if (!db) {
    db = await getDb0();
  }

  // db.export() 返回 Uint8Array，转换为 Buffer 写入磁盘
  const binaryData = db.export();
  const buffer = Buffer.from(binaryData);
  fs.writeFileSync(DB_PATH, buffer);
}

module.exports = { getDb0, saveDb0 };
