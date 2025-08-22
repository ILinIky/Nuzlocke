
const API="/api/nuzlocke", POLL_MS=2000, HEARTBEAT_MS=15000;
let playerId=localStorage.getItem("playerId")||"", playerName=localStorage.getItem("playerName")||"",
    lobbyCode=(new URL(location.href).searchParams.get("code")||localStorage.getItem("lobbyCode")||"").toUpperCase();

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

function banner(msg){const b=document.createElement("div");b.textContent=msg;b.style.cssText="position:fixed;z-index:99999;inset:auto 1rem 1rem auto;background:#111827;color:#e5e7eb;padding:.5rem .7rem;border:1px solid #374151;border-radius:.5rem;font:13px system-ui";document.body.appendChild(b);setTimeout(()=>b.remove(),2500)}
banner("NZ loaded");

async function api(action,p={}){
  const r=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...p})});
  const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j={error:t}}
  if(!r.ok||j.error) throw new Error(j.error||`HTTP ${r.status}`); return j;
}
// Robust: POST statt GET, toleriert leeren Code und zeigt brauchbare Fehltexte
async function apiList(code) {
    const c = (code ?? localStorage.getItem('lobbyCode') ?? '').toString().toUpperCase();
  
    const r = await fetch('/api/nuzlocke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'list', code: c }),
      cache: 'no-store'
    });
  
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { error: txt } }
  
    if (!r.ok || j.error) {
      // Fallback ohne Code (Server gibt leeres State zurück)
      const r2 = await fetch('/api/nuzlocke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
        cache: 'no-store'
      });
      if (r2.ok) return r2.json();
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    return j;
  }
  
  

// --- Container sicherstellen (nutzt vorhandene, erzeugt sonst Fallbacks) ---
function ensurePane(id,title){
  let el=document.getElementById(id);
  if(!el){
    el=document.createElement("section"); el.id=id;
    const h=document.createElement("h3"); h.textContent=title; h.style.margin="0 0 .5rem";
    el.style.cssText="margin:1rem 0;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:1rem;padding:1rem";
    el.appendChild(h); document.body.appendChild(el);
  }
  return el;
}
const paneLobby=ensurePane("pane-lobby","Lobby");
const paneBox  =ensurePane("pane-box","Box");
const paneTeam =ensurePane("pane-team","Team (max. 6)");
const paneAll  =ensurePane("pane-all","Alle Teams");

// --- Lobby UI ---
function renderLobby(st){
  const online=(st.players||[]).filter(p=>p.online).length;
  paneLobby.innerHTML = `
    <h3>Lobby</h3>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.5rem 0">
      <label>Code:</label><input id="nzCode" style="text-transform:uppercase" value="${esc(lobbyCode||"")}" placeholder="ABC123">
      <label>Name:</label><input id="nzName" value="${esc(playerName||"")}" placeholder="Name">
      <button id="nzCreate">Erstellen</button>
      <button id="nzJoin">${playerId?"Verbinden":"Beitreten"}</button>
      <span style="opacity:.75">Link: <code>${esc(location.origin+location.pathname)}?code=${esc(lobbyCode||st.code||"")}</code></span>
    </div>
    <div>Spieler in Lobby: ${(st.players||[]).length} (online: ${online})</div>
    <div id="nzMembers" style="display:flex;gap:.35rem;flex-wrap:wrap;margin:.35rem 0"></div>
  `;
  const list=$("#nzMembers",paneLobby);
  list.innerHTML=(st.players||[]).map(p=>`
    <span style="display:inline-flex;gap:.35rem;align-items:center;padding:.25rem .5rem;border:1px solid #374151;border-radius:.5rem">
      <span style="width:.55rem;height:.55rem;border-radius:9999px;background:${p.online?"#22c55e":"#9ca3af"}"></span>${esc(p.name)}
    </span>`).join("");

  $("#nzCreate",paneLobby).onclick=async()=>{
    const nm=$("#nzName",paneLobby).value.trim(); if(nm){playerName=nm;localStorage.setItem("playerName",nm)}
    const j=await api("joinLobby",{name:playerName,code:""}); playerId=j.player.id; lobbyCode=j.code;
    localStorage.setItem("playerId",playerId); localStorage.setItem("lobbyCode",lobbyCode);
    history.replaceState(null,"",`?code=${lobbyCode}`); await sync();
  };
  $("#nzJoin",paneLobby).onclick=async()=>{
    const nm=$("#nzName",paneLobby).value.trim(); const cd=$("#nzCode",paneLobby).value.trim().toUpperCase();
    if(!cd) return alert("Bitte Lobby-Code eingeben"); if(nm){playerName=nm;localStorage.setItem("playerName",nm)}
    lobbyCode=cd; localStorage.setItem("lobbyCode",lobbyCode);
    if(playerId) await api("rejoinLobby",{playerId,name:playerName,code:lobbyCode});
    else { const j=await api("joinLobby",{name:playerName||"Spieler",code:lobbyCode}); playerId=j.player.id; localStorage.setItem("playerId",playerId); }
    history.replaceState(null,"",`?code=${lobbyCode}`); await sync();
  };
}

// --- Box (deins): vorhandene [data-route] wird draggable; sonst Fallback-Chips aus Serverdaten ---
function hydrateRoutesDraggable(root){ $$("[data-route]",root).forEach(el=>{
  if(el.getAttribute("draggable")==="true") return;
  el.setAttribute("draggable","true");
  el.addEventListener("dragstart",e=>{const rt=el.getAttribute("data-route"); e.dataTransfer.setData("text/route",rt); e.dataTransfer.setData("text/plain",rt);});
});}
function renderBox(st){
  hydrateRoutesDraggable(paneBox);
  if(!paneBox.querySelector("[data-route]")){
    const mine=(st.boxes||{})[playerId]||{};
    const fb=$("#nzBoxFallback",paneBox)||document.createElement("div");
    fb.id="nzBoxFallback"; fb.style.marginTop=".5rem";
    fb.innerHTML=Object.keys(mine).length?`<div style="display:flex;flex-wrap:wrap;gap:.35rem">${
      Object.entries(mine).sort().map(([rt,mon])=>`<span class="chip" data-route="${esc(rt)}" draggable="true">${esc(rt)} • ${esc(mon.species)}</span>`).join("")
    }</div>`:`<div style="opacity:.75">Noch keine Pokémon in deiner Box gespeichert.</div>`;
    if(!fb.parentElement) paneBox.appendChild(fb); hydrateRoutesDraggable(fb);
  }
}

// --- Team (deins): vorhandene [data-slot=1..6] droppbar; sonst 6er Grid als Fallback ---
function renderTeam(st){
  const routeSlots=st.routeSlots||[]; const byRoute=new Map(routeSlots.map(r=>[r.route,r.slot]));
  const routeOf=(s)=>{for(const[rt,sl]of byRoute.entries()) if(sl===s) return rt; return null;}
  let slots=$$("[data-slot]",paneTeam).filter(el=>/^[1-6]$/.test(el.getAttribute("data-slot")));
  if(slots.length!==6){
    let grid=$("#nzTeamGrid",paneTeam);
    if(!grid){grid=document.createElement("div");grid.id="nzTeamGrid";grid.style.cssText="display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:.5rem";
      grid.innerHTML=[1,2,3,4,5,6].map(s=>`<div class="slot" data-slot="${s}" style="border:1px dashed #9ca3af;border-radius:.6rem;min-height:80px;display:flex;align-items:center;justify-content:center;text-align:center;padding:.5rem"><div><b>Slot ${s}</b><div style="opacity:.7">Route hierher ziehen</div></div></div>`).join("");
      paneTeam.appendChild(grid);}
    slots=$$("[data-slot]",paneTeam);
  }
  const mine=(st.boxes||{})[playerId]||{};
  slots.forEach(slot=>{
    const s=Number(slot.getAttribute("data-slot")), rt=routeOf(s), mon=rt?mine[rt]:null;
    const info=slot.querySelector(".nzInfo")||document.createElement("div"); info.className="nzInfo";
    info.innerHTML=rt?`${esc(rt)} • ${mon?esc(mon.species)+(mon.caught?"":" (nicht gefangen)"):"<i>kein Mon</i>"}`:`<span style="opacity:.7">Route hierher ziehen</span>`;
    if(!info.parentElement) slot.appendChild(info);
    slot.addEventListener("dragover",e=>{e.preventDefault(); slot.classList.add("dragover")});
    slot.addEventListener("dragleave",()=>slot.classList.remove("dragover"));
    slot.addEventListener("drop",async e=>{e.preventDefault(); slot.classList.remove("dragover");
      const route=e.dataTransfer.getData("text/route")||e.dataTransfer.getData("text/plain"); if(!route) return;
      await NZ.assignGlobalSlot(route,s);
    });
  });
}

// --- Alle Teams (neues Pane, ohne Schnellzugriff) ---
function renderAll(st){
  const routeSlots=st.routeSlots||[]; const byRoute=new Map(routeSlots.map(r=>[r.route,r.slot]));
  const routeOf=(s)=>{for(const[rt,sl]of byRoute.entries()) if(sl===s) return rt; return null;}
  const blocks=(st.players||[]).map(p=>{
    const box=(st.boxes||{})[p.id]||{};
    const cells=[1,2,3,4,5,6].map(s=>{
      const rt=routeOf(s), mon=rt?box[rt]:null;
      return `<div class="slot" style="border:1px solid #374151;border-radius:.6rem;min-height:80px;padding:.5rem">
        <b>Slot ${s}</b><div>${rt?`${esc(rt)} • ${mon?esc(mon?.species)+(mon?.caught?"":" (nicht gefangen)"):"<i>kein Mon</i>"}`:"<span style='opacity:.7'>—</span>"}</div>
      </div>`;
    }).join("");
    return `<div style="font-weight:700;margin:.5rem 0">Team: ${esc(p.name)} ${p.online?"":"<span style='opacity:.6'>(offline)</span>"}</div>
            <div style="display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:.5rem">${cells}</div><hr>`;
  }).join("");
  paneAll.innerHTML=`<h3>Alle Teams</h3>${blocks||"<div style='opacity:.75'>Noch keine Spieler</div>"}`;
}

// --- Heartbeat & Sync ---
async function heartbeat(){ if(playerId&&lobbyCode) await api("heartbeat",{playerId,code:lobbyCode}) }
async function sync(){
  try{
    if(!lobbyCode){ renderLobby({code:"",players:[]}); return; }
    const st=await apiList(lobbyCode);
    renderLobby(st); renderBox(st); renderTeam(st); renderAll(st);
  }catch(e){ console.error("[NZ] sync failed:", e); }
}
setInterval(heartbeat,HEARTBEAT_MS);
setInterval(sync,POLL_MS);

// --- Auto-Join bei ?code= ---
(async()=>{
  const urlCode=(new URL(location.href)).searchParams.get("code");
  if(urlCode){ lobbyCode=urlCode.toUpperCase(); localStorage.setItem("lobbyCode",lobbyCode) }
  if(lobbyCode && !playerId){
    const nm=playerName||prompt("Dein Name?")||"Spieler"; playerName=nm; localStorage.setItem("playerName",nm);
    const j=await api("joinLobby",{name:nm,code:lobbyCode}); playerId=j.player.id; localStorage.setItem("playerId",playerId);
  }
  await sync();
})();

// --- Öffentliche Hooks: UNBEDINGT in deiner App aufrufen, damit andere Updates sehen ---
window.NZ={
  async upsertPokemon(route,species,caught=true){ if(!playerId) throw new Error("Nicht in Lobby"); await api("upsertPokemon",{playerId,route,species,caught}); await sync(); },
  async assignGlobalSlot(route,slot){ if(!lobbyCode) throw new Error("Keine Lobby"); await api("assignRouteSlot",{code:lobbyCode,route,slot}); await sync(); },
  get me(){ return {playerId,playerName,lobbyCode} }
};

