---
name: "hero-randomizer-maintainer"
description: "维护和扩展这个基于 Koa、SQLite、Vue 运行时资源的 OW 内战随机工具仓库。适用于本项目中的 API 路由、SQLite 结构与数据流、登录鉴权、模式逻辑、管理员能力、主账户数据同步、部署问题，以及当前真正在线运行的前端入口 `apps/web/app.js`、`apps/web/index.html`、`apps/web/styles.css` 的修改。"
---

# Hero Randomizer Maintainer

## 概述

在这个仓库中做功能开发、问题修复、代码审查、数据流调整或运维排查时使用本 skill。优先沿用当前项目已经在跑的真实入口和既有结构，不要平行引入一套新的架构。

## 真实运行入口

- 后端真实入口是 `apps/server/src/index.js`。路由注册、鉴权、静态资源托管、业务拼装基本都在这里。
- 数据库结构、建表、默认主账户、共享目录逻辑在 `apps/server/src/db.js`。
- SQLite 主文件是 `apps/server/data/app.db`，并启用了 WAL。
- 当前真正被 Koa 托管和运行的前端入口是 `apps/web/app.js`、`apps/web/index.html`、`apps/web/styles.css`。
- `apps/web/src/*` 可以作为参考，但除非用户明确要求维护 SFC/Vite 版本，否则不要只改那里却不改运行时入口。
- `/vendor/*` 资源由 Koa 直接托管，不要默认这是一个完整前端构建产物项目。

## 数据归属规则

- `lwz` 是共享主账户，也是默认管理员账户。
- 共享英雄池和地图池来自 `lwz`。
- 普通用户拥有自己的 `players`、`rivals`、`hero_binds`、`match_history`。
- 凡是“从 lwz 同步玩家数据到用户”的功能，本质都是覆盖式同步，必须视为破坏性操作。
- 处理 SQLite 时保持本地文件数据库思维，不要擅自引入远程数据库前提。

## 后端工作方式

- 新接口通过 `addRoute(method, path, handler)` 加入 `apps/server/src/index.js`。
- 登录态接口复用 `requireAuth(ctx)`。
- 仅 `lwz` 可用的管理接口复用 `requireCatalogAdmin(ctx)`。
- 尽量保持现有返回结构，例如很多接口返回的是刷新后的 bootstrap/dashboard 数据，而不是简单的 `{ ok: true }`。
- 玩家相关修改要注意复用 `normalizePreferredRoles`、`serializePreferredRoles`、`decoratePlayer` 一类现成逻辑。
- 任何修改都不要破坏当前的静态托管规则，应用页面路由仍应回到 `apps/web/index.html`。

## 前端工作方式

- 网络请求统一先加到 `apps/web/app.js` 顶部的 `api` 对象。
- 用户反馈优先复用 `showSuccess`、`showError`、`confirmAction`。
- 设置页、账号页、管理台、模式页优先沿用现有结构，不要平行再造一套页面流程。
- `apps/web/app.js` 当前采用的是 Vue runtime 组件写法：`setup()` + 行内模板字符串，修改时保持同风格。
- 新增会覆盖用户数据的操作时，必须加确认弹窗，并且用中文明确说明覆盖范围。

## 验证要求

- 改后端后运行：`node --check apps/server/src/index.js`
- 改运行时前端后运行：`node --check apps/web/app.js`
- 如果改动涉及鉴权、bootstrap、同步逻辑、抽签逻辑，尽量补一次运行中的快速验证。
- 查数据库状态时记住：最新写入可能还在 `app.db-wal` 里，未必已经 checkpoint 回 `app.db`。

## 参考资料

- 需要项目结构、核心表、核心路由、修改检查清单时，读取 `references/project-map.md`。
