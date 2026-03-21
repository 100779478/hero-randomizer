<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../services/api";
import { clearSession, session } from "../services/session";

const router = useRouter();
const loading = ref(true);
const showSystemInfo = ref(false);
const bootstrap = ref({ players: [], heroes: [], maps: [], history: [] });

const modes = [
  {
    key: "random-v2",
    title: "全随机模式 2.0",
    icon: "⚡",
    description: "保留原站核心玩法，支持敌对关系、专属英雄、自动平衡和历史记录。",
    features: ["等级平衡分队", "角色偏好与英雄分配", "敌对关系与绑定", "结果持久化"],
  },
  {
    key: "random-classic",
    title: "全随机模式",
    icon: "🎲",
    description: "偏经典的快速开团入口，保留自动分队和自动分英雄。",
    features: ["快速开抽", "支持手机操作", "管理员默认库", "地图随机"],
  },
  {
    key: "fixed-team",
    title: "固定队随机英雄",
    icon: "🧩",
    description: "先手动分 A/B 队，再交给系统随机英雄与地图。",
    features: ["手动指定队伍", "自动分英雄", "支持 10/12 人", "抽签历史"],
  },
  {
    key: "chaos",
    title: "大乱斗模式",
    icon: "🔥",
    description: "适合临时开团，任意偶数玩家都能迅速拆成两队。",
    features: ["偶数人数即可", "弱规则快开", "移动端友好", "结果可追溯"],
  },
  {
    key: "dog",
    title: "训狗模式",
    icon: "🐶",
    description: "保留原站彩蛋页的氛围和入口。",
    features: ["彩蛋风格页", "统一账号体系", "响应式布局", "从主页直接跳转"],
    fun: true,
  },
  {
    key: "monster",
    title: "怪物哥专页",
    icon: "👾",
    description: "保留原站附加页面的赛博梗感。",
    features: ["彩蛋风格页", "管理员数据概览", "统一设计语言", "保留入口层次"],
    fun: true,
  },
];

const stats = computed(() => [
  { label: "玩家池", value: bootstrap.value.players.length },
  { label: "英雄池", value: bootstrap.value.heroes.length },
  { label: "地图池", value: bootstrap.value.maps.length },
  { label: "最近记录", value: bootstrap.value.history.length },
]);

async function loadBootstrap() {
  loading.value = true;
  try {
    bootstrap.value = await api.bootstrap();
  } finally {
    loading.value = false;
  }
}

function goMode(mode) {
  if (mode.fun) {
    router.push({ name: "easter", params: { mode: mode.key } });
    return;
  }

  router.push({ name: "workspace", params: { mode: mode.key } });
}

function logout() {
  clearSession();
  router.push({ name: "login" });
}

onMounted(loadBootstrap);
</script>

<template>
  <div class="page-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-logo">⚔</div>
        <div>
          <div class="brand-title">OW INNER WAR</div>
          <div class="brand-subtitle">选择模式，进入战场</div>
        </div>
      </div>

      <div class="topbar-actions">
        <span class="badge">{{ session.user?.nickname || session.user?.username }}</span>
        <button class="btn btn-ghost" @click="showSystemInfo = true">成员档案</button>
        <button class="btn btn-secondary" @click="loadBootstrap">刷新数据</button>
        <button class="btn btn-danger" @click="logout">退出登录</button>
      </div>
    </header>

    <section class="glass-card" style="padding: 28px; margin-bottom: 22px">
      <div style="display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap">
        <div>
          <div class="brand-title" style="font-size: 34px">保留原站入口结构，升级为可登录的多端系统</div>
          <p class="muted" style="max-width: 760px; line-height: 1.8">
            首页视觉延续你现在的赛博紫蓝氛围，工具页则保留暗色面板与结果弹窗逻辑。
            <span v-if="loading">正在同步 admin 默认配置...</span>
          </p>
        </div>
        <div class="inline-actions">
          <div v-for="stat in stats" :key="stat.label" class="panel-card" style="min-width: 120px; padding: 16px">
            <div class="muted">{{ stat.label }}</div>
            <div style="font-size: 26px; font-weight: 900; margin-top: 6px">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="hero-grid">
      <article v-for="mode in modes" :key="mode.key" class="glass-card mode-card">
        <div>
          <div class="mode-icon">{{ mode.icon }}</div>
          <div class="mode-title">{{ mode.title }}</div>
          <p class="muted" style="line-height: 1.8">{{ mode.description }}</p>
          <ul class="mode-features">
            <li v-for="feature in mode.features" :key="feature">{{ feature }}</li>
          </ul>
        </div>
        <div class="inline-actions" style="margin-top: 18px">
          <button class="btn btn-primary" @click="goMode(mode)">进入</button>
        </div>
      </article>
    </section>

    <div v-if="showSystemInfo" class="modal-mask" @click.self="showSystemInfo = false">
      <div class="glass-card modal-panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">成员档案</div>
            <div class="muted">这里展示当前账号可用的玩家池。</div>
          </div>
          <button class="btn btn-danger" @click="showSystemInfo = false">关闭</button>
        </div>

        <div class="player-pool">
          <div v-for="player in bootstrap.players" :key="player.id" class="player-chip">
            <div>
              <div style="font-weight: 800">{{ player.name }}</div>
              <div class="player-meta">
                <span class="badge">等级 {{ player.level }}</span>
                <span class="badge" :class="`role-${player.preferredRole}`">{{ player.preferredRole }}</span>
                <span v-if="player.description">{{ player.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
