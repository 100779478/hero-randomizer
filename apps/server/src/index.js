const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Koa = require("koa");
const cors = require("@koa/cors");
const bodyParser = require("koa-bodyparser");
const { createDatabase, initSchema, ensureAdminAccount, getSharedCatalogUserId, SHARED_CATALOG_USERNAME } = require("./db");
const { hashPassword, verifyPassword } = require("./utils/password");
const { createToken, createExpiry } = require("./utils/token");
const { drawMatch } = require("./services/randomizer-service");

const PORT = Number(process.env.PORT || 3000);
const REGISTRATION_INVITE_CODE = String(process.env.REGISTRATION_INVITE_CODE || "acky0629").trim();
const db = createDatabase();
const webRoot = path.resolve(__dirname, "../../web");
const repoRoot = path.resolve(__dirname, "../../..");
const nodeAgentRoot = path.resolve(repoRoot, "node-agent");
const nodeAgentSkillFile = path.resolve(nodeAgentRoot, "skills/random-mode-demo/SKILL.md");
const nodeAgentBridgeScript = path.resolve(nodeAgentRoot, "src/web-random-mode.js");
const vendorFiles = {
  "/vendor/vue.global.js": path.resolve(__dirname, "../../../node_modules/vue/dist/vue.global.prod.js"),
  "/vendor/vue-router.global.js": path.resolve(__dirname, "../../web/node_modules/vue-router/dist/vue-router.global.prod.js"),
  "/vendor/element-plus.full.min.js": path.resolve(__dirname, "../../../node_modules/element-plus/dist/index.full.min.js"),
  "/vendor/element-plus.css": path.resolve(__dirname, "../../../node_modules/element-plus/dist/index.css"),
  "/skill/random-mode-v1.md": path.resolve(__dirname, "../../../node-agent/skills/random-mode-demo/SKILL.md"),
};

initSchema(db);
ensureAdminAccount(db);

const app = new Koa();
const routes = [];

function addRoute(method, routePath, handler) {
  const keys = [];
  const pattern = routePath.replace(/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  routes.push({ method, keys, regex: new RegExp(`^${pattern}$`), handler });
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" }[extension] || "text/plain; charset=utf-8");
}

function sanitizeUser(row) {
  return { id: row.id, username: row.username, nickname: row.nickname, createdAt: row.created_at };
}

function parseAuthToken(ctx) {
  const header = ctx.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
}

function normalizePreferredRoles(value) {
  if (Array.isArray(value)) {
    const roles = value.filter((role) => role === "T" || role === "C" || role === "N");
    return roles.length ? Array.from(new Set(roles)) : ["T", "C", "N"];
  }

  const text = String(value || "").trim();
  if (!text || text === "any") {
    return ["T", "C", "N"];
  }

  if (text.startsWith("[")) {
    try {
      return normalizePreferredRoles(JSON.parse(text));
    } catch {
      return ["T", "C", "N"];
    }
  }

  if (text === "T" || text === "C" || text === "N") {
    return [text];
  }

  return ["T", "C", "N"];
}

function serializePreferredRoles(rolesInput) {
  const roles = normalizePreferredRoles(rolesInput);

  if (roles.length === 3) {
    return "any";
  }

  if (roles.length === 1) {
    return roles[0];
  }

  return JSON.stringify(roles);
}

function decoratePlayer(row) {
  const preferredRoles = normalizePreferredRoles(row.preferredRole || row.preferred_role);
  return {
    id: row.id,
    name: row.name,
    level: Number(row.level) || 1,
    preferredRole: serializePreferredRoles(preferredRoles),
    preferredRoles,
    createdAt: row.createdAt || row.created_at,
  };
}

async function requireAuth(ctx) {
  const token = parseAuthToken(ctx);
  if (!token) ctx.throw(401, "未登录");
  const row = db.prepare(`SELECT users.id, users.username, users.nickname, users.created_at FROM user_tokens JOIN users ON users.id = user_tokens.user_id WHERE user_tokens.token = ? AND user_tokens.expires_at > CURRENT_TIMESTAMP`).get(token);
  if (!row) ctx.throw(401, "登录已失效");
  ctx.state.user = sanitizeUser(row);
  ctx.state.token = token;
}

function sharedCatalogUserId() {
  return getSharedCatalogUserId(db);
}

async function requireCatalogAdmin(ctx) {
  await requireAuth(ctx);
  if (ctx.state.user.username !== SHARED_CATALOG_USERNAME) ctx.throw(403, "仅默认账号可访问管理页");
}

function fetchAdminDashboard() {
  const catalogUserId = sharedCatalogUserId();
  const users = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.nickname,
      users.created_at AS createdAt,
      (SELECT COUNT(*) FROM players WHERE players.user_id = users.id) AS playerCount,
      (SELECT COUNT(*) FROM match_history WHERE match_history.user_id = users.id) AS historyCount
    FROM users
    ORDER BY CASE WHEN users.username = ? THEN 0 ELSE 1 END, users.created_at ASC, users.id ASC
  `).all(SHARED_CATALOG_USERNAME).map((user) => ({
    ...user,
    playerCount: Number(user.playerCount) || 0,
    historyCount: Number(user.historyCount) || 0,
    isSharedCatalog: user.username === SHARED_CATALOG_USERNAME,
  }));
  const heroes = db.prepare(`SELECT id, role_code AS roleCode, name, created_at AS createdAt FROM heroes WHERE user_id = ? ORDER BY role_code ASC, name COLLATE NOCASE ASC`).all(catalogUserId).map((hero) => ({ ...hero, displayName: `${hero.roleCode}-${hero.name}` }));
  const maps = db.prepare(`SELECT id, name, created_at AS createdAt FROM maps WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC, id ASC`).all(catalogUserId);
  return { users, heroes, maps };
}

function runRandomModeAgent(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nodeAgentBridgeScript], {
      cwd: nodeAgentRoot,
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_SHOW_TOOL_RESULTS: "false",
        AGENT_WORKSPACE: repoRoot,
        AGENT_SKILL_FILE: nodeAgentSkillFile,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new Error("小分队agent 响应超时，请稍后重试"));
    }, 90000);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      const stdoutText = Buffer.concat(stdout).toString("utf8").trim();
      const stderrText = Buffer.concat(stderr).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(stderrText || stdoutText || `小分队agent 退出码异常：${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdoutText || "{}"));
      } catch (error) {
        reject(new Error(`小分队agent 返回内容无法解析：${stdoutText || error.message}`));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function syncPlayersFromAdminToUser(targetUserId) {
  const catalogUserId = sharedCatalogUserId();
  if (!catalogUserId) {
    const error = new Error("默认账号不存在");
    error.status = 500;
    throw error;
  }
  if (targetUserId === catalogUserId) {
    const error = new Error("默认账号无需同步玩家列表");
    error.status = 400;
    throw error;
  }

  const sourcePlayers = db.prepare(`SELECT name, level, preferred_role AS preferredRole FROM players WHERE user_id = ? ORDER BY created_at ASC, id ASC`).all(catalogUserId);
  const deletePlayers = db.prepare(`DELETE FROM players WHERE user_id = ?`);
  const insertPlayer = db.prepare(`INSERT INTO players (user_id, name, level, preferred_role) VALUES (?, ?, ?, ?)`);

  db.exec("BEGIN");
  try {
    deletePlayers.run(targetUserId);
    sourcePlayers.forEach((player) => {
      insertPlayer.run(targetUserId, player.name, Number(player.level) || 1, player.preferredRole || "any");
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return sourcePlayers.length;
}
function fetchBootstrap(userId) {
  const catalogUserId = sharedCatalogUserId();
  const players = db.prepare(`SELECT id, name, level, preferred_role AS preferredRole, created_at AS createdAt FROM players WHERE user_id = ? ORDER BY created_at ASC, id ASC`).all(userId).map(decoratePlayer);
  const chaosPlayers = db.prepare(`SELECT id, name, level, preferred_role AS preferredRole, created_at AS createdAt FROM players WHERE user_id = ? ORDER BY created_at ASC, id ASC`).all(catalogUserId).map(decoratePlayer);
  const heroes = db.prepare(`SELECT id, role_code AS roleCode, name, created_at AS createdAt FROM heroes WHERE user_id = ? ORDER BY role_code ASC, name COLLATE NOCASE ASC`).all(catalogUserId).map((hero) => ({ ...hero, displayName: `${hero.roleCode}-${hero.name}` }));
  const maps = db.prepare(`SELECT id, name, created_at AS createdAt FROM maps WHERE user_id = ? ORDER BY created_at ASC, id ASC`).all(catalogUserId);
  const rivals = db.prepare(`SELECT rivals.id, rivals.player1_id AS player1Id, rivals.player2_id AS player2Id, p1.name AS player1Name, p2.name AS player2Name FROM rivals JOIN players p1 ON p1.id = rivals.player1_id JOIN players p2 ON p2.id = rivals.player2_id WHERE rivals.user_id = ? ORDER BY rivals.id DESC`).all(userId);
  const binds = db.prepare(`SELECT hero_binds.id, hero_binds.player_id AS playerId, hero_binds.hero_id AS heroId, players.name AS playerName, heroes.role_code AS roleCode, heroes.name AS heroName FROM hero_binds JOIN players ON players.id = hero_binds.player_id JOIN heroes ON heroes.id = hero_binds.hero_id WHERE hero_binds.user_id = ? ORDER BY hero_binds.id DESC`).all(userId).map((bind) => ({ ...bind, heroDisplayName: `${bind.roleCode}-${bind.heroName}` }));
  const history = db.prepare(`SELECT id, mode, selected_map AS selectedMap, payload_json AS payloadJson, created_at AS createdAt FROM match_history WHERE user_id = ? ORDER BY id DESC LIMIT 12`).all(userId).map((row) => ({ id: row.id, mode: row.mode, selectedMap: row.selectedMap, createdAt: row.createdAt, payload: JSON.parse(row.payloadJson) }));
  return { players, chaosPlayers, heroes, maps, rivals, binds, history };
}

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    ctx.status = error.status || 500;
    ctx.body = { message: error.message || "服务异常" };
  }
});

app.use(cors({ origin: "*" }));
app.use(bodyParser());

app.use(async (ctx, next) => {
  if (ctx.method !== "GET" || ctx.path.startsWith("/api") || ctx.path === "/health") {
    await next();
    return;
  }
  const vendorFile = vendorFiles[ctx.path];
  if (vendorFile && fs.existsSync(vendorFile)) {
    ctx.set("Content-Type", contentType(vendorFile));
    ctx.set("Cache-Control", "no-store");
    ctx.body = fs.readFileSync(vendorFile);
    return;
  }
  const isAppRoute =
    ctx.path === "/" ||
    ctx.path === "/home" ||
    ctx.path === "/login" ||
    ctx.path === "/register" ||
    ctx.path === "/admin" ||
    ctx.path.startsWith("/chat/") ||
    ctx.path.startsWith("/mode/") ||
    ctx.path.startsWith("/fun/");
  const targetFile = isAppRoute ? path.join(webRoot, "index.html") : path.join(webRoot, ctx.path.replace(/^\//, ""));
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
    ctx.set("Content-Type", contentType(targetFile));
    ctx.set("Cache-Control", "no-store");
    ctx.body = fs.readFileSync(targetFile);
    return;
  }
  await next();
});

app.use(async (ctx, next) => {
  for (const route of routes) {
    if (route.method !== ctx.method) continue;
    const match = ctx.path.match(route.regex);
    if (!match) continue;
    ctx.params = {};
    route.keys.forEach((key, index) => {
      ctx.params[key] = match[index + 1];
    });
    await route.handler(ctx);
    return;
  }
  await next();
});

addRoute("GET", "/health", async (ctx) => {
  ctx.body = { ok: true };
});

addRoute("POST", "/api/auth/login", async (ctx) => {
  const { username = "", password = "" } = ctx.request.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username).trim());
  if (!user || !verifyPassword(String(password), user.password_hash)) ctx.throw(401, "账号或密码错误");
  db.prepare(`DELETE FROM user_tokens WHERE user_id = ?`).run(user.id);
  const token = createToken();
  db.prepare(`INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`).run(user.id, token, createExpiry());
  ctx.body = { token, user: sanitizeUser(user) };
});

addRoute("POST", "/api/auth/register", async (ctx) => {
  const { username = "", password = "", nickname = "", inviteCode = "" } = ctx.request.body || {};
  const normalizedUsername = String(username).trim();
  const normalizedNickname = String(nickname).trim() || normalizedUsername;
  const normalizedInviteCode = String(inviteCode).trim();
  if (!normalizedUsername || !password) ctx.throw(400, "用户名和密码不能为空");
  if (!REGISTRATION_INVITE_CODE) ctx.throw(503, "系统未配置邀请码，暂不开放注册");
  if (!normalizedInviteCode) ctx.throw(400, "请输入邀请码");
  if (normalizedInviteCode !== REGISTRATION_INVITE_CODE) ctx.throw(403, "邀请码错误");
  if (String(password).length < 6) ctx.throw(400, "密码至少 6 位");
  if (db.prepare(`SELECT id FROM users WHERE username = ?`).get(normalizedUsername)) ctx.throw(409, "用户名已存在");
  db.prepare(`INSERT INTO users (username, nickname, password_hash) VALUES (?, ?, ?)`).run(normalizedUsername, normalizedNickname, hashPassword(String(password)));
  ctx.status = 201;
  ctx.body = { message: "注册成功" };
});

addRoute("GET", "/api/auth/me", async (ctx) => {
  await requireAuth(ctx);
  ctx.body = { user: ctx.state.user };
});

addRoute("PATCH", "/api/auth/profile", async (ctx) => {
  await requireAuth(ctx);
  const { nickname = "", password = "" } = ctx.request.body || {};
  const normalizedNickname = String(nickname).trim();
  const normalizedPassword = String(password).trim();
  if (!normalizedNickname) ctx.throw(400, "昵称不能为空");
  if (normalizedPassword && normalizedPassword.length < 6) ctx.throw(400, "密码至少 6 位");
  if (normalizedPassword) {
    db.prepare(`UPDATE users SET nickname = ?, password_hash = ? WHERE id = ?`).run(normalizedNickname, hashPassword(normalizedPassword), ctx.state.user.id);
  } else {
    db.prepare(`UPDATE users SET nickname = ? WHERE id = ?`).run(normalizedNickname, ctx.state.user.id);
  }
  const updatedUser = db.prepare(`SELECT id, username, nickname, created_at FROM users WHERE id = ?`).get(ctx.state.user.id);
  ctx.body = { user: sanitizeUser(updatedUser) };
});

addRoute("POST", "/api/catalog/sync-players", async (ctx) => {
  await requireAuth(ctx);
  if (ctx.state.user.username === SHARED_CATALOG_USERNAME) ctx.throw(403, "默认账号无需同步玩家列表");
  const syncedCount = syncPlayersFromAdminToUser(ctx.state.user.id);
  ctx.body = { ...fetchBootstrap(ctx.state.user.id), syncedCount };
});

addRoute("GET", "/api/admin/dashboard", async (ctx) => {
  await requireCatalogAdmin(ctx);
  ctx.body = fetchAdminDashboard();
});

addRoute("POST", "/api/admin/users", async (ctx) => {
  await requireCatalogAdmin(ctx);
  const { username = "", password = "", nickname = "" } = ctx.request.body || {};
  const normalizedUsername = String(username).trim();
  const normalizedNickname = String(nickname).trim();
  const normalizedPassword = String(password).trim();
  if (!normalizedUsername || !normalizedNickname || !normalizedPassword) ctx.throw(400, "用户名、昵称和密码不能为空");
  if (normalizedPassword.length < 6) ctx.throw(400, "密码至少 6 位");
  if (db.prepare(`SELECT id FROM users WHERE username = ?`).get(normalizedUsername)) ctx.throw(409, "用户名已存在");
  db.prepare(`INSERT INTO users (username, nickname, password_hash) VALUES (?, ?, ?)`).run(normalizedUsername, normalizedNickname, hashPassword(normalizedPassword));
  ctx.status = 201;
  ctx.body = fetchAdminDashboard();
});

addRoute("PATCH", "/api/admin/users/:id", async (ctx) => {
  await requireCatalogAdmin(ctx);
  const userId = Number(ctx.params.id);
  const existing = db.prepare(`SELECT id, username, nickname FROM users WHERE id = ?`).get(userId);
  if (!existing) ctx.throw(404, "用户不存在");
  const { nickname, password = "" } = ctx.request.body || {};
  const normalizedNickname = String(nickname == null ? existing.nickname : nickname).trim();
  const normalizedPassword = String(password).trim();
  if (!normalizedNickname) ctx.throw(400, "昵称不能为空");
  if (normalizedPassword && normalizedPassword.length < 6) ctx.throw(400, "密码至少 6 位");
  if (normalizedPassword) {
    db.prepare(`UPDATE users SET nickname = ?, password_hash = ? WHERE id = ?`).run(normalizedNickname, hashPassword(normalizedPassword), userId);
  } else {
    db.prepare(`UPDATE users SET nickname = ? WHERE id = ?`).run(normalizedNickname, userId);
  }
  if (existing.username === SHARED_CATALOG_USERNAME && ctx.state.user.id === userId) {
    ctx.state.user.nickname = normalizedNickname;
  }
  ctx.body = fetchAdminDashboard();
});

addRoute("DELETE", "/api/admin/users/:id", async (ctx) => {
  await requireCatalogAdmin(ctx);
  const userId = Number(ctx.params.id);
  const existing = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(userId);
  if (!existing) ctx.throw(404, "用户不存在");
  if (existing.username === SHARED_CATALOG_USERNAME) ctx.throw(403, "默认账号不允许删除");
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  ctx.body = fetchAdminDashboard();
});

addRoute("POST", "/api/admin/users/:id/sync-players", async (ctx) => {
  await requireCatalogAdmin(ctx);
  const userId = Number(ctx.params.id);
  const existing = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(userId);
  if (!existing) ctx.throw(404, "用户不存在");
  if (existing.username === SHARED_CATALOG_USERNAME) ctx.throw(403, "默认账号无需同步玩家列表");
  const syncedCount = syncPlayersFromAdminToUser(userId);
  ctx.body = { ...fetchAdminDashboard(), syncedCount };
});
addRoute("POST", "/api/admin/heroes", async (ctx) => {
  await requireCatalogAdmin(ctx);
  const { roleCode = "", name = "" } = ctx.request.body || {};
  const normalizedRoleCode = String(roleCode).trim().toUpperCase();
  const normalizedName = String(name).trim();
  if (!["T", "C", "N"].includes(normalizedRoleCode)) ctx.throw(400, "英雄定位无效");
  if (!normalizedName) ctx.throw(400, "英雄名称不能为空");
  const catalogUserId = sharedCatalogUserId();
  if (db.prepare(`SELECT id FROM heroes WHERE user_id = ? AND role_code = ? AND name = ?`).get(catalogUserId, normalizedRoleCode, normalizedName)) ctx.throw(409, "英雄已存在");
  db.prepare(`INSERT INTO heroes (user_id, role_code, name) VALUES (?, ?, ?)`).run(catalogUserId, normalizedRoleCode, normalizedName);
  ctx.status = 201;
  ctx.body = fetchAdminDashboard();
});

addRoute("DELETE", "/api/admin/heroes/:id", async (ctx) => {
  await requireCatalogAdmin(ctx);
  db.prepare(`DELETE FROM heroes WHERE id = ? AND user_id = ?`).run(Number(ctx.params.id), sharedCatalogUserId());
  ctx.body = fetchAdminDashboard();
});

addRoute("POST", "/api/admin/maps", async (ctx) => {
  await requireCatalogAdmin(ctx);
  const { name = "" } = ctx.request.body || {};
  const normalizedName = String(name).trim();
  if (!normalizedName) ctx.throw(400, "地图名称不能为空");
  const catalogUserId = sharedCatalogUserId();
  if (db.prepare(`SELECT id FROM maps WHERE user_id = ? AND name = ?`).get(catalogUserId, normalizedName)) ctx.throw(409, "地图已存在");
  db.prepare(`INSERT INTO maps (user_id, name) VALUES (?, ?)`).run(catalogUserId, normalizedName);
  ctx.status = 201;
  ctx.body = fetchAdminDashboard();
});

addRoute("DELETE", "/api/admin/maps/:id", async (ctx) => {
  await requireCatalogAdmin(ctx);
  db.prepare(`DELETE FROM maps WHERE id = ? AND user_id = ?`).run(Number(ctx.params.id), sharedCatalogUserId());
  ctx.body = fetchAdminDashboard();
});

addRoute("GET", "/api/bootstrap", async (ctx) => {
  await requireAuth(ctx);
  ctx.body = { user: ctx.state.user, ...fetchBootstrap(ctx.state.user.id) };
});

addRoute("POST", "/api/players", async (ctx) => {
  await requireAuth(ctx);
  const { name = "", level = 1, preferredRoles = ["T", "C", "N"], preferredRole } = ctx.request.body || {};
  const normalizedName = String(name).trim();
  if (!normalizedName) ctx.throw(400, "玩家名称不能为空");
  db.prepare(`INSERT INTO players (user_id, name, level, preferred_role) VALUES (?, ?, ?, ?)`).run(ctx.state.user.id, normalizedName, Number(level) || 1, serializePreferredRoles(preferredRoles || preferredRole));
  ctx.status = 201;
  ctx.body = fetchBootstrap(ctx.state.user.id).players;
});

addRoute("PATCH", "/api/players/:id", async (ctx) => {
  await requireAuth(ctx);
  const { name = "", level = 1, preferredRoles = ["T", "C", "N"], preferredRole } = ctx.request.body || {};
  const normalizedName = String(name).trim();
  if (!normalizedName) ctx.throw(400, "玩家名称不能为空");
  db.prepare(`UPDATE players SET name = ?, level = ?, preferred_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).run(normalizedName, Number(level) || 1, serializePreferredRoles(preferredRoles || preferredRole), Number(ctx.params.id), ctx.state.user.id);
  ctx.body = fetchBootstrap(ctx.state.user.id).players;
});

addRoute("DELETE", "/api/players/:id", async (ctx) => {
  await requireAuth(ctx);
  db.prepare(`DELETE FROM players WHERE id = ? AND user_id = ?`).run(Number(ctx.params.id), ctx.state.user.id);
  ctx.body = fetchBootstrap(ctx.state.user.id).players;
});

addRoute("POST", "/api/heroes", async (ctx) => {
  await requireAuth(ctx);
  ctx.throw(403, "共享英雄池为只读，不支持新增");
});

addRoute("POST", "/api/heroes/reset", async (ctx) => {
  await requireAuth(ctx);
  ctx.throw(403, "共享英雄池为只读，不支持重置");
});

addRoute("DELETE", "/api/heroes/:id", async (ctx) => {
  await requireAuth(ctx);
  ctx.throw(403, "共享英雄池为只读，不支持删除");
});

addRoute("POST", "/api/maps", async (ctx) => {
  await requireAuth(ctx);
  ctx.throw(403, "共享地图池为只读，不支持新增");
});

addRoute("DELETE", "/api/maps/:id", async (ctx) => {
  await requireAuth(ctx);
  ctx.throw(403, "共享地图池为只读，不支持删除");
});

addRoute("POST", "/api/rivals", async (ctx) => {
  await requireAuth(ctx);
  const { player1Id, player2Id } = ctx.request.body || {};
  const ordered = [Number(player1Id), Number(player2Id)].sort((a, b) => a - b);
  if (!ordered[0] || !ordered[1] || ordered[0] === ordered[1]) ctx.throw(400, "敌对关系参数无效");
  db.prepare(`INSERT OR IGNORE INTO rivals (user_id, player1_id, player2_id) VALUES (?, ?, ?)`).run(ctx.state.user.id, ordered[0], ordered[1]);
  ctx.status = 201;
  ctx.body = fetchBootstrap(ctx.state.user.id).rivals;
});

addRoute("DELETE", "/api/rivals/:id", async (ctx) => {
  await requireAuth(ctx);
  db.prepare(`DELETE FROM rivals WHERE id = ? AND user_id = ?`).run(Number(ctx.params.id), ctx.state.user.id);
  ctx.body = fetchBootstrap(ctx.state.user.id).rivals;
});

addRoute("POST", "/api/binds", async (ctx) => {
  await requireAuth(ctx);
  const { playerId, heroId } = ctx.request.body || {};
  db.prepare(`INSERT INTO hero_binds (user_id, player_id, hero_id) VALUES (?, ?, ?) ON CONFLICT(user_id, player_id) DO UPDATE SET hero_id = excluded.hero_id`).run(ctx.state.user.id, Number(playerId), Number(heroId));
  ctx.status = 201;
  ctx.body = fetchBootstrap(ctx.state.user.id).binds;
});

addRoute("DELETE", "/api/binds/:id", async (ctx) => {
  await requireAuth(ctx);
  db.prepare(`DELETE FROM hero_binds WHERE id = ? AND user_id = ?`).run(Number(ctx.params.id), ctx.state.user.id);
  ctx.body = fetchBootstrap(ctx.state.user.id).binds;
});

addRoute("POST", "/api/draw", async (ctx) => {
  await requireAuth(ctx);
  const { mode = "random-v2", playerIds = [], allowRepeatHeroes = true, autoAssignHeroes = true, manualTeams = {} } = ctx.request.body || {};
  const ids = Array.isArray(playerIds) ? playerIds.map(Number).filter(Boolean) : [];
  if (!ids.length) ctx.throw(400, "请至少选择一名玩家");

  const placeholders = ids.map(() => "?").join(", ");
  const players = db.prepare(`SELECT id, name, level, preferred_role AS preferredRole FROM players WHERE user_id = ? AND id IN (${placeholders})`).all(ctx.state.user.id, ...ids).map((row) => ({
    ...row,
    preferredRoles: normalizePreferredRoles(row.preferredRole),
  }));
  const catalogUserId = sharedCatalogUserId();
  const heroes = db.prepare(`SELECT id, role_code AS roleCode, name FROM heroes WHERE user_id = ?`).all(catalogUserId);
  const maps = db.prepare(`SELECT id, name FROM maps WHERE user_id = ?`).all(catalogUserId);
  const rivals = db.prepare(`SELECT player1_id AS player1Id, player2_id AS player2Id FROM rivals WHERE user_id = ?`).all(ctx.state.user.id);
  const binds = db.prepare(`SELECT player_id AS playerId, hero_id AS heroId FROM hero_binds WHERE user_id = ?`).all(ctx.state.user.id);

  if (players.length !== ids.length) ctx.throw(400, "存在无效玩家");

  const result = drawMatch({
    mode,
    players,
    heroes,
    maps,
    rivals,
    binds,
    allowRepeatHeroes: Boolean(allowRepeatHeroes),
    autoAssignHeroes: Boolean(autoAssignHeroes),
    manualTeams,
  });

  db.prepare(`INSERT INTO match_history (user_id, mode, selected_map, payload_json) VALUES (?, ?, ?, ?)`).run(ctx.state.user.id, result.mode, result.selectedMap ? result.selectedMap.name : null, JSON.stringify(result));
  ctx.body = { result, history: fetchBootstrap(ctx.state.user.id).history };
});

addRoute("POST", "/api/chat/random-v2", async (ctx) => {
  await requireAuth(ctx);
  const { messages = [], context = null } = ctx.request.body || {};

  if (!Array.isArray(messages) || !context || typeof context !== "object") {
    ctx.throw(400, "缺少聊天消息或上下文");
  }

  const result = await runRandomModeAgent({ messages, context });
  ctx.body = {
    resolution: result.parsed,
    rawText: result.rawText,
    model: result.model,
  };
});

app.listen(PORT, () => {
  console.log(`Koa API listening on http://localhost:${PORT}`);
});











