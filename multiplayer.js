
const API="/api/nuzlocke";
const HEARTBEAT_MS = 15000;
const POLL_MS = 4000;

let playerId = localStorage.getItem("playerId") || "";
let playerName = localStorage.getItem("playerName") || "";
let lobbyCode = (new URL(location.href)).searchParams.get("code") || localStorage.getItem("lobbyCode") || "";

const elLobbyPane = document.querySelector("#nz-lobby");      // im Lobby-Tab
const elAllTeams  = document.querySelector("#nz-allteams");   // im All Teams-Tab

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ---- API helpers (neue Actions) ----
async function api(action, payload={}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
    cache: "no-store"
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t) } catch { j = { error: t } }
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function listState(code) {
  const c = (code || "").toUpperCase();
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list", code: c }),
    cache: "no-store"
  });
  if (r.ok) return r.json();
  const t = await r.text();
  throw new Error(`HTTP ${r.status} ${t}`);
}

// ---- Lobby UI (nur in #nz-lobby) ----
function renderLobby(st){
  if (!elLobbyPane) return;
  const online=(st.players||[]).filter(p=>p.online).length;
  elLobbyPane.innerHTML = `
    <div class="row" style="margin:.5rem 0">
      <label>Lobby-Code:</label><input id="nzCode" style="text-transform:uppercase" value="${esc(lobbyCode||st.code||"")}" placeholder="ABC123">
      <label>Name:</label><input id="nzName" value="${esc(playerName||"")}" placeholder="Name">
      <button id="nzCreate" class="btn">Erstellen</button>
      <button id="nzJoin" class="btn">${playerId?"Verbinden":"Beitreten"}</button>
      <span class="helper">Link: <code>${esc(location.origin+location.pathname)}?code=${esc(lobbyCode||st.code||"")}</code></span>
    </div>
    <div>Spieler in Lobby: ${(st.players||[]).length} (online: ${online})</div>
    <div class="players" style="margin-top:.5rem">
      ${(st.players||[]).map(p=>`
        <div class="player"><span class="name">${esc(p.name)}</span><span class="meta">${p.online?"online":"offline"}</span></div>
      `).join("")}
    </div>
  `;

  elLobbyPane.querySelector("#nzCreate").onclick = async ()=>{
    const nm = elLobbyPane.querySelector("#nzName").value.trim() || "Spieler";
    playerName = nm; localStorage.setItem("playerName", nm);
    const j = await api("joinLobby", { name: nm, code: "" });
    playerId = j.player.id; lobbyCode = j.code;
    localStorage.setItem("playerId", playerId);
    localStorage.setItem("lobbyCode", lobbyCode);
    history.replaceState(null,"",`?code=${lobbyCode}`);
    await sync();
  };
  elLobbyPane.querySelector("#nzJoin").onclick = async ()=>{
    const nm = elLobbyPane.querySelector("#nzName").value.trim() || "Spieler";
    playerName = nm; localStorage.setItem("playerName", nm);
    const cd = (elLobbyPane.querySelector("#nzCode").value.trim() || "").toUpperCase();
    if (!cd) return alert("Bitte Lobby-Code eingeben");
    lobbyCode = cd; localStorage.setItem("lobbyCode", lobbyCode);
    if (playerId) await api("rejoinLobby", { playerId, name: playerName, code: lobbyCode });
    else {
      const j = await api("joinLobby", { name: playerName, code: lobbyCode });
      playerId = j.player.id; localStorage.setItem("playerId", playerId);
    }
    history.replaceState(null,"",`?code=${lobbyCode}`);
    await sync();
  };
}

// ---- Dein Team (Select) mit globalem Mapping „spiegeln“ ----
function applyGlobalToLocal(st){
  if (!window.state) return; // dein lokaler State aus dem ersten Script
  const myBox = st.boxes?.[playerId] || {};
  // Baue eine Map route->uid aus deiner lokalen Box
  const uidByRoute = new Map();
  for (const mon of window.state.box) uidByRoute.set(mon.routeName, mon.uid);

  // Route→Slot aus Server in local state.team spiegeln
  const newTeam = [null,null,null,null,null,null];
  (st.routeSlots||[]).forEach(rs=>{
    if (rs.slot>=1 && rs.slot<=6) {
      const uid = uidByRoute.get(rs.route) || null;
      newTeam[rs.slot-1] = uid;
    }
  });

  // isInTeam-Flags neu setzen
  window.state.box.forEach(m=>m.isInTeam=false);
  newTeam.forEach(uid=>{
    const mon = window.state.box.find(m=>m.uid===uid);
    if (mon) mon.isInTeam = true;
  });
  window.state.team = newTeam;
  // neu zeichnen mit deinem Renderer
  try {
    window.save?.();
    window.renderTeam?.();
    window.renderRouteGroups?.();
    window.renderBox?.();
    window.renderBoxDrawer?.();
  } catch(_) {}
}

// ---- All Teams im gleichen Look wie „Select“ ----
function renderAllTeams(st){
  if (!elAllTeams) return;
  const byRoute = new Map((st.routeSlots||[]).map(r=>[r.route,r.slot]));
  const routeOf = s => { for (const [rt,sl] of byRoute.entries()) if (sl===s) return rt; return null; };

  const players = st.players||[];
  elAllTeams.innerHTML = players.map(p=>{
    const box = st.boxes?.[p.id] || {};
    const slotsHtml = [1,2,3,4,5,6].map(s=>{
      const rt = routeOf(s);
      const mon = rt ? box[rt] : null;
      // „Select“-Look nachbauen: .team-wrap + .slot + .slot-inner
      return `
        <div class="slot">
          <div class="slot-inner">
            ${mon ? `
              <div style="width:72px;height:72px;display:grid;place-items:center;margin:0 auto;border:1px dashed rgba(255,255,255,.12);border-radius:12px;background:#0a1231">🐾</div>
              <div class="meta">${esc(rt)} • ${esc(mon.species)}${mon.caught?"":" (nicht gefangen)"}</div>
            ` : `
              <div class="meta">—</div>
            `}
          </div>
        </div>
      `;
    }).join("");
    return `
      <div style="margin:.6rem 0">
        <div class="player"><span class="name">Team: ${esc(p.name)}</span><span class="meta">${p.online?"online":"offline"}</span></div>
        <div class="team-wrap" style="margin-top:.5rem">${slotsHtml}</div>
      </div>
      <hr>
    `;
  }).join("") || `<div class="helper">Noch keine Spieler</div>`;
}

// ---- Heartbeat & Sync ----
async function heartbeat(){
  if (playerId && lobbyCode) await api("heartbeat", { playerId, code: lobbyCode });
}
async function sync(){
  if (!lobbyCode) { renderLobby({ code:"", players:[] }); return; }
  try{
    const st = await listState(lobbyCode);
    renderLobby(st);
    renderAllTeams(st);
    applyGlobalToLocal(st); // <— spiegelt globales Mapping in dein „Select“ (Team)
  }catch(e){
    console.error("[NZ] sync failed:", e);
  }
}
setInterval(heartbeat, HEARTBEAT_MS);
setInterval(sync, POLL_MS);

// ---- Auto-Join bei ?code= ----
(async()=>{
  const urlCode = (new URL(location.href)).searchParams.get("code");
  if (urlCode) { lobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", lobbyCode); }
  if (lobbyCode && !playerId) {
    const nm = playerName || prompt("Dein Name?") || "Spieler";
    playerName = nm; localStorage.setItem("playerName", nm);
    const j = await api("joinLobby", { name: nm, code: lobbyCode });
    playerId = j.player.id; localStorage.setItem("playerId", playerId);
  }
  await sync();
})();

// ---- Öffentliche Hooks für dein vorhandenes Skript ----
window.NZ = {
  async upsertPokemon(route,species,caught=true){
    if (!playerId) { const nm = playerName || prompt("Dein Name?") || "Spieler"; const j = await api("joinLobby",{name:nm,code:lobbyCode}); playerId=j.player.id; localStorage.setItem("playerId",playerId); }
    await api("upsertPokemon", { playerId, route, species, caught });
    await sync();
  },
  async assignGlobalSlot(route,slot){
    if (!lobbyCode) return alert("Keine Lobby. Bitte Lobby beitreten.");
    await api("assignRouteSlot", { code: lobbyCode, route, slot });
    await sync();
  },
  get me(){ return { playerId, playerName, lobbyCode } }
};