<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../services/api";
import { setSession } from "../services/session";

const router = useRouter();
const errorMessage = ref("");
const busy = ref(false);

const loginForm = reactive({
  username: "admin",
  password: "123456",
});

const registerForm = reactive({
  username: "",
  nickname: "",
  password: "",
});

async function handleLogin() {
  busy.value = true;
  errorMessage.value = "";

  try {
    const payload = await api.login(loginForm);
    setSession(payload);
    router.push({ name: "home" });
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    busy.value = false;
  }
}

async function handleRegister() {
  busy.value = true;
  errorMessage.value = "";

  try {
    await api.register(registerForm);
    loginForm.username = registerForm.username;
    loginForm.password = registerForm.password;
    registerForm.username = "";
    registerForm.nickname = "";
    registerForm.password = "";
    await handleLogin();
  } catch (error) {
    errorMessage.value = error.message;
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-shell">
    <div class="login-shell">
      <section class="glass-card login-side">
        <div class="brand">
          <div class="brand-logo">OW</div>
          <div>
            <div class="brand-title">OW INNER WAR</div>
            <div class="brand-subtitle">保留原站赛博感的全栈升级版</div>
          </div>
        </div>

        <div style="margin-top: 36px">
          <h1 style="font-size: 42px; margin: 0 0 12px">登录后直接开抽</h1>
          <p class="muted" style="line-height: 1.8">
            默认内置管理员账号，系统会在首次启动时自动建表，并把当前仓库里的
            <code>config.js</code> 落成 admin 的初始配置。
          </p>
        </div>

        <div class="panel-card" style="margin-top: 28px">
          <div class="panel-title">默认账号</div>
          <div class="player-meta" style="margin-top: 10px">
            <span class="badge">用户名：admin</span>
            <span class="badge">密码：123456</span>
            <span class="badge">Node.js + Koa2 + SQLite</span>
          </div>
        </div>
      </section>

      <section class="glass-card login-panel">
        <div>
          <div class="panel-title">登录</div>
          <p class="muted">网页和手机浏览器都可直接使用。</p>
        </div>

        <div class="form-grid single">
          <input v-model="loginForm.username" class="input" placeholder="用户名" />
          <input v-model="loginForm.password" class="input" placeholder="密码" type="password" />
          <button class="btn btn-primary" :disabled="busy" @click="handleLogin">
            {{ busy ? "登录中..." : "进入系统" }}
          </button>
        </div>

        <div>
          <div class="panel-title">注册新用户</div>
          <div class="form-grid" style="margin-top: 12px">
            <input v-model="registerForm.username" class="input" placeholder="用户名" />
            <input v-model="registerForm.nickname" class="input" placeholder="昵称" />
            <input v-model="registerForm.password" class="input" placeholder="密码，至少 6 位" type="password" />
            <button class="btn btn-secondary" :disabled="busy" @click="handleRegister">注册并登录</button>
          </div>
        </div>

        <div v-if="errorMessage" class="panel-card" style="border-color: rgba(255, 100, 100, 0.35)">
          {{ errorMessage }}
        </div>
      </section>
    </div>
  </div>
</template>
