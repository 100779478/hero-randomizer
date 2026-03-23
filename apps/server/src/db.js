const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadLegacyConfig } = require("./services/legacy-loader");
const { hashPassword } = require("./utils/password");

const SHARED_CATALOG_USERNAME = "lwz";
const LEGACY_SHARED_CATALOG_USERNAME = "admin";
const SHARED_CATALOG_NICKNAME = "lwz";
const SHARED_CATALOG_PASSWORD = "20251030";

function createDatabase() {
  const filePath = path.resolve(__dirname, "../data/app.db");
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      preferred_role TEXT NOT NULL DEFAULT 'any',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS heroes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role_code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, role_code, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rivals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, player1_id, player2_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hero_binds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      hero_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, player_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      selected_map TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  migrateLegacySchema(db);
}

function migrateLegacySchema(db) {
  removePlayerDescriptionColumn(db);
}

function tableColumns(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
  } catch {
    return [];
  }
}

function hasColumn(db, tableName, columnName) {
  return tableColumns(db, tableName).includes(columnName);
}

function runTransaction(db, callback) {
  db.exec("BEGIN");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function removePlayerDescriptionColumn(db) {
  if (!hasColumn(db, "players", "description")) {
    return;
  }

  try {
    db.exec("ALTER TABLE players DROP COLUMN description;");
    return;
  } catch {
    rebuildPlayersWithoutDescription(db);
  }
}

function rebuildPlayersWithoutDescription(db) {
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    runTransaction(db, () => {
      db.exec(`
        ALTER TABLE rivals RENAME TO rivals_legacy;
        ALTER TABLE hero_binds RENAME TO hero_binds_legacy;
        ALTER TABLE players RENAME TO players_legacy;

        CREATE TABLE players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          level INTEGER NOT NULL DEFAULT 1,
          preferred_role TEXT NOT NULL DEFAULT 'any',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, name),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO players (id, user_id, name, level, preferred_role, created_at, updated_at)
        SELECT id, user_id, name, level, preferred_role, created_at, updated_at
        FROM players_legacy;

        CREATE TABLE rivals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          player1_id INTEGER NOT NULL,
          player2_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, player1_id, player2_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE
        );

        INSERT INTO rivals (id, user_id, player1_id, player2_id, created_at)
        SELECT id, user_id, player1_id, player2_id, created_at
        FROM rivals_legacy;

        CREATE TABLE hero_binds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          hero_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, player_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
        );

        INSERT INTO hero_binds (id, user_id, player_id, hero_id, created_at)
        SELECT id, user_id, player_id, hero_id, created_at
        FROM hero_binds_legacy;

        DROP TABLE rivals_legacy;
        DROP TABLE hero_binds_legacy;
        DROP TABLE players_legacy;
      `);
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function upsertPlayerDefaults(db, userId, defaults) {
  const insertPlayer = db.prepare(`
    INSERT OR IGNORE INTO players (user_id, name, level, preferred_role)
    VALUES (@userId, @name, @level, @preferredRole)
  `);

  runTransaction(db, () => {
    defaults.players.forEach((player) => {
      insertPlayer.run({
        userId,
        name: player.name,
        level: Number(player.level) || 1,
        preferredRole: player.preferredRole,
      });
    });
  });
}

function normalizeSharedCatalog(db, adminId, defaults) {
  const insertHero = db.prepare(`
    INSERT OR IGNORE INTO heroes (user_id, role_code, name)
    VALUES (@userId, @roleCode, @name)
  `);
  const insertMap = db.prepare(`
    INSERT OR IGNORE INTO maps (user_id, name)
    VALUES (@userId, @name)
  `);
  const remapHeroBinds = db.prepare(`
    UPDATE hero_binds
    SET hero_id = (
      SELECT admin_hero.id
      FROM heroes source_hero
      JOIN heroes admin_hero
        ON admin_hero.user_id = @adminId
       AND admin_hero.role_code = source_hero.role_code
       AND admin_hero.name = source_hero.name
      WHERE source_hero.id = hero_binds.hero_id
      LIMIT 1
    )
    WHERE hero_id IN (SELECT id FROM heroes WHERE user_id <> @adminId)
  `);
  const deleteDanglingBinds = db.prepare(`DELETE FROM hero_binds WHERE hero_id IN (SELECT id FROM heroes WHERE user_id <> ?)`);
  const deleteForeignHeroes = db.prepare(`DELETE FROM heroes WHERE user_id <> ?`);
  const deleteForeignMaps = db.prepare(`DELETE FROM maps WHERE user_id <> ?`);

  runTransaction(db, () => {
    defaults.heroes.forEach((hero) => {
      insertHero.run({ userId: adminId, roleCode: hero.roleCode, name: hero.name });
    });

    defaults.maps.forEach((mapName) => {
      insertMap.run({ userId: adminId, name: mapName });
    });

    remapHeroBinds.run({ adminId });
    deleteDanglingBinds.run(adminId);
    deleteForeignHeroes.run(adminId);
    deleteForeignMaps.run(adminId);
  });
}

function ensureAdminAccount(db) {
  const defaults = loadLegacyConfig();
  let admin = db.prepare(`SELECT id FROM users WHERE username = ?`).get(SHARED_CATALOG_USERNAME);

  if (!admin) {
    const legacyAdmin = db.prepare(`SELECT id FROM users WHERE username = ?`).get(LEGACY_SHARED_CATALOG_USERNAME);
    if (legacyAdmin) {
      db.prepare(`UPDATE users SET username = ?, nickname = ?, password_hash = ? WHERE id = ?`).run(
        SHARED_CATALOG_USERNAME,
        SHARED_CATALOG_NICKNAME,
        hashPassword(SHARED_CATALOG_PASSWORD),
        legacyAdmin.id,
      );
      db.prepare(`DELETE FROM user_tokens WHERE user_id = ?`).run(legacyAdmin.id);
      admin = { id: Number(legacyAdmin.id) };
    }
  }

  if (!admin) {
    const result = db
      .prepare(`
        INSERT INTO users (username, nickname, password_hash)
        VALUES (?, ?, ?)
      `)
      .run(SHARED_CATALOG_USERNAME, SHARED_CATALOG_NICKNAME, hashPassword(SHARED_CATALOG_PASSWORD));
    admin = { id: Number(result.lastInsertRowid) };
  }

  normalizeSharedCatalog(db, admin.id, defaults);

  const playerCount = db.prepare(`SELECT COUNT(*) AS count FROM players WHERE user_id = ?`).get(admin.id).count;
  if (!playerCount) {
    upsertPlayerDefaults(db, admin.id, defaults);
  }
}

function seedUserFromAdmin() {
  return null;
}

function getSharedCatalogUserId(db) {
  const admin = db.prepare(`SELECT id FROM users WHERE username = ?`).get(SHARED_CATALOG_USERNAME);
  return admin ? Number(admin.id) : 0;
}

module.exports = {
  createDatabase,
  initSchema,
  ensureAdminAccount,
  seedUserFromAdmin,
  getSharedCatalogUserId,
  SHARED_CATALOG_USERNAME,
};




