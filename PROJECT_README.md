# Hero Randomizer Fullstack

这是基于当前仓库静态工具升级出的轻量全栈项目。

## 技术栈

- 前端: Vue 3 运行时 + Vue Router
- 后端: Node.js + Koa2
- 数据库: SQLite（Node 内置 `node:sqlite`）
- 鉴权: Token Session

## 目录

- `apps/web`: 静态前端资源与样式
- `apps/server`: API、建表、登录、数据初始化、静态资源托管与随机分队逻辑

## 启动

1. 在仓库根目录执行 `npm install`
2. 启动服务前先设置环境变量 `REGISTRATION_INVITE_CODE`，例如 PowerShell: `$env:REGISTRATION_INVITE_CODE="你的内部邀请码"`
3. 启动服务: `npm run dev`
4. 打开 `http://localhost:3000`

## 部署

- 云服务器部署说明见 `DEPLOYMENT.md`

## 首次使用

1. 系统首次启动会自动建表
2. 自动创建 `lwz` 账号，密码为 `20251030`
3. 自动读取当前仓库里的 `js/config.js`
4. 把默认玩家、英雄、地图写成 `lwz` 的初始配置
5. 其他新用户注册后会复制一份 `lwz` 的默认库作为起点

## 注册限制

- 新用户注册必须填写正确的邀请码
- 邀请码由服务端环境变量 REGISTRATION_INVITE_CODE 控制
- 如果未配置该环境变量，注册接口会直接拒绝注册


