/**
 * 数据库 Schema 初始化模块
 *
 * 基于 docs/数据库设计.md §二 的 DDL 建表语句，
 * 执行 CREATE TABLE IF NOT EXISTS，确保 5 张核心表及索引存在。
 * 支持 SQLite (sql.js) 和 MySQL (mysql2) 两种模式。
 *
 * 来源：需求文档 §5.1 - §5.8
 */

const { getDb0 } = require('./connection');

async function initSchema0() {
  const db = await getDb0();

  if (db._type === 'mysql') {
    await _initMysqlSchema(db);
  } else {
    await _initSqliteSchema(db);
  }
}

// ═══════════════════════════════════════════════════════════
// SQLite 建表（现有逻辑）
// ═══════════════════════════════════════════════════════════
async function _initSqliteSchema(db) {

  db.run('PRAGMA foreign_keys = ON;');

  // ── 1. users ──
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

  try { db.run("ALTER TABLE users ADD COLUMN password_hash TEXT;"); } catch (_) {}
  try { db.run("ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'));"); } catch (_) {}

  // ── 2. devices ──
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

  db.run('CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);');

  // ── 3. sleep_reports ──
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
      sleep_stages_json TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id)   REFERENCES users(user_id)   ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
  `);

  try { db.run("ALTER TABLE sleep_reports ADD COLUMN noise_json TEXT;"); } catch (_) {}
  try { db.run("ALTER TABLE sleep_reports ADD COLUMN sleep_stages_json TEXT;"); } catch (_) {}

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_report_user_date ON sleep_reports(user_id, report_date);');

  // ── 4. user_settings ──
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

  // ── 5. doctor_authorizations ──
  let needRebuildAuth = false;
  try {
    const authCols = [];
    const astmt = db.prepare("PRAGMA table_info('doctor_authorizations');");
    while (astmt.step()) authCols.push(astmt.getAsObject().name);
    astmt.free();
    if (authCols.length > 0 && (!authCols.includes('created_at') || !authCols.includes('updated_at'))) {
      needRebuildAuth = true;
      console.log('[schema] 检测到 doctor_authorizations 表为旧版本，执行重建...');
      db.run('DROP TABLE IF EXISTS doctor_authorizations;');
    }
  } catch (_) {}

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

  if (needRebuildAuth) console.log('[schema] doctor_authorizations 已重建');

  try { db.run("ALTER TABLE doctor_authorizations ADD COLUMN note_updated_at TEXT;"); } catch (_) {}

  db.run('CREATE INDEX IF NOT EXISTS idx_auth_patient ON doctor_authorizations(patient_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_auth_doctor ON doctor_authorizations(doctor_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_auth_status ON doctor_authorizations(status);');

  console.log('[schema] 数据库 Schema 初始化完成：5 张核心表已就绪 (SQLite)');
}

// ═══════════════════════════════════════════════════════════
// MySQL 建表
// ═══════════════════════════════════════════════════════════
async function _initMysqlSchema(db) {

  // MySQL 中 run 是异步的
  await db.run('SET FOREIGN_KEY_CHECKS = 0;');

  // ── 1. users ──
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       INT AUTO_INCREMENT PRIMARY KEY,
      phone         VARCHAR(20) NOT NULL UNIQUE,
      password_hash VARCHAR(255),
      nickname      VARCHAR(50) NOT NULL DEFAULT '用户',
      avatar_url    VARCHAR(500),
      gender        TINYINT NOT NULL DEFAULT 0,
      birth_year    INT,
      role          TINYINT NOT NULL DEFAULT 0 COMMENT '0=患者 1=医生 2=管理员',
      status        TINYINT NOT NULL DEFAULT 0 COMMENT '0=正常 1=禁用',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // ── 2. devices ──
  await db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      serial_no     VARCHAR(20) NOT NULL UNIQUE,
      user_id       INT NOT NULL,
      nickname      VARCHAR(100) NOT NULL DEFAULT '我的设备',
      is_virtual    TINYINT NOT NULL DEFAULT 1,
      online_status TINYINT NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.run('CREATE INDEX idx_devices_user_id ON devices(user_id);');

  // ── 3. sleep_reports ──
  await db.run(`
    CREATE TABLE IF NOT EXISTS sleep_reports (
      report_id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id           INT NOT NULL,
      device_id         INT NOT NULL,
      report_date       DATE NOT NULL,
      sleep_score       INT NOT NULL DEFAULT 0,
      total_minutes     INT NOT NULL DEFAULT 0,
      deep_minutes      INT NOT NULL DEFAULT 0,
      rem_minutes       INT NOT NULL DEFAULT 0,
      light_minutes     INT NOT NULL DEFAULT 0,
      wake_minutes      INT NOT NULL DEFAULT 0,
      avg_heart_rate    DOUBLE,
      events_json       JSON,
      heart_rate_curve  JSON,
      respiration_curve JSON,
      stage_curve       JSON,
      noise_curve       JSON,
      noise_json        JSON,
      sleep_stages_json JSON,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)   REFERENCES users(user_id)    ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id)       ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.run('CREATE UNIQUE INDEX idx_report_user_date ON sleep_reports(user_id, report_date);');

  // ── 4. user_settings ──
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id               INT PRIMARY KEY,
      bedtime               TIME NOT NULL DEFAULT '23:00:00',
      wakeup_time           TIME NOT NULL DEFAULT '07:00:00',
      sunrise_duration      INT NOT NULL DEFAULT 10,
      sound_preference      VARCHAR(50) NOT NULL DEFAULT 'white_noise',
      wake_sound            VARCHAR(50) NOT NULL DEFAULT 'bird',
      preferred_brightness  INT NOT NULL DEFAULT 50,
      preferred_volume      INT NOT NULL DEFAULT 40,
      device_timezone       VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
      do_not_disturb_enabled TINYINT NOT NULL DEFAULT 0,
      dnd_start             TIME NOT NULL DEFAULT '23:00:00',
      dnd_end               TIME NOT NULL DEFAULT '06:00:00',
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // ── 5. doctor_authorizations ──
  await db.run(`
    CREATE TABLE IF NOT EXISTS doctor_authorizations (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      patient_id    INT NOT NULL,
      doctor_id     INT NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/active/revoked/expired',
      expire_date   DATE NOT NULL,
      doctor_note   TEXT,
      requested_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at  DATETIME,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      note_updated_at DATETIME,
      FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id)  REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.run('CREATE INDEX idx_auth_patient ON doctor_authorizations(patient_id);');
  await db.run('CREATE INDEX idx_auth_doctor ON doctor_authorizations(doctor_id);');
  await db.run('CREATE INDEX idx_auth_status ON doctor_authorizations(status);');

  await db.run('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('[schema] 数据库 Schema 初始化完成：5 张核心表已就绪 (MySQL)');
}

module.exports = { initSchema0 };
