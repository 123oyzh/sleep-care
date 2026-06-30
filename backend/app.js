/**
 * 智能睡眠环境调控设备 — Express 云后台 API 入口
 *
 * 启动流程：
 *   1. dotenv 加载环境变量
 *   2. initDatabase0() 初始化 SQLite 数据库（建表 + 持久化）
 *   3. app.listen(3000) 启动 HTTP 服务
 *
 * 中间件：CORS、JSON 解析
 * 健康检查：GET / → {code, message, data}
 * 注册接口：POST /api/auth/register
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { initDatabase0 } = require('./db/init');
const { getDb0, saveDb0 } = require('./db/connection');

// 加载 .env 环境变量
dotenv.config();

// JWT 签名密钥（实训阶段硬编码，生产环境应从 .env 读取）
const JWT_SECRET = process.env.JWT_SECRET || 'sleep-care-secret-key-2026';

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 中间件配置
// ============================================================

// CORS 跨域（实训阶段允许所有来源，生产环境需限制白名单）
app.use(cors());

// JSON 请求体解析
app.use(express.json());

// ============================================================
// 数据库查询辅助函数
// 使用 sql.js 的 prepare + bind + step + getAsObject 方式
// ============================================================

/**
 * 查询单行数据
 *
 * 使用 sql.js 预处理语句绑定参数，执行 step() 获取第一行结果。
 * 无匹配行时返回 null。
 *
 * @param {SQL.Database} db - sql.js 数据库连接实例
 * @param {string} sql - SQL 查询语句（使用 ? 占位符）
 * @param {Array} [params=[]] - 绑定的参数数组
 * @returns {Object|null} 查询结果对象，无结果返回 null
 */
function dbGetOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  let result = null;
  if (stmt.step()) {
    // 将当前行转换为普通 JS 对象
    result = stmt.getAsObject();
  }

  // 释放预处理语句资源
  stmt.free();
  return result;
}

/**
 * 查询多行数据
 *
 * 使用 sql.js 预处理语句绑定参数，循环 step() 收集所有匹配行。
 *
 * @param {SQL.Database} db - sql.js 数据库连接实例
 * @param {string} sql - SQL 查询语句（使用 ? 占位符）
 * @param {Array} [params=[]] - 绑定的参数数组
 * @returns {Array<Object>} 查询结果对象数组，无结果返回空数组 []
 */
function dbGetAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    // 将当前行转换为普通 JS 对象并加入结果集
    results.push(stmt.getAsObject());
  }

  // 释放预处理语句资源
  stmt.free();
  return results;
}

// ============================================================
// JWT 认证中间件
// 从 Authorization 头提取 Bearer Token，校验后挂载 req.user
// ============================================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ code: 1002, message: '请先登录', data: null });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // 挂载解码后的用户信息：{ id, phone, role }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ code: 1002, message: '登录已过期，请重新登录', data: null });
  }
}

// ============================================================
// 健康检查接口
// GET / — 返回服务运行状态
// ============================================================
app.get('/', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      service: 'sleep-care-api',
      status: 'running',
      timestamp: new Date().toISOString()
    }
  });
});

// ============================================================
// 用户注册接口
// POST /api/auth/register — 手机号 + 密码注册
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const db = await getDb0();
    const { phone, password, nickname } = req.body;

    // --- 参数校验 ---

    // phone 和 password 不能为空
    if (!phone || !password) {
      return res.json({ code: 1001, message: '手机号和密码不能为空', data: null });
    }

    // phone 必须是 11 位数字
    if (!/^\d{11}$/.test(phone)) {
      return res.json({ code: 1001, message: '手机号格式错误，请输入11位数字', data: null });
    }

    // password 长度 ≥ 6
    if (password.length < 6) {
      return res.json({ code: 1001, message: '密码长度不能少于6位', data: null });
    }

    // --- 检查手机号是否已注册 ---
    const existing = dbGetOne(db, 'SELECT user_id FROM users WHERE phone = ?', [phone]);
    if (existing) {
      return res.json({ code: 1001, message: '该手机号已注册', data: null });
    }

    // --- 生成密码哈希 ---
    const passwordHash = bcrypt.hashSync(password, 10);

    // --- 插入新用户 ---
    // role: 0=普通用户(patient), status: 0=正常
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const displayName = nickname && nickname.trim() ? nickname.trim() : '用户';

    try {
      db.run(
        `INSERT INTO users (phone, password_hash, nickname, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)`,
        [phone, passwordHash, displayName, now, now]
      );

      // 持久化到磁盘
      await saveDb0(db);
    } catch (insertErr) {
      // 捕获 UNIQUE 约束异常（极端并发场景下的手机号重复）
      if (insertErr.message && insertErr.message.includes('UNIQUE')) {
        return res.json({ code: 1001, message: '该手机号已注册', data: null });
      }
      throw insertErr;
    }

    // --- 查询刚插入的用户信息 ---
    const user = dbGetOne(db, 'SELECT user_id, phone, nickname, role FROM users WHERE phone = ?', [phone]);

    // --- 返回成功响应 ---
    res.json({
      code: 0,
      message: '注册成功',
      data: {
        id: user.user_id,
        phone: user.phone,
        nickname: user.nickname,
        role: user.role
      }
    });

  } catch (err) {
    console.error('[register] 注册异常:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

// ============================================================
// 用户登录接口
// POST /api/auth/login — 手机号 + 密码登录，返回 JWT Token
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const db = await getDb0();
    const { phone, password } = req.body;

    // --- 参数校验：phone 和 password 不能为空 ---
    if (!phone || !password) {
      return res.json({ code: 1001, message: '手机号和密码不能为空', data: null });
    }

    // --- 按 phone 查找用户 ---
    const user = dbGetOne(db,
      'SELECT user_id, phone, password_hash, nickname, role, status FROM users WHERE phone = ?',
      [phone]
    );

    // 用户不存在
    if (!user) {
      return res.json({ code: 1001, message: '用户不存在，请先注册', data: null });
    }

    // --- 验证密码 ---
    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
      return res.json({ code: 1001, message: '密码错误', data: null });
    }

    // --- 检查账号状态：status === 1 表示禁用 ---
    if (user.status === 1) {
      return res.json({ code: 1002, message: '账号已被禁用', data: null });
    }

    // --- 签发 JWT Token，有效期 7 天 ---
    const tokenPayload = { id: user.user_id, phone: user.phone, role: user.role };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    // --- 更新最近登录时间 ---
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.run('UPDATE users SET updated_at = ? WHERE user_id = ?', [now, user.user_id]);
    await saveDb0(db);

    // --- 返回登录成功响应 ---
    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        id: user.user_id,
        phone: user.phone,
        nickname: user.nickname,
        role: user.role
      }
    });

  } catch (err) {
    console.error('[login] 登录异常:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

// ============================================================
// 设备管理接口（以下全部受 authenticateToken 中间件保护）
// ============================================================

/**
 * GET /api/device/list — 获取当前用户的设备列表
 *
 * 按创建时间倒序返回用户绑定的所有设备。
 * 请求头：Authorization: Bearer <token>
 */
app.get('/api/device/list', authenticateToken, async (req, res) => {
  try {
    const db = await getDb0();
    const userId = req.user.id; // 从 JWT 解析的用户 ID

    // 查询当前用户的所有设备，按创建时间倒序
    const devices = dbGetAll(db,
      'SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      code: 0,
      message: 'success',
      data: devices
    });

  } catch (err) {
    console.error('[devices/list] 查询失败:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

/**
 * POST /api/device/add — 添加设备（真实设备或虚拟设备）
 *
 * 虚拟设备 (is_virtual=true)：自动生成 "VIR" + 16 位随机字符作为序列号
 * 真实设备 (is_virtual=false)：使用传入的 device_serial（校验 16 位字母数字）
 *
 * 请求体：{ is_virtual: boolean, device_serial?: string }
 * 请求头：Authorization: Bearer <token>
 */
app.post('/api/device/add', authenticateToken, async (req, res) => {
  try {
    const db = await getDb0();
    const userId = req.user.id;
    const { is_virtual, device_serial } = req.body;

    let serialNo;

    // --- 生成或使用序列号 ---
    if (is_virtual) {
      // 虚拟设备：自动生成 "VIR" + 16 位随机字母数字
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let randomPart = '';
      for (let i = 0; i < 16; i++) {
        randomPart += chars[Math.floor(Math.random() * chars.length)];
      }
      serialNo = 'VIR' + randomPart;
    } else {
      // 真实设备：校验传入的序列号为 16 位字母数字
      if (!device_serial) {
        return res.json({ code: 1001, message: '真实设备必须提供序列号', data: null });
      }
      if (!/^[A-Za-z0-9]{16}$/.test(device_serial)) {
        return res.json({ code: 1001, message: '设备序列号格式错误，需为16位字母数字', data: null });
      }
      serialNo = device_serial;
    }

    // --- 插入设备记录 ---
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const isVirtualFlag = is_virtual ? 1 : 0;

    try {
      db.run(
        `INSERT INTO devices (user_id, serial_no, nickname, is_virtual, online_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, serialNo, '我的设备', isVirtualFlag, 1, now, now]
      );

      // 持久化到磁盘
      await saveDb0(db);
    } catch (insertErr) {
      // 捕获 UNIQUE 约束异常（序列号重复）
      if (insertErr.message && insertErr.message.includes('UNIQUE')) {
        return res.json({ code: 1001, message: '该设备序列号已存在', data: null });
      }
      throw insertErr;
    }

    // --- 查询刚插入的设备并返回 ---
    const device = dbGetOne(db,
      'SELECT * FROM devices WHERE serial_no = ?',
      [serialNo]
    );

    res.json({
      code: 0,
      message: '设备添加成功',
      data: device
    });

  } catch (err) {
    console.error('[devices/add] 添加失败:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

/**
 * PUT /api/devices/:id — 修改设备昵称
 *
 * 仅设备所有者可修改。
 * 路径参数：:id — 设备主键 ID
 * 请求体：{ nickname: string }
 * 请求头：Authorization: Bearer <token>
 */
app.put('/api/devices/:id', authenticateToken, async (req, res) => {
  try {
    const db = await getDb0();
    const userId = req.user.id;
    const deviceId = parseInt(req.params.id, 10);
    const { nickname } = req.body;

    // 参数校验
    if (!nickname || !nickname.trim()) {
      return res.json({ code: 1001, message: '设备昵称不能为空', data: null });
    }

    // --- 查询设备，验证所有权 ---
    const device = dbGetOne(db,
      'SELECT * FROM devices WHERE id = ?',
      [deviceId]
    );

    if (!device) {
      return res.json({ code: 1001, message: '设备不存在', data: null });
    }

    if (device.user_id !== userId) {
      return res.json({ code: 1002, message: '无权操作该设备', data: null });
    }

    // --- 更新昵称 ---
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.run(
      'UPDATE devices SET nickname = ?, updated_at = ? WHERE id = ?',
      [nickname.trim(), now, deviceId]
    );

    await saveDb0(db);

    // --- 返回更新后的设备 ---
    const updatedDevice = dbGetOne(db,
      'SELECT * FROM devices WHERE id = ?',
      [deviceId]
    );

    res.json({
      code: 0,
      message: '设备更新成功',
      data: updatedDevice
    });

  } catch (err) {
    console.error('[devices/update] 更新失败:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

/**
 * DELETE /api/devices/:id — 删除设备（解绑）
 *
 * 仅设备所有者可删除。
 * 路径参数：:id — 设备主键 ID
 * 请求头：Authorization: Bearer <token>
 */
app.delete('/api/devices/:id', authenticateToken, async (req, res) => {
  try {
    const db = await getDb0();
    const userId = req.user.id;
    const deviceId = parseInt(req.params.id, 10);

    // --- 查询设备，验证所有权 ---
    const device = dbGetOne(db,
      'SELECT * FROM devices WHERE id = ?',
      [deviceId]
    );

    if (!device) {
      return res.json({ code: 1001, message: '设备不存在', data: null });
    }

    if (device.user_id !== userId) {
      return res.json({ code: 1002, message: '无权操作该设备', data: null });
    }

    // --- 删除设备 ---
    db.run('DELETE FROM devices WHERE id = ?', [deviceId]);
    await saveDb0(db);

    res.json({
      code: 0,
      message: '设备已删除',
      data: null
    });

  } catch (err) {
    console.error('[devices/delete] 删除失败:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

// ============================================================
// 睡眠报告接口（受 authenticateToken 中间件保护）
// ============================================================

/**
 * 确定性伪随机数生成器（Mulberry32 算法）
 *
 * 同一 seed 始终产生相同的随机数序列，确保同一用户同一天的模拟数据可复现。
 * 生成 0-1 之间的均匀分布浮点数。
 *
 * @param {number} seed - 随机种子（整数）
 * @returns {Function} 每次调用返回 0-1 随机浮点数的函数
 */
function seededRandom(seed) {
  let state = seed >>> 0; // 转为无符号 32 位整数
  return function () {
    let t = state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 使用确定性伪随机生成睡眠报告基础指标
 *
 * 将 seededRandom 的 rand 函数作为输入，返回包含
 * 睡眠评分、各阶段时长、觉醒次数、平均心率等基础指标的对象。
 * 被 /api/sleep/report/daily 和 /api/sleep/stages 接口复用。
 *
 * @param {Function} rand - seededRandom 生成的 0-1 随机函数
 * @returns {Object} { sleepScore, totalMinutes, deepMinutes, lightMinutes,
 *                     remMinutes, wakeMinutes, awakeCount, avgHeartRate }
 */
function generateBaseMetrics(rand) {
  // 睡眠评分 60-100
  const sleepScore = Math.floor(60 + rand() * 40);

  // 总睡眠时长 300-480 分钟
  const totalMinutes = Math.floor(300 + rand() * 180);

  // 觉醒次数 0-5 次
  const awakeCount = Math.floor(rand() * 6);

  // 每次觉醒 2-5 分钟，计算总觉醒时长
  let wakeMinutes = 0;
  for (let i = 0; i < awakeCount; i++) {
    wakeMinutes += 2 + Math.floor(rand() * 4);
  }

  // 深睡比例 0.15-0.35
  const deepRatio = 0.15 + rand() * 0.20;
  // REM 比例 0.20-0.25
  const remRatio = 0.20 + rand() * 0.05;

  // 有效睡眠总分钟 = 总时长 - 觉醒时长
  const effectiveMinutes = totalMinutes - wakeMinutes;
  const deepMinutes = Math.floor(effectiveMinutes * deepRatio);
  const remMinutes = Math.floor(effectiveMinutes * remRatio);
  // 浅睡 = 剩余部分（避免因取整导致总和偏差）
  const lightMinutes = effectiveMinutes - deepMinutes - remMinutes;

  // 平均心率 55-80
  const avgHeartRate = 55 + Math.floor(rand() * 25);

  return {
    sleepScore, totalMinutes, deepMinutes, lightMinutes,
    remMinutes, wakeMinutes, awakeCount, avgHeartRate
  };
}

/**
 * 生成 48 个睡眠分期数据点（每 10 分钟一个，覆盖 8 小时）
 *
 * 编码规则：0=清醒, 1=浅睡, 2=深睡, 3=REM
 * 符合生理规律：前半夜深睡占比高，后半夜 REM 占比高
 *
 * @param {Function} rand - seededRandom 生成的 0-1 随机函数
 * @returns {number[]} 长度为 48 的整数数组
 */
function generateSleepStages(rand) {
  const pointCount = 48;
  const stages = [];

  for (let i = 0; i < pointCount; i++) {
    const r = rand();

    if (i < 24) {
      // 前半夜（00:00-03:50）：深睡占比高
      if (r < 0.05)      stages.push(0); // 清醒 5%
      else if (r < 0.45) stages.push(1); // 浅睡 40%
      else if (r < 0.85) stages.push(2); // 深睡 40%
      else               stages.push(3); // REM  15%
    } else {
      // 后半夜（04:00-07:50）：REM 占比高，深睡少
      if (r < 0.10)      stages.push(0); // 清醒 10%
      else if (r < 0.55) stages.push(1); // 浅睡 45%
      else if (r < 0.65) stages.push(2); // 深睡 10%
      else               stages.push(3); // REM  35%
    }
  }

  return stages;
}

/**
 * 生成 48 个时间标签 ["00:00","00:10",...,"07:50"]
 *
 * @returns {string[]} 格式化时间字符串数组
 */
function generateTimeLabels() {
  const labels = [];
  for (let h = 0; h < 8; h++) {
    for (let m = 0; m < 60; m += 10) {
      labels.push(
        String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
      );
    }
  }
  return labels;
}

/**
 * GET /api/sleep/report/daily — 获取指定日期的睡眠报告
 *
 * 如果报告不存在，则根据用户设定自动生成模拟数据并持久化。
 * 同一用户同一天的数据由确定性伪随机算法生成，保证可复现。
 *
 * 查询参数：date (YYYY-MM-DD)，默认昨天
 * 请求头：Authorization: Bearer <token>
 */
app.get('/api/sleep/report/daily', authenticateToken, async (req, res) => {
  try {
    const db = await getDb0();
    const userId = req.user.id; // 从 JWT 解析的用户 ID

    // --- 解析日期参数，默认取昨天 ---
    let date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().substring(0, 10);
    }

    // --- 获取用户的第一台设备，无设备时 deviceId 暂用 0 ---
    const device = dbGetOne(db,
      'SELECT id FROM devices WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const deviceId = device ? device.id : 0;

    // --- 先查询该用户+设备+日期是否已有报告 ---
    const existing = dbGetOne(db,
      'SELECT * FROM sleep_reports WHERE user_id = ? AND device_id = ? AND report_date = ?',
      [userId, deviceId, date]
    );

    // 如果已存在，直接返回（无需重新生成）
    // 根据 wake_minutes 估算觉醒次数（每次觉醒约 3 分钟），补到响应中
    if (existing) {
      existing.awake_count = existing.wake_minutes > 0
        ? Math.max(1, Math.round(existing.wake_minutes / 3))
        : 0;
      return res.json({
        code: 0,
        message: 'success',
        data: existing
      });
    }

    // --- 不存在则使用 seededRandom 生成确定性模拟数据 ---
    // 种子 = userId × 10000 + 日期数字（保证用户+日期唯一确定性）
    const seed = userId * 10000 + parseInt(date.replace(/-/g, ''), 10);
    const rand = seededRandom(seed);

    // 调用公用函数生成基础指标
    const metrics = generateBaseMetrics(rand);

    // JSON 曲线/事件字段暂存为空数组，为后续图表功能预留
    const emptyJsonArray = '[]';

    // --- INSERT INTO sleep_reports ---
    try {
      db.run(
        `INSERT INTO sleep_reports
         (user_id, device_id, report_date, sleep_score, total_minutes,
          deep_minutes, light_minutes, rem_minutes, wake_minutes,
          avg_heart_rate, events_json, heart_rate_curve, respiration_curve,
          stage_curve, noise_curve, sleep_stages_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, deviceId, date, metrics.sleepScore, metrics.totalMinutes,
          metrics.deepMinutes, metrics.lightMinutes, metrics.remMinutes, metrics.wakeMinutes,
          metrics.avgHeartRate, emptyJsonArray, emptyJsonArray, emptyJsonArray,
          emptyJsonArray, emptyJsonArray, emptyJsonArray
        ]
      );

      // 持久化到磁盘
      await saveDb0(db);
    } catch (insertErr) {
      // --- 处理 UNIQUE 约束异常（并发场景）---
      if (insertErr.message && insertErr.message.includes('UNIQUE')) {
        // 并发时另一请求已插入，重新查询并返回
        const retry = dbGetOne(db,
          'SELECT * FROM sleep_reports WHERE user_id = ? AND device_id = ? AND report_date = ?',
          [userId, deviceId, date]
        );
        retry.awake_count = retry.wake_minutes > 0
          ? Math.max(1, Math.round(retry.wake_minutes / 3))
          : 0;
        return res.json({
          code: 0,
          message: 'success',
          data: retry
        });
      }
      throw insertErr;
    }

    // --- 查询新插入的记录，补上 awake_count 后返回 ---
    const report = dbGetOne(db,
      'SELECT * FROM sleep_reports WHERE user_id = ? AND device_id = ? AND report_date = ?',
      [userId, deviceId, date]
    );
    report.awake_count = metrics.awakeCount;

    res.json({
      code: 0,
      message: 'success',
      data: report
    });

  } catch (err) {
    console.error('[sleep/report/daily] 异常:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

/**
 * GET /api/sleep/stages — 获取指定日期的睡眠分期数据
 *
 * 返回 48 个分期数据点（每 10 分钟一个，覆盖 8 小时）及对应的时间标签。
 * 编码：0=清醒, 1=浅睡, 2=深睡, 3=REM
 *
 * 如果 sleep_stages_json 已存在且非空，直接解析返回；
 * 否则使用 seededRandom 生成符合生理规律的分期数据并持久化。
 *
 * 查询参数：date (YYYY-MM-DD)，默认昨天
 * 请求头：Authorization: Bearer <token>
 */
app.get('/api/sleep/stages', authenticateToken, async (req, res) => {
  try {
    const db = await getDb0();
    const userId = req.user.id; // 从 JWT 解析的用户 ID

    // --- 解析日期参数，默认取昨天 ---
    let date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().substring(0, 10);
    }

    // --- 获取用户的第一台设备，无设备时 deviceId 暂用 0 ---
    const device = dbGetOne(db,
      'SELECT id FROM devices WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const deviceId = device ? device.id : 0;

    // --- 查询 sleep_reports 表中该用户+设备+日期的记录 ---
    const existing = dbGetOne(db,
      'SELECT * FROM sleep_reports WHERE user_id = ? AND device_id = ? AND report_date = ?',
      [userId, deviceId, date]
    );

    // 如果记录存在且 sleep_stages_json 不为空，直接解析返回
    if (existing && existing.sleep_stages_json) {
      try {
        const stages = JSON.parse(existing.sleep_stages_json);
        if (Array.isArray(stages) && stages.length > 0) {
          const labels = generateTimeLabels();
          return res.json({
            code: 0,
            message: 'success',
            data: { date, stages, labels, count: stages.length }
          });
        }
      } catch (_) {
        // JSON 解析失败，继续生成新数据
      }
    }

    // --- 记录不存在或 sleep_stages_json 为空，需先生成基础指标 ---
    // 种子 = userId × 10000 + 日期数字（保证用户+日期唯一确定性）
    const seed = userId * 10000 + parseInt(date.replace(/-/g, ''), 10);
    const rand = seededRandom(seed);

    // 生成基础指标（与 /api/sleep/report/daily 共用 generateBaseMetrics）
    const metrics = generateBaseMetrics(rand);

    // 生成睡眠分期数据（48 个数据点）
    const stages = generateSleepStages(rand);

    // 生成时间标签数组
    const labels = generateTimeLabels();

    // JSON 序列化
    const stagesJson = JSON.stringify(stages);
    const emptyJsonArray = '[]';

    // --- 如果报告记录不存在，先 INSERT 基础指标 ---
    if (!existing) {
      try {
        db.run(
          `INSERT INTO sleep_reports
           (user_id, device_id, report_date, sleep_score, total_minutes,
            deep_minutes, light_minutes, rem_minutes, wake_minutes,
            avg_heart_rate, events_json, heart_rate_curve, respiration_curve,
            stage_curve, noise_curve, sleep_stages_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId, deviceId, date, metrics.sleepScore, metrics.totalMinutes,
            metrics.deepMinutes, metrics.lightMinutes, metrics.remMinutes, metrics.wakeMinutes,
            metrics.avgHeartRate, emptyJsonArray, emptyJsonArray, emptyJsonArray,
            emptyJsonArray, emptyJsonArray, stagesJson
          ]
        );
        await saveDb0(db);
      } catch (insertErr) {
        // --- 处理 UNIQUE 约束异常（并发场景）：已有记录则执行 UPDATE ---
        if (insertErr.message && insertErr.message.includes('UNIQUE')) {
          db.run(
            'UPDATE sleep_reports SET sleep_stages_json = ? WHERE user_id = ? AND device_id = ? AND report_date = ?',
            [stagesJson, userId, deviceId, date]
          );
          await saveDb0(db);
        } else {
          throw insertErr;
        }
      }
    } else {
      // --- 记录已存在但 sleep_stages_json 为空，执行 UPDATE ---
      db.run(
        'UPDATE sleep_reports SET sleep_stages_json = ? WHERE report_id = ?',
        [stagesJson, existing.report_id]
      );
      await saveDb0(db);
    }

    // --- 返回分期数据 ---
    res.json({
      code: 0,
      message: 'success',
      data: { date, stages, labels, count: stages.length }
    });

  } catch (err) {
    console.error('[sleep/stages] 异常:', err.message);
    res.status(500).json({ code: 9999, message: '服务器内部错误', data: null });
  }
});

// ============================================================
// 异步启动
// ============================================================
async function start() {
  try {
    // 初始化数据库（建表 + 索引）
    await initDatabase0();
    console.log('[app] 数据库初始化完成');

    // 启动 HTTP 服务
    app.listen(PORT, () => {
      console.log(`[app] 云后台 API 已启动: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[app] 启动失败:', err.message);
    process.exit(1);
  }
}

start();
