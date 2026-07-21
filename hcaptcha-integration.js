/* hcaptcha-integration.js */
/* Integración de hCaptcha en el formulario de registro */

const HCAPTCHA_SITE_KEY = '7e8abaf0-b192-4b9e-84a6-2b768252d590';

// Cargar el script de hCaptcha
function loadHCaptcha() {
    if (!document.getElementById('h-captcha-script')) {
        const script = document.createElement('script');
        script.id = 'h-captcha-script';
        script.src = 'https://js.hcaptcha.com/1/api.js';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
    }
}

// Renderizar CAPTCHA en un contenedor
function renderCaptcha(containerId = 'hcaptcha-container') {
    loadHCaptcha();
    
    setTimeout(() => {
        if (window.hcaptcha) {
            window.hcaptcha.render(containerId, {
                sitekey: HCAPTCHA_SITE_KEY,
                theme: 'dark'
            });
        }
    }, 500);
}

// Obtener token del CAPTCHA
function getCaptchaToken() {
    if (window.hcaptcha) {
        return window.hcaptcha.getResponse();
    }
    return null;
}

// Resetear CAPTCHA
function resetCaptcha() {
    if (window.hcaptcha) {
        window.hcaptcha.reset();
    }
}

// Integración con formulario de registro
async function registerWithCaptcha(event) {
    event.preventDefault();

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const passConfirm = document.getElementById('reg-pass-confirm').value;
    const captchaToken = getCaptchaToken();

    // Validaciones básicas
    if (!name || !email || !pass || !passConfirm) {
        alert('Completa todos los campos');
        return;
    }

    if (pass !== passConfirm) {
        alert('Las contraseñas no coinciden');
        return;
    }

    if (pass.length < 8) {
        alert('La contraseña debe tener al menos 8 caracteres');
        return;
    }

    if (!/[A-Z]/.test(pass)) {
        alert('La contraseña debe contener al menos una mayúscula');
        return;
    }

    if (!/[0-9]/.test(pass)) {
        alert('La contraseña debe contener al menos un número');
        return;
    }

    if (!captchaToken) {
        alert('Por favor completa el CAPTCHA');
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email,
                pass,
                captchaToken
            })
        });

        const data = await res.json();

        if (res.ok) {
            alert('✅ Registro exitoso! Revisa tu email para verificar la cuenta.');
            resetCaptcha();
            document.getElementById('register-form').reset();
        } else {
            alert('❌ Error: ' + (data.error || 'No se pudo registrar'));
            resetCaptcha();
        }
    } catch (err) {
        alert('Error: ' + err.message);
        resetCaptcha();
    }
}

// Integración con formulario de login
async function loginWithRateLimit(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;

    if (!email || !pass) {
        alert('Email y contraseña obligatorios');
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pass })
        });

        const data = await res.json();

        if (res.ok) {
            // Login exitoso
            window.location.href = '/';
        } else if (res.status === 429) {
            alert('❌ Demasiados intentos. Intenta en 1 minuto.');
        } else if (res.status === 403) {
            alert('❌ ' + data.error);
        } else {
            alert('❌ ' + (data.error || 'Error en login'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
