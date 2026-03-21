import { session, clearSession } from "./session";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearSession();
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return payload;
}

export const api = {
  login(body) {
    return request("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
  },
  register(body) {
    return request("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
  },
  me() {
    return request("/api/auth/me");
  },
  bootstrap() {
    return request("/api/bootstrap");
  },
  addPlayer(body) {
    return request("/api/players", { method: "POST", body: JSON.stringify(body) });
  },
  updatePlayer(id, body) {
    return request(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deletePlayer(id) {
    return request(`/api/players/${id}`, { method: "DELETE" });
  },
  addHero(body) {
    return request("/api/heroes", { method: "POST", body: JSON.stringify(body) });
  },
  deleteHero(id) {
    return request(`/api/heroes/${id}`, { method: "DELETE" });
  },
  addMap(body) {
    return request("/api/maps", { method: "POST", body: JSON.stringify(body) });
  },
  deleteMap(id) {
    return request(`/api/maps/${id}`, { method: "DELETE" });
  },
  addRival(body) {
    return request("/api/rivals", { method: "POST", body: JSON.stringify(body) });
  },
  deleteRival(id) {
    return request(`/api/rivals/${id}`, { method: "DELETE" });
  },
  addBind(body) {
    return request("/api/binds", { method: "POST", body: JSON.stringify(body) });
  },
  deleteBind(id) {
    return request(`/api/binds/${id}`, { method: "DELETE" });
  },
  draw(body) {
    return request("/api/draw", { method: "POST", body: JSON.stringify(body) });
  },
};
