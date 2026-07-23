'use strict';

const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'baccaelite.db');
const DB_BACKUP = path.join(DATA_DIR, 'baccaelite.backup.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
let autoSaveTimer = null;

async function initDB() {
  const SQL = await initSqlJs();

  // 🔄 Intentar cargar desde backup si está corrupto
  let fileBuffer = null;
  if (fs.existsSync(DB_FILE)) {
    try {
      fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
      const test = db.exec('SELECT COUNT(*) FROM sqlite_master WHERE type="table"');
      if (!test || !test[0]) throw new Error('DB corrupted');
    } catch (e) {
      console.warn('⚠️  BD corrupta, restaurando desde backup...');
      if (fs.existsSync(DB_BACKUP)) {
        try {
          fileBuffer = fs.readFileSync(DB_BACKUP);
          db = new SQL.Database(fileBuffer);
          console.log('✅ Restaurada desde backup');
        } catch (e2) {
          console.warn('⚠️  Backup corrupto, creando nueva BD');
          db = new SQL.Database();
        }
      } else {
        db = new SQL.Database();
      }
    }
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      key            TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      email          TEXT,
      role           TEXT NOT NULL DEFAULT 'user',
      salt           TEXT NOT NULL,
      hash           TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      balance        REAL NOT NULL DEFAULT 1023,
      xp             INTEGER NOT NULL DEFAULT 0,
      peak           REAL NOT NULL DEFAULT 1023,
      free_token_at  INTEGER NOT NULL DEFAULT 0,
      plays          INTEGER NOT NULL DEFAULT 0,
      won            INTEGER NOT NULL DEFAULT 0,
      lost           INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
      tourney_date   TEXT,
      tourney_slot   INTEGER
    );
    CREATE TABLE IF NOT EXISTS verify_tokens (
      token      TEXT PRIMARY KEY,
      email_key  TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_key   TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_stats (
      key        TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      total_hands INTEGER NOT NULL DEFAULT 0,
      peak_users INTEGER NOT NULL DEFAULT 0
    );
  `);

  // ✨ Inicializar estadísticas del servidor
  const statsRes = db.exec('SELECT COUNT(*) FROM server_stats WHERE key = "server"');
  const statsCount = statsRes[0]?.values[0][0] || 0;
  if (statsCount === 0) {
    db.run(`INSERT INTO server_stats (key, started_at, total_hands, peak_users) VALUES ('server', ?, 0, 0)`, [Date.now()]);
  }

  // Migrar desde users.json si tabla vacía
  const count = db.exec('SELECT COUNT(*) as n FROM users');
  const n = count[0]?.values[0][0] || 0;

  if (n === 0) {
    const USERS_FILE = path.join(DATA_DIR, 'users.json');
    if (fs.existsSync(USERS_FILE)) {
      try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        for (const [key, u] of Object.entries(users)) {
          db.run(`
            INSERT OR IGNORE INTO users 
            (key,name,email,role,salt,hash,created_at,balance,xp,peak,
             free_token_at,plays,won,lost,email_verified,tourney_date,tourney_slot)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [key, u.name, u.email||null, u.role||'user', u.salt, u.hash,
             u.createdAt||Date.now(), u.balance||1023, u.xp||0, u.peak||1023,
             u.freeTokenAt||0, u.record?.plays||0, u.record?.won||0,
             u.record?.lost||0, 1, u.tourneyToday?.date||null, u.tourneyToday?.slot||null]
          );
        }
        saveDB();
        console.log(`✅ Migrados ${Object.keys(users).length} usuarios a SQLite`);
      } catch(e) {
        console.error('❌ Error migración:', e.message);
      }
    }
  }

  // 🔄 AUTO-SAVE cada 5 segundos
  startAutoSave();

  console.log('✅ SQLite listo (auto-save cada 5s)');
}

function saveDB() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    
    // 💾 Backup antes de guardar
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, DB_BACKUP);
    }
    
    fs.writeFileSync(DB_FILE, buffer);
  } catch (e) {
    console.error('❌ Error saveDB:', e.message);
  }
}

function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    try {
      saveDB();
    } catch (e) {
      console.error('❌ Error auto-save:', e.message);
    }
  }, 5000);
}

/* HELPERS */
function rowToUser(row) {
  if (!row) return null;
  return {
    name: row.name, email: row.email, role: row.role,
    salt: row.salt, hash: row.hash, createdAt: row.created_at,
    balance: row.balance, xp: row.xp, peak: row.peak,
    freeTokenAt: row.free_token_at,
    emailVerified: row.email_verified === 1,
    record: { plays: row.plays, won: row.won, lost: row.lost },
    tourneyToday: row.tourney_date ? { date: row.tourney_date, slot: row.tourney_slot } : null
  };
}

function getUser(key) {
  try {
    const res = db.exec('SELECT * FROM users WHERE key = ?', [key]);
    if (!res[0]) return null;
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return rowToUser(row);
  } catch (e) {
    console.error('❌ Error getUser:', e.message);
    return null;
  }
}

function saveUser(key, u) {
  try {
    db.run(`
      INSERT INTO users
      (key,name,email,role,salt,hash,created_at,balance,xp,peak,
       free_token_at,plays,won,lost,email_verified,tourney_date,tourney_slot)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET
        name=excluded.name, email=excluded.email, role=excluded.role,
        balance=excluded.balance, xp=excluded.xp, peak=excluded.peak,
        free_token_at=excluded.free_token_at, plays=excluded.plays,
        won=excluded.won, lost=excluded.lost,
        email_verified=excluded.email_verified,
        tourney_date=excluded.tourney_date, tourney_slot=excluded.tourney_slot`,
      [key, u.name, u.email||null, u.role||'user', u.salt, u.hash,
       u.createdAt||Date.now(), u.balance, u.xp, u.peak,
       u.freeTokenAt||0, u.record?.plays||0, u.record?.won||0,
       u.record?.lost||0, u.emailVerified?1:0,
       u.tourneyToday?.date||null, u.tourneyToday?.slot||null]
    );
    saveDB();
  } catch (e) {
    console.error('❌ Error saveUser:', e.message);
  }
}

function userExists(key) {
  try {
    const res = db.exec('SELECT key FROM users WHERE key = ?', [key]);
    return res.length > 0 && res[0].values.length > 0;
  } catch (e) {
    return false;
  }
}

function countUsers() {
  try {
    const res = db.exec('SELECT COUNT(*) FROM users');
    return res[0]?.values[0][0] || 0;
  } catch (e) {
    return 0;
  }
}

function saveVerifyToken(token, emailKey, expiresAt) {
  try {
    db.run('INSERT OR REPLACE INTO verify_tokens (token,email_key,expires_at) VALUES (?,?,?)',
      [token, emailKey, expiresAt]);
    saveDB();
  } catch (e) {
    console.error('❌ Error saveVerifyToken:', e.message);
  }
}

function getVerifyToken(token) {
  try {
    const res = db.exec('SELECT * FROM verify_tokens WHERE token = ?', [token]);
    if (!res[0]) return null;
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  } catch (e) {
    return null;
  }
}

function deleteVerifyToken(token) {
  try {
    db.run('DELETE FROM verify_tokens WHERE token = ?', [token]);
    saveDB();
  } catch (e) {
    console.error('❌ Error deleteVerifyToken:', e.message);
  }
}

/* SESIONES */
function saveSession(token, userKey) {
  try {
    db.run('INSERT OR REPLACE INTO sessions (token,user_key,created_at) VALUES (?,?,?)',
      [token, userKey, Date.now()]);
    saveDB();
  } catch (e) {
    console.error('❌ Error saveSession:', e.message);
  }
}

function getSession(token) {
  try {
    const res = db.exec('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!res[0]) return null;
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  } catch (e) {
    return null;
  }
}

function deleteSession(token) {
  try {
    db.run('DELETE FROM sessions WHERE token = ?', [token]);
    saveDB();
  } catch (e) {
    console.error('❌ Error deleteSession:', e.message);
  }
}

function cleanOldSessions(maxAgeMs) {
  try {
    const cutoff = Date.now() - maxAgeMs;
    db.run('DELETE FROM sessions WHERE created_at < ?', [cutoff]);
    saveDB();
  } catch (e) {
    console.error('❌ Error cleanOldSessions:', e.message);
  }
}

function verifyAllUsers() {
  try {
    db.run('UPDATE users SET email_verified = 1 WHERE email_verified = 0');
    saveDB();
  } catch (e) {
    console.error('❌ Error verifyAllUsers:', e.message);
  }
}

/* ✨ ESTADÍSTICAS DEL SERVIDOR */
function getServerStats() {
  try {
    const res = db.exec('SELECT * FROM server_stats WHERE key = "server"');
    if (!res[0]) return null;
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  } catch (e) {
    console.error('❌ Error getServerStats:', e.message);
    return null;
  }
}

function incrementTotalHands() {
  try {
    db.run('UPDATE server_stats SET total_hands = total_hands + 1 WHERE key = "server"');
    saveDB();
  } catch (e) {
    console.error('❌ Error incrementTotalHands:', e.message);
  }
}

function updatePeakUsers(n) {
  try {
    db.run('UPDATE server_stats SET peak_users = MAX(peak_users, ?) WHERE key = "server"', [n]);
    saveDB();
  } catch (e) {
    console.error('❌ Error updatePeakUsers:', e.message);
  }
}

module.exports = {
  initDB,
  getUser, saveUser, userExists, countUsers,
  saveVerifyToken, getVerifyToken, deleteVerifyToken,
  saveSession, getSession, deleteSession, cleanOldSessions,
  verifyAllUsers,
  getServerStats, incrementTotalHands, updatePeakUsers
};
