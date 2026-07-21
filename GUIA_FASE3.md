# 🚀 GUÍA FASE 3 - CAPTCHA + EMAIL + RATE LIMITING

## ✅ LO QUE YA ESTÁ HECHO

Tu proyecto **Fase 3** está listo con:

### **1. CAPTCHA (hCaptcha)** ✅
- Site Key: `7e8abaf0-b192-4b9e-84a6-2b768252d590`
- Secret Key: `ES_5d85e37db05148f89fb7ce85714dd753`
- Validación en backend
- UI en frontend

### **2. EMAIL VERIFICATION** ✅
- Nodemailer + Ethereal (SMTP gratis)
- Host: `smtp.ethereal.email`
- Usuario: `gavin.glover@ethereal.email`
- Contraseña: `8t6AtSPzZeJxxAmHm9`
- Tokens de 24 horas
- Página de verificación: `/verify-email`

### **3. RATE LIMITING** ✅
- Máximo 5 intentos de login por minuto
- Bloquea por IP
- Mensaje de error clara: "Demasiados intentos"

---

## 📋 ARCHIVOS PARA REEMPLAZAR EN TU PC

### **PASO 1: Descarga los nuevos archivos**

Descargar (ya están listos):
1. `server-fase3.js` → Reemplaza `server.js`
2. `.env.ejemplo-fase3` → Copia como `.env`
3. `package-json-fase3.json` → Reemplaza `package.json`
4. `verify-email.html` → Copia a tu carpeta raíz
5. `hcaptcha-integration.js` → Copia a tu carpeta `js/`

---

### **PASO 2: ACTUALIZAR TU PC**

```bash
# En tu carpeta C:\Proyecto\bacc-auto

# 1. Reemplaza server.js
cp server-fase3.js server.js

# 2. Reemplaza package.json
cp package-json-fase3.json package.json

# 3. Copia .env
cp .env.ejemplo-fase3 .env

# 4. Copia las nuevas páginas/scripts
cp verify-email.html ./
cp hcaptcha-integration.js ./js/
```

---

### **PASO 3: INSTALAR NUEVAS DEPENDENCIAS**

```bash
cd C:\Proyecto\bacc-auto
npm install
```

Esto descarga `nodemailer` automáticamente.

---

### **PASO 4: ACTUALIZAR login.html**

En tu archivo `login.html`, añade:

```html
<!-- En la sección de HEAD -->
<script src="js/hcaptcha-integration.js"></script>

<!-- En el formulario de REGISTRO, antes del botón submit -->
<div id="hcaptcha-container"></div>

<!-- Cambiar el formulario -->
<form id="register-form" onsubmit="registerWithCaptcha(event)">
    <input type="text" id="reg-name" placeholder="Nombre" required>
    <input type="email" id="reg-email" placeholder="Email" required>
    <input type="password" id="reg-pass" placeholder="Contraseña (8+ caracteres)" required>
    <input type="password" id="reg-pass-confirm" placeholder="Confirma contraseña" required>
    
    <!-- AQUÍ VA EL CAPTCHA -->
    <div id="hcaptcha-container" style="margin: 20px 0;"></div>
    
    <button type="submit">Registrarse</button>
</form>

<!-- Cambiar el formulario de LOGIN -->
<form id="login-form" onsubmit="loginWithRateLimit(event)">
    <input type="email" id="login-email" placeholder="Email" required>
    <input type="password" id="login-pass" placeholder="Contraseña" required>
    <button type="submit">Iniciar Sesión</button>
</form>

<!-- En el cierre de body, cargar el CAPTCHA cuando se cargue la página -->
<script>
    document.addEventListener('DOMContentLoaded', () => {
        renderCaptcha('hcaptcha-container');
    });
</script>
```

---

### **PASO 5: HACER GIT PUSH**

```bash
cd C:\Proyecto\bacc-auto

git add .
git commit -m "Fase 3: Agregar CAPTCHA, Email verification y Rate limiting"
git push
```

Railway **automáticamente redeploya** en 2-5 minutos.

---

## 🎯 FLUJO DE REGISTRO NUEVO

1. Usuario entra a login
2. Hace click en "Registrarse"
3. Completa: Nombre, Email, Contraseña
4. **Completa el CAPTCHA** (clickea el checkbox)
5. Click "Registrarse"
6. **Backend verifica CAPTCHA** ✅
7. **Backend envía email** con link de verificación
8. Usuario abre link en email
9. Página `/verify-email` confirma
10. **Puede iniciar sesión** ✅

---

## 🔒 SEGURIDAD IMPLEMENTADA

### **CAPTCHA**
- Previene bots automáticos
- Validación en cliente y servidor
- Tokens únicos por sesión

### **EMAIL VERIFICATION**
- Confirma que el email existe
- Token de 24 horas
- No puede entrar sin verificar

### **RATE LIMITING**
- Máx 5 intentos/minuto por IP
- Previene fuerza bruta (hackers probando 1000 contraseñas)
- Mensaje claro: "Demasiados intentos"

---

## 📊 PRUEBAS LOCALES (antes de subir)

1. **En tu PC, corre el servidor:**
   ```bash
   node server.js
   ```

2. **Abre:** `http://localhost:3000`

3. **Pruebas:**
   - ✅ Registro con CAPTCHA (debe funcionar)
   - ✅ Email (revisa consola de Ethereal)
   - ✅ Verificación (abre link de email)
   - ✅ Login con email verificado (debe funcionar)
   - ✅ Rate limiting (intenta login 6 veces seguidas = bloqueado)

4. **Si todo OK → git push**

---

## 🚨 PROBLEMAS COMUNES

### "CAPTCHA no aparece"
→ Recarga página (Ctrl+F5)

### "Email no llega"
→ Ethereal es sandbox. Logs en consola. Revisa carpeta "Spam"

### "Error npm install"
→ Verifica tener Node.js actualizado: `node --version`

### "Rate limiting bloquea mis pruebas"
→ Espera 1 minuto o usa otra IP (incógnito)

---

## ✅ PRÓXIMO PASO

Una vez deployado y funcionando en Railway:

1. **Chat profesional** (Moderadores, DMs, filtro palabras)
2. **Multi-idioma** (7 idiomas con JSON)
3. **Migración SQLite** (persistencia real)

---

**¿Preguntas? Avísame.** 🚀
