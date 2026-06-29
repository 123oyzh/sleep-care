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
  // 2. 设备表 (devices) — 来源：需求文档 §5.2
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id         TEXT    PRIMARY KEY,
      user_id           INTEGER,
      device_name       TEXT    NOT NULL DEFAULT '我的设备',
      is_virtual        INTEGER NOT NULL DEFAULT 0,
      firmware_version  TEXT    NOT NULL DEFAULT 'V1.0.0',
      last_active_time  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
    );
  `);

  // ============================================================
  // 3. 睡眠报告表 (sleep_reports) — 来源：需求文档 §5.3
  // ============================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS sleep_reports (
      report_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL,
      device_id        TEXT    NOT NULL,
      report_date      TEXT    NOT NULL,
      sleep_score      INTEGER NOT NULL DEFAULT 0,
      total_minutes    INTEGER NOT NULL DEFAULT 0,
      deep_minutes     INTEGER NOT NULL DEFAULT 0,
      rem_minutes      INTEGER NOT NULL DEFAULT 0,
      light_minutes    INTEGER NOT NULL DEFAULT 0,
      wake_minutes     INTEGER NOT NULL DEFAULT 0,
      avg_heart_rate   REAL,
      events_json      TEXT,
      heart_rate_curve TEXT,
      respiration_curve TEXT,
      stage_curve      TEXT,
      noise_curve      TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id)   REFERENCES users(user_id)   ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
    );
  `);

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
  db.run(`
    CREATE TABLE IF NOT EXISTS doctor_authorizations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_user_id INTEGER NOT NULL,
      doctor_user_id  INTEGER NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'active',
      expire_at       TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (patient_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_user_id)  REFERENCES users(user_id) ON DELETE CASCADE
    );
  `);

  // 授权查询索引
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_auth_patient
      ON doctor_authorizations(patient_user_id);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_auth_doctor
      ON doctor_authorizations(doctor_user_id);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_auth_status
      ON doctor_authorizations(status);
  `);

  console.log('[schema] 数据库 Schema 初始化完成：5 张核心表已就绪');
}

module.exports = { initSchema0 };
