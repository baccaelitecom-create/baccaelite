'use strict';

const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://jasor64_db_user:djRVNrG2eMJo3WGR@cluster0.mhtpnrs.mongodb.net';
const DB_NAME = 'baccaelite';

let db;
let client;

async function initDB() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);

    console.log('✅ MongoDB conectado');

    // Crear colecciones e índices si no existen
    await createCollectionsAndIndexes();

    console.log('✅ Base de datos lista');
  } catch (e) {
    console.error('❌ Error MongoDB:', e.message);
    throw e;
  }
}

async function createCollectionsAndIndexes() {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    // Crear colecciones si no existen
    if (!collectionNames.includes('users')) {
      await db.createCollection('users');
    }
    if (!collectionNames.includes('sessions')) {
      await db.createCollection('sessions');
    }
    if (!collectionNames.includes('verify_tokens')) {
      await db.createCollection('verify_tokens');
    }
    if (!collectionNames.includes('server_stats')) {
      await db.createCollection('server_stats');
    }

    // Crear índices
    await db.collection('users').createIndex({ key: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
    await db.collection('verify_tokens').createIndex({ token: 1 }, { unique: true });
    await db.collection('server_stats').createIndex({ key: 1 }, { unique: true });

    // Inicializar estadísticas del servidor si no existen
    const statsCount = await db.collection('server_stats').countDocuments({ key: 'server' });
    if (statsCount === 0) {
      await db.collection('server_stats').insertOne({
        key: 'server',
        started_at: Date.now(),
        total_hands: 0,
        peak_users: 0
      });
      console.log('📊 Estadísticas del servidor inicializadas');
    }
  } catch (e) {
    console.error('❌ Error creando colecciones:', e.message);
  }
}

function rowToUser(doc) {
  if (!doc) return null;
  return {
    name: doc.name,
    email: doc.email,
    role: doc.role,
    salt: doc.salt,
    hash: doc.hash,
    createdAt: doc.created_at,
    balance: doc.balance,
    xp: doc.xp,
    netProfit: doc.net_profit,
    peak: doc.peak,
    freeTokenAt: doc.free_token_at,
    emailVerified: doc.email_verified === true,
    record: doc.record || { plays: 0, won: 0, lost: 0 },
    tourneyToday: doc.tourney_date ? { date: doc.tourney_date, slot: doc.tourney_slot } : null
  };
}

async function getUser(key) {
  try {
    const user = await db.collection('users').findOne({ key });
    return rowToUser(user);
  } catch (e) {
    console.error('❌ Error getUser:', e.message);
    return null;
  }
}

async function saveUser(key, u) {
  try {
    await db.collection('users').updateOne(
      { key },
      {
        $set: {
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
          email_verified: u.emailVerified ? true : false,
          record: {
            plays: u.record?.plays || 0,
            won: u.record?.won || 0,
            lost: u.record?.lost || 0
          },
          tourney_date: u.tourneyToday?.date || null,
          tourney_slot: u.tourneyToday?.slot || null
        }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error('❌ Error saveUser:', e.message);
  }
}

async function userExists(key) {
  try {
    const user = await db.collection('users').findOne({ key });
    return user !== null;
  } catch (e) {
    return false;
  }
}

async function countUsers() {
  try {
    return await db.collection('users').countDocuments();
  } catch (e) {
    console.error('❌ Error countUsers:', e.message);
    return 0;
  }
}

async function getAllUsers() {
  try {
    const users = await db.collection('users')
      .find()
      .sort({ xp: -1 })
      .toArray();
    return users.map(rowToUser);
  } catch (e) {
    console.error('❌ Error getAllUsers:', e.message);
    return [];
  }
}

async function saveVerifyToken(token, emailKey, expiresAt) {
  try {
    await db.collection('verify_tokens').updateOne(
      { token },
      {
        $set: {
          token,
          email_key: emailKey,
          expires_at: expiresAt
        }
      },
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
      {
        $set: {
          token,
          user_key: userKey,
          created_at: Date.now()
        }
      },
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
    await db.collection('users').updateMany(
      { email_verified: false },
      { $set: { email_verified: true } }
    );
  } catch (e) {
    console.error('❌ Error verifyAllUsers:', e.message);
  }
}

async function getServerStats() {
  try {
    return await db.collection('server_stats').findOne({ key: 'server' });
  } catch (e) {
    console.error('❌ Error getServerStats:', e.message);
    return null;
  }
}

async function incrementTotalHands() {
  try {
    await db.collection('server_stats').updateOne(
      { key: 'server' },
      { $inc: { total_hands: 1 } }
    );
  } catch (e) {
    console.error('❌ Error incrementTotalHands:', e.message);
  }
}

async function updatePeakUsers(n) {
  try {
    const stats = await getServerStats();
    const currentPeak = stats?.peak_users || 0;
    if (n > currentPeak) {
      await db.collection('server_stats').updateOne(
        { key: 'server' },
        { $set: { peak_users: n } }
      );
    }
  } catch (e) {
    console.error('❌ Error updatePeakUsers:', e.message);
  }
}

module.exports = {
  initDB,
  getUser,
  saveUser,
  userExists,
  countUsers,
  getAllUsers,
  saveVerifyToken,
  getVerifyToken,
  deleteVerifyToken,
  saveSession,
  getSession,
  deleteSession,
  cleanOldSessions,
  verifyAllUsers,
  getServerStats,
  incrementTotalHands,
  updatePeakUsers
};
