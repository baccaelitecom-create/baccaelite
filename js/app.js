'use strict';
const CFG={decks:8,betSeconds:12,showMs:3000,cutMin:40,cutMax:60,cardDelayMs:650,thirdCardPauseMs:700};
// Official timing: betting 12s (betSeconds), result pause 3s (showMs), alert on last 6s (see cycle()).

// Stronger RNG for the browser. Uses crypto when available.
function rng01(){
  if(window.crypto&&crypto.getRandomValues){
    const a=new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0]/4294967296;
  }
  return Math.random();
}
function randInt(maxExclusive){return Math.floor(rng01()*maxExclusive)}
const $=id=>document.getElementById(id);const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Shoe{constructor(){this.id=1;this.newShoe()}newShoe(){const suits=['♠','♥','♦','♣'];this.cards=[];this.cutTriggered=false;this.finalHandPlayed=false;/* real-casino rule: after the cut card appears, ONE announced last hand is dealt */for(let d=0;d<CFG.decks;d++)for(const s of suits)for(let r=1;r<=13;r++)this.cards.push({r,s,v:r>=10?0:r});this.shuffle();const burn=this.draw(false);let n=burn.v===0?10:burn.v;while(n--&&this.cards.length)this.draw(false);this.cutCardLeft=rand(CFG.cutMin,CFG.cutMax);}shuffle(){for(let i=this.cards.length-1;i>0;i--){const j=randInt(i+1);[this.cards[i],this.cards[j]]=[this.cards[j],this.cards[i]]}}draw(checkCut=true){const card=this.cards.shift();if(checkCut&&this.cards.length<=this.cutCardLeft)this.cutTriggered=true;return card}needsNew(){return this.finalHandPlayed||this.cards.length<6}}
function rand(a,b){return Math.floor(rng01()*(b-a+1))+a}function total(cards){return cards.reduce((s,c)=>s+c.v,0)%10}
class Engine{constructor(){this.shoe=new Shoe();this.shoeNo=1}newShoe(){this.shoeNo++;this.shoe.newShoe();return true}deal(){if(this.shoe.needsNew())this.newShoe();const lastHand=this.shoe.cutTriggered;/* cut already out → this deal is the announced LAST HAND of the shoe */const p=[],b=[];p.push(this.shoe.draw());b.push(this.shoe.draw());p.push(this.shoe.draw());b.push(this.shoe.draw());let pt=total(p),bt=total(b),natural=pt>=8||bt>=8;let pThird=null,bThird=null;if(!natural){if(pt<=5){pThird=this.shoe.draw();p.push(pThird);pt=total(p)}if(!pThird){if(bt<=5){bThird=this.shoe.draw();b.push(bThird);bt=total(b)}}else{const x=pThird.v;if(bt<=2||bt===3&&x!==8||bt===4&&x>=2&&x<=7||bt===5&&x>=4&&x<=7||bt===6&&x>=6&&x<=7){bThird=this.shoe.draw();b.push(bThird);bt=total(b)}}}let winner=pt>bt?'PLAYER':bt>pt?'BANKER':'TIE';if(lastHand)this.shoe.finalHandPlayed=true;return{playerCards:p,bankerCards:b,playerTotal:pt,bankerTotal:bt,winner,natural,shoeNo:this.shoeNo,cardsLeft:this.shoe.cards.length}}}
class Roads{
  constructor(){this.reset()}

  reset(){
    this.results=[];        // Bead Plate: includes Tie.
    this.big=[];            // Big Road: Player/Banker only; Tie attaches to the last P/B.
    this.lastNonTie=null;
    this.tieCount=0;
    this.currentRunStartCol=0;
  }

  add(w){
    this.results.push(w);

    // In real Baccarat a Tie does not open a column in the Big Road.
    if(w==='TIE'){
      if(this.big.length) this.big[this.big.length-1].tie=(this.big[this.big.length-1].tie||0)+1;
      else this.tieCount++;
      return;
    }

    const pendingTie=this.tieCount;
    this.tieCount=0;

    if(!this.big.length){
      const mark={w,row:0,col:0,tie:pendingTie,runStartCol:0};
      this.big.push(mark);
      this.lastNonTie=w;
      this.currentRunStartCol=0;
      return;
    }

    if(this.lastNonTie!==w){
      // New color: starts a logical column right after the START of the
      // previous run, NOT after the dragon tail. This avoids the visual
      // gap that appeared when a long tail ran horizontally.
      let col=this.currentRunStartCol+1;
      while(this.occupied(col,0)) col++;
      this.currentRunStartCol=col;
      this.big.push({w,row:0,col,tie:pendingTie,runStartCol:col});
    }else{
      const prev=this.big[this.big.length-1];
      let row=prev.row+1;
      let col=prev.col;

      // Dragon tail: if it cannot go down, it runs horizontally attached.
      if(row>5 || this.occupied(col,row)){
        row=prev.row;
        col=prev.col+1;
        while(this.occupied(col,row)) col++;
      }
      this.big.push({w,row,col,tie:pendingTie,runStartCol:this.currentRunStartCol});
    }
    this.lastNonTie=w;
  }

  occupied(c,r){return this.big.some(x=>x.col===c&&x.row===r)}
}
const engine=new Engine(),roads=new Roads();let hand=0,balance=1023,chip=1,betting=true,timer=CFG.betSeconds;let bets={PLAYER:0,BANKER:0,TIE:0},lastBets={PLAYER:0,BANKER:0,TIE:0};let stats={PLAYER:0,BANKER:0,TIE:0};
// Official starting balance: $1,023.00 (must match the value shown in index.html). Default selected chip: $1 (must match the .active button below).
// Chips physically resting on the table, per zone. Each item: {v:value, el:DOM node}.
const tableChips={PLAYER:[],BANKER:[],TIE:[]};
const toCents=n=>Math.round(n*100)/100; // avoids float drift from the 0.95 Banker payout
function money(n){return toCents(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
/* Balance display: full with commas up to $999,999.99; abbreviated from
   $1 million ($1.25M, $10.50B, $1.20T) so huge balances never break the
   top bar. Hovering the number shows the exact full amount (title). */
function moneyDisplay(n){
  const v=toCents(n);
  if(v<1e6)return money(v);
  if(v<1e9) return (v/1e6).toFixed(2)+'M';
  if(v<1e12)return (v/1e9).toFixed(2)+'B';
  return (v/1e12).toFixed(2)+'T';
}
function renderBalance(){
  const el=$('balance');if(!el)return;
  el.textContent=moneyDisplay(balance);
  el.title='$'+money(balance); // exact amount on hover
}
function formatCompact(n){
  if(n>=1000000){const v=n/1000000;return (Number.isInteger(v)?v:v.toFixed(1))+'M';}
  if(n>=1000){const v=n/1000;return (Number.isInteger(v)?v:v.toFixed(1))+'K';}
  return String(n);
}
// Note: chips now DO pile up on the table. The chip flies with an arc,
// lands on the right side of the zone (never covering the bet value),
// stays during the deal, and flies away when the hand is resolved.
function renderCard(c){const d=document.createElement('div');d.className='card '+(['♥','♦'].includes(c.s)?'red':'');const label=c.r===1?'A':c.r===11?'J':c.r===12?'Q':c.r===13?'K':c.r;d.innerHTML=`<div>${label}</div><div class="suit">${c.s}</div>`;return d}
async function renderHand(res){
  const pEl=$('playerCards'), bEl=$('bankerCards');
  pEl.innerHTML=''; bEl.innerHTML='';
  $('playerTotal').textContent='0';
  $('bankerTotal').textContent='0';

  const playerShown=[];
  const bankerShown=[];

  async function place(side,card){
    if(side==='P'){
      playerShown.push(card);
      pEl.appendChild(renderCard(card));
      $('playerTotal').textContent=total(playerShown);
    }else{
      bankerShown.push(card);
      bEl.appendChild(renderCard(card));
      $('bankerTotal').textContent=total(bankerShown);
    }
    await wait(CFG.cardDelayMs);
  }

  // Real dealing order: Player, Banker, Player, Banker.
  await place('P',res.playerCards[0]);
  await place('B',res.bankerCards[0]);
  await place('P',res.playerCards[1]);
  await place('B',res.bankerCards[1]);

  await wait(CFG.thirdCardPauseMs);

  if(res.playerCards[2]) await place('P',res.playerCards[2]);
  if(res.bankerCards[2]) await place('B',res.bankerCards[2]);

  $('playerTotal').textContent=res.playerTotal;
  $('bankerTotal').textContent=res.bankerTotal;
}
function pay(res){
  const betsSnap={...bets}; // foto de las apuestas ANTES del reset (para el servidor)
  const playerWon=(res.winner==='PLAYER'&&bets.PLAYER>0)||(res.winner==='BANKER'&&bets.BANKER>0)||(res.winner==='TIE'&&bets.TIE>0);
  let win=0;
  if(res.winner==='PLAYER') win+=bets.PLAYER*2;
  else if(res.winner==='BANKER') win+=bets.BANKER*1.95;
  else win+=bets.TIE*9+bets.PLAYER+bets.BANKER;
  balance=toCents(balance+win);
  renderBalance();
  resolveTableChips(res.winner); // losing chips fly toward the dealer; winning/returned chips fly to the player
  lastBets={...bets};
  bets={PLAYER:0,BANKER:0,TIE:0}; // LOSER: DISAPPEAR — losing bets are gone; the zone value resets to 0.
  renderBets();
  Net.reportHand(betsSnap,res.winner); // fase 2.3: el servidor liquida la mano oficial (async, no frena la animación)
  return playerWon;
}
function renderBets(){$('betPlayer').textContent='$'+formatCompact(bets.PLAYER);$('betBanker').textContent='$'+formatCompact(bets.BANKER);$('betTie').textContent='$'+formatCompact(bets.TIE)}
function renderStats(){$('statPlayer').textContent=stats.PLAYER;$('statBanker').textContent=stats.BANKER;$('statTie').textContent=stats.TIE}
function updateStats(res){stats[res.winner]++;renderStats()}
function resetShoeView(){roads.reset();hand=0;stats={PLAYER:0,BANKER:0,TIE:0};['beadPlate','bigRoad'].forEach(id=>$(id).innerHTML='');renderStats();$('handNumber').textContent=0}
function drawRoads(){const bead=$('beadPlate');bead.innerHTML='';roads.results.slice(-138).forEach(w=>{/* Bead Plate 6x20 = 138 cells; always shows the latest results */const m=document.createElement('div');m.className='mark '+(w==='PLAYER'?'player':w==='BANKER'?'banker':'tie');bead.appendChild(m)});drawBig()}
// Visible columns per board (must match the widths in style.css section 13).
const BIG_VISIBLE_COLS=23;
// Sliding window: when the newest column passes the right edge, everything
// shifts left so the latest results are always visible (older columns scroll off).
function colOffset(data,visibleCols){
  let maxCol=0;
  for(const x of data) if(x.col>maxCol) maxCol=x.col;
  return Math.max(0,maxCol-(visibleCols-1));
}
function drawBig(){
  const el=$('bigRoad');el.innerHTML='';
  const off=colOffset(roads.big,BIG_VISIBLE_COLS);
  roads.big.forEach(x=>{
    const c=x.col-off;
    if(c<0)return; // scrolled off to the left
    const m=document.createElement('div');
    m.className='mark '+(x.w==='PLAYER'?'player':'banker');
    m.style.left=(c*16+1)+'px';m.style.top=(x.row*16+1)+'px';
    m.textContent=x.tie?`+${x.tie}`:'';
    el.appendChild(m);
  });
}
// =====================================================================
// VOICE ANNOUNCER — three short voice clips: "You win!", "Last hand!",
// "New shoe!".
// - "New shoe!" ALWAYS plays your own recording at audio/new_shoe.mp3.
//   It never falls back to the browser's synthetic voice.
// - "You win!" and "Last hand!" play audio/you_win.mp3 and
//   audio/last_hand.mp3 if those files exist; otherwise they fall back
//   to the browser's speech synthesis (female English voice).
// - ANTI-OVERLAP RULE: "Last hand!" and "New shoe!" are never spoken at
//   the same time as "You win!". They wait until at least ANNOUNCE_GAP_MS
//   (3s) have passed since the win announcement started.
// =====================================================================
const Announcer=(()=>{
  const ANNOUNCE_GAP_MS=3000;      // minimum separation after "You win!"
  let lastWinAt=-Infinity;         // performance.now() of the last win clip

  /* ---- optional mp3 clips (used only if the file actually loads) ---- */
  const FILES={win:'audio/you_win.mp3',lastHand:'audio/last_hand.mp3',newShoe:'audio/new_shoe.mp3'};
  const clips={};
  for(const key in FILES){
    const a=new Audio();
    const state={a,ready:false};
    a.preload='auto';
    a.addEventListener('canplaythrough',()=>{state.ready=true},{once:true});
    a.addEventListener('error',()=>{state.ready=false},{once:true});
    a.src=FILES[key];
    clips[key]=state;
  }

  /* ---- KEEP-ALIVE: never let the sound device fall asleep ----
     Many outputs (Bluetooth speakers, HDMI monitors, some laptop drivers)
     power down after a few seconds of silence and need ~0.5s to wake up,
     which CUTS OFF the first half of every clip. A permanently open,
     inaudible audio stream keeps the device awake, so every clip is heard
     from its very first millisecond. Started on the first click/keypress
     (browsers block audio before a user gesture). */
  let keepAliveCtx=null;
  function startKeepAlive(){
    if(keepAliveCtx)return;
    try{
      keepAliveCtx=new (window.AudioContext||window.webkitAudioContext)();
      const osc=keepAliveCtx.createOscillator();
      const g=keepAliveCtx.createGain();
      g.gain.value=0.001;        // effectively silent, but the stream stays open
      osc.frequency.value=20;    // below the audible range anyway
      osc.connect(g);g.connect(keepAliveCtx.destination);
      osc.start();
      if(keepAliveCtx.state==='suspended')keepAliveCtx.resume().catch(()=>{});
    }catch(_){keepAliveCtx=null;}
  }

  /* ---- PRIME: force-decode every mp3 on the first user gesture ----
     A muted play/pause makes the browser fully decode each file up front,
     so the first real announcement never starts mid-buffering. */
  function primeClips(){
    for(const key in clips){
      const c=clips[key];
      try{
        c.a.muted=true;
        const p=c.a.play();
        const restore=()=>{try{c.a.pause();c.a.currentTime=0;}catch(_){/*noop*/}c.a.muted=false;};
        if(p&&p.then)p.then(restore).catch(()=>{c.a.muted=false;});
        else restore();
      }catch(_){c.a.muted=false;}
    }
  }
  function unlockAudio(){startKeepAlive();primeClips();}
  window.addEventListener('pointerdown',unlockAudio,{once:true});
  window.addEventListener('keydown',unlockAudio,{once:true});

  /* ---- female voice for the speech-synthesis fallback ---- */
  let voice=null;
  function pickVoice(){
    if(!('speechSynthesis' in window))return;
    const voices=speechSynthesis.getVoices();
    if(!voices.length)return;
    const FEMALE_HINTS=['female','zira','aria','jenny','samantha','susan','karen','moira','tessa','victoria','joanna','salli','kendra','serena','catherine','hazel'];
    const en=voices.filter(v=>/^en/i.test(v.lang));
    voice=
      en.find(v=>FEMALE_HINTS.some(h=>v.name.toLowerCase().includes(h)))||
      voices.find(v=>FEMALE_HINTS.some(h=>v.name.toLowerCase().includes(h)))||
      en.find(v=>/google/i.test(v.name))||   // Google voices default female-sounding
      en[0]||voices[0]||null;
  }
  if('speechSynthesis' in window){
    pickVoice();
    speechSynthesis.onvoiceschanged=pickVoice; // Chrome loads voices async
  }

  function speak(text){
    if(!('speechSynthesis' in window))return;
    try{
      speechSynthesis.cancel();               // never let two phrases stack up
      const u=new SpeechSynthesisUtterance(text);
      if(voice)u.voice=voice;
      u.rate=0.95;u.pitch=1.15;u.volume=1;    // slightly higher pitch: friendly female tone
      speechSynthesis.speak(u);
    }catch(_){/* audio blocked before first user gesture: fail silently */}
  }

  /* Plays an mp3 from its very beginning. If the file is not fully
     decoded yet, it waits for 'canplaythrough' instead of starting
     mid-buffer (which sounds like "only the second half plays"). */
  function playFromStart(a,onFail){
    try{
      if(a.readyState>=3){a.currentTime=0;a.play().catch(()=>{if(onFail)onFail();});return;}
      a.addEventListener('canplaythrough',()=>{
        try{a.currentTime=0;a.play().catch(()=>{if(onFail)onFail();});}
        catch(_){if(onFail)onFail();}
      },{once:true});
      a.load();
    }catch(_){if(onFail)onFail();}
  }

  function play(key,text){
    const c=clips[key];
    if(key==='newShoe'){
      // Your own recording (audio/new_shoe.mp3): play it directly and
      // NEVER use the synthetic voice for this announcement.
      if(c)playFromStart(c.a,null);
      return;
    }
    if(c&&(c.ready||c.a.readyState>=3)){
      playFromStart(c.a,()=>speak(text));
      return;
    }
    speak(text);
  }

  // "Last hand!" / "New shoe!" respect the 3-second gap after "You win!".
  function schedule(key,text){
    const delay=Math.max(0,lastWinAt+ANNOUNCE_GAP_MS-performance.now());
    setTimeout(()=>play(key,text),delay);
  }

  return{
    win(){lastWinAt=performance.now();play('win','You win!')},
    lastHand(){schedule('lastHand','Last hand!')},
    newShoe(){schedule('newShoe','New shoe!')}
  };
})();

// Main game loop. A while(true) loop (instead of tail recursion) keeps
// memory flat during very long sessions: no promise chain ever builds up.

/* ---------------------------------------------------------------------
   TIMER RING — a circular progress ring around the countdown number.
   Built here (not in HTML) so it appears automatically on EVERY table
   page (index.html and game_table.html) with zero HTML changes.
   Look/colors: css section 6 (.timer-ring). Behavior:
   - Ring starts FULL and GREEN, drains smoothly second by second.
   - At 6 seconds left, ring and number turn RED (css .danger + .warning).
   --------------------------------------------------------------------- */
const RING_C=276.46; // circumference of r=44 circle (2*PI*44)
(function initTimerRing(){
  const t=$('timer');if(!t||t.closest('.timer-ring-wrap'))return;
  const wrap=document.createElement('div');
  wrap.className='timer-ring-wrap';
  t.parentNode.insertBefore(wrap,t);
  wrap.innerHTML=
    '<svg class="timer-ring" viewBox="0 0 100 100" aria-hidden="true">'+
    '<circle class="ring-fg" cx="50" cy="50" r="44"/>'+
    '</svg>';
  wrap.appendChild(t); // the number sits centered on top of the ring
})();
function updateTimerRing(sec){
  const fg=document.querySelector('.timer-ring .ring-fg');if(!fg)return;
  const frac=Math.max(0,sec)/CFG.betSeconds;          // 1 → full, 0 → empty
  fg.style.strokeDashoffset=String(RING_C*(1-frac));  // css animates the drain
  fg.classList.toggle('danger',sec<=6);
}

async function cycle(){
  const timerPanel=document.querySelector('.timer-panel');
  while(true){
    // --- Betting phase ---
    if($('winMessage'))$('winMessage').classList.add('hidden');
    if(timerPanel)timerPanel.classList.remove('warning');
    betting=true;setControls(true);
    timer=CFG.betSeconds;
    $('phase').textContent='Place Your Bets';
    // Shoe message — updates ONCE per cycle, exactly when the countdown restarts:
    // "New Shoe." (hand 1) → "Current Shoe.." (hand 2+) → "Last Hand!" (announced
    // final hand after the cut card) → back to "New Shoe."
    // "Last Hand!" and "New Shoe." also trigger their voice clip (delayed if
    // "You win!" just played — see Announcer.schedule).
    const shoeMsg=$('shoeMessage');
    if(shoeMsg){
      const msg=
        engine.shoe.needsNew()?'New Shoe.':
        engine.shoe.cutTriggered?'Last Hand!':
        hand===0?'New Shoe.':'Current Shoe..';
      if(msg!==shoeMsg.textContent){
        if(msg==='Last Hand!')Announcer.lastHand();
        else if(msg==='New Shoe.')Announcer.newShoe();
      }
      shoeMsg.textContent=msg;
    }
    while(timer>=0){
      $('timer').textContent=timer;
      updateTimerRing(timer);
      if(timerPanel)timerPanel.classList.toggle('warning',timer<=6&&timer>0);
      await wait(1000);
      timer--;
    }
    if(timerPanel)timerPanel.classList.remove('warning');

    // --- Dealing phase ---
    betting=false;setControls(false);
    $('phase').textContent='Dealing';
    const oldShoe=engine.shoeNo;
    const res=engine.deal();
    if(res.shoeNo!==oldShoe)resetShoeView();
    hand++;
    $('handNumber').textContent=hand;
    $('shoeNumber').textContent=res.shoeNo;
    $('cardsLeft').textContent=res.cardsLeft;
    await renderHand(res);

    // --- Resolution phase ---
    const playerWon=pay(res);
    roads.add(res.winner);
    updateStats(res);
    drawRoads();
    $('phase').textContent='Result: '+res.winner;
    if(playerWon&&$('winMessage')){$('winMessage').classList.remove('hidden');Announcer.win();}
    await wait(CFG.showMs);
  }
}
function setControls(on){document.querySelectorAll('.bet-zone,#rebetBtn,#doubleBtn,#clearBtn').forEach(e=>e.classList.toggle('disabled',!on))}
function setChipButtonActive(btn){document.querySelectorAll('[data-chip]').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}
function getCustomChipValue(){const input=$('customChipInput');let v=input?Number(input.value):15;if(!Number.isFinite(v))v=15;v=Math.round(v/5)*5;/* $5 steps */v=Math.max(15,Math.min(10000,v));if(input)input.value=v;return v;}
document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{chip=b.dataset.chip==='custom'?getCustomChipValue():Number(b.dataset.chip);setChipButtonActive(b)});
const setCustomBtn=$('setCustomChipBtn');
if(setCustomBtn)setCustomBtn.onclick=()=>{chip=getCustomChipValue();const btn=$('customChipBtn');if(btn)setChipButtonActive(btn);const p=$('customChipPanel'),m=$('customMenuBtn');if(p)p.classList.add('hidden');if(m)m.textContent='+';};
// Dropdown menu for the custom chip: the (+) badge shows/hides the panel.
const customMenuBtn=$('customMenuBtn'),customPanel=$('customChipPanel');
if(customMenuBtn&&customPanel)customMenuBtn.onclick=()=>{const nowHidden=customPanel.classList.toggle('hidden');customMenuBtn.textContent=nowHidden?'+':'−';if(!nowHidden){const inp=$('customChipInput');if(inp)inp.focus();}};
// The dropdown now FLOATS over the table: clicking anywhere outside it closes it.
if(customMenuBtn&&customPanel)document.addEventListener('click',e=>{if(customPanel.classList.contains('hidden'))return;if(customPanel.contains(e.target)||e.target===customMenuBtn)return;customPanel.classList.add('hidden');customMenuBtn.textContent='+';});
function getActiveChipButton(){return document.querySelector('[data-chip].active')||document.querySelector('[data-chip="1"]')}

/* ===================================================================
   TABLE CHIPS — real-casino behavior:
   - The chip flies with an ARC (tossed onto the table) and LANDS as a
     physical chip, stacked on the RIGHT side of the bet zone so the
     bet amount number is never covered.
   - EXCLUSIVE BET: only ONE zone can hold a bet at a time (no casino
     lets you bet Player, Banker and Tie at once). While betting is
     open, a single CLICK on either of the other two zones makes the
     whole bet JUMP to that zone. Clicking the active zone (or an
     empty table) adds a chip of the selected value.
   - Chips stay on the table during the deal. At the end:
     LOSING chips fly toward the dealer (top of the table).
     WINNING/RETURNED chips fly down to the player's balance.
   =================================================================== */
const CHIP_SIZE=34, CHIP_STACK_STEP=5, CHIP_STACK_MAX_OFFSET=11; // visual stack limit
function chipColorFor(v){
  // Official denominations: $1 white | $5 red | $10 blue | $50 green | $100 black.
  // Any other amount (custom chip, Re-bet/X2 combined stacks) uses the purple custom color.
  if(v===1)  return{a:'#ffffff',b:'#dedede',text:'#000'};
  if(v===5)  return{a:'#ff3333',b:'#ff0000',text:'#fff'};
  if(v===10) return{a:'#3333ff',b:'#0000ff',text:'#fff'};
  if(v===50) return{a:'#338333',b:'#008000',text:'#fff'};
  if(v===100)return{a:'#030303',b:'#000000',text:'#fff'};
  return{a:'#833383',b:'#800080',text:'#fff'}; // custom values
}
function makeChipEl(v){
  const el=document.createElement('div');
  el.className='table-chip';
  const c=chipColorFor(v);
  el.style.background=`linear-gradient(180deg, ${c.a}, ${c.b})`;
  el.style.color=c.text;
  el.textContent='$'+formatCompact(v);
  // pointer-events:none in CSS: clicking a chip counts as clicking the zone.
  return el;
}
// Chips currently flying through the air toward a zone (arc animation in
// progress). Needed so a fast second click stacks on the right height.
const pendingChips={PLAYER:0,BANKER:0,TIE:0};
function activeBetZone(){return ['PLAYER','BANKER','TIE'].find(z=>bets[z]>0)||null}
function zoneEl(key){return document.querySelector(`.bet-zone[data-bet="${key}"]`)}
function stackChipRect(zone,index){
  // Where chip #index of the stack sits: right side, never covering the number.
  const r=zoneEl(zone).getBoundingClientRect();
  const lift=Math.min(index,CHIP_STACK_MAX_OFFSET)*CHIP_STACK_STEP;
  return{left:r.right-CHIP_SIZE-8,top:r.bottom-CHIP_SIZE-6-lift};
}
function renderChipStack(zone){
  const btn=zoneEl(zone);
  tableChips[zone].forEach((c,i)=>{
    if(c.el.parentNode!==btn)btn.appendChild(c.el);
    c.el.classList.remove('chip-jump');
    c.el.style.position='absolute';
    c.el.style.left='auto';c.el.style.top='auto';
    c.el.style.right='8px';
    c.el.style.bottom=(6+Math.min(i,CHIP_STACK_MAX_OFFSET)*CHIP_STACK_STEP)+'px';
    c.el.style.zIndex=5+i;
  });
}
function addTableChip(zone,v){
  const chipObj={v,zone,el:makeChipEl(v)};
  tableChips[zone].push(chipObj);
  renderChipStack(zone);
}
function clearTableChips(){
  for(const k in tableChips){tableChips[k].forEach(c=>c.el.remove());tableChips[k]=[];}
}

/* --- Click-to-jump: ONE click on another zone moves the WHOLE bet there.
       Faster and simpler than dragging, and it makes multi-zone bets
       physically impossible: the stack always lives in a single zone. --- */
function moveBet(from,to){
  bets[to]=bets[from];
  bets[from]=0;
  const moving=tableChips[from];
  tableChips[from]=[];
  moving.forEach((c,i)=>{
    const a=c.el.getBoundingClientRect();
    c.zone=to;
    tableChips[to].push(c);
    const land=stackChipRect(to,tableChips[to].length-1);
    c.el.style.position='fixed';
    c.el.style.left=a.left+'px';c.el.style.top=a.top+'px';
    c.el.style.right='auto';c.el.style.bottom='auto';
    c.el.style.zIndex=1200+i;
    document.body.appendChild(c.el);
    c.el.style.setProperty('--tx',(land.left-a.left)+'px');
    c.el.style.setProperty('--ty',(land.top-a.top)+'px');
    c.el.classList.add('chip-jump');
  });
  renderBets();
  setTimeout(()=>{
    moving.forEach(c=>c.el.classList.remove('chip-jump'));
    renderChipStack(to);
  },420); // must match chipJump duration
}

/* --- Arc toss: chip lifts, curves through the air and lands on the stack --- */
function animateChipToBet(target){
  const source=getActiveChipButton();
  if(!source||!target)return;
  const zone=target.dataset.bet;
  const a=source.getBoundingClientRect();
  const land=stackChipRect(zone,tableChips[zone].length+pendingChips[zone]);
  pendingChips[zone]++;
  const fly=document.createElement('div');
  fly.className='flying-chip';
  fly.textContent='$'+formatCompact(chip);
  const c=chipColorFor(chip);
  fly.style.background=`linear-gradient(180deg, ${c.a}, ${c.b})`;
  fly.style.color=c.text;
  const startL=a.left+a.width/2-CHIP_SIZE/2;
  const startT=a.top+a.height/2-CHIP_SIZE/2;
  fly.style.left=startL+'px';
  fly.style.top=startT+'px';
  fly.style.setProperty('--tx',(land.left-startL)+'px');
  fly.style.setProperty('--ty',(land.top-startT)+'px');
  document.body.appendChild(fly);
  const value=chip,zoneKey=zone;
  setTimeout(()=>{fly.remove();pendingChips[zoneKey]--;addTableChip(zoneKey,value);},680); // must match chipArc duration
}

/* --- End of hand: chips leave the table --- */
function resolveTableChips(winner){
  const dealerTarget=document.querySelector('.topbar');      // "toward the dealer": top of the table
  const playerTarget=$('balance')||document.querySelector('.status-box'); // winnings fly to the balance in the top bar
  for(const zone of ['PLAYER','BANKER','TIE']){
    const kept=(winner===zone)||(winner==='TIE'&&zone!=='TIE'); // on TIE, P/B bets are returned
    tableChips[zone].forEach((c,i)=>flyChipAway(c.el,kept?playerTarget:dealerTarget,kept,i*70));
    tableChips[zone]=[];
  }
}
function flyChipAway(el,target,kept,delay){
  const a=el.getBoundingClientRect();
  const b=(target||document.body).getBoundingClientRect();
  el.style.position='fixed';
  el.style.left=a.left+'px';el.style.top=a.top+'px';
  el.style.right='auto';el.style.bottom='auto';el.style.zIndex=1100;
  document.body.appendChild(el);
  el.style.setProperty('--tx',(b.left+b.width/2-a.left-CHIP_SIZE/2)+'px');
  el.style.setProperty('--ty',(b.top+b.height/2-a.top-CHIP_SIZE/2)+'px');
  setTimeout(()=>{
    el.classList.add(kept?'chip-collect':'chip-lose');
    setTimeout(()=>el.remove(),820);
  },delay);
}

document.querySelector('[data-chip="1"]').classList.add('active');
document.querySelectorAll('.bet-zone').forEach(b=>b.onclick=()=>{
  if(!betting)return;
  const k=b.dataset.bet;
  const active=activeBetZone();

  // EXCLUSIVE BET RULE: if the bet lives in another zone, one click here
  // makes it JUMP to this zone. Betting 2 or 3 zones at once is impossible.
  if(active&&active!==k){moveBet(active,k);RemoteTable.push();return;}

  // Same zone (or empty table): add a chip of the selected value.
  if(balance<chip)return;
  animateChipToBet(b);
  bets[k]+=chip;
  balance-=chip;
  renderBalance();
  renderBets();
  RemoteTable.push();
});
$('clearBtn').onclick=()=>{if(!betting)return;balance=toCents(balance+bets.PLAYER+bets.BANKER+bets.TIE);bets={PLAYER:0,BANKER:0,TIE:0};clearTableChips();renderBalance();renderBets();RemoteTable.push()};
$('rebetBtn').onclick=()=>{const t=lastBets.PLAYER+lastBets.BANKER+lastBets.TIE;if(!betting||!t||balance<t)return;if(activeBetZone())return;/* exclusive rule: Re-bet only on an empty table */for(const k in bets){if(lastBets[k]>0){bets[k]+=lastBets[k];addTableChip(k,lastBets[k]);}}balance=toCents(balance-t);renderBalance();renderBets();RemoteTable.push()};
$('doubleBtn').onclick=()=>{const t=bets.PLAYER+bets.BANKER+bets.TIE;if(!betting||!t||balance<t)return;for(const k in bets){if(bets[k]>0){addTableChip(k,bets[k]);bets[k]*=2;}}balance=toCents(balance-t);renderBalance();renderBets();RemoteTable.push()};
$('cardsLeft').textContent=engine.shoe.cards.length;
renderBalance(); // shows cents from the very first paint

/* ---------------------------------------------------------------------
   SERVER SYNC (fase 2.3) — "Net": el puente entre el juego y la cuenta.
   Con sesión (js/auth.js), balance/XP/Free Token viven en el SERVIDOR:
   - init():       al cargar, trae el estado real de la cuenta.
   - reportHand(): al liquidar cada mano, la reporta; el servidor valida
                   apuestas, aplica los pagos oficiales y suma XP.
   - claimToken(): el Free Token lo entrega el servidor (reloj de 24h
                   en la cuenta — inmune a F12 y a borrar el navegador).
   El juego calcula todo localmente primero (animaciones instantáneas) y
   luego "ajusta" el balance al valor oficial del servidor. Como ambos
   usan la misma matemática, normalmente no se nota ningún salto.
   applyBalance() resta las apuestas que ya están sobre la mesa, porque
   el servidor no las conoce hasta que la mano se liquida.
   En MODO LOCAL (doble clic, sin servidor) Net queda apagado y todo
   funciona como en la Fase 1.
   --------------------------------------------------------------------- */
const Net={
  on:false,          // true = cuenta conectada al servidor
  ftNextAt:0,        // próximo Free Token (timestamp, modo servidor)
  applyBalance(b){
    balance=toCents(b-(bets.PLAYER+bets.BANKER+bets.TIE));
    renderBalance();
  },
  /* XP EN VIVO (junto al Balance de la barra superior): el marcador se
     INYECTA desde aquí — no hay que editar index.html ni game_table.html,
     y solo aparece en modo cuenta (en modo local el XP no existe). */
  ensureXpBox(){
    if(document.getElementById('xpTotal'))return;
    const balEl=$('balance');
    if(!balEl||!balEl.parentElement)return;
    const span=document.createElement('span');
    span.innerHTML='XP: <strong id="xpTotal">0</strong>';
    balEl.parentElement.insertAdjacentElement('afterend',span);
  },
  renderXp(){
    const el=document.getElementById('xpTotal');
    if(!el)return;
    const txt=xp.toLocaleString('en-US');
    if(el.textContent!==txt){
      el.textContent=txt;
      /* mini-destello cuando sube, mismo espíritu que el balance */
      el.style.transition='none';el.style.color='#1fd655';
      requestAnimationFrame(()=>{el.style.transition='color .9s';el.style.color='';});
    }
    el.title=xp.toLocaleString('en-US')+' XP — nivel '+currentLevel().name;
  },
  async init(){
    if(!window.BaccaAuth)return;
    const u=await BaccaAuth.ready;
    if(!u)return;                              // modo local: Net apagado
    try{
      const r=await fetch('/api/state');
      if(!r.ok)return;
      const s=await r.json();
      this.on=true;
      xp=s.xp||0;
      this.ftNextAt=(s.freeTokenAt||0)+FREE_TOKEN_MS;
      this.applyBalance(s.balance);
      this.ensureXpBox();
      this.renderXp();
      ftRender();
    }catch(_){}
  },
  async reportHand(betsSnap,winner){
    if(!this.on)return;
    const total=betsSnap.PLAYER+betsSnap.BANKER+betsSnap.TIE;
    if(total<=0)return;                        // sin apuesta: nada que reportar
    try{
      const r=await fetch('/api/hand-result',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({bets:betsSnap,winner})
      });
      if(!r.ok)return;
      const s=await r.json();
      xp=s.xp;                                 // el XP oficial viene del servidor
      this.renderXp();
      this.applyBalance(s.balance);
    }catch(_){}
  },
  async claimToken(){
    const r=await fetch('/api/free-token',{method:'POST'});
    const s=await r.json();
    if(!r.ok){
      if(Number.isFinite(s.freeTokenAt))this.ftNextAt=s.freeTokenAt+FREE_TOKEN_MS;
      throw new Error(s.error||'Free Token no disponible.');
    }
    xp=s.xp;
    this.renderXp();
    this.ftNextAt=s.freeTokenAt+FREE_TOKEN_MS;
    this.applyBalance(s.balance);
    return s.bonus;
  }
};

/* ---------------------------------------------------------------------
   FREE TOKEN — daily bonus button (top bar, next to the balance).
   Rules (see rules.html, Player Economy): once every 24 hours the
   player claims a free chip bonus; the amount depends on their level.
   - LEVELS is the official table (XP thresholds + daily bonus).
   - XP system is not wired yet, so `xp` is 0 → Bronze → $1. The moment
     the XP system lands, the bonus scales automatically. No other code
     will need to change.
   - Last claim time persists in localStorage, so the 24h clock survives
     reloads. (The balance itself is not persisted yet — accounts are
     phase 2.)
   --------------------------------------------------------------------- */
const LEVELS=[
  {name:'Bronze',  xp:0,             bonus:1},
  {name:'Silver',  xp:1e4,           bonus:2},
  {name:'Gold',    xp:1e5,           bonus:3},
  {name:'Platinum',xp:1e6,           bonus:5},
  {name:'Diamond', xp:1e7,           bonus:8},
  {name:'Elite',   xp:1e8,           bonus:12},
  {name:'Stellar', xp:1e9,           bonus:20},
  {name:'Legend',  xp:1e10,          bonus:30}
];
let xp=0; // placeholder until the XP system is wired
function currentLevel(){let l=LEVELS[0];for(const lv of LEVELS){if(xp>=lv.xp)l=lv;}return l;}

const FREE_TOKEN_MS=24*60*60*1000;
const FT_KEY='be_freeTokenLast';
function ftMsLeft(){
  if(Net.on)return Math.max(0,Net.ftNextAt-Date.now());   // reloj de la CUENTA
  const last=Number(localStorage.getItem(FT_KEY)||0);     // modo local (demo)
  return Math.max(0,last+FREE_TOKEN_MS-Date.now());
}
function ftRender(){
  const btn=$('freeTokenBtn');if(!btn)return;
  const left=ftMsLeft();
  if(left<=0){
    btn.disabled=false;
    btn.classList.add('ready');
    btn.textContent='🎁 Free Token';
    btn.title='Claim your daily $'+currentLevel().bonus+' bonus';
  }else{
    const h=Math.floor(left/3600000),m=Math.ceil((left%3600000)/60000);
    btn.disabled=true;
    btn.classList.remove('ready');
    btn.textContent='Already Claimed';
    btn.title='Next free token in '+h+'h '+m+'m'; // exact time on hover only
  }
}
(function initFreeToken(){
  const btn=$('freeTokenBtn');if(!btn)return;
  btn.onclick=async()=>{
    if(ftMsLeft()>0)return;
    if(Net.on){
      /* MODO CUENTA: el servidor entrega el bono y actualiza el reloj */
      try{
        await Net.claimToken();
        Announcer.youWin&&Announcer.youWin();
      }catch(_){/* p.ej. dos pestañas reclamando a la vez: gana una sola */}
      ftRender();
      return;
    }
    /* MODO LOCAL (demo sin servidor) */
    const bonus=currentLevel().bonus;
    balance=toCents(balance+bonus);
    renderBalance();
    localStorage.setItem(FT_KEY,String(Date.now()));
    ftRender();
    Announcer.youWin&&Announcer.youWin(); // small celebration clip if available
  };
  ftRender();
  setInterval(ftRender,30000); // countdown refreshes every 30s
})();
/* ---------------------------------------------------------------------
   MESA COMPARTIDA (fase 2.4) — "RemoteTable": cuando la página es
   game_table.html?table=<mesa> y hay servidor, el motor local se APAGA
   y esta pieza conecta con la mesa del SERVIDOR por WebSocket:
   - El servidor reparte; TODOS los sentados ven las mismas cartas.
   - Las apuestas viajan al servidor en cada cambio (zona exclusiva y
     fondos se validan allá); la liquidación llega ya hecha.
   - Reusa TODAS las funciones visuales existentes (renderHand, roads,
     fichas, Announcer...) — cero duplicación de código.
   En modo local (doble clic, sin servidor) nada cambia: motor Fase 1.
   --------------------------------------------------------------------- */
const TABLE_KEY=new URLSearchParams(location.search).get('table');
const TOUR_SLOT=new URLSearchParams(location.search).get('tournament');
const RemoteTable={
  on:false, ws:null, alive:false, countdownId:null, pendingSettle:null,
  isTournament:false, _n:null, _max:null, _xpWon:null,
  start(){
    this.on=true;
    this.isTournament=!!TOUR_SLOT;
    betting=false; setControls(false);
    $('phase').textContent='Connecting…';
    const proto=location.protocol==='https:'?'wss://':'ws://';
    const url=this.isTournament
      ?proto+location.host+'/tournament?slot='+encodeURIComponent(TOUR_SLOT)
      :proto+location.host+'/table?key='+encodeURIComponent(TABLE_KEY);
    this.ws=new WebSocket(url);
    this.ws.onmessage=e=>{let ev;try{ev=JSON.parse(e.data)}catch{return}this.handle(ev)};
    this.ws.onclose=ev=>{
      clearInterval(this.countdownId);
      const home=this.isTournament?'tournaments.html':'public_tables.html';
      const MAP={
        4003:this.isTournament?'This tournament table is full (6/6). Try another one.':'This table is full (10/10). Try another one.',
        4004:'You are already seated at this table in another tab.',
        4005:'This tournament has not opened yet.',
        4006:'This tournament has already ended.',
        4007:'You already joined a different tournament table today — one tournament per player per day.'
      };
      if(MAP[ev.code]){alert(MAP[ev.code]);location.href=home;return}
      alert(this.alive?'Connection to the table was lost.':'Could not join the table.');
      location.href=home;
    };
  },
  /* título de la mesa: sentados (n/max) + para torneo, tu XP ganado aquí */
  updateTitle(){
    const el=$('tableTitle');if(!el)return;
    if(!el.dataset.base)el.dataset.base=el.textContent;
    let txt=el.dataset.base;
    if(this._n!=null)txt+='  ('+this._n+'/'+(this._max||10)+')';
    if(this.isTournament&&this._xpWon!=null)txt+='  ·  XP won here: '+this._xpWon;
    el.textContent=txt;
  },
  /* cada cambio local de apuestas se refleja al servidor (foto absoluta) */
  push(){ if(this.on&&this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify({t:'bets',bets:{...bets}})); },
  runCountdown(secs){
    clearInterval(this.countdownId);
    const panel=document.querySelector('.timer-panel');
    let tv=secs;
    const tick=()=>{
      $('timer').textContent=tv;updateTimerRing(tv);
      if(panel)panel.classList.toggle('warning',tv<=6&&tv>0);
      if(tv<=0){clearInterval(this.countdownId);if(panel)panel.classList.remove('warning');}
      tv--;
    };
    tick();this.countdownId=setInterval(tick,1000);
  },
  applyShoeMsg(msg){
    const sm=$('shoeMessage');if(!sm)return;
    if(msg!==sm.textContent){
      if(msg==='Last Hand!')Announcer.lastHand();
      else if(msg==='New Shoe.')Announcer.newShoe();
    }
    sm.textContent=msg;
  },
  async handle(ev){
    switch(ev.t){

      case 'init':{
        this.alive=true;
        this.isTournament=!!ev.tourney;
        this._max=ev.max||10;
        resetShoeView();
        (ev.results||[]).forEach(w=>roads.add(w));drawRoads();
        stats={...ev.stats};renderStats();
        hand=ev.hand;$('handNumber').textContent=hand;
        $('shoeNumber').textContent=ev.shoeNo;
        $('cardsLeft').textContent=ev.cardsLeft;
        this.applyShoeMsg(ev.shoeMsg);
        if(this.isTournament){
          /* bankroll PRESTADO, no tu balance real: se muestra en el
             mismo campo (misma UI, mismos controles de apuesta), pero
             etiquetado como "Bankroll" y sin Free Token (no aplica). */
          balance=ev.bankroll;renderBalance();
          const lbl=$('balance').previousSibling;
          if(lbl&&lbl.nodeType===3)lbl.textContent='Bankroll: $';
          const ftBtn=$('freeTokenBtn');if(ftBtn)ftBtn.style.display='none';
        }
        this._n=ev.n;this.updateTitle();
        if(ev.phase==='betting'&&ev.secs>0){
          betting=true;setControls(true);
          $('phase').textContent='Place Your Bets';
          this.runCountdown(ev.secs);
        }else{
          betting=false;setControls(false);
          $('phase').textContent=ev.phase==='waking'?'Starting…':'Dealing';
          $('timer').textContent='·';
        }
        break;
      }

      case 'seats':{
        /* el título de la mesa muestra los sentados en vivo: (n/max) */
        this._n=ev.n;if(ev.max!=null)this._max=ev.max;
        this.updateTitle();
        break;
      }

      case 'betting':{
        if($('winMessage'))$('winMessage').classList.add('hidden');
        betting=true;setControls(true);
        $('phase').textContent='Place Your Bets';
        $('shoeNumber').textContent=ev.shoeNo;
        $('cardsLeft').textContent=ev.cardsLeft;
        this.applyShoeMsg(ev.shoeMsg);
        this.runCountdown(ev.secs);
        break;
      }

      case 'bets-ok': break;                     /* servidor conforme */

      case 'notice':{
        /* el servidor corrigió: re-sincronizamos apuestas y balance local */
        if(ev.bets){
          const diff=toCents((bets.PLAYER+bets.BANKER+bets.TIE)-(ev.bets.PLAYER+ev.bets.BANKER+ev.bets.TIE));
          balance=toCents(balance+diff);
          bets={...ev.bets};
          clearTableChips();
          for(const k in bets)if(bets[k]>0)addTableChip(k,bets[k]);
          renderBalance();renderBets();
        }
        break;
      }

      case 'settled':this.pendingSettle=ev;break;  /* se aplica tras la animación */

      case 'tour-ended':{
        /* la mesa de torneo cerró por reloj — el servidor ya desconecta */
        alert(ev.winner
          ?'Tournament over! Winner: '+ev.winner.name+' with '+ev.winner.xp.toLocaleString('en-US')+' XP.'
          :'Tournament over — nobody won XP at this table this time.');
        break;
      }

      case 'deal':{
        betting=false;setControls(false);
        clearInterval(this.countdownId);
        $('phase').textContent='Dealing';
        if(ev.newShoe)resetShoeView();
        hand=ev.hand;$('handNumber').textContent=hand;
        $('shoeNumber').textContent=ev.res.shoeNo;
        $('cardsLeft').textContent=ev.res.cardsLeft;
        await renderHand(ev.res);                  /* misma animación de siempre */

        /* resolución — espejo de pay() pero con la liquidación DEL SERVIDOR */
        const s=this.pendingSettle;this.pendingSettle=null;
        resolveTableChips(ev.res.winner);
        lastBets={...bets};
        bets={PLAYER:0,BANKER:0,TIE:0};
        renderBets();
        if(s){
          if(this.isTournament){
            /* el Bankroll se muestra local (nunca sincroniza tu balance
               real); el XP SÍ es real y permanente — se acredita ya en
               el servidor, aquí solo reflejamos el contador. */
            if(s.bankroll!=null){balance=s.bankroll;renderBalance();}
            if(s.xpWon!=null){this._xpWon=s.xpWon;this.updateTitle();}
            if(s.xp!=null){xp=s.xp;if(Net.renderXp)Net.renderXp();}
          }else if(s.balance!=null){
            xp=s.xp;
            if(Net.renderXp)Net.renderXp();
            Net.applyBalance(s.balance);           /* balance oficial de la cuenta */
          }
        }
        roads.add(ev.res.winner);updateStats(ev.res);drawRoads();
        $('phase').textContent='Result: '+ev.res.winner;
        if(s&&s.won&&$('winMessage')){$('winMessage').classList.remove('hidden');Announcer.win();}
        break;
      }
    }
  }
};

Net.init(); // fase 2.3: trae balance/XP/Free Token de la cuenta (async; el juego arranca sin esperar)
if((TABLE_KEY||TOUR_SLOT)&&location.protocol!=='file:'){
  RemoteTable.start();   // fase 2.4/2.5: mesa pública o de TORNEO — el servidor reparte
}else{
  cycle();               // mesa privada (o modo local): motor propio
}

// =====================================================================
// ENGINE REPORT v2.0 - "Bacca-Auto Complete Report"
// ---------------------------------------------------------------------
// Public engine audit, generated and shown ON SCREEN in a modal:
// no forced download. "Copy report" sends it to the clipboard and
// "Download .txt" is an optional extra (the browser handles the
// destination folder with its own settings).
//
// Entry points:
//   - Menu button (#reportMenuBtn): runs a 100,000-hand simulation.
//   - Developer panel (Ctrl + Shift + D): reuses the same generator
//     and mirrors the report into #devOutput.
//
// The simulation uses the exact same Engine class as the live table,
// without animations and without bets.
// =====================================================================
(function initEngineReport(){
  const REPORT_HANDS_DEFAULT=100000;

  // Theoretical reference values for 8-deck baccarat.
  const THEORY={
    PLAYER:0.446247,   // Player win probability
    BANKER:0.458597,   // Banker win probability
    TIE:0.095156,      // Tie probability
    NATURAL:0.3420,    // either hand opens with a natural 8/9
    PAIR:0.0747        // first two cards of one side share the same rank
  };

  const overlay=$('reportOverlay');
  const body=$('reportBody');
  const closeBtn=$('reportCloseBtn');
  const copyBtn=$('reportCopyBtn');
  const downloadBtn=$('reportDownloadBtn');
  const menuBtn=$('reportMenuBtn');
  if(!overlay||!body)return;
  let currentReport='';

  /* ------------------------- math helpers ------------------------- */

  // Z-score of an observed count against a binomial expectation:
  // how many standard deviations away from theory the result landed.
  function zScore(observed,n,p){
    const sd=Math.sqrt(n*p*(1-p));
    return sd?(observed-n*p)/sd:0;
  }

  // Chi-square survival function for 2 degrees of freedom.
  // For df = 2 the exact closed form is p = e^(-x/2).
  function chiSquarePValue2df(x){return Math.exp(-x/2)}

  const signed=v=>(v>=0?'+':'')+v.toFixed(2);
  const pctf=(count,total,decimals=3)=>total?((count/total)*100).toFixed(decimals)+'%':'0%';

  /* -------------------------- simulation -------------------------- */

  function runSimulation(targetHands){
    const simEngine=new Engine();
    const s={
      hands:targetHands,
      PLAYER:0,BANKER:0,TIE:0,
      playerThird:0,bankerThird:0,
      naturals:0,playerPairs:0,bankerPairs:0,
      streaks:{PLAYER:0,BANKER:0,TIE:0},
      shoes:[],
      elapsed:'0.00'
    };
    const streak={type:null,len:0};
    let shoeHands=0;
    const started=performance.now();

    for(let i=0;i<targetHands;i++){
      const beforeShoe=simEngine.shoeNo;
      const res=simEngine.deal();
      if(res.shoeNo!==beforeShoe){
        s.shoes.push({shoe:beforeShoe,hands:shoeHands});
        shoeHands=0;
      }
      shoeHands++;

      s[res.winner]++;
      if(res.playerCards.length===3)s.playerThird++;
      if(res.bankerCards.length===3)s.bankerThird++;
      if(res.natural)s.naturals++;
      if(res.playerCards[0].r===res.playerCards[1].r)s.playerPairs++;
      if(res.bankerCards[0].r===res.bankerCards[1].r)s.bankerPairs++;

      if(streak.type===res.winner)streak.len++;
      else{streak.type=res.winner;streak.len=1;}
      if(streak.len>s.streaks[res.winner])s.streaks[res.winner]=streak.len;
    }
    s.shoes.push({shoe:simEngine.shoeNo,hands:shoeHands});
    s.elapsed=((performance.now()-started)/1000).toFixed(2);
    return s;
  }

  /* -------------------------- report text ------------------------- */

  function buildReport(s){
    const n=s.hands;
    const line='='.repeat(46);
    const rule='-'.repeat(46);

    // Observed vs expected table (with z-scores).
    const header='          Observed    Expected    Z-score';
    const tableRows=['PLAYER','BANKER','TIE'].map(k=>{
      const label=(k[0]+k.slice(1).toLowerCase()).padEnd(8);
      const obs=pctf(s[k],n).padStart(9);
      const exp=((THEORY[k]*100).toFixed(3)+'%').padStart(11);
      const z=signed(zScore(s[k],n,THEORY[k])).padStart(10);
      return label+obs+exp+z;
    });

    // Chi-square goodness-of-fit over the three outcomes (2 df).
    let chi2=0;
    for(const k of ['PLAYER','BANKER','TIE']){
      const expected=n*THEORY[k];
      chi2+=Math.pow(s[k]-expected,2)/expected;
    }
    const pValue=chiSquarePValue2df(chi2);
    const verdict=
      pValue>=0.05?'PASS - consistent with a fair random engine':
      pValue>=0.01?'REVIEW - mild deviation, may still be chance':
                   'FAIL - deviation beyond normal random range';

    // House edge computed from the observed results.
    // Banker bet pays 0.95:1, Player 1:1, Tie 8:1 (P/B push on a tie).
    const edgeBanker=((s.PLAYER-0.95*s.BANKER)/n*100).toFixed(2);
    const edgePlayer=((s.BANKER-s.PLAYER)/n*100).toFixed(2);
    const edgeTie=(((s.PLAYER+s.BANKER)-8*s.TIE)/n*100).toFixed(2);

    // RNG actually in use on this device (same check as rng01).
    const rngName=(window.crypto&&crypto.getRandomValues)
      ?'crypto.getRandomValues (CSPRNG)'
      :'Math.random (fallback)';

    const lastShoes=s.shoes.slice(-10).map(x=>x.hands).join(', ');

    return [
      line,
      'BACCA-AUTO COMPLETE REPORT',
      line,
      'Version: v2.0',
      `Date: ${new Date().toLocaleString('en-US')}`,
      `Hands simulated: ${n.toLocaleString('en-US')}`,
      `Calculation time: ${s.elapsed} seconds`,
      '',
      'RESULTS vs THEORY',
      rule,
      header,
      ...tableRows,
      '',
      'STATISTICAL VALIDATION',
      rule,
      `Chi-square: ${chi2.toFixed(2)} (2 df)`,
      `P-value: ${pValue.toFixed(4)}`,
      `Verdict: ${verdict}`,
      '',
      'NATURALS AND PAIRS',
      rule,
      `Naturals (8/9): ${pctf(s.naturals,n,2)}  (theory ${(THEORY.NATURAL*100).toFixed(2)}%)`,
      `Player Pair:    ${pctf(s.playerPairs,n,2)}   (theory ${(THEORY.PAIR*100).toFixed(2)}%)`,
      `Banker Pair:    ${pctf(s.bankerPairs,n,2)}   (theory ${(THEORY.PAIR*100).toFixed(2)}%)`,
      '',
      'HOUSE EDGE (from observed results)',
      rule,
      `Banker bet: ${edgeBanker}% | Player bet: ${edgePlayer}% | Tie bet (8:1): ${edgeTie}%`,
      '',
      'ENGINE',
      rule,
      `RNG: ${rngName}`,
      'Shuffle: Fisher-Yates',
      `Decks per shoe: ${CFG.decks}`,
      `Player third card: ${pctf(s.playerThird,n)}`,
      `Banker third card: ${pctf(s.bankerThird,n)}`,
      '',
      'STREAKS AND SHOES',
      rule,
      `Longest streaks: Player ${s.streaks.PLAYER} | Banker ${s.streaks.BANKER} | Tie ${s.streaks.TIE}`,
      `Shoes used: ${s.shoes.length.toLocaleString('en-US')}`,
      `Average hands per shoe: ${(n/s.shoes.length).toFixed(2)}`,
      `Hands in the last 10 shoes: ${lastShoes}`,
      '',
      'NOTE',
      rule,
      'Generated with the same live-table engine,',
      'without animations and without bets.',
      line
    ].join('\n');
  }

  /* ----------------------------- modal ----------------------------- */

  function openModal(){
    overlay.classList.remove('hidden');
    if(closeBtn)closeBtn.focus();
  }
  function closeModal(){overlay.classList.add('hidden')}

  if(closeBtn)closeBtn.onclick=closeModal;
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!overlay.classList.contains('hidden'))closeModal();
  });

  function generateAndShow(targetHands){
    body.textContent=`Generating report for ${targetHands.toLocaleString('en-US')} hands...`;
    openModal();
    // Small pause so the browser can paint the loading message
    // before the heavy simulation loop starts.
    setTimeout(()=>{
      const stats=runSimulation(targetHands);
      currentReport=buildReport(stats);
      body.textContent=currentReport;
      const devOutput=$('devOutput');
      if(devOutput)devOutput.textContent=currentReport; // mirror into the dev panel
    },50);
  }

  if(menuBtn)menuBtn.onclick=()=>generateAndShow(REPORT_HANDS_DEFAULT);
  // Arriving from a section page via the shared menu (index.html?report=1):
  // open the Engine Report automatically.
  if(menuBtn&&new URLSearchParams(location.search).has('report'))menuBtn.onclick();
  document.querySelectorAll('[data-sim]').forEach(btn=>{
    btn.onclick=()=>generateAndShow(Number(btn.dataset.sim));
  });

  /* ------------------------ copy & download ------------------------ */

  if(copyBtn)copyBtn.onclick=async()=>{
    if(!currentReport)return;
    try{
      await navigator.clipboard.writeText(currentReport);
    }catch(_){
      // Fallback for contexts without the async Clipboard API.
      const ta=document.createElement('textarea');
      ta.value=currentReport;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const label=copyBtn.textContent;
    copyBtn.textContent='Copied!';
    copyBtn.classList.add('copied');
    setTimeout(()=>{copyBtn.textContent=label;copyBtn.classList.remove('copied')},1600);
  };

  // Optional download: the browser decides the destination folder with
  // its own settings. No local paths are ever mentioned in the report.
  if(downloadBtn)downloadBtn.onclick=()=>{
    if(!currentReport)return;
    const d=new Date(),pad=x=>String(x).padStart(2,'0');
    const stamp=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const blob=new Blob([currentReport],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`BaccaAuto_Report_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  /* ------------------- developer panel (unchanged) ------------------ */
  // Ctrl + Shift + D toggles the internal panel; its button reuses the
  // same report generator above via the [data-sim] wiring.
  const panel=$('devPanel');
  const devCloseBtn=$('devCloseBtn');
  if(!panel||!devCloseBtn)return;

  function toggleDevPanel(force){
    const show=typeof force==='boolean'?force:panel.classList.contains('hidden');
    panel.classList.toggle('hidden',!show);
    panel.setAttribute('aria-hidden',String(!show));
  }
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='d'){
      e.preventDefault();
      toggleDevPanel();
    }
  });
  devCloseBtn.onclick=()=>toggleDevPanel(false);
})();
