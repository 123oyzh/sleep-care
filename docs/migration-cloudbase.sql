-- ============================================================
-- SleepCare CloudBase MySQL 建表语句（从 backend/db/schema.js 提取）
-- 使用方法：在 CloudBase 控制台 → MySQL → SQL 编辑器 中逐条执行
-- 注意：CloudBase SQL 编辑器一次只能执行一条语句
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. 用户表 (users)
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

-- 2. 设备表 (devices)
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

CREATE INDEX idx_devices_user_id ON devices(user_id);

-- 3. 睡眠报告表 (sleep_reports)
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

CREATE UNIQUE INDEX idx_report_user_date ON sleep_reports(user_id, report_date);

-- 4. 用户设置表 (user_settings)
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

-- 5. 医生授权表 (doctor_authorizations)
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

CREATE INDEX idx_auth_patient ON doctor_authorizations(patient_id);
CREATE INDEX idx_auth_doctor ON doctor_authorizations(doctor_id);
CREATE INDEX idx_auth_status ON doctor_authorizations(status);

SET FOREIGN_KEY_CHECKS = 1;
