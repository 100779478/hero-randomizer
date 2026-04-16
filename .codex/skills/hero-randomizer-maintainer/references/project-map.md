# 项目地图

## 实际运行入口

- 后端真实入口：`apps/server/src/index.js`
- 数据库结构与初始化：`apps/server/src/db.js`
- 实际运行的前端入口：`apps/web/app.js`
- 前端 HTML 入口：`apps/web/index.html`
- 前端样式入口：`apps/web/styles.css`

注意：`apps/web/src/*` 虽然存在，但当前 Koa 实际托管的是 `app.js` 方案。不要默认 `src/` 才是生产真相。

## 后端结构

### `apps/server/src/index.js` 负责

- 创建 Koa 应用
- 通过 `addRoute(...)` 注册接口
- 托管 `/vendor/*` 和前端静态页面
- 处理登录、bootstrap、管理员能力、玩家同步、抽签逻辑

### 关键辅助函数

- `requireAuth(ctx)`：登录校验
- `requireCatalogAdmin(ctx)`：`lwz` 专属管理员校验
- `fetchBootstrap(userId)`：返回前端工作台/设置页需要的 bootstrap 数据
- `fetchAdminDashboard()`：返回管理员页面数据
- `syncPlayersFromAdminToUser(targetUserId)`：从 `lwz` 覆盖同步玩家列表到指定用户

## 数据库模型

SQLite 主文件：`apps/server/data/app.db`

由于开启了 WAL，通常还会伴随：

- `app.db-wal`
- `app.db-shm`

### 主要表

- `users`：用户账号
- `user_tokens`：登录 token
- `players`：用户自己的玩家池
- `heroes`：共享英雄池
- `maps`：共享地图池
- `rivals`：用户自己的敌对关系
- `hero_binds`：用户自己的专属英雄绑定
- `match_history`：抽签历史

## 数据归属规则

- `lwz` 是共享主账户与默认管理员。
- 英雄和地图是共享目录资源。
- 普通用户维护自己的玩家、敌对关系、绑定关系和历史记录。
- 从 `lwz` 同步玩家到用户时，是覆盖式操作，不是 merge。

## 前端结构

### `apps/web/app.js` 顶层大致包含

- session 管理与 request 封装
- `api` 对象
- 通用消息函数：`showSuccess`、`showError`、`confirmAction`
- `SettingsModal`
- `AdminView`
- `LandingView`
- `DogView`
- 工作台逻辑与模板
- Router 初始化与 `app.mount()`

## 修改建议

- 新接口先补到 `api` 对象。
- 新的用户操作尽量接入已有 modal / page 流程。
- 破坏性操作必须给中文确认提示。
- 如果只是修当前运行中的页面，优先改 `apps/web/app.js`，不要只改 `apps/web/src/*`。

## 修改前检查

- 你改的是实际运行文件，还是只改了参考版本？
- 这次改动会不会影响 `lwz` 与普通用户的数据归属？
- 这次操作是不是覆盖/删除用户数据？如果是，要加确认提示。
- 返回数据结构有没有和现有前端消费者保持一致？

## 修改后检查

- `node --check apps/server/src/index.js`
- `node --check apps/web/app.js`
- 若涉及鉴权、同步、bootstrap、抽签，尽量做一次运行态快速验证。
