# 智能睡眠健康管理软件

> 实训项目 — 智能睡眠环境调控设备 · 软件系统  
> 微信小程序 + Express 云后台 + SQLite + 医生端 Web

---

## 1. 项目简介

智能睡眠健康管理软件是一套面向患者和医生的睡眠数据管理平台。

**患者端（微信小程序）**：查看每日睡眠评分、睡眠分期图表、环境噪音曲线、日周月趋势，管理虚拟设备，设置作息计划，授权医生查看数据，接收医生的干预建议。

**医生端（Web 页面）**：登录后查看已授权患者列表，确认授权，查看患者睡眠报告（评分、时长、深睡比例、趋势图），填写并保存干预建议。

**后端（Express API）**：提供完整的 RESTful 接口，基于 JWT 认证，SQLite 文件数据库存储，模拟数据生成器自动生成符合生理规律的睡眠数据。

### MVP 功能

| 模块 | 功能 |
|------|------|
| 用户认证 | 手机号 + 密码注册/登录，JWT 无状态认证 |
| 虚拟设备 | 一键添加演示设备，编辑昵称，解绑 |
| 睡眠报告 | 睡眠评分、分期柱状图（48段/10分钟）、噪音曲线（144点/24小时）、日周月趋势折线图 |
| 作息设置 | 就寝时间、起床时间、日出模拟时长 |
| 医生授权 | 患者选择医生授权 → 医生确认 → 查看报告 → 填写干预建议 |
| 通知机制 | 轮询 + 红点提示，患者收到新建议通知 |

---

## 2. 技术架构

```
┌──────────────────────────────────────────────────────┐
│                    客户端层                           │
├─────────────────────┬────────────────────────────────┤
│   微信小程序         │      医生端 Web                 │
│   WXML / WXSS / JS  │      HTML / CSS / JS           │
│   + echarts-for-weixin │  + ECharts CDN               │
└─────────┬───────────┴────────────┬───────────────────┘
          │                        │
          ▼                        ▼
┌──────────────────────────────────────────────────────┐
│                  云端服务层                            │
│   Express 4 + CORS + JSON 解析                       │
│   ├─ JWT 认证中间件                                   │
│   ├─ 24 个 RESTful API 端点                           │
│   ├─ 模拟数据生成器 (seededRandom)                    │
│   └─ node-cron 定时任务                               │
├──────────────────────────────────────────────────────┤
│                  数据持久层                            │
│   sql.js (SQLite WASM) + 文件持久化                   │
│   5 张核心表: users / devices / sleep_reports /       │
│              user_settings / doctor_authorizations    │
└──────────────────────────────────────────────────────┘
```

| 层 | 技术 | 说明 |
|---|------|------|
| 运行环境 | Node.js **18+** | 原生 fetch / WASM 支持 |
| 后端框架 | Express 4.21 | RESTful API |
| 数据库 | sql.js (SQLite WASM) | 纯 JS 实现，跨平台，`sleep_care.db` 文件存储 |
| 认证 | jsonwebtoken (JWT) | 7 天有效期，无状态 Bearer Token |
| 密码 | bcryptjs | 10 轮 salt 哈希 |
| 定时任务 | node-cron | 每日凌晨 2:00 自动生成模拟睡眠数据 |
| 小程序 | 微信原生框架 | WXML + WXSS + JS，不引入第三方框架 |
| 图表 | ECharts 5 | 小程序用 echarts-for-weixin 组件，Web 端用 CDN |
| 医生端 Web | 原生 HTML/CSS/JS | Express 托管静态资源，单页面应用 |
| 部署 | 单机 | `localhost:3000`，微信开发者工具直连 |

---

## 3. 快速开始

### 3.1 环境要求

- Node.js **18+**（LTS 推荐）
- 微信开发者工具（用于小程序端）
- Git Bash 或终端（Windows 推荐 Git Bash）

### 3.2 克隆项目

```bash
git clone <repository-url>
cd sleep-care
```

### 3.3 安装依赖

```bash
cd backend
npm install
```

### 3.4 启动后端服务

```bash
# 生产模式
npm start

# 开发模式（nodemon 热重载）
npm run dev
```

启动后访问 `http://localhost:3000`，返回健康检查 JSON 即表示成功。

### 3.5 启动微信小程序

1. 打开**微信开发者工具**
2. 导入项目 → 选择 `miniprogram/` 目录
3. 在"详情 → 本地设置"中勾选**"不校验合法域名"**
4. 点击编译运行

### 3.6 访问医生端 Web

浏览器打开 `http://localhost:3000/doctor.html`

### 3.7 运行集成测试

```bash
node backend/test/integration.test.js
```

> 前置条件：后端服务已启动

---

## 4. API 文档索引

> 所有接口统一返回 `{ code, message, data }` 格式  
> `code: 0` = 成功，`1001` = 参数错误，`1002` = 未登录/无权限

### 健康检查

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/` | — | 服务健康检查 |

### 用户认证

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | — | 注册（支持 `role`: patient/doctor/admin） |
| POST | `/api/auth/login` | — | 登录，返回 JWT Token |

### 设备管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/device/list` | JWT | 获取设备列表 |
| POST | `/api/device/add` | JWT | 添加设备 |
| PUT | `/api/devices/:id` | JWT | 修改设备昵称 |
| DELETE | `/api/devices/:id` | JWT | 删除/解绑设备 |

### 睡眠报告

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/sleep/report/daily` | JWT | 每日睡眠报告（评分/各阶段时长/心率） |
| GET | `/api/sleep/stages` | JWT | 48段睡眠分期数据（每10分钟编码 0-3） |
| GET | `/api/sleep/noise` | JWT | 144点环境噪音数据（24小时/dB） |
| GET | `/api/sleep/summary` | JWT | 日/周/月评分趋势（含 avg_score） |

### 作息设置

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/setting/plan` | JWT | 获取作息设置 |
| PUT | `/api/setting/plan` | JWT | 更新作息设置 |

### 医生授权

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/doctor/grant` | JWT | 患者授权医生（支持 doctor_id 或 doctor_phone） |
| DELETE | `/api/doctor/revoke` | JWT | 患者撤销授权 |
| GET | `/api/doctor/granted` | JWT | 患者查看已授权医生列表 |
| PUT | `/api/doctor/confirm` | JWT | 医生确认授权 |
| GET | `/api/doctor/patients` | JWT | 医生查看已授权患者列表 |
| GET | `/api/doctor/patient/data` | JWT | 医生查看指定患者报告 |
| **PUT** | `/api/doctor/note` | JWT | 医生填写/更新干预建议 |
| **GET** | `/api/doctor/note` | JWT | 医生获取对某患者的建议 |

### 患者通知

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/patient/notes` | JWT | 患者获取所有医生建议（含脱敏手机号） |
| GET | `/api/patient/notes/status` | JWT | 轻量轮询接口（仅返回未读计数） |

### 公开接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/users/doctors` | — | 获取已注册医生列表 |

> 详细接口定义见 [docs/医患通知方案设计.md](docs/医患通知方案设计.md)

---

## 5. 目录结构

```
sleep-care/
├── backend/                    # Express 云后台
│   ├── app.js                  # 入口：Express 启动、全部路由、模拟数据生成器
│   ├── package.json            # 依赖与脚本
│   ├── db/                     # 数据库模块
│   │   ├── connection.js       # sql.js 连接单例 + 文件持久化
│   │   ├── init.js             # 初始化入口
│   │   ├── schema.js           # DDL 建表 + 索引 + 列迁移
│   │   └── migrate-add-column.js  # 独立迁移脚本
│   ├── public/                 # 医生端 Web 静态资源
│   │   └── doctor.html         # 医生端单页面应用
│   └── test/
│       └── integration.test.js # 医患流程集成测试（11 步）
│
├── miniprogram/                # 微信小程序
│   ├── app.js / app.json / app.wxss
│   ├── components/             # ec-canvas 图表组件
│   │   └── ec-canvas/          # echarts-for-weixin
│   ├── pages/                  # 页面
│   │   ├── login/              # 登录页
│   │   ├── register/           # 注册页
│   │   ├── home/               # 首页（睡眠报告概览 + 通知条）
│   │   ├── report/             # 报告页（分期图 + 噪音图 + 趋势图 + 医生建议）
│   │   ├── devices/            # 设备管理页
│   │   ├── settings/           # 作息设置页
│   │   ├── doctors/            # 医生授权页（选择 + 已授权 + 撤销）
│   │   └── notify/             # 医生建议通知页
│   └── utils/                  # 工具函数
│
├── docs/                       # 设计文档
│   ├── 需求文档.md
│   ├── MVP功能清单.md
│   ├── 系统架构图.md
│   ├── 数据库设计.md
│   ├── 医患通知方案设计.md
│   └── 优化记录.md
│
├── sleep_care.db               # SQLite 数据库文件
├── CLAUDE.md                   # Claude Code 项目指令
└── README.md                   # 本文件
```

---

## 6. 数据库核心表

| 表 | 主键 | 说明 |
|----|------|------|
| `users` | `user_id` | 用户表，role 字段区分患者(0)/医生(1)/管理员(2) |
| `devices` | `id` | 虚拟设备表，每用户可绑定多台 |
| `sleep_reports` | `report_id` | 睡眠报告表，`(user_id, report_date)` 唯一索引 |
| `user_settings` | `user_id` | 1:1 用户作息设置 |
| `doctor_authorizations` | `id` | 医患授权记录，状态流转 pending→active/revoked/expired |

> 详细 DDL 见 [docs/数据库设计.md](docs/数据库设计.md)

---

## 7. 开发团队

| 角色 | 说明 |
|------|------|
| 项目名称 | 智能睡眠环境调控设备 · 软件系统 |
| 实训课程 | 软件工程综合实训 |
| 技术栈 | Node.js + Express + SQLite + 微信小程序 + ECharts |

---

## 8. 开发指南

### 代码规范

- 所有 AI 生成的代码**必须包含中文注释**，说明业务意图
- API 路由处理函数需注释对应接口文档路径
- 使用 `var` + `self` 模式确保微信小程序兼容性

### 常用命令

```bash
# 后端开发（自动重启）
cd backend && npm run dev

# 独立数据库迁移
node backend/db/migrate-add-column.js

# 集成测试
node backend/test/integration.test.js

# 强制清理并重启
taskkill //F //IM node.exe && cd backend && npm start
```

### 模拟数据说明

- 每日凌晨 2:00 cron 触发生成昨日数据
- 首次访问 `/api/sleep/report/daily` 时按需生成
- 使用 `seededRandom(userId * 10000 + dateInt)` 保证确定性复现
- 睡眠评分 60-100，总时长 300-480 分钟，深睡 15%-35%

---

> 更多信息见 [CLAUDE.md](CLAUDE.md)
