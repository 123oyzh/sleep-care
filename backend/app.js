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
