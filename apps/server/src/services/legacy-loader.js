const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function normalizeRole(role) {
  if (role === "T" || role === "C" || role === "N") {
    return role;
  }

  return "any";
}

function parseHero(rawHero) {
  const value = String(rawHero || "").trim();
  const dashIndex = value.indexOf("-");

  if (dashIndex > 0) {
    const roleCode = value.slice(0, dashIndex).trim().toUpperCase();
    const name = value.slice(dashIndex + 1).trim();

    return {
      roleCode: roleCode === "T" || roleCode === "C" || roleCode === "N" ? roleCode : "C",
      name: name || value,
      raw: value,
    };
  }

  return {
    roleCode: "C",
    name: value,
    raw: value,
  };
}

function loadLegacyConfig() {
  const configPath = path.resolve(__dirname, "../../../../js/config.js");
  const code = fs.readFileSync(configPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);

  const players = Array.isArray(sandbox.window.PRESET_PLAYERS) ? sandbox.window.PRESET_PLAYERS : [];
  const heroes = Array.isArray(sandbox.window.DEFAULT_HERO_POOL) ? sandbox.window.DEFAULT_HERO_POOL : [];
  const maps = Array.isArray(sandbox.window.MAP) ? sandbox.window.MAP : [];

  return {
    players: players.map((player) => ({
      name: player.name,
      level: Number(player.level) || 1,
      preferredRole: normalizeRole(player.preferredRole),
      description: player.description || "",
    })),
    heroes: heroes.map(parseHero),
    maps: maps.map((mapName) => String(mapName || "").trim()).filter(Boolean),
  };
}

module.exports = {
  loadLegacyConfig,
};
