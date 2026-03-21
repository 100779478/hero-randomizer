import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";
import { hydrateSession } from "./services/session";

hydrateSession();

createApp(App).use(router).mount("#app");
