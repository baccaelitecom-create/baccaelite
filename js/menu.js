/* =====================================================================
   BACC-AUTO — SHARED MENU (js/menu.js)
   ---------------------------------------------------------------------
   ONE menu for the whole site. Every page has an EMPTY mount:

       <aside class="menu-panel" id="sharedMenu"></aside>

   and this script fills it. To add, remove or rename a menu item,
   edit the MENU_ITEMS list below ONCE — every page updates.

   SCRIPT ORDER MATTERS:
   - This file must load BEFORE js/app.js on index.html, so app.js can
     find #reportMenuBtn when it binds the Engine Report modal.
   - On section pages (no app.js) the Engine Report button navigates to
     index.html?report=1 and the report opens automatically there.

   The user block (avatar/name/role) is included on every page. It is
   the placeholder for the phase-2 login, same data source as the chat.
   Clicking it opens account.html — that is why Account/Settings has no
   link in MENU_ITEMS.
   ===================================================================== */
(function initSharedMenu(){
  const mount=document.getElementById('sharedMenu');
  if(!mount)return;

  /* --------- EDIT THE MENU HERE (one place for the whole site) ------ */
  /* Account is NOT here on purpose: it opens from the user avatar. */
  const MENU_ITEMS=[
    {href:'index.html',         label:'Home'},
    {href:'public_tables.html', label:'Public Tables'},
    {href:'tournaments.html',   label:'Tournament'},
    {href:'statistics.html',    label:'Statistics'},
    {href:'leaderboard.html',   label:'Leaderboard'},
    {href:'rules.html',         label:'Rules + Guidelines'}
  ];

  /* Current file name ('' or '/' counts as index.html) */
  const here=(location.pathname.split('/').pop()||'index.html');

  const links=MENU_ITEMS.map(it=>{
    const active=it.href===here?' class="active"':'';
    return `<li><a href="${it.href}"${active}>${it.label}</a></li>`;
  }).join('');

  /* The user block starts NEUTRAL ("…") — js/auth.js fills it with the
     real session identity (or chat.js with the local demo identity). */
  mount.innerHTML=`
    <div class="user-block" id="userBlock" title="Open your Account" style="cursor:pointer;">
      <div class="user-avatar" id="userAvatar">·</div>
      <div class="user-info">
        <div class="user-name" id="userName">…</div>
        <span class="user-role user" id="userRole"></span>
      </div>
    </div>
    <nav class="menu">
      <ul>${links}</ul>
    </nav>
    <button id="reportMenuBtn" class="menu-report-btn" type="button">
      Engine Report
      <small>100,000-hand audit</small>
    </button>
    <button id="logoutBtn" class="menu-logout-btn" type="button">
      Log out
    </button>`;

  /* USER BLOCK → ACCOUNT: clicking the avatar/name opens the player's
     Account page (Account has no menu link on purpose). */
  const ub=document.getElementById('userBlock');
  if(ub)ub.onclick=()=>{location.href='account.html';};

  /* Engine Report fallback for SECTION pages (no app.js loaded there):
     go to the game page and auto-open the report (?report=1 is handled
     by app.js). On index.html, app.js overwrites this handler with the
     real modal — this only acts as a safety net. */
  const btn=document.getElementById('reportMenuBtn');
  if(btn)btn.onclick=()=>{location.href='index.html?report=1';};

  /* LOG OUT → js/auth.js cierra la sesión en el servidor y te lleva a
     login.html. En modo local (doble clic, sin servidor) no hay sesión,
     así que el botón se oculta. */
  const lo=document.getElementById('logoutBtn');
  if(lo){
    if(location.protocol==='file:'){ lo.style.display='none'; }
    else lo.onclick=()=>{ window.BaccaAuth ? BaccaAuth.logout() : location.href='login.html'; };
  }
})();
