# 📚 KNOWLEDGE BASE - BaccaElite Baccarat Simulator

## 🎯 Contexto del Proyecto
**Nombre:** BaccaElite (Baccarat Online Simulator)  
**Tipo:** Multiplayer baccarat game (free-to-play, virtual coins)  
**Stack:** Node.js/Express + WebSocket + SQLite (sql.js)  
**Hosted:** Railway (https://baccaelite-production.up.railway.app)  
**GitHub:** https://github.com/baccaelitecom-create/baccaelite  
**Deployment:** git push → Railway auto-deploy

---

## 📂 Estructura GitHub

```
baccaelite/
├── server.js                 (Main HTTP/WebSocket server)
├── db.js                     (SQLite database with sql.js)
├── package.json
├── audio/                    (Sound files)
├── css/                      (Styles)
├── js/                       (Client-side JavaScript)
├── data/                     (SQLite DB + backup)
├── login.html
├── index.html
├── account.html
├── game_table.html
├── leaderboard.html
├── statistics.html
├── tournaments.html
├── public_tables.html
├── rules.html
├── verify-email.html
├── .env.example
└── .gitignore
```

---

## 🔴 PROBLEMAS IDENTIFICADOS (04/07/2026)

### PROBLEMA #1: BD se borra al hacer operaciones
**Síntoma:** Usuarios que se registran desaparecen tras reiniciar servidor  
**Causa:** sql.js solo guarda en memoria. `db.js` línea 52 llama `saveDB()` solo cuando hay cambios.  
**Si:** Servidor crashea sin operaciones recientes → datos se pierden  
**Si:** No hay auto-save → BD no persiste garantizado

**Archivo afectado:** `db.js`  
**Función:** `saveDB()` (línea 52)  
**Problema específico:**
```javascript
// MALO: Solo se llama en cambios
function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}
```

### PROBLEMA #2: Apuestas no persisten
**Síntoma:** Usuarios hacen apuesta, servidor reinicia, balance no cambió  
**Causa:** Apuestas solo en WebSocket memory, NO en BD  
**Archivo afectado:** `server.js` línea 801 (mesa pública) y 854 (torneo)  
**Problema específico:**
```javascript
// MALO: Solo en memoria
if (b) { 
  ws.tableBets = b;  // ← Solo aquí
  tSend(ws, { t: 'bets-ok', bets: b }); 
}
```

### PROBLEMA #3: Falta estadísticas del servidor
**Síntoma:** Statistics.html muestra "null" en uptime, manos totales, peak users  
**Causa:** No existe tabla `server_stats` en BD  
**Causa:** No hay funciones para trackear: `getServerStats()`, `incrementTotalHands()`, `updatePeakUsers()`  
**Archivo afectado:** `db.js` (falta tabla + funciones)  
**Archivo afectado:** `server.js` (falta imports + endpoint `/api/stats`)

### PROBLEMA #4: Sin imports de nuevas funciones
**Síntoma:** ReferenceError: incrementTotalHands is not defined  
**Causa:** `server.js` línea 8-13 no importa las 3 funciones nuevas  
**Archivo afectado:** `server.js` línea 8-13

---

## ✅ SOLUCIONES IMPLEMENTADAS

### SOLUCIÓN #1: Auto-save + Backup
**Archivo:** `db.js`  
**Cambios:**
- Agregó tabla `server_stats`
- Función `startAutoSave()` → guarda cada 5 segundos
- Función `saveDB()` ahora crea backup antes de guardar
- Try/catch en todas las operaciones DB

**Funciones nuevas:**
```javascript
function startAutoSave() {
  autoSaveTimer = setInterval(() => saveDB(), 5000);
}

function incrementTotalHands() {
  db.run('UPDATE server_stats SET total_hands = total_hands + 1 WHERE key = "server"');
  saveDB();
}

function updatePeakUsers(n) {
  db.run('UPDATE server_stats SET peak_users = MAX(peak_users, ?) WHERE key = "server"', [n]);
  saveDB();
}

function getServerStats() {
  return db.exec('SELECT * FROM server_stats WHERE key = "server"')[0];
}
```

### SOLUCIÓN #2: Apuestas persistentes
**Archivo:** `server.js` línea 801 y 854  
**Cambio:**
```javascript
// ANTES
if (b) { ws.tableBets = b; tSend(...); }

// DESPUÉS
if (b) { 
  u.balance -= (b.PLAYER + b.BANKER + b.TIE);  // ← Guardar en objeto usuario
  saveUser(ws.accKey, u);  // ← Guardar en BD
  ws.tableBets = b; 
  tSend(...); 
}
```

**Ubicaciones exactas:**
- Línea ~801: Tabla pública (twss connection)
- Línea ~854: Torneo (twss2 connection)

### SOLUCIÓN #3: Endpoint /api/stats
**Archivo:** `server.js`  
**Ubicación:** Agregar ANTES de línea 664 (`const wss = new WebSocketServer`)  
**Código:**
```javascript
if (pathname === '/api/stats' && req.method === 'GET') {
  const stats = getServerStats();
  const uptime = Date.now() - (stats?.started_at || SERVER_START);
  return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    uptime,
    totalHands: stats?.total_hands || 0,
    peakUsersOnline: stats?.peak_users || 0,
    registeredUsers: countUsers()
  }));
}
```

### SOLUCIÓN #4: Actualizar imports
**Archivo:** `server.js` línea 8-13  
**Cambio:**
```javascript
// ANTES
const { initDB, getUser, saveUser, userExists, countUsers, ... } = require('./db');

// DESPUÉS
const { initDB, getUser, saveUser, userExists, countUsers, ..., 
  getServerStats, incrementTotalHands, updatePeakUsers  // ← AGREGAR
} = require('./db');
```

### SOLUCIÓN #5: Tracking de estadísticas
**Archivo:** `server.js`  
**Ubicaciones:**
- Línea 676: `updatePeakUsers(wss.clients.size)` (chat connection)
- Línea 752: `incrementTotalHands()` (después de t.hand++)
- Línea 798: `updatePeakUsers(t.clients.size)` (mesa pública)
- Línea 845: `updatePeakUsers(t.clients.size)` (torneo)

---

## 🔧 CAMBIOS TOTALES EN ARCHIVOS

### db.js
- ✅ Agregar tabla `server_stats` en `initDB()`
- ✅ Agregar `startAutoSave()` al final de `initDB()`
- ✅ Modificar `saveDB()` para crear backup
- ✅ Agregar 3 funciones: `getServerStats()`, `incrementTotalHands()`, `updatePeakUsers()`
- ✅ Exportar las 3 funciones nuevas en `module.exports`
- ✅ Agregar try/catch en todas las funciones

**Líneas totales agregadas:** ~50

### server.js
- ✅ Línea 8-13: Agregar 3 imports nuevos
- ✅ Línea 16: Agregar `const SERVER_START = Date.now()`
- ✅ Línea ~660: Agregar función `formatUptime()` y endpoint `/api/stats` (~13 líneas)
- ✅ Línea 676: Agregar `updatePeakUsers(wss.clients.size)`
- ✅ Línea 752: Agregar `incrementTotalHands()`
- ✅ Línea 798: Agregar `updatePeakUsers(t.clients.size)`
- ✅ Línea 801: Agregar balance -= y saveUser (2 líneas)
- ✅ Línea 845: Agregar `updatePeakUsers(t.clients.size)`
- ✅ Línea 854: Agregar balance -= y saveUser (2 líneas)

**Líneas totales agregadas:** ~21

---

## 🚨 ERRORES COMETIDOS EN ESTA SESIÓN

### Error #1: "He estado dando soluciones sin entender tu setup real"
**Qué pasó:** Dí fixes genéricos sin considerar:
- Que el código estaba en GitHub
- Que usaban git push para deploy
- Que Railway auto-deployaba
- La estructura exacta del proyecto

**Lección:** Siempre preguntar PRIMERO:
1. ¿Dónde está el código? (GitHub/local)
2. ¿Dónde está deployado? (Railway/Heroku/otro)
3. ¿Cómo es el flujo de deploy?
4. ¿Estructura exacta del proyecto?

**Cómo evitarlo:** Pedir captura/screenshots de estructura GitHub ANTES de proponer soluciones.

### Error #2: "Acumulando errores todos los días"
**Qué pasó:** Sin ver el código real, asumí problemas que no existían:
- Asumí que el bug era por upload de archivos
- Dí soluciones para localhost que no aplican a Railway
- Dí patches que no consideraban GitHub workflow

**Lección:** VER CÓDIGO PRIMERO, proponer después.

### Error #3: "Editaste todo sin considerar GitHub"
**Qué pasó:** 
- Dí archivos sueltos sin flujo git
- No consideré que suben con `git push`
- Asumí que cualquier cambio local funcionaba

**Lección:** Siempre proporcionar:
1. Archivos que reemplazan exactamente lo existente
2. Instrucciones de git (git pull → edit → git push)
3. Números de línea exactos (no "alrededor de línea X")
4. Antes/Después código

---

## 📋 CHECKLIST PARA FUTURAS SESIONES

**ANTES de proponer fixes:**
- [ ] Ver estructura GitHub (captura)
- [ ] Ver server.js COMPLETO
- [ ] Ver db.js COMPLETO
- [ ] Ver package.json
- [ ] Preguntar: ¿dónde deployado?
- [ ] Preguntar: ¿cómo es el workflow git?
- [ ] Preguntar: ¿qué error exacto ven?

**AL proponer fixes:**
- [ ] Dar números de línea exactos (no "alrededor de")
- [ ] Dar Antes/Después para cada cambio
- [ ] Incluir flujo git específico (git pull → edit → git push)
- [ ] Crear archivos que reemplazan exactamente los existentes
- [ ] Documentar qué se arregla y por qué

**DESPUÉS de proponer:**
- [ ] Esperar confirmación que funciona
- [ ] No acumular más cambios sin verificar
- [ ] Si falla algo, pedir error exacto de consola

---

## 🔗 PRÓXIMAS FEATURES PENDIENTES

1. **Chat Profesional** (DMs + global chat)
   - Agregar tabla `direct_messages`
   - Agregar endpoint `/api/dm`
   - WebSocket para chat privado

2. **Multi-idioma** (7 idiomas)
   - Crear archivo JSON: `i18n.json`
   - Idiomas: ES, EN, FR, DE, IT, PT, RU
   - Agregar `lang` query param a HTML

3. **Leaderboard real**
   - Ranking por balance
   - Ranking por XP
   - Ranking por winrate

4. **Statistics.html mejorado**
   - Usar `/api/stats` endpoint
   - Mostrar gráficos de uptime
   - Top 10 players

---

## 🧪 TESTING CHECKLIST

Después de cada deploy:
- [ ] `curl https://url/api/stats` → devuelve JSON
- [ ] Crear usuario → reiniciar servidor → usuario sigue ahí
- [ ] Hacer apuesta → reiniciar servidor → balance cambió
- [ ] Múltiples usuarios → ver `peak_users` subir
- [ ] Jugar 5 manos → ver `total_hands` = 5

---

## 📞 CONTACTOS/REFERENCIAS

**GitHub:** https://github.com/baccaelitecom-create/baccaelite  
**Deploy:** Railway (https://baccaelite-production.up.railway.app)  
**Email:** Resend API (noreply@baccaelite.com)  
**DB:** SQLite (sql.js) - En memoria + archivo en `/data/baccaelite.db`

---

## 📝 NOTAS IMPORTANTES

1. **sql.js es en memoria** → SIEMPRE necesita `saveDB()` para persistir
2. **Railway reinicia cada X tiempo** → Auto-save CRÍTICO
3. **WebSocket stateless** → Todo en BD
4. **Backup automático** → Si BD se corrompe, restaurar desde `.backup.db`
5. **Variables de entorno** → No hardcodear URLs (usar `process.env.APP_URL`)
6. **Rutas relativas** → `/api/stats`, no `http://localhost:3000/api/stats`

---

## 🎯 RESUMEN RÁPIDO

**El bug:** BD se pierde porque sql.js sin auto-save  
**La solución:** Auto-save cada 5s + backup automático  
**El segundo bug:** Apuestas solo en memoria  
**La solución:** Guardar en BD inmediatamente  
**Tercer problema:** Sin estadísticas  
**La solución:** Tabla `server_stats` + endpoint `/api/stats`  

**Total de cambios:** ~71 líneas en 2 archivos (db.js + server.js)

---

**Última actualización:** 23 Julio 2026  
**Sesión:** BaccaElite Critical Fixes #1
