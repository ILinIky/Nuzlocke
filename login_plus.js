 //FUNKTIONS

 function ljCreateLobby(){
  window.clickCreateLobby?.();
  setTimeout(() => ljCancel.click(), 500);
}

function ljLink(){
  //alert("test");
  window.copylink?.();

  //setTimeout(() => ljCancel.click(), 500);
}

function ljCode(){
  //alert("test");

  //window.quickjoin('XNAIR8');
  window.copylooby?.();
  //setTimeout(() => ljCancel.click(), 500);
}

function ljjoinlobby(){
  //console.error(ljCodeLobby);
  //alert(ljCodeLobby.value);
  //return;
  //alert("test");
  //window.quickjoin({ cd: ljCode.value});
  window.quickjoin?.(ljCodeLobby.value);
  //window.copylooby?.();
  setTimeout(() => ljCancel.click(), 500);
}


// login_plus.js – Fancy Login Wizard + Parallax + Stardust + Auto-Join
(function(){
  const RM = matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const $ = (s,r=document)=> r.querySelector(s);
  const $$ = (s,r=document)=> Array.from(r.querySelectorAll(s));

  // ---- Boot when overlay is visible ----
  document.addEventListener('DOMContentLoaded', () => {
    const overlay = $('#loginOverlay');
    const card    = overlay?.querySelector('.login-card');
    if (!overlay || !card) return;
    // wenn Login sichtbar ist, Wizard bauen
    const isShown = overlay.hidden === false || getComputedStyle(overlay).display !== 'none';
    if (isShown) mountWizard(card);
    // sonst warten bis geöffnet
    const mo = new MutationObserver(()=> {
      const vis = overlay.hidden === false || getComputedStyle(overlay).display !== 'none';
      if (vis){ mountWizard(card); mo.disconnect(); }
    });
    mo.observe(overlay, { attributes:true, attributeFilter:['hidden','style'] });
  });

 
  // ---- Build Wizard UI inside .login-card ----
  function mountWizard(card){
    if (card.dataset.wizReady) return;
    card.dataset.wizReady = '1';
    requestAnimationFrame(()=> card.classList.add('is-in'));

    // vorhandene Controls merken
    const nameInput = $('#trainerName');
    const startBtn  = $('#startBtn');

    // bestehende Row verstecken (wir steuern Start selber)
    const oldRow = card.querySelector('.row.center');
    if (oldRow) oldRow.style.display = 'none';

    // Wizard DOM
    const wiz = document.createElement('div');
    wiz.className = 'login-wizard';
    wiz.innerHTML = `
      <div class="wiz-head" aria-hidden="true">
        <span class="ball-step on"></span>
        <span class="ball-step"></span>
        <span class="ball-step"></span>
      </div>

      <div class="wiz-body">
        <!-- STEP 1: Name -->
        <section class="wiz-step active" data-step="1">
          <div class="wiz-row">
            <div class="avatar-bubble" id="wizAvatar">?</div>
          </div>
          <div class="wiz-row">
            <input id="wizName" type="text" placeholder="Dein Trainername" autocomplete="nickname" />
          </div>
          <div class="wiz-row"><span class="note">Tipp: Einprägsamer Name hilft beim Multiplayer.</span></div>
          <div class="wiz-actions">
            <button class="btn ok" id="wizNext1">Weiter</button>
          </div>
        </section>

        <!-- STEP 2: Style/Theme -->
        <section class="wiz-step" data-step="2">
          <div class="wiz-row" style="margin-top:-2px"><b>Wähle dein Theme</b></div>
          <div class="theme-grid" id="themeGrid">
            ${[
              ['grass','#7AC74C','#3F8F26'], ['fire','#EE8130','#B34D0B'], ['water','#6390F0','#2F62CE'],
              ['electric','#F7D02C','#C7A40A'], ['psychic','#F95587','#BC2154'], ['dark','#705746','#3E2E23'],
              ['steel','#B7B7CE','#7F8199'], ['fairy','#D685AD','#9E4479']
            ].map(([type,a,b])=>`
              <div class="theme-chip" data-type="${type}" style="--a:${a};--b:${b}">
                ${type.toUpperCase()}
              </div>`).join('')}
          </div>
          <div class="theme-preview" id="themePreview"></div>
          <div class="wiz-actions">
            <button class="btn" id="wizBack2">Zurück</button>
            <button class="btn ok" id="wizNext2">Weiter</button>
          </div>
          <div class="wiz-hint">Du kannst das Theme später im Einstellungen-Tab ändern.</div>
        </section>

        <!-- STEP 3: Lobby -->
        <section class="wiz-step" data-step="3">
          <div class="wiz-row"><b>Direkt einer Lobby beitreten? (optional)</b></div>
          <div class="wiz-row">
            <input id="wizCode" class="wiz-code" type="text" placeholder="ABC123" maxlength="8" />
          </div>
          <div class="wiz-actions">
            <button class="btn" id="wizBack3">Zurück</button>
            <button class="btn ok" id="wizStart">Start</button>
          </div>
          <div class="wiz-hint">Leer lassen ⇒ Solo. Mit Code ⇒ Multiplayer-Lobby.</div>
        </section>
      </div>
    `;
    card.appendChild(wiz);

    // Stardust + Parallax
    mountStars();
    attachParallax(card);

    // State
    let currentStep = 1;
    let chosenTheme = null;

    // Helpers
    const stepsDots = $$('.ball-step', wiz);
    const stepEls   = $$('.wiz-step', wiz);
    const avatar    = $('#wizAvatar', wiz);
    const inName    = $('#wizName', wiz);
    const inCode    = $('#wizCode', wiz);
    const themeGrid = $('#themeGrid', wiz);
    const themePrev = $('#themePreview', wiz);

    function setStep(n){
      currentStep = n;
      stepEls.forEach(s => s.classList.toggle('active', Number(s.dataset.step)===n));
      stepsDots.forEach((d,i)=> d.classList.toggle('on', i < n));
    }

    // Avatar = Initiale mit Spin
    function updateAvatar(){
      const v = (inName.value || '?').trim();
      avatar.textContent = v ? v[0].toUpperCase() : '?';
      avatar.classList.remove('spin');
      requestAnimationFrame(()=> avatar.classList.add('spin'));
    }
    inName.addEventListener('input', updateAvatar);
    updateAvatar();

 

    // Theme Auswahl
    themeGrid.addEventListener('click', (e)=>{
      const chip = e.target.closest('.theme-chip'); if (!chip) return;
      $$('.theme-chip', themeGrid).forEach(c=> c.classList.toggle('on', c===chip));
      chosenTheme = chip.dataset.type;
      // Previewfarben:
      const a = getComputedStyle(chip).getPropertyValue('--a').trim();
      const b = getComputedStyle(chip).getPropertyValue('--b').trim();
      
      
      
      themePrev.style.setProperty('--themeA', a);
      themePrev.style.setProperty('--themeB', b);

      localStorage.setItem('nuz_theme_type', chip.dataset.type);
      localStorage.setItem('nuz_theme_colors', JSON.stringify([a, b]));


      // Ring / Accent live setzen
      applyThemeToRoot(chosenTheme, a, b);
      //loadtheme();
      
    });
    //applyThemeToRoot(chosenTheme, a, b);
    // Inputs Verhalten
    inCode.addEventListener('input', ()=>{
      const c = inCode.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      inCode.value = c;
    });

    // Navigation
    $('#wizNext1', wiz).addEventListener('click', ()=>{
      const nm = inName.value.trim();
      if (!nm){ shake(inName); return; }
      setStep(2);
    });
    $('#wizBack2', wiz).addEventListener('click', ()=> setStep(1));
    $('#wizNext2', wiz).addEventListener('click', ()=> setStep(3));
    $('#wizBack3', wiz).addEventListener('click', ()=> setStep(2));

    // Start (ruft deinen bestehenden Start-Flow auf)
    $('#wizStart', wiz).addEventListener('click', async ()=>{
      const nm = inName.value.trim();
      if (!nm){ shake(inName); return; }

      // Trainername in dein echtes Feld spiegeln
      const realName = $('#trainerName') || nameInput;
      if (realName) realName.value = nm;

      // Startbutton visuelles Feedback
      const realStart = $('#startBtn') || startBtn;
      const cardNode = wiz.closest('.login-card');
      realStart?.classList.add('loading');
      cardNode?.classList.add('starting');
      showCountdown(realStart, 3);

      // Klick deinen echten Start-Handler an (setzt state.user.name etc.)
      realStart?.click?.();

      // Optional: Lobby beitreten
      const code = inCode.value.trim().toUpperCase();
    
      if (code){
        try{
          // global variablen füllen (dein Script nutzt die) + URL anpassen
          window.nzPlayerName = nm;
          //window.nzLobbyCode = code;
          localStorage.setItem('playerName', nm);
          //localStorage.setItem('lobbyCode', code);
          //history.replaceState(null,"",`?code=${code}`);
          //loadtheme();
          setTimeout(()=> window.quickjoin(code), 1500); // ⬅️ Namen ändern
        }catch(e){ console.warn('[LoginPlus] join failed:', e); }
      }

      setTimeout(()=> { realStart?.classList.remove('loading'); cardNode?.classList.remove('starting'); }, 1200);
      confettiBurst();
      window.introduction?.();
    });

    // Enter-Key auf Step1
    inName.addEventListener('keydown', e=>{ if(e.key==='Enter') $('#wizNext1',wiz).click(); });
    inCode.addEventListener('keydown', e=>{ if(e.key==='Enter') $('#wizStart',wiz).click(); });
  }

  // ---- Visual helpers ----
  function shake(el){
    el.animate(
      [{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],
      { duration: 240, easing:'cubic-bezier(.36,.07,.19,.97)' }
    );
  }



  function applyThemeToRoot(type, a, b){
    
    const root = document.documentElement;
    if (a && b){
      root.style.setProperty('--ring', a);
      root.style.setProperty('--ok', b);
    }
    // leichter globaler Akzent
    root.style.setProperty('--theme-type', type || '');
  
  }

  // Countdown bubble
  function showCountdown(btn, secs=3){
    if (!btn) return;
    const parent = btn.closest('.login-card') || document.body;
    let b = parent.querySelector('.count-bubble');
    if (!b){ b = document.createElement('div'); b.className = 'count-bubble'; parent.appendChild(b); }
    b.classList.add('show');
    const tick = (n)=>{
      b.textContent = `Start in ${n}…`;
      if (n<=0){ b.classList.remove('show'); setTimeout(()=> b.remove(), 300); return; }
      setTimeout(()=> tick(n-1), 430);
    };
    tick(secs);
  }

  // parallax on hero banner (::before)
  function attachParallax(card){
    if (RM || !card) return;
    const onMove = (e) => {
      const r = card.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const dx = (e.clientX - cx) / r.width;
      const dy = (e.clientY - cy) / r.height;
      card.style.setProperty('--px', `${dx * 12}px`);
      card.style.setProperty('--py', `${dy * 8}px`);
    };
    window.addEventListener('mousemove', onMove, { passive:true });
  }

  // stardust canvas
  function mountStars(){
    if (RM) return;
    if ($('#login-stars')) return;
    const c = document.createElement('canvas'); c.id = 'login-stars';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    let W=0,H=0, stars=[];
    const resize=()=>{
      W = c.width = innerWidth * devicePixelRatio;
      H = c.height = innerHeight * devicePixelRatio;
      stars = Array.from({length: 90}, () => ({
        x: Math.random()*W, y: Math.random()*H,
        r: (Math.random()*1.4+0.6) * devicePixelRatio,
        s: Math.random()*0.4 + 0.15,
        a: Math.random()*Math.PI*2
      }));
    };
    resize(); addEventListener('resize', resize);
    (function tick(){
      ctx.clearRect(0,0,W,H);
      for(const p of stars){
        p.y -= p.s; p.x += Math.cos(p.a)*0.1;
        if (p.y < -10) { p.y = H+10; p.x = Math.random()*W; }
        ctx.beginPath();
        const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
        g.addColorStop(0, 'rgba(255,255,255,.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    })();
  }

  // subtle confetti at start
  function confettiBurst(){
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:110;overflow:visible';
    document.body.appendChild(host);
    const colors = ['#ffd23f','#31d0aa','#ff6b6b','#7f8cff','#ff9f1a'];
    const N = RM ? 24 : 48;
    for (let i=0;i<N;i++){
      const e = document.createElement('i');
      e.style.cssText = 'position:absolute;width:8px;height:14px;border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,.28)';
      e.style.background = colors[i % colors.length];
      e.style.left = (innerWidth/2 + (Math.random()-0.5)*innerWidth*0.6) + 'px';
      e.style.top  = (innerHeight*0.35 + Math.random()*40) + 'px';
      host.appendChild(e);
      const tx = (Math.random()-0.5) * innerWidth * 0.4;
      const ty = innerHeight * (0.5 + Math.random()*0.3);
      const rot = (Math.random() * 720) * (Math.random()<.5?-1:1);
      const dur = (RM?700:1200) + Math.random()*600;
      e.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${tx}px,${ty}px) rotate(${rot}deg)`,opacity:.9}],{duration:dur,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'}).onfinish = ()=> e.remove();
    }
    setTimeout(()=> host.remove(), 1800);
  }
})();


// login_screens_addon.js – Zwei eigenständige Screens (Name & Theme) im Pokémon-Style.
// NUR Eingaben sammeln; nichts wird automatisch gesetzt.
// API: LoginScreens.openName() / LoginScreens.openTheme()

(function(){
  const $ = (s,r=document)=> r.querySelector(s);

  // ---------- Styles einmalig injizieren ----------
  function ensureStyle(){
    if (document.getElementById('ls-style')) return;
    const css = `
.ls-overlay{
  position:fixed; inset:0; z-index:9998; display:grid; place-items:center;
  background: radial-gradient(1200px 720px at 50% 0%,
              rgba(255,210,63,.10), rgba(0,0,0,.70) 55%, rgba(0,0,0,.88));
  animation: lsFade .18s ease;
}
@keyframes lsFade{ from{opacity:0} to{opacity:1} }

.ls-sheet{
  width:min(720px,92vw); max-height:86vh; overflow:auto;
  border-radius:18px; border:1px solid rgba(255,255,255,.14);
  background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
  box-shadow:0 28px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06) inset;
  transform:translateY(18px) scale(.98);
  animation: lsIn .24s cubic-bezier(.2,.7,.2,1) forwards;
  backdrop-filter: blur(8px) saturate(120%); color:#e8ecff;
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
@keyframes lsIn{ to{ transform:none } }

.ls-head{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:14px 16px; position:sticky; top:0; z-index:2;
  background:linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0));
  border-bottom:1px solid rgba(255,255,255,.08);
}
.ls-title{ display:flex; align-items:center; gap:10px; font-weight:900; letter-spacing:.3px }
.ls-ball{
  width:18px; height:18px; border-radius:50%;
  background: radial-gradient(circle at 50% 35%, #EE1515 0 36%, #fff 37% 64%, #111 65% 100%);
  box-shadow:0 0 0 1px #fff inset, 0 0 0 2px #EE1515 inset, 0 8px 16px rgba(0,0,0,.35);
  animation: lsBall 3s ease-in-out infinite;
}
@keyframes lsBall{ 50%{ transform:translateY(-2px) } }

.ls-body{ padding:16px; display:grid; gap:14px }
.ls-row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
.ls-actions{ display:flex; gap:10px; justify-content:flex-end; padding:12px 16px; border-top:1px solid rgba(255,255,255,.08) }

.ls-input{
  background:#0b1433; border:1px solid rgba(255,255,255,.18); border-radius:12px; color:#e8ecff;
  padding:10px 12px; min-width:240px; outline:none; box-shadow:inset 0 0 0 0 var(--ring,#ffd23f); transition:.2s;
}
.ls-input:focus{ box-shadow: inset 0 0 0 2px var(--ring,#ffd23f), 0 0 0 3px rgba(255,210,63,.08) }

.ls-btn{
  border:1px solid rgba(255,255,255,.22); background:#0e183b; color:#fff; padding:10px 14px; border-radius:12px;
  cursor:pointer; font-weight:800; letter-spacing:.2px; transition:.18s; position:relative; overflow:hidden;
  box-shadow:0 6px 20px rgba(0,0,0,.28);
}
.ls-btn:hover{ transform:translateY(-1px) }
.ls-btn.ok{ background:#0f3d33; border-color:#135e4e }
.ls-btn.ghost{ background:#0c1330 }
.ls-close{
  width:34px; height:34px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:#0d153a; color:#fff; cursor:pointer;
  box-shadow:0 6px 20px rgba(0,0,0,.28)
}
.ls-close:hover{ transform:translateY(-1px) }

.ls-badge{ padding:2px 8px; border-radius:999px; font-size:11px; font-weight:900;
  border:1px solid rgba(255,255,255,.18); background:#19203f; color:#c7d2ff }
.ls-help{ color:#9fb1ff; font-size:12px }

/* Theme Grid */
.ls-grid{ display:grid; grid-template-columns:repeat(4, minmax(120px,1fr)); gap:10px }
.ls-chip{
  border:1px solid rgba(255,255,255,.16); border-radius:12px; padding:12px; text-align:center; user-select:none;
  background:#0d1538; cursor:pointer; font-weight:900; letter-spacing:.2px; color:#e8ecff;
  box-shadow:0 8px 20px rgba(0,0,0,.35); transition:.18s ease;
}
.ls-chip:hover{ transform:translateY(-2px) }
.ls-chip.on{ box-shadow:0 0 0 2px var(--ring) inset, 0 10px 32px rgba(255,210,63,.1) }

.ls-preview{
  margin-top:6px; height:10px; border-radius:999px; overflow:hidden;
  background: linear-gradient(90deg, var(--themeA,#ffd23f), var(--themeB,#31d0aa));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
}
    `;
    const st = document.createElement('style');
    st.id = 'ls-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- Overlay Helper ----------
  function overlay(html){
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'ls-overlay';
    root.innerHTML = html;
    document.body.appendChild(root);
    const sheet = root.querySelector('.ls-sheet');

    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);

    // Fokus erstes Feld
    setTimeout(()=> sheet.querySelector('input,button,select')?.focus?.(), 0);

    let resolver;
    function close(result){
      document.removeEventListener('keydown', onKey);
      root.remove();
      resolver?.(result);
    }
    const promise = new Promise(r => resolver = r);
    return { sheet, close, promise };
  }

  // ---------- Paletten ----------
  const PALETTES = {
    grass:['#7AC74C','#3F8F26'], fire:['#EE8130','#B34D0B'], water:['#6390F0','#2F62CE'],
    electric:['#F7D02C','#C7A40A'], psychic:['#F95587','#BC2154'], dark:['#705746','#3E2E23'],
    steel:['#B7B7CE','#7F8199'], fairy:['#D685AD','#9E4479'], ice:['#96D9D6','#4BAAA6'],
    bug:['#A6B91A','#6F7E11'], rock:['#B6A136','#7A6524'], ghost:['#735797','#4B3A66'],
    dragon:['#6F35FC','#4223B2'], fighting:['#C22E28','#7E1713'], ground:['#E2BF65','#9B7D36'],
    flying:['#A98FF3','#6C57D5'], poison:['#A33EA1','#6B1E6A'], normal:['#A8A77A','#7C7B59']
  };

  // ---------- Screen: Name ----------
  function openName(){
    const initial = (window.state?.user?.name || window.nzPlayerName || '').trim();
    const { sheet, close, promise } = overlay(`
      <div class="ls-sheet">
        <div class="ls-head">
          <div class="ls-title"><span class="ls-ball"></span><span>Trainernamen ändern</span></div>
          <button class="ls-close" aria-label="Schließen">✕</button>
        </div>
        <div class="ls-body">
          <div class="ls-row">
            <span class="ls-badge">Trainer</span>
            <input id="lsName" class="ls-input" type="text" placeholder="Dein Trainername" value="${initial.replace(/"/g,'&quot;')}" autocomplete="off">
          </div>
          <div class="ls-help">Hier kannst du deinen Trainer Namen ändern... Vallah!!</div>
        </div>
        <div class="ls-actions">
          <button class="ls-btn ghost" id="lsCancel">Abbrechen</button>
          <button class="ls-btn ok" id="lsOk">Übernehmen</button>
        </div>
      </div>
    `);
    const input = sheet.querySelector('#lsName');
    const ok    = sheet.querySelector('#lsOk');
    sheet.querySelector('.ls-close').onclick = ()=> close(null);
    sheet.querySelector('#lsCancel').onclick = ()=> close(null);
    function validate(){ ok.disabled = input.value.trim().length === 0; }
    validate();
    input.addEventListener('input', validate);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !ok.disabled) ok.click(); });
    ok.onclick = ()=> {
      ControlAPI.renameAndRejoin(input.value.trim());
      PokeLoader.show('Changing name…');
      setTimeout(() => PokeLoader.setHint('Das kann einen Moment dauern.'), 2000);
      close(input.value.trim());
    };
   
    return promise; // -> string | null
  }

  setTimeout(loadtheme, 1); // lade Theme nach kurzer Verzögerung (nachdem Login offen ist)

function loadtheme(){
      // 2) Aus localStorage laden und sicher parsen
      const raw = localStorage.getItem('nuz_theme_colors');
      let colors = [];
      try { colors = JSON.parse(raw || '[]'); } catch {}
      const [hex1, hex2] = (Array.isArray(colors) && colors.length >= 2)
        ? colors
        : ['#705746', '#3E2E23']; // Fallback (oder nimm deine PALETTES.fire)
        document.documentElement.style.setProperty('--ring', hex1);
      document.documentElement.style.setProperty('--ok',   hex2);
  }

  // ---------- Screen: Theme ----------
  function openTheme(){
    const initialType = (localStorage.getItem('nuz_theme_type') || 'fire').toLowerCase();
    const chips = Object.keys(PALETTES).map(t=>{
      const [a,b] = PALETTES[t];
      const on = t===initialType ? 'on':'';
      return `<div class="ls-chip ${on}" data-type="${t}" style="--ring:${a};--ok:${b}">${t.toUpperCase()}</div>`;
    }).join('');
    const { sheet, close, promise } = overlay(`
      <div class="ls-sheet">
        <div class="ls-head">
          <div class="ls-title"><span class="ls-ball"></span><span>Theme wählen</span></div>
          <button class="ls-close" aria-label="Schließen">✕</button>
        </div>
        <div class="ls-body">
          <div class="ls-grid">${chips}</div>
          <div class="ls-preview" id="lsPrev"></div>
          <div class="ls-help">Rückgabe ist { type, colors } – Anwenden übernimmst du selbst.</div>
        </div>
        <div class="ls-actions">
          <button class="ls-btn ghost" id="lsCancel">Abbrechen</button>
          <button class="ls-btn ok" id="lsOk">Auswahl übernehmen</button>
        </div>
      </div>
    `);
    const prev = sheet.querySelector('#lsPrev');
    sheet.querySelector('.ls-close').onclick = ()=> close(null);
    sheet.querySelector('#lsCancel').onclick = ()=> close(null);

    let sel = initialType;
    function updatePrev(){
      const [a,b] = PALETTES[sel] || PALETTES.fire;
      prev.style.setProperty('--themeA', a);
      prev.style.setProperty('--themeB', b);
    }
    updatePrev();

    sheet.addEventListener('click', e=>{
      const chip = e.target.closest('.ls-chip'); if(!chip) return;
      sheet.querySelectorAll('.ls-chip').forEach(c=> c.classList.toggle('on', c===chip));
      sel = chip.dataset.type;
      updatePrev();
    });

    sheet.querySelector('#lsOk').onclick = () => {
      //alert('Das Theme wird übernommen, wenn du im Code auf "Übernehmen" klickst.');
      //window.AppActions.setTrainerName('77799', { rejoin:true });
       


      close({ type: sel, colors: PALETTES[sel] || PALETTES.fire });
       //pick = { type:'electric', colors:['#F7D02C','#C7A40A'] }
      // z.B. QuickActions.changeTheme(pick);
      // sel: der gewählte Key, z.B. 'electric'
const type   = sel;
const colors = PALETTES?.[sel] ?? PALETTES.fire; // Fallback auf 'fire'

const pick = { type, colors };
close(pick); // falls dein UI geschlossen werden soll

// persistent speichern
localStorage.setItem('nuz_theme_type', type);
localStorage.setItem('nuz_theme_colors', JSON.stringify(colors));
loadtheme();

    };
  }

  // --- STEP 3: Lobby-Join (separater Screen) ---
// API: const res = await LoginScreens.openJoin()
// -> res == null        => abgebrochen
// -> res = { action:'solo' }                       // kein Code eingegeben
// -> res = { action:'join',   code:'ABC123' }      // mit Code beitreten
// -> res = { action:'create', code:'NEW123' }      // neuen Code erzeugt
function openJoin(){
  const makeCode = (n=6)=>{
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:n}, () => A[Math.floor(Math.random()*A.length)]).join('');
  };

  const initialCode = (localStorage.getItem('lobbyCode') || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);

  const { sheet, close, promise } = overlay(`
    
    <div class="ls-sheet">
      <div class="ls-head">
        <div class="ls-title"><span class="ls-ball"></span><span>Lobby beitreten</span></div>
        <button class="ls-close" aria-label="Schließen">✕</button>
      </div>
      <div class="ls-body">
        <div class="ls-row">
          <span class="ls-badge">Optional</span>
          <input id="ljCodeLobby" class="ls-input" type="text" placeholder="ABC123" value="${initialCode}" maxlength="8" inputmode="latin" style="text-transform:uppercase">
          <button class="ls-btn" id="ljLink"   onclick="ljLink()" title="Aus Zwischenablage einfügen">Link kopieren</button>
          <button class="ls-btn" id="ljCode"   onclick="ljCode()" title="Neuen Code erzeugen">Code kopieren</button>
        </div>
        <div class="ls-help">Lässt du das Feld leer, startest du solo. Mit Code trittst du einer Lobby bei.</div>
      </div>
      <div class="ls-actions">
        <button class="ls-btn ghost" id="ljCancel">Abbrechen</button>
        <button class="ls-btn" style="display: none" id="ljSolo">Teilen</button>
        <button class="ls-btn ok" style="display:none" onclick="ljjoinlobby()" id="ljJoin">Lobby beitreten</button>
         <button class="ls-btn ok" onclick="ljjoinlobby()" id="ljJoin2">Lobby beitreten</button>
        <button class="ls-btn ok" onclick="ljCreateLobby()" id="ljCreate2">Lobby erstellen</button>
         <button class="ls-btn ok" style="display: none"  onclick="ljCreateLobby()" id="ljCreate">Lobby erstellen22</button>
      </div>
    </div>
  `);

  const input   = sheet.querySelector('#ljCode');
  const btnJoin = sheet.querySelector('#ljJoin');
  const btnSolo = sheet.querySelector('#ljSolo');
  const btnNew  = sheet.querySelector('#ljCreate');
  const btnPaste= sheet.querySelector('#ljPaste');

  sheet.querySelector('.ls-close').onclick  = ()=> close(null);
  sheet.querySelector('#ljCancel').onclick  = ()=> close(null);

  // Eingabe normalisieren
  function clamp(){
    const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if (v !== input.value) input.value = v;
    btnJoin.disabled = v.length === 0; // nur join mit Code
  }
  clamp();
  input.addEventListener('input', clamp);
  input.addEventListener('keydown', e=>{
    if (e.key === 'Enter') (input.value ? btnJoin : btnSolo).click();
  });



  // Code generieren
  btnNew.onclick = ()=>{
    input.value = makeCode(6);
    clamp();
  };

  // Aktionen
  btnSolo.onclick = ()=> close({ action:'solo' });
  btnJoin.onclick = ()=>{
    const code = input.value.trim();
    if (!code) return;
    close({ action:'join', code });
  };
  btnNew.insertAdjacentElement('afterend', btnJoin); // optisch nah beieinander
  sheet.querySelector('#ljCreate').onclick = ()=>{
    const code = input.value.trim() || makeCode(6);
    close({ action:'create', code });
  };
  
  return promise;
}

setTimeout(() => {
  const el = document.getElementById('wizCode');
  if (!el) return;
  el.value = window.lobbycodefromurl || '';
  el.dispatchEvent(new Event('input', { bubbles: true })); // falls dein UI auf input lauscht
}, 1500);




  // ---------- Export ---------- --> um die Funktion für andere nutzen zu können
  //window.LoginScreens = { openName, openTheme };
  window.LoginScreens = { openName, openTheme, openJoin };
  window.loadtheme = loadtheme;
})();



