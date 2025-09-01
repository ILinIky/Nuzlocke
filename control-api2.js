// control-api2.js – Compact Control API (join/rejoin/name/theme helpers)
(function(){
    'use strict';
    const g = window;
  
    /* ---------- helpers ---------- */
    const $  = sel => document.querySelector(sel);
    const esc = s => String(s ?? '');
    const sanitizeCode = c => String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    const endpoint = g.NZ_API || '/api/nuzlocke';
  
    function dispatch(name, detail){
      try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }
  
    function ensureIdentityFromLocal(){
      if (!g.nzPlayerId)   g.nzPlayerId   = localStorage.getItem('playerId')   || '';
      if (!g.nzPlayerName) g.nzPlayerName = localStorage.getItem('playerName') || (g.state?.user?.name || '');
      if (!g.nzLobbyCode)  g.nzLobbyCode  = localStorage.getItem('lobbyCode')  || '';
    }
  
    function getNameFromUi(){
      const nm = ($('#nzName')?.value || $('#trainerName')?.value || g.nzPlayerName || g.state?.user?.name || 'Spieler').trim();
      return nm || 'Spieler';
    }
  
    // GENAU wie vom User gewünscht:
    function readLobbyCodeRaw(){
      let lobbyCodenz = document.getElementById('nzCode');
      lobbyCodenz = lobbyCodenz?.value || '';
      g.nzLobbyCode = lobbyCodenz; // <-- exakt deine beiden Zeilen
      return lobbyCodenz;
    }
  
    function persistLobbyCode(code){
      const cd = sanitizeCode(code);
      g.nzLobbyCode = cd;
      try { localStorage.setItem('lobbyCode', cd); } catch {}
      try { history.replaceState(null,'', cd ? `?code=${cd}` : '?'); } catch {}
      return cd;
    }
  
    // nutzt vorhandenes window.nzApi, fällt sonst auf fetch zurück
    async function callNZ(action, payload = {}){
      if (typeof g.nzApi === 'function') return g.nzApi(action, payload);
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ action, ...payload }),
        cache: 'no-store'
      });
      const t = await r.text();
      let j; try { j = JSON.parse(t) } catch { j = { error:t } }
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    }
  
    let busy = false;
    async function guard(fn){
      if (busy) return;
      busy = true;
      try { return await fn(); }
      finally { busy = false; }
    }
  
    async function afterJoinRefresh(){
      if (typeof g.wipeRoutesAndReloadFromServer === 'function') {
        try { await g.wipeRoutesAndReloadFromServer(); } catch(e){ console.warn('[ControlAPI] wipe failed', e); }
      }
      if (typeof g.nzSync === 'function') {
        try { await g.nzSync(); } catch(e){ console.warn('[ControlAPI] sync failed', e); }
      }
    }
  
    /* ---------- core ops ---------- */
  
    async function joinOrRejoin({ fromUi=true } = {}){
      return guard(async ()=>{
        ensureIdentityFromLocal();
  
        // Code holen
        const raw  = fromUi ? readLobbyCodeRaw() : (g.nzLobbyCode || '');
        const code = persistLobbyCode(raw);
  
        // Name holen/speichern
        const name = getNameFromUi();
        g.nzPlayerName = name;
        try { localStorage.setItem('playerName', name); } catch {}
  
        // join vs rejoin
        if (g.nzPlayerId) {
          await callNZ('rejoinLobby', { playerId: g.nzPlayerId, name, code });
        } else {
          const j = await callNZ('joinLobby', { name, code });
          g.nzPlayerId = j?.player?.id || '';
          try { localStorage.setItem('playerId', g.nzPlayerId); } catch {}
          if (j?.code) persistLobbyCode(j.code);
        }
  
        await afterJoinRefresh();
        dispatch('control:joined', { playerId:g.nzPlayerId, name:g.nzPlayerName, code:g.nzLobbyCode });
      });
    }
  
    async function renameAndRejoin(newName, { fromUiCode=true } = {}){
      return guard(async ()=>{
        ensureIdentityFromLocal();
        // Name anwenden
        const name = esc(newName||'').trim() || getNameFromUi();
        g.nzPlayerName = name;
        try {
          localStorage.setItem('playerName', name);
          if (g.state?.user) { g.state.user.name = name; if (typeof g.save === 'function') g.save(); }
        } catch {}
  
        // Code aus UI (exakt wie gewünscht) oder bestehenden nutzen
        const raw  = fromUiCode ? readLobbyCodeRaw() : (g.nzLobbyCode || '');
        const code = persistLobbyCode(raw);
  
        if (g.nzPlayerId) {
          await callNZ('rejoinLobby', { playerId: g.nzPlayerId, name, code });
        } else {
          const j = await callNZ('joinLobby', { name, code });
          g.nzPlayerId = j?.player?.id || '';
          try { localStorage.setItem('playerId', g.nzPlayerId); } catch {}
          if (j?.code) persistLobbyCode(j.code);
        }
  
        await afterJoinRefresh();
        dispatch('control:renamed', { playerId:g.nzPlayerId, name, code });
        PokeLoader.hide();
        setTimeout(() =>   PokeBanner.ok('Name erfolgreich geändert!'), 700);
      });
    }
  
    function changeNameOnly(newName){
      const name = esc(newName||'').trim() || 'Spieler';
      g.nzPlayerName = name;
      try {
        localStorage.setItem('playerName', name);
        if (g.state?.user) { g.state.user.name = name; if (typeof g.save === 'function') g.save(); }
      } catch {}
      dispatch('control:name-changed', { name });
      return name;
    }
  
    function setLobbyCodeFromInputStrict(){
      const raw = readLobbyCodeRaw();     // ← setzt window.nzLobbyCode (raw)
      const cd  = persistLobbyCode(raw);  // ← normalisiert + speichert + URL
      dispatch('control:code-set', { raw, code: cd });
      return cd;
    }
  
    async function joinWithCode(code, name){
      return guard(async ()=>{
        ensureIdentityFromLocal();
        const cd = persistLobbyCode(code);
        const nm = esc(name || g.nzPlayerName || getNameFromUi() || 'Spieler').trim();
        g.nzPlayerName = nm;
        try { localStorage.setItem('playerName', nm); } catch {}
  
        if (g.nzPlayerId) {
          await callNZ('rejoinLobby', { playerId: g.nzPlayerId, name: nm, code: cd });
        } else {
          const j = await callNZ('joinLobby', { name: nm, code: cd });
          g.nzPlayerId = j?.player?.id || '';
          try { localStorage.setItem('playerId', g.nzPlayerId); } catch {}
          if (j?.code) persistLobbyCode(j.code);
        }
  
        await afterJoinRefresh();
        dispatch('control:joined', { playerId:g.nzPlayerId, name:nm, code:g.nzLobbyCode });
      });
    }
  
    async function ensureJoined(){
      ensureIdentityFromLocal();
      if (g.nzPlayerId && g.nzLobbyCode) {
        try { await callNZ('rejoinLobby', { playerId:g.nzPlayerId, name:(g.nzPlayerName||'Spieler'), code:g.nzLobbyCode }); }
        catch(_){}
        return { playerId:g.nzPlayerId, name:g.nzPlayerName, code:g.nzLobbyCode };
      }
      // Fehlt etwas → versuche UI/Local zu verwenden
      const raw = g.nzLobbyCode || readLobbyCodeRaw();
      const cd  = persistLobbyCode(raw);
      const nm  = getNameFromUi();
      if (!g.nzPlayerId) {
        const j = await callNZ('joinLobby', { name:nm, code:cd });
        g.nzPlayerId = j?.player?.id || '';
        try { localStorage.setItem('playerId', g.nzPlayerId); } catch {}
        if (j?.code) persistLobbyCode(j.code);
      } else {
        await callNZ('rejoinLobby', { playerId:g.nzPlayerId, name:nm, code:cd });
      }
      await afterJoinRefresh();
      return { playerId:g.nzPlayerId, name:nm, code:g.nzLobbyCode };
    }
  
    function getState(){
      ensureIdentityFromLocal();
      return { playerId:g.nzPlayerId, playerName:g.nzPlayerName, lobbyCode:g.nzLobbyCode, endpoint };
    }
  
    /* ---------- public API ---------- */
    const API = {
      // Identity/State
      getState,
      ensureJoined,
  
      // Name
      changeNameOnly,
      renameAndRejoin,
  
      // Code
      setLobbyCodeFromInputStrict,
      joinWithCode,
      joinOrRejoin
    };
  
    // export + ready event
    g.ControlAPI = API;
    dispatch('control:ready', { endpoint });
  })();
  