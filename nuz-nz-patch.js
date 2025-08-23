/* ======================== NZ Multiplayer Robust Patch ========================
Drop-in patch for your existing nuz.js.
Use it EITHER by:
1) Including this file AFTER your current nuz.js:
   <script src="nuz.js"></script>
   <script src="nuz-nz-patch.js"></script>
OR
2) Replacing the "Multiplayer" block in nuz.js with the code below.

It fixes:
- 500 duplicate key on assignRouteSlot (treated as success/idempotent)
- 400 Bad Request from missing/invalid payload (auto ensureJoined + slot clamp)
- Over-posting: per-route in-flight guard + cache-based no-op when unchanged
- Reliable "All Teams" sync after every change

Backend assumptions (as in your repo):
- POST /api/nuzlocke with JSON { action, ... }
- Actions: joinLobby, rejoinLobby, heartbeat, list, upsertPokemon, assignRouteSlot, clearRouteSlot
============================================================================= */

(function(){
  const NZ_API = "/api/nuzlocke"; // adjust if needed
  const NZ_HEARTBEAT_MS = 15000;
  const NZ_POLL_MS = 4000;

  let nzPlayerId = localStorage.getItem("playerId") || "";
  let nzPlayerName = localStorage.getItem("playerName") || "";
  let nzLobbyCode = (new URL(location.href)).searchParams.get("code") || localStorage.getItem("lobbyCode") || "";

  const elLobbyPane = document.querySelector("#nz-lobby");
  const elAllTeams  = document.querySelector("#nz-allteams");

  // Cache and dedup
  let nzLastRouteSlots = new Map();            // route -> slot (last seen from server)
  const inflightByRoute = new Map();           // route -> Promise (in-flight assign/clear)

  // --- API helpers ---
  async function nzApi(action, payload = {}) {
    const r = await fetch(NZ_API, {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store"
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t) } catch { j = { error: t } }
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  async function nzListState(code) {
    const r = await fetch(NZ_API, {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ action:"list", code: (code||"").toUpperCase() }),
      cache: "no-store"
    });
    if (r.ok) return r.json();
    throw new Error(`HTTP ${r.status} ${await r.text()}`);
  }

  // --- Rendering helpers (keeps your existing DOM structure) ---
  function nzRenderLobby(st){
    if (!elLobbyPane) return;
    const players = (st.players||[]);
    const online = players.filter(p=>p.online).length;
    elLobbyPane.innerHTML = `
      <div class="row">
        <div class="badge">Lobby</div>
        <div class="code">${st.code || (nzLobbyCode||"")}</div>
        <div class="badge">Spieler online</div>
        <div class="count">${online}/${players.length}</div>
      </div>
      <div class="sep"></div>
      <div class="players">
        ${players.map(p => `<div class="player${p.id===nzPlayerId?' me':''}">${p.name}${p.online?' •':''}</div>`).join("")}
      </div>
    `;
  }
  function nzRenderAllTeams(st){
    if (!elAllTeams) return;
    const r2s = new Map((st.routeSlots||[]).map(x => [x.route, x.slot]));
    const byPlayer = new Map(); // playerId -> {name, slots: Map(slot->species)}

    for (const row of (st.teams||[])) {
      const key = row.playerId;
      if (!byPlayer.has(key)) byPlayer.set(key, { name: row.playerName || "Spieler", slots: new Map() });
      const rec = byPlayer.get(key);
      const s = Number(row.slot);
      if (s>=1 && s<=6) rec.slots.set(s, row.species || row.route || "");
    }

    const htmlPlayers = Array.from(byPlayer.entries()).map(([pid, rec]) => {
      const cells = [];
      for (let s=1;s<=6;s++){
        const label = rec.slots.get(s) || "–";
        cells.push(`<div class="slot"><div class="idx">#${s}</div><div class="lbl">${label}</div></div>`);
      }
      return `<div class="player-row"><div class="player-name">${rec.name}</div><div class="team-row">${cells.join("")}</div></div>`;
    }).join("");

    elAllTeams.innerHTML = `${htmlPlayers || "noch keine Spieler"}`;

    // update cache (used for idempotency checks)
    nzLastRouteSlots = r2s;
  }

  // --- Global → Local mirror (respects the app's race guard if present) ---
  function nzApplyGlobalToLocal(st){
    try {
      if (window.nzLocalHoldUntil && Date.now() < window.nzLocalHoldUntil) return;
      if (!window.state || !Array.isArray(window.state.team) || !Array.isArray(window.state.box)) return;
      const r2s = new Map((st.routeSlots||[]).map(x => [x.route, x.slot]));
      const uidByRoute = new Map(window.state.box.map(m => [m.routeName, m.uid]));
      const newTeam = [null,null,null,null,null,null];
      for (const [route, slot] of r2s.entries()) {
        if (slot >= 1 && slot <= 6) newTeam[slot-1] = uidByRoute.get(route) || null;
      }
      window.state.box.forEach(m => { m.isInTeam = false; });
      newTeam.forEach(uid => {
        const mon = window.state.box.find(m => m.uid === uid);
        if (mon) mon.isInTeam = true;
      });
      const changed = newTeam.some((v, i) => v !== window.state.team[i]);
      if (changed) {
        window.state.team = newTeam;
        if (window.save) window.save();
        if (window.renderTeam) window.renderTeam();
        if (window.renderRouteGroups) window.renderRouteGroups();
        if (window.renderBox) window.renderBox();
        if (window.renderBoxDrawer) window.renderBoxDrawer();
      }
    } catch {}
  }

  // --- Heartbeat & Sync ---
  async function nzHeartbeat(){
    if (nzPlayerId && nzLobbyCode) {
      try { await nzApi("heartbeat", { playerId: nzPlayerId, code: nzLobbyCode }); } catch{}
    }
  }
  async function nzSync(){
    if (!nzLobbyCode) { nzRenderLobby({ code:"", players:[] }); return; }
    try {
      const st = await nzListState(nzLobbyCode);
      nzRenderLobby(st);
      nzRenderAllTeams(st);
      nzApplyGlobalToLocal(st);
    } catch(e) { console.error("[NZ] sync failed:", e); }
  }

  setInterval(nzHeartbeat, NZ_HEARTBEAT_MS);
  setInterval(nzSync, NZ_POLL_MS);

  // --- Public API ---
  window.NZ = {
    async ensureJoined(){
      if (!nzLobbyCode) {
        const urlCode = (new URL(location.href)).searchParams.get("code");
        if (urlCode) { nzLobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", nzLobbyCode); }
      }
      if (!nzPlayerId) {
        const nm = (window.state?.user?.name || nzPlayerName || prompt("Dein Name?") || "Spieler").trim();
        nzPlayerName = nm;
        localStorage.setItem("playerName", nm);
        const j = await nzApi("joinLobby", { name: nm, code: nzLobbyCode || "" });
        nzPlayerId = j.player.id;
        nzLobbyCode = j.code || nzLobbyCode || "";
        localStorage.setItem("playerId", nzPlayerId);
        if (nzLobbyCode) {
          localStorage.setItem("lobbyCode", nzLobbyCode);
          try { history.replaceState(null, '', `?code=${nzLobbyCode}`); } catch {}
        }
        return;
      }
      if (nzLobbyCode) {
        try { await nzApi("rejoinLobby", { playerId: nzPlayerId, name: (nzPlayerName || window.state?.user?.name || "Spieler"), code: nzLobbyCode }); } catch{}
      }
    },

    async upsertPokemon(route, species, caught=true){
      await this.ensureJoined();
      try {
        await nzApi('upsertPokemon', { code: nzLobbyCode, playerId: nzPlayerId, route, species, caught });
      } catch (e) {
        console.warn("[NZ] upsertPokemon failed:", e.message);
      }
    },

    // NEW: stable setter with idempotency + dedup + conflict tolerance
    async setRouteSlot(route, slot){
      await this.ensureJoined();
      slot = Math.max(1, Math.min(6, Number(slot)||0));
      if (!route || !slot) return;

      // No-op if cache says it's already the same
      if (nzLastRouteSlots.get(route) === slot) return;

      // Dedup: if there's an in-flight request for this route, await it then re-check
      if (inflightByRoute.has(route)) {
        try { await inflightByRoute.get(route); } catch {}
        if (nzLastRouteSlots.get(route) === slot) return;
      }

      const p = (async () => {
        try {
          const res = await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot });
          // Assume server accepted. Update local cache; trigger a fast sync.
          nzLastRouteSlots.set(route, slot);
          try { await this.syncNow(); } catch {}
        } catch (e) {
          const msg = (e && e.message) ? e.message : String(e||"");
          // Treat duplicate key as success (server already has the row)
          if (/duplicate key|route_slots.*pkey/i.test(msg)) {
            nzLastRouteSlots.set(route, slot);
            try { await this.syncNow(); } catch {}
            return;
          }
          // If 400 due to missing context, try rejoin and retry once
          if (/HTTP 400/i.test(msg)) {
            try {
              await this.ensureJoined();
              const res = await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot });
              nzLastRouteSlots.set(route, slot);
              try { await this.syncNow(); } catch {}
              return;
            } catch (e2) {
              console.error("[NZ] setRouteSlot retry failed:", e2);
              throw e2;
            }
          }
          throw e;
        }
      })();
      inflightByRoute.set(route, p);
      try { await p; } finally { inflightByRoute.delete(route); }
    },

    async clearRouteSlot(route){
      await this.ensureJoined();
      if (!route) return;

      // Dedup
      if (inflightByRoute.has(route)) {
        try { await inflightByRoute.get(route); } catch {}
      }

      const p = (async () => {
        try {
          await nzApi('clearRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route });
        } catch (e) {
          // Fallback: some backends only support assignRouteSlot with 0/null
          try {
            await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: 0 });
          } catch (e2) {
            console.error("[NZ] clearRouteSlot failed:", e, e2);
            throw e2;
          }
        } finally {
          nzLastRouteSlots.delete(route);
          try { await this.syncNow(); } catch {}
        }
      })();
      inflightByRoute.set(route, p);
      try { await p; } finally { inflightByRoute.delete(route); }
    },

    async syncNow(){
      if (!nzLobbyCode) return;
      try { const st = await nzListState(nzLobbyCode); nzRenderLobby(st); nzRenderAllTeams(st); nzApplyGlobalToLocal(st); } catch{}
    }
  };

  // Initial sync
  (async()=>{
    const urlCode = (new URL(location.href)).searchParams.get("code");
    if (urlCode) { nzLobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", nzLobbyCode); }
    if (nzLobbyCode && !nzPlayerId) {
      const nm = (window.state?.user?.name || nzPlayerName || prompt("Dein Name?") || "Spieler").trim();
      nzPlayerName = nm;
      localStorage.setItem("playerName", nm);
      try {
        const j = await nzApi("joinLobby", { name:nm, code:nzLobbyCode });
        nzPlayerId = j.player.id;
        localStorage.setItem("playerId", nzPlayerId);
      } catch(e) { console.warn("[NZ] auto-join failed:", e.message); }
    }
    await nzSync();
  })();
})();
