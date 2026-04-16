import http from "node:http";

const port = Number(process.env.MOCK_API_PORT || 8787);
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const users = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  logInfo("请求进入", `${req.method} ${url.pathname}${url.search}`);

  if (req.method === "GET" && url.pathname === "/health") {
    logInfo("健康检查", "mock-api-server 正常");
    return writeJson(res, 200, { ok: true, service: "mock-api-server" });
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const payload = await parseJsonBody(req, res);
    if (!payload) {
      return;
    }

    logWarn("创建用户请求体", JSON.stringify(payload, null, 2));
    const { name, email, role } = payload;
    if (!name || !email || !role) {
      logError("创建用户失败", "name、email、role 都是必填字段");
      return writeJson(res, 400, {
        ok: false,
        message: "name、email、role 都是必填字段",
        received: payload,
      });
    }

    const user = {
      id: `user_${Date.now()}`,
      name,
      email,
      role,
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);

    const result = {
      ok: true,
      message: "用户创建成功",
      user,
    };
    logSuccess("创建用户成功", JSON.stringify(result, null, 2));
    return writeJson(res, 201, result);
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    const role = url.searchParams.get("role");
    const list = [...users.values()].filter((user) => (role ? user.role === role : true));
    const result = {
      ok: true,
      total: list.length,
      items: list,
    };
    logSuccess("查询用户列表成功", JSON.stringify(result, null, 2));
    return writeJson(res, 200, result);
  }

  if (req.method === "GET" && /^\/api\/users\/[^/]+$/.test(url.pathname)) {
    const userId = url.pathname.split("/").at(-1);
    const user = users.get(userId);

    if (!user) {
      logError("查询用户失败", `用户不存在：${userId}`);
      return writeJson(res, 404, {
        ok: false,
        message: "用户不存在",
        userId,
      });
    }

    const result = {
      ok: true,
      user,
    };
    logSuccess("查询用户成功", JSON.stringify(result, null, 2));
    return writeJson(res, 200, result);
  }

  if (req.method === "PATCH" && /^\/api\/users\/[^/]+\/role$/.test(url.pathname)) {
    const userId = url.pathname.split("/")[3];
    const payload = await parseJsonBody(req, res);
    if (!payload) {
      return;
    }

    const user = users.get(userId);
    if (!user) {
      logError("修改角色失败", `用户不存在：${userId}`);
      return writeJson(res, 404, {
        ok: false,
        message: "用户不存在",
        userId,
      });
    }

    if (!payload.role) {
      logError("修改角色失败", "role 是必填字段");
      return writeJson(res, 400, {
        ok: false,
        message: "role 是必填字段",
      });
    }

    user.role = payload.role;
    user.updatedAt = new Date().toISOString();
    const result = {
      ok: true,
      message: "用户角色更新成功",
      user,
    };
    logSuccess("修改角色成功", JSON.stringify(result, null, 2));
    return writeJson(res, 200, result);
  }

  if (req.method === "DELETE" && /^\/api\/users\/[^/]+$/.test(url.pathname)) {
    const userId = url.pathname.split("/").at(-1);
    const user = users.get(userId);

    if (!user) {
      logError("删除用户失败", `用户不存在：${userId}`);
      return writeJson(res, 404, {
        ok: false,
        message: "用户不存在",
        userId,
      });
    }

    users.delete(userId);
    const result = {
      ok: true,
      message: "用户删除成功",
      userId,
    };
    logSuccess("删除用户成功", JSON.stringify(result, null, 2));
    return writeJson(res, 200, result);
  }

  logError("未命中接口", `${req.method} ${url.pathname}`);
  return writeJson(res, 404, {
    ok: false,
    message: "接口不存在",
    path: url.pathname,
  });
});

server.listen(port, "127.0.0.1", () => {
  logSuccess("服务启动", `Mock API 已启动：http://127.0.0.1:${port}`);
  logInfo("可用接口", "POST /api/users");
  logInfo("可用接口", "GET /api/users");
  logInfo("可用接口", "GET /api/users/{userId}");
  logInfo("可用接口", "PATCH /api/users/{userId}/role");
  logInfo("可用接口", "DELETE /api/users/{userId}");
});

function writeJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

async function parseJsonBody(req, res) {
  const bodyText = await readRequestBody(req);

  try {
    return bodyText ? JSON.parse(bodyText) : {};
  } catch {
    logError("请求体解析失败", "请求体不是合法 JSON");
    writeJson(res, 400, {
      ok: false,
      message: "请求体不是合法 JSON",
    });
    return null;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function timestamp() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function logInfo(label, message) {
  console.log(`${colors.cyan}[${timestamp()}] [${label}]${colors.reset} ${message}`);
}

function logSuccess(label, message) {
  console.log(`${colors.green}[${timestamp()}] [${label}]${colors.reset} ${message}`);
}

function logWarn(label, message) {
  console.log(`${colors.yellow}[${timestamp()}] [${label}]${colors.reset} ${message}`);
}

function logError(label, message) {
  console.log(`${colors.red}[${timestamp()}] [${label}]${colors.reset} ${message}`);
}
