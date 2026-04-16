# AGENTS.md

## 适用范围

这些规则适用于整个 `hero-randomizer` 仓库。

## 架构规则

- 把 `apps/server/src/index.js` 视为真实后端入口，新增接口、鉴权判断、静态托管逻辑都应沿用现有 `addRoute(...)` 模式。
- 把 `apps/server/src/db.js` 视为数据库结构、默认主账户、共享目录归属的真实来源。
- 把 `apps/web/app.js` 视为当前真正运行的前端入口，不要默认 `apps/web/src/*` 就是线上生效版本。
- 修改前端时，同时留意 `apps/web/index.html` 和 `apps/web/styles.css` 是否需要配套调整。

## 数据规则

- `lwz` 是共享主账户，也是默认管理员。
- 英雄池和地图池属于共享目录资源。
- 普通用户拥有自己的玩家、敌对关系、专属英雄绑定、抽签历史。
- 任何“从 lwz 同步到用户”的能力都属于覆盖式同步，必须在 UI 和逻辑上按破坏性操作处理。
- SQLite 通过 `node:sqlite` 本地运行，并开启 WAL；除非用户明确要求，否则不要把这个项目重构成远程数据库架构。

## 后端规则

- 优先复用 `requireAuth` 和 `requireCatalogAdmin`，不要平行写一套权限判断。
- 保持 `bootstrap`、管理员面板、各类 mutation 的返回结构兼容现有前端。
- 后端代码保持现有 CommonJS 风格，不要突然混入另一套模块风格。

## 前端规则

- 网络请求统一先加到 `apps/web/app.js` 顶部的 `api` 对象。
- 提示、报错、确认框优先复用 `showSuccess`、`showError`、`confirmAction`。
- 默认使用中文用户文案，除非用户明确要求英文。
- 优先在现有 modal、设置页、管理页、模式页里做增量修改，不要轻易再起一套平行 UI。

## 验证规则

- 改后端后运行：`node --check apps/server/src/index.js`
- 改运行时前端后运行：`node --check apps/web/app.js`
- 如果改动涉及登录、同步、bootstrap、抽签逻辑，尽量补一次运行中的快速验证。
