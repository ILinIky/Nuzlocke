// nuz.js — Stable drag/drop + snapshot refresh for Box → Team → All Teams sync

// ===== Config =====
const API_URL = '/.netlify/functions/nuzlocke'; // Netlify functions path
const LS_KEY = 'nz.session.v1';

// ===== State =====
let state = {
  lobbyId: 'default',
  player: null,      // { id, name }
  players: [],       // [{ id, name, team:[], box:[] }]
  routeSlots: {},    // { routeId: slotNumber }
};

// Persist/restore basic session
function saveSession() {
  try {
    const s = {
      lobbyId: state.lobbyId,
      player: state.player ? { id: state.player.id, name: state.player.name } : null
    };
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (s.lobbyId) state.lobbyId = s.lobbyId;
    if (s.player) state.player = s.player;
  } catch {}
}

// ===== Helpers =====
function spriteUrlFor(pkm) {
  if (!pkm) return '';
  if (pkm.sprite) return pkm.sprite;
  if (pkm.image) return pkm.image;
  if (pkm.dex) return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pkm.dex}.png`;
  return '';
}

const inflight = new Set();
async function nzApi(action, payload={}) {
  const key = JSON.stringify([action, payload.lobbyId, payload.playerId, payload.routeId, payload.slot, payload.pokemonId, payload.dex]);
  if (inflight.has(key)) return { ok:true, dedup:true };
  inflight.add(key);
  try {
    const isGet = action === 'snapshot' || action === 'health';
    const url = isGet
      ? `${API_URL}?action=${encodeURIComponent(action)}&lobbyId=${encodeURIComponent(payload.lobbyId || state.lobbyId)}`
      : API_URL;
    const res = await fetch(url, {
      method: isGet ? 'GET' : 'POST',
      headers: { 'Content-Type':'application/json' },
      body: isGet ? undefined : JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } finally {
    setTimeout(()=> inflight.delete(key), 300);
  }
}

async function refreshAll() {
  const snap = await nzApi('snapshot', { lobbyId: state.lobbyId });
  Object.assign(state, snap);
  // ensure selected player maps to latest object in players list
  if (state.player && state.players.length) {
    const p = state.players.find(x => x.id === state.player.id);
    if (p) state.player = { id: p.id, name: p.name };
  }
  renderAll();
}

// ===== UI wiring =====
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function setStatus(msg){ const s = $('#status'); if (s) s.textContent = msg || ''; }

function bindTabs() {
  const tabs = $all('.tab');
  tabs.forEach(t => t.addEventListener('click', ()=>{
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    $('#view-box').style.display = (tab==='box')? 'block' : 'none';
    $('#view-team').style.display = (tab==='team')? 'block' : 'none';
    $('#view-all').style.display = (tab==='all')? 'block' : 'none';
  }));
}

function bindHeader() {
  const lobbyInput = $('#lobbyId');
  lobbyInput.value = state.lobbyId;
  lobbyInput.addEventListener('change', async ()=>{
    state.lobbyId = lobbyInput.value || 'default';
    saveSession();
    await refreshAll();
  });

  $('#reloadBtn').addEventListener('click', refreshAll);

  $('#joinBtn').addEventListener('click', async ()=>{
    const name = ($('#playerName').value || '').trim();
    if (!name) { alert('Bitte Spielernamen eingeben'); return; }
    const out = await nzApi('ensurePlayer', { lobbyId: state.lobbyId, name });
    state.player = { id: out.player.id, name: out.player.name };
    saveSession();
    await refreshAll();
  });

  $('#playerSelect').addEventListener('change', async (e)=>{
    const id = e.target.value;
    const p = state.players.find(x => x.id === id);
    if (p) {
      state.player = { id: p.id, name: p.name };
      saveSession();
      renderAll(); // no server call needed
    }
  });

  $('#seedBtn').addEventListener('click', async ()=>{
    if (!state.player) { alert('Bitte zuerst Spieler wählen oder beitreten.'); return; }
    // Add 6 demo mons with distinct routes
    const demo = [
      { routeId:'route-101', dex:1, name:'Bulbasaur' },
      { routeId:'route-102', dex:4, name:'Charmander' },
      { routeId:'route-103', dex:7, name:'Squirtle' },
      { routeId:'route-201', dex:25, name:'Pikachu' },
      { routeId:'route-202', dex:129, name:'Magikarp' },
      { routeId:'route-203', dex:133, name:'Eevee' },
    ];
    for (const d of demo) {
      await nzApi('addBoxPokemon', { lobbyId: state.lobbyId, playerId: state.player.id, ...d, caught:true });
    }
    await refreshAll();
  });

  $('#clearTeamBtn').addEventListener('click', async ()=>{
    if (!state.player) return;
    for (let s=1; s<=6; s++) {
      await nzApi('clearTeamSlot', { lobbyId:state.lobbyId, playerId:state.player.id, slot:s });
    }
    await refreshAll();
  });
}

function renderPlayersSelect() {
  const sel = $('#playerSelect');
  sel.innerHTML = '';
  for (const p of state.players) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (state.player && p.id === state.player.id) opt.selected = true;
    sel.appendChild(opt);
  }
}

function makeBoxCard(pkm) {
  const card = document.createElement('div');
  card.className = 'pkm-card nz-box-card';
  card.__pkmRef = pkm;
  const img = document.createElement('img');
  img.src = spriteUrlFor(pkm);
  img.alt = pkm.name || 'Pokemon';
  const name = document.createElement('div');
  name.className = 'pkm-name';
  name.textContent = pkm.name || (pkm.dex ? `#${pkm.dex}` : 'Pokemon');
  card.appendChild(img);
  card.appendChild(name);

  // drag
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('routeId', String(pkm.routeId || ''));
    e.dataTransfer.setData('pokemonId', String(pkm.id || ''));
  });

  return card;
}

function wireTeamSlotDrop(slotEl) {
  slotEl.addEventListener('dragover', e=> e.preventDefault());
  slotEl.addEventListener('drop', async (e)=>{
    e.preventDefault();
    if (!state.player) return;
    const routeId = e.dataTransfer.getData('routeId');
    const pokemonId = e.dataTransfer.getData('pokemonId') || null;
    let slot = Number(slotEl.dataset.slot);
    slot = Math.max(1, Math.min(6, slot|0));
    if (!routeId) return;
    await nzApi('assign', {
      lobbyId: state.lobbyId,
      playerId: state.player.id,
      routeId, slot, pokemonId
    });
    await refreshAll();
  });
}

function renderBox() {
  const boxGrid = $('#boxGrid');
  const boxErr = $('#boxErr');
  boxGrid.innerHTML = ''; boxErr.textContent = '';
  const current = state.players.find(p => state.player && p.id === state.player.id);
  const box = current?.box || [];
  $('#boxCount').textContent = `${box.length} in Box`;
  if (!box.length) {
    const p = document.createElement('div');
    p.className = 'muted';
    p.textContent = 'Keine Pokémon in der Box. Nutze „Demo-Box befüllen“ oder deinen eigenen Import.';
    boxGrid.appendChild(p); return;
  }
  for (const pkm of box) {
    boxGrid.appendChild(makeBoxCard(pkm));
  }
}

function renderTeam() {
  const teamGrid = $('#teamGrid');
  const teamErr = $('#teamErr');
  teamGrid.innerHTML = ''; teamErr.textContent = '';
  const current = state.players.find(p => state.player && p.id === state.player.id);

  for (let s=1; s<=6; s++) {
    const slotEl = document.createElement('div');
    slotEl.className = 'slot nz-team-slot';
    slotEl.dataset.slot = String(s);
    const idx = document.createElement('div');
    idx.className = 'idx';
    idx.textContent = `#${s}`;
    slotEl.appendChild(idx);

    const member = (current?.team || []).find(t => t.slot === s);
    if (member && member.pokemon) {
      const img = document.createElement('img');
      img.src = spriteUrlFor(member.pokemon);
      img.alt = member.pokemon.name || 'Pokemon';
      slotEl.dataset.has = '1';
      slotEl.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'empty';
      slotEl.dataset.has = '0';
      slotEl.appendChild(ph);
    }
    wireTeamSlotDrop(slotEl);
    teamGrid.appendChild(slotEl);
  }
}

function renderAllTeams() {
  const container = $('#allTeams');
  container.innerHTML = '';
  for (const pl of state.players) {
    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = pl.name;
    container.appendChild(name);

    const row = document.createElement('div');
    row.className = 'team-row';
    for (let s=1; s<=6; s++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.dataset.slot = String(s);
      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = `#${s}`;
      cell.appendChild(idx);

      const member = (pl.team || []).find(t => t.slot === s);
      if (member && member.pokemon) {
        const img = document.createElement('img');
        img.src = spriteUrlFor(member.pokemon);
        img.alt = member.pokemon.name || 'Pokemon';
        cell.dataset.has = '1';
        cell.appendChild(img);
      } else {
        // fallback: any box mon whose route maps to this slot
        const routesOnS = Object.entries(state.routeSlots).filter(([,slot]) => slot === s).map(([rid]) => String(rid));
        const fallback = (pl.box || []).find(p => routesOnS.includes(String(p.routeId)));
        if (fallback) {
          const img = document.createElement('img');
          img.src = spriteUrlFor(fallback);
          img.alt = fallback.name || 'Pokemon';
          cell.dataset.has = '1';
          cell.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'empty';
          cell.dataset.has = '0';
          cell.appendChild(ph);
        }
      }
      row.appendChild(cell);
    }
    container.appendChild(row);
  }
}

function renderAll() {
  renderPlayersSelect();
  renderBox();
  renderTeam();
  renderAllTeams();
}

// Visibility refresh
document.addEventListener('visibilitychange', ()=> { if (!document.hidden) refreshAll(); });

// ===== Init =====
(async function init(){
  loadSession();
  bindTabs();
  bindHeader();
  $('#lobbyId').value = state.lobbyId;
  await refreshAll();
  setStatus('Bereit');
})();
