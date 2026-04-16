const { createApp, reactive, ref, computed, onMounted } = Vue;
const { createRouter, createWebHistory, useRoute, useRouter } = VueRouter;
const watch = Vue.watch;
const nextTick = Vue.nextTick;
const { ElMessage, ElMessageBox } = ElementPlus;

const STORAGE_KEY = "hero-randomizer-session";
const ROLE_ORDER = { T: 1, C: 2, N: 3 };
const FIXED_SPECTATORS = ["白付"];
const ADMIN_USERNAME = "lwz";
const RANDOM_MODE_HELPERS = window.RandomModeHelpers || {};
const RANDOM_MODE_CHAT_SKILL = window.RandomModeChatSkill || {};
const RANDOM_MODE_CHAT_CONTEXT_KEY = RANDOM_MODE_CHAT_SKILL.CONTEXT_STORAGE_KEY || "hero-randomizer-random-chat-context";
const {
  parseLegacyHeroString,
  groupLegacyHeroesByRole,
  getTeamRoleRequirements,
  isValidAllocationLegacy,
  balanceTeamsByLevelLegacy,
  assignTeamHeroesLegacy,
  assignFixedTeamLegacy,
  randomMapPayload,
  buildRandomModeResult,
} = RANDOM_MODE_HELPERS;

const session = reactive({ token: "", user: null });

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    session.token = parsed.token || "";
    session.user = parsed.user || null;
  }
} catch {
  localStorage.removeItem(STORAGE_KEY);
}

function setSession(payload) {
  session.token = payload.token;
  session.user = payload.user;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearSession() {
  session.token = "";
  session.user = null;
  localStorage.removeItem(STORAGE_KEY);
}

function updateSessionUser(user) {
  if (!session.token || !user) return;
  session.user = user;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: session.token, user }));
}

function resolveMessage(error, fallback = "操作失败") {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error.message === "string") return error.message || fallback;
  return fallback;
}

function showMessage(type, message, options = {}) {
  ElMessage({ type, message: resolveMessage(message), grouping: true, ...options });
}

function showSuccess(message, options = {}) {
  showMessage("success", message, options);
}

function showWarning(message, options = {}) {
  showMessage("warning", message, options);
}

function showError(message, options = {}) {
  showMessage("error", message, options);
}

async function confirmAction(message, title = "提示", options = {}) {
  try {
    await ElMessageBox.confirm(message, title, {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      ...options,
    });
    return true;
  } catch (error) {
    if (error === "cancel" || error === "close") return false;
    throw error;
  }
}

window.alert = (message) => {
  showWarning(message);
};

async function request(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(path, Object.assign({}, options, { headers }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(payload.message || "请求失败");
  }
  return payload;
}

const api = {
  login(body) { return request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }); },
  register(body) { return request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }); },
  updateProfile(body) { return request("/api/auth/profile", { method: "PATCH", body: JSON.stringify(body) }); },
  bootstrap() { return request("/api/bootstrap"); },
  addPlayer(body) { return request("/api/players", { method: "POST", body: JSON.stringify(body) }); },
  updatePlayer(id, body) { return request(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  deletePlayer(id) { return request(`/api/players/${id}`, { method: "DELETE" }); },
  addHero(body) { return request("/api/heroes", { method: "POST", body: JSON.stringify(body) }); },
  resetHeroes() { return request("/api/heroes/reset", { method: "POST" }); },
  deleteHero(id) { return request(`/api/heroes/${id}`, { method: "DELETE" }); },
  addMap(body) { return request("/api/maps", { method: "POST", body: JSON.stringify(body) }); },
  deleteMap(id) { return request(`/api/maps/${id}`, { method: "DELETE" }); },
  addRival(body) { return request("/api/rivals", { method: "POST", body: JSON.stringify(body) }); },
  deleteRival(id) { return request(`/api/rivals/${id}`, { method: "DELETE" }); },
  addBind(body) { return request("/api/binds", { method: "POST", body: JSON.stringify(body) }); },
  deleteBind(id) { return request(`/api/binds/${id}`, { method: "DELETE" }); },
  draw(body) { return request("/api/draw", { method: "POST", body: JSON.stringify(body) }); },
  adminDashboard() { return request("/api/admin/dashboard"); },
  createUser(body) { return request("/api/admin/users", { method: "POST", body: JSON.stringify(body) }); },
  updateUser(id, body) { return request(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  deleteUser(id) { return request(`/api/admin/users/${id}`, { method: "DELETE" }); },
  syncUserPlayers(id) { return request(`/api/admin/users/${id}/sync-players`, { method: "POST" }); },
  syncMyPlayers() { return request("/api/catalog/sync-players", { method: "POST" }); },
  createAdminHero(body) { return request("/api/admin/heroes", { method: "POST", body: JSON.stringify(body) }); },
  deleteAdminHero(id) { return request(`/api/admin/heroes/${id}`, { method: "DELETE" }); },
  createAdminMap(body) { return request("/api/admin/maps", { method: "POST", body: JSON.stringify(body) }); },
  deleteAdminMap(id) { return request(`/api/admin/maps/${id}`, { method: "DELETE" }); },
  chatRandomMode(body) { return request("/api/chat/random-v2", { method: "POST", body: JSON.stringify(body) }); },
};

function normalizePreferredRoles(value) {
  if (Array.isArray(value)) {
    const roles = value.filter((role) => role === "T" || role === "C" || role === "N");
    return roles.length ? Array.from(new Set(roles)) : ["T", "C", "N"];
  }
  const text = String(value || "").trim();
  if (!text || text === "any") return ["T", "C", "N"];
  if (text.startsWith("[")) {
    try { return normalizePreferredRoles(JSON.parse(text)); } catch { return ["T", "C", "N"]; }
  }
  if (text === "T" || text === "C" || text === "N") return [text];
  return ["T", "C", "N"];
}

function decoratePlayer(player) {
  return { ...player, preferredRoles: normalizePreferredRoles(player.preferredRoles || player.preferredRole) };
}

function createRandomChatContext(payload) {
  return {
    mode: "random-v2",
    user: payload.user || session.user || null,
    players: (payload.players || []).map(decoratePlayer),
    heroes: (payload.heroes || []).map((hero) => ({ ...hero })),
    maps: (payload.maps || []).map((map) => ({ ...map })),
    rivals: (payload.rivals || []).map((rival) => ({ ...rival })),
    binds: (payload.binds || []).map((bind) => ({ ...bind })),
    createdAt: Date.now(),
  };
}

function storeRandomChatContext(payload) {
  sessionStorage.setItem(RANDOM_MODE_CHAT_CONTEXT_KEY, JSON.stringify(createRandomChatContext(payload)));
}

function parseHeroInput(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([TCN])\s*[-－]\s*(.+)$/i);
  if (!match) return null;
  return { roleCode: match[1].toUpperCase(), name: match[2].trim() };
}

function heroDisplay(hero) { return hero.displayName || `${hero.roleCode}-${hero.name}`; }

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function roleLabel(role) { return { T: "坦克", C: "输出", N: "辅助" }[role] || role; }
function roleEmoji(role) { return { T: "🛡️", C: "⚔️", N: "🩹" }[role] || "•"; }
function preferredRolesText(roles) { return normalizePreferredRoles(roles).map((role) => roleLabel(role)).join("/"); }
function preferredRolesEmoji(roles) { return normalizePreferredRoles(roles).map((role) => roleEmoji(role)).join(""); }
function sortedTeam(team) {
  return (team || []).slice().sort((left, right) => {
    const roleDiff = (ROLE_ORDER[left.hero?.roleCode] || 99) - (ROLE_ORDER[right.hero?.roleCode] || 99);
    if (roleDiff !== 0) return roleDiff;
    return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
  });
}

const MODE_CARDS = [
  { key: "random-v2", title: "全随机模式 2.0", icon: "全随机模式 2.0", description: "更公平、更自由的随机体验", features: ["多选位置偏好", "人员、英雄随机分配", "实力自动平衡", "内鬼敌对与专属英雄"] },
  { key: "fixed-team", title: "自选模式", icon: "自选模式", description: "队伍自选 · 仅随机英雄", features: ["支持自定义玩家", "英雄随机分配", "保留原有队伍", "适合固定对抗"] },
  { key: "chaos", title: "大乱斗模式", icon: "大乱斗模式", description: "多人运动 · 自动多组分配", features: ["多人快速分组", "均衡队伍实力", "多余观战位", "适合大乱斗"] },
  { key: "dog", title: "训狗模式", icon: "训狗模式", description: "内有恶犬，生人勿进", features: ["脱敏训练", "定点上厕所", "社会化训练", "卫程豪握手"], fun: true },
];

const LoginView = {
  setup() {
    const router = useRouter();
    const busy = ref(false);
    const errorMessage = ref("");
    const loginForm = reactive({ username: "", password: "" });

    async function handleLogin() {
      busy.value = true;
      errorMessage.value = "";
      try {
        const payload = await api.login(loginForm);
        setSession(payload);
        router.push("/home");
      } catch (error) {
        showError(error);
      } finally {
        busy.value = false;
      }
    }

    return { router, busy, errorMessage, loginForm, handleLogin };
  },
  template: `
    <div class="auth-page auth-page-redesign auth-page-single">
      <div class="auth-panel auth-panel-single">
        <section class="auth-card auth-form-card auth-card-single">
          <div class="auth-badge">系统入口</div>
          <h1 class="auth-title auth-title-single">OW 内战随机分配系统</h1>
          <div class="auth-subtitle auth-subtitle-single">用于管理玩家、随机分队、英雄分配与模式配置</div>

          <div class="auth-section">
            <div class="auth-form-title">登录</div>
            <div class="auth-grid">
              <label class="auth-field">
                <span>用户名</span>
                <input v-model="loginForm.username" class="auth-input" placeholder="输入用户名" autocomplete="off" name="login-username" @keyup.enter="handleLogin" />
              </label>
              <label class="auth-field">
                <span>密码</span>
                <input v-model="loginForm.password" class="auth-input" placeholder="输入密码" type="password" autocomplete="new-password" name="login-password" @keyup.enter="handleLogin" />
              </label>
              <button class="auth-btn auth-btn-primary" :disabled="busy" @click="handleLogin">{{ busy ? '登录中...' : '进入系统' }}</button>
            </div>
          </div>

          <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
          <div class="auth-link-row">
            <span>还没有账号？</span>
            <button class="auth-text-link" type="button" @click="router.push('/register')">前往注册</button>
          </div>
        </section>
      </div>
    </div>
  `,
};

const RegisterView = {
  setup() {
    const router = useRouter();
    const busy = ref(false);
    const errorMessage = ref("");
    const registerForm = reactive({ username: "", nickname: "", password: "", inviteCode: "" });

    async function handleRegister() {
      busy.value = true;
      errorMessage.value = "";
      try {
        await api.register(registerForm);
        const payload = await api.login({ username: registerForm.username, password: registerForm.password });
        setSession(payload);
        router.push("/home");
      } catch (error) {
        showError(error);
      } finally {
        busy.value = false;
      }
    }

    return { router, busy, errorMessage, registerForm, handleRegister };
  },
  template: `
    <div class="auth-page auth-page-redesign auth-page-single">
      <div class="auth-panel auth-panel-single">
        <section class="auth-card auth-form-card auth-card-single">
          <div class="auth-badge">创建账号</div>
          <h1 class="auth-title auth-title-single">注册新用户</h1>
          <div class="auth-subtitle auth-subtitle-single">创建账号后将自动登录并进入系统。新用户初始不写入默认玩家配置，可在系统内自行维护数据。</div>

          <div class="auth-section">
            <div class="auth-form-title">注册</div>
            <div class="auth-grid two">
              <label class="auth-field">
                <span>用户名</span>
                <input v-model="registerForm.username" class="auth-input" placeholder="设置用户名" autocomplete="off" name="register-username" />
              </label>
              <label class="auth-field">
                <span>昵称</span>
                <input v-model="registerForm.nickname" class="auth-input" placeholder="设置昵称" autocomplete="off" name="register-nickname" />
              </label>
              <label class="auth-field auth-span-two">
                <span>密码</span>
                <input v-model="registerForm.password" class="auth-input" placeholder="至少 6 位密码" type="password" autocomplete="new-password" name="register-password" />
              </label>
              <label class="auth-field auth-span-two">
                <span>邀请码</span>
                <input v-model="registerForm.inviteCode" class="auth-input" placeholder="输入内部邀请码" autocomplete="off" name="register-invite-code" />
              </label>
              <button class="auth-btn auth-btn-secondary auth-span-two" :disabled="busy" @click="handleRegister">{{ busy ? '注册中...' : '注册并进入系统' }}</button>
            </div>
          </div>

          <div v-if="errorMessage" class="auth-error">{{ errorMessage }}</div>
          <div class="auth-link-row">
            <span>已经有账号？</span>
            <button class="auth-text-link" type="button" @click="router.push('/login')">返回登录</button>
          </div>
        </section>
      </div>
    </div>
  `,
};

const SettingsModal = {
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "updated"],
  setup(props, { emit }) {
    const loading = ref(false);
    const saving = ref(false);
    const errorMessage = ref("");
    const activeTab = ref("players");
    const searchKeyword = ref("");
    const players = ref([]);
    const summary = reactive({ playerCount: 0, heroCount: 0, mapCount: 0, historyCount: 0 });
    const playerForm = reactive({ name: "", level: 3, preferredRoles: ["T", "C", "N"] });
    const accountForm = reactive({ nickname: "", password: "", confirmPassword: "" });

    const filteredPlayers = computed(() => {
      const keyword = searchKeyword.value.trim().toLowerCase();
      return players.value.filter((player) => !keyword || player.name.toLowerCase().includes(keyword));
    });

    const canSyncFromCatalog = computed(() => session.user?.username && session.user.username !== ADMIN_USERNAME);

    function closeModal() {
      emit("update:modelValue", false);
    }

    function toggleNewPlayerRole(role) {
      const current = normalizePreferredRoles(playerForm.preferredRoles);
      if (current.includes(role)) {
        if (current.length === 1) return alert("至少保留一个位置偏好");
        playerForm.preferredRoles = current.filter((item) => item !== role);
        return;
      }
      playerForm.preferredRoles = current.concat(role);
    }

    function toggleExistingPlayerRole(player, role) {
      const current = normalizePreferredRoles(player.preferredRoles);
      if (current.includes(role)) {
        if (current.length === 1) return alert("至少保留一个位置偏好");
        player.preferredRoles = current.filter((item) => item !== role);
        return;
      }
      player.preferredRoles = current.concat(role);
    }

    function applyPlayers(nextPlayers) {
      players.value = (nextPlayers || []).map(decoratePlayer);
      summary.playerCount = players.value.length;
    }

    async function loadSettings() {
      loading.value = true;
      errorMessage.value = "";
      try {
        const payload = await api.bootstrap();
        applyPlayers(payload.players || []);
        summary.heroCount = (payload.heroes || []).length;
        summary.mapCount = (payload.maps || []).length;
        summary.historyCount = (payload.history || []).length;
        accountForm.nickname = payload.user?.nickname || session.user?.nickname || "";
        accountForm.password = "";
        accountForm.confirmPassword = "";
      } catch (error) {
        showError(error);
      } finally {
        loading.value = false;
      }
    }

    function syncAfterMutation(nextPlayers) {
      applyPlayers(nextPlayers || []);
      emit("updated");
    }

    async function addPlayer() {
      const name = playerForm.name.trim();
      if (!name) return alert("请输入玩家名称");
      saving.value = true;
      errorMessage.value = "";
      try {
        const nextPlayers = await api.addPlayer({
          name,
          level: Number(playerForm.level) || 1,
          preferredRoles: normalizePreferredRoles(playerForm.preferredRoles),
        });
        playerForm.name = "";
        playerForm.level = 3;
        playerForm.preferredRoles = ["T", "C", "N"];
        syncAfterMutation(nextPlayers);
      } catch (error) {
        showError(error);
      } finally {
        saving.value = false;
      }
    }

    async function savePlayer(player) {
      const name = String(player.name || "").trim();
      if (!name) return alert("请输入玩家名称");
      saving.value = true;
      errorMessage.value = "";
      try {
        const nextPlayers = await api.updatePlayer(player.id, {
          name,
          level: Number(player.level) || 1,
          preferredRoles: normalizePreferredRoles(player.preferredRoles),
        });
        syncAfterMutation(nextPlayers);
      } catch (error) {
        showError(error);
      } finally {
        saving.value = false;
      }
    }

    async function removePlayer(id) {
      saving.value = true;
      errorMessage.value = "";
      try {
        const nextPlayers = await api.deletePlayer(id);
        syncAfterMutation(nextPlayers);
      } catch (error) {
        showError(error);
      } finally {
        saving.value = false;
      }
    }

    async function syncMyPlayersFromCatalog() {
      if (!canSyncFromCatalog.value) return alert("默认账号无需同步玩家列表");
      const confirmed = await confirmAction(
        "将主账户 lwz 的玩家列表覆盖同步到当前账号。当前账号现有玩家、敌对关系、专属英雄绑定会被清空，后续修改仍只影响自己的数据。确定继续吗？",
        "同步主账户玩家列表",
      );
      if (!confirmed) return;
      saving.value = true;
      errorMessage.value = "";
      try {
        const payload = await api.syncMyPlayers();
        applyPlayers(payload.players || []);
        summary.heroCount = (payload.heroes || []).length;
        summary.mapCount = (payload.maps || []).length;
        summary.historyCount = (payload.history || []).length;
        emit("updated");
        showSuccess(`已同步 ${Number(payload.syncedCount) || 0} 名玩家`);
      } catch (error) {
        showError(error);
      } finally {
        saving.value = false;
      }
    }
    async function saveAccount() {
      const nickname = String(accountForm.nickname || "").trim();
      const password = String(accountForm.password || "").trim();
      const confirmPassword = String(accountForm.confirmPassword || "").trim();
      if (!nickname) return alert("昵称不能为空");
      if (password && password.length < 6) return alert("密码至少 6 位");
      if (password !== confirmPassword) return alert("两次输入的密码不一致");
      saving.value = true;
      errorMessage.value = "";
      try {
        const payload = await api.updateProfile({ nickname, password });
        updateSessionUser(payload.user);
        accountForm.password = "";
        accountForm.confirmPassword = "";
        emit("updated");
        showSuccess(password ? "账号信息已更新，密码已修改" : "昵称已更新");
      } catch (error) {
        showError(error);
      } finally {
        saving.value = false;
      }
    }

    watch(
      () => props.modelValue,
      (visible) => {
        if (!visible) return;
        activeTab.value = "players";
        searchKeyword.value = "";
        loadSettings();
      },
    );

    return {
      session,
      loading,
      saving,
      errorMessage,
      activeTab,
      searchKeyword,
      players,
      filteredPlayers,
      summary,
      playerForm,
      accountForm,
      canSyncFromCatalog,
      preferredRolesText,
      closeModal,
      toggleNewPlayerRole,
      toggleExistingPlayerRole,
      loadSettings,
      addPlayer,
      savePlayer,
      removePlayer,
      syncMyPlayersFromCatalog,
      saveAccount,
    };
  },
  template: `
    <div v-if="modelValue" class="settings-overlay" @click.self="closeModal">
      <div class="settings-panel">
        <div class="settings-header">
          <div>
            <div class="settings-title">全局设置</div>
          </div>
          <div class="settings-actions">
            <span class="settings-user">{{ session.user?.nickname || session.user?.username }}</span>
            <button class="small-btn btn-green" type="button" :disabled="loading || saving" @click="loadSettings">刷新</button>
            <button class="small-btn btn-red" type="button" @click="closeModal">关闭</button>
          </div>
        </div>

        <div class="settings-tabs">
          <button class="settings-tab" :class="{ active: activeTab === 'players' }" type="button" @click="activeTab = 'players'">玩家池</button>
          <button class="settings-tab" :class="{ active: activeTab === 'account' }" type="button" @click="activeTab = 'account'">账号</button>
          <button class="settings-tab" :class="{ active: activeTab === 'overview' }" type="button" @click="activeTab = 'overview'">概览</button>
        </div>

        <div v-if="errorMessage" class="settings-error">{{ errorMessage }}</div>

        <template v-if="activeTab === 'players'">
          <div class="settings-create-card">
            <div class="settings-toolbar">
              <input v-model="playerForm.name" class="legacy-input settings-name-input" placeholder="玩家名称">
              <select v-model="playerForm.level" class="legacy-select settings-level-select star-level-select">
                <option :value="4">★★★★</option>
                <option :value="3">★★★</option>
                <option :value="2">★★</option>
                <option :value="1">★</option>
              </select>
              <button class="small-btn" type="button" :disabled="saving" @click="addPlayer">{{ saving ? '处理中...' : '新增玩家' }}</button>
            </div>
            <div class="role-picker-row settings-role-picker">
              <span class="role-picker-label">位置偏好：</span>
              <button type="button" class="role-option-btn" :class="{ selected: playerForm.preferredRoles.includes('T') }" @click="toggleNewPlayerRole('T')">T</button>
              <button type="button" class="role-option-btn" :class="{ selected: playerForm.preferredRoles.includes('C') }" @click="toggleNewPlayerRole('C')">C</button>
              <button type="button" class="role-option-btn" :class="{ selected: playerForm.preferredRoles.includes('N') }" @click="toggleNewPlayerRole('N')">N</button>
            </div>
          </div>
          <div class="settings-search-row">
            <input v-model="searchKeyword" class="legacy-input full-width" placeholder="搜索玩家">
          </div>
          <div class="settings-player-list">
            <div v-for="player in filteredPlayers" :key="player.id" class="settings-player-card">
              <div class="settings-player-head">
                <input v-model="player.name" class="legacy-input full-width" placeholder="玩家名称">
                <select v-model="player.level" class="legacy-select settings-level-select settings-card-level star-level-select">
                  <option :value="4">★★★★</option>
                  <option :value="3">★★★</option>
                  <option :value="2">★★</option>
                  <option :value="1">★</option>
                </select>
              </div>
              <div class="settings-player-role-row">
                <div class="settings-player-meta">
                  <span class="settings-preferred">{{ preferredRolesText(player.preferredRoles) }}</span>
                </div>
                <div class="role-selector settings-card-role-selector">
                  <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('T') }" @click="toggleExistingPlayerRole(player, 'T')">T</button>
                  <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('C') }" @click="toggleExistingPlayerRole(player, 'C')">C</button>
                  <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('N') }" @click="toggleExistingPlayerRole(player, 'N')">N</button>
                </div>
              </div>
              <div class="settings-player-actions">
                <button class="small-btn btn-green" type="button" :disabled="saving" @click="savePlayer(player)">保存</button>
                <button class="small-btn btn-red" type="button" :disabled="saving" @click="removePlayer(player.id)">删除</button>
              </div>
            </div>
            <div v-if="loading" class="empty-state">正在加载玩家列表...</div>
            <div v-else-if="!filteredPlayers.length" class="empty-state">没有匹配的玩家</div>
          </div>
        </template>

        <template v-else-if="activeTab === 'account'">
          <div class="settings-account-card">
            <div class="settings-account-body">
              <div class="settings-account-grid">
                <label class="settings-field settings-account-span-two">
                  <span>用户名</span>
                  <input :value="session.user?.username || ''" class="legacy-input settings-input-disabled" disabled />
                </label>
                <label class="settings-field">
                  <span>昵称</span>
                  <input v-model="accountForm.nickname" class="legacy-input" placeholder="请输入昵称" />
                </label>
                <label class="settings-field">
                  <span>新密码</span>
                  <input v-model="accountForm.password" class="legacy-input" type="password" placeholder="留空则不修改" autocomplete="new-password" />
                </label>
                <label class="settings-field settings-account-span-two">
                  <span>确认新密码</span>
                  <input v-model="accountForm.confirmPassword" class="legacy-input" type="password" placeholder="再次输入新密码" autocomplete="new-password" />
                </label>
              </div>
              <div class="settings-account-hint">
                不填写新密码时，仅更新昵称；填写密码时需要至少 6 位。
                <template v-if="canSyncFromCatalog">同步主账户玩家会覆盖当前账号玩家列表，并清空相关敌对关系与专属英雄绑定。</template>
              </div>
              <div class="settings-account-actions">
                <button v-if="canSyncFromCatalog" class="small-btn" type="button" :disabled="saving" @click="syncMyPlayersFromCatalog">{{ saving ? '处理中...' : '同步主账户玩家' }}</button>
                <button class="small-btn btn-green" type="button" :disabled="saving" @click="saveAccount">{{ saving ? '处理中...' : '保存账号信息' }}</button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="settings-overview-grid">
            <div class="settings-overview-card"><div class="settings-overview-label">玩家池</div><div class="settings-overview-value">{{ summary.playerCount }}</div></div>
            <div class="settings-overview-card"><div class="settings-overview-label">英雄池</div><div class="settings-overview-value">{{ summary.heroCount }}</div></div>
            <div class="settings-overview-card"><div class="settings-overview-label">地图池</div><div class="settings-overview-value">{{ summary.mapCount }}</div></div>
            <div class="settings-overview-card"><div class="settings-overview-label">最近记录</div><div class="settings-overview-value">{{ summary.historyCount }}</div></div>
          </div>
          <div class="settings-hint-card">
            玩家在这里新增、删除或改名后，工作台会重新拉取列表。
            当前已经不存在的玩家会自动从已选列表里清掉，避免页面状态不一致。
          </div>
        </template>
      </div>
    </div>
  `,
};

const AdminView = {
  setup() {
    const router = useRouter();
    const loading = ref(false);
    const saving = ref(false);
    const errorMessage = ref("");
    const successMessage = ref("");
    const activeTab = ref("users");
    const users = ref([]);
    const heroes = ref([]);
    const maps = ref([]);
    const canManageCatalog = computed(() => session.user?.username === ADMIN_USERNAME);
    const userForm = reactive({ username: "", nickname: "", password: "" });
    const heroForm = reactive({ roleCode: "T", name: "" });
    const mapForm = reactive({ name: "" });

    const summaryCards = computed(() => ([
      { label: "用户数", value: users.value.length },
      { label: "英雄数", value: heroes.value.length },
      { label: "地图数", value: maps.value.length },
    ]));

    function syncDashboard(payload) {
      users.value = (payload.users || []).map((user) => ({ ...user, draftPassword: "" }));
      heroes.value = payload.heroes || [];
      maps.value = payload.maps || [];
    }

    async function loadDashboard() {
      if (!canManageCatalog.value) return;
      loading.value = true;
      errorMessage.value = "";
      try {
        const payload = await api.adminDashboard();
        syncDashboard(payload);
      } catch (error) {
        showError(error);
      } finally {
        loading.value = false;
      }
    }

    async function runMutation(action, successText) {
      saving.value = true;
      errorMessage.value = "";
      successMessage.value = "";
      try {
        const payload = await action();
        syncDashboard(payload);
        const noticeText = typeof successText === "function" ? successText(payload) : successText;
        if (noticeText) showSuccess(noticeText);
        return payload;
      } catch (error) {
        showError(error);
        return null;
      } finally {
        saving.value = false;
      }
    }

    async function createUser() {
      const username = userForm.username.trim();
      const nickname = userForm.nickname.trim();
      const password = userForm.password.trim();
      if (!username || !nickname || !password) return alert("请填写用户名、昵称和密码");
      if (password.length < 6) return alert("密码至少 6 位");
      await runMutation(() => api.createUser({ username, nickname, password }), "用户已创建");
      userForm.username = "";
      userForm.nickname = "";
      userForm.password = "";
    }

    async function saveUser(user) {
      const nickname = String(user.nickname || "").trim();
      const password = String(user.draftPassword || "").trim();
      if (!nickname) return alert("昵称不能为空");
      await runMutation(
        () => api.updateUser(user.id, { nickname, password }),
        password ? `已更新 ${user.username}，并重置密码` : `已更新 ${user.username}`,
      );
    }

    async function removeUser(user) {
      if (user.isSharedCatalog) return alert("默认账号不允许删除");
      if (!await confirmAction(`确定删除用户 ${user.username} 吗？`)) return;
      await runMutation(() => api.deleteUser(user.id), `已删除 ${user.username}`);
    }

    async function syncUserPlayers(user) {
      if (user.isSharedCatalog) return alert("默认账号无需同步玩家列表");
      const confirmed = await confirmAction(
        `将 lwz 的玩家列表覆盖同步给 ${user.username}。该用户现有玩家、敌对关系、专属英雄绑定会被清空，后续修改仍只影响自己的数据。确定继续吗？`,
        "同步玩家列表",
      );
      if (!confirmed) return;
      await runMutation(
        () => api.syncUserPlayers(user.id),
        (payload) => `已向 ${user.username} 同步 ${Number(payload.syncedCount) || 0} 名玩家`,
      );
    }

    async function createHero() {
      const name = heroForm.name.trim();
      if (!name) return alert("请输入英雄名称");
      await runMutation(() => api.createAdminHero({ roleCode: heroForm.roleCode, name }), "英雄已添加");
      heroForm.name = "";
      heroForm.roleCode = "T";
    }

    async function removeHero(hero) {
      if (!await confirmAction(`确定删除英雄 ${hero.displayName} 吗？`)) return;
      await runMutation(() => api.deleteAdminHero(hero.id), `已删除英雄 ${hero.displayName}`);
    }

    async function createMap() {
      const name = mapForm.name.trim();
      if (!name) return alert("请输入地图名称");
      await runMutation(() => api.createAdminMap({ name }), "地图已添加");
      mapForm.name = "";
    }

    async function removeMap(map) {
      if (!await confirmAction(`确定删除地图 ${map.name} 吗？`)) return;
      await runMutation(() => api.deleteAdminMap(map.id), `已删除地图 ${map.name}`);
    }

    onMounted(loadDashboard);

    return {
      router,
      session,
      loading,
      saving,
      errorMessage,
      successMessage,
      activeTab,
      users,
      heroes,
      maps,
      userForm,
      heroForm,
      mapForm,
      canManageCatalog,
      summaryCards,
      loadDashboard,
      createUser,
      saveUser,
      removeUser,
      syncUserPlayers,
      createHero,
      removeHero,
      createMap,
      removeMap,
    };
  },
  template: `
    <div class="admin-page">
      <div class="admin-shell">
        <div class="admin-topbar">
          <button class="admin-nav-btn" type="button" @click="router.push('/home')">返回首页</button>
          <div class="admin-topbar-right">
            <div class="admin-user-chip">{{ session.user?.nickname || session.user?.username }}</div>
            <button class="admin-nav-btn admin-nav-btn-muted" type="button" @click="loadDashboard" :disabled="loading || saving">刷新</button>
          </div>
        </div>

        <section class="admin-hero-panel">
          <div>
            <div class="admin-kicker">Control Center</div>
            <h1 class="admin-title">用户 / 地图 / 英雄管理台</h1>
          </div>
          <div class="admin-summary-grid">
            <div v-for="card in summaryCards" :key="card.label" class="admin-summary-card">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
            </div>
          </div>
        </section>


        <div v-if="!canManageCatalog" class="admin-locked-card">
          当前账号没有管理权限，仅默认账号 lwz 可以访问这个页面。
        </div>

        <template v-else>
          <div class="admin-main">
            <div class="admin-tabs">
              <button class="admin-tab" :class="{ active: activeTab === 'users' }" type="button" @click="activeTab = 'users'">用户管理</button>
              <button class="admin-tab" :class="{ active: activeTab === 'heroes' }" type="button" @click="activeTab = 'heroes'">英雄管理</button>
              <button class="admin-tab" :class="{ active: activeTab === 'maps' }" type="button" @click="activeTab = 'maps'">地图管理</button>
            </div>

            <section v-if="activeTab === 'users'" class="admin-section-grid admin-section-grid-narrow admin-section-grid-users">
            <div class="admin-card admin-create-card">
              <div class="admin-card-title">创建新用户</div>
              <div class="admin-form-grid compact">
                <input v-model="userForm.username" class="auth-input" placeholder="用户名" autocomplete="off" autocapitalize="off" spellcheck="false" name="admin-create-username" />
                <input v-model="userForm.nickname" class="auth-input" placeholder="昵称" autocomplete="off" autocapitalize="off" spellcheck="false" name="admin-create-nickname" />
                <input v-model="userForm.password" class="auth-input admin-span-two" placeholder="密码，至少 6 位" type="password" autocomplete="new-password" spellcheck="false" name="admin-create-password" />
              </div>
              <button class="auth-btn auth-btn-primary admin-submit-btn" type="button" :disabled="saving" @click="createUser">{{ saving ? '处理中...' : '创建用户' }}</button>
            </div>

            <div class="admin-card admin-list-card">
              <div class="admin-card-title">用户列表</div>
              <div class="admin-user-list">
                <div v-for="user in users" :key="user.id" class="admin-user-card">
                  <div class="admin-user-head">
                    <div>
                      <div class="admin-user-name">{{ user.username }}</div>
                      <div class="admin-user-meta">昵称：{{ user.nickname }} · 玩家 {{ user.playerCount }} · 记录 {{ user.historyCount }}</div>
                    </div>
                    <span class="admin-user-tag" v-if="user.isSharedCatalog">默认账号</span>
                  </div>
                  <div class="admin-form-grid compact">
                    <input v-model="user.nickname" class="auth-input" placeholder="昵称" />
                    <input v-model="user.draftPassword" class="auth-input" placeholder="留空则不改密码" type="password" />
                  </div>
                  <div class="admin-card-actions">
                    <button class="auth-btn auth-btn-primary" type="button" :disabled="saving" @click="saveUser(user)">保存</button>
                    <button v-if="!user.isSharedCatalog" class="auth-btn auth-btn-primary" type="button" :disabled="saving" @click="syncUserPlayers(user)">同步玩家</button>
                    <button class="auth-btn auth-btn-secondary" type="button" :disabled="saving || user.isSharedCatalog" @click="removeUser(user)">删除</button>
                  </div>
                </div>
                <div v-if="!users.length && !loading" class="empty-state">暂无用户</div>
              </div>
            </div>
          </section>

          <section v-else-if="activeTab === 'heroes'" class="admin-section-grid admin-section-grid-narrow">
            <div class="admin-card admin-create-card">
              <div class="admin-card-title">新增英雄</div>
              <div class="admin-form-grid hero-grid">
                <select v-model="heroForm.roleCode" class="auth-input">
                  <option value="T">坦克</option>
                  <option value="C">输出</option>
                  <option value="N">辅助</option>
                </select>
                <input v-model="heroForm.name" class="auth-input" placeholder="英雄名称" />
              </div>
              <button class="auth-btn auth-btn-primary admin-submit-btn" type="button" :disabled="saving" @click="createHero">{{ saving ? '处理中...' : '添加英雄' }}</button>
            </div>
            <div class="admin-card admin-list-card">
              <div class="admin-card-title">共享英雄池</div>
              <div class="admin-resource-list">
                <div v-for="hero in heroes" :key="hero.id" class="admin-resource-item">
                  <span class="admin-resource-name">{{ hero.displayName }}</span>
                  <button class="auth-btn auth-btn-secondary admin-inline-btn" type="button" :disabled="saving" @click="removeHero(hero)">删除</button>
                </div>
                <div v-if="!heroes.length && !loading" class="empty-state">暂无英雄</div>
              </div>
            </div>
          </section>

          <section v-else class="admin-section-grid admin-section-grid-narrow">
            <div class="admin-card admin-create-card">
              <div class="admin-card-title">新增地图</div>
              <div class="admin-form-grid one-column">
                <input v-model="mapForm.name" class="auth-input" placeholder="地图名称" />
              </div>
              <button class="auth-btn auth-btn-primary admin-submit-btn" type="button" :disabled="saving" @click="createMap">{{ saving ? '处理中...' : '添加地图' }}</button>
            </div>
            <div class="admin-card admin-list-card">
              <div class="admin-card-title">共享地图池</div>
              <div class="admin-resource-list">
                <div v-for="map in maps" :key="map.id" class="admin-resource-item">
                  <span class="admin-resource-name">{{ map.name }}</span>
                  <button class="auth-btn auth-btn-secondary admin-inline-btn" type="button" :disabled="saving" @click="removeMap(map)">删除</button>
                </div>
                <div v-if="!maps.length && !loading" class="empty-state">暂无地图</div>
              </div>
            </div>
          </section>
          </div>
        </template>
      </div>
    </div>
  `,
};
const LandingView = {
  components: { SettingsModal },
  setup() {
    const router = useRouter();
    const showSettings = ref(false);
    const chatBusy = ref(false);
    const canManageCatalog = computed(() => session.user?.username === ADMIN_USERNAME);

    async function openRandomChatFromHome() {
      chatBusy.value = true;
      try {
        const payload = await api.bootstrap();
        storeRandomChatContext(payload);
        router.push("/chat/random-v2");
      } catch (error) {
        showError(error);
      } finally {
        chatBusy.value = false;
      }
    }

    function goMode(mode) {
      router.push(mode.fun ? `/fun/${mode.key}` : `/mode/${mode.key}`);
    }

    function openSettings() { showSettings.value = true; }
    function openAdmin() { router.push("/admin"); }
    function logout() { clearSession(); router.push("/login"); }
    return { session, showSettings, canManageCatalog, chatBusy, goMode, openRandomChatFromHome, openSettings, openAdmin, logout, cards: MODE_CARDS };
  },
  template: `
    <div class="home-page">
      <div class="home-shell home-shell-legacy">
        <div class="home-userbar legacy-userbar">
          <div class="home-user-chip">{{ session.user?.nickname || session.user?.username }}</div>
          <button type="button" class="home-chat-btn" :disabled="chatBusy" @click="openRandomChatFromHome">{{ chatBusy ? '跳转中...' : '聊天生成' }}</button>
          <button v-if="canManageCatalog" type="button" class="admin-entry-btn" @click="openAdmin">管理台</button>
          <button type="button" class="settings-gear-btn" @click="openSettings" aria-label="打开全局设置">⚙</button>
          <button type="button" @click="logout">退出登录</button>
        </div>
        <div class="home-header">
          <div class="home-logo">这是小分队</div>
          <div class="home-title">OW INNER WAR</div>
          <div class="home-subtitle">选择命运 · 进入战场</div>
        </div>
        <div class="mode-selection">
          <div v-for="mode in cards" :key="mode.key" class="mode-card" @click="goMode(mode)">
            <div class="mode-icon">{{ mode.icon }}</div>
            <div class="mode-title">{{ mode.title }}</div>
            <div class="mode-description">{{ mode.description }}</div>
            <ul class="mode-features">
              <li v-for="feature in mode.features" :key="feature">{{ feature }}</li>
            </ul>
            <button class="mode-btn" type="button">ENTER</button>
          </div>
        </div>
        <SettingsModal v-model="showSettings" />
      </div>
      <div class="home-footer">2026 小分队</div>
    </div>
  `,
};

const ChatRandomModeView = {
  setup() {
    const router = useRouter();
    const ready = ref(false);
    const context = ref(null);
    const messages = ref([]);
    const inputMessage = ref("");
    const busy = ref(false);
    const resultPayload = ref(null);
    const chatThreadRef = ref(null);
    const canSend = computed(() => !!inputMessage.value.trim() && !!context.value && !busy.value);
    const chatStatusText = computed(() => {
      if (!ready.value) return "正在加载上下文...";
      if (busy.value) return "正在调用小分队agent...";
      if (!context.value) return "等待从首页进入";
      return "等待输入";
    });
    const chatStatusClass = computed(() => (busy.value ? "is-busy" : "is-idle"));

    function seedWelcomeMessage() {
      messages.value = [{
        role: "assistant",
        content: "这里是全随机模式聊天生成页。当前页面会把你的对话发送给小分队agent + skill 解析，你可以直接告诉我参赛玩家和要求，例如：玩家1、玩家2……玩家10，开启随机模式，不允许重复英雄。",
      }];
    }

    function restoreContext() {
      const raw = sessionStorage.getItem(RANDOM_MODE_CHAT_CONTEXT_KEY);
      sessionStorage.removeItem(RANDOM_MODE_CHAT_CONTEXT_KEY);
      if (!raw) {
        ready.value = true;
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.mode === "random-v2") {
          context.value = parsed;
          seedWelcomeMessage();
        }
      } catch {
        context.value = null;
      }
      ready.value = true;
    }

    function buildResolvedPlayers(resolution) {
      const playerMap = new Map((context.value?.players || []).map((player) => [player.name, decoratePlayer(player)]));
      return (resolution.playerNames || [])
        .map((name) => {
          const player = playerMap.get(name);
          if (!player) return null;
          const override = resolution.preferredRoleOverrides?.[name];
          const normalized = override ? normalizePreferredRoles(override) : normalizePreferredRoles(player.preferredRoles || player.preferredRole);
          return {
            ...player,
            preferredRoles: normalized,
            preferredRole: normalized,
          };
        })
        .filter(Boolean);
    }

    function getGreetingReply(content) {
      const text = String(content || "").trim();
      if (!text) return "";
      if (/^(你好|你好啊|您好|嗨|哈喽|hello|hi)$/i.test(text)) {
        return "你好，我在。你可以先随便描述想法，等你准备好玩家名单和规则后，我再帮你生成全随机结果。";
      }
      if (/^(跟我打招呼|和我打个招呼|先打个招呼)$/i.test(text)) {
        return "你好，很高兴见到你。你不用急着给名单，想好了人数、玩家和规则后再告诉我就行。";
      }
      return "";
    }

    function scrollChatToBottom() {
      const element = chatThreadRef.value;
      if (!element) return;
      element.scrollTop = element.scrollHeight;
    }

    async function submitChat() {
      const content = inputMessage.value.trim();
      if (!content || !context.value || busy.value) return;

      messages.value = messages.value.concat({ role: "user", content });
      inputMessage.value = "";
      const greetingReply = getGreetingReply(content);
      if (greetingReply) {
        messages.value = messages.value.concat({ role: "assistant", content: greetingReply });
        return;
      }
      busy.value = true;
      resultPayload.value = null;

      try {
        const payload = await api.chatRandomMode({
          messages: messages.value,
          context: context.value,
        });
        const resolution = payload.resolution || {};
        messages.value = messages.value.concat({
          role: "assistant",
          content: (resolution.questions || []).length
            ? resolution.questions.join("\n")
            : `已识别 ${resolution.playerNames?.length || 0} 名玩家：${(resolution.playerNames || []).join("、")}`,
        });

        if (resolution.needsConfirmation) {
          return;
        }

        const result = buildRandomModeResult({
          players: buildResolvedPlayers(resolution),
          rivals: context.value.rivals || [],
          binds: context.value.binds || [],
          heroes: context.value.heroes || [],
          maps: context.value.maps || [],
          allowRepeatHeroes: resolution.allowRepeatHeroes,
          autoAssignHeroes: resolution.autoAssignHeroes,
          normalizePreferredRoles,
        });

        if (result.error) {
          messages.value = messages.value.concat({ role: "assistant", content: result.error });
          return;
        }

        resultPayload.value = result.payload;
        if (result.payload.summary?.warning) {
          messages.value = messages.value.concat({ role: "assistant", content: result.payload.summary.warning });
        }
      } catch (error) {
        messages.value = messages.value.concat({ role: "assistant", content: resolveMessage(error, "聊天生成失败") });
      } finally {
        busy.value = false;
      }
    }

    function resetChat() {
      resultPayload.value = null;
      inputMessage.value = "";
      if (context.value) {
        seedWelcomeMessage();
      } else {
        messages.value = [];
      }
    }

    function initialize() {
      restoreContext();
    }

    watch(
      () => messages.value.length,
      async () => {
        await nextTick();
        scrollChatToBottom();
      },
    );

    watch(
      () => busy.value,
      async () => {
        await nextTick();
        scrollChatToBottom();
      },
    );

    onMounted(initialize);

    return {
      router,
      ready,
      context,
      messages,
      inputMessage,
      busy,
      resultPayload,
      chatThreadRef,
      canSend,
      chatStatusText,
      chatStatusClass,
      roleLabel,
      preferredRolesEmoji,
      sortedTeam,
      submitChat,
      resetChat,
    };
  },
  template: `
    <div class="chat-random-page">
      <div class="chat-random-shell">
        <div class="chat-random-topbar">
          <button class="back-home-btn" type="button" @click="router.push('/home')">返回首页</button>
          <div class="chat-random-badge">全随机模式聊天生成</div>
          <button class="small-btn" type="button" @click="router.push('/mode/random-v2')">去全随机页</button>
        </div>

        <div v-if="!ready" class="chat-random-empty">正在加载聊天上下文...</div>

        <div v-else-if="!context" class="chat-random-empty">
          <div class="chat-random-empty-title">请从首页右上角的“聊天生成”按钮进入</div>
          <div class="chat-random-empty-desc">当前页面不保留历史记录，刷新或直接访问时不会自动恢复上一次上下文。</div>
          <div class="chat-random-empty-actions">
            <button class="legacy-btn" type="button" @click="router.push('/home')">回到首页</button>
          </div>
        </div>

        <div v-else class="chat-random-layout">
          <section class="chat-panel">
            <div class="chat-panel-header">
              <div>
                <h2>聊天生成</h2>
                <p>只支持全随机模式，不保存聊天历史。</p>
              </div>
              <div class="chat-panel-meta">
                <span class="chat-meta-chip">小分队agent 已接入</span>
                <span class="chat-meta-chip chat-status-chip" :class="chatStatusClass">{{ chatStatusText }}</span>
                <span class="chat-meta-chip">玩家池 {{ context.players.length }}</span>
                <span class="chat-meta-chip">英雄池 {{ context.heroes.length }}</span>
              </div>
            </div>

            <div ref="chatThreadRef" class="chat-thread">
              <div v-for="(message, index) in messages" :key="index" class="chat-message" :class="'chat-message-' + message.role">
                <div class="chat-message-role">{{ message.role === 'assistant' ? '系统' : '你' }}</div>
                <div class="chat-message-content">{{ message.content }}</div>
              </div>
              <div v-if="busy" class="chat-message chat-message-assistant chat-message-loading">
                <div class="chat-message-role">系统</div>
                <div class="chat-message-content">
                  <span class="chat-loading-text">正在调用小分队agent 和模型生成结果</span>
                  <span class="chat-loading-dots"><span></span><span></span><span></span></span>
                </div>
              </div>
            </div>

            <div class="chat-input-box">
              <textarea
                v-model="inputMessage"
                class="legacy-textarea chat-input-textarea"
                placeholder="例如：玩家1、玩家2……玩家10，开启随机模式，不允许重复英雄，玩家3走奶。"
                @keydown.enter.exact.prevent="submitChat"
              ></textarea>
              <div class="chat-input-actions">
                <button class="small-btn btn-red" type="button" @click="resetChat">清空会话</button>
                <button class="legacy-btn" type="button" :disabled="!canSend" @click="submitChat">{{ busy ? '生成中...' : '发送并生成' }}</button>
              </div>
            </div>
          </section>

          <section class="chat-result-panel">
            <div class="chat-result-header">
              <h3>生成结果</h3>
              <p>只在当前页面展示，不写入历史记录。</p>
            </div>

            <div v-if="!resultPayload" class="chat-result-empty">
              生成成功后会在这里展示地图、A/B 队结果以及位置信息。
            </div>

            <div v-else class="chat-result-card">
              <div class="chat-result-map">地图：{{ resultPayload.selectedMap?.name || resultPayload.selectedMap || '未配置' }}</div>
              <div class="chat-result-summary">
                <span class="chat-meta-chip">人数 {{ resultPayload.summary?.totalPlayers || 0 }}</span>
                <span class="chat-meta-chip">队伍规模 {{ resultPayload.summary?.teamSize || 0 }}v{{ resultPayload.summary?.teamSize || 0 }}</span>
                <span class="chat-meta-chip">分差 {{ resultPayload.summary?.levelGap || 0 }}</span>
                <span class="chat-meta-chip">{{ resultPayload.summary?.autoAssignHeroes ? '已分配英雄' : '仅分队' }}</span>
              </div>

              <table class="result-table">
                <thead>
                  <tr v-if="!resultPayload.summary?.autoAssignHeroes"><th>队伍</th><th>玩家</th><th>偏好位置</th></tr>
                  <tr v-else><th>队伍</th><th>玩家</th><th>英雄</th><th>位置</th><th>偏好</th></tr>
                </thead>
                <tbody>
                  <template v-for="player in sortedTeam(resultPayload.teams.teamA)" :key="'ca-' + player.id">
                    <tr class="teamA-row">
                      <td>A 队</td>
                      <td>{{ player.name }}</td>
                      <template v-if="!resultPayload.summary?.autoAssignHeroes"><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                      <template v-else><td>{{ player.hero?.name || '-' }}</td><td>{{ player.hero?.roleCode ? roleLabel(player.hero.roleCode) : '-' }}</td><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                    </tr>
                  </template>
                  <template v-for="player in sortedTeam(resultPayload.teams.teamB)" :key="'cb-' + player.id">
                    <tr class="teamB-row">
                      <td>B 队</td>
                      <td>{{ player.name }}</td>
                      <template v-if="!resultPayload.summary?.autoAssignHeroes"><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                      <template v-else><td>{{ player.hero?.name || '-' }}</td><td>{{ player.hero?.roleCode ? roleLabel(player.hero.roleCode) : '-' }}</td><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  `,
};

const DogView = {
  setup() {
    const router = useRouter();
    const storageKey = "hero-randomizer-dog-training";
    const playerName = ref("");
    const gameSize = ref(12);
    const players = ref([]);
    const currentGamePlayers = ref([]);
    const waitingPlayers = ref([]);
    const gameHistory = ref([]);
    const gameNumber = ref(0);

    function snapshot() {
      return {
        gameSize: Number(gameSize.value) || 12,
        players: players.value,
        currentGamePlayers: currentGamePlayers.value.map((player) => player.id),
        waitingPlayers: waitingPlayers.value.map((player) => player.id),
        gameHistory: gameHistory.value,
        gameNumber: gameNumber.value,
      };
    }

    function persist() {
      localStorage.setItem(storageKey, JSON.stringify(snapshot()));
    }

    function restore() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        players.value = Array.isArray(parsed.players) ? parsed.players : [];
        gameSize.value = Number(parsed.gameSize) || 12;
        gameHistory.value = Array.isArray(parsed.gameHistory) ? parsed.gameHistory : [];
        gameNumber.value = Number(parsed.gameNumber) || 0;
        const playerMap = new Map(players.value.map((player) => [player.id, player]));
        currentGamePlayers.value = Array.isArray(parsed.currentGamePlayers) ? parsed.currentGamePlayers.map((id) => playerMap.get(id)).filter(Boolean) : [];
        waitingPlayers.value = Array.isArray(parsed.waitingPlayers) ? parsed.waitingPlayers.map((id) => playerMap.get(id)).filter(Boolean) : [];
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    function nextPlayerId() {
      return players.value.length ? Math.max(...players.value.map((player) => Number(player.id) || 0)) + 1 : 1;
    }

    function addDogPlayer() {
      const name = playerName.value.trim();
      if (!name) return alert("请输入玩家名称");
      if (players.value.some((player) => player.name === name)) return alert("该玩家已存在");
      players.value = players.value.concat({ id: nextPlayerId(), name, gameCount: 0, waitCount: 0 });
      playerName.value = "";
      persist();
    }

    function removeDogPlayer(id) {
      players.value = players.value.filter((player) => player.id !== id);
      currentGamePlayers.value = currentGamePlayers.value.filter((player) => player.id !== id);
      waitingPlayers.value = waitingPlayers.value.filter((player) => player.id !== id);
      persist();
    }

    function recordGameHistory() {
      const record = {
        gameNumber: gameNumber.value,
        players: currentGamePlayers.value.map((player) => ({ id: player.id, name: player.name })),
        waiting: waitingPlayers.value.map((player) => ({ id: player.id, name: player.name })),
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      };
      gameHistory.value = [record].concat(gameHistory.value);
    }

    function startDogGame() {
      if (players.value.length < gameSize.value) return alert(`玩家数量不足，需要至少 ${gameSize.value} 名玩家，当前只有 ${players.value.length} 名玩家`);
      gameNumber.value += 1;
      const sortedPlayers = players.value.slice().sort((left, right) => {
        if (left.gameCount === right.gameCount) return left.waitCount - right.waitCount;
        return left.gameCount - right.gameCount;
      });
      currentGamePlayers.value = sortedPlayers.slice(0, gameSize.value);
      waitingPlayers.value = sortedPlayers.slice(gameSize.value);
      currentGamePlayers.value.forEach((player) => { player.gameCount += 1; });
      waitingPlayers.value.forEach((player) => { player.waitCount += 1; });
      recordGameHistory();
      persist();
    }

    function nextDogGame() {
      const playersToSwap = players.value.length - gameSize.value;
      if (playersToSwap <= 0) {
        startDogGame();
        return;
      }
      const sortedCurrentPlayers = currentGamePlayers.value.slice().sort((left, right) => right.gameCount - left.gameCount);
      const sortedWaitingPlayers = waitingPlayers.value.slice().sort((left, right) => left.gameCount - right.gameCount);
      const playersToRemove = sortedCurrentPlayers.slice(0, playersToSwap);
      const playersToAdd = sortedWaitingPlayers.slice(0, playersToSwap);
      playersToRemove.forEach((player) => {
        currentGamePlayers.value = currentGamePlayers.value.filter((item) => item.id !== player.id);
        waitingPlayers.value = waitingPlayers.value.concat(player);
      });
      playersToAdd.forEach((player) => {
        waitingPlayers.value = waitingPlayers.value.filter((item) => item.id !== player.id);
        currentGamePlayers.value = currentGamePlayers.value.concat(player);
      });
      currentGamePlayers.value.forEach((player) => { player.gameCount += 1; });
      waitingPlayers.value.forEach((player) => { player.waitCount += 1; });
      gameNumber.value += 1;
      recordGameHistory();
      persist();
    }

    async function resetDogGame() {
      if (!await confirmAction("确定要重置训狗模式中的所有数据吗？", "重置确认")) return;
      players.value = players.value.map((player) => ({ ...player, gameCount: 0, waitCount: 0 }));
      currentGamePlayers.value = [];
      waitingPlayers.value = [];
      gameHistory.value = [];
      gameNumber.value = 0;
      persist();
    }

    function handleDogEnter(event) {
      if (event.key === "Enter") addDogPlayer();
    }

    const canStart = computed(() => players.value.length >= gameSize.value);
    const hasDogResult = computed(() => currentGamePlayers.value.length || waitingPlayers.value.length || gameHistory.value.length);

    restore();

    return {
      router, playerName, gameSize, players, currentGamePlayers, waitingPlayers, gameHistory, gameNumber, canStart, hasDogResult,
      addDogPlayer, removeDogPlayer, startDogGame, nextDogGame, resetDogGame, handleDogEnter,
    };
  },
  template: `
    <div class="legacy-page chaos-theme dog-training-page">
      <button class="back-home-btn" type="button" @click="router.push('/home')">返回首页</button>
      <div class="legacy-container dog-training-shell">
        <div class="dog-training-header">
          <h2>小分队训狗基地</h2>
          <div class="subtitle">自定义参赛人数，智能轮换，确保每个人上场次数平均</div>
        </div>

        <div class="dog-panel">
          <div class="dog-panel-title">参赛人员设置</div>
          <div class="dog-input-group">
            <div class="dog-input-item">
              <label>游戏模式</label>
              <select v-model="gameSize">
                <option :value="10">5v5</option>
                <option :value="12">6v6</option>
              </select>
            </div>
            <div class="dog-input-item dog-input-grow">
              <label>添加玩家名称</label>
              <input v-model="playerName" type="text" placeholder="输入玩家名称" @keypress="handleDogEnter">
            </div>
            <div class="dog-input-item dog-input-btn">
              <label>&nbsp;</label>
              <button class="dog-btn dog-btn-primary" type="button" @click="addDogPlayer">添加玩家</button>
            </div>
            <div class="dog-input-item">
              <label>当前参赛人数</label>
              <div class="dog-counter-box">{{ players.length }} 人</div>
            </div>
          </div>

          <div class="dog-player-list">
            <div v-for="player in players" :key="player.id" class="dog-player-item">
              <div class="dog-player-main">
                <div class="dog-player-name">{{ player.name }}</div>
                <div class="dog-player-stats">上场 {{ player.gameCount }} 局 · 等待 {{ player.waitCount }} 次</div>
              </div>
              <button class="dog-remove-player" type="button" @click="removeDogPlayer(player.id)">×</button>
            </div>
            <div v-if="!players.length" class="empty-state">暂无玩家，请添加玩家</div>
          </div>

          <div class="dog-input-group dog-action-group">
            <div class="dog-input-item">
              <button class="dog-btn dog-btn-success" type="button" :disabled="!canStart" @click="startDogGame">开始游戏</button>
            </div>
            <div class="dog-input-item">
              <button class="dog-btn dog-btn-secondary" type="button" @click="resetDogGame">重置所有数据</button>
            </div>
          </div>
        </div>

        <div v-if="hasDogResult" class="dog-game-results">
          <div class="dog-game-layout">
            <div class="dog-left-content">
              <div class="dog-current-game">
                <div class="dog-team-panel dog-team-playing">
                  <div class="dog-team-title">上场玩家 <span class="dog-count-badge">{{ currentGamePlayers.length }}人</span></div>
                  <ul class="dog-team-list">
                    <li v-for="player in currentGamePlayers" :key="'play-' + player.id" class="playing">
                      <span>{{ player.name }}</span>
                      <span class="dog-player-game-count">{{ player.gameCount }}局</span>
                    </li>
                    <li v-if="!currentGamePlayers.length" class="dog-team-empty">暂无上场玩家</li>
                  </ul>
                </div>
                <div class="dog-team-panel dog-team-waiting">
                  <div class="dog-team-title">等待玩家 <span class="dog-count-badge">{{ waitingPlayers.length }}人</span></div>
                  <ul class="dog-team-list">
                    <li v-for="player in waitingPlayers" :key="'wait-' + player.id" class="waiting">
                      <span>{{ player.name }}</span>
                      <span class="dog-player-game-count">{{ player.gameCount }}局</span>
                    </li>
                    <li v-if="!waitingPlayers.length" class="dog-team-empty">当前没有等待玩家</li>
                  </ul>
                </div>
              </div>
              <div class="dog-input-group dog-action-group dog-next-group">
                <div class="dog-input-item">
                  <button class="dog-btn dog-btn-success" type="button" :disabled="!canStart" @click="nextDogGame">再开一把（自动交换玩家）</button>
                </div>
              </div>
            </div>

            <div class="dog-right-history">
              <div class="dog-history-title">游戏历史记录</div>
              <div class="dog-history-list">
                <div v-for="record in gameHistory" :key="'history-' + record.gameNumber + '-' + record.timestamp" class="dog-history-item">
                  <div class="dog-history-item-header">
                    <span>第 {{ record.gameNumber }} 局</span>
                    <span>{{ record.timestamp }}</span>
                  </div>
                  <div class="dog-history-line"><strong>上场:</strong> {{ record.players.map((player) => player.name).join('，') }}</div>
                  <div class="dog-history-line"><strong>等待:</strong> {{ record.waiting.length ? record.waiting.map((player) => player.name).join('，') : '无' }}</div>
                </div>
                <div v-if="!gameHistory.length" class="empty-state">暂无游戏历史记录</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="footer">小分队出品</div>
    </div>
  `,
};
function workspaceSetup() {
  const route = useRoute();
  const router = useRouter();

  const bootstrap = reactive({ user: null, players: [], chaosPlayers: [], heroes: [], maps: [], rivals: [], binds: [], history: [] });
  const randomPlayerForm = reactive({ name: "", level: 3, preferredRoles: ["T", "C", "N"] });
  const randomSearch = ref("");
  const heroInput = ref("");
  const mapInput = ref("");
  const allowRepeat = ref(true);
  const randomHero = ref(true);
  const selectedIds = ref([]);
  const showRivalModal = ref(false);
  const showSettings = ref(false);
  const canManageCatalog = computed(() => session.user?.username === ADMIN_USERNAME);
  const rivalForm = reactive({ player1Id: "", player2Id: "" });
  const bindForm = reactive({ playerId: "", heroId: "" });
  const resultModal = ref(null);
  const rollText = ref("分配中...");

  const fixedNameInput = ref("");
  const fixedLevel = ref(3);
  const manualTeams = reactive({});

  const chaosSearch = ref("");
  const chaosSelectedNames = ref([]);
  const chaosTeamSize = ref(6);
  const chaosLoading = ref(false);
  const chaosResult = ref(null);

  const modeKey = computed(() => String(route.params.mode || "random-v2"));
  const isRandomMode = computed(() => modeKey.value === "random-v2");
  const isAdvancedMode = computed(() => modeKey.value === "random-v2");
  const isFixedMode = computed(() => modeKey.value === "fixed-team");
  const isChaosMode = computed(() => modeKey.value === "chaos");
  const pageTitle = computed(() => {
    if (modeKey.value === "random-v2") return "OW 内战工具 - 全随机 2.0";
    if (modeKey.value === "fixed-team") return "OW 内战工具 - 固定队随机英雄";
    return "OW 内战 - 大乱斗";
  });

  const selectedPlayers = computed(() => {
    const playerMap = new Map(bootstrap.players.map((player) => [player.id, player]));
    return selectedIds.value.map((id) => playerMap.get(id)).filter(Boolean);
  });

  const availableRandomPlayers = computed(() => {
    const keyword = randomSearch.value.trim().toLowerCase();
    return bootstrap.players
      .filter((player) => !selectedIds.value.includes(player.id))
      .filter((player) => !keyword || player.name.toLowerCase().includes(keyword));
  });

  const fixedTeamA = computed(() => bootstrap.players.filter((player) => manualTeams[player.id] === "A"));
  const fixedTeamB = computed(() => bootstrap.players.filter((player) => manualTeams[player.id] === "B"));
  const fixedAvailablePlayers = computed(() => {
    const keyword = fixedNameInput.value.trim().toLowerCase();
    return bootstrap.players
      .filter((player) => !manualTeams[player.id])
      .filter((player) => !keyword || player.name.toLowerCase().includes(keyword));
  });

  const chaosPlayers = computed(() => {
    const keyword = chaosSearch.value.trim().toLowerCase();
    return bootstrap.chaosPlayers.filter((player) => !keyword || player.name.toLowerCase().includes(keyword));
  });

  async function loadBootstrap() {
    const payload = await api.bootstrap();
    bootstrap.user = payload.user;
    bootstrap.players = (payload.players || []).map(decoratePlayer);
    bootstrap.chaosPlayers = (payload.chaosPlayers || []).map(decoratePlayer);
    bootstrap.heroes = payload.heroes || [];
    bootstrap.maps = payload.maps || [];
    bootstrap.rivals = payload.rivals || [];
    bootstrap.binds = payload.binds || [];
    bootstrap.history = payload.history || [];
    const availablePlayerIds = new Set(bootstrap.players.map((player) => player.id));
    selectedIds.value = selectedIds.value.filter((id) => availablePlayerIds.has(id));
    Object.keys(manualTeams).forEach((key) => {
      const id = Number(key);
      if (!availablePlayerIds.has(id)) delete manualTeams[key];
    });
    const allowedNames = new Set(bootstrap.chaosPlayers.map((player) => player.name));
    chaosSelectedNames.value = chaosSelectedNames.value.filter((name) => allowedNames.has(name));
  }

  function openRandomChat() {
    storeRandomChatContext(bootstrap);
    router.push("/chat/random-v2");
  }

  async function savePlayerRoles(player, roles) {
    const normalized = normalizePreferredRoles(roles);
    if (!normalized.length) return alert("至少选择一个位置");
    await api.updatePlayer(player.id, { name: player.name, level: player.level, preferredRoles: normalized });
    await loadBootstrap();
  }

  async function togglePlayerRole(player, role) {
    const current = normalizePreferredRoles(player.preferredRoles);
    let next;
    if (current.includes(role)) {
      if (current.length === 1) return alert("至少保留一个位置偏好");
      next = current.filter((item) => item !== role);
    } else {
      next = current.concat(role);
    }
    await savePlayerRoles(player, next);
  }

  async function createRandomPlayer(selectAfterCreate) {
    const name = randomPlayerForm.name.trim();
    if (!name) return alert("请输入玩家名称");
    await api.addPlayer({ name, level: Number(randomPlayerForm.level), preferredRoles: randomPlayerForm.preferredRoles.slice() });
    await loadBootstrap();
    const created = bootstrap.players.find((player) => player.name === name);
    if (selectAfterCreate && created && !selectedIds.value.includes(created.id)) selectedIds.value = selectedIds.value.concat(created.id);
    randomPlayerForm.name = "";
    randomPlayerForm.level = 3;
    randomPlayerForm.preferredRoles = ["T", "C", "N"];
  }

  async function createFixedPlayer() {
    const name = fixedNameInput.value.trim();
    if (!name) return alert("请输入玩家名称");
    await api.addPlayer({ name, level: Number(fixedLevel.value), preferredRoles: ["T", "C", "N"] });
    fixedNameInput.value = "";
    fixedLevel.value = 3;
    await loadBootstrap();
  }

  async function removePlayer(id) {
    await api.deletePlayer(id);
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
    delete manualTeams[id];
    await loadBootstrap();
  }

  async function addHero() {
    const parsed = parseHeroInput(heroInput.value);
    if (!parsed) return alert("请输入正确格式，如 T-莱因哈特");
    await api.addHero(parsed);
    heroInput.value = "";
    await loadBootstrap();
  }

  async function resetHeroes() {
    await api.resetHeroes();
    await loadBootstrap();
  }

  async function removeHero(id) {
    await api.deleteHero(id);
    await loadBootstrap();
  }

  async function addMap() {
    const name = mapInput.value.trim();
    if (!name) return alert("请输入地图名称");
    await api.addMap({ name });
    mapInput.value = "";
    await loadBootstrap();
  }

  async function removeMap(id) {
    await api.deleteMap(id);
    await loadBootstrap();
  }

  function addSelectedPlayer(id) {
    if (!selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.concat(id);
  }

  function removeSelectedPlayer(id) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
  }

  async function addRival() {
    if (!rivalForm.player1Id || !rivalForm.player2Id) return alert("请选择两名玩家");
    if (rivalForm.player1Id === rivalForm.player2Id) return alert("不能选择同一名玩家");
    await api.addRival(rivalForm);
    rivalForm.player1Id = "";
    rivalForm.player2Id = "";
    await loadBootstrap();
  }

  async function removeRival(id) {
    await api.deleteRival(id);
    await loadBootstrap();
  }

  async function addBind() {
    if (!bindForm.playerId || !bindForm.heroId) return alert("请选择玩家和英雄");
    await api.addBind(bindForm);
    bindForm.playerId = "";
    bindForm.heroId = "";
    await loadBootstrap();
  }

  async function removeBind(id) {
    await api.deleteBind(id);
    await loadBootstrap();
  }

  function startRollAnimation() {
    const pool = bootstrap.heroes.map((hero) => heroDisplay(hero));
    if (!pool.length) return null;
    rollText.value = "分配中...";
    return setInterval(() => {
      rollText.value = pool[Math.floor(Math.random() * pool.length)];
    }, 60);
  }

  async function startRandomDraw() {
    if (![10, 12].includes(selectedIds.value.length)) return alert("人数错误，5v5 需要 10 人，6v6 需要 12 人");

    resultModal.value = { rolling: true, payload: null };
    const timer = startRollAnimation();
    await new Promise((resolve) => setTimeout(resolve, 1400));
    if (timer) clearInterval(timer);

    const result = buildRandomModeResult({
      players: selectedPlayers.value,
      rivals: bootstrap.rivals || [],
      binds: bootstrap.binds || [],
      heroes: bootstrap.heroes || [],
      maps: bootstrap.maps || [],
      allowRepeatHeroes: allowRepeat.value,
      autoAssignHeroes: randomHero.value,
      normalizePreferredRoles,
    });

    if (result.error) {
      closeResult();
      return alert(result.error);
    }

    resultModal.value = { rolling: false, payload: result.payload };
    if (result.payload.summary?.warning) {
      alert(result.payload.summary.warning);
    }
  }

  function assignToTeam(id, team) { manualTeams[id] = team; }
  function removeFromTeam(id) { delete manualTeams[id]; }
  function clearTeams() { Object.keys(manualTeams).forEach((key) => delete manualTeams[key]); }

  async function startFixedDraw() {
    if (fixedTeamA.value.length !== fixedTeamB.value.length || ![5, 6].includes(fixedTeamA.value.length)) {
      return alert("两队人数必须相等且为 5 或 6 人");
    }

    const size = fixedTeamA.value.length;
    const needT = size === 5 ? 1 : 2;
    const needC = 2;
    const needN = size - needT - needC;
    const heroPool = bootstrap.heroes.map((hero) => heroDisplay(hero));

    resultModal.value = { rolling: true, payload: null };
    const timer = startRollAnimation();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    if (timer) clearInterval(timer);

    const globalUsed = new Set();
    const resultA = assignFixedTeamLegacy(fixedTeamA.value, heroPool, needT, needC, needN, allowRepeat.value, globalUsed);
    const resultB = assignFixedTeamLegacy(fixedTeamB.value, heroPool, needT, needC, needN, allowRepeat.value, globalUsed);
    if (!resultA || !resultB) {
      closeResult();
      return alert("英雄池不足，请扩大英雄池或允许两队重复英雄");
    }

    resultModal.value = {
      rolling: false,
      payload: {
        selectedMap: randomMapPayload(bootstrap.maps),
        teams: { teamA: resultA, teamB: resultB },
        summary: { autoAssignHeroes: true },
      },
    };
  }

  function toggleChaos(name) {
    chaosSearch.value = "";
    if (chaosSelectedNames.value.includes(name)) {
      chaosSelectedNames.value = chaosSelectedNames.value.filter((item) => item !== name);
    } else {
      chaosSelectedNames.value = chaosSelectedNames.value.concat(name);
    }
  }

  function clearChaosSelection() {
    chaosSelectedNames.value = [];
  }

  function startChaosBalance() {
    if (chaosSelectedNames.value.length < 10) return alert("至少 10 人才能开局");
    chaosLoading.value = true;
    setTimeout(() => {
      const teamSize = Number(chaosTeamSize.value);
      const selectedPlayersList = chaosSelectedNames.value
        .map((name) => bootstrap.chaosPlayers.find((player) => player.name === name))
        .filter(Boolean)
        .map((player) => ({ name: player.name, level: Number(player.level) || 1 }));

      const fixedSpectators = FIXED_SPECTATORS.filter((name) => selectedPlayersList.some((player) => player.name === name));
      const requiredSpectators = selectedPlayersList.length % teamSize;
      let spectators = fixedSpectators.slice(0, requiredSpectators);

      if (spectators.length < requiredSpectators) {
        const extra = shuffle(selectedPlayersList.filter((player) => !spectators.includes(player.name)))
          .slice(0, requiredSpectators - spectators.length)
          .map((player) => player.name);
        spectators = spectators.concat(extra);
      }

      const playingPlayers = selectedPlayersList.filter((player) => !spectators.includes(player.name));
      const teamCount = Math.floor(playingPlayers.length / teamSize);
      const teams = Array.from({ length: teamCount }, () => ({ players: [], totalLevel: 0 }));

      shuffle(playingPlayers)
        .sort((left, right) => right.level - left.level)
        .forEach((player) => {
          let targetTeam = teams[0];
          teams.forEach((team) => {
            const hasRoom = team.players.length < teamSize;
            const betterTarget = hasRoom && (targetTeam.players.length >= teamSize || team.totalLevel < targetTeam.totalLevel);
            if (betterTarget) targetTeam = team;
          });
          targetTeam.players.push(player);
          targetTeam.totalLevel += player.level;
        });

      chaosResult.value = { teams: teams.map((team) => team.players), spectators };
      chaosLoading.value = false;
    }, 1100);
  }

  function closeResult() {
    resultModal.value = null;
    chaosResult.value = null;
    chaosLoading.value = false;
  }

  function openSettings() {
    showSettings.value = true;
  }

  function openAdmin() {
    router.push("/admin");
  }

  function logout() {
    clearSession();
    router.push("/login");
  }

  onMounted(loadBootstrap);

  return {
    session, router, bootstrap, modeKey, isRandomMode, isAdvancedMode, isFixedMode, isChaosMode, pageTitle,
    randomPlayerForm, randomSearch, heroInput, mapInput, allowRepeat, randomHero, selectedIds,
    selectedPlayers, availableRandomPlayers, showRivalModal, rivalForm, bindForm, resultModal, rollText,
    showSettings, canManageCatalog,    fixedNameInput, fixedLevel, manualTeams, fixedTeamA, fixedTeamB, fixedAvailablePlayers,
    chaosSearch, chaosSelectedNames, chaosTeamSize, chaosPlayers, chaosLoading, chaosResult,
    roleLabel, roleEmoji, preferredRolesText, preferredRolesEmoji, heroDisplay, sortedTeam,
    togglePlayerRole, createRandomPlayer, createFixedPlayer, removePlayer,
    addHero, resetHeroes, removeHero, addMap, removeMap, addSelectedPlayer, removeSelectedPlayer,
    addRival, removeRival, addBind, removeBind, startRandomDraw, assignToTeam, removeFromTeam,
    clearTeams, startFixedDraw, toggleChaos, clearChaosSelection, startChaosBalance, closeResult, loadBootstrap, openRandomChat, openSettings, openAdmin, logout,
  };
}
const workspaceTemplate = `
  <div :class="['legacy-page', isChaosMode ? 'chaos-theme' : '', isFixedMode ? 'fixed-theme' : '']">
    <button class="back-home-btn" type="button" @click="router.push('/home')">返回首页</button>
    <div class="workspace-top-actions">
      <div class="workspace-user-pill">{{ session.user?.nickname || session.user?.username }}</div>
      <button v-if="canManageCatalog" class="admin-entry-btn workspace-admin-btn" type="button" @click="openAdmin">管理台</button>
      <button class="settings-gear-btn workspace-gear-btn" type="button" @click="openSettings" aria-label="打开全局设置">⚙</button>
    </div>

    <template v-if="isRandomMode">
      <div class="legacy-container random-page-shell">
        <h2>{{ pageTitle }}</h2>
        <div class="feature-switches">
          <span class="switch-label"><input type="checkbox" v-model="allowRepeat"> 允许两队重复英雄</span>
          <span class="switch-label"><input type="checkbox" v-model="randomHero"> 自动分配英雄</span>
        </div>
        <div class="random-chat-entry">
          <button class="legacy-btn random-chat-entry-btn" type="button" @click="openRandomChat">AI 聊天生成</button>
          <div class="random-chat-entry-tip">跳转到独立聊天页，用自然语言生成本次全随机结果，不保存历史记录。</div>
        </div>

        <div class="hero-pool-management">
          <div class="pool-title">共享英雄池</div>
          <div class="hero-pool-display">
            <div v-for="hero in bootstrap.heroes" :key="hero.id" class="hero-item" :class="{ tank: hero.roleCode === 'T', support: hero.roleCode === 'N', damage: hero.roleCode === 'C' }">
              <span>{{ heroDisplay(hero) }}</span>
            </div>
            <div v-if="!bootstrap.heroes.length" class="empty-state">暂无英雄</div>
          </div>
          <div class="pool-title">共享地图池</div>
          <div class="map-pool-display">
            <div v-for="map in bootstrap.maps" :key="map.id" class="map-chip">
              <span>{{ map.name }}</span>
            </div>
            <div v-if="!bootstrap.maps.length" class="empty-state">暂无地图</div>
          </div>
        </div>

        <div class="player-management">
          <div class="mode-selector"><div class="random-section-title">玩家列表</div></div>
          <div class="random-page-grid">
            <div class="random-left-pane">
              <input v-model="randomSearch" class="legacy-input full-width" placeholder="搜索玩家">
              <div class="player-selector">
                <div v-for="player in availableRandomPlayers" :key="player.id" class="player-option random-player-card" @click="addSelectedPlayer(player.id)">
                  <div class="player-option-name">{{ player.name }}</div>
                  <div class="role-selector compact">
                    <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('T') }" @click.stop="togglePlayerRole(player, 'T')">T</button>
                    <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('C') }" @click.stop="togglePlayerRole(player, 'C')">C</button>
                    <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('N') }" @click.stop="togglePlayerRole(player, 'N')">N</button>
                  </div>
                </div>
                <div v-if="!availableRandomPlayers.length" class="empty-state">没有可添加的玩家</div>
              </div>
            </div>
            <div class="random-right-pane">
              <div class="selected-header">
                <div>已选中玩家</div>
                <button class="small-btn btn-red" type="button" @click="selectedIds = []">清空</button>
              </div>
              <div class="player-list">
                <div v-for="player in selectedPlayers" :key="player.id" class="player-item player-item-rich random-selected-card">
                  <button class="remove-btn selected-remove-btn" type="button" @click="removeSelectedPlayer(player.id)" aria-label="移除玩家"><span class="icon-close" aria-hidden="true"></span></button>
                  <div class="player-main">
                    <span class="name">{{ player.name }}</span>
                  </div>
                  <div class="role-selector compact">
                    <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('T') }" @click.stop="togglePlayerRole(player, 'T')">T</button>
                    <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('C') }" @click.stop="togglePlayerRole(player, 'C')">C</button>
                    <button type="button" class="role-option-btn" :class="{ selected: player.preferredRoles.includes('N') }" @click.stop="togglePlayerRole(player, 'N')">N</button>
                  </div>
                </div>
                <div v-if="!selectedPlayers.length" class="empty-state">暂未选择玩家</div>
              </div>
            </div>
          </div>
        </div>

        <div class="start-row"><button class="legacy-btn" type="button" @click="startRandomDraw">开始分配</button></div>
      </div>

      <div class="footer" @dblclick="isAdvancedMode ? (showRivalModal = true) : null">小分队出品</div>

      <div v-if="showRivalModal && isAdvancedMode" class="rival-modal" @click.self="showRivalModal = false">
        <div class="rival-modal-content">
          <h3 style="color:#ffcc00; margin-bottom:20px;">内置彩蛋</h3>
          <div class="rival-section">
            <h4>敌对群友</h4>
            <div class="toolbar-row">
              <select v-model="rivalForm.player1Id" class="legacy-select flexible-select">
                <option value="">选择玩家1</option>
                <option v-for="player in bootstrap.players" :key="'rp1-' + player.id" :value="player.id">{{ player.name }}</option>
              </select>
              <span class="rival-vs">VS</span>
              <select v-model="rivalForm.player2Id" class="legacy-select flexible-select">
                <option value="">选择玩家2</option>
                <option v-for="player in bootstrap.players" :key="'rp2-' + player.id" :value="player.id">{{ player.name }}</option>
              </select>
              <button class="small-btn" type="button" @click="addRival">确认</button>
            </div>
            <div class="rival-list">
              <div v-for="rival in bootstrap.rivals" :key="rival.id" class="rival-item">
                <span>{{ rival.player1Name }} VS {{ rival.player2Name }}</span>
                <button class="small-btn btn-red" type="button" @click="removeRival(rival.id)">删除</button>
              </div>
              <div v-if="!bootstrap.rivals.length" class="empty-state">暂无敌对设置</div>
            </div>
          </div>
          <div class="rival-section">
            <h4>专属英雄</h4>
            <div class="toolbar-row">
              <select v-model="bindForm.playerId" class="legacy-select flexible-select">
                <option value="">选择玩家</option>
                <option v-for="player in bootstrap.players" :key="'bp-' + player.id" :value="player.id">{{ player.name }}</option>
              </select>
              <select v-model="bindForm.heroId" class="legacy-select flexible-select">
                <option value="">选择英雄</option>
                <option v-for="hero in bootstrap.heroes" :key="'bh-' + hero.id" :value="hero.id">{{ heroDisplay(hero) }}</option>
              </select>
              <button class="small-btn" type="button" @click="addBind">确认</button>
            </div>
            <div class="bind-list">
              <div v-for="bind in bootstrap.binds" :key="bind.id" class="bind-item">
                <span>{{ bind.playerName }} -> {{ bind.heroDisplayName }}</span>
                <button class="small-btn btn-red" type="button" @click="removeBind(bind.id)">删除</button>
              </div>
              <div v-if="!bootstrap.binds.length" class="empty-state">暂无专属英雄</div>
            </div>
          </div>
          <div class="rival-controls"><button class="small-btn" type="button" @click="showRivalModal = false">关闭</button></div>
        </div>
      </div>
    </template>

    <template v-else-if="isFixedMode">
      <div class="legacy-container fixed-mode-shell">
        <h2>{{ pageTitle }}</h2>
        <div class="switch-box"><div class="switch-item"><input type="checkbox" v-model="allowRepeat"> <label>允许两队重复英雄</label></div></div>
        <div class="row"><div class="col"><div class="card">
          <div class="card-title">玩家列表</div>
          <div class="input-row">
            <input v-model="fixedNameInput" class="player-input legacy-input" placeholder="输入名字搜索或添加玩家">
            <select v-model="fixedLevel" class="player-input legacy-select star-level-select">
              <option :value="1">★</option><option :value="2">★★</option><option :value="3">★★★</option><option :value="4">★★★★</option>
            </select>
            <button class="btn-small" type="button" @click="createFixedPlayer">添加</button>
          </div>
          <div class="player-grid">
            <div v-for="player in fixedAvailablePlayers" :key="player.id" class="player-card">
              <div class="player-name">{{ player.name }}</div>
              <div class="player-actions">
                <button class="btn-a" type="button" @click="assignToTeam(player.id, 'A')">A队</button>
                <button class="btn-b" type="button" @click="assignToTeam(player.id, 'B')">B队</button>
              </div>
            </div>
            <div v-if="!fixedAvailablePlayers.length" class="empty-state">暂无玩家</div>
          </div>
        </div></div></div>

        <div class="team-row">
          <div class="team-box team-a">
            <div class="team-header"><div class="team-title">A 队</div><div class="team-count">{{ fixedTeamA.length }}人</div></div>
            <div class="team-list">
              <div v-for="player in fixedTeamA" :key="'a-' + player.id" class="team-player"><div>{{ player.name }}</div><button class="btn-remove" type="button" @click="removeFromTeam(player.id)">x</button></div>
              <div v-if="!fixedTeamA.length" class="empty-state">暂无玩家</div>
            </div>
          </div>
          <div class="team-box team-b">
            <div class="team-header"><div class="team-title">B 队</div><div class="team-count">{{ fixedTeamB.length }}人</div></div>
            <div class="team-list">
              <div v-for="player in fixedTeamB" :key="'b-' + player.id" class="team-player"><div>{{ player.name }}</div><button class="btn-remove" type="button" @click="removeFromTeam(player.id)">x</button></div>
              <div v-if="!fixedTeamB.length" class="empty-state">暂无玩家</div>
            </div>
          </div>
        </div>
        <div class="action-row"><button class="btn-big clear" type="button" @click="clearTeams">清空队伍</button><button class="btn-big" type="button" @click="startFixedDraw">开始分配英雄</button></div>
      </div>
      <div class="footer">小分队出品</div>
    </template>

    <template v-else-if="isChaosMode">
      <div class="legacy-container chaos-container">
        <h2>{{ pageTitle }}</h2>
        <div class="subtitle">均衡 + 随机</div>
        <div class="controls">
          <select v-model="chaosTeamSize"><option :value="6">6v6 模式</option><option :value="5">5v5 模式</option></select>
          <button id="autoTeamBtn" class="btn-big" type="button" @click="startChaosBalance">开始分队</button>
          <button id="clearBtn" class="btn-big" type="button" @click="clearChaosSelection">清空已选</button>
        </div>
        <div class="selected-info">已选中 <span>{{ chaosSelectedNames.length }}</span> 人</div>
        <div class="player-card chaos-player-card">
          <div class="search-add">
            <input v-model="chaosSearch" type="text" placeholder="搜索玩家...">
          </div>
          <div class="player-grid chaos-grid">
            <div v-for="player in chaosPlayers" :key="player.name" class="player-item chaos-player-item" :class="{ selected: chaosSelectedNames.includes(player.name) }" @click="toggleChaos(player.name)">{{ player.name }}</div>
            <div v-if="!chaosPlayers.length" class="empty-state">{{ bootstrap.chaosPlayers.length ? '没有匹配的玩家' : '暂无预设玩家' }}</div>
          </div>
        </div>
      </div>
      <div class="footer">小分队出品</div>
    </template>

    <div v-if="resultModal" class="modal" @click.self="closeResult">
      <div class="modal-content">
        <div v-if="resultModal.rolling" class="hero-roll">{{ rollText }}</div>
        <div v-else-if="resultModal.payload">
          <h3 style="text-align:center;color:#ffcc00;margin:18px 0;">抽取结果</h3>
          <div style="text-align:center;color:#eaecef;font-size:20px;font-weight:bold;margin:18px 0;">地图：{{ resultModal.payload.selectedMap?.name || resultModal.payload.selectedMap || '未配置' }}</div>
          <table class="result-table">
            <thead>
              <tr v-if="isFixedMode"><th>队伍</th><th>玩家</th><th>英雄</th></tr>
              <tr v-else-if="!resultModal.payload.summary?.autoAssignHeroes"><th>队伍</th><th>玩家</th><th>偏好位置</th></tr>
              <tr v-else><th>队伍</th><th>玩家</th><th>英雄</th><th>位置</th><th>偏好</th></tr>
            </thead>
            <tbody>
              <template v-for="player in (isRandomMode ? sortedTeam(resultModal.payload.teams.teamA) : resultModal.payload.teams.teamA)" :key="'ra-' + player.id">
                <tr class="teamA-row"><td>A 队</td><td>{{ player.name }}</td>
                  <td v-if="isFixedMode">{{ player.hero?.name || '-' }}</td>
                  <template v-else-if="!resultModal.payload.summary?.autoAssignHeroes"><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                  <template v-else><td>{{ player.hero?.name || '-' }}</td><td>{{ player.hero?.roleCode ? roleLabel(player.hero.roleCode) : '-' }}</td><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                </tr>
              </template>
              <template v-for="player in (isRandomMode ? sortedTeam(resultModal.payload.teams.teamB) : resultModal.payload.teams.teamB)" :key="'rb-' + player.id">
                <tr class="teamB-row"><td>B 队</td><td>{{ player.name }}</td>
                  <td v-if="isFixedMode">{{ player.hero?.name || '-' }}</td>
                  <template v-else-if="!resultModal.payload.summary?.autoAssignHeroes"><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                  <template v-else><td>{{ player.hero?.name || '-' }}</td><td>{{ player.hero?.roleCode ? roleLabel(player.hero.roleCode) : '-' }}</td><td>{{ preferredRolesEmoji(player.preferredRoles) }}</td></template>
                </tr>
              </template>
            </tbody>
          </table>
          <div class="modal-buttons"><button class="small-btn" type="button" @click="closeResult">关闭</button></div>
        </div>
      </div>
    </div>

    <div v-if="chaosLoading" class="modal"><div class="modal-content"><div class="hero-roll">正在计算最优均衡分队...</div></div></div>
    <div v-if="chaosResult" class="modal" @click.self="closeResult">
      <div class="modal-content chaos-result-modal">
        <div class="modal-header">分队结果</div>
        <div class="chaos-result-body">
          <div class="teams-result">
            <div v-for="(team, index) in chaosResult.teams" :key="index" class="result-team" :class="'team-' + index">
              <h3>{{ ['红队','蓝队','绿队','黄队','粉队','紫队'][index] || ('队伍' + (index + 1)) }}</h3>
              <div class="team-list chaos-team-list">
                <div v-for="player in team" :key="index + '-' + player.name" class="chaos-team-player">{{ player.name }}</div>
              </div>
            </div>
          </div>
          <div class="spectators"><h3>观战人员（{{ chaosResult.spectators.length }}人）</h3><div class="spec-list"><div v-for="player in chaosResult.spectators" :key="player" class="spec-item">{{ player }}</div><div v-if="!chaosResult.spectators.length" class="empty-state">无观战人员</div></div></div>
        </div>
        <div class="modal-buttons"><button class="btn-big" type="button" @click="closeResult">关闭</button><button class="btn-big chaos-restart-btn" type="button" @click="startChaosBalance">重新分队</button></div>
      </div>
    </div>

    <SettingsModal v-model="showSettings" @updated="loadBootstrap" />
  </div>
`;

const WorkspaceView = { components: { SettingsModal }, setup: workspaceSetup, template: workspaceTemplate };
const routes = [
  { path: '/login', component: LoginView },
  { path: '/register', component: RegisterView },
  { path: "/", redirect: () => (session.token ? "/home" : "/login") },
  { path: "/home", component: LandingView, meta: { requiresAuth: true } },
  { path: "/admin", component: AdminView, meta: { requiresAuth: true } },
  { path: "/chat/random-v2", component: ChatRandomModeView, meta: { requiresAuth: true } },
  { path: "/mode/:mode", component: WorkspaceView, meta: { requiresAuth: true } },
  { path: "/fun/dog", component: DogView, meta: { requiresAuth: true } },
  { path: "/:pathMatch(.*)*", redirect: () => (session.token ? "/home" : "/login") },
];
const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  if (to.path === "/mode/random-classic") return "/mode/random-v2";
  if (to.meta.requiresAuth && !session.token) return "/login";
  if ((to.path === "/login" || to.path === "/register") && session.token) return "/home";
  return true;
});
const app = createApp({ template: "<router-view :key='$route.fullPath'></router-view>" });
app.use(router);
app.use(ElementPlus);
app.mount("#app");



































