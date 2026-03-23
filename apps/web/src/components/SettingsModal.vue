<script setup>
import { computed, reactive, ref, watch } from "vue";
import { api } from "../services/api";
import { session } from "../services/session";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "updated"]);

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const searchKeyword = ref("");
const activeTab = ref("players");
const players = ref([]);
const summary = reactive({
  playerCount: 0,
  heroCount: 0,
  mapCount: 0,
  historyCount: 0,
});

const playerForm = reactive({
  name: "",
  level: 3,
  preferredRole: "any",
});

const filteredPlayers = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return players.value;
  }

  return players.value.filter((player) => player.name.toLowerCase().includes(keyword));
});

function closeModal() {
  emit("update:modelValue", false);
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

async function loadSettings() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const payload = await api.bootstrap();
    players.value = normalizePlayers(payload.players);
    summary.playerCount = payload.players.length;
    summary.heroCount = payload.heroes.length;
    summary.mapCount = payload.maps.length;
    summary.historyCount = payload.history.length;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function syncAfterMutation() {
  await loadSettings();
  emit("updated");
}

async function addPlayer() {
  saving.value = true;
  errorMessage.value = "";

  try {
    await api.addPlayer(playerForm);
    playerForm.name = "";
    playerForm.level = 3;
    playerForm.preferredRole = "any";
    await syncAfterMutation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function savePlayer(player) {
  saving.value = true;
  errorMessage.value = "";

  try {
    await api.updatePlayer(player.id, {
      name: player.name,
      level: player.level,
      preferredRole: player.preferredRole,
    });
    await syncAfterMutation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function removePlayer(playerId) {
  saving.value = true;
  errorMessage.value = "";

  try {
    await api.deletePlayer(playerId);
    await syncAfterMutation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      return;
    }

    activeTab.value = "players";
    loadSettings();
  },
);
</script>

<template>
  <div v-if="modelValue" class="modal-mask" @click.self="closeModal">
    <div class="glass-card modal-panel settings-modal">
      <div class="panel-header">
        <div>
          <div class="panel-title">全局设置</div>
          <div class="muted">统一管理玩家池，修改后会自动重新获取列表并刷新页面数据。</div>
        </div>
        <div class="topbar-actions">
          <span class="badge">{{ session.user?.nickname || session.user?.username }}</span>
          <button class="btn btn-secondary" :disabled="loading || saving" @click="loadSettings">刷新设置</button>
          <button class="btn btn-danger" @click="closeModal">关闭</button>
        </div>
      </div>

      <div class="settings-tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'players' }" @click="activeTab = 'players'">玩家池</button>
        <button class="tab-btn" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">概览</button>
      </div>

      <div v-if="errorMessage" class="panel-card settings-error">
        {{ errorMessage }}
      </div>

      <section v-if="activeTab === 'players'" class="settings-section">
        <div class="panel-header">
          <div>
            <div class="panel-title">玩家维护</div>
            <div class="muted">这里统一做新增、编辑、删除，工作台只负责选人。</div>
          </div>
          <input v-model="searchKeyword" class="input" placeholder="搜索玩家" style="max-width: 240px" />
        </div>

        <div class="form-grid player-settings-form" style="margin-bottom: 16px">
          <input v-model="playerForm.name" class="input" placeholder="玩家名称" />
          <select v-model="playerForm.level" class="select">
            <option :value="4">4</option>
            <option :value="3">3</option>
            <option :value="2">2</option>
            <option :value="1">1</option>
          </select>
          <select v-model="playerForm.preferredRole" class="select">
            <option value="any">任意</option>
            <option value="T">坦克</option>
            <option value="C">输出</option>
            <option value="N">辅助</option>
          </select>
          <button class="btn btn-primary" :disabled="saving" @click="addPlayer">
            {{ saving ? "处理中..." : "新增玩家" }}
          </button>
        </div>

        <div class="player-pool player-settings-list">
          <div v-for="player in filteredPlayers" :key="player.id" class="player-chip">
            <div style="flex: 1">
              <input v-model="player.name" class="input" placeholder="玩家名称" />
              <div class="form-grid player-settings-form" style="margin-top: 10px">
                <select v-model="player.level" class="select">
                  <option :value="4">4</option>
                  <option :value="3">3</option>
                  <option :value="2">2</option>
                  <option :value="1">1</option>
                </select>
                <select v-model="player.preferredRole" class="select">
                  <option value="any">任意</option>
                  <option value="T">坦克</option>
                  <option value="C">输出</option>
                  <option value="N">辅助</option>
                </select>
                <div class="player-meta player-settings-meta">
                  <span class="badge">等级 {{ player.level }}</span>
                  <span class="badge" :class="`role-${player.preferredRole}`">{{ roleLabel(player.preferredRole) }}</span>
                </div>
              </div>
            </div>
            <div class="inline-actions">
              <button class="btn btn-secondary" :disabled="saving" @click="savePlayer(player)">保存</button>
              <button class="btn btn-danger" :disabled="saving" @click="removePlayer(player.id)">删除</button>
            </div>
          </div>

          <div v-if="loading" class="panel-card tip-card">
            正在加载玩家列表...
          </div>

          <div v-else-if="!filteredPlayers.length" class="panel-card tip-card">
            没有匹配的玩家。
          </div>
        </div>
      </section>

      <section v-else class="settings-section">
        <div class="settings-summary-grid">
          <div class="panel-card settings-summary-card">
            <div class="muted">玩家池</div>
            <div class="settings-summary-value">{{ summary.playerCount }}</div>
          </div>
          <div class="panel-card settings-summary-card">
            <div class="muted">英雄池</div>
            <div class="settings-summary-value">{{ summary.heroCount }}</div>
          </div>
          <div class="panel-card settings-summary-card">
            <div class="muted">地图池</div>
            <div class="settings-summary-value">{{ summary.mapCount }}</div>
          </div>
          <div class="panel-card settings-summary-card">
            <div class="muted">最近记录</div>
            <div class="settings-summary-value">{{ summary.historyCount }}</div>
          </div>
        </div>

        <div class="panel-card settings-note">
          <div class="panel-title">同步说明</div>
          <div class="muted" style="line-height: 1.8; margin-top: 10px">
            玩家在这里修改后，首页和各模式工作台都会重新获取玩家列表。
            如果当前工作台已经选中了部分玩家，系统会尽量保留仍然存在的已选项，并自动移除已删除的玩家。
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
