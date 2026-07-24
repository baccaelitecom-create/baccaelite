'use strict';

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/baccaelite';
const DB_NAME = 'baccaelite';

let client = null;
let db = null;
let usersCache = {}; // Caché en memoria
let serverStatsCache = { key: 'server', started_at: Date.now(), total_hands: 0, peak_users: 0 };

async function initDB() {
  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(DB_NAME);

    // Crear colecciones si no existen
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    if (!collectionNames.includes('users')) {
      await db.createCollection('users');
      await db.collection('users').createIndex({ key: 1 });
    }

    if (!collectionNames.includes('verify_tokens')) {
      await db.createCollection('verify_tokens');
      await db.collection('verify_tokens').createIndex({ token: 1 });
      await db.collection('verify_tokens').createIndex({ expires_at: 1 });
    }

    if (!collectionNames.includes('sessions')) {
      await db.createCollection('sessions');
      await db.collection('sessions').createIndex({ token: 1 });
    }

    if (!collectionNames.includes('server_stats')) {
      await db.createCollection('server_stats');
      await db.collection('server_stats').createIndex({ key: 1 });
      const stats = await db.collection('server_stats').findOne({ key: 'server' });
      if (!stats) {
        await db.collection('server_stats').insertOne({
          key: 'server',
          started_at: Date.now(),
          total_hands: 0,
          peak_users: 0
        });
      } else {
        serverStatsCache = stats;
      }
    }

    // Cargar usuarios en caché
    const users = await db.collection('users').find({}).toArray();
    users.forEach(u => {
      usersCache[u.key] = u;
    });

    console.log('✅ MongoDB conectado');
    console.log(`📊 BD: ${DB_NAME}, Usuarios en caché: ${Object.keys(usersCache).length}`);
  } catch (e) {
    console.error('❌ Error MongoDB:', e.message);
    throw e;
  }
}

function getUser(key) {
  const doc = usersCache[key];
  if (!doc) return null;
  return rowToUser(doc);
}

function saveUser(key, u) {
  const doc = {
    key,
    name: u.name,
    email: u.email || null,
    role: u.role || 'user',
    salt: u.salt,
    hash: u.hash,
    created_at: u.createdAt || Date.now(),
    balance: u.balance,
    xp: u.xp,
    net_profit: u.netProfit || 0,
    peak: u.peak,
    free_token_at: u.freeTokenAt || 0,
    plays: u.record?.plays || 0,
    won: u.record?.won || 0,
    lost: u.record?.lost || 0,
    email_verified: u.emailVerified ? 1 : 0,
    tourney_date: u.tourneyToday?.date || null,
    tourney_slot: u.tourneyToday?.slot || null
  };
  usersCache[key] = doc;
  // Sync a MongoDB en background (no esperar)
  if (db) {
    db.collection('users').updateOne(
      { key },
      { $set: doc },
      { upsert: true }
    ).catch(e => console.error('❌ Error sync saveUser:', e.message));
  }
}

function userExists(key) {
  return !!usersCache[key];
}

function countUsers() {
  return Object.keys(usersCache).length;
}

function getAllUsers() {
  return Object.values(usersCache)
    .sort((a, b) => b.xp - a.xp)
    .map(rowToUser);
}

async function saveVerifyToken(token, emailKey, expiresAt) {
  try {
    await db.collection('verify_tokens').updateOne(
      { token },
      { $set: { token, email_key: emailKey, expires_at: expiresAt }},
      { upsert: true }
    );
  } catch (e) {
    console.error('❌ Error saveVerifyToken:', e.message);
  }
}

async function getVerifyToken(token) {
  try {
    return await db.collection('verify_tokens').findOne({ token });
  } catch (e) {
    console.error('❌ Error getVerifyToken:', e.message);
    return null;
  }
}

async function deleteVerifyToken(token) {
  try {
    await db.collection('verify_tokens').deleteOne({ token });
  } catch (e) {
    console.error('❌ Error deleteVerifyToken:', e.message);
  }
}

async function saveSession(token, userKey) {
  try {
    await db.collection('sessions').updateOne(
      { token },
      { $set: { token, user_key: userKey, created_at: Date.now() }},
      { upsert: true }
    );
  } catch (e) {
    console.error('❌ Error saveSession:', e.message);
  }
}

async function getSession(token) {
  try {
    return await db.collection('sessions').findOne({ token });
  } catch (e) {
    console.error('❌ Error getSession:', e.message);
    return null;
  }
}

async function deleteSession(token) {
  try {
    await db.collection('sessions').deleteOne({ token });
  } catch (e) {
    console.error('❌ Error deleteSession:', e.message);
  }
}

async function cleanOldSessions(maxAgeMs) {
  try {
    const cutoff = Date.now() - maxAgeMs;
    await db.collection('sessions').deleteMany({ created_at: { $lt: cutoff } });
  } catch (e) {
    console.error('❌ Error cleanOldSessions:', e.message);
  }
}

async function verifyAllUsers() {
  try {
    // Actualizar caché
    Object.values(usersCache).forEach(u => u.email_verified = 1);
    // Sync a MongoDB
    await db.collection('users').updateMany(
      { email_verified: { $ne: 1 }},
      { $set: { email_verified: 1 }}
    );
  } catch (e) {
    console.error('❌ Error verifyAllUsers:', e.message);
  }
}

function getServerStats() {
  return { ...serverStatsCache };
}

function incrementTotalHands() {
  serverStatsCache.total_hands++;
  if (db) {
    db.collection('server_stats').updateOne(
      { key: 'server' },
      { $inc: { total_hands: 1 }}
    ).catch(e => console.error('❌ Error incrementTotalHands:', e.message));
  }
}

function updatePeakUsers(n) {
  if (n > serverStatsCache.peak_users) {
    serverStatsCache.peak_users = n;
    if (db) {
      db.collection('server_stats').updateOne(
        { key: 'server' },
        { $set: { peak_users: n }}
      ).catch(e => console.error('❌ Error updatePeakUsers:', e.message));
    }
  }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    name: row.name,
    email: row.email,
    role: row.role || 'user',
    salt: row.salt,
    hash: row.hash,
    createdAt: row.created_at,
    balance: row.balance,
    xp: row.xp,
    netProfit: row.net_profit || 0,
    peak: row.peak,
    freeTokenAt: row.free_token_at || 0,
    emailVerified: row.email_verified === 1,
    record: { plays: row.plays || 0, won: row.won || 0, lost: row.lost || 0 },
    tourneyToday: row.tourney_date ? { date: row.tourney_date, slot: row.tourney_slot } : null
  };
}

module.exports = {
  initDB,
  getUser, saveUser, userExists, countUsers, getAllUsers,
  saveVerifyToken, getVerifyToken, deleteVerifyToken,
  saveSession, getSession, deleteSession, cleanOldSessions,
  verifyAllUsers,
  getServerStats, incrementTotalHands, updatePeakUsers
};
