<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../services/api";

const route = useRoute();
const router = useRouter();
const bootstrap = ref({ players: [], heroes: [], maps: [] });

const meta = computed(() => {
  if (route.params.mode === "dog") {
    return {
      title: "训狗模式",
      subtitle: "保留你原站彩蛋页的轻松感，换成统一账号和全站风格。",
      accent: "#00d4ff",
      cards: [
        "情绪稳定第一，吼人无效，数据更有效。",
        "用管理员默认库也能直接开练。",
        "手机端同样能快速查看玩家和地图。",
      ],
    };
  }

  return {
    title: "怪物哥专页",
    subtitle: "保留附加页的赛博梗感，挂进同一套系统里。",
    accent: "#ffcc00",
    cards: [
      "怪物也需要结构化数据。",
      "首页入口、账号系统和样式全部统一。",
      "想继续扩展彩蛋页时，这里已经有前后端壳子。",
    ],
  };
});

onMounted(async () => {
  bootstrap.value = await api.bootstrap();
});
</script>

<template>
  <div class="page-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-logo">{{ route.params.mode === "dog" ? "🐶" : "👾" }}</div>
        <div>
          <div class="brand-title">{{ meta.title }}</div>
          <div class="brand-subtitle">{{ meta.subtitle }}</div>
        </div>
      </div>

      <div class="topbar-actions">
        <button class="btn btn-ghost" @click="router.push({ name: 'home' })">返回首页</button>
      </div>
    </header>

    <div class="workspace-grid">
      <section class="stack">
        <article class="panel-card tip-card">
          <div class="panel-title">彩蛋页已并入统一项目</div>
          <p class="muted" style="line-height: 1.8">
            这里不是静态孤岛页面了，而是已经接入登录态、统一布局和数据库初始化逻辑。
          </p>
        </article>

        <article class="panel-card">
          <div class="panel-title">页面要点</div>
          <ul class="list-reset">
            <li v-for="card in meta.cards" :key="card" class="history-card">{{ card }}</li>
          </ul>
        </article>
      </section>

      <aside class="stack">
        <article class="panel-card">
          <div class="panel-title">当前账号数据</div>
          <div class="player-meta" style="margin-top: 12px">
            <span class="badge">玩家 {{ bootstrap.players.length }}</span>
            <span class="badge">英雄 {{ bootstrap.heroes.length }}</span>
            <span class="badge">地图 {{ bootstrap.maps.length }}</span>
          </div>
        </article>
      </aside>
    </div>
  </div>
</template>
