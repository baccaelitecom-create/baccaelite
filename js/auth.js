/* =====================================================================
   BACCA-AUTO — GUARDIÁN DE SESIÓN (js/auth.js) — FASE 2.1
   ---------------------------------------------------------------------
   Este archivo se carga PRIMERO en cada página protegida (antes de
   menu.js). Hace tres cosas:

   1. Pregunta al servidor "¿quién soy?" (GET /api/me).
      - Sin sesión → redirige a login.html (el servidor también lo hace
        por su cuenta; esto es el doble candado).
      - Con sesión → guarda la identidad y la comparte con el resto de
        scripts a través de la promesa  BaccaAuth.ready.
   2. Rellena el bloque de usuario del menú (avatar, nombre, rol).
   3. Ofrece  BaccaAuth.logout()  para el botón "Log out" del menú.

   MODO LOCAL (doble clic al archivo, sin servidor): no hay login
   posible, así que  BaccaAuth.ready  resuelve en null y cada script
   usa su identidad de demostración de la Fase 1. La página nunca se rompe.

   PARA LAS OTRAS PÁGINAS DEL SITIO (public_tables, tournaments, etc.):
   agrega esta línea ANTES de js/menu.js en cada una:
       <script src="js/auth.js"></script>
   ===================================================================== */
(function(){
'use strict';

const isLocalFile = location.protocol === 'file:';

/* ---- 1) ¿quién soy? -------------------------------------------------- */
const ready = isLocalFile
  ? Promise.resolve(null)                       // modo demo sin servidor
  : fetch('/api/me')
      .then(r => {
        if (r.status === 401) {                 // sin sesión → a la landing
          location.replace('login.html');
          return new Promise(() => {});         // detiene todo lo demás
        }
        return r.ok ? r.json() : null;
      })
      .catch(() => null);                       // servidor raro → modo demo

/* ---- 2) bloque de usuario del menú ----------------------------------- */
function fillUserBlock(u){
  const $ = id => document.getElementById(id);
  if (!u || !$('userName')) return;
  $('userName').textContent   = u.name;
  $('userAvatar').textContent = u.name.charAt(0).toUpperCase();
  const roleEl = $('userRole');
  if (roleEl){
    roleEl.textContent = u.role.toUpperCase();
    roleEl.className   = 'user-role ' + u.role;
  }
  document.body.classList.add('role-' + u.role);
}

ready.then(u => {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => fillUserBlock(u));
  else
    fillUserBlock(u);
});

/* ---- 3) API pública para los demás scripts --------------------------- */
window.BaccaAuth = {
  ready,                                        // Promise<{name,role} | null>
  async logout(){
    try { await fetch('/api/logout', { method: 'POST' }); } catch(_){}
    location.href = 'login.html';
  }
};

})();
