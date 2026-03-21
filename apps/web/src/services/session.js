import { reactive } from "vue";

const STORAGE_KEY = "hero-randomizer-session";

export const session = reactive({
  token: "",
  user: null,
});

export function hydrateSession() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    session.token = parsed.token || "";
    session.user = parsed.user || null;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function setSession(nextSession) {
  session.token = nextSession.token;
  session.user = nextSession.user;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
}

export function clearSession() {
  session.token = "";
  session.user = null;
  window.localStorage.removeItem(STORAGE_KEY);
}
