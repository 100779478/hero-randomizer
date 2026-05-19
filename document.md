# 全随机模式 2.0 英雄分配 Bug 需求文档

## 一、背景与问题描述

### 1.1 项目概述

本项目是一个守望先锋（OW）内战工具，支持多种游戏模式的玩家分队与英雄分配。技术栈为 Vue 3 + Koa2 + SQLite。

### 1.2 核心问题

在**全随机模式 2.0 (random-v2)** 中，英雄分配逻辑存在 Bug，导致**同边情况**出现——即同一队伍中角色（T/C/N）分布不符合规定配置（5v5 应为 1T2C2N，6v6 应为 2T2C2N）。

### 1.3 期望行为

| 模式 | 每队坦克 (T) | 每队输出 (C) | 每队辅助 (N) | 每队总人数 |
|------|-------------|-------------|-------------|-----------|
| 5v5  | 1           | 2           | 2           | 5         |
| 6v6  | 2           | 2           | 2           | 6         |

**硬性约束：每支队伍的角色配置必须严格符合上表，不可出现偏差。**

---

## 二、系统现状分析

### 2.1 涉及的模式与文件

| 模式 | 关键文件 | 入口函数 | 是否涉及英雄分配 |
|------|---------|---------|----------------|
| 全随机模式 2.0 (random-v2) | `apps/web/random-mode-helpers.js` | `buildRandomModeResult()` | 是 |
| 全随机模式 2.0 (服务端 API) | `apps/server/src/services/randomizer-service.js` | `drawMatch()` | 是 |
| 自选模式 (fixed-team) | `apps/web/app.js` + `random-mode-helpers.js` | `startFixedDraw()` + `assignFixedTeamLegacy()` | 是 |
| 大乱斗模式 (chaos) | `apps/web/app.js` | `startChaosBalance()` | **否（仅分队，不分配英雄）** |
| 聊天模式 (chat) | `node-agent/src/web-random-mode.js` | 调用 `buildRandomModeResult()` | 是 |

### 2.2 英雄池数据

来源：`js/config.js` 中 `window.DEFAULT_HERO_POOL`，共 48 名英雄：

| 角色 | 数量 | 英雄列表 |
|------|------|---------|
| T（坦克） | 14 | 奥丽莎、查莉娅、D.VA、骇灾、拉玛刹、莱因哈特、路霸、毛加、末日铁拳、破坏球、温斯顿、西格玛、渣客女王、金驭 |
| C（输出） | 21 | 斩仇、弗蕾娅、艾什、半藏、堡垒、法老之鹰、黑百合、黑影、回声、卡西迪、狂鼠、猎空、美、士兵76、死神、索杰恩、探奇、托比昂、源氏、秩序之光、埃姆雷、安燃 |
| N（辅助） | 14 | 无漾、安娜、巴蒂斯特、布丽吉塔、禅雅塔、卢西奥、生命之梭、天使、雾子、伊拉锐、朱诺、莫伊拉、瑞希、飞天猫 |

---

## 三、已识别的 Bug 详情

### Bug 1：服务端 `assignRoleToCandidates` 使用缓存的 `current` 变量

**文件**：`apps/server/src/services/randomizer-service.js`，第 194-208 行

```javascript
// 修复前
const assignRoleToCandidates = (role, candidates) => {
    let current = assignedByRole()[role];  // ← 捕获一次快照
    const needed = requirements[role];
    while (current < needed && queue.length) {
      // ...
      current += 1;  // ← 仅更新局部变量
    }
};

// 修复后
const assignRoleToCandidates = (role, candidates) => {
    const needed = requirements[role];
    while (assignedByRole()[role] < needed && queue.length) {  // ← 每次循环重新查询
      // ...
    }
};
```

**问题**：`current` 在函数开头获取一次快照后仅本地递增，当英雄池紧张时可能导致角色计数不准确。

### Bug 2：客户端 `assignTeamHeroesLegacy` 单偏好玩家分配失败直接返回 null

**文件**：`apps/web/random-mode-helpers.js`，原第 186-194 行

```javascript
// 修复前
let success = true;
[{ role: "T", list: finalMustT }, ...].forEach((group) => {
  group.list.forEach((player) => {
    if (!player.hero && !tryAssign(player, group.role)) success = false;
  });
});
if (!success) return null;  // ← 单偏好玩家角色已满时直接失败

// 修复后
["T", "N", "C"].forEach((role) => {
  unassigned()
    .filter((player) => player.preferredRole.length === 1 && player.preferredRole[0] === role)
    .forEach((player) => {
      tryAssign(player, role);  // ← 尝试分配，失败则落入 Pass 3 强制分配
    });
});
```

**问题**：当某角色英雄池耗尽时，单偏好该角色的玩家直接导致整个分配失败，而非尝试分配到其他角色。

### Bug 3：10 次重试耗尽后返回不合规结果

**文件**：`apps/web/random-mode-helpers.js`，原第 296-321 行

```javascript
// 修复前
for (let retry = 0; retry <= 10; retry += 1) { ... }
warning: valid ? "" : "位置分布未完全符合旧版要求，已返回当前最接近结果，可继续重抽。",

// 修复后
for (let retry = 0; retry < 50; retry += 1) { ... }
if (!finalA || !finalB || !valid) {
  return { error: "英雄分配未能满足角色配置要求，请扩大英雄池或允许两队重复英雄后重试" };
}
```

**问题**：重试次数不足（10次），且耗尽后返回不合规结果而非报错。

### Bug 4：客户端 Pass 3 未强制分配到未满角色

**文件**：`apps/web/random-mode-helpers.js`，原第 202-219 行

```javascript
// 修复前（使用 tryAssign，有偏好检查）
for (const role of ordered) {
  if (tryAssign(player, role)) return;  // ← tryAssign 会检查偏好
}

// 修复后（直接从池中分配，跳过偏好检查）
for (const role of ordered) {
  const available = heroGroups[role].filter((hero) => !used.has(hero.raw));
  if (available.length) {
    const hero = available[Math.floor(Math.random() * available.length)];
    player.hero = { name: hero.name, roleCode: hero.role, displayName: hero.raw };
    used.add(hero.raw);
    return;
  }
}
```

**问题**：当玩家偏好角色已满时，Pass 3 应强制分配到任何未满角色，但旧代码的 `tryAssign` 仍受偏好限制。

### Bug 5：服务端缺少验证和重试机制

**文件**：`apps/server/src/services/randomizer-service.js`

```javascript
// 修复后：新增 validateHeroAllocation + 50次重试循环
let valid = false;
for (let retry = 0; retry < 50; retry += 1) {
  // 重置英雄分配
  teams.teamA.forEach((p) => { p.hero = null; });
  teams.teamB.forEach((p) => { p.hero = null; });
  assignTeamHeroes(teams.teamA, heroRows, { usedSet: teamAUsed, bindMap });
  assignTeamHeroes(teams.teamB, heroRows, { usedSet: teamBUsed, bindMap });
  if (validateHeroAllocation(teams.teamA, teams.teamB, teamSize)) {
    valid = true;
    break;
  }
}
if (!valid) throw new Error("英雄分配未能满足角色配置要求...");
```

**问题**：服务端原始代码没有验证英雄分配结果，也没有重试机制。

---

## 四、功能需求

### FR-1：角色分配硬性约束（P0）

每支队伍的角色配置必须严格满足：

| 条件 | 每队 T | 每队 C | 每队 N |
|------|--------|--------|--------|
| 5v5（10人） | 1 | 2 | 2 |
| 6v6（12人） | 2 | 2 | 2 |

- 不允许返回"最接近结果"的降级方案
- 英雄池不足时应提前报错并阻止分配

### FR-2：英雄池预检机制（P0）

分配前验证英雄池是否满足最低需求：

| 条件 | 允许重复 | 所需 T | 所需 C | 所需 N |
|------|---------|--------|--------|--------|
| 5v5  | 否 | 2 | 4 | 4 |
| 5v5  | 是 | 1 | 2 | 2 |
| 6v6  | 否 | 4 | 4 | 4 |
| 6v6  | 是 | 2 | 2 | 2 |

### FR-3：玩家偏好角色匹配策略（P0）

1. **单偏好玩家**：优先分配到偏好角色，角色已满时落入 Pass 3 强制分配到其他未满角色
2. **多偏好玩家**：优先分配到偏好中仍有空位的角色
3. **任意偏好玩家**：填充任何未满角色

### FR-4：分配失败处理（P1）

- 重试 50 次（原 10 次）
- 重试耗尽后返回错误信息，不返回不合规结果
- 提供"扩大英雄池"或"允许英雄重复"的建议

### FR-5：大乱斗模式（暂不涉及）

大乱斗模式 (chaos) 当前只做分队均衡，不分配英雄，本次修复不涉及该模式。

---

## 五、非功能需求

### NFR-1：代码统一（已确认）

- 核心分配算法统一放在 `random-mode-helpers.js`
- 服务端 `/api/draw` 端点保留独立实现但逻辑对齐
- 两套实现使用相同的角色需求函数和验证逻辑

### NFR-2：可测试性

分配算法应覆盖以下场景：
- 标准 5v5 / 6v6 分配
- 英雄池刚好满足需求（边界情况）
- 多数玩家偏好同一角色（如全员偏好 C）
- 英雄绑定（bind）与角色需求冲突
- 允许/禁止英雄重复

---

## 六、修复方案

### 第一步：修复客户端分配逻辑

1. **Pass 1**：单偏好玩家角色已满时不返回 null，让未分配玩家落入 Pass 3
2. **Pass 2**：使用 `currentRoles()` 函数实时查询角色计数
3. **Pass 3**：强制分配到未满角色，跳过偏好检查

### 第二步：修复服务端分配逻辑

1. `assignRoleToCandidates` 循环内使用 `assignedByRole()[role]` 实时查询
2. `remainingPlayers` 中当角色需求已满足时直接使用 ALL 池
3. 新增 `validateHeroAllocation` 验证函数
4. 新增 50 次重试循环 + 英雄池预检

### 第三步：增强验证

1. 客户端重试从 10 次提升到 50 次
2. 重试耗尽后返回错误，不返回不合规结果
3. 服务端新增英雄池预检和分配验证

---

## 七、测试场景与结果

### 7.1 正常场景

| 场景 | 客户端 | 服务端 |
|------|--------|--------|
| 正常任意偏好 6v6 | 100/100 | 100/100 |
| 正常任意偏好 5v5 | 100/100 | 100/100 |

### 7.2 边界场景

| 场景 | 客户端 | 服务端 |
|------|--------|--------|
| 全员偏好 C 6v6 | 100/100 | 100/100 |
| 全员偏好 C 5v5 | 100/100 | 100/100 |
| 混合偏好 6v6 | 100/100 | 100/100 |
| 重度 C 偏好 6v6 | 100/100 | 100/100 |
| 不允许重复 6v6 | 100/100 | - |
| 英雄池不足检测 | 正确报错 | 正确报错 |

---

## 八、涉及的关键文件清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `apps/web/random-mode-helpers.js` | Bug 修复 + 逻辑重写 | 修复 Pass 1/2/3 逻辑、增加重试次数、禁止降级返回 |
| `apps/server/src/services/randomizer-service.js` | Bug 修复 + 新增验证 | 修复缓存变量、新增验证函数、重试循环、英雄池预检 |
