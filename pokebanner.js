/* PokeBanner.js – Top Banner im Pokémon-Style (slide-in von rechts) */
(() => {
    const CSS = `
    :root{
      --pk-red:#EE1515; --pk-blue:#2554C7; --pk-yellow:#FFD23F; --pk-dark:#121625;
      --pk-bg:#0b1020; --card:#0e1633; --muted:#9fb1ff; --ring:#ffd23f;
      --ok:#31d0aa; --bad:#ff6b6b; --warn:#ffbf47;
    }
    #pkb-root{ position:fixed; inset:auto 12px 0 12px; top:12px; z-index:9999; pointer-events:none }
    #pkb-root .pkb-stack{ display:flex; flex-direction:column; gap:10px; align-items:flex-end }
  
    .pkb{
      --accent: var(--ring);
      width:min(760px, 92vw);
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
      border:1px solid rgba(255,255,255,.16);
      border-radius:14px;
      color:#e8ecff;
      box-shadow: 0 18px 60px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04) inset;
      backdrop-filter: blur(3px);
      display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center;
      padding:10px 12px; pointer-events:auto; overflow:hidden;
      transform: translateX(120%); opacity:.0;
      animation: pkbIn .28s cubic-bezier(.2,.7,.2,1) forwards;
      position:relative;
    }
    .pkb:hover{ box-shadow: 0 24px 70px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06) inset }
    .pkb::before{
      content:""; position:absolute; inset:-1px; border-radius:14px; pointer-events:none;
      background: radial-gradient(60% 45% at 90% 0%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%);
      opacity:.65;
    }
    .pkb .pkb-ball{
      width:34px; height:34px; border-radius:50%;
      background: radial-gradient(circle at 50% 35%, var(--pk-red) 0 35%, #fff 36% 65%, #111 66% 100%);
      box-shadow: 0 0 0 2px #fff inset, 0 0 0 4px var(--pk-red) inset, 0 8px 22px rgba(0,0,0,.35);
      position:relative; flex:0 0 auto;
    }
    .pkb .pkb-ball::after{ content:""; position:absolute; left:0; right:0; bottom:12px; height:6px; background:#fff }
    .pkb .pkb-body{ display:flex; flex-direction:column; gap:4px; min-width:0 }
    .pkb .pkb-title{ font-weight:900; letter-spacing:.2px; line-height:1.15 }
    .pkb .pkb-msg{ color:#cbd6ff; opacity:.95; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
    .pkb .pkb-actions{ display:flex; gap:8px; align-items:center }
    .pkb .pkb-btn{
      border:1px solid rgba(255,255,255,.22); background:#0e183b; color:#fff;
      padding:8px 10px; border-radius:10px; font-weight:800; letter-spacing:.2px; cursor:pointer;
      transition:.16s; box-shadow: 0 6px 18px rgba(0,0,0,.35);
    }
    .pkb .pkb-btn:hover{ transform:translateY(-1px) }
    .pkb .pkb-close{
      border:none; background:transparent; color:#e8ecff; opacity:.8; font-size:18px; cursor:pointer; padding:6px;
    }
    .pkb .pkb-close:hover{ opacity:1; transform:translateY(-1px) }
  
    .pkb .pkb-progress{
      position:absolute; left:0; right:0; bottom:0; height:3px; background:rgba(255,255,255,.12);
    }
    .pkb .pkb-progress > i{
      display:block; height:100%; width:0%;
      background: linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 40%, #fff));
      animation: pkbProg linear forwards;
    }
  
    /* Variants (accent & subtle bg) */
    .pkb.ok    { --accent: var(--ok) }
    .pkb.warn  { --accent: var(--warn) }
    .pkb.bad   { --accent: var(--bad) }
    .pkb.info  { --accent: var(--ring) }
  
    /* sheen sweep */
    .pkb::after{
      content:""; position:absolute; inset:-40% -80%; pointer-events:none; border-radius:24px;
      background: linear-gradient(75deg, transparent 40%, rgba(255,255,255,.18) 50%, transparent 60%);
      transform: translateX(-60%) rotate(10deg);
      opacity:0; animation: pkbSheen 2.2s ease 0.25s both;
    }
  
    @keyframes pkbIn{
      from{ transform:translateX(120%); opacity:0 }
      to  { transform:translateX(0);    opacity:1 }
    }
    @keyframes pkbOut{
      from{ transform:translateX(0);    opacity:1 }
      to  { transform:translateX(120%); opacity:0 }
    }
    @keyframes pkbProg{ from{ width:0% } to{ width:100% } }
    @keyframes pkbSheen{
      0%{ opacity:0; transform: translateX(-60%) rotate(10deg) }
      12%{ opacity:.75 }
      60%{ opacity:.75; transform: translateX(60%) rotate(10deg) }
      100%{ opacity:0; transform: translateX(60%) rotate(10deg) }
    }
    `;
  
    // inject CSS once
    function ensureStyle() {
      if (document.getElementById('pkb-style')) return;
      const st = document.createElement('style');
      st.id = 'pkb-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
  
    // ensure root
    function ensureRoot() {
      let root = document.getElementById('pkb-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'pkb-root';
        root.innerHTML = `<div class="pkb-stack" aria-live="polite" aria-atomic="true"></div>`;
        document.body.appendChild(root);
      }
      return root.querySelector('.pkb-stack');
    }
  
    function createBanner(opts = {}) {
      const {
        title = 'Hinweis',
        message = '',
        variant = 'info',       // 'info' | 'ok' | 'warn' | 'bad'
        duration = 3500,        // ms; 0 = sticky
        actionText = '',        // optional Button
        onAction = null,
        onClose = null
      } = opts;
  
      ensureStyle();
      const stack = ensureRoot();
  
      const el = document.createElement('div');
      el.className = `pkb ${variant}`;
      el.setAttribute('role','status');
      el.innerHTML = `
        <div class="pkb-ball" aria-hidden="true"></div>
        <div class="pkb-body">
          <div class="pkb-title">${title}</div>
          <div class="pkb-msg">${message}</div>
        </div>
        <div class="pkb-actions">
          ${actionText ? `<button class="pkb-btn" data-action>${actionText}</button>` : ''}
          <button class="pkb-close" aria-label="schließen">✕</button>
        </div>
        <div class="pkb-progress" ${duration>0?'':'hidden'}><i style="animation-duration:${duration}ms"></i></div>
      `;
  
      // close logic
      let closed = false;
      const doClose = () => {
        if (closed) return;
        closed = true;
        el.style.animation = 'pkbOut .22s cubic-bezier(.2,.7,.2,1) forwards';
        setTimeout(() => {
          el.remove();
          onClose && onClose();
        }, 220);
      };
  
      el.querySelector('.pkb-close').addEventListener('click', doClose);
      if (actionText && typeof onAction === 'function') {
        el.querySelector('[data-action]').addEventListener('click', () => onAction(doClose));
      }
  
      // auto dismiss
      if (duration > 0) {
        const t = setTimeout(doClose, duration + 30);
        // pause on hover
        let remaining = duration, start = Date.now();
        const prog = el.querySelector('.pkb-progress i');
        el.addEventListener('mouseenter', () => {
          clearTimeout(t);
          const elapsed = Date.now() - start;
          remaining = Math.max(0, duration - elapsed);
          if (prog) prog.style.animationPlayState = 'paused';
        });
        el.addEventListener('mouseleave', () => {
          start = Date.now();
          if (prog) prog.style.animation = `pkbProg linear forwards`;
          if (prog) prog.style.animationDuration = `${remaining}ms`;
          setTimeout(doClose, remaining + 30);
        });
      }
  
      stack.appendChild(el);
      return doClose;
    }
  
    // Public API
    window.PokeBanner = {
      /**
       * Zeigt eine Banner-Nachricht oben rechts, die von rechts nach links einfährt.
       * @param {string|object} titleOrOptions - Titel oder Options-Objekt
       * @param {string} [message] - Nachricht (wenn erster Parameter ein String ist)
       * @param {object} [opts] - Optionen (variant, duration, actionText, onAction, onClose)
       * @returns {function} close() - Schließt den Banner programmatisch
       */
      show(titleOrOptions, message, opts = {}) {
        if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
          return createBanner(titleOrOptions);
        }
        return createBanner({ title: String(titleOrOptions||'Hinweis'), message: String(message||''), ...opts });
      },
      info(msg, opts={}) { return createBanner({ title:'Info', message:msg, variant:'info', ...opts }); },
      ok(msg, opts={})   { return createBanner({ title:'Erfolg', message:msg, variant:'ok', ...opts }); },
      warn(msg, opts={}) { return createBanner({ title:'Achtung', message:msg, variant:'warn', ...opts }); },
      bad(msg, opts={})  { return createBanner({ title:'Fehler', message:msg, variant:'bad', ...opts }); }
    };
  })();

  /*User Guide:
// simple
PokeBanner.show('Willkommen, Trainer!', 'Dein Abenteuer beginnt jetzt.');

// Varianten
PokeBanner.ok('Gespeichert!');
PokeBanner.warn('Achtung: Permadeath aktiv.');
PokeBanner.bad('Verbindung verloren.', { duration: 0 }); // sticky

// Mit Action-Button
PokeBanner.show({
  title: 'Lobby bereit',
  message: 'Code: ABC123 – Team wählen?',
  variant: 'info',
  actionText: 'Zum Team',
  onAction: (close)=>{ setActiveTab?.('team'); close(); },
  duration: 6000
});
*/