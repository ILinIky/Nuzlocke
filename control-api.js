// control_api.js
// Kleine Steuer-API für Theme/Name/Lobby. Nach nuz.js einbinden.
(function(){
    const $ = (s,r=document)=> r.querySelector(s);
    const fireAndForget = fn => (...a)=> { try{ fn(...a) }catch(e){ console.warn(e) } };
  
    // ---- Theme Paletten (Type → [--ring, --ok]) ----
    const TYPE_PALETTES = {
      grass:['#7AC74C','#3F8F26'],
      fire:['#EE8130','#B34D0B'],
      water:['#6390F0','#2F62CE'],
      electric:['#F7D02C','#C7A40A'],
      ice:['#96D9D6','#4BAAA6'],
      fighting:['#C22E28','#7E1713'],
      poison:['#A33EA1','#6B1E6A'],
      ground:['#E2BF65','#9B7D36'],
      flying:['#A98FF3','#6C57D5'],
      psychic:['#F95587','#BC2154'],
      bug:['#A6B91A','#6F7E11'],
      rock:['#B6A136','#7A6524'],
      ghost:['#735797','#4B3A66'],
      dragon:['#6F35FC','#4223B2'],
      dark:['#705746','#3E2E23'],
      steel:['#B7B7CE','#7F8199'],
      fairy:['#D685AD','#9E4479']
    };
  
    const THEME_KEY_TYPE   = 'nuz_theme_type';
    const THEME_KEY_COLORS = 'nuz_theme_colors';
  
    function applyThemeToRoot(a, b){
      const root = document.documentElement;
      if (a) root.style.setProperty('--ring', a);
      if (b) root.style.setProperty('--ok',  b);
      // leichte Secondary-Akzente (optional, sicher)
      // root.style.setProperty('--pk-yellow', a);
    }
  
    function readSavedTheme(){
      try{
        const type = localStorage.getItem(THEME_KEY_TYPE) || '';
        const colors = JSON.parse(localStorage.getItem(THEME_KEY_COLORS) || '[]');
        return { type, colors: Array.isArray(colors) ? colors : [] };
      }catch{ return { type:'', colors:[] }; }
    }
  
    function persistTheme(type, colors){
      localStorage.setItem(THEME_KEY_TYPE, String(type||''));
      localStorage.setItem(THEME_KEY_COLORS, JSON.stringify(colors||[]));
    }
  
    function updateThemeUI(type, colors){
      // falls Theme-Chips existieren, markieren
      const chips = document.querySelectorAll('.theme-chip[data-type]');
      chips.forEach(c => c.classList.toggle('on', c.dataset.type === type));
      // Preview-Bar
      const prev = document.querySelector('#themePreview');
      if (prev && colors?.length>=2){
        prev.style.setProperty('--themeA', colors[0]);
        prev.style.setProperty('--themeB', colors[1]);
      }
    }
  
    // Public: Theme setzen
    function setTheme(typeOrColors){
      let type = '';
      let colors = null;
  
      if (typeof typeOrColors === 'string'){
        type = typeOrColors.toLowerCase().trim();
        colors = TYPE_PALETTES[type] || null;
      } else if (Array.isArray(typeOrColors) && typeOrColors.length>=2){
        colors = [typeOrColors[0], typeOrColors[1]];
      } else if (typeOrColors && typeof typeOrColors === 'object'){
        const { a, b, type: t } = typeOrColors;
        type = (t||'').toLowerCase();
        if (a && b) colors = [a,b];
        else if (TYPE_PALETTES[type]) colors = TYPE_PALETTES[type];
      }
  
      if (!colors){
        console.warn('[Theme] Unbekannt, fallback fire');
        type = 'fire'; colors = TYPE_PALETTES.fire;
      }
  
      applyThemeToRoot(colors[0], colors[1]);
      updateThemeUI(type, colors);
      persistTheme(type, colors);
  
      document.dispatchEvent(new CustomEvent('nz:theme', { detail:{ type, colors } }));
      return { type, colors };
    }
  
    function getTheme(){
      const saved = readSavedTheme();
      const colors = saved.colors?.length ? saved.colors
                    : (TYPE_PALETTES[saved.type] || TYPE_PALETTES.fire);
      return { type: saved.type || 'fire', colors };
    }
  
    // ---- Name ändern ----
    async function setTrainerName(name, opts = {}){
      const nm = String(name||'').trim();
      if (!nm) throw new Error('Name darf nicht leer sein');
  
      // Local app state
      try {
        if (window.state){
          state.user = state.user || {};
          state.user.name = nm;
          window.save?.();
        }
      } catch(e){ console.warn('[Name] state update failed:', e); }
  
      // Globals & storage
      window.nzPlayerName = nm;
      localStorage.setItem('playerName', nm);
  
      // UI spiegeln
      const tn = document.querySelector('#trainerName');
      if (tn) tn.value = nm;
      const nzNameEl = document.querySelector('#nzName');
      if (nzNameEl) nzNameEl.value = nm;
      const badge = document.querySelector('#playerNameBadge');
      if (badge) badge.textContent = nm;
  
      // Re-render helpers
      window.ensureLogin?.();
      window.renderLocalLobbyBadge?.();
  
      document.dispatchEvent(new CustomEvent('nz:player-name-changed', { detail:{ name:nm } }));
  
      if (opts.rejoin) {
        await rejoinLobby();
      }
      return nm;
    }
  
    // ---- Lobby: join / rejoin / leave ----
    async function joinLobby(code, opts = {}){
      const clean = String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      if (!clean) throw new Error('Bitte gültigen Lobby-Code angeben');
  
      const name = String(opts.name || (state?.user?.name) || localStorage.getItem('playerName') || 'Spieler').trim();
  
      window.nzLobbyCode = clean;
      window.nzPlayerName = name;
  
      localStorage.setItem('lobbyCode', clean);
      localStorage.setItem('playerName', name);
  
      // UI spiegeln
      const codeEl = document.querySelector('#nzCode'); if (codeEl) codeEl.value = clean;
      const nameEl = document.querySelector('#nzName'); if (nameEl) nameEl.value = name;
      history.replaceState(null, '', `?code=${clean}`);
  
      // Server handshake
      if (window.NZ?.ensureJoined){
        await window.NZ.ensureJoined();
        try {
          // Wenn wir bereits eine Player-ID haben: rejoin; sonst join über ensureJoined passiert bereits
          if (window.nzPlayerId) {
            await nzApiSafe('rejoinLobby', { playerId: nzPlayerId, name: nzPlayerName, code: nzLobbyCode });
          }
        } catch(_) {}
        // Routen vom Server neu setzen (optional)
        if (opts.wipeRoutes !== false) {
          await window.wipeRoutesAndReloadFromServer?.();
        }
        await window.NZ.syncNow?.();
      } else {
        // Fallback: UI-Button klicken
        document.querySelector('#nzJoin')?.click?.();
      }
  
      document.dispatchEvent(new CustomEvent('nz:lobby-changed', { detail:{ code:clean, name } }));
      return { code: clean, name };
    }
  
    async function rejoinLobby(){
      const code = 'ARSCHWASSER';
      const name = window.nzPlayerName || state?.user?.name || 'Spieler';
      if (!code) throw new Error('Kein Lobby-Code vorhanden');
  
      if (window.NZ?.ensureJoined){
        await window.NZ.ensureJoined();
        try {
          if (window.nzPlayerId) {
            await nzApiSafe('rejoinLobby', { playerId: nzPlayerId, name, code });
          } else {
            await nzApiSafe('joinLobby', { name, code });
          }
        } catch(e){ console.warn('[Lobby] rejoin failed:', e); }
        await window.NZ.syncNow?.();
      } else {
        document.querySelector('#nzJoin')?.click?.();
      }
      document.dispatchEvent(new CustomEvent('nz:lobby-changed', { detail:{ code, name } }));
      return { code, name };
    }
  
    async function leaveLobby({ keepName = true } = {}){
      // Optional: Server informieren, wenn es eine Action gibt (best-effort)
      try { await nzApiSafe('leaveLobby', { playerId: nzPlayerId, code: nzLobbyCode }); } catch(_){}
  
      // Lokal aufräumen
      window.nzLobbyCode = '';
      if (!keepName) window.nzPlayerName = '';
      localStorage.removeItem('lobbyCode');
  
      // UI updaten
      const codeEl = document.querySelector('#nzCode'); if (codeEl) codeEl.value = '';
      document.dispatchEvent(new CustomEvent('nz:lobby-changed', { detail:{ code:'', name: nzPlayerName||'' } }));
  
      await window.NZ?.syncNow?.();
      return true;
    }
  
    // ---- Safe API wrapper ----
    async function nzApiSafe(action, payload){
      if (typeof window.nzApi !== 'function') throw new Error('nzApi nicht verfügbar');
      try { return await window.nzApi(action, payload); }
      catch(e){ console.warn(`[nzApi ${action}]`, e); throw e; }
    }
  
    // ---- Auto-apply gespeichertes Theme beim Laden ----
    (function initThemeOnce(){
      const saved = readSavedTheme();
      const colors = saved.colors?.length ? saved.colors : (TYPE_PALETTES[saved.type] || TYPE_PALETTES.fire);
      applyThemeToRoot(colors[0], colors[1]);
      updateThemeUI(saved.type || 'fire', colors);
    })();
  
    // ---- Export ----
    window.AppActions = {
      // Theme
      setTheme, getTheme,
      // Name
      setTrainerName,
      // Lobby
      joinLobby, rejoinLobby, leaveLobby
    };
  
    // ---- Mini-Demos (optional auskommentieren) ----
    // window.AppActions.setTheme('electric');
    // window.AppActions.setTrainerName('Ash', { rejoin:true });
    // window.AppActions.joinLobby('ABC123', { name:'Misty' });
  
  })();
  