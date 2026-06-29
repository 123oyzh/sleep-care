/**
 * 数据库初始化入口模块
 *
 * 整合 connection 与 schema 模块，提供统一的数据库初始化入口。
 * initDatabase0() — 初始化 Schema 后自动持久化到磁盘。
 */

const { getDb0, saveDb0 } = require('./connection');
const { initSchema0 } = require('./schema');

/**
 * 初始化数据库
 *
 * 流程：
 *   1. 调用 initSchema0() 创建所有表与索引
 *   2. 调用 saveDb0() 将内存数据库持久化到项目根目录 sleep_care.db
 *
 * 幂等操作：反复调用不会重复建表（CREATE TABLE IF NOT EXISTS）。
 */
async function initDatabase0() {
  console.log('[init] 开始初始化数据库...');

  // 初始化 Schema（建表 + 索引）
  await initSchema0();

  // 持久化到磁盘
  const db = await getDb0();
  await saveDb0(db);

  console.log('[init] 数据库初始化完成，已持久化到 sleep_care.db');
}

module.exports = { initDatabase0 };
