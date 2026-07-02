/**
 * 数据库连接模块 — 支持 SQLite(sql.js) 和 MySQL(mysql2) 双模式
 *
 * 通过环境变量 DATABASE_TYPE 切换：
 *   - sqlite (默认): 使用 sql.js WASM 版，文件持久化到 sleep_care.db
 *   - mysql:  使用 mysql2 连接池，需配置 MYSQL_* 环境变量
 *
 * 统一接口导出：getDb0(), saveDb0(), dbGetOne(), dbGetAll()
 * 现有代码通过 await getDb0() 获取连接，API 完全兼容。
 */

const path = require('path');
const fs = require('fs');

// ── 数据库类型 ──────────────────────────────────────────────
const DB_TYPE = (process.env.DATABASE_TYPE || 'sqlite').toLowerCase();
const DB_PATH = path.resolve(__dirname, '..', '..', 'sleep_care.db');

// 连接单例
let dbPromise = null;

// ═══════════════════════════════════════════════════════════
// SQLite 模式 — 使用 sql.js (现有逻辑)
// ═══════════════════════════════════════════════════════════
async function _initSqlite() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');
  return db;
}

async function _saveSqlite(db) {
  const binaryData = db.export();
  const buffer = Buffer.from(binaryData);
  fs.writeFileSync(DB_PATH, buffer);
}

// ═══════════════════════════════════════════════════════════
// MySQL 模式 — 使用 mysql2 连接池 + 适配器
// ═══════════════════════════════════════════════════════════
async function _initMysql() {
  const mysql = require('mysql2/promise');

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'sleep_care',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
  });

  // 返回一个适配器对象，伪装成 sql.js 的 db 接口
  // run(): 执行写/DDL 语句
  // prepare(): 创建可复用的查询语句对象
  return {
    _pool: pool,
    _type: 'mysql',

    /** 执行写操作 / DDL */
    run: async function (sql, params) {
      const conn = await pool.getConnection();
      try {
        await conn.execute(sql, params || []);
      } finally {
        conn.release();
      }
    },

    /** 创建 MySQL 适配器 PreparedStatement */
    prepare: function (sql) {
      return new _MysqlStmt(pool, sql);
    }
  };
}

/**
 * MySQL 适配器 — 模拟 sql.js 的 PreparedStatement 接口
 *
 * 接口: bind(params), step(), getAsObject(), free()
 * step() 是异步的（与 sql.js 不同），dbGetOne/dbGetAll 已适配
 */
class _MysqlStmt {
  constructor(pool, sql) {
    this._pool = pool;
    this._sql = sql;
    this._params = [];
    this._rows = [];
    this._index = -1;
    this._executed = false;
  }

  /** 绑定参数 */
  bind(params) {
    this._params = params || [];
  }

  /**
   * 执行查询并获取下一行
   * MySQL 模式下返回 Promise<boolean>（sql.js 返回 boolean）
   */
  async step() {
    if (!this._executed) {
      const conn = await this._pool.getConnection();
      try {
        const [rows] = await conn.execute(this._sql, this._params);
        this._rows = rows;
      } finally {
        conn.release();
      }
      this._executed = true;
      this._index = -1;
    }

    this._index++;
    return this._index < this._rows.length;
  }

  /** 获取当前行（与 sql.js getAsObject 一致） */
  getAsObject() {
    return this._rows[this._index] || null;
  }

  /** 释放资源（MySQL 下连接已归还，无需操作） */
  free() {
    this._rows = [];
    this._executed = false;
  }
}

/** MySQL 模式不需要 save，写出为 no-op */
async function _saveMysql() {
  // MySQL 自动持久化，无需手动保存
}

// ═══════════════════════════════════════════════════════════
// 统一导出接口
// ═══════════════════════════════════════════════════════════

/**
 * 获取数据库连接单例
 *
 * 根据 DATABASE_TYPE 环境变量选择对应驱动。
 * SQLite 模式返回 sql.js Database 实例；
 * MySQL 模式返回适配器对象（含 run / prepare 方法）。
 *
 * @returns {Promise<Object>} 数据库连接实例
 */
async function getDb0() {
  if (dbPromise) return dbPromise;

  if (DB_TYPE === 'mysql') {
    console.log('[db] 使用 MySQL 模式');
    dbPromise = _initMysql();
  } else {
    console.log('[db] 使用 SQLite 模式 (sql.js)');
    dbPromise = _initSqlite();
  }

  return dbPromise;
}

/**
 * 持久化数据库到磁盘
 *
 * SQLite 模式：执行 db.export() + fs.writeFileSync
 * MySQL 模式：空操作（MySQL 自动持久化）
 *
 * @param {Object} [db] - 数据库连接，不传则使用单例
 */
async function saveDb0(db) {
  if (!db) db = await getDb0();

  if (db._type === 'mysql') {
    return _saveMysql();
  }
  return _saveSqlite(db);
}

// ═══════════════════════════════════════════════════════════
// 统一查询辅助函数 — 兼容 SQLite 和 MySQL
// ═══════════════════════════════════════════════════════════

/**
 * 查询单行数据
 *
 * SQLite：prepare + bind + step + getAsObject
 * MySQL：prepare + bind + await step + getAsObject
 *
 * @param {Object} db — getDb0() 返回的连接对象
 * @param {string} sql — SQL 语句（? 占位符）
 * @param {Array}  [params=[]] — 绑定参数
 * @returns {Promise<Object|null>} 结果对象，无匹配时返回 null
 */
async function dbGetOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  let result = null;
  const hasRow = await stmt.step();  // MySQL 返回 Promise<boolean>
  if (hasRow) {
    result = stmt.getAsObject();
  }

  stmt.free();
  return result;
}

/**
 * 查询多行数据
 *
 * @param {Object} db — getDb0() 返回的连接对象
 * @param {string} sql — SQL 语句（? 占位符）
 * @param {Array}  [params=[]] — 绑定参数
 * @returns {Promise<Array<Object>>} 结果对象数组
 */
async function dbGetAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (await stmt.step()) {
    results.push(stmt.getAsObject());
  }

  stmt.free();
  return results;
}

module.exports = { getDb0, saveDb0, dbGetOne, dbGetAll };
