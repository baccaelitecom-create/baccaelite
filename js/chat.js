/* ==========================================================================
   BACCA-AUTO — CHAT GLOBAL (js/chat.js) — VERSIÓN FASE 2
   --------------------------------------------------------------------------
   Este archivo funciona en DOS modos, automáticamente:

   ● MODO SERVIDOR — si la página se abrió desde  node server.js
     (http://localhost:3000), el chat se conecta por WebSocket y TODO es
     real: los mensajes, anuncios, mute, slow mode y el contador de
     conectados se comparten entre todas las pestañas/jugadores.
     El servidor es quien valida (mute, slow, roles): fuente de la verdad.

   ● MODO LOCAL — si abres el index.html directo (doble clic, sin servidor),
     el chat sigue funcionando como en la Fase 1: demo guardada en este
     navegador. Así nunca se rompe la página.

   IDENTIDAD (FASE 2.1): sale del LOGIN. js/auth.js pregunta al servidor
   quién eres (GET /api/me) y este archivo espera esa respuesta antes de
   conectar. La URL ya no decide nada (?nombre=X&rol=Y quedó atrás).
   En MODO LOCAL (sin servidor) se usa la identidad de demo Admin/admin.

   COMANDOS: /ayuda /anuncio /limpiar /slow /mute /unmute  (igual que antes)
   AJUSTES:  CHAT_CFG aquí abajo.
   ========================================================================== */

(() => {
'use strict';

/* ------------------------------------------------------------------------
   CONFIGURACIÓN
   ------------------------------------------------------------------------ */
const CHAT_CFG = {
  /* identidad de DEMO: solo se usa en modo local (sin servidor).
     Con servidor, init() la reemplaza por la identidad real de la sesión. */
  user: { name: 'Admin', role: 'admin' },
  maxLen: 200,
  cooldownMs: 1500,       // anti-spam local (el servidor valida de nuevo)
  slowDefault: 10,
  maxStored: 200,
  storeKey: 'baccaChat.v1',   // solo se usa en MODO LOCAL
  badWords: ['idiota','estupido','estúpido','imbecil','imbécil'],
  rules: 'Reglas: respeto entre jugadores, sin spam, sin enlaces, ' +
         'sin lenguaje ofensivo. Los moderadores pueden silenciar o ' +
         'borrar mensajes. Simulador gratuito: aquí no hay dinero real.',
  emojis: ['😀','😂','😎','🤔','😢','😡','👍','👎','👏','🙏',
           '🔥','💪','🍀','🎉','🎲','🃏','💙','❤️','💚','🤞']
};

/* ------------------------------------------------------------------------
   ESTADO
   ------------------------------------------------------------------------ */
const $ = id => document.getElementById(id);

const state = {
  messages: [], pinned: '', muted: [], slowSecs: 0,
  soundOn: true, lastSentAt: 0,
  connected: false            // true = modo servidor
};

/* ------------------------------------------------------------------------
   ADAPTADOR DE RED (ChatNet)
   Intenta conectar al WebSocket del mismo host que sirvió la página.
   Si no hay servidor (archivo abierto directo), pasa a MODO LOCAL.
   ------------------------------------------------------------------------ */
const ChatNet = {
  ws: null,
  retryMs: 2000,

  connect(){
    /* abriste el archivo con doble clic → no hay servidor posible */
    if (location.protocol === 'file:') return this.goLocal();

    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    try { this.ws = new WebSocket(url); } catch { return this.goLocal(); }

    this.ws.onopen = () => {
      state.connected = true;
      /* el servidor ya sabe quién somos por la cookie de sesión:
         el hello solo pide el estado inicial del chat. */
      this.ws.send(JSON.stringify({ type: 'hello' }));
      notice('🟢 Conectado al servidor del chat.');
    };

    this.ws.onmessage = e => {
      try { applyEvent(JSON.parse(e.data)); } catch(_){}
    };

    this.ws.onclose = () => {
      if (!state.connected) return this.goLocal();   // nunca conectó
      state.connected = false;
      notice('🔴 Conexión perdida. Reintentando…');
      setTimeout(() => this.connect(), this.retryMs); // reconexión automática
    };
    this.ws.onerror = () => { try{ this.ws.close(); }catch(_){} };
  },

  goLocal(){
    state.connected = false;
    loadLocal();
    renderAll(); renderPinned(); renderSlowTag();
    if (state.messages.length === 0)
      applyEvent({ type:'msg', msg: sysMsg('Modo local (sin servidor). Los mensajes solo se ven en este navegador.') });
    $('chatOnline').textContent = 1;
  },

  /* Todos los eventos de la interfaz salen por aquí.
     Con servidor → se envían; sin servidor → se aplican localmente
     imitando lo que el servidor respondería. */
  send(ev){
    if (state.connected && this.ws?.readyState === 1){
      this.ws.send(JSON.stringify(ev));
      return;
    }
    /* ---- emulación local (Fase 1) ---- */
    switch(ev.type){
      case 'msg':
        applyEvent({ type:'msg', msg:{ id:'m'+Date.now()+Math.random().toString(36).slice(2,6),
          user: CHAT_CFG.user.name, role: CHAT_CFG.user.role, text: ev.text, ts: Date.now() } });
        break;
      case 'pin':
        applyEvent({ type:'pin', text: ev.text });
        if (ev.text) applyEvent({ type:'msg', msg: sysMsg('📌 Nuevo anuncio oficial.') });
        break;
      case 'clear':
        applyEvent({ type:'clear' });
        applyEvent({ type:'msg', msg: sysMsg('🧹 El chat fue limpiado por un moderador.') });
        break;
      case 'slow':
        applyEvent({ type:'slow', secs: ev.secs });
        applyEvent({ type:'msg', msg: sysMsg(ev.secs > 0
          ? `🐢 Slow mode: 1 mensaje cada ${ev.secs}s.` : '🐢 Slow mode desactivado.') });
        break;
      case 'mute':
        if(!state.muted.includes(ev.name)) state.muted.push(ev.name);
        applyEvent({ type:'muted', muted: state.muted });
        applyEvent({ type:'msg', msg: sysMsg(`🔇 ${ev.name} fue silenciado.`) });
        break;
      case 'unmute':
        applyEvent({ type:'muted', muted: state.muted.filter(n => n !== ev.name) });
        applyEvent({ type:'msg', msg: sysMsg(`🔊 ${ev.name} puede hablar de nuevo.`) });
        break;
      case 'del':
        applyEvent({ type:'del', id: ev.id });
        break;
    }
    saveLocal();
  }
};

/* ------------------------------------------------------------------------
   EVENTOS ENTRANTES — un solo punto aplica lo que llega
   (del servidor o de la emulación local): la UI siempre se pinta igual.
   ------------------------------------------------------------------------ */
function applyEvent(ev){
  switch(ev.type){
    case 'init':                                   // estado completo al conectar
      if (ev.me) CHAT_CFG.user = ev.me;            // identidad confirmada por el servidor
      state.messages = ev.messages || [];
      state.pinned   = ev.pinned || '';
      state.slowSecs = ev.slowSecs || 0;
      state.muted    = ev.muted || [];
      renderAll(); renderPinned(); renderSlowTag();
      break;
    case 'msg':    pushMessage(ev.msg); break;
    case 'online': $('chatOnline').textContent = ev.n; break;
    case 'pin':    state.pinned = ev.text || ''; renderPinned(); break;
    case 'clear':  state.messages = []; renderAll(); break;
    case 'slow':   state.slowSecs = ev.secs || 0; renderSlowTag(); break;
    case 'muted':  state.muted = ev.muted || []; break;
    case 'del': {
      state.messages = state.messages.filter(m => m.id !== ev.id);
      const el = listEl.querySelector(`[data-id="${ev.id}"]`);
      if (el) el.remove();
      break;
    }
    case 'notice': notice(ev.text); break;         // avisos personales del servidor
  }
  if (!state.connected) saveLocal();
}

/* ------------------------------------------------------------------------
   PERSISTENCIA (solo modo local)
   ------------------------------------------------------------------------ */
function saveLocal(){
  try{
    localStorage.setItem(CHAT_CFG.storeKey, JSON.stringify({
      messages: state.messages.slice(-CHAT_CFG.maxStored),
      pinned: state.pinned, muted: state.muted,
      slowSecs: state.slowSecs, soundOn: state.soundOn
    }));
  }catch(_){}
}

function loadLocal(){
  try{
    const s = JSON.parse(localStorage.getItem(CHAT_CFG.storeKey) || 'null');
    if(!s) return;
    state.messages = s.messages || []; state.pinned = s.pinned || '';
    state.muted = s.muted || []; state.slowSecs = s.slowSecs || 0;
    state.soundOn = s.soundOn !== false;
  }catch(_){}
}

/* ------------------------------------------------------------------------
   UTILIDADES
   ------------------------------------------------------------------------ */
const esc = t => String(t).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function clean(text){
  let t = text;
  for(const w of CHAT_CFG.badWords) t = t.replace(new RegExp(w,'gi'), '***');
  return t;
}

const fmtTime = ts => new Date(ts)
  .toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});

const canMod  = () => ['admin','mod'].includes(CHAT_CFG.user.role);
const isAdmin = () => CHAT_CFG.user.role === 'admin';
const sysMsg  = text => ({ id:'s'+Date.now(), sys:true, text, ts:Date.now() });

let audioCtx = null;
function beep(){
  if(!state.soundOn) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = .04;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + .08);
  }catch(_){}
}

/* ------------------------------------------------------------------------
   RENDER
   ------------------------------------------------------------------------ */
const listEl = $('chatMessages');

function atBottom(){
  return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 30;
}

function renderMsg(m){
  const div = document.createElement('div');
  if(m.sys){ div.className = 'chat-msg sys'; div.textContent = m.text; return div; }
  div.className = 'chat-msg';
  div.dataset.id = m.id;
  const badge = m.role === 'admin' ? '<span class="badge admin">ADMIN</span>'
              : m.role === 'mod'   ? '<span class="badge mod">MOD</span>' : '';
  div.innerHTML =
    `<span class="t">${fmtTime(m.ts)}</span>` +
    `${badge}<span class="u ${m.role}">${esc(m.user)}:</span> ` +
    `<span class="m">${esc(m.text)}</span>` +
    `<span class="msg-actions">` +
      `<button data-act="del"  data-id="${m.id}" title="Borrar mensaje">🗑</button>` +
      `<button data-act="mute" data-user="${esc(m.user)}" title="Silenciar jugador">🔇</button>` +
    `</span>`;
  return div;
}

function renderAll(){
  listEl.innerHTML = '';
  state.messages.slice(-CHAT_CFG.maxStored).forEach(m => listEl.appendChild(renderMsg(m)));
  listEl.scrollTop = listEl.scrollHeight;
}

function renderPinned(){
  const box = $('chatPinned');
  if(state.pinned){
    $('chatPinnedText').textContent = state.pinned;
    box.classList.remove('hidden');
  }else box.classList.add('hidden');
}

function renderSlowTag(){
  $('chatSlowTag').classList.toggle('hidden', state.slowSecs <= 0);
  $('chatSlowSecs').textContent = state.slowSecs;
  $('modSlowBtn').classList.toggle('on', state.slowSecs > 0);
}

let noticeTimer = null;
function notice(text, ms = 4000){
  const n = $('chatNotice');
  n.textContent = text;
  n.classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => n.classList.add('hidden'), ms);
}

function pushMessage(m){
  const wasBottom = atBottom();
  state.messages.push(m);
  if(state.messages.length > CHAT_CFG.maxStored)
    state.messages = state.messages.slice(-CHAT_CFG.maxStored);
  listEl.appendChild(renderMsg(m));
  while(listEl.children.length > CHAT_CFG.maxStored) listEl.firstChild.remove();
  if(wasBottom || m.user === CHAT_CFG.user.name) listEl.scrollTop = listEl.scrollHeight;
  else $('chatNewMsgs').classList.remove('hidden');
  if(m.user !== CHAT_CFG.user.name && !m.sys) beep();
}

/* ------------------------------------------------------------------------
   ENVÍO + COMANDOS
   ------------------------------------------------------------------------ */
function trySend(){
  const input = $('chatInput');
  let text = input.value.trim();
  if(!text) return;

  if(text.startsWith('/')){ handleCommand(text); input.value=''; updateCount(); return; }

  if(state.muted.includes(CHAT_CFG.user.name))
    return notice('Estás silenciado por un moderador.');

  const gap = (!canMod() && state.slowSecs > 0)
              ? state.slowSecs * 1000 : CHAT_CFG.cooldownMs;
  const left = state.lastSentAt + gap - Date.now();
  if(left > 0) return notice(`Espera ${Math.ceil(left/1000)}s para enviar otro mensaje.`);

  state.lastSentAt = Date.now();
  ChatNet.send({ type:'msg', text: clean(text.slice(0, CHAT_CFG.maxLen)) });
  input.value = ''; updateCount(); input.focus();
}

function handleCommand(raw){
  const [cmd, ...rest] = raw.slice(1).split(' ');
  const arg = rest.join(' ').trim();

  switch(cmd.toLowerCase()){
    case 'ayuda':
      notice('/anuncio texto · /anuncio off · /limpiar · /slow 10 · /slow off · /mute nombre · /unmute nombre', 8000);
      return;
    case 'anuncio':
      if(!isAdmin()) return notice('Solo el admin publica anuncios oficiales.');
      ChatNet.send({ type:'pin', text: arg.toLowerCase() === 'off' ? '' : arg.slice(0,300) });
      return;
    case 'limpiar':
      if(!canMod()) return notice('Solo moderadores.');
      ChatNet.send({ type:'clear' });
      return;
    case 'slow':
      if(!canMod()) return notice('Solo moderadores.');
      ChatNet.send({ type:'slow',
        secs: arg.toLowerCase() === 'off' ? 0 : (parseInt(arg,10) || CHAT_CFG.slowDefault) });
      return;
    case 'mute':
      if(!canMod()) return notice('Solo moderadores.');
      if(arg) ChatNet.send({ type:'mute', name: arg });
      return;
    case 'unmute':
      if(!canMod()) return notice('Solo moderadores.');
      if(arg) ChatNet.send({ type:'unmute', name: arg });
      return;
    default:
      notice('Comando no reconocido. Escribe /ayuda.');
  }
}

/* ------------------------------------------------------------------------
   WIRING DE LA INTERFAZ
   ------------------------------------------------------------------------ */
function updateCount(){
  $('chatCharCount').textContent = `${$('chatInput').value.length}/${CHAT_CFG.maxLen}`;
}

async function init(){
  /* IDENTIDAD REAL — esperamos a que js/auth.js confirme la sesión.
     Si devuelve null (modo local sin servidor) seguimos con la demo. */
  if (window.BaccaAuth){
    const me = await window.BaccaAuth.ready;
    if (me) CHAT_CFG.user = me;
  }

  /* BLOQUE DE USUARIO (menú izquierdo) — se llena en cualquier página
     que lo tenga, con la identidad de la sesión (o la demo local). */
  if($('userName')){
    $('userName').textContent  = CHAT_CFG.user.name;
    $('userAvatar').textContent = CHAT_CFG.user.name.charAt(0);
    const roleEl = $('userRole');
    roleEl.textContent = CHAT_CFG.user.role.toUpperCase();
    roleEl.className   = 'user-role ' + CHAT_CFG.user.role;
  }

  if(!$('chatPanel')) return;

  if(canMod()) document.body.classList.add('chat-can-mod');
  $('chatSoundBtn').classList.toggle('off', !state.soundOn);

  $('chatSendBtn').onclick = trySend;
  $('chatInput').addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); trySend(); }
  });
  $('chatInput').addEventListener('input', updateCount);

  const emojiPanel = $('chatEmojiPanel');
  CHAT_CFG.emojis.forEach(em => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = em;
    b.onclick = () => {
      const inp = $('chatInput');
      if(inp.value.length + em.length <= CHAT_CFG.maxLen) inp.value += em;
      updateCount(); inp.focus();
    };
    emojiPanel.appendChild(b);
  });
  $('chatEmojiBtn').onclick = () => emojiPanel.classList.toggle('hidden');

  $('chatSoundBtn').onclick = () => {
    state.soundOn = !state.soundOn;
    $('chatSoundBtn').classList.toggle('off', !state.soundOn);
    if(!state.connected) saveLocal();
  };

  $('chatRulesBtn').onclick = () => notice(CHAT_CFG.rules, 9000);

  $('chatModBtn').onclick = () => $('chatModTools').classList.toggle('hidden');
  $('modAnnounceBtn').onclick = () => {
    if(!isAdmin()) return notice('Solo el admin publica anuncios oficiales.');
    const t = prompt('Anuncio oficial (vacío = quitar):', state.pinned);
    if(t !== null) ChatNet.send({ type:'pin', text: t.trim().slice(0,300) });
  };
  $('modSlowBtn').onclick = () =>
    ChatNet.send({ type:'slow', secs: state.slowSecs > 0 ? 0 : CHAT_CFG.slowDefault });
  $('modClearBtn').onclick = () => {
    if(confirm('¿Limpiar todo el chat?')) ChatNet.send({ type:'clear' });
  };
  $('chatPinnedClose').onclick = () => {
    if(isAdmin()) ChatNet.send({ type:'pin', text:'' });
  };

  listEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if(!btn || !canMod()) return;
    if(btn.dataset.act === 'del')  ChatNet.send({ type:'del', id: btn.dataset.id });
    if(btn.dataset.act === 'mute') ChatNet.send({ type:'mute', name: btn.dataset.user });
  });

  listEl.addEventListener('scroll', () => {
    if(atBottom()) $('chatNewMsgs').classList.add('hidden');
  });
  $('chatNewMsgs').onclick = () => {
    listEl.scrollTop = listEl.scrollHeight;
    $('chatNewMsgs').classList.add('hidden');
  };

  ChatNet.connect();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

})();
