/**
 * 数据库 Schema 初始化模块
 *
 * 基于 docs/数据库设计.md §二 的 DDL 建表语句，
 * 执行 CREATE TABLE IF NOT EXISTS，确保 5 张核心表及索引存在。
 *
 * 来源：需求文档 §5.1 - §5.8
 */

const { getDb0 } = require('./connection');

/**
 * 初始化数据库 Schema
 *
 * 使用 getDb0() 获取 sql.js 连接单例，
 * 依次执行 DDL 建表语句（均为 IF NOT EXISTS 幂等操作）。
 * 执行顺序遵循外键依赖：先 users → devices/settings → sleep_reports/authorizations
 */
async function initSchema0() {
  const db = await getDb0();

  // ============================================================
  // 启用外键约束（每次连接均需执行）
  // ============================================================
  db.run('PRAGMA foreign_keys = ON;');

  // ============================================================
  // 1. 用户表 (users) — 来源：需求文档 §5.1
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      phone         TEXT    NOT NULL UNIQUE,
      password_hash TEXT,
      nickname      TEXT    NOT NULL DEFAULT '用户',
      avatar_url    TEXT,
      gender        INTEGER NOT NULL DEFAULT 0,
      birth_year    INTEGER,
      role          INTEGER NOT NULL DEFAULT 0,
      status        INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // 兼容已有数据库：尝试添加 password_hash 和 updated_at 列（若不存在则忽略错误）
  try { db.run("ALTER TABLE users ADD COLUMN password_hash TEXT;"); } catch (_) {}
  try { db.run("ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'));"); } catch (_) {}

  // ============================================================
  // 2. 设备表 (devices)
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_no     TEXT    NOT NULL UNIQUE,
      user_id       INTEGER NOT NULL,
      nickname      TEXT    NOT NULL DEFAULT '我的设备',
      is_virtual    INTEGER NOT NULL DEFAULT 1,
      online_status INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
  `);

  // ============================================================
  // 3. 睡眠报告表 (sleep_reports) — 来源：需求文档 §5.3
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS sleep_reports (
      report_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      device_id         INTEGER NOT NULL,
      report_date       TEXT    NOT NULL,
      sleep_score       INTEGER NOT NULL DEFAULT 0,
      total_minutes     INTEGER NOT NULL DEFAULT 0,
      deep_minutes      INTEGER NOT NULL DEFAULT 0,
      rem_minutes       INTEGER NOT NULL DEFAULT 0,
      light_minutes     INTEGER NOT NULL DEFAULT 0,
      wake_minutes      INTEGER NOT NULL DEFAULT 0,
      avg_heart_rate    REAL,
      events_json       TEXT,
      heart_rate_curve  TEXT,
      respiration_curve TEXT,
      stage_curve       TEXT,
      noise_curve       TEXT,
      noise_json        TEXT,
      sleep_stages_json TEXT,     -- 存储48条睡眠分期JSON数组(每10分钟一个数据点，编码0=清醒/1=浅睡/2=深睡/3=REM)
      created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id)   REFERENCES users(user_id)   ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
  `);

  // 兼容已有数据库：尝试添加 noise_json 和 sleep_stages_json 列（若已存在则忽略错误）
  try { db.run("ALTER TABLE sleep_reports ADD COLUMN noise_json TEXT;"); } catch (_) {}
  try { db.run("ALTER TABLE sleep_reports ADD COLUMN sleep_stages_json TEXT;"); } catch (_) {}

  // 高频查询索引：按用户+日期查询每日报告
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_report_user_date
      ON sleep_reports(user_id, report_date);
  `);

  // ============================================================
  // 4. 用户设置表 (user_settings) — 来源：需求文档 §5.8
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id               INTEGER PRIMARY KEY,
      bedtime               TEXT    NOT NULL DEFAULT '23:00:00',
      wakeup_time           TEXT    NOT NULL DEFAULT '07:00:00',
      sunrise_duration      INTEGER NOT NULL DEFAULT 10,
      sound_preference      TEXT    NOT NULL DEFAULT 'white_noise',
      wake_sound            TEXT    NOT NULL DEFAULT 'bird',
      preferred_brightness  INTEGER NOT NULL DEFAULT 50,
      preferred_volume      INTEGER NOT NULL DEFAULT 40,
      device_timezone       TEXT    NOT NULL DEFAULT 'Asia/Shanghai',
      do_not_disturb_enabled INTEGER NOT NULL DEFAULT 0,
      dnd_start             TEXT    NOT NULL DEFAULT '23:00:00',
      dnd_end               TEXT    NOT NULL DEFAULT '06:00:00',
      created_at            TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
  `);

  // ============================================================
  // 5. 医生授权表 (doctor_authorizations) — 来源：需求文档 §5.7
  // ============================================================

  // --- 检测旧表是否存在，缺少新字段则重建 ---
  let needRebuildAuth = false;
  try {
    const authCols = [];
    const astmt = db.prepare("PRAGMA table_info('doctor_authorizations');");
    while (astmt.step()) authCols.push(astmt.getAsObject().name);
    astmt.free();
    if (authCols.length > 0 && (!authCols.includes('created_at') || !authCols.includes('updated_at'))) {
      needRebuildAuth = true;
      console.log('[schema] 检测到 doctor_authorizations 表为旧版本（缺少 created_at/updated_at），执行重建...');
      db.run('DROP TABLE IF EXISTS doctor_authorizations;');
    }
  } catch (_) {
    // 表不存在，直接新创建
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS doctor_authorizations (
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

  if (needRebuildAuth) {
    console.log('[schema] doctor_authorizations 表已重建，字段已更新');
  }

  // 授权查询索引
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_auth_patient
      ON doctor_authorizations(patient_id);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_auth_doctor
      ON doctor_authorizations(doctor_id);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_auth_status
      ON doctor_authorizations(status);
  `);

  console.log('[schema] 数据库 Schema 初始化完成：5 张核心表已就绪');
}

module.exports = { initSchema0 };
