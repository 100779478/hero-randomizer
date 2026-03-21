<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../services/api";
import SettingsModal from "../components/SettingsModal.vue";

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const resultModal = ref(null);
const searchKeyword = ref("");
const showSettings = ref(false);
const bootstrap = reactive({
  user: null,
  players: [],
  heroes: [],
  maps: [],
  rivals: [],
  binds: [],
  history: [],
});

const selectedIds = ref([]);
const manualTeams = reactive({});
const options = reactive({
  allowRepeatHeroes: true,
  autoAssignHeroes: true,
});
const heroForm = reactive({
  roleCode: "T",
  name: "",
});
const mapForm = reactive({
  name: "",
});
const rivalForm = reactive({
  player1Id: "",
  player2Id: "",
});
const bindForm = reactive({
  playerId: "",
  heroId: "",
});

const modeMetaMap = {
  "random-v2": {
    title: "全随机模式 2.0",
    description: "支持敌对关系、专属英雄和自动平衡，是当前的主工作台。",
    backendMode: "random-v2",
    hint: "建议 10 或 12 人。",
  },
  "random-classic": {
    title: "全随机模式",
    description: "偏经典的快速模式，不强依赖高级约束。",
    backendMode: "random-classic",
    hint: "适合快速开抽。",
  },
  "fixed-team": {
    title: "固定队随机英雄",
    description: "先手动决定 A/B 队，再随机英雄与地图。",
    backendMode: "fixed-team",
    hint: "需要给已选玩家指定队伍。",
  },
  chaos: {
    title: "大乱斗模式",
    description: "偶数人数即可，适合临时开团。",
    backendMode: "chaos",
    hint: "支持任意偶数人数。",
  },
};

const currentMode = computed(() => modeMetaMap[route.params.mode] || modeMetaMap["random-v2"]);
const selectedPlayers = computed(() => bootstrap.players.filter((player) => selectedIds.value.includes(player.id)));
const filteredPlayers = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return bootstrap.players;
  }

  return bootstrap.players.filter((player) => player.name.toLowerCase().includes(keyword));
});
const selectedCountText = computed(() => `已选 ${selectedIds.value.length} 人`);
const isAdvancedMode = computed(() => route.params.mode === "random-v2");
const isFixedMode = computed(() => route.params.mode === "fixed-team");
const isChaosMode = computed(() => route.params.mode === "chaos");

function roleLabel(role) {
  return (
    {
      T: "坦克",
      C: "输出",
      N: "辅助",
      any: "任意",
    }[role] || role
  );
}

function normalizeRole(player) {
  if (player.preferredRole) {
    return player.preferredRole;
  }

  if (Array.isArray(player.preferredRoles)) {
    if (player.preferredRoles.length === 1) {
      return player.preferredRoles[0];
    }

    return "any";
  }

  return "any";
}

function normalizePlayers(list) {
  return (list || []).map((player) => ({
    ...player,
    preferredRole: normalizeRole(player),
  }));
}

function modeLabel(mode) {
  return modeMetaMap[mode]?.title || mode;
}

async function loadBootstrap() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await api.bootstrap();
    bootstrap.user = payload.user;
    bootstrap.players = normalizePlayers(payload.players);
    bootstrap.heroes = payload.heroes;
    bootstrap.maps = payload.maps;
    bootstrap.rivals = payload.rivals;
    bootstrap.binds = payload.binds;
    bootstrap.history = payload.history;

    const availableIds = new Set(bootstrap.players.map((player) => player.id));
    if (selectedIds.value.length) {
      selectedIds.value = selectedIds.value.filter((id) => availableIds.has(id));
    }

    Object.keys(manualTeams).forEach((key) => {
      const id = Number(key);
      if (!availableIds.has(id) || !selectedIds.value.includes(id)) {
        delete manualTeams[key];
      }
    });

    if (!selectedIds.value.length) {
      const defaultCount = route.params.mode === "chaos" ? Math.min(bootstrap.players.length, 8) : Math.min(bootstrap.players.length, 10);
      selectedIds.value = bootstrap.players.slice(0, defaultCount).map((player) => player.id);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function openPlayerSettings() {
  showSettings.value = true;
}

function togglePlayer(playerId) {
  if (selectedIds.value.includes(playerId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== playerId);
    delete manualTeams[playerId];
    return;
  }

  selectedIds.value = [...selectedIds.value, playerId];
  if (isFixedMode.value && !manualTeams[playerId]) {
    const teamACount = Object.values(manualTeams).filter((team) => team === "A").length;
    const teamBCount = Object.values(manualTeams).filter((team) => team === "B").length;
    manualTeams[playerId] = teamACount <= teamBCount ? "A" : "B";
  }
}

async function addHero() {
  saving.value = true;
  errorMessage.value = "";
  try {
    bootstrap.heroes = await api.addHero(heroForm);
    heroForm.roleCode = "T";
    heroForm.name = "";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function removeHero(heroId) {
  bootstrap.heroes = await api.deleteHero(heroId);
  await loadBootstrap();
}

async function addMap() {
  saving.value = true;
  errorMessage.value = "";
  try {
    bootstrap.maps = await api.addMap(mapForm);
    mapForm.name = "";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function removeMap(mapId) {
  bootstrap.maps = await api.deleteMap(mapId);
  await loadBootstrap();
}

async function addRival() {
  bootstrap.rivals = await api.addRival(rivalForm);
  rivalForm.player1Id = "";
  rivalForm.player2Id = "";
}

async function removeRival(rivalId) {
  bootstrap.rivals = await api.deleteRival(rivalId);
}

async function addBind() {
  bootstrap.binds = await api.addBind(bindForm);
  bindForm.playerId = "";
  bindForm.heroId = "";
}

async function removeBind(bindId) {
  bootstrap.binds = await api.deleteBind(bindId);
}

function openHistory(item) {
  resultModal.value = item.payload;
}

async function startDraw() {
  errorMessage.value = "";

  if (!selectedIds.value.length) {
    errorMessage.value = "请先选择玩家。";
    return;
  }

  if (!isChaosMode.value && !isFixedMode.value && ![10, 12].includes(selectedIds.value.length)) {
    errorMessage.value = "当前模式建议 10 人或 12 人。";
    return;
  }

  if (selectedIds.value.length % 2 !== 0) {
    errorMessage.value = "参赛人数必须为偶数。";
    return;
  }

  if (isFixedMode.value) {
    const allAssigned = selectedIds.value.every((id) => manualTeams[id] === "A" || manualTeams[id] === "B");
    if (!allAssigned) {
      errorMessage.value = "固定队模式下请为每位玩家指定队伍。";
      return;
    }
  }

  saving.value = true;
  try {
    const payload = await api.draw({
      mode: currentMode.value.backendMode,
      playerIds: selectedIds.value,
      allowRepeatHeroes: options.allowRepeatHeroes,
      autoAssignHeroes: options.autoAssignHeroes,
      manualTeams,
    });
    resultModal.value = payload.result;
    bootstrap.history = payload.history;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

watch(
  () => route.params.mode,
  () => {
    selectedIds.value = [];
    Object.keys(manualTeams).forEach((key) => delete manualTeams[key]);
    loadBootstrap();
  },
);

onMounted(loadBootstrap);
</script>

<template>
  <div class="page-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-logo">⚡</div>
        <div>
          <div class="brand-title">{{ currentMode.title }}</div>
          <div class="brand-subtitle">{{ currentMode.description }}</div>
        </div>
      </div>

      <div class="topbar-actions">
        <span class="badge">{{ bootstrap.user?.nickname || bootstrap.user?.username }}</span>
        <button class="icon-btn" title="全局设置" @click="openPlayerSettings">⚙</button>
        <button class="btn btn-ghost" @click="router.push({ name: 'home' })">返回首页</button>
        <button class="btn btn-secondary" @click="loadBootstrap">刷新</button>
      </div>
    </header>

    <div class="workspace-grid">
      <section class="stack">
        <article class="panel-card">
          <div class="panel-header">
            <div>
              <div class="panel-title">抽签控制台</div>
              <div class="muted">{{ currentMode.hint }}</div>
            </div>
            <div class="selection-counter">{{ selectedCountText }}</div>
          </div>

          <div class="toggle-row" style="margin-bottom: 16px">
            <label class="toggle"><input v-model="options.allowRepeatHeroes" type="checkbox" /> 允许两队重复英雄</label>
            <label class="toggle"><input v-model="options.autoAssignHeroes" type="checkbox" /> 自动分配英雄</label>
          </div>

          <div class="panel-grid">
            <div class="panel-card" style="padding: 16px">
              <div class="panel-title">已选玩家</div>
              <div class="player-pool" style="margin-top: 12px; max-height: 260px">
                <div v-for="player in selectedPlayers" :key="player.id" class="player-chip selected">
                  <div>
                    <div style="font-weight: 800">{{ player.name }}</div>
                    <div class="player-meta">
                      <span class="badge">等级 {{ player.level }}</span>
                      <span class="badge" :class="`role-${player.preferredRole}`">{{ roleLabel(player.preferredRole) }}</span>
                    </div>
                  </div>
                  <div v-if="isFixedMode" style="min-width: 100px">
                    <select v-model="manualTeams[player.id]" class="select">
                      <option value="A">A 队</option>
                      <option value="B">B 队</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div class="panel-card" style="padding: 16px">
              <div class="panel-title">操作</div>
              <p class="muted" style="line-height: 1.7">
                结果会写入历史记录，地图从你的地图池中随机产生。
              </p>
              <div class="inline-actions" style="margin-top: 16px">
                <button class="btn btn-primary" :disabled="saving || loading" @click="startDraw">
                  {{ saving ? "抽取中..." : "开始分配" }}
                </button>
              </div>
              <div v-if="errorMessage" style="margin-top: 14px; color: #ff9ea6">{{ errorMessage }}</div>
            </div>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-header">
            <div>
              <div class="panel-title">玩家选择</div>
              <div class="muted">玩家维护已移动到全局设置，这里只负责搜索、选人和刷新展示。</div>
            </div>
            <input v-model="searchKeyword" class="input" placeholder="搜索玩家" style="max-width: 220px" />
          </div>

          <div class="player-pool" style="margin-top: 16px">
            <div v-for="player in filteredPlayers" :key="player.id" class="player-chip" :class="{ selected: selectedIds.includes(player.id) }">
              <div style="flex: 1">
                <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                  <strong>{{ player.name }}</strong>
                  <div class="player-meta">
                    <span class="badge">等级 {{ player.level }}</span>
                    <span class="badge" :class="`role-${player.preferredRole}`">{{ roleLabel(player.preferredRole) }}</span>
                  </div>
                </div>
              </div>
              <div class="inline-actions">
                <button class="btn btn-ghost" @click="togglePlayer(player.id)">
                  {{ selectedIds.includes(player.id) ? '移出' : '选中' }}
                </button>
              </div>
            </div>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-header">
            <div>
              <div class="panel-title">英雄池与地图池</div>
              <div class="muted">沿用原站“英雄池 / 地图池”思路，改为数据库持久化。</div>
            </div>
          </div>

          <div class="panel-grid">
            <div>
              <div class="form-grid" style="margin-bottom: 12px">
                <select v-model="heroForm.roleCode" class="select">
                  <option value="T">T</option>
                  <option value="C">C</option>
                  <option value="N">N</option>
                </select>
                <input v-model="heroForm.name" class="input" placeholder="英雄名" />
                <button class="btn btn-secondary" @click="addHero">新增英雄</button>
              </div>
              <div class="hero-pool">
                <div v-for="hero in bootstrap.heroes" :key="hero.id" class="hero-chip">
                  <span>{{ hero.displayName }}</span>
                  <button class="btn btn-danger" @click="removeHero(hero.id)">删除</button>
                </div>
              </div>
            </div>

            <div>
              <div class="form-grid" style="margin-bottom: 12px">
                <input v-model="mapForm.name" class="input" placeholder="地图名" />
                <button class="btn btn-secondary" @click="addMap">新增地图</button>
              </div>
              <div class="map-pool">
                <div v-for="map in bootstrap.maps" :key="map.id" class="hero-chip">
                  <span>{{ map.name }}</span>
                  <button class="btn btn-danger" @click="removeMap(map.id)">删除</button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article v-if="isAdvancedMode" class="panel-card">
          <div class="panel-header">
            <div>
              <div class="panel-title">高级设置</div>
              <div class="muted">这里对应你当前 V2 页面里的敌对关系和专属英雄。</div>
            </div>
          </div>

          <div class="panel-grid">
            <div>
              <div class="form-grid" style="margin-bottom: 12px">
                <select v-model="rivalForm.player1Id" class="select">
                  <option value="">玩家 1</option>
                  <option v-for="player in bootstrap.players" :key="`r1-${player.id}`" :value="player.id">{{ player.name }}</option>
                </select>
                <select v-model="rivalForm.player2Id" class="select">
                  <option value="">玩家 2</option>
                  <option v-for="player in bootstrap.players" :key="`r2-${player.id}`" :value="player.id">{{ player.name }}</option>
                </select>
                <button class="btn btn-secondary" @click="addRival">建立敌对</button>
              </div>
              <div class="rival-list">
                <div v-for="rival in bootstrap.rivals" :key="rival.id" class="rival-item">
                  <span>{{ rival.player1Name }} VS {{ rival.player2Name }}</span>
                  <button class="btn btn-danger" @click="removeRival(rival.id)">删除</button>
                </div>
              </div>
            </div>

            <div>
              <div class="form-grid" style="margin-bottom: 12px">
                <select v-model="bindForm.playerId" class="select">
                  <option value="">玩家</option>
                  <option v-for="player in bootstrap.players" :key="`b1-${player.id}`" :value="player.id">{{ player.name }}</option>
                </select>
                <select v-model="bindForm.heroId" class="select">
                  <option value="">英雄</option>
                  <option v-for="hero in bootstrap.heroes" :key="`b2-${hero.id}`" :value="hero.id">{{ hero.displayName }}</option>
                </select>
                <button class="btn btn-secondary" @click="addBind">设置绑定</button>
              </div>
              <div class="bind-list">
                <div v-for="bind in bootstrap.binds" :key="bind.id" class="bind-item">
                  <span>{{ bind.playerName }} -> {{ bind.heroDisplayName }}</span>
                  <button class="btn btn-danger" @click="removeBind(bind.id)">删除</button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <aside class="stack">
        <article class="panel-card">
          <div class="panel-title">模式导航</div>
          <div class="inline-actions" style="margin-top: 14px">
            <button class="btn btn-ghost" @click="router.push({ name: 'workspace', params: { mode: 'random-v2' } })">V2</button>
            <button class="btn btn-ghost" @click="router.push({ name: 'workspace', params: { mode: 'random-classic' } })">经典</button>
            <button class="btn btn-ghost" @click="router.push({ name: 'workspace', params: { mode: 'fixed-team' } })">固定队</button>
            <button class="btn btn-ghost" @click="router.push({ name: 'workspace', params: { mode: 'chaos' } })">大乱斗</button>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-header">
            <div>
              <div class="panel-title">最近记录</div>
              <div class="muted">每次抽签都会落库。</div>
            </div>
          </div>
          <div class="history-list">
            <div v-for="item in bootstrap.history" :key="item.id" class="history-card">
              <div>
                <div style="font-weight: 800">{{ modeLabel(item.mode) }}</div>
                <div class="player-meta">
                  <span>{{ item.createdAt }}</span>
                  <span v-if="item.selectedMap">地图 {{ item.selectedMap }}</span>
                </div>
              </div>
              <button class="btn btn-secondary" @click="openHistory(item)">查看</button>
            </div>
          </div>
        </article>
      </aside>
    </div>

    <div v-if="resultModal" class="modal-mask" @click.self="resultModal = null">
      <div class="glass-card modal-panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">抽签结果</div>
            <div class="muted">
              地图：{{ resultModal.selectedMap?.name || resultModal.selectedMap || '未配置' }}
              · 人数 {{ resultModal.summary.totalPlayers }}
            </div>
          </div>
          <button class="btn btn-danger" @click="resultModal = null">关闭</button>
        </div>

        <div class="result-grid" style="margin-top: 18px">
          <div class="result-card team-a">
            <div class="panel-title">A 队</div>
            <ul class="list-reset" style="margin-top: 12px">
              <li v-for="player in resultModal.teams.teamA" :key="`a-${player.id}`" class="history-card">
                <div>
                  <strong>{{ player.name }}</strong>
                  <div class="player-meta">
                    <span>等级 {{ player.level }}</span>
                    <span>{{ roleLabel(player.preferredRole) }}</span>
                    <span v-if="player.hero">{{ player.hero.displayName }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <div class="result-card team-b">
            <div class="panel-title">B 队</div>
            <ul class="list-reset" style="margin-top: 12px">
              <li v-for="player in resultModal.teams.teamB" :key="`b-${player.id}`" class="history-card">
                <div>
                  <strong>{{ player.name }}</strong>
                  <div class="player-meta">
                    <span>等级 {{ player.level }}</span>
                    <span>{{ roleLabel(player.preferredRole) }}</span>
                    <span v-if="player.hero">{{ player.hero.displayName }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <SettingsModal v-model="showSettings" @updated="loadBootstrap" />
  </div>
</template>
