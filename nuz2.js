/* =========================
   App + Multiplayer (merged)
   ========================= */

/* ---------- Utilities ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const toTitle = name => name ? name.charAt(0).toUpperCase() + name.slice(1) : "";

/* ---------- Race guards & pending overlay ---------- */
let nzLocalHoldUntil = 0;                       // while > Date.now(), don't overwrite local team from server
function holdSync(ms = 1500){ nzLocalHoldUntil = Date.now() + ms; }

let nzPendingSet = new Map();   // Map<route, {slot:number, expires:number}>
let nzPendingClear = new Map(); // Map<route, expires:number>
function pendingMarkSet(route, slot, ms = 8000){
  nzPendingSet.set(route, { slot, expires: Date.now() + ms });
  nzPendingClear.delete(route);
}
function pendingMarkClear(route, ms = 8000){
  nzPendingClear.set(route, Date.now() + ms);
  nzPendingSet.delete(route);
}
function pendingPrune(){
  const t = Date.now();
  for (const [r, v] of nzPendingSet)   if (v.expires < t) nzPendingSet.delete(r);
  for (const [r, e] of nzPendingClear) if (e < t)         nzPendingClear.delete(r);
}

/* ---------- Persistence ---------- */
const LS_KEY = 'nuzlocke_state_v1';
const POKEDEX_KEY = 'nuz_pokedex_v2';

const DEFAULT_ROUTES = [
  'Route 1','Route 2','Route 3','Route 4','Route 5','Route 6',
  'Viridian Forest','Pewter City','Mt. Moon','Cerulean City','Route 24','Route 25'
];

const EMPTY_STATE = () => ({
  user: { name: '' },
  routes: DEFAULT_ROUTES.map((n, i) => ({
    id: 'r'+(i+1),
    name:n,
    encounter: { status:'pending', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt:null }
  })),
  box: [],  // {uid,id,name,sprite,routeName,nickname,caughtAt,isInTeam:false}
  team: [null,null,null,null,null,null],
  links: { 0:null,1:null,2:null,3:null,4:null,5:null }
});

let state = null;
let selectedFromBoxUid = null;

function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }
function load(){ try { const s = localStorage.getItem(LS_KEY); state = s ? JSON.parse(s) : EMPTY_STATE(); } catch { state = EMPTY_STATE(); }}

/* ---------- Pokédex ---------- */
let pokedex = [];
let pokedexReady = false;
async function ensurePokedex(){
  const cached = localStorage.getItem(POKEDEX_KEY);
  if(cached){ try { pokedex = JSON.parse(cached); pokedexReady = true; return; } catch {} }
  try{
    const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025', { cache: "force-cache" });
    const data = await res.json();
    pokedex = data.results.map(x => {
      const m = x.url.match(/pokemon\/(\d+)\/?$/);
      return { id: m?Number(m[1]):null, name: x.name };
    }).filter(x=>x.id);
    localStorage.setItem(POKEDEX_KEY, JSON.stringify(pokedex));
    pokedexReady = true;
  }catch{
    pokedex = [
      {id:1,name:'bulbasaur'},{id:4,name:'charmander'},{id:7,name:'squirtle'},
      {id:10,name:'caterpie'},{id:16,name:'pidgey'},{id:19,name:'rattata'},
      {id:25,name:'pikachu'},{id:35,name:'clefairy'},{id:39,name:'jigglypuff'},
      {id:52,name:'meowth'},{id:54,name:'psyduck'},{id:63,name:'abra'},
      {id:66,name:'machop'},{id:74,name:'geodude'},{id:77,name:'ponyta'},
      {id:81,name:'magnemite'},{id:92,name:'gastly'},{id:95,name:'onix'},
      {id:98,name:'krabby'},{id:116,name:'horsea'},{id:129,name:'magikarp'},
      {id:133,name:'eevee'},{id:143,name:'snorlax'},{id:147,name:'dratini'}
    ];
    pokedexReady = true;
  }
}

/* ---------- Tabs ---------- */
function setActiveTab(tab){
  $$('#tabs .tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.id === `panel-${tab}`));
}

/* ---------- Routes ---------- */
let currentRouteId = null;

function renderRoutes(){
  const wrap = $('#routesList'); if (!wrap) return;
  wrap.innerHTML = '';
  state.routes.forEach(rt => {
    const div = document.createElement('div');
    div.className = 'route-item' + (currentRouteId===rt.id ? ' active' : '');
    const status = rt.encounter.status;
    const statusText = status==='pending'?'(offen)':status==='caught'?'(gefangen)':'(fehlversuch)';
    div.innerHTML = `<span>${rt.name} <span class="status-note">${statusText}</span></span>`;
    div.onclick = ()=>{ currentRouteId = rt.id; renderRoutes(); renderEncounter(); };
    wrap.appendChild(div);
  });
}

function renderEncounter(){
  const pane = $('#encounterPane');
  const rt = state.routes.find(r=>r.id===currentRouteId);
  if(!rt){ if (pane) pane.innerHTML = '<p class="helper">Wähle links eine Route.</p>'; return; }
  const e = rt.encounter;

  const listHtml = pokedex.slice(0,1025).map(p=>`<option value="${toTitle(p.name)}" data-id="${p.id}"></option>`).join('');
  const hasMon = !!e.pokemonId;

  if (pane) pane.innerHTML = `
    <div class="encounter">
      <div>
        <div class="preview">
          <div class="sprite" id="encSprite">${hasMon?`<img alt="${toTitle(e.pokemonName)}" src="${e.sprite}">`:'—'}</div>
          <div>
            <div class="row">
              <input list="pokedexList" id="pokeSearch" type="search" placeholder="Pokémon wählen…" value="${hasMon?toTitle(e.pokemonName):''}">
              <datalist id="pokedexList">${listHtml}</datalist>
              <input id="nickname" type="text" placeholder="Spitzname (optional)" value="${e.nickname||''}">
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn ok" id="btnCaught">Gefangen</button>
              <button class="btn bad" id="btnFailed">Fehlversuch</button>
              <button class="btn" id="btnClear">Zurücksetzen</button>
            </div>
          </div>
        </div>
        <p class="helper" style="margin-top:10px">Status: <b>${e.status==='pending'?'Offen':e.status==='caught'?'Gefangen':'Fehlversuch'}</b> ${e.updatedAt?`• zuletzt aktualisiert: ${new Date(e.updatedAt).toLocaleString()}`:''}</p>
      </div>
      <div>
        <div class="card">
          <h3>Regeln & Hinweise</h3>
          <ul>
            <li>Nur das <b>erste Pokémon</b> der Route zählt.</li>
            <li>Markiere es als <b>Gefangen</b>, um es in die Box zu legen.</li>
            <li>Du kannst einen Spitznamen vergeben.</li>
            <li>Ziehe das Pokémon später in einen Team-Slot.</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const search = $('#pokeSearch');
  const nick = $('#nickname');
  const btnCaught = $('#btnCaught');
  const btnFailed = $('#btnFailed');
  const btnClear = $('#btnClear');

  function resolvePokemon(str){
    if(!str) return null;
    const name = str.trim().toLowerCase();
    let found = pokedex.find(p=>p.name===name);
    if(!found) found = pokedex.find(p=>toTitle(p.name)===str.trim());
    return found || null;
  }
  function updatePreview(){
    const chosen = resolvePokemon(search.value);
    const sprite = chosen? SPRITE(chosen.id) : null;
    const imgWrap = $('#encSprite');
    if (imgWrap) imgWrap.innerHTML = chosen? `<img alt="${toTitle(chosen.name)}" src="${sprite}">` : '—';
  }
  if (search) search.addEventListener('input', updatePreview);

  if (btnCaught) btnCaught.onclick = ()=>{
    const chosen = resolvePokemon(search.value);
    if(!chosen) { alert('Bitte ein gültiges Pokémon auswählen.'); return; }
    rt.encounter = {
      status:'caught', pokemonId: chosen.id, pokemonName: chosen.name, sprite: SPRITE(chosen.id), nickname: (nick?.value || '').trim(), updatedAt: now()
    };
    const exists = state.box.find(m=>m.routeName===rt.name);
    if(!exists){
      state.box.push({ uid:uid(), id:chosen.id, name:chosen.name, sprite:SPRITE(chosen.id), routeName:rt.name, nickname:(nick?.value||'').trim(), caughtAt:now(), isInTeam:false });
    }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();

    // Server: species für "All Teams" aktualisieren
    if (window.NZ) window.NZ.upsertPokemon(rt.name, toTitle(chosen.name), true).catch(()=>{});
  };

  if (btnFailed) btnFailed.onclick = ()=>{
    rt.encounter = { status:'failed', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt: now() };
    const idx = state.box.findIndex(m=>m.routeName===rt.name && !m.isInTeam);
    if(idx>=0){ state.box.splice(idx,1); }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();
  };

  if (btnClear) btnClear.onclick = ()=>{
    rt.encounter = { status:'pending', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt: now() };
    const idx = state.box.findIndex(m=>m.routeName===rt.name && !m.isInTeam);
    if(idx>=0){ state.box.splice(idx,1); }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();
  };

  updatePreview();
}

/* ---------- Box Drawer ---------- */
function renderBoxDrawer(){
  const grid = $('#boxDrawer'); if(!grid) return;
  grid.innerHTML = '';
  for (const mon of state.box){
    const card = document.createElement('div');
    card.className = 'poke-card';
    card.draggable = true;
    card.dataset.uid = mon.uid;
    card.setAttribute('data-route', mon.routeName);
    card.innerHTML = `
      <div class="poke-top">
        <div>
          <div class="poke-name">#${mon.id} ${toTitle(mon.name)} ${mon.nickname?`“${mon.nickname}”`:''}</div>
          <div class="tag">${mon.routeName}</div>
        </div>
      </div>
      <div class="poke-sprite"><img alt="${toTitle(mon.name)}" src="${mon.sprite}"></div>
      ${mon.isInTeam?`<div class="ribbon">Im Team</div>`:''}
    `;
    card.addEventListener('dragstart', e=>{
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', mon.uid);
      e.dataTransfer.setData('text/route', mon.routeName);
    });
    card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
    card.addEventListener('click', ()=>{
      selectedFromBoxUid = mon.uid;
      renderTeam();
      const el = document.querySelector(`#boxDrawer [data-uid="${mon.uid}"]`);
      if(el){ el.classList.add('selected'); setTimeout(()=>el.classList.remove('selected'), 800); }
      const hint = $('#pickHint'); if (hint) hint.style.display = 'block';
    });
    grid.appendChild(card);
  }
}

/* ---------- Box Tab ---------- */
function renderBox(){
  const grid = $('#boxGrid'); if(!grid) return;
  grid.innerHTML = '';
  for (const mon of state.box){
    const card = document.createElement('div');
    card.className = 'poke-card';
    card.draggable = true;
    card.dataset.uid = mon.uid;
    card.setAttribute('data-route', mon.routeName);
    card.innerHTML = `
      <div class="poke-top">
        <div>
          <div class="poke-name">#${mon.id} ${toTitle(mon.name)} ${mon.nickname?`“${mon.nickname}”`:''}</div>
          <div class="tag">${mon.routeName}</div>
        </div>
        <button class="btn bad" data-remove>Entfernen</button>
      </div>
      <div class="poke-sprite"><img alt="${toTitle(mon.name)}" src="${mon.sprite}"></div>
      ${mon.isInTeam?`<div class="ribbon">Im Team</div>`:''}
    `;
    card.addEventListener('dragstart', e=>{
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', mon.uid);
      e.dataTransfer.setData('text/route', mon.routeName);
    });
    card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
    card.querySelector('[data-remove]').onclick = (ev)=>{
      ev.stopPropagation();
      if(mon.isInTeam){ alert('Dieses Pokémon ist im Team. Entferne es zuerst aus dem Team.'); return; }
      const i = state.box.findIndex(x=>x.uid===mon.uid); if(i>=0) state.box.splice(i,1);
      save(); renderBox(); renderTeam(); renderBoxDrawer(); renderRouteGroups();
    };
    card.addEventListener('click', (ev)=>{
      if(ev.target.closest('[data-remove]')) return;
      selectedFromBoxUid = mon.uid;
      setActiveTab('team');
      renderTeam(); renderBoxDrawer(); renderRouteGroups();
      const el = document.querySelector(`#boxDrawer [data-uid="${mon.uid}"]`);
      if(el){ el.classList.add('selected'); el.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>el.classList.remove('selected'), 800); }
      const hint = $('#pickHint'); if (hint) hint.style.display = 'block';
    });
    grid.appendChild(card);
  }
}

/* ---------- Team ---------- */
function renderTeam(){
  const wrap = $('#teamWrap'); if (!wrap) return;
  wrap.innerHTML = '';
  for(let i=0;i<6;i++){
    const uidRef = state.team[i];
    const mon = uidRef ? state.box.find(m=>m.uid===uidRef) : null;
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.index = i;
    slot.innerHTML = mon ? `
      <div class="slot-inner">
        <img alt="${toTitle(mon.name)}" src="${mon.sprite}">
        <div class="meta">#${mon.id} ${toTitle(mon.name)} ${mon.nickname?`“${mon.nickname}”`:''}</div>
        <div class="actions"><button class="btn" data-remove>Aus Team</button></div>
      </div>
    ` : `
      <div class="slot-inner">
        <div>(leer)</div>
        <div class="meta">Ziehe ein Pokémon hierher oder klicke zur Auswahl</div>
      </div>
    `;

    // Drag & Drop
    slot.addEventListener('dragover', e=>{ e.preventDefault(); slot.classList.add('over'); });
    slot.addEventListener('dragleave', ()=>slot.classList.remove('over'));
    slot.addEventListener('drop', async e=>{
      e.preventDefault(); slot.classList.remove('over');
      const uid = e.dataTransfer.getData('text/plain');
      const mon = state.box.find(m=>m.uid===uid);
      if(!mon) return;

      const targetSlot = i + 1;
      const route = mon.routeName || e.dataTransfer.getData('text/route') || '';

      const prevUid = state.team[i];
      const prevMon = prevUid ? state.box.find(m=>m.uid===prevUid) : null;

      // Lokal
      const already = state.team.findIndex(u=>u===uid);
      if(already>=0){ const back = state.team[i]; state.team[already] = back || null; }
      if(prevMon) prevMon.isInTeam = false;
      state.team[i] = uid; 
      mon.isInTeam = true; 
      selectedFromBoxUid = null;

      save(); renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
      const hint = $('#pickHint'); if (hint) hint.style.display = 'none';

      // Optimistic overlay + sync throttle
      if (route){
        pendingMarkSet(route, targetSlot);
        holdSync(NZ_POLL_MS + 600);
      }
      try {
        if (window.NZ && route) {
          await window.NZ.ensureJoined();
          await window.NZ.setRouteSlot(route, targetSlot);
          await window.NZ.upsertPokemon(route, toTitle(mon.name), true);
          nzSyncSoon(250);
        }
      } catch (err) {
        console.error('[NZ] drop sync failed:', err);
      }
    });

    // Click-to-place
    slot.addEventListener('click', async ()=>{
      if(!selectedFromBoxUid) return;
      const pick = state.box.find(m=>m.uid===selectedFromBoxUid);
      if(!pick) return;

      const targetSlot = i + 1;
      const route = pick.routeName || '';

      const prevUid = state.team[i];
      const prevMon = prevUid ? state.box.find(m=>m.uid===prevUid) : null;

      const already = state.team.findIndex(u=>u===pick.uid);
      if(already>=0){ const back = state.team[i]; state.team[already] = back || null; }
      if(prevMon) prevMon.isInTeam = false;
      state.team[i] = pick.uid; 
      pick.isInTeam = true; 
      selectedFromBoxUid = null;

      save(); renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
      const hint = $('#pickHint'); if (hint) hint.style.display = 'none';

      if (route){
        pendingMarkSet(route, targetSlot);
        holdSync(NZ_POLL_MS + 600);
      }
      try {
        if (window.NZ && route) {
          await window.NZ.ensureJoined();
          await window.NZ.setRouteSlot(route, targetSlot);
          await window.NZ.upsertPokemon(route, toTitle(pick.name), true);
          nzSyncSoon(250);
        }
      } catch (err) {
        console.error('[NZ] click sync failed:', err);
      }
    });

    // Remove-Button
    if (mon){
      slot.querySelector('[data-remove]').onclick = async ()=>{
        const route = mon.routeName;
        state.team[i] = null; 
        mon.isInTeam = false; 
        save(); renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();

        if (route){
          pendingMarkClear(route);
          holdSync(NZ_POLL_MS + 600);
        }
        try {
          if (window.NZ && route) {
            await window.NZ.ensureJoined();
            await window.NZ.clearRouteSlot(route);
            nzSyncSoon(250);
          }
        } catch (err) {
          console.error('[NZ] remove sync failed:', err);
        }
      };
    }

    wrap.appendChild(slot);
  }
}

function renderRouteGroups(){
  const holder = $('#routeGroups'); if(!holder) return;
  holder.innerHTML = '';
  const groups = {};
  state.team.forEach(uid=>{
    if(!uid) return; const mon = state.box.find(m=>m.uid===uid); if(!mon) return;
    groups[mon.routeName] = groups[mon.routeName] || []; groups[mon.routeName].push(mon);
  });
  const names = Object.keys(groups);
  if(names.length===0){ holder.innerHTML = '<p class="helper">Noch keine Team-Pokémon – keine Route-Verknüpfungen.</p>'; return; }
  names.sort().forEach(rn=>{
    const mons = groups[rn];
    const div = document.createElement('div');
    div.className = 'row';
    const list = mons.map(m=>`#${m.id} ${toTitle(m.name)}${m.nickname?` “${m.nickname}”`:''}`).join(', ');
    div.innerHTML = `<b>${rn}:</b> <span style="margin-left:6px">${list}</span>`;
    holder.appendChild(div);
  });
}

/* ---------- Simple local Lobby badge ---------- */
function renderLocalLobbyBadge(){
  const el = document.querySelector('#playerNameBadge');
if (el) el.textContent = state?.user?.name || '–';

  const list = $('#playersList'); if(!list) return;
  list.innerHTML = '';
  const me = document.createElement('div');
  me.className = 'player';
  me.innerHTML = `<span class="name">${state.user?.name || 'Unbekannt'}</span><span class="meta">(Host)</span>`;
  list.appendChild(me);
}

/* ---------- Import / Export ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download = `nuzlocke_${(state.user.name||'trainer').toLowerCase()}_${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
}
async function importData(file){
  const text = await file.text();
  try{
    const obj = JSON.parse(text);
    if(!obj || !obj.user || !obj.routes || !obj.box || !obj.team) throw new Error('Ungültiges Format');
    state = obj; save();
    renderRoutes(); renderEncounter(); renderBox(); renderTeam(); renderBoxDrawer(); renderRouteGroups(); renderLocalLobbyBadge();
    if (window.NZ) {
      try {
        await window.NZ.ensureJoined();
        const seen = new Set();
        const tasks = [];
        for (const m of state.box) {
          if (m.routeName && !seen.has(m.routeName)) {
            seen.add(m.routeName);
            tasks.push(window.NZ.upsertPokemon(m.routeName, toTitle(m.name), true));
          }
        }
        if (tasks.length) await Promise.all(tasks);
        nzSyncSoon(0);
      } catch(e) {
        console.warn("[NZ] bulk sync after import failed:", e);
      }
    }
    alert('Import erfolgreich.');
  }catch(e){ alert('Fehler beim Import: '+ e.message); }
}

/* ---------- Login ---------- */
function ensureLogin(){
  const overlay = $('#loginOverlay');
  const shouldShow = !state.user || !state.user.name;
  if(overlay){
    overlay.hidden = !shouldShow;
    overlay.style.display = shouldShow ? 'grid' : 'none';
    overlay.setAttribute('aria-hidden', String(!shouldShow));
  }
 
  const el = document.querySelector('#playerNameBadge');
if (el) el.textContent = state?.user?.name || '–';

}

/* ---------- Boot ---------- */
function boot(){
  load();
  $$('#tabs .tab-btn').forEach(btn=> btn.addEventListener('click',()=> setActiveTab(btn.dataset.tab)) );

  $('#addRouteBtn')?.addEventListener('click', ()=>{
    const name = $('#addRouteName').value.trim();
    if(!name) return;
    state.routes.push({ id: 'r'+uid(), name, encounter:{ status:'pending', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt:null } });
    save(); $('#addRouteName').value=''; renderRoutes();
  });

  $('#exportBtn')?.addEventListener('click', exportData);
  $('#importFile')?.addEventListener('change', e=>{ const f=e.target.files[0]; if(f) importData(f); e.target.value=''; });

  $('#startBtn')?.addEventListener('click', ()=>{
    const name = $('#trainerName').value.trim();
    if(!name) return alert('Bitte gib einen Namen ein.');
    state.user.name = name; save(); ensureLogin();
  });

  renderRoutes(); renderEncounter(); renderBox(); renderTeam(); renderBoxDrawer(); renderRouteGroups(); renderLocalLobbyBadge(); ensureLogin();
  ensurePokedex().then(()=>{ renderEncounter(); save(); }).catch(()=>{});
}
boot();

/* ==========================================================
   Multiplayer (only #nz-lobby and #nz-allteams; no duplicate UI)
   ========================================================== */
const NZ_API = "/api/nuzlocke";
const NZ_HEARTBEAT_MS = 15000;
const NZ_POLL_MS = 3000; // a bit faster

let nzPlayerId   = localStorage.getItem("playerId")   || "";
let nzPlayerName = localStorage.getItem("playerName") || "";
let nzLobbyCode  = (new URL(location.href)).searchParams.get("code")
                || localStorage.getItem("lobbyCode")
                || "";

const elLobbyPane = $("#nz-lobby");
const elAllTeams  = $("#nz-allteams");

/* Caches */
let nzLastRouteSlotsByPlayer = new Map(); // Map<playerId, Map<route,slot>>
let nzLastRouteSlots = new Map();        // Map<route,slot> for ME only

/* Helpers */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

let _nzSyncTimer = null;
function nzSyncSoon(delay = 250){
  if (_nzSyncTimer) clearTimeout(_nzSyncTimer);
  _nzSyncTimer = setTimeout(nzSync, delay);
}

/* --- API helpers --- */
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
  const t = await r.text();
  throw new Error(`HTTP ${r.status} ${t}`);
}

/* --- Lobby render --- */
function nzRenderLobby(st){
  if (!elLobbyPane) return;
  const online = (st.players||[]).filter(p=>p.online).length;
  elLobbyPane.innerHTML = `
    <div class="row" style="margin:.5rem 0">
      <label>Lobby-Code:</label>
      <input id="nzCode" style="text-transform:uppercase" value="${esc(nzLobbyCode || st.code || "")}" placeholder="ABC123">
      <label>Name:</label>
      <input id="nzName" value="${esc(nzPlayerName || "")}" placeholder="Name">
      <button id="nzCreate" class="btn">Erstellen</button>
      <button id="nzJoin" class="btn">${nzPlayerId ? "Verbinden" : "Beitreten"}</button>
      <span class="helper">Link: <code>${esc(location.origin+location.pathname)}?code=${esc(nzLobbyCode||st.code||"")}</code></span>
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
    nzPlayerName = nm; localStorage.setItem("playerName", nm);
    const j = await nzApi("joinLobby", { name:nm, code:"" });
    nzPlayerId = j.player.id; nzLobbyCode = j.code;
    localStorage.setItem("playerId", nzPlayerId);
    localStorage.setItem("lobbyCode", nzLobbyCode);
    history.replaceState(null,"",`?code=${nzLobbyCode}`);
    nzSyncSoon(0);
  };

  elLobbyPane.querySelector("#nzJoin").onclick = async ()=>{
    const nm = elLobbyPane.querySelector("#nzName").value.trim() || "Spieler";
    nzPlayerName = nm; localStorage.setItem("playerName", nm);
    const cd = (elLobbyPane.querySelector("#nzCode").value.trim() || "").toUpperCase();
    if (!cd) return alert("Bitte Lobby-Code eingeben");
    nzLobbyCode = cd; localStorage.setItem("lobbyCode", nzLobbyCode);

    if (nzPlayerId) {
      await nzApi("rejoinLobby", { playerId: nzPlayerId, name: nzPlayerName, code: nzLobbyCode });
    } else {
      const j = await nzApi("joinLobby", { name: nzPlayerName, code: nzLobbyCode });
      nzPlayerId = j.player.id; localStorage.setItem("playerId", nzPlayerId);
    }
    history.replaceState(null,"",`?code=${nzLobbyCode}`);
    nzSyncSoon(0);
  };
}

/* --- All Teams render (per-player slots, with sprites) --- */
function nzRenderAllTeams(st){
  if (!elAllTeams) return;

  const routeSlotsByPlayer = new Map(); // playerId -> Map<slot, route>
  for (const rs of (st.routeSlots || [])){
    const pid = Number(rs.playerId ?? rs.player_id);
    if (!routeSlotsByPlayer.has(pid)) routeSlotsByPlayer.set(pid, new Map());
    routeSlotsByPlayer.get(pid).set(Number(rs.slot), rs.route);
  }

  const spriteFor = (species) => {
    if (!species) return null;
    if (!pokedexReady) return null;
    const p = pokedex.find(x => x.name === String(species).toLowerCase());
    return p ? SPRITE(p.id) : null;
  };

  const players = st.players || [];
  const htmlPlayers = players.map(p => {
    const box = (st.boxes || {})[p.id] || {};
    const slotMap = routeSlotsByPlayer.get(p.id) || new Map();

    const cells = [1,2,3,4,5,6].map(s => {
      const rt = slotMap.get(s) || null;
      const mon = rt ? box[rt] : null;
      if (!mon) {
        return `<div class="tcell"><div class="ghost">—</div></div>`;
      }
      const sprite = spriteFor(mon.species);
      if (sprite) {
        return `
          <div class="tcell">
            <div class="poke-card">
              <div class="poke-top">
                <div>
                  <div class="poke-name">${toTitle(mon.species)}</div>
                  <div class="tag">${rt}</div>
                </div>
              </div>
              <div class="poke-sprite"><img alt="${toTitle(mon.species)}" src="${sprite}"></div>
            </div>
          </div>`;
      }
      return `
        <div class="tcell">
          <div class="tmeta">
            <div class="route">${rt}</div>
            <div class="mon">${toTitle(mon.species)}${mon.caught ? "" : " (nicht gefangen)"}</div>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="player-team">
        <div class="pname">Team: ${esc(p.name)}${p.online ? " <span style='opacity:.65'>(online)</span>" : ""}</div>
        <div class="trow">${cells}</div>
      </div>`;
  }).join("");

  elAllTeams.innerHTML = `
    <style>
      #nz-allteams{margin:1rem 0}
      #nz-allteams .player-team{margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid rgba(255,255,255,.08)}
      #nz-allteams .pname{font-weight:800;margin:.4rem 0 .6rem}
      #nz-allteams .trow{display:grid;grid-template-columns:repeat(6,minmax(140px,1fr));gap:.75rem}
      #nz-allteams .tcell{min-height:160px}
      #nz-allteams .ghost{opacity:.5;display:grid;place-items:center;height:100%;border:1px dashed rgba(255,255,255,.2);border-radius:12px}
      #nz-allteams .tmeta{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:.5rem;background:#0b1433}
    </style>
    ${htmlPlayers || "<i>noch keine Spieler</i>"}
  `;
}

/* --- Global (server) -> Local (my UI) --- */
function nzApplyGlobalToLocal(){
  if (Date.now() < nzLocalHoldUntil) return; // don't overwrite while we just wrote
  if (!state || !Array.isArray(state.team) || !Array.isArray(state.box)) return;

  // use my last route->slot map (already overlayed in nzSync)
  const r2s = new Map(nzLastRouteSlots);
  const uidByRoute = new Map(state.box.map(m => [m.routeName, m.uid]));

  const newTeam = [null,null,null,null,null,null];
  for (const [route, slot] of r2s.entries()) {
    if (slot >= 1 && slot <= 6) newTeam[slot-1] = uidByRoute.get(route) || null;
  }

  state.box.forEach(m => { m.isInTeam = false; });
  newTeam.forEach(uid => {
    const mon = state.box.find(m => m.uid === uid);
    if (mon) mon.isInTeam = true;
  });

  const changed = newTeam.some((v, i) => v !== state.team[i]);
  if (changed) {
    state.team = newTeam;
    try {
      save(); renderTeam(); renderRouteGroups(); renderBox(); renderBoxDrawer();
    } catch(_) {}
  }
}

/* --- Heartbeat & Sync --- */
async function nzHeartbeat(){
  if (nzPlayerId && nzLobbyCode) {
    try { await nzApi("heartbeat", { playerId: nzPlayerId, code: nzLobbyCode }); } catch{}
  }
}

async function nzSync(){
  if (!nzLobbyCode) { nzRenderLobby({ code:"", players:[] }); return; }
  try {
    const st = await nzListState(nzLobbyCode);

    // Build perPlayer map: playerId -> Map<route,slot>
    const perPlayer = new Map();
    for (const rs of (st.routeSlots || [])) {
      const pid = String(rs.playerId ?? rs.player_id ?? "");
      if (!pid) continue;
      if (!perPlayer.has(pid)) perPlayer.set(pid, new Map());
      perPlayer.get(pid).set(rs.route, Number(rs.slot));
    }

    // pending overlay for me
    pendingPrune();
    const myIdStr = String(nzPlayerId);
    const myMap = perPlayer.get(myIdStr) || new Map();
    for (const [r, _exp] of nzPendingClear) myMap.delete(r);
    for (const [r, v] of nzPendingSet) myMap.set(r, v.slot);
    perPlayer.set(myIdStr, myMap);

    // caches
    nzLastRouteSlotsByPlayer = perPlayer;
    nzLastRouteSlots = new Map(perPlayer.get(myIdStr) || []);

    // render + apply
    nzRenderLobby(st);
    nzRenderAllTeams(st);
    nzApplyGlobalToLocal();
  } catch(e) {
    console.error("[NZ] sync failed:", e);
  }
}

setInterval(nzHeartbeat, NZ_HEARTBEAT_MS);
setInterval(nzSync, NZ_POLL_MS);

/* --- Auto-Join on ?code= --- */
(async()=>{
  const urlCode = (new URL(location.href)).searchParams.get("code");
  if (urlCode) { nzLobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", nzLobbyCode); }
  if (nzLobbyCode && !nzPlayerId) {
    const nm = (state?.user?.name || nzPlayerName || prompt("Dein Name?") || "Spieler").trim();
    nzPlayerName = nm; localStorage.setItem("playerName", nm);
    const j = await nzApi("joinLobby", { name:nm, code:nzLobbyCode });
    nzPlayerId = j.player.id; localStorage.setItem("playerId", nzPlayerId);
  }
  nzSyncSoon(0);
})();

/* --- Public hooks --- */
window.NZ = {
  async ensureJoined(){
    if (!nzLobbyCode) {
      const urlCode = (new URL(location.href)).searchParams.get("code");
      if (urlCode) { nzLobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", nzLobbyCode); }
    }
    if (!nzPlayerId) {
      const nm = (state?.user?.name || nzPlayerName || prompt("Dein Name?") || "Spieler").trim();
      nzPlayerName = nm; localStorage.setItem("playerName", nm);
      const j = await nzApi("joinLobby", { name: nm, code: nzLobbyCode || "" });
      nzPlayerId = j.player.id;
      nzLobbyCode = j.code || nzLobbyCode || "";
      localStorage.setItem("playerId", nzPlayerId);
      if (nzLobbyCode) {
        localStorage.setItem("lobbyCode", nzLobbyCode);
        history.replaceState(null, '', `?code=${nzLobbyCode}`);
      }
      return;
    }
    if (nzLobbyCode) {
      try { await nzApi("rejoinLobby", { playerId: nzPlayerId, name: (nzPlayerName || state?.user?.name || "Spieler"), code: nzLobbyCode }); } catch(_) {}
    }
  },

  async upsertPokemon(route, species, caught=true){
    await this.ensureJoined();
    // normalize species to lowercase for backend
    await nzApi('upsertPokemon', { code: nzLobbyCode, playerId: nzPlayerId, route, species: String(species||'').toLowerCase(), caught });
  },

  // legacy alias
  async assignGlobalSlot(route, slot){ return this.setRouteSlot(route, slot); },

  async clearRouteSlot(route){
    await this.ensureJoined();
    pendingMarkClear(route);
    holdSync(NZ_POLL_MS + 600);
    try {
      await nzApi('clearRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route });
      nzSyncSoon(200);
    } catch (e) {
      if (!/unknown|unsupported|not found/i.test(String(e.message || ""))) {
        throw e;
      }
    }
  },

  // Idempotent: sets Route → Slot (player-scoped) and updates caches
  async setRouteSlot(route, targetSlot){
    await this.ensureJoined();
    if (!(targetSlot >= 1 && targetSlot <= 6)) throw new Error("slot must be 1..6");

    // optimistic
    pendingMarkSet(route, targetSlot);
    holdSync(NZ_POLL_MS + 600);
    nzLastRouteSlots.set(route, targetSlot);

    // try assign; handle uniques gracefully
    try {
      await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
    } catch (e1) {
      const msg = String(e1.message || "");
      if (/duplicate|unique|exists/i.test(msg)) {
        try {
          await nzApi('updateRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
        } catch (e2) {
          try {
            await nzApi('upsertRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
          } catch (e3) {
            // last resort
            try {
              await nzApi('clearRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route });
              await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
            } catch (e4) {
              throw e4;
            }
          }
        }
      } else {
        throw e1;
      }
    }
    nzSyncSoon(150);
  },

  async syncNow(){ nzSyncSoon(0); },

  get me(){ return { playerId: nzPlayerId, playerName: nzPlayerName, lobbyCode: nzLobbyCode } }
};

/* --- Ensure drag carries route name --- */
document.addEventListener("dragstart", e => {
  const card = e.target?.closest?.("[data-uid]");
  if (!card || !state?.box) return;
  const u = card.getAttribute("data-uid");
  const mon = state.box.find(m => m.uid === u);
  if (!mon) return;
  try {
    card.setAttribute("data-route", mon.routeName);
    e.dataTransfer?.setData?.("text/route", mon.routeName);
  } catch {}
}, true);
