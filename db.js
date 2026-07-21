'use strict';

const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'baccaelite.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
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
  `);

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
             u.record?.lost||0, 1, // email_verified=1 para usuarios existentes
             u.tourneyToday?.date||null, u.tourneyToday?.slot||null]
          );
        }
        saveDB();
        console.log(`✅ Migrados ${Object.keys(users).length} usuarios a SQLite`);
      } catch(e) {
        console.error('Error migración:', e.message);
      }
    }
  }

  console.log('✅ SQLite listo');
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

/* -----------------------------------------------------------------------
   HELPERS
   ----------------------------------------------------------------------- */
function rowToUser(row) {
  if (!row) return null;
  return {
    name: row.name, email: row.email, role: row.role,
    salt: row.salt, hash: row.hash, createdAt: row.created_at,
    balance: row.balance, xp: row.xp, peak: row.peak,
    freeTokenAt: row.free_token_at,
    emailVerified: row.email_verified === 1,
    record: { plays: row.plays, won: row.won, lost: row.lost },
    tourneyToday: row.tourney_date
      ? { date: row.tourney_date, slot: row.tourney_slot } : null
  };
}

function getUser(key) {
  const res = db.exec('SELECT * FROM users WHERE key = ?', [key]);
  if (!res[0]) return null;
  const cols = res[0].columns;
  const vals = res[0].values[0];
  const row = {};
  cols.forEach((c, i) => row[c] = vals[i]);
  return rowToUser(row);
}

function saveUser(key, u) {
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
}

function userExists(key) {
  const res = db.exec('SELECT key FROM users WHERE key = ?', [key]);
  return res.length > 0 && res[0].values.length > 0;
}

function countUsers() {
  const res = db.exec('SELECT COUNT(*) FROM users');
  return res[0]?.values[0][0] || 0;
}

function saveVerifyToken(token, emailKey, expiresAt) {
  db.run('INSERT OR REPLACE INTO verify_tokens (token,email_key,expires_at) VALUES (?,?,?)',
    [token, emailKey, expiresAt]);
  saveDB();
}

function getVerifyToken(token) {
  const res = db.exec('SELECT * FROM verify_tokens WHERE token = ?', [token]);
  if (!res[0]) return null;
  const cols = res[0].columns;
  const vals = res[0].values[0];
  const row = {};
  cols.forEach((c, i) => row[c] = vals[i]);
  return row;
}

function deleteVerifyToken(token) {
  db.run('DELETE FROM verify_tokens WHERE token = ?', [token]);
  saveDB();
}

module.exports = {
  initDB,
  getUser, saveUser, userExists, countUsers,
  saveVerifyToken, getVerifyToken, deleteVerifyToken
};
