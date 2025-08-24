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
let renderLock = false;
/* Race-Guard: während wir aktiv zum Server schreiben, nicht sofort vom Server zurückspiegeln */
let nzLocalHoldUntil = 0;
function holdSync(ms = 1500){ nzLocalHoldUntil = Date.now() + ms; }

/* ---------- POKEDEX ANFANG (ohne nzApi, mit Types) ---------- */
const POKEDEX_KEY = 'nuz_pokedex_v2'; // gleiches Key wie vorher, wir erkennen alte Caches ohne "types"
let pokedex = [];                      // Arbeitsspeicher
let pokedexLoadPromise = null;         // Dedupe paralleler Loads
let pokedexTypesLoadPromise = null;    // Dedupe Typ-Hydration

function loadPokedexFromLocal(){
  try{
    const raw = localStorage.getItem(POKEDEX_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null; // kompatibel zu altem Format
  }catch{ return null; }
}
function savePokedexToLocal(list){
  localStorage.setItem(POKEDEX_KEY, JSON.stringify(list));
}
function listNeedsTypes(list){
  return Array.isArray(list) && list.some(e => !Array.isArray(e.types) || e.types.length === 0);
}

// --- Typen direkt aus der PokéAPI holen (ohne nzApi)
async function fetchTypesFor(idOrName){
  try{
    const resp = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(String(idOrName).toLowerCase())}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.types || []).map(t => t.type?.name).filter(Boolean);
  }catch{ return []; }
}

// --- Einmalige Typ-Hydration für Einträge, denen "types" fehlen (rate-limit-freundlich)
async function ensurePokedexTypesIfMissing({ concurrency = 24 } = {}){
  if (!Array.isArray(pokedex) || !pokedex.length) return pokedex;
  const missing = pokedex.filter(e => !Array.isArray(e.types) || e.types.length === 0);
  if (missing.length === 0) {
    console.log('[pokedex-types] loaded (all cached)');
    return pokedex;
  }
  if (pokedexTypesLoadPromise){
    console.log('[pokedex-types] loading already in progress (dedupe)…');
    return pokedexTypesLoadPromise;
  }

  console.log('[pokedex-types] not loaded -> fetching types for', missing.length, 'entries…');
  pokedexTypesLoadPromise = (async () => {
    for (let i = 0; i < missing.length; i += concurrency) {
      const batch = missing.slice(i, i + concurrency);
      await Promise.all(batch.map(async e => {
        const key = String(e.id || e.name).toLowerCase();
        const types = await fetchTypesFor(key);
        if (types.length) e.types = types;
      }));
      // zwischenspeichern & kleine Pause gegen Ratelimits
      savePokedexToLocal(pokedex);
      await new Promise(r => setTimeout(r, 120));
    }
    savePokedexToLocal(pokedex);
    document.dispatchEvent(new CustomEvent('nz:pokedex-types-ready'));
    console.log('[pokedex-types] loaded (hydrated all missing types)');
    return pokedex;
  })();

  try { return await pokedexTypesLoadPromise; }
  finally { pokedexTypesLoadPromise = null; }
}

// Beim Start: vorhandenen Cache übernehmen; falls ohne Types, im Hintergrund nachladen
(function initPokedexFromLocal(){
  const local = loadPokedexFromLocal();
  if (local && local.length){
    pokedex = local;
    console.log('[pokedex] loaded (init/localStorage):', pokedex.length);
    if (listNeedsTypes(pokedex)) ensurePokedexTypesIfMissing().catch(console.warn);
  } else {
    console.log('[pokedex] not loaded at init (no cache)');
  }
})();

// Nur laden, wenn NICHT vorhanden; zieht dabei direkt die Types mit (einmalig)
async function ensurePokedexIfMissing(){
  // 1) Im Speicher?
  if (Array.isArray(pokedex) && pokedex.length){
    console.log('[pokedex] loaded (memory):', pokedex.length);
    if (listNeedsTypes(pokedex)) ensurePokedexTypesIfMissing().catch(console.warn);
    return pokedex;
  }
  // 2) localStorage?
  const local = loadPokedexFromLocal();
  if (local && local.length){
    pokedex = local;
    console.log('[pokedex] loaded (localStorage):', pokedex.length);
    if (listNeedsTypes(pokedex)) ensurePokedexTypesIfMissing().catch(console.warn);
    return pokedex;
  }
  // 3) Lädt bereits?
  if (pokedexLoadPromise){
    console.log('[pokedex] loading already in progress (dedupe)…');
    return pokedexLoadPromise;
  }

  // 4) Nicht vorhanden → jetzt komplette Liste inkl. Types laden (einmalig)
  console.log('[pokedex] not loaded -> fetching index + types (one-time)…');
  pokedexLoadPromise = (async () => {
    try{
      // Index laden (Namen + URLs)
      const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
      const data = await res.json();
      const base = (data.results || [])
        .map(x => {
          const m = x.url.match(/pokemon\/(\d+)\/?$/);
          return { id: m ? Number(m[1]) : null, name: x.name };
        })
        .filter(x => x.id);

      // Details nur für Types nachziehen, rate-limit-freundlich
      const out = [];
      const concurrency = 24;
      for (let i = 0; i < base.length; i += concurrency) {
        const batch = base.slice(i, i + concurrency);
        const filled = await Promise.all(batch.map(async e => {
          const types = await fetchTypesFor(e.id);
          return { ...e, types };
        }));
        out.push(...filled);
        // zwischenspeichern, damit Fortschritt nicht verloren geht
        savePokedexToLocal(out);
        await new Promise(r => setTimeout(r, 120));
      }

      pokedex = out;
      savePokedexToLocal(pokedex);
      console.log('[pokedex] loaded (network, with types):', pokedex.length);
      document.dispatchEvent(new CustomEvent('nz:pokedex-ready', { detail:{ count: pokedex.length }}));
      return pokedex;

    } catch (e){
      console.warn('[pokedex] fetch failed, using fallback:', e);
      pokedex = [
        {id:1,name:'bulbasaur', types:['grass','poison']},
        {id:4,name:'charmander', types:['fire']},
        {id:7,name:'squirtle', types:['water']},
        {id:10,name:'caterpie', types:['bug']},
        {id:16,name:'pidgey', types:['normal','flying']},
        {id:19,name:'rattata', types:['normal']},
        {id:25,name:'pikachu', types:['electric']},
        {id:35,name:'clefairy', types:['fairy']},
        {id:39,name:'jigglypuff', types:['normal','fairy']},
        {id:52,name:'meowth', types:['normal']},
        {id:54,name:'psyduck', types:['water']},
        {id:63,name:'abra', types:['psychic']},
        {id:66,name:'machop', types:['fighting']},
        {id:74,name:'geodude', types:['rock','ground']},
        {id:77,name:'ponyta', types:['fire']},
        {id:81,name:'magnemite', types:['electric','steel']},
        {id:92,name:'gastly', types:['ghost','poison']},
        {id:95,name:'onix', types:['rock','ground']},
        {id:98,name:'krabby', types:['water']},
        {id:116,name:'horsea', types:['water']},
        {id:129,name:'magikarp', types:['water']},
        {id:133,name:'eevee', types:['normal']},
        {id:143,name:'snorlax', types:['normal']},
        {id:147,name:'dratini', types:['dragon']}
      ];
      return pokedex;
    } finally {
      pokedexLoadPromise = null;
    }
  })();

  return pokedexLoadPromise;
}

// Aufruf wie vorher (UI rendert; falls alter Cache, kommen die Types im Hintergrund via Event):
ensurePokedexIfMissing()
  .then(()=>{ renderEncounter(); save(); })
  .catch(()=>{});

document.addEventListener('nz:pokedex-types-ready', () => {
  // Falls alter Cache ohne Types nachhydriert wurde:
  renderEncounter?.();
  renderBox?.();
  renderBoxDrawer?.();
  save?.();
});


/* ---------- POKEDEX ENDE ---------- */

/* ---------- Persistence ---------- */
const LS_KEY = 'nuzlocke_state_v1';


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

function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function load(){ const s = localStorage.getItem(LS_KEY); state = s ? JSON.parse(s) : EMPTY_STATE(); }



/* ---------- Tabs ---------- */
function setActiveTab(tab){
  $$('#tabs .tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.id === `panel-${tab}`));
}

/* ---------- Routes ---------- */
let currentRouteId = null;

function renderRoutes(){
  const wrap = $('#routesList'); wrap.innerHTML = '';
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
  if(!rt){ pane.innerHTML = '<p class="helper">Wähle links eine Route.</p>'; return; }
  const e = rt.encounter;

  const listHtml = pokedex.slice(0,1025).map(p=>`<option value="${toTitle(p.name)}" data-id="${p.id}"></option>`).join('');
  const hasMon = !!e.pokemonId;

  pane.innerHTML = `
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
    $('#encSprite').innerHTML = chosen? `<img alt="${toTitle(chosen.name)}" src="${sprite}">` : '—';
  }
  search.addEventListener('input', updatePreview);

  btnCaught.onclick = ()=>{
    const chosen = resolvePokemon(search.value);
    if(!chosen) { alert('Bitte ein gültiges Pokémon auswählen.'); return; }
    rt.encounter = {
      status:'caught', pokemonId: chosen.id, pokemonName: chosen.name, sprite: SPRITE(chosen.id), nickname: nick.value.trim(), updatedAt: now()
    };
    const exists = state.box.find(m=>m.routeName===rt.name);
    if(!exists){
      state.box.push({ uid:uid(), id:chosen.id, name:chosen.name, sprite:SPRITE(chosen.id), routeName:rt.name, nickname:nick.value.trim(), caughtAt:now(), isInTeam:false,
      lobbyCode: currentLobbyCode()    // ⬅️ neu
     });
    }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();

    // Server: species für "All Teams" aktualisieren
    if (window.NZ) window.NZ.upsertPokemon(rt.name, toTitle(chosen.name), true).catch(console.error);
  };

  btnFailed.onclick = ()=>{
    rt.encounter = { status:'failed', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt: now() };
    const idx = state.box.findIndex(m=>m.routeName===rt.name && !m.isInTeam);
    if(idx>=0){ state.box.splice(idx,1); }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();
  };

  btnClear.onclick = ()=>{
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
    const code = currentLobbyCode();
    const mons = state.box.filter(m => !code ? true : m.lobbyCode === code);  // ⬅️ Filter
    mons.forEach(mon => {
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
      ${mon.isInTeam ? (() => {
        const placed = placedLabelForRoute(mon.routeName);
        return `<div class="ribbon">Gepicked von: ${placed ? '  ' + placed : ''}</div>`;
      })() : ''}
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
      if(el){ el.classList.add('selected'); setTimeout(()=>el.classList.remove('selected'), 1000); }
      $('#pickHint').style.display = 'block';
    });
    grid.appendChild(card);
  });
}

/* ---------- Box Tab ---------- */
function renderBox(){
    const grid = $('#boxGrid'); if(!grid) return;
    grid.innerHTML = '';
    const code = currentLobbyCode();
    const mons = state.box.filter(m => !code ? true : m.lobbyCode === code);  // ⬅️ Filter
    mons.forEach(mon => {
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
      if(el){ el.classList.add('selected'); el.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>el.classList.remove('selected'), 1000); }
      $('#pickHint').style.display = 'block';
    });
    grid.appendChild(card);
  });
}

/* ---------- Team ---------- */
function renderTeam(){
    if (renderLock) {
        console.log("⏳ renderTeam() ist gerade gesperrt...");
        return;
      }
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
      
      console.warn('[NZ] drop event:', e);
      e.preventDefault(); slot.classList.remove('over');
      const uid = e.dataTransfer.getData('text/plain');
      const mon = state.box.find(m=>m.uid===uid);
      if(!mon) return;

      const targetSlot = i + 1;
      const route = mon.routeName || e.dataTransfer.getData('text/route') || '';

      // Vorheriger Inhalt in DIESEM Slot
      const prevUid = state.team[i];
      const prevMon = prevUid ? state.box.find(m=>m.uid===prevUid) : null;
      const prevRoute = prevMon?.routeName || null;

      // Lokal updaten
      const already = state.team.findIndex(u=>u===uid);
      if(already>=0){
        const back = state.team[i];
        state.team[already] = back || null;
      }
      if(prevMon) prevMon.isInTeam = false;
      state.team[i] = uid; 
      mon.isInTeam = true; 
      selectedFromBoxUid = null;

      save(); 
      renderTeam(); 
      renderBox(); 
      renderBoxDrawer(); 
      renderRouteGroups();
      renderLock = true;
      $('#pickHint').style.display = 'none';

      // Server: idempotent & atomisch
      // --- Server: idempotent & atomisch
try {
    if (window.NZ && route) {
      await window.NZ.ensureJoined();
      holdSync(1500);
  
      // Route→Slot setzen (robust)
      await window.NZ.setRouteSlot(route, targetSlot);
      // species/caught updaten
      await window.NZ.upsertPokemon(route, toTitle(mon.name), true);
  
      await window.NZ.syncNow?.();
      renderLock = false;
      renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
      console.log("🔓 renderTeam() ist wieder freigegeben.");

    }
  } catch (err) {
    console.error('[NZ] drop sync failed:', err);
    renderLock = false;
    renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
    console.log("🔓 renderTeam() ist wieder freigegeben.");
  }
    });

    // Click-to-place
    slot.addEventListener('click', async ()=>{
      if(!selectedFromBoxUid) return;
      const pick = state.box.find(m=>m.uid===selectedFromBoxUid);
      if(!pick) return;

      const targetSlot = i + 1;
      const route = pick.routeName || '';

      // Vorheriger Inhalt
      const prevUid = state.team[i];
      const prevMon = prevUid ? state.box.find(m=>m.uid===prevUid) : null;
      const prevRoute = prevMon?.routeName || null;

      // Lokal
      const already = state.team.findIndex(u=>u===pick.uid);
      if(already>=0){
        const back = state.team[i];
        state.team[already] = back || null;
      }
      if(prevMon) prevMon.isInTeam = false;
      state.team[i] = pick.uid; 
      pick.isInTeam = true; 
      selectedFromBoxUid = null;

      save(); renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
      $('#pickHint').style.display = 'none';

      // Server
      try {
        if (window.NZ && route) {
          await window.NZ.ensureJoined();
          holdSync(1500);
      
          await window.NZ.setRouteSlot(route, targetSlot);
          await window.NZ.upsertPokemon(route, toTitle(pick.name), true);
      
          await window.NZ.syncNow?.();
        }
      } catch (err) {
        console.error('[NZ] click sync failed:', err);
      }
    });

    // Remove-Button
    if (mon){
      slot.querySelector('[data-remove]').onclick = async ()=>{
        console.warn('[NZ] remove button clicked:', mon);
        const route = mon.routeName;
        if(nzPlayerName !== placedLabelForRoute(route)){
            alert('Du kannst nur Pokémon entfernen, die du selbst in dein Team gepickt hast.');
            return;
        }
        state.team[i] = null; 
        mon.isInTeam = false; 
        save(); renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
        renderLock = true;
        try {
          if (window.NZ && route) {
            await window.NZ.ensureJoined();
            holdSync(1000);
            console.warn('[NZ] removing route slot:', route);
            await window.NZ.clearRouteSlot(route);
            await window.NZ.syncNow?.();
            renderLock = false;
            renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
            console.log("🔓 renderTeam() ist wieder freigegeben.");
          }
        } catch (err) {
          console.error('[NZ] remove sync failed:', err);
          renderLock = false;
          renderTeam(); renderBox(); renderBoxDrawer(); renderRouteGroups();
          console.log("🔓 renderTeam() ist wieder freigegeben.");
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

/* ---------- Simple local Lobby badge (unabhängig vom Multiplayer-UI) ---------- */
function renderLocalLobbyBadge(){
  $('#playerNameBadge').textContent = state.user?.name || '–';
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
    // Nach Import: Box → Server spiegeln
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
        await window.NZ.syncNow?.();
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
  $('#playerNameBadge').textContent = state.user?.name || '–';
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
 

  // ADDONS Für BOOT LOAD --> FIX Damit die BoxDrawer-UI mit Picks der Namen initialisiert wird
  setTimeout(()=>{ renderBoxDrawer(); }, 3000); // Lokale Lobby-Badge initialisieren
  // am Ende von boot(), irgendwo nach ensureLogin() / ensurePokedex():


}
boot();

/* ==========================================================
   Multiplayer (nur #nz-lobby und #nz-allteams; keine Doppel-UI)
   ========================================================== */
const NZ_API = "/api/nuzlocke";
const NZ_HEARTBEAT_MS = 15000;
const NZ_POLL_MS = 4000;

let nzPlayerId   = localStorage.getItem("playerId")   || "";
let nzPlayerName = localStorage.getItem("playerName") || "";
let nzLobbyCode  = (new URL(location.href)).searchParams.get("code")
                || localStorage.getItem("lobbyCode")
                || "";

const elLobbyPane = $("#nz-lobby");
const elAllTeams  = $("#nz-allteams");

// Cache: letzter bekannter Server-Stand route -> slot
let nzLastRouteSlots = new Map();

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

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
  const t = await r.text();
  throw new Error(`HTTP ${r.status} ${t}`);
}

// --- Lobby render ---
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
    await wipeRoutesAndReloadFromServer();   // ⬅️ HIER WERDEN DIE ROUTEN GELÖSCHT
    await nzSync();
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
    await wipeRoutesAndReloadFromServer();   // ⬅️ HIER
    await nzSync();
  };
}

// --- All Teams render (Sprites wie in der Box) ---
function nzRenderAllTeams(st){
  if (!elAllTeams) return;

  // route -> slot
  const byRoute = new Map((st.routeSlots || []).map(r => [r.route, r.slot]));
  const routeOf = s => { for (const [rt, sl] of byRoute.entries()) if (sl === s) return rt; return null; };

  const spriteFor = (species) => {
    if (!species || !Array.isArray(pokedex) || pokedex.length === 0) return null;
    const p = pokedex.find(x => x.name === String(species).toLowerCase());
    return p ? SPRITE(p.id) : null;
  };

  const players = st.players || [];
  const htmlPlayers = players.map(p => {
    const box = (st.boxes || {})[p.id] || {};
    const cells = [1,2,3,4,5,6].map(s => {
      const rt = routeOf(s);
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

// --- Global → Local spiegeln ---
function nzApplyGlobalToLocal(st){
  if (Date.now() < nzLocalHoldUntil) return; // Race-Guard aktiv → nicht überschreiben
  if (!state || !Array.isArray(state.team) || !Array.isArray(state.box)) return;

  const r2s = new Map((st.routeSlots||[]).map(x => [x.route, x.slot]));
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

    // ▼ zusätzlich merken --> Anzeige des momentanen Picks in der Lobby
    window.nzLastListState = st;

    // Cache: letzter Stand route->slot (für Idempotenzcheck)
    nzLastRouteSlots = new Map((st.routeSlots || []).map(x => [x.route, x.slot]));
    nzRenderLobby(st);
    nzRenderAllTeams(st);
    nzApplyGlobalToLocal(st);
  } catch(e) {
    console.error("[NZ] sync failed:", e);
  }
}
setInterval(nzHeartbeat, NZ_HEARTBEAT_MS);
setInterval(nzSync, NZ_POLL_MS);

// --- Auto-Join bei ?code= ---
(async()=>{
  const urlCode = (new URL(location.href)).searchParams.get("code");
  if (urlCode) { nzLobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", nzLobbyCode); }
  if (nzLobbyCode && !nzPlayerId) {
    const nm = (state?.user?.name || nzPlayerName || prompt("Dein Name?") || "Spieler").trim();
    nzPlayerName = nm; localStorage.setItem("playerName", nm);
    const j = await nzApi("joinLobby", { name:nm, code:nzLobbyCode });
    nzPlayerId = j.player.id; localStorage.setItem("playerId", nzPlayerId);
    await wipeRoutesAndReloadFromServer(); // ⬅️ HIER
  }
  await nzSync();
})();

// --- Öffentliche Hooks ---
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

  async upsertPokemon(route, species, caught=true, nickname=getnickname()){
    await this.ensureJoined();
    await nzApi('upsertPokemon', {
        code: nzLobbyCode,          // <— wird gesendet
        playerId: nzPlayerId,
        route,
        species,
        caught,
        nickname
      });
  },

  async assignGlobalSlot(route, slot){
    await this.ensureJoined();
    await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot });
  },

  // ❌ ALT: clearRouteSlot(...) hatte Fallback mit slot:null/0
// ✅ NEU:
async clearRouteSlot(route){
    await this.ensureJoined();
    // Nur die dedizierte Action versuchen; wenn es sie nicht gibt, lassen wir es bleiben.
    console.warn("[NZ] clearRouteSlot", route, nzLobbyCode);
    try {
        console.warn("nzLobbyCode", nzLobbyCode);
        console.warn("nzPlayerId", nzPlayerId);
        console.warn("nzPlayerId", route);
      await nzApi('clearRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route });
    } catch (e) {
        console.error("FEHLER! clearRouteSlot:", e);
      // Wenn dein Backend die Action nicht kennt oder sie optional ist, ignorieren wir das.
      // Wichtig: KEIN assignRouteSlot mit null/0 mehr!
      if (!/unknown|unsupported|not found/i.test(String(e.message || ""))) {
        throw e;
      }
    }
  },
  
// Idempotent: setzt Route → Slot, räumt vorher den Ziel-Slot, und umgeht "duplicate key"
async setRouteSlot(route, targetSlot){
    console.warn("[NZ] setRouteSlot", route, targetSlot);
    console.warn("[NZ] LobbyCode", nzLobbyCode);
    await this.ensureJoined();
    if (!(targetSlot >= 1 && targetSlot <= 6)) throw new Error("slot must be 1..6");
  
    // 1) Falls Route schon im Zielslot: fertig
    if (nzLastRouteSlots.get(route) === targetSlot) return;
  
    // 2) Wer liegt laut letztem Serverstand im Zielslot? (kann leer sein)
    let routeAtTarget = null;
    for (const [rt, sl] of nzLastRouteSlots.entries()){
      if (sl === targetSlot) { routeAtTarget = rt; break; }
    }
    // Zielslot freiräumen (best effort)
    if (routeAtTarget && routeAtTarget !== route) {
      try { await this.clearRouteSlot(routeAtTarget); } catch (_) {}
    }
  
    // 3) Setzen – robust gegen "duplicate key"
    try {
      await nzApi('assignRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
    } catch (e1) {
      const msg = String(e1.message || "");
      if (/duplicate|unique|exists/i.test(msg)) {
        // Versuch per UPDATE/UPSERT
        try {
          await nzApi('updateRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
        } catch (e2) {
          try {
            await nzApi('upsertRouteSlot', { code: nzLobbyCode, playerId: nzPlayerId, route, slot: targetSlot });
          } catch (e3) {
            // letzter Versuch: aktuelle Route löschen → dann normal setzen
            try {
              await this.clearRouteSlot(route);
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
  
    // 4) lokalen Cache aktualisieren
    nzLastRouteSlots.set(route, targetSlot);
  },
  
  async syncNow(){ await nzSync(); },

  get me(){ return { playerId: nzPlayerId, playerName: nzPlayerName, lobbyCode: nzLobbyCode } }
};

/* --- Fallback: dragstart stellt sicher, dass die Route immer mitgegeben wird --- */
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

//Utility-Funktionen
// Wird benutzt um den User zu bekommen für die jeweilige Route, also der Pick für die Box
function placedLabelForRoute(route){
    const st = window.nzLastListState || {};
    const row = (st.routeSlots || []).find(r => r.route === route);
    const pid = row?.player_id ?? row?.playerId;
    if (!pid) return null;
  
    const p = (st.players || []).find(p => (p.id === pid || p.player_id === pid));
    return p ? (p.name || p.username || p.display_name || String(pid)) : String(pid);
  }
  

// TOOLS
function getnickname(){
  return nickname.value.trim() || null;
}
function currentLobbyCode(){
    return (window.NZ?.me?.lobbyCode) || localStorage.getItem('lobbyCode') || "";
  }

  // stabile ID aus dem Namen (damit Encounter-Struktur passt)
function routeIdFromName(name){
    let h = 0;
    for (let i=0; i<name.length; i++) h = (h*31 + name.charCodeAt(i)) | 0;
    return 'r' + Math.abs(h);
  }


  // ROUTES AND CLEAR POKEMONS ON JOIN
  function applyServerRoutes(serverRoutes){
    if (!serverRoutes || !serverRoutes.length) return;
  
    // Normalisieren: Array<string> oder Array<{name, ord?}>
    const server = serverRoutes.map(r =>
      typeof r === 'string' ? { name: r, ord: 9999 } : { name: r.name, ord: r.ord ?? 9999 }
    );
  
    // NEUEN routes-Array bauen, Encounter fresh (pending)
    const next = server.map(r => ({
      id: routeIdFromName(r.name),
      name: r.name,
      encounter: { status:'pending', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt:null }
    }));
  
    state.routes = next;
    // Auswahl zurücksetzen
    currentRouteId = state.routes[0]?.id ?? null;
  
    save();
    try { renderRoutes(); renderEncounter(); } catch {}
  }

  async function wipeRoutesAndReloadFromServer(){
    clearLocalStateAll();
    // lokal leeren + UI sofort „leer“ zeigen
    currentRouteId = null;
    state.routes = [];
    save();
    try { renderRoutes(); renderEncounter(); } catch {}
  
    const code = currentLobbyCode();
    if (!code) return;
  
    // Versuche zuerst, über list() die routes zu bekommen
    try {
      const st = await nzListState(code);
      if (Array.isArray(st.routes) && st.routes.length){
        applyServerRoutes(st.routes);
        return;
      }
    } catch(e){ console.warn('[NZ] list() without routes:', e); }
  
    // Fallback: dedizierte Action "listRoutes"
    try {
      const resp = await nzApi('listRoutes', { code });
      const routes = resp?.routes || resp?.data || [];
      if (Array.isArray(routes) && routes.length){
        applyServerRoutes(routes);
      }
    } catch(e){
      console.warn('[NZ] listRoutes failed:', e);
    }
  }

  async function clearLocalStateAll() {
    // Trainername behalten
    const trainerName = state?.user?.name || "";
  
    // Lokalen App-State frisch aufsetzen
    state = EMPTY_STATE();
    state.user.name = trainerName;
  
    // Auswahl / UI-Zwischenzustände leeren
    selectedFromBoxUid = null;
    currentRouteId = null;
  
    // Optimistic-/Sync-Caches fürs Multiplayer leeren
    try {
      if (typeof nzPendingSet !== "undefined") nzPendingSet.clear?.();
      if (typeof nzPendingClear !== "undefined") nzPendingClear.clear?.();
      if (typeof nzLastRouteSlots !== "undefined") nzLastRouteSlots = new Map();
      if (typeof nzLastRouteSlotsByPlayer !== "undefined") nzLastRouteSlotsByPlayer = new Map();
      if (typeof nzLocalHoldUntil !== "undefined") nzLocalHoldUntil = 0;
    } catch {}
  
    // Speichern & UI sofort neutral rendern
    save();
    try {
      renderRoutes();
      renderEncounter();
      renderBox();
      renderBoxDrawer();
      renderTeam();
      renderRouteGroups();
      renderLocalLobbyBadge?.();
    } catch {}
  }
  
  
  