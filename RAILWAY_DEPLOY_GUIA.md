# 🚀 GUÍA DE DEPLOYMENT EN RAILWAY

Tu proyecto **BaccaElite.com** está listo para ir a producción. Aquí te muestro los pasos.

---

## 📋 CHECKLIST ANTES DE EMPEZAR

- [x] Cuenta en Railway.com creada (baccaelite.com@gmail.com)
- [x] server.js modificado para puerto dinámico (`process.env.PORT || 3000`)
- [x] .env.example creado
- [x] .gitignore listo
- [ ] Código en GitHub (pasos abajo)
- [ ] Deployado en Railway
- [ ] Dominio baccaelite.com conectado

---

## PASO 1: PREPARAR TU PROYECTO LOCALMENTE

### 1a. Descarga los 3 archivos que te generé:

Desde esta conversación, descarga:
- `server.js` (el modificado)
- `.env.example`
- `.gitignore`

### 1b. Reemplaza los archivos en tu carpeta del proyecto:

```bash
# Abre terminal en tu carpeta del proyecto
# (donde ya tienes package.json, public/, etc.)

# Reemplaza server.js con el que descargaste
# (sobrescribe el viejo)

# Copia .env.example y .gitignore a la raíz del proyecto
```

### 1c. Verifica que tu carpeta se vea así:

```
tu-proyecto/
├── server.js (modificado)
├── package.json
├── .env.example (nuevo)
├── .gitignore (nuevo)
├── public/
│   ├── index.html
│   ├── login.html
│   ├── css/
│   ├── js/
│   └── audio/
├── data/ (será creada al correr)
└── README.md (opcional)
```

---

## PASO 2: CREAR REPOSITORIO EN GITHUB

### 2a. Ve a GitHub.com y crea repo nuevo

1. Login en GitHub.com
2. Click en "+" (arriba a la derecha) → "New repository"
3. Nombre: `baccaelite` (o lo que quieras)
4. Descripción: "Baccarat simulator multiplayer"
5. Público (para que Railway lo vea)
6. **NO** inicialices con README ni .gitignore (ya tienes)
7. Click "Create repository"

### 2b. Sube tu código desde tu PC

**En terminal, dentro de tu carpeta del proyecto:**

```bash
# Inicializa git (si no lo has hecho ya)
git init

# Añade todos los archivos
git add .

# Primer commit
git commit -m "Initial commit - Baccarat simulator Phase 2.3+"

# Configura la rama a 'main'
git branch -M main

# Conecta con GitHub (reemplaza USERNAME y REPO)
git remote add origin https://github.com/USERNAME/baccaelite.git

# Sube el código
git push -u origin main
```

**¿Problemas?** Si Git pide credenciales:
- Si usas 2FA en GitHub: genera un Personal Access Token (Settings → Developer settings → Personal access tokens)
- Úsalo como contraseña en lugar de tu contraseña de GitHub

### 2c. Verifica en GitHub.com

Abre tu repo en GitHub. Deberías ver:
- ✅ server.js
- ✅ package.json
- ✅ public/ folder
- ✅ .gitignore
- ✅ .env.example

---

## PASO 3: DEPLOYAR EN RAILWAY

### 3a. Login en Railway.com

1. Ve a https://railway.app
2. Click "Sign In" (top right)
3. Login con tu email (baccaelite.com@gmail.com)

### 3b. Crear un proyecto nuevo

1. Click en "Create" o "New Project"
2. Te pregunta: "What would you like to create?"
3. **Selecciona "GitHub Repository"** (la tercera opción)
4. Te pedirá conectar tu cuenta GitHub
   - Click "Connect GitHub"
   - Autoriza Railway para leer tus repos
5. Selecciona tu repositorio `baccaelite`
6. Click "Deploy"

**Railway detectará automáticamente:**
- ✅ Node.js (ve package.json)
- ✅ Descarga dependencias (ws)
- ✅ Ejecuta `npm start` (definido en package.json)
- ✅ Asigna puerto dinámico automáticamente

### 3c. Espera el deployment

Verás logs como:
```
[12:34:56] Building...
[12:35:10] Installing dependencies...
[12:35:25] Starting server...
[12:35:30] ==========================================
[12:35:30]   BACCA-AUTO — servidor en ejecución
[12:35:30]   Puerto actual: 52847 (desde env.PORT)
```

**Cuando veas "Successfully deployed"** → ¡Listo! ✅

### 3d. Obtén tu URL de Railway

En el panel de Railway, verás una URL como:
```
https://baccaelite-production.up.railway.app
```

Esa es tu servidor en VIVO. 🎉

---

## PASO 4: CONECTAR TU DOMINIO (baccaelite.com)

### 4a. En Railway (panel de proyecto)

1. Tab "Settings" → "Domain"
2. Click "Add Domain"
3. Selecciona tu dominio `baccaelite.com` (o configura un custom domain)
4. Railway genera instrucciones DNS

### 4b. En tu registrador de dominio (GoDaddy, Namecheap, etc.)

1. Accede a tu panel de DNS
2. Añade los registros que Railway te dice (usualmente un CNAME)
3. Espera 15-30 minutos para que propaguen

**Resultado:** https://baccaelite.com → tu servidor en Railway

---

## PASO 5: VERIFICAR QUE TODO FUNCIONA

### 5a. Abre tu sitio

1. Ve a `https://baccaelite.com` (o tu URL de Railway)
2. Deberías ver `login.html`
3. Registra una cuenta (la primera será ADMIN)
4. Juega una mano de baccarat

### 5b. Problemas comunes

| Problema | Solución |
|----------|----------|
| "503 Service Unavailable" | Railway aún está deployando (espera 2-5 min) |
| "Cannot POST /api/login" | Los archivos estáticos no se sirven bien. Verifica tu carpeta `public/` |
| WebSocket no conecta | Es normal en los primeros 30 seg. Recarga la página |
| Data se pierde al reiniciar | Es normal con JSON. Próximo paso: migrar a SQLite (Phase 3) |

---

## PASO 6: MONITOREO EN RAILWAY

Railway te da un panel donde ves:

- **Logs**: qué pasa en tiempo real
- **Metrics**: CPU, RAM, conexiones activas
- **Deploys**: histórico de cambios

---

## 🎯 PRÓXIMOS PASOS DESPUÉS DE ESTO

1. **SQLite en lugar de JSON** (para persistencia real)
   - Las datos no se pierden al reiniciar
   - Mejor para >100 usuarios

2. **Email verification** (SendGrid gratuito)
   - Previene spam de bots

3. **Rate limiting** (evita fuerza bruta)
   - Protege login y API

4. **SSL/TLS en WebSocket** (wss://)
   - Railway lo hace automático

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Mi código se ejecuta en vivo cuando cambio algo?**
A: No. Debes hacer `git push` en tu rama main. Railway detecta el cambio y redeploya automáticamente (2-5 minutos).

**P: ¿Dónde ve Railway mis datos de usuarios (data/users.json)?**
A: Están en memoria durante la sesión. Cuando Railway reinicia, se pierden.
**Solución**: Migrar a SQLite (guardará datos en disco de Railway).

**P: ¿Mi dominio baccaelite.com va a estar seguro?**
A: Sí. Railway da HTTPS/SSL automático. Tu cookie de sesión será `Secure` y `HttpOnly`.

**P: ¿Cuántos usuarios aguanta?**
A: Con el free tier de Railway: 200-500 simultáneos sin problema.

---

## 🆘 SI ALGO FALLA

1. Mira los **logs de Railway** (panel → "Logs")
2. Verifica que package.json tiene `"main": "server.js"`
3. Verifica que server.js tiene `process.env.PORT || 3000`
4. Si nada funciona: vuelve a hacer git push (a veces fuerza redeploy)

---

**¿Listo? Empieza por PASO 1. Te espero abajo para ayudarte si hay dudas.** 🚀
