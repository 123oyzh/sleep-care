/**
 * 数据库初始化入口模块
 *
 * 整合 connection 与 schema 模块。
 * SQLite 模式：初始化 Schema → 持久化 sleep_care.db
 * MySQL 模式：初始化 Schema → MySQL 自动持久化
 */

const { getDb0, saveDb0 } = require('./connection');
const { initSchema0 } = require('./schema');

async function initDatabase0() {
  console.log('[init] 开始初始化数据库...');

  await initSchema0();

  const db = await getDb0();

  if (db._type === 'mysql') {
    console.log('[init] MySQL 模式 — 数据库已就绪（自动持久化）');
  } else {
    await saveDb0(db);
    console.log('[init] 数据库初始化完成，已持久化到 sleep_care.db');
  }
}

module.exports = { initDatabase0 };
