# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「智能睡眠环境调控设备」实训项目 — 微信小程序 + Express 云后台 + SQLite + 医生端 Web。实训阶段不依赖真实硬件，所有设备数据和睡眠数据由后台模拟生成器产生。

## 技术栈约束

| 层 | 技术 | 约束说明 |
|---|------|----------|
| 运行环境 | Node.js **18+** | 必须使用 Node.js 18 LTS 或更高版本 |
| 后端框架 | **Express** | Node.js 主流 Web 框架 |
| 数据库驱动 | **sql.js**（SQLite WASM 版） | 纯 JavaScript 实现的 SQLite，无需原生编译，跨平台兼容 |
| 开发数据库 | **SQLite**（通过 sql.js 操作） | 实训阶段使用 SQLite 文件数据库 |
| 生产数据库 | **MySQL** | 生产环境迁移至 MySQL，sql.js 仅用于开发阶段 |
| 前端框架 | **微信小程序原生框架** | 使用 WXML + WXSS + JS，不引入第三方小程序框架（如 Taro、uni-app） |
| 图表库 | **ECharts + echarts-for-weixin** | 小程序端使用 echarts-for-weixin 组件封装，后台/医生端 Web 可直接使用 ECharts |
| 认证 | **jsonwebtoken (JWT)** | 无状态 Token 认证，除登录/注册接口外均需携带 |
| 定时任务 | **node-cron** | 每日凌晨 2:00 触发模拟数据生成 |
| 医生端 Web | 原生 HTML/CSS/JS | Chart.js / ECharts，Express 托管静态资源（`/doctor` 路由） |
| 部署 | 实训阶段单机部署 | Express `:3000` + SQLite 同机；微信开发者工具「不校验合法域名」直连 localhost |

> **sql.js 注意事项**：sql.js 是 SQLite 编译为 WebAssembly 的版本，API 为异步风格（基于 Promise）。与 better-sqlite3 不同，sql.js 不支持同步调用。数据库文件通过 `fs.readFile` / `fs.writeFile` 手动持久化。

## 注释规范

- 所有 AI 生成的代码（包括小程序 JS、Express 服务端、数据库脚本）**必须包含中文注释**，提升代码可维护性
- 注释应说明**业务意图**而非代码语法，例如：`// 检查当前时间是否处于用户设定的勿扰时段` 优于 `// check dnd time range`
- 关键业务逻辑段落需在顶部以注释块概述整体流程
- API 路由处理函数需注释对应的接口文档路径（如 `// POST /api/reports/daily — 获取指定日期睡眠报告`）
- 数据库迁移脚本需注释建表语句对应的需求文档章节出处

## 设计文档

设计文档位于 `docs/`，是后续开发的权威参考，遇到功能边界或数据字段问题先查阅：

- `docs/智能睡眠环境调控设备 - 软件系统功能需求（实训需求）.docx` — 原始需求文档 V1.0
- `docs/MVP功能清单.md` — MVP 7 个功能的详细描述与范围边界
- `docs/系统架构图.md` — 分层架构、数据流向时序图、部署拓扑
- `docs/数据库设计.md` — 5 张核心表的 ER 图、DDL、字段注释

## 项目结构（规划）

```
sleep-care/
├── miniprogram/          # 微信小程序项目（微信开发者工具打开此目录）
│   ├── app.js / app.json / app.wxss
│   ├── pages/            # 页面：登录、设备、报告、设置、授权
│   └── utils/            # API 请求封装、图表配置
├── server/               # Express 云后台
│   ├── app.js            # 入口：Express 启动、路由挂载、cron 注册
│   ├── routes/           # 路由模块：auth, devices, reports, settings, doctor
│   ├── middleware/        # JWT 认证中间件
│   ├── services/         # 业务逻辑：模拟数据生成器、趋势聚合、睡眠评分计算
│   ├── db/               # sql.js 初始化 + DDL 迁移脚本（异步加载 .wasm）
│   └── public/           # 医生端 Web 静态文件（/doctor）
├── data/                 # SQLite 数据库文件存放（gitignore）
└── docs/                 # 设计文档
```

## 核心数据库表

5 张 MVP 核心表，DDL 详见 `docs/数据库设计.md`：

| 表 | 主键 | 关键外键 | 说明 |
|----|------|---------|------|
| `users` | `user_id` (INTEGER AUTOINCREMENT) | — | 用户表，含 role 字段区分普通用户/医生/管理员 |
| `devices` | `device_id` (TEXT, VIR+16位随机) | `user_id` → users | 虚拟设备绑定，解绑时 SET NULL |
| `sleep_reports` | `report_id` (INTEGER AUTOINCREMENT) | `user_id`, `device_id` | 睡眠报告，JSON 字段存分期/噪音/心率曲线 |
| `user_settings` | `user_id` (PK+FK) | `user_id` → users | 1:1 用户设置（作息/音效/勿扰） |
| `doctor_authorizations` | `id` (INTEGER AUTOINCREMENT) | `patient_user_id`, `doctor_user_id` → users | 医生授权记录 |

关键约束：`sleep_reports(user_id, report_date)` 唯一索引；所有外键 ON DELETE CASCADE（devices 除外，ON DELETE SET NULL）。

## API 约定

所有接口统一返回 `{code, message, data}` 格式：
- `code: 0` = 成功；`1001` = 参数错误；`1002` = 未登录
- 除 `/auth/login`、`/auth/register` 外，所有接口需 `Authorization: Bearer <JWT>` 头
- JWT payload: `{user_id, openid}`

## 模拟数据生成器核心规则

位于后台服务层，每日凌晨 2:00 由 node-cron 触发，读取 `user_settings(bedtime, wakeup_time)`：
- 总时长 = 设定时长 × 80%~95%（随机）
- 深睡 15%-25%、REM 20%-25%、浅睡 45%-55%
- 觉醒 0~3 次，每次 2-5 分钟
- 噪音曲线：基线 ±5dB 随机抖动
- 异常事件（apnea/limb_movement）：5% 概率生成

## MVP 范围边界

纳入 MVP：用户登录、虚拟设备管理、睡眠报告分期图表、噪音曲线、日周月趋势、个性化作息、医生授权基础。

暂不纳入：账号注销、e-CBTi 专区（睡眠日记/量表测评/打卡）、报告分享、OTA 固件升级（仅保留版本号展示入口）、真实硬件对接。
