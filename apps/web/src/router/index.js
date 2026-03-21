import { createRouter, createWebHistory } from "vue-router";
import { session } from "../services/session";
import LoginView from "../views/LoginView.vue";
import LandingView from "../views/LandingView.vue";
import WorkspaceView from "../views/WorkspaceView.vue";
import EasterEggView from "../views/EasterEggView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView },
    { path: "/", name: "home", component: LandingView, meta: { requiresAuth: true } },
    { path: "/mode/:mode", name: "workspace", component: WorkspaceView, meta: { requiresAuth: true } },
    { path: "/fun/:mode", name: "easter", component: EasterEggView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !session.token) {
    return { name: "login" };
  }

  if (to.name === "login" && session.token) {
    return { name: "home" };
  }

  return true;
});

export default router;
