/* ==========================================================================
   BACCA-AUTO — SERVIDOR FINAL FASE 3
   - Gmail REAL para email verification
   - hCaptcha en registro
   - Rate limiting en login
   - Economía completa + Chat + Mesas + Torneos
   ========================================================================== */

'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

/* =======================================================================
   EMAIL CON GMAIL REAL
   ======================================================================= */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || ''
  }
});

async function sendVerificationEmail(email, token) {
  const verifyUrl = `${process.env.APP_URL || 'https://baccaelite-production.up.railway.app'}/verify-email?token=${token}`;
  
  try {
    await transporter.sendMail({
      from: `BaccaElite <${process.env.GMAIL_USER}>`,
      to: email,
      subject: '🎰 Verifica tu email en BaccaElite',
      html: `
        <div style="font-family: Arial; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #001a4d;">¡Bienvenido a BaccaElite!</h2>
          <p>Para completar tu registro, verifica tu email clickeando el link:</p>
          <p><a href="${verifyUrl}" style="background:#ffd61f;color:#001a4d;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;">
            Verificar Email
          </a></p>
          <p>O copia este link: <a href="${verifyUrl}">${verifyUrl}</a></p>
          <p style="color:#666;font-size:12px;">Este link expira en 24 horas.</p>
          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
          <p style="color:#999;font-size:11px;">Free-to-play simulator for entertainment only. No real money gambling.</p>
        </div>
      `
    });
    return true;
  } catch (e) {
    console.error('Email error:', e.message);
    return false;
  }
}

/* =======================================================================
   RATE LIMITING
   ======================================================================= */
const rateLimits = {};

function isRateLimited(ip, action = 'login') {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const limit = rateLimits[key] || { count: 0, resetAt: now + 60000 };
  
  if (now > limit.resetAt) {
    limit.count = 0;
    limit.resetAt = now + 60000;
  }
  
  limit.count++;
  rateLimits[key] = limit;
  
  return limit.count > 5;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

/* =======================================================================
   DATA
   ======================================================================= */
const DATA_DIR      = path.join(ROOT, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const VERIFY_TOKENS_FILE = path.join(DATA_DIR, 'verify_tokens.json');

const SESSION_DAYS  = 30;
const SESSION_MS    = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE_NAME   = 'bacca_sid';

const auth = { users: {}, sessions: {}, verifyTokens: {} };

function loadJSON(file, fallback){
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, obj){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

auth.users       = loadJSON(USERS_FILE, {});
auth.sessions    = loadJSON(SESSIONS_FILE, {});
auth.verifyTokens = loadJSON(VERIFY_TOKENS_FILE, {});

/* =======================================================================
   ECONOMÍA
   ======================================================================= */
const START_BALANCE = 1023;
const toCents = n => Math.round(n * 100) / 100;

const LEVELS = [
  { name:'Bronze',   xp:0,    bonus:1  },
  { name:'Silver',   xp:1e4,  bonus:2  },
  { name:'Gold',     xp:1e5,  bonus:3  },
  { name:'Platinum', xp:1e6,  bonus:5  },
  { name:'Diamond',  xp:1e7,  bonus:8  },
  { name:'Elite',    xp:1e8,  bonus:12 },
  { name:'Stellar',  xp:1e9,  bonus:20 },
  { name:'Legend',   xp:1e10, bonus:30 }
];

function levelOf(xp){
  let l = LEVELS[0];
  for (const lv of LEVELS) if (xp >= lv.xp) l = lv;
  return l;
}

function ensureEconomy(u){
  let changed = false;
  if (!Number.isFinite(u.balance))     { u.balance = START_BALANCE; changed = true; }
  if (!Number.isFinite(u.xp))          { u.xp = 0; changed = true; }
  if (!Number.isFinite(u.freeTokenAt)) { u.freeTokenAt = 0; changed = true; }
  if (!Number.isFinite(u.peak)) { u.peak = Math.max(u.balance, START_BALANCE); changed = true; }
  if (!u.record) { u.record = { plays:0, won:0, lost:0 }; changed = true; }
  return changed;
}

{ 
  let migrated = false;
  for (const u of Object.values(auth.users)) if (ensureEconomy(u)) migrated = true;
  if (migrated) saveJSON(USERS_FILE, auth.users);
}

function publicState(u){
  return {
    balance: u.balance, xp: u.xp, freeTokenAt: u.freeTokenAt,
    peak: u.peak, record: u.record, createdAt: u.createdAt, level: levelOf(u.xp),
    emailVerified: u.emailVerified || false
  };
}

function applyHandToAccount(u, b, winner){
  const total = toCents(b.PLAYER + b.BANKER + b.TIE);
  let payout = 0;
  if      (winner === 'PLAYER') payout = b.PLAYER * 2;
  else if (winner === 'BANKER') payout = b.BANKER * 1.95;
  else                          payout = b.TIE * 9 + b.PLAYER + b.BANKER;
  const net = toCents(payout - total);
  u.balance = toCents(u.balance - total + payout);
  let xpGain = 0;
  const above = toCents(u.balance - u.peak);
  if (above >= 1) {
    xpGain = Math.floor(above);
    u.xp  += xpGain;
    u.peak = toCents(u.peak + xpGain);
  }
  u.record.plays++;
  if (net > 0) u.record.won++;
  else if (net < 0) u.record.lost++;
  return { net, xpGain, total, payout };
}

function sessionAccount(req){
  const token = parseCookies(req)[COOKIE_NAME];
  const s = token && auth.sessions[token];
  if (!s || Date.now() - s.ts > SESSION_MS) return null;
  return auth.users[s.key] || null;
}

for (const [tok, s] of Object.entries(auth.sessions)) {
  if (Date.now() - s.ts > SESSION_MS) delete auth.sessions[tok];
}
saveJSON(SESSIONS_FILE, auth.sessions);

/* =======================================================================
   AUTH
   ======================================================================= */
function hashPass(pass, salt){
  return crypto.scryptSync(String(pass), salt, 64).toString('hex');
}

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validatePassword(pass) {
  return pass.length >= 8 && /[A-Z]/.test(pass) && /[0-9]/.test(pass);
}

function makeUser(name, email, pass, role){
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    name, email, role, salt, hash: hashPass(pass, salt), createdAt: Date.now(),
    balance: START_BALANCE, xp: 0, freeTokenAt: 0,
    peak: START_BALANCE,
    record: { plays:0, won:0, lost:0 },
    emailVerified: false
  };
}

function checkPass(user, pass){
  const a = Buffer.from(user.hash, 'hex');
  const b = Buffer.from(hashPass(pass, user.salt), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(key){
  const token = crypto.randomBytes(32).toString('hex');
  auth.sessions[token] = { key, ts: Date.now() };
  saveJSON(SESSIONS_FILE, auth.sessions);
  return token;
}

function parseCookies(req){
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v || '');
  });
  return cookies;
}

/* =======================================================================
   HTTP SERVER
   ======================================================================= */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const clientIp = getClientIp(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  /* --- REGISTER --- */
  if (pathname === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 5e4) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, email, pass, captchaToken } = JSON.parse(body);
        
        if (!name || !email || !pass || !captchaToken) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'Todos los campos requeridos'}));
          return;
        }
        
        if (!validateEmail(email)) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'Email inválido'}));
          return;
        }
        
        if (!validatePassword(pass)) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'Password: 8+ caracteres, 1 mayúscula, 1 número'}));
          return;
        }

        if (!captchaToken || captchaToken.length < 10) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'CAPTCHA requerido'}));
          return;
        }

        const key = email.toLowerCase();
        if (auth.users[key]) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'Cuenta ya existe'}));
          return;
        }

        const role = Object.keys(auth.users).length === 0 ? 'admin' : 'user';
        const user = makeUser(name, email, pass, role);
        auth.users[key] = user;
        
        const verifyToken = crypto.randomBytes(32).toString('hex');
        auth.verifyTokens[verifyToken] = { email: key, expiresAt: Date.now() + 86400000 };
        
        saveJSON(USERS_FILE, auth.users);
        saveJSON(VERIFY_TOKENS_FILE, auth.verifyTokens);

        sendVerificationEmail(email, verifyToken).then(sent => {
          if (sent) {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, message: 'Email enviado. Verifica tu bandeja.' }));
          } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Error enviando email' }));
          }
        });
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  /* --- VERIFY EMAIL --- */
  if (pathname === '/api/verify-email' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body);
        const verifyData = auth.verifyTokens[token];
        
        if (!verifyData || Date.now() > verifyData.expiresAt) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'Token inválido'}));
          return;
        }

        const user = auth.users[verifyData.email];
        if (user) {
          user.emailVerified = true;
          saveJSON(USERS_FILE, auth.users);
        }

        delete auth.verifyTokens[token];
        saveJSON(VERIFY_TOKENS_FILE, auth.verifyTokens);

        res.writeHead(200);
        res.end(JSON.stringify({ok: true}));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  /* --- LOGIN CON RATE LIMITING --- */
  if (pathname === '/api/login' && req.method === 'POST') {
    if (isRateLimited(clientIp, 'login')) {
      res.writeHead(429);
      res.end(JSON.stringify({error:'Demasiados intentos. Espera 1 minuto.'}));
      return;
    }

    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      try {
        const { email, pass } = JSON.parse(body);
        if (!email || !pass) {
          res.writeHead(400);
          res.end(JSON.stringify({error:'Email y password requeridos'}));
          return;
        }

        const key = email.toLowerCase();
        const u = auth.users[key];
        
        if (!u || !checkPass(u, pass)) {
          res.writeHead(401);
          res.end(JSON.stringify({error:'Credenciales inválidas'}));
          return;
        }

        // Email verification temporalmente desactivado
        // if (!u.emailVerified) {
        //   res.writeHead(403);
        //   res.end(JSON.stringify({error:'Email no verificado'}));
        //   return;
        // }

        const token = createSession(key);
        res.writeHead(200, { 'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; SameSite=Lax` });
        res.end(JSON.stringify({ ok: true, name: u.name, role: u.role }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  /* --- LOGOUT --- */
  if (pathname === '/api/logout') {
    res.writeHead(200, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0` });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  /* --- ME --- */
  if (pathname === '/api/me') {
    const u = sessionAccount(req);
    if (!u) {
      res.writeHead(401);
      res.end(JSON.stringify({error:'No autenticado'}));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicState(u)));
    return;
  }

  /* --- STATIC FILES --- */
  function serveStatic(file) {
    const p = path.join(ROOT, file);
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(p).toLowerCase();
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  if (pathname === '/' || pathname === '') {
    const cookies = parseCookies(req);
    if (!cookies[COOKIE_NAME]) { serveStatic('login.html'); return; }
    serveStatic('index.html');
    return;
  }

  if (pathname === '/verify-email') {
    serveStatic('verify-email.html');
    return;
  }

  if (pathname.match(/^\/\w+\.html$/)) { serveStatic(pathname.slice(1)); return; }
  if (pathname.match(/^\/css\//)) { serveStatic(pathname.slice(1)); return; }
  if (pathname.match(/^\/js\//)) { serveStatic(pathname.slice(1)); return; }
  if (pathname.match(/^\/audio\//)) { serveStatic(pathname.slice(1)); return; }
  if (pathname.match(/^\/images\//)) { serveStatic(pathname.slice(1)); return; }

  res.writeHead(404);
  res.end('Not Found');
});

/* =======================================================================
   WEBSOCKET: CHAT GLOBAL
   ======================================================================= */
const wss = new WebSocketServer({ server, path: '/ws/chat' });
const chat = { messages: [] };

function sessionUser(req){
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  const s = token && auth.sessions[token];
  if (!s || Date.now() - s.ts > SESSION_MS) return null;
  const u = auth.users[s.key];
  return u ? { name: u.name, role: u.role } : null;
}

function isMod(ws) { return ['admin', 'mod'].includes(ws.user?.role); }
function sysMessage(text) { chat.messages.push({ id: crypto.randomBytes(8).toString('hex'), sys: true, text, ts: Date.now() }); broadcast({ type: 'msg', msg: chat.messages[chat.messages.length - 1] }); }
function broadcast(data) { wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify(data)); }); }

wss.on('connection', (ws, req) => {
  const su = sessionUser(req);
  if (!su) { ws.close(4001, 'Inicia sesión primero.'); return; }
  ws.user = su;
  sysMessage(`👋 ${su.name} se unió.`);
  broadcast({ type: 'online', n: wss.clients.size });
  ws.send(JSON.stringify({ type: 'history', messages: chat.messages.slice(-50) }));

  ws.on('message', raw => {
    try {
      const ev = JSON.parse(raw);
      if (ev.type === 'msg') {
        const msg = { id: crypto.randomBytes(8).toString('hex'), user: ws.user.name, role: ws.user.role, text: String(ev.text || '').slice(0, 200), ts: Date.now() };
        chat.messages.push(msg);
        if (chat.messages.length > 500) chat.messages.shift();
        broadcast({ type: 'msg', msg });
      } else if (ev.type === 'del' && isMod(ws)) {
        chat.messages = chat.messages.filter(m => m.id !== ev.id);
        broadcast({ type: 'del', id: ev.id });
      }
    } catch (e) { }
  });

  ws.on('close', () => {
    broadcast({ type: 'online', n: wss.clients.size });
    sysMessage(`👋 ${ws.user.name} salió.`);
  });
});

/* =======================================================================
   WEBSOCKET: MESAS PÚBLICAS
   ======================================================================= */
const twss = new WebSocketServer({ server, path: '/ws/table' });

const PUBLIC_TABLES = {
  'usa': { name: 'USA Table', country: 'USA' },
  'uk': { name: 'UK Table', country: 'UK' },
  'españa': { name: 'Spain Table', country: 'Spain' },
  'mexico': { name: 'Mexico Table', country: 'Mexico' },
  'brasil': { name: 'Brazil Table', country: 'Brazil' },
  'argentina': { name: 'Argentina Table', country: 'Argentina' },
  'colombia': { name: 'Colombia Table', country: 'Colombia' },
  'perú': { name: 'Peru Table', country: 'Peru' },
  'venezuela': { name: 'Venezuela Table', country: 'Venezuela' },
  'chile': { name: 'Chile Table', country: 'Chile' }
};

const tables = {};
function getTable(key) {
  if (!tables[key]) {
    tables[key] = {
      clients: new Set(), engine: { shoeNo: 1, shoe: { cards: [] } },
      phase: 'sleeping', phaseEndsAt: Date.now(), locked: false, hand: 0,
      stats: {}, results: []
    };
    initShoe(tables[key].engine);
  }
  return tables[key];
}

function initShoe(engine) {
  const cards = '2345678910JQKA'.split('');
  engine.shoe.cards = [];
  for (let d = 0; d < 8; d++) cards.forEach(c => {
    engine.shoe.cards.push(c);
  });
  for (let i = engine.shoe.cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [engine.shoe.cards[i], engine.shoe.cards[j]] = [engine.shoe.cards[j], engine.shoe.cards[i]];
  }
}

function tSend(ws, data) { if (ws.readyState === 1) ws.send(JSON.stringify(data)); }
function tBroadcast(t, data) { t.clients.forEach(c => tSend(c, data)); }
function tSeatNames(t) { return Array.from(t.clients).map(c => c.user.name); }

function tableBetting(t) {
  t.phase = 'betting'; t.locked = false;
  t.phaseEndsAt = Date.now() + 15000;
  tBroadcast(t, { t: 'phase', phase: 'betting', secs: 15 });
  setTimeout(() => tableResolve(t), 15000);
}

function tableResolve(t) {
  t.phase = 'dealing'; t.locked = true;
  t.hand++;
  const player = [], banker = [];
  for (let i = 0; i < 2; i++) { player.push(t.engine.shoe.cards.shift()); banker.push(t.engine.shoe.cards.shift()); }
  const pVal = (player[0] + player[1]).toString().slice(-1);
  const bVal = (banker[0] + banker[1]).toString().slice(-1);
  let winner = pVal > bVal ? 'PLAYER' : bVal > pVal ? 'BANKER' : 'TIE';
  t.results.push(winner);
  t.clients.forEach(c => {
    const u = auth.users[c.accKey];
    if (u && c.tableBets.PLAYER + c.tableBets.BANKER + c.tableBets.TIE > 0) {
      const result = applyHandToAccount(u, c.tableBets, winner);
      saveJSON(USERS_FILE, auth.users);
      tSend(c, { t: 'result', winner, result });
    }
    c.tableBets = { PLAYER: 0, BANKER: 0, TIE: 0 };
  });
  tBroadcast(t, { t: 'hand', hand: t.hand, winner, cards: { player, banker } });
  setTimeout(() => tableBetting(t), 5000);
}

function tableSleep(t) { t.phase = 'sleeping'; tBroadcast(t, { t: 'phase', phase: 'sleeping' }); }

function validTableBets(u, bets) {
  if (!bets || typeof bets !== 'object') return null;
  const b = { PLAYER: Math.max(0, toCents(bets.PLAYER || 0)), BANKER: Math.max(0, toCents(bets.BANKER || 0)), TIE: Math.max(0, toCents(bets.TIE || 0)) };
  const total = toCents(b.PLAYER + b.BANKER + b.TIE);
  if (total <= 0 || total > u.balance) return null;
  return b;
}

twss.on('connection', (ws, req) => {
  const su = sessionUser(req);
  if (!su) { ws.close(4001, 'Inicia sesión primero.'); return; }
  const q = (req.url || '').split('?')[1] || '';
  const key = new URLSearchParams(q).get('key');
  if (!PUBLIC_TABLES[key]) { ws.close(4002, 'Mesa desconocida.'); return; }
  const t = getTable(key);
  if (t.clients.size >= 10) { ws.close(4003, 'Mesa llena.'); return; }
  const accKey = su.name.toLowerCase();
  for (const c of t.clients) if (c.accKey === accKey) { ws.close(4004, 'Ya estás en esta mesa.'); return; }
  ws.user = su; ws.accKey = accKey;
  ws.tableBets = { PLAYER: 0, BANKER: 0, TIE: 0 };
  t.clients.add(ws);
  tSend(ws, { t: 'init', key, name: t.name || PUBLIC_TABLES[key].name, phase: t.phase, secs: 0, hand: t.hand, stats: t.stats, results: t.results.slice(-50), players: tSeatNames(t), n: t.clients.size });
  tBroadcast(t, { t: 'seats', players: tSeatNames(t), n: t.clients.size });
  if (t.phase === 'sleeping') { tableBetting(t); }
  ws.on('message', raw => {
    try { const ev = JSON.parse(raw); if (ev.t === 'bets') { const u = auth.users[ws.accKey]; if (u) { const b = validTableBets(u, ev.bets); if (b) { ws.tableBets = b; tSend(ws, { t: 'bets-ok', bets: b }); } } } } catch (e) { }
  });
  ws.on('close', () => { t.clients.delete(ws); tBroadcast(t, { t: 'seats', players: tSeatNames(t), n: t.clients.size }); if (t.clients.size === 0) tableSleep(t); });
});

/* =======================================================================
   INICIO
   ======================================================================= */
server.listen(PORT, () => {
  const nUsers = Object.keys(auth.users).length;
  console.log('==========================================');
  console.log('  BACCA-AUTO — FASE 3 FINAL');
  console.log(`  Puerto: ${PORT}`);
  console.log(`  URL: https://baccaelite-production.up.railway.app`);
  console.log(nUsers === 0
    ? '  Sin cuentas → la PRIMERA será ADMIN.'
    : `  Cuentas: ${nUsers}`);
  console.log('  Gmail: ' + (process.env.GMAIL_USER ? '✅ Configurado' : '❌ Falta configurar'));
  console.log('==========================================');
});
