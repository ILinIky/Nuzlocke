// nuzlocke-client.js
const API = "/api/nuzlocke";
const HEARTBEAT_MS = 15000;
const POLL_MS = 5000;

let playerId = localStorage.getItem("playerId") || "";
let playerName = localStorage.getItem("playerName") || "";
let lobbyCode = (new URL(location.href).searchParams.get("code") || localStorage.getItem("lobbyCode") || "").toUpperCase();

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function ensureShell() {
  // Tabs + Container anlegen, falls Seite keine hat
  if (!$("#nuz-tabs")) {
    const nav = document.createElement("div");
    nav.id = "nuz-tabs";
    nav.innerHTML = `
      <style>
        .nuz-wrap{font:15px system-ui,sans-serif;color:#e5e7eb}
        .nuz-tabs{display:flex;gap:.4rem;margin:.5rem 0}
        .nuz-tabs button{background:#1f2937;border:1px solid #374151;border-radius:.6rem;padding:.45rem .7rem;color:#e5e7eb;cursor:pointer}
        .nuz-tabs button.active{background:#111827}
        .nuz-pane{display:none;background:#0b1220;border:1px solid #374151;border-radius:1rem;padding:1rem;margin:.5rem 0}
        .nuz-pane.active{display:block}
        .grid6{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:.5rem}
        .slot{border:1px dashed #9ca3af;border-radius:.75rem;min-height:84px;background:#0f172a;display:flex;align-items:center;justify-content:center;text-align:center;padding:.5rem}
        .slot.dragover{outline:2px solid #60a5fa}
        .chip{display:inline-block;padding:.35rem .55rem;border-radius:.6rem;background:#111827;border:1px solid #374151;margin:.2rem;cursor:grab}
        .pname{font-weight:700;margin:.25rem 0 .5rem}
        .ghost{opacity:.5}
        .row{display:flex;gap:.5rem;align-items:center;margin:.5rem 0}
        input,select{background:#0b1220;border:1px solid #374151;border-radius:.5rem;color:#e5e7eb;padding:.45rem .6rem}
        .btn{background:#1f2937;border:1px solid #374151;border-radius:.6rem;color:#e5e7eb;padding:.45rem .7rem;cursor:pointer}
        .muted{opacity:.75}
        .list{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}
        hr{border:0;height:1px;background:#374151;margin:1rem 0}
      </style>
      <div class="nuz-wrap">
        <div class="nuz-tabs">
          <button data-tab="lobby" class="active">Lobby</button>
          <button data-tab="box">Box</button>
          <button data-tab="team">Team</button>
          <button data-tab="all">Alle Teams</button>
        </div>
        <div id="pane-lobby" class="nuz-pane active"></div>
        <div id="pane-box" class="nuz-pane"></div>
        <div id="pane-team" class="nuz-pane"></div>
        <div id="pane-all" class="nuz-pane"></div>
      </div>
    `;
    document.body.appendChild(nav);
    $$(".nuz-tabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".nuz-tabs button").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        $$(".nuz-pane").forEach(p=>p.classList.remove("active"));
        $(`#pane-${btn.dataset.tab}`).classList.add("active");
      });
    });
  }
}
ensureShell();

async function api(action, payload={}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t) } catch { j = { error: t } }
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function apiList(code) {
  const r = await fetch(`${API}?action=list&code=${encodeURIComponent(code)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function hydrateDragRoutes(root=document) {
  $$("[data-route]", root).forEach(el => {
    el.setAttribute("draggable","true");
    el.classList.add("chip");
    el.addEventListener("dragstart", e => {
      const route = el.getAttribute("data-route");
      e.dataTransfer.setData("text/route", route);
      e.dataTransfer.setData("text/plain", route);
    });
  });
}

function renderLobby(st) {
  const pane = $("#pane-lobby");
  const list = (st?.players || []).map(p => `<li class="chip">${esc(p.name)}</li>`).join("");
  pane.innerHTML = `
    <h3>Lobby</h3>
    <div class="row">
      <label>Lobby-Code:</label>
      <input id="codeIn" placeholder="z. B. ABC123" value="${esc(lobbyCode || "")}" style="text-transform:uppercase">
      <button class="btn" id="btnCreate">Lobby erstellen</button>
      <button class="btn" id="btnJoin">${playerId ? "Lobby setzen" : "Beitreten"}</button>
    </div>
    <div class="row">
      <label>Dein Name:</label>
      <input id="nameIn" placeholder="Name" value="${esc(playerName || "")}">
    </div>
    <div class="muted">Teile diesen Link: <code>${esc(location.origin + location.pathname)}?code=${esc(lobbyCode || st?.code || "")}</code></div>
    <hr>
    <div>Spieler in der Lobby: ${(st?.players || []).length}</div>
    <div class="list">${list || "<span class='muted'>niemand online</span>"}</div>
  `;
  $("#btnCreate").onclick = async () => {
    const nm = $("#nameIn").value.trim();
    if (nm) { playerName = nm; localStorage.setItem("playerName", nm); }
    const j = await api("joinLobby", { name: playerName, code: "" });
    playerId = j.player.id; lobbyCode = j.code;
    localStorage.setItem("playerId", playerId);
    localStorage.setItem("lobbyCode", lobbyCode);
    history.replaceState(null, "", `?code=${lobbyCode}`);
    await sync();
  };
  $("#btnJoin").onclick = async () => {
    const nm = $("#nameIn").value.trim();
    const cd = $("#codeIn").value.trim().toUpperCase();
    if (!cd) { alert("Bitte Lobby-Code eingeben"); return; }
    if (nm) { playerName = nm; localStorage.setItem("playerName", nm); }
    lobbyCode = cd; localStorage.setItem("lobbyCode", lobbyCode);
    if (playerId) {
      await api("rejoinLobby", { playerId, name: playerName, code: lobbyCode });
    } else {
      const j = await api("joinLobby", { name: playerName, code: lobbyCode });
      playerId = j.player.id; localStorage.setItem("playerId", playerId);
    }
    history.replaceState(null, "", `?code=${lobbyCode}`);
    await sync();
  };
}

function renderBox(st) {
  const pane = $("#pane-box");
  const myBox = st?.boxes?.[playerId] || {};
  const routes = Object.keys(myBox).sort();
  const chips = routes.map(rt => {
    const mon = myBox[rt];
    return `<span class="chip" data-route="${esc(rt)}" title="${esc(mon.species)}">${esc(rt)} • ${esc(mon.species)}</span>`;
  }).join("");
  pane.innerHTML = `
    <h3>Box (deine verfügbaren Pokémon)</h3>
    <div class="list">${chips || "<span class='muted'>Noch keine Pokémon eingetragen.</span>"}</div>
    <hr>
    <div class="row">
      <input id="routeIn" placeholder="Route (z. B. Route 101)">
      <input id="speciesIn" placeholder="Spezies (z. B. Evoli)">
      <label><input type="checkbox" id="caughtIn" checked> gefangen</label>
      <button class="btn" id="btnAddMon">Hinzufügen/Ändern</button>
    </div>
    <div class="muted">Tipp: Chips sind <b>drag & drop</b> auf Team-Slots.</div>
  `;
  $("#btnAddMon").onclick = async () => {
    if (!lobbyCode || !playerId) { alert("Bitte erst Lobby beitreten."); return; }
    const rt = $("#routeIn").value.trim();
    const sp = $("#speciesIn").value.trim();
    const ct = $("#caughtIn").checked;
    if (!rt || !sp) return alert("Route + Spezies angeben");
    await api("upsertPokemon", { playerId, route: rt, species: sp, caught: ct });
    await sync();
    $("#routeIn").value = ""; $("#speciesIn").value = "";
  };
  hydrateDragRoutes(pane);
}

function renderTeam(st) {
  const pane = $("#pane-team");
  const routeSlots = st?.routeSlots || [];
  const slotsByRoute = new Map(routeSlots.map(r => [r.route, r.slot]));
  const routeForSlot = (s) => {
    for (const [rt, sl] of slotsByRoute.entries()) if (sl === s) return rt;
    return null;
  };
  const myBox = st?.boxes?.[playerId] || {};
  const slotHtml = [1,2,3,4,5,6].map(s => {
    const rt = routeForSlot(s);
    if (!rt) return `<div class="slot" data-slot="${s}"><div><b>Slot ${s}</b><div class="muted">Route hierher ziehen</div></div></div>`;
    const mon = myBox[rt];
    const line = mon ? `${esc(rt)} • ${esc(mon.species)}${mon.caught?"":" (nicht gefangen)"}` : `${esc(rt)} • <i>kein Mon</i>`;
    return `<div class="slot" data-slot="${s}"><div><b>Slot ${s}</b><div>${line}</div></div></div>`;
  }).join("");
  // Schnellzugriff: eigene Routen als Chips
  const routes = Object.keys(myBox).sort();
  const chips = routes.map(rt => `<span class="chip" data-route="${esc(rt)}">${esc(rt)} • ${esc(myBox[rt].species)}</span>`).join("");

  pane.innerHTML = `
    <h3>Team (Lobby: ${esc(lobbyCode || "-")})</h3>
    <div class="muted">Schnellzugriff (deine Routen):</div>
    <div class="list">${chips || "<span class='muted'>Keine Routen</span>"}</div>
    <div class="grid6">${slotHtml}</div>
  `;

  // Drop-Targets
  $$(".slot", pane).forEach(slotEl => {
    slotEl.addEventListener("dragover", e => { e.preventDefault(); slotEl.classList.add("dragover"); });
    slotEl.addEventListener("dragleave", () => slotEl.classList.remove("dragover"));
    slotEl.addEventListener("drop", async e => {
      e.preventDefault(); slotEl.classList.remove("dragover");
      const route = e.dataTransfer.getData("text/route") || e.dataTransfer.getData("text/plain");
      const slot = Number(slotEl.dataset.slot);
      if (!route || !slot) return;
      await api("assignRouteSlot", { code: lobbyCode, route, slot });
      await sync();
    });
  });
  hydrateDragRoutes(pane);
}

function renderAllTeams(st) {
  const pane = $("#pane-all");
  const routeSlots = st?.routeSlots || [];
  const slotsByRoute = new Map(routeSlots.map(r => [r.route, r.slot]));
  const routeForSlot = (s) => { for (const [rt, sl] of slotsByRoute.entries()) if (sl === s) return rt; return null; };

  const htmlPlayers = (st?.players || []).map(p => {
    const box = st?.boxes?.[p.id] || {};
    const cells = [1,2,3,4,5,6].map(s => {
      const rt = routeForSlot(s);
      if (!rt) return `<div class="slot"><div><b>Slot ${s}</b><div class="muted">—</div></div></div>`;
      const mon = box[rt];
      const line = mon ? `${esc(rt)} • ${esc(mon.species)}${mon.caught?"":" (nicht gefangen)"}` : `${esc(rt)} • <i>kein Mon</i>`;
      return `<div class="slot"><div><b>Slot ${s}</b><div>${line}</div></div></div>`;
    }).join("");
    return `
      <div class="pname">Team: ${esc(p.name)}</div>
      <div class="grid6">${cells}</div>
      <hr>
    `;
  }).join("");

  pane.innerHTML = `
    <h3>Alle Teams</h3>
    ${htmlPlayers || "<span class='muted'>Keine Spieler online</span>"}
  `;
}

async function heartbeat() {
  if (playerId && lobbyCode) await api("heartbeat", { playerId, code: lobbyCode });
}

async function sync() {
  try {
    if (!lobbyCode) { renderLobby({ code:"", players:[] }); return; }
    const st = await apiList(lobbyCode);
    renderLobby(st);
    renderBox(st);
    renderTeam(st);
    renderAllTeams(st);
  } catch (e) {
    console.error("sync failed:", e);
    renderLobby({ code: lobbyCode, players: [] });
  }
}

setInterval(heartbeat, HEARTBEAT_MS);
setInterval(sync, POLL_MS);

// Auto-Join falls URL ?code=XYZ hat und Name bekannt
(async () => {
  if (lobbyCode && !playerId && playerName) {
    const j = await api("joinLobby", { name: playerName, code: lobbyCode });
    playerId = j.player.id; localStorage.setItem("playerId", playerId);
  }
  await sync();
})();

// Public Hooks für dein bestehendes Spiel (kannst du aus deiner App aufrufen)
window.NuzlockeAPI = {
  async setName(name){ playerName = name.trim(); localStorage.setItem("playerName", playerName); await sync(); },
  async join(code){
    lobbyCode = (code||"").toUpperCase(); localStorage.setItem("lobbyCode", lobbyCode);
    if (playerId) await api("rejoinLobby", { playerId, name: playerName, code: lobbyCode });
    else {
      const j = await api("joinLobby", { name: playerName || "Spieler", code: lobbyCode });
      playerId = j.player.id; localStorage.setItem("playerId", playerId);
    }
    await sync();
  },
  async upsertPokemon(route, species, caught=true){
    if (!playerId) throw new Error("nicht in Lobby");
    await api("upsertPokemon", { playerId, route, species, caught });
    await sync();
  },
  async assignGlobalSlot(route, slot){
    if (!lobbyCode) throw new Error("keine Lobby");
    await api("assignRouteSlot", { code: lobbyCode, route, slot });
    await sync();
  }
};
