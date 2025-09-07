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
//function holdSync(ms = 1500){ nzLocalHoldUntil = Date.now() + ms; }
let newLobyCode = '';

/* ---------- POKEDEX ANFANG (ohne nzApi, mit Types) ---------- */
const POKEDEX_KEY = 'nuz_pokedex_v2'; // gleiches Key wie vorher, wir erkennen alte Caches ohne "types"
let pokedex = [];                      // Arbeitsspeicher
let pokedexLoadPromise = null;         // Dedupe paralleler Loads
let pokedexTypesLoadPromise = null;    // Dedupe Typ-Hydration

// Mit Action-Button
PokeBanner.show({
    title: 'Lobby bereit',
    message: 'Code: ABC123 – Team wählen?',
    variant: 'info',
    actionText: 'Zum Team',
    onAction: (close)=>{ setActiveTab?.('team'); close(); },
    duration: 6000
  });

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

/* GLOBALE BOX START */
/* ---------- Box-Viewer (für fremde Boxen) ---------- */
// --- Safe HTML-escape, einmal global bereitstellen ---
(function () {
  const MAP = { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" };
  window.nzEsc = window.nzEsc || (s => String(s ?? "").replace(/[&<>"']/g, c => MAP[c]));
  if (!("esc" in window)) window.esc = window.nzEsc; // falls du schon esc verwendest
})();

// --- Lobby / Pokedex Hilfen ---
function getLobbyPlayers(){
  const st = window.nzLastListState || {};
  return Array.isArray(st.players) ? st.players : [];
}
/* WRONG
function idBySpecies(name){
  if (!name || !Array.isArray(window.pokedex)) return null;
  const p = window.pokedex.find(x => x.name === String(name).toLowerCase());
  return p?.id ?? null;
}
  */
function spriteBySpecies(name){
  const id = getPokemonIdByName(name);
  return id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` : null;
}
function isRouteInTeamForPlayer(routeName, playerId){
  const st = window.nzLastListState || {};
  const rs = Array.isArray(st.routeSlots) ? st.routeSlots : [];
  return rs.some(r => String(r.player_id) === String(playerId) && r.route === routeName);
}
function ensureBoxViewerBar(){
  const grid = document.querySelector('#boxGrid');
  if (!grid) return;

  // Bar einmalig einsetzen
  let bar = document.getElementById('boxViewerBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'boxViewerBar';
    bar.className = 'box-viewer-bar';
    bar.innerHTML = `
      <div class="box-viewer-row">
        <label class="lbl" style="margin:0">Pokémon Box</label>
        <div style="z-index: 999" class="">
          <select style="display:none" id="boxViewerSelect"></select>
        </div>
        <button id="boxViewerRefresh" class="btn ghost">Aktualisieren</button>
      </div>
    `;
    // oberhalb des Grids einfügen
    grid.parentElement.insertBefore(bar, grid);
  }
 
  const sel = bar.querySelector('#boxViewerSelect');
  const btn = bar.querySelector('#boxViewerRefresh');

  // sichere Helfer
  const getLastState = () => (window.nzLastListState && typeof window.nzLastListState === 'object') ? window.nzLastListState : { players:[], boxes:{} };
  const getMeId      = () => (window.NZ?.me?.playerId) || localStorage.getItem('playerId') || '';
  const getMeName    = () => (window.state?.user?.name || window.nzPlayerName || 'Du').trim();

  async function refillOptions(){
    const st   = getLastState();
    const meId = getMeId();
    const meNm = getMeName();

    const current = window.boxViewerSelection || localStorage.getItem('boxViewerSelection') || 'me';

    // Optionen neu aufbauen
    sel.innerHTML = '';
    sel.appendChild(new Option(`Meine Box (${meNm || 'You'})`, 'me'));

    // andere Spieler (ohne mich)
    (Array.isArray(st.players) ? st.players : []).forEach(p => {
      if (String(p.id) === String(meId)) return;
      const label = (p.name || 'Trainer') + (p.online ? ' • online' : '');
      sel.appendChild(new Option(label, p.id));
    });

    // Auswahl herstellen (Fallback auf "me", wenn Eintrag nicht mehr existiert)
    sel.value = [...sel.options].some(o => o.value === current) ? current : 'me';

    window.boxViewerSelection = sel.value;
    localStorage.setItem('boxViewerSelection', sel.value);
  }

  // Doppelte Events vermeiden
  if (!bar.dataset.ready) {
    bar.dataset.ready = '1';

    sel.addEventListener('change', () => {
      window.boxViewerSelection = sel.value;
      localStorage.setItem('boxViewerSelection', sel.value);
      // Box neu rendern (deine bestehende Funktion)
      try { renderBox(); } catch(_) {}
    });

    btn.addEventListener('click', async () => {
      try { await window.NZ?.syncNow?.(); } catch(_) {}
      await refillOptions();
      try { renderBox(); } catch(_) {}
    });
  }

  // initial füllen
  refillOptions();

  // extern für nzSync() verfügbar machen
  window._refillBoxViewerOptions = refillOptions;
}

/* GLOBALE BOX ENDE */
/* ---------- Box-Viewer (für fremde Boxen) ---------- */


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




/* ---------- POKEDEX ENDE ---------- */

/* ---------- POKEDEX UTILITYS ---------- */
// --- Name-Normalisierung für PokeAPI-/Cache-Namen
function normMonName(name){
    const k = String(name || '').trim().toLowerCase();
    const alias = {
      'nidoran♀': 'nidoran-f', 'nidoran♀️': 'nidoran-f', 'nidoran♂': 'nidoran-m',
      "farfetch’d": 'farfetchd', "farfetch'd": 'farfetchd',
      'mr. mime': 'mr-mime', 'mime jr.': 'mime-jr',
      'type: null': 'type-null',
      'tapu koko': 'tapu-koko', 'tapu lele': 'tapu-lele', 'tapu bulu': 'tapu-bulu', 'tapu fini': 'tapu-fini',
      'ho-oh': 'ho-oh', 'porygon-z': 'porygon-z',
      'jangmo-o': 'jangmo-o', 'hakamo-o': 'hakamo-o', 'kommo-o': 'kommo-o',
      'flabébé': 'flabebe'
    };
    return alias[k] || k;
  }

// --- Nur lokalen Pokédex lesen (kein Netz)
function getLocalPokedex(){
    try{
      const raw = localStorage.getItem('nuz_pokedex_v2');
      if(!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }catch{
      return [];
    }
  }
  
  /**
   * Liefert die Types eines Pokémon aus dem lokalen Pokédex.
   * @param {string} name - z.B. "Pikachu", "Mr. Mime", "Nidoran♀"
   * @returns {string[]} z.B. ["electric"] oder []
   */
  function getTypesByNameFromLocal(name){
    const list = getLocalPokedex();
    if (!list.length) return [];
    const key = normMonName(name);
    const entry = list.find(e => (e.name || '').toLowerCase() === key);
    // liefert eine Kopie, um Mutationen außerhalb zu vermeiden
    return Array.isArray(entry?.types) ? entry.types.slice() : [];
  }

  /* ---------- POKEDEX UTILITYS ENDE ---------- */

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

/* ---------- Routes ANIMATION ---------- */


 /* =========================================================
   RouteFX – Pokémon UI Animations (all-in-one)
   ========================================================= */
window.RouteFX = (() => {
    /* ------------ CSS: einmalig injizieren (nur Effekte) ------------ */
    const CSS = `
    /* Type Aura */
    [type-aura]{ position:relative; isolation:isolate }
    [type-aura]::before{
      content:""; position:absolute; inset:-8px; border-radius:14px; z-index:0; filter:blur(12px);
      background: conic-gradient(from 0deg, var(--aura1,#6cf), var(--aura2,#39f), var(--aura1,#6cf));
      opacity:.18; transition:.2s;
    }
    [type-aura] > *{ position:relative; z-index:1 }
  
    /* Pokéball für Wurf */
    .routefx-ball{
      position:absolute; width:34px; height:34px; border-radius:50%;
      background: radial-gradient(circle at 50% 35%, #EE1515 0 36%, #fff 37% 64%, #111 65% 100%);
      box-shadow: 0 0 0 2px #fff inset, 0 0 0 4px #EE1515 inset, 0 10px 26px rgba(0,0,0,.45);
      pointer-events:none; z-index:5;
    }
    .routefx-ball::after{ content:""; position:absolute; left:0; right:0; bottom:10px; height:6px; background:#fff }
  
    /* Vignette & Shockwave */
    .rf-vignette{
      position:fixed; inset:0; z-index:9990; pointer-events:none;
      background: radial-gradient(1200px 700px at 50% 30%, rgba(255,255,255,.06), rgba(0,0,0,.78) 60%, rgba(0,0,0,.92));
      opacity:0;
    }
    .rf-bloom{
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:18px; height:18px; border-radius:999px; pointer-events:none; box-shadow:0 0 0 0 rgba(255,210,63,.95); z-index:7;
    }
  
    /* Konfetti */
    .routefx-confetti{ position:absolute; inset:0; pointer-events:none; overflow:visible; z-index:6 }
    .routefx-confetti i{
      position:absolute; width:8px; height:14px; border-radius:2px;
      transform: translate(-50%,-50%) rotate(0deg);
      box-shadow:0 2px 6px rgba(0,0,0,.28);
    }
  
    @media (prefers-reduced-motion: reduce){
      [type-aura]::before{ opacity:.10; filter:none }
    }`;
    function ensureStyle(){
      if (document.getElementById('routefx-style-v3')) return;
      const st = document.createElement('style');
      st.id = 'routefx-style-v3';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
  
    /* ----------------- Helpers ----------------- */
    const $ = (s, r=document) => r.querySelector(s);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const RM = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  
    function resolveTarget(selOrEl){
      const box = (typeof selOrEl === 'string') ? $(selOrEl) : selOrEl;
      const img = box?.querySelector?.('img') || (box?.tagName === 'IMG' ? box : null);
      return { box, img: img || box };
    }
    function ensureRel(el){
      if(!el) return ()=>{};
      const cs = getComputedStyle(el);
      if (cs.position !== 'static') return ()=>{};
      el.dataset._rfRel = '1'; el.style.position = 'relative';
      return ()=>{ if (el.dataset._rfRel){ el.style.position=''; delete el.dataset._rfRel; } };
    }
  
    const TYPE_COLORS = {
      normal:['#A8A77A','#7A7A59'], fire:['#EE8130','#B34D0B'], water:['#6390F0','#2F62CE'],
      electric:['#F7D02C','#C7A40A'], grass:['#7AC74C','#3F8F26'], ice:['#96D9D6','#58BAB6'],
      fighting:['#C22E28','#891512'], poison:['#A33EA1','#6B2169'], ground:['#E2BF65','#B2913A'],
      flying:['#A98FF3','#6A57C7'], psychic:['#F95587','#BC2154'], bug:['#A6B91A','#6E7F11'],
      rock:['#B6A136','#806B1E'], ghost:['#735797','#4A356E'], dragon:['#6F35FC','#3F14C7'],
      dark:['#705746','#3E2E23'], steel:['#B7B7CE','#7F8199'], fairy:['#D685AD','#9E4479']
    };
  
    /* ----------------- Visual helpers ----------------- */
    function applyTypeAura(hostEl, type){
      if (!hostEl) return;
      const key = String(Array.isArray(type)? type[0] : type || '').toLowerCase();
      const [c1,c2] = TYPE_COLORS[key] || ['#6cf','#39f'];
      hostEl.setAttribute('type-aura','');
      hostEl.style.setProperty('--aura1', c1);
      hostEl.style.setProperty('--aura2', c2);
    }
  
    function sparkleAt(selOrEl, count=22, color='var(--ring, #ffd23f)'){
      const { box, img } = resolveTarget(selOrEl); if (!img||!box) return;
      const restore = ensureRel(box);
      const layer = document.createElement('div');
      layer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:7';
      box.appendChild(layer);
  
      const r = img.getBoundingClientRect(), h = layer.getBoundingClientRect();
      const cx = r.left - h.left + r.width/2, cy = r.top - h.top + r.height/2;
      const N = RM ? Math.ceil(count*0.6) : count;
  
      for(let i=0;i<N;i++){
        const dot = document.createElement('i');
        dot.style.cssText='position:absolute;width:6px;height:6px;border-radius:50%';
        dot.style.left = cx + 'px'; dot.style.top = cy + 'px';
        dot.style.background = `radial-gradient(circle, ${color} 0 50%, #fff 55% 100%)`;
        layer.appendChild(dot);
        const a = Math.random()*Math.PI*2, d = 26 + Math.random()*42;
        const tx = Math.cos(a)*d, ty = Math.sin(a)*d;
        const dur = (RM?220:300) + Math.random()* (RM?260:480);
        dot.animate(
          [{ transform:'translate(0,0) scale(1)', opacity:1 },
           { transform:`translate(${tx}px,${ty}px) scale(.6)`, opacity:0 }],
          { duration: dur, easing:'ease-out', fill:'forwards' }
        ).onfinish = () => dot.remove();
      }
      setTimeout(()=>{ layer.remove(); restore(); }, RM?450:720);
    }
  
    function confetti(selOrEl, opts={}){
      const { box } = resolveTarget(selOrEl); if(!box) return;
      const restore = ensureRel(box);
      const host = document.createElement('div'); host.className='routefx-confetti'; box.appendChild(host);
      const colors = opts.colors || ['#ffd23f','#31d0aa','#ff6b6b','#7f8cff','#ff9f1a'];
      const N = opts.count || (RM?28:52);
  
      for (let i=0;i<N;i++){
        const p = document.createElement('i');
        p.style.left = (Math.random()*box.clientWidth) + 'px';
        p.style.top  = (box.clientHeight*0.15) + 'px';
        p.style.background = colors[i % colors.length];
        host.appendChild(p);
        const x = (Math.random()-.5)*box.clientWidth*0.35;
        const y = box.clientHeight*0.9 + Math.random()*60;
        const rot = (Math.random()*.8+ .2) * (Math.random()<.5?-1:1) * 360;
        const dur = (RM?700:1200) + Math.random()* (RM?500:700);
        p.animate(
          [{ transform:'translate(0,0) rotate(0)', opacity:1 },
           { transform:`translate(${x}px,${y}px) rotate(${rot}deg)`, opacity:0.85 }],
          { duration: dur, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' }
        ).onfinish = () => p.remove();
      }
      setTimeout(()=>{ host.remove(); restore(); }, RM?1000:1800);
    }
  
    function highlightRouteByName(name){
      const items = Array.from(document.querySelectorAll('#routesList .route-item'));
      const n = String(name||'').toLowerCase();
      const el = items.find(x => (x.dataset?.routeName||'').toLowerCase()===n || x.textContent.toLowerCase().startsWith(n));
      if(!el) return;
      el.animate(
        [
          { transform:'scale(.98)', boxShadow:'0 0 0 0 rgba(255,210,63,0)' },
          { transform:'scale(1.05)', boxShadow:'0 0 0 10px rgba(255,210,63,.12)' },
          { transform:'scale(1)' }
        ],
        { duration: RM?300:600, easing:'ease-out' }
      );
    }
  
    /* ----------------- Core Sequences ----------------- */
    async function playCatch(selOrEl, routeName=''){
      ensureStyle();
      const { box, img } = resolveTarget(selOrEl); if(!img||!box) return;
      const restore = ensureRel(box);
  
      // Ring
      const ring = document.createElement('div');
      ring.style.cssText='position:absolute;left:50%;top:50%;width:10px;height:10px;border-radius:999px;transform:translate(-50%,-50%);box-shadow:0 0 0 0 rgba(255,210,63,.95);pointer-events:none;z-index:8';
      box.appendChild(ring);
      ring.animate(
        [{ boxShadow:'0 0 0 0 rgba(255,210,63,.95)' }, { boxShadow:'0 0 0 44px rgba(255,210,63,0)' }],
        { duration: RM?300:600, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' }
      ).onfinish = () => ring.remove();
  
      // Bounce
      img.animate(
        [{ transform:'scale(.96)' }, { transform:'scale(1.06)' }, { transform:'scale(.99)' }, { transform:'scale(1)' }],
        { duration: RM?300:580, easing:'ease-out' }
      );
  
      sparkleAt(box, RM?14:22);
      if (routeName) highlightRouteByName(routeName);
      await wait(RM?320:600);
      restore();
    }
  
    function playFail(selOrEl){
      ensureStyle();
      const { box, img } = resolveTarget(selOrEl);
      const targetBox = box || $('#encSprite'); const target = img || targetBox;
      if (!targetBox || !target) return Promise.resolve();
      const restore = ensureRel(targetBox);
  
      const overlay = document.createElement('div');
      overlay.style.position='absolute'; overlay.style.inset='0';
      overlay.style.borderRadius = getComputedStyle(targetBox).borderRadius || '12px';
      overlay.style.background='rgba(255,0,0,.14)'; overlay.style.pointerEvents='none'; overlay.style.opacity='0'; overlay.style.zIndex='8';
      targetBox.appendChild(overlay);
  
      const D = RM?260:460;
      const shake = target.animate(
        [{transform:'translateX(0)'},
         {transform:'translateX(-4px)'},
         {transform:'translateX(4px)'},
         {transform:'translateX(-4px)'},
         {transform:'translateX(0)'}],
        { duration:D, easing:'cubic-bezier(.36,.07,.19,.97)', fill:'both' }
      );
      const flash = overlay.animate([{opacity:.65},{opacity:0}],{duration:D,easing:'ease-out',fill:'forwards'});
  
      return new Promise(res=>{ let done=0; const fin=()=>{ if(++done===2){ overlay.remove(); restore(); res(); } }; shake.onfinish=fin; flash.onfinish=fin; });
    }
  
    async function throwBallAndCatch(selOrEl, routeName=''){
      ensureStyle();
      const { box, img } = resolveTarget(selOrEl); if(!img||!box) return;
      const restore = ensureRel(box);
      const ball = document.createElement('div'); ball.className='routefx-ball';
      ball.style.left = box.clientWidth + 30 + 'px';
      ball.style.top  = '10px';
      box.appendChild(ball);
  
      const T1 = RM?220:360, T2 = RM?260:420, T3 = RM?300:520;
  
      const tr = img.getBoundingClientRect(), br = box.getBoundingClientRect();
      const tx = (tr.left - br.left) + tr.width*0.35;
      const ty = (tr.top  - br.top ) + tr.height*0.25;
  
      await (ball.animate(
        [{ transform:`translate(0,0) rotate(0deg)` }, { transform:`translate(${tx}px,${ty}px) rotate(360deg)` }],
        { duration:T1, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' }
      ).finished?.catch?.(()=>{}) || wait(T1));
  
      await (ball.animate(
        [{transform:`translate(${tx}px,${ty}px) rotate(0)`},
         {transform:`translate(${tx-6}px,${ty}) rotate(-12deg)`},
         {transform:`translate(${tx+6}px,${ty}) rotate(12deg)`},
         {transform:`translate(${tx}px,${ty}) rotate(0)`}],
        { duration:T2, easing:'ease-in-out', iterations:2, fill:'forwards' }
      ).finished?.catch?.(()=>{}) || wait(T2*2));
  
      ball.style.opacity = '0';
      playCatch(box);
      confetti(box, { count: RM?20:40 });
      if (routeName) highlightRouteByName(routeName);
  
      await wait(T3);
      ball.remove(); restore();
    }
  
    async function epicCatch(selOrEl, routeName=''){
      ensureStyle();
      const { box, img } = resolveTarget(selOrEl);
      const stage = box || $('#encSprite');
      if (!stage) return;
  
      const restore = ensureRel(stage);
  
      // Vignette in
      const vg = document.createElement('div'); vg.className='rf-vignette'; document.body.appendChild(vg);
      vg.animate([{opacity:0},{opacity:1}], {duration:180, fill:'forwards', easing:'ease-out'});
  
      // Ball mit Kurvenbahn
      //const ball = document.createElement('div'); ball.className='routefx-ball'; stage.appendChild(ball);
      const spr = img || stage;
      const sr = spr.getBoundingClientRect();
      const br = stage.getBoundingClientRect();
      const targetX = (sr.left - br.left) + sr.width*0.55;
      const targetY = (sr.top  - br.top ) + sr.height*0.30;
      const startX = br.width + 60, startY = -20;
  
      const T1 = RM?260:460, T2 = RM?340:600, T3 = RM?700:900;
  
      const kf = [
        { transform:`translate(${startX}px, ${startY}px) rotate(0deg)` },
        { transform:`translate(${(startX+targetX)/2}px, ${targetY-60}px) rotate(260deg)` },
        { transform:`translate(${targetX}px, ${targetY}px) rotate(520deg)` }
      ];
      //const anim1 = ball.animate(kf, { duration:T1, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' });
     // await (anim1.finished?.catch?.(()=>{}) || wait(T1));
  
      // Shockwave + Zoom + Shake
      const bloom = document.createElement('div'); bloom.className='rf-bloom'; stage.appendChild(bloom);
      bloom.animate(
        [{ boxShadow:'0 0 0 0 rgba(255,210,63,.95)' },
         { boxShadow:'0 0 0 160px rgba(255,210,63,0)' }],
        { duration: T2, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' }
      ).onfinish = ()=> bloom.remove();
  
      spr.animate(
        [{ transform:'scale(1) rotate(0.2deg)' },
         { transform:'scale(1.16) rotate(0deg)' },
         { transform:'scale(1.02)' },
         { transform:'scale(1)' }],
        { duration: T2-80, easing:'cubic-bezier(.25,.9,.2,1)', fill:'forwards' }
      );
      document.documentElement.animate(
        [{ transform:'translate(0,0)' }, { transform:'translate(-2px,2px)' }, { transform:'translate(2px,-1px)' }, { transform:'translate(0,0)' }],
        { duration: 220, easing:'ease-in-out' }
      );
  
      // Sparkles + Konfetti + Route-Hilite
      //ball.style.opacity = '0';
      sparkleAt(stage, RM?18:28);
      confetti(stage);
      if (routeName) highlightRouteByName(routeName);
  
      await wait(T3);
  
      // Cleanup
      //ball.remove();
      vg.animate([{opacity:1},{opacity:0}], {duration:180, fill:'forwards', easing:'ease-in'}).onfinish = ()=> vg.remove();
      restore();
    }
  
    /* ----------------- Export ----------------- */
    return {
      applyTypeAura,
      sparkleAt,
      confetti,
      highlightRouteByName,
      playCatch,
      playFail,
      throwBallAndCatch,
      epicCatch
    };
  })();


  
/* ---------- Routes ---------- */
let currentRouteId = null;

function renderRoutes(){
    const wrap = $('#routesList'); wrap.innerHTML = '';
    state.routes.forEach(rt => {
      const div = document.createElement('div');
      div.className = 'route-item' + (currentRouteId===rt.id ? ' active' : '');
      div.dataset.routeName = rt.name;
  
      const status = rt.encounter.status;
      let statusText = 'offen', statusClass = 'pending';
      if (status === 'true'){ statusText='gefangen'; statusClass='caught'; }
      else if (status === 'false'){ statusText='fehlversuch'; statusClass='failed';}
      else if (status === 'dead'){ statusText='DEAD'; statusClass='dead';   
       }
  
      div.innerHTML = `
        <div class="left">
          <span class="rname">${rt.name}</span>
          <span class="badge ${statusClass}">${statusText}</span>
        </div>
        <div class="chev">›</div>
      `;
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
          <div class="sprite" id="encSprite">${hasMon?`<img alt="${toTitle(e.pokemonName)}" src="${e.sprite}">`:''}</div>
          <div>
            <div class="row">
              <input list="pokedexList" id="pokeSearch" type="search" placeholder="Pokémon wählen…" value="${hasMon?toTitle(e.pokemonName):''}">
              <datalist id="pokedexList">${listHtml}</datalist>
              <input id="nickname" type="text" placeholder="Spitzname (optional)" value="${e.nickname||''}">
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn ok" id="btnCaught">Gefangen</button>
              <button class="btn warn" id="btnFailed">Fehlversuch</button>
              <button class="btn bad" id="btnDead">Dead</button>
              <button class="btn" id="btnClear">Zurücksetzen</button>
            </div>
          </div>
        </div>
       <p class="helper" style="margin-top:10px">
  Status: <b>${e.status==='pending'
    ? 'Offen'
    : e.status==='caught'
      ? 'Gefangen'
      : e.status==='dead'
        ? 'DEAD'
        : 'Fehlversuch'}</b>
  ${e.updatedAt ? `• zuletzt aktualisiert: ${new Date(e.updatedAt).toLocaleString()}` : ''}
</p>

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
  const btndead = $('#btnDead');

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
    $('#encSprite').innerHTML = chosen? `<img alt="${toTitle(chosen.name)}" src="${sprite}">` : '';
  
    // ✨ Type-Aura (primärer Typ aus lokalem Pokédex, falls vorhanden)
    const types = chosen ? getTypesByNameFromLocal(chosen.name) : [];
    RouteFX.applyTypeAura($('#encSprite'), types[0] || null);
  }
  search.addEventListener('input', updatePreview);

  btnCaught.onclick = async ()=>{
    //console.warn(rt);
    const chosen = resolvePokemon(search.value);
    if(!chosen) { PokeBanner.warn(`Bitte ein gültiges Pokémon auswählen.`); return; }
// 🎯 Wurf + Fang-Animation
await RouteFX.epicCatch('#encSprite', rt.name); // ← Animation
    rt.encounter = {
      status:'true', pokemonId: chosen.id, pokemonName: chosen.name, sprite: SPRITE(chosen.id), nickname: nick.value.trim(), updatedAt: now()
    };
    const exists = state.box.find(m=>m.routeName===rt.name);
    if(!exists){
      state.box.push({ uid:uid(), id:chosen.id, name:chosen.name, sprite:SPRITE(chosen.id), routeName:rt.name, nickname:nick.value.trim(), caughtAt:now(), isInTeam:false,
      lobbyCode: currentLobbyCode(),
      type: getTypesByNameFromLocal(chosen.name)+',ALIVE'    // ⬅️ neu
     });
    }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();

    // Server: species für "All Teams" aktualisieren
    if (window.NZ) window.NZ.upsertPokemon(rt.name, toTitle(chosen.name), 'true').catch(console.error);
  };


 
  btnFailed.onclick = async ()=>{
    btnClear.click();
    //RouteFX.highlightRouteByName('TEST2');
    //RouteFX.sparkleAt(document.querySelector('.poke-sprite img'), 24);
    
    //return;
    // 💢 kurze Fail-Animation
    const chosen = resolvePokemon(search.value);
    if(!chosen) { PokeBanner.warn(`Bitte ein gültiges Pokémon auswählen.`); return; }
    await RouteFX.playFail('#encSprite');

    rt.encounter = {
      status:'false', pokemonId: chosen.id, pokemonName: chosen.name, sprite: SPRITE(chosen.id), nickname: nick.value.trim(), updatedAt: now()
    };
    const exists = state.box.find(m=>m.routeName===rt.name);
    if(!exists){
      state.box.push({ uid:uid(), id:chosen.id, name:chosen.name, sprite:SPRITE(chosen.id), routeName:rt.name, nickname:nick.value.trim(), caughtAt:now(), isInTeam:false,
      lobbyCode: currentLobbyCode(),
      type: getTypesByNameFromLocal(chosen.name)+',Failed'    // ⬅️ neu
     });
    }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();

    // Server: species für "All Teams" aktualisieren
    if (window.NZ) window.NZ.upsertPokemon(rt.name, toTitle(chosen.name), 'false').catch(console.error);
  };

  btndead.onclick = async ()=>{
    btnClear.click();
    //RouteFX.highlightRouteByName('TEST2');
    //RouteFX.sparkleAt(document.querySelector('.poke-sprite img'), 24);
    
    //return;
    // 💢 kurze Fail-Animation
    const chosen = resolvePokemon(search.value);
    if(!chosen) { PokeBanner.warn(`Bitte ein gültiges Pokémon auswählen.`); return; }
    await RouteFX.playFail('#encSprite');

    rt.encounter = {
      status:'dead', pokemonId: chosen.id, pokemonName: chosen.name, sprite: SPRITE(chosen.id), nickname: nick.value.trim(), updatedAt: now()
    };
    const exists = state.box.find(m=>m.routeName===rt.name);
    if(!exists){
      state.box.push({ uid:uid(), id:chosen.id, name:chosen.name, sprite:SPRITE(chosen.id), routeName:rt.name, nickname:nick.value.trim(), caughtAt:now(), isInTeam:false,
      lobbyCode: currentLobbyCode(),
      type: getTypesByNameFromLocal(chosen.name)+',RIP BOX'    // ⬅️ neu
     });
    }
    save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();

    // Server: species für "All Teams" aktualisieren
    if (window.NZ) window.NZ.upsertPokemon(rt.name, toTitle(chosen.name), 'dead').catch(console.error);
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
    const placed = placedLabelForRoute(mon.routeName);
const hasRibbon = !!mon.isInTeam;


card.className = `poke-card${hasRibbon ? ' has-ribbon' : ''}`;

card.innerHTML = `
  ${hasRibbon ? `<div class="ribbon"><span>Gepickt von: ${placed || '—'}</span></div>` : ''}
  <div class="poke-top">
    <div>
      <div class="poke-name">#${mon.id} ${toTitle(mon.name)} ${mon.nickname?`“${mon.nickname}”`:''}</div>
      <div class="tag">${mon.routeName}</div>
    </div>
  </div>
  <div class="poke-sprite"><img alt="${toTitle(mon.name)}" src="${mon.sprite}"></div>
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
  ensureBoxViewerBar();

  const viewer = window.boxViewerSelection || localStorage.getItem('boxViewerSelection') || 'me';
  grid.innerHTML = '';
  const code = currentLobbyCode();

  if (viewer === 'me') {
    // ---------- DEIN ORIGINAL-CODE (unverändert) ----------
    const mons = state.box.filter(m => !code ? true : m.lobbyCode === code);  // ⬅️ Filter
    mons.forEach(mon => {
      const card = document.createElement('div');
      card.className = 'poke-card';
      card.draggable = true;
      card.dataset.uid = mon.uid;
      card.setAttribute('data-route', mon.routeName);

      const placed = placedLabelForRoute(mon.routeName);
      const hasRibbon = !!mon.isInTeam;
      const typeLabel = Array.isArray(mon.type) ? mon.type.join(' / ') : (mon.type || '');

      card.className = `poke-card${hasRibbon ? ' has-ribbon' : ''}`;
      card.innerHTML = `
        ${hasRibbon ? `<div class="ribbon"><span>Im Team${placed ? ' • ' + placed : ''}</span></div>` : ''}

        <div class="poke-top">
          <div>
            <div class="poke-name">#${mon.id} ${toTitle(mon.name)} ${mon.nickname?`“${mon.nickname}”`:''}</div>
            <div class="tag">${mon.routeName} + ${mon.type}</div>
          </div>
          <button class="btn bad" style="display:none" data-remove>Entfernen</button>
        </div>
        <div class="poke-sprite"><img alt="${toTitle(mon.name)}" src="${mon.sprite}"></div>
      `;
      card.addEventListener('dragstart', e=>{
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', mon.uid);
        e.dataTransfer.setData('text/route', mon.routeName);
      });
      card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
      card.querySelector('[data-remove]').onclick = (ev)=>{
        ev.stopPropagation(); 
        if(mon.isInTeam){ PokeBanner.warn(`Dieses Pokémon ist im Team. Entferne es zuerst aus dem Team.`); return; }
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
      // ✨ Type-Aura auf das Sprite in der Karte
      const auraHost = card.querySelector('.poke-sprite');
      const t = Array.isArray(mon.type) ? mon.type[0] : mon.type;
      RouteFX.applyTypeAura(auraHost, t);
    });
    return;
  }

  // ---------- Fremde Box (read-only) ----------
  const st  = window.nzLastListState || {};
  const pid = viewer;
  const box = (st.boxes || {})[pid] || {}; // { routeName: { species, caught } }

  const entries = Object.entries(box).sort((a,b)=> a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    grid.innerHTML = `<p class="helper">Dieser Spieler hat noch keine Einträge in der Box.</p>`;
    return;
  }

  entries.forEach(([routeName, mon]) => {
    const species = mon?.species || '';
    const caught  = mon?.caught; // 'true' | 'false'
    //const nickname = mon?.nickname || '';
    const nick_name = mon?.nickname ? JSON.stringify(mon.nickname) : '';
// ergibt z.B. "\"Pika\"" bei nickname = 'Pika'
    const sprite  = spriteBySpecies(species);
    const pkmnId  = getPokemonIdByName(species);
    const inTeam  = isRouteInTeamForPlayer(pid, routeName);
    const types   = getTypesByNameFromLocal(species);
    const typeLabel = Array.isArray(types) && types.length ? types.join(',') : '';
    const caught_ = caught === 'true' ? 'alive' : (caught === 'false' ? 'failed' : 'RIP BOX');
    const card = document.createElement('div');
    card.className = 'poke-card read-only';

    card.innerHTML = `
      ${inTeam ? `<div class="ribbon"><span>Im Team</span></div>` : ''}

      <div class="poke-top">
        <div>
          <div class="poke-name">${pkmnId ? '#'+pkmnId+' ' : ''}${toTitle(species)} ${nick_name}</div>
          <div class="tag" style="display:none" >${routeName}${typeLabel ? ` + ${typeLabel},${caught_}` : ''}</div>
           <i class="ball" aria-hidden="true"></i>${caught}
        </div>
       <div class="status-pill ${caught === 'true' ? 'ok' : (caught === 'dead' ? 'dead' : 'bad')}">
  <i class="ball" aria-hidden="true"></i>
  ${caught === 'true' ? 'ALIVE' : (caught === 'dead' ? 'RIP BOX' : 'FAILED')}
</div>

      </div>
      <div class="poke-sprite">
        ${sprite ? `<img alt="${toTitle(species)}" src="${sprite}">` : '—'}
      </div>
    `;
   // console.log(species);
    //console.log(pkmnId);
    RouteFX.applyTypeAura(card.querySelector('.poke-sprite'), types?.[0] || null);
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
      
      
     
      
      e.preventDefault(); slot.classList.remove('over');
      const uid = e.dataTransfer.getData('text/plain');
      const mon = state.box.find(m=>m.uid===uid);
      

      const res = checkifpokemonisusable(mon.routeName); // nutzt window.nzLastListState
      if (res === true) {
      }else {
        setTimeout(() =>   PokeBanner.warn(`Diese Route ist durch <b style="color:orange">${res.join(', ')}</b> nicht mehr verfügbar! :)`), 5);
        return;
      }
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
      console.warn('[NZ] drop event:', pick);

      const res = checkifpokemonisusable(pick.routeName); // nutzt window.nzLastListState
      if (res === true) {
      }else {
        setTimeout(() =>   PokeBanner.warn(`Diese Route ist durch <b style="color:orange">${res.join(', ')}</b> nicht mehr verfügbar! :)`), 5);
        return;
      }


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

function openNameDialog(){
    const overlay = $('#loginOverlay');
    if(!overlay) return;
    overlay.hidden = false;
    overlay.style.display = 'grid';
    overlay.setAttribute('aria-hidden', 'false');
  
    const input = $('#trainerName');
    if (input) {
      input.value = state?.user?.name || nzPlayerName || '';
      setTimeout(()=> input.focus(), 0);
      
     
    }
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
    localStorage.setItem("playerName", name);
    nzPlayerName = name;                              // ⬅️ wichtig
    $('#playerNameBadge').textContent = name;
    state.user.name = name; save(); ensureLogin();
    nzSync();
    setTimeout(()=> nzJoin.click(), 3000); // ⬅️ Namen ändern
  });

  renderRoutes(); renderEncounter(); renderBox(); renderTeam(); renderBoxDrawer(); renderRouteGroups(); renderLocalLobbyBadge(); ensureLogin();
 

  // ADDONS Für BOOT LOAD --> FIX Damit die BoxDrawer-UI mit Picks der Namen initialisiert wird
  setTimeout(()=>{ renderBoxDrawer(); }, 3000); // Lokale Lobby-Badge initialisieren
  // am Ende von boot(), irgendwo nach ensureLogin() / ensurePokedex():

  // in boot():
// ➕ Arenen initialisieren
Arena.init();

}
boot();

/* ==========================================================
   Multiplayer (nur #nz-lobby und #nz-allteams; keine Doppel-UI)
   ========================================================== */
/* ========================================================== 
   SETTINGS==========================================SETTINGS --> START
   ========================================================== */
const NZ_API = "/api/nuzlocke";
function holdSync(ms = 2500){ nzLocalHoldUntil = Date.now() + ms; }
// --- adaptive-polling.js (inline) -------------------------------------------
(function(){
  // Empfehlungen / Defaults
  const NZ_HEARTBEAT_FG = 30000;  // 30s im Vordergrund
  const NZ_HEARTBEAT_BG = 90000;  // 90s im Hintergrund
  let fastpull_msg = false;

  const NZ_POLL_BASE    = 10000;  // 10s normal
  const NZ_POLL_FAST    = 2500;   // 2.5s bei Aktivität
  const NZ_POLL_BG      = 30000;  // 30s im Hintergrund
  const NZ_POLL_ERR_MAX = 120000; // bis 120s bei Fehlern

  let _pollTimer = null;
  let _hbTimer   = null;
  let _backoff   = NZ_POLL_BASE;
  let _fastUntil = 0;

  function onVisibility(){
    if (document.visibilityState === 'hidden'){
      schedulePoll(NZ_POLL_BG);
      scheduleHeartbeat();
    } else {
      schedulePoll(NZ_POLL_FAST);
      scheduleHeartbeat();
    }
  }

  function scheduleHeartbeat(){
    clearInterval(_hbTimer);
    const hidden = document.visibilityState === 'hidden';
    const period = hidden ? NZ_HEARTBEAT_BG : NZ_HEARTBEAT_FG;
    _hbTimer = setInterval(()=> nzHeartbeat().catch(()=>{}), period);
  }

  function schedulePoll(ms){
    clearTimeout(_pollTimer);
    _pollTimer = setTimeout(runPoll, Math.max(0, ms));
  }

  async function runPoll(){
    try{
      await nzSync();                    // deine bestehende Sync-Funktion
      _backoff = NZ_POLL_BASE;           // Backoff zurücksetzen
      const now = Date.now();
      const hidden = document.visibilityState === 'hidden';
      const next = (now < _fastUntil) ? NZ_POLL_FAST : (hidden ? NZ_POLL_BG : NZ_POLL_BASE);
      if( now > _fastUntil){
        if( fastpull_msg ){
          PokeBanner.ok(`Schnelles Abfragen beendet.`,1500);
        }
       fastpull_msg = false;
       
      }
      schedulePoll(next);
    }catch(e){
      // Exponentielles Backoff bei Fehlern
      _backoff = Math.min(_backoff * 1.8, NZ_POLL_ERR_MAX);
      schedulePoll(_backoff);
    }
  }

  function startAdaptivePolling(){
    stopAdaptivePolling();
    schedulePoll(0);
    scheduleHeartbeat();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus',  ()=> schedulePoll(NZ_POLL_FAST));
    window.addEventListener('online', ()=> schedulePoll(NZ_POLL_FAST));
    window.addEventListener('offline',()=> schedulePoll(NZ_POLL_BG));
  }

  function stopAdaptivePolling(){
    clearTimeout(_pollTimer); _pollTimer = null;
    clearInterval(_hbTimer);  _hbTimer  = null;
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function bumpFastPolling(durationMs = 15000, showMessage){
    _fastUntil = Date.now() + durationMs;
    schedulePoll(NZ_POLL_FAST);
    fastpull_msg = showMessage;
  }

  // --- Export ins Global-Scope ---
  window.startAdaptivePolling = startAdaptivePolling;
  window.stopAdaptivePolling  = stopAdaptivePolling;
  window.bumpFastPolling      = bumpFastPolling;

  // Back-Compat für bestehenden Code, der diese Konstanten noch liest:
  window.NZ_POLL_MS       = NZ_POLL_BASE;
  window.NZ_HEARTBEAT_MS  = NZ_HEARTBEAT_FG;

  // Ready-Event (optional)
  document.dispatchEvent(new CustomEvent('nz:poll-ready'));
})();
startAdaptivePolling();
window.bumpFastPolling?.(30000,true);



/* ========================================================== 
   SETTINGS==========================================SETTINGS --> END
   ========================================================== */

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

window.NZ = window.NZ || {};
window.NZ.api = nzApi; // ControlAPI findet es über NZ.api
async function nzListState(code) {
  const r = await fetch(NZ_API, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ action:"list", code: (code||"").toUpperCase(),pid: nzPlayerId }),
    cache: "no-store"
  });
  if (r.ok) return r.json();
  const t = await r.text();
  throw new Error(`HTTP ${r.status} ${t}`);
}



// --- Lobby render START---
// --- Lobby render (modern Pokémon style) ---
function nzRenderLobby(st){
    if (!elLobbyPane) return;
  
    const _esc = window.esc || (s => String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;"));
  
    const players = Array.isArray(st.players) ? st.players : [];
    const onlineCount = players.filter(p=>p.online).length;
    const code = (nzLobbyCode || st.code || "").toUpperCase();
    const name = nzPlayerName || "";
    const shareUrl = `${location.origin}${location.pathname}?code=${code || ""}`;
    const joinLabel = nzPlayerId ? "Verbinden" : "Beitreten";
  
    elLobbyPane.innerHTML = `
      <div class="card lobby-card">
        <div class="lobby-head">
          <div class="brand">
            <div class="logo" aria-hidden="true"></div>
            <div class="title">Lobby<small>Multiplayer • Pokémon Style</small></div>
          </div>
          <div class="pill">
            <span class="online-dot on"></span>
            <b>${onlineCount}</b>/<b>${players.length}</b> online
          </div>
        </div>
  
        <div class="pk-toolbar">
          <div class="code-row">
            <div class="input-wrap code-wrap">
              <span class="poke-ball" aria-hidden="true"></span>
              <input id="nzCode" type="text" inputmode="latin"
                maxlength="8" style="text-transform:uppercase"
                placeholder="ABC123" value="${_esc(code)}">
                 <button class="btn ghost" id="nzShare2" title="Teilen">Einstellungen</button>
              <button class="btn ghost" style="display:none" id="nzGen" title="Neuen Code erzeugen">Link kopieren</button>
              <button class="btn ghost" style="display:none" id="nzCopy" title="Link kopieren">Code kopieren</button>
              <button class="btn ghost" style="display:none" id="nzShare" title="Teilen">Teilen</button>
              
            </div>
  
            <div class="input-wrap name-wrap">
              <span class="poke-ball" aria-hidden="true"></span>
              <input id="nzName" type="text" hidden="true" placeholder="Dein Name" value="${_esc(name)}" readonly>
<button id="nzRename" class="btn warn" title="Name ändern">TEST</button>
<button id="themeBtn" class="btn warn" title="Name ändern">Theme ändern</button>
<button id="renameBtn" class="btn warn" title="Name ändern">Name ändern</button>
<button id="nzCreate" style="display:none" class="btn ok">Erstellen</button>
<button id="nzJoin" style="display:none" class="btn">${joinLabel}</button>
            </div>
          </div>
  
          <div class="share-row">
            <span class="helper">Link:</span>
            <code id="nzShareLink" class="share-link">${_esc(shareUrl)}</code>
          </div>
        </div>
  
        <div class="lobby-tools">
          <div class="input-wrap">
            <span class="poke-ball" aria-hidden="true"></span>
            <input id="nzPlayerSearch" type="search" placeholder="Spieler durchsuchen …">
            <label class="toggle">
              <input type="checkbox" id="nzHideOffline">
              <span>Offline ausblenden</span>
            </label>
          </div>
        </div>
  
        <div class="players" id="playersList">
          ${players
            .slice()
            .sort((a,b)=> (b.online - a.online) || String(a.name||'').localeCompare(String(b.name||'')))
            .map(p=>`
              <div class="player ${p.online?'on':'off'}" data-pid="${p.id}" data-name="${_esc((p.name||'').toLowerCase())}">

                <div style="display:flex; align-items:center; gap:10px">
                  <span class="online-dot ${p.online?'on':'off'}" title="${p.online?'online':'offline'}"></span>
                  <span class="name">${_esc(p.name||'Trainer')}</span>
                  ${nzPlayerId && p.id===nzPlayerId ? '<span class="you-badge">you</span>' : ''}
                </div>
                <span class="meta">${p.online?'online':'offline'}</span>
              </div>
            `).join('')}
        </div>
      </div>
    `;
    // BADGE ADDON START
    attachLobbyRolesUI(st); // Badges + Rechtsklick-Menü + Spectator-Guards
    // BADGE ADDON ENDE
    // ------- Behavior -------
    const $ = sel => elLobbyPane.querySelector(sel);
    const nzCodeEl = $('#nzCode');
    const nzNameEl = $('#nzName');
    const shareLinkEl = $('#nzShareLink');
    const searchEl = $('#nzPlayerSearch');
    const hideOffEl = $('#nzHideOffline');
    const listEl = $('#playersList');
  
    // Uppercase & Zeichenfilter für Code + Link live updaten
    nzCodeEl?.addEventListener('input', ()=>{
      const cleaned = nzCodeEl.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      if (cleaned !== nzCodeEl.value) nzCodeEl.value = cleaned;
      shareLinkEl.textContent = `${location.origin}${location.pathname}?code=${cleaned}`;
    });

 // Theme-Dialog öffnen:
document.getElementById('themeBtn')?.addEventListener('click', async ()=>{
    const pick = await LoginScreens.openTheme();
    if (pick) {
      // pick = { type:'electric', colors:['#F7D02C','#C7A40A'] }
      // z.B. QuickActions.changeTheme(pick);
      // oder direkt CSS-Variablen setzen:
      const [a,b] = pick.colors;
      document.documentElement.style.setProperty('--ring', a);
      document.documentElement.style.setProperty('--ok', b);
      localStorage.setItem('nuz_theme_type', pick.type);
      localStorage.setItem('nuz_theme_colors', JSON.stringify(pick.colors));
    }
  });

  // Name-Dialog öffnen, Ergebnis selber anwenden:
document.getElementById('renameBtn')?.addEventListener('click', async ()=>{
    const name = await LoginScreens.openName();
    if (name) {
      // selbst entscheiden, was passieren soll:
      //QuickActions.changeName(name, { rejoin:true });
      //state.user.name = name; save(); ensureLogin();
    }
  });
      
  
    // Code generieren
    $('#nzGen')?.addEventListener('click', ()=>{
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I,O,1,0
      const gen = Array.from({length:6}, ()=> alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
      nzCodeEl.value = gen;
      shareLinkEl.textContent = `${location.origin}${location.pathname}?code=${gen}`;
    });
  
    // Link kopieren
    $('#nzCopy')?.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(shareLinkEl.textContent);
        toast('Link kopiert!');
      }catch{ toast('Konnte nicht kopieren'); }
    });
    
    // Web Share API / Fallback Kopieren
    $('#nzShare')?.addEventListener('click', async ()=>{
      const url = shareLinkEl.textContent;
      if(navigator.share){
        try{ await navigator.share({ title:'Nuzlocke Lobby', url }); }
        catch(_e){}
      }else{
        try{ await navigator.clipboard.writeText(url); toast('Link kopiert!'); }catch{}
      }
    });

     // Web Share API / Fallback Kopieren
     $('#nzShare2')?.addEventListener('click', async ()=>{
        newLobyCode = _esc(code); // Lobby Code in einer anderen Variable speichern, da _esc immer überschrieben wird.
        //alert(newLobyCode);
        const res = await LoginScreens.openJoin();
if (!res) return;
if (res.action === 'solo') {
  // nix tun
} else if (res.action === 'join' || res.action === 'create') {
  const code = res.code;
  localStorage.setItem('lobbyCode', code);
  history.replaceState(null,'',`?code=${code}`);
  if (window.NZ?.ensureJoined) {
    await window.NZ.ensureJoined();
    await window.NZ.syncNow?.();
  }
}

      });
  
    // Spieler-Filter
    function applyPlayerFilter(){
      const q = (searchEl?.value||'').toLowerCase().trim();
      const hideOff = !!hideOffEl?.checked;
      listEl?.querySelectorAll('.player').forEach(row=>{
        const name = row.dataset.name || '';
        const isOff = row.classList.contains('off');
        const match = !q || name.includes(q);
        const show = match && (!hideOff || !isOff);
        row.style.display = show ? '' : 'none';
      });
    }
    searchEl?.addEventListener('input', applyPlayerFilter);
    hideOffEl?.addEventListener('change', applyPlayerFilter);
    applyPlayerFilter();
  
    // Mini-Toast
    function toast(msg){
      let t = elLobbyPane.querySelector('.toast');
      if(!t){
        t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        elLobbyPane.appendChild(t);
      }else{
        t.textContent = msg;
      }
      t.classList.add('show');
      setTimeout(()=> t.classList.remove('show'), 1200);
    }
  
    // ------- Deine bestehende Logik (unverändert) -------
    elLobbyPane.querySelector("#nzCreate").onclick = async ()=>{
        
        setTimeout(() =>  PokeLoader.show('Erstelle Lobby…'), 600);
        //alert("test");
      const nm = (nzNameEl?.value || '').trim() || "Spieler";
      nzPlayerName = nm; localStorage.setItem("playerName", nm);
      const j = await nzApi("createLobby", { name:nm, code:"" ,id:nzPlayerId});
      nzPlayerId = j.player.id; nzLobbyCode = j.code;
      localStorage.setItem("playerId", nzPlayerId);
      localStorage.setItem("lobbyCode", nzLobbyCode);
      history.replaceState(null,"",`?code=${nzLobbyCode}`);
      // in nzRenderLobby -> #nzCreate onclick:
localStorage.setItem("nuz_isHost", "1");
      await wipeRoutesAndReloadFromServer();   // ⬅️ bleibt wie gehabt
      await nzSync();
      setTimeout(() =>  PokeLoader.hide(), 2);
      setTimeout(() =>   PokeBanner.ok(`Lobby ${nzLobbyCode} erfolgreich erstellt`), 500);
    };
  
    elLobbyPane.querySelector("#nzJoin").onclick = async ()=>{
        
      const nm = (nzNameEl?.value || '').trim() || "Spieler";
      nzPlayerName = nm; localStorage.setItem("playerName", nm);
      // Nimmt Eingabe, sonst gespeicherten Code; am Ende UPPERCASE
const cd = (nzCodeEl?.value?.trim().toUpperCase())
|| ((localStorage.getItem('lobbyCode') || '').toUpperCase());

      if (!cd) return alert("Bitte Lobby-Code eingeben");
      // in nzRenderLobby -> #nzJoin onclick:
      localStorage.setItem("nuz_isHost", "0");
      nzLobbyCode = cd; localStorage.setItem("lobbyCode", nzLobbyCode);
  
      if (nzPlayerId) {
        await nzApi("rejoinLobby", { pid: nzPlayerId, name: nzPlayerName, code: nzLobbyCode });
      } else {
        const j = await nzApi("joinLobby", { name: nzPlayerName, code: nzLobbyCode,id:nzPlayerId });
        nzPlayerId = j.player.id; localStorage.setItem("playerId", nzPlayerId);
      }
      history.replaceState(null,"",`?code=${nzLobbyCode}`);
      await wipeRoutesAndReloadFromServer();   // ⬅️ bleibt wie gehabt
      await nzSync();
    };

    

    const renameBtn = $('#nzRename');

// „Name ändern“ öffnet wieder den Start-Dialog
renameBtn?.addEventListener('click', openNameDialog);

}
  

  async function quickjoin(cd) {
    
    setTimeout(() => PokeLoader.show('Verbinde zur Lobby…'), 600);
    //console.error(cd);
    //alert("QuickJoin:"+cd);
      //const nm = (nzNameEl?.value || '').trim() || "Spieler";
      //nzPlayerName = nm; localStorage.setItem("playerName", nm);
      //const cd = (nzCodeEl?.value || '').trim().toUpperCase();
      if (!cd) return alert("Bitte Lobby-Code eingeben");
      // in nzRenderLobby -> #nzJoin onclick:
  
      nzLobbyCode = cd; localStorage.setItem("lobbyCode", nzLobbyCode);
      try{
      if (nzPlayerId) {
        //alert("rejoin");
        await nzApi("rejoinLobby", { pid: nzPlayerId, name: nzPlayerName, code: nzLobbyCode });
      } else {
        const j = await nzApi("joinLobby", { name: nzPlayerName, code: nzLobbyCode,id:nzPlayerId });
        nzPlayerId = j.player.id; localStorage.setItem("playerId", nzPlayerId);
      }
        }catch(e){
            history.replaceState(null, "", location.pathname + location.hash);

            setTimeout(() =>  PokeLoader.hide(), 1);
            setTimeout(() =>   PokeBanner.bad(`Lobby ${nzLobbyCode} existiert nicht`), 700);
            //alert("Fehler beim Beitreten: "+ (e?.message || e));
            return;
        }
      localStorage.setItem("nuz_isHost", "0");
      history.replaceState(null,"",`?code=${nzLobbyCode}`);
      await wipeRoutesAndReloadFromServer();   // ⬅️ bleibt wie gehabt
      await nzSync();
      setTimeout(() =>  PokeLoader.hide(), 1);
      setTimeout(() =>   PokeBanner.ok(`Lobby ${nzLobbyCode} erfolgreich beigetreten`), 500);
      setTimeout(() =>   nzSyncBox(), 1000); // BoxDrawer initialisieren
    }

  

  //BADGE ADDON START
  // roles-ui.js – Host-Kontextmenü + Rollen-Badges + Spectator-Guards
(function(){
    const ROLE_LABEL = { host:'Host', cohost:'Co-Host', spectator:'Spectator', player:'' };
  
    // CSS einmalig injizieren
    (function ensureRoleStyle(){
      if (document.getElementById('roles-style')) return;
      const css = `
        .role-badge{margin-left:.5rem;padding:.1rem .4rem;border-radius:.4rem;font-size:.8rem;background:#223;opacity:.9}
        .role-badge.host{background:#3b82f6}
        .role-badge.cohost{background:#10b981}
        .role-badge.spectator{background:#6b7280}
        .ctx-menu{position:absolute;z-index:10000;background:#0b1433;border:1px solid rgba(255,255,255,.12);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.45);padding:.35rem}
        .ctx-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#fff;padding:.4rem .7rem;border-radius:.35rem;font-size:.95rem}
        .ctx-menu button:hover{background:rgba(255,255,255,.09)}
        .ctx-menu hr{border:0;border-top:1px solid rgba(255,255,255,.12);margin:.35rem 0}
        .you-badge{margin-left:.4rem;background:#f59e0b;color:#111;padding:.05rem .4rem;border-radius:.35rem;font-size:.75rem;font-weight:700}
        .role-spectator .slot, .role-spectator .poke-card{cursor:not-allowed}
      `;
      const st = document.createElement('style');
      st.id='roles-style'; st.textContent = css;
      document.head.appendChild(st);
    })();
  
    function renderBadges(container, st){
      container.querySelectorAll('.player[data-pid]').forEach(row=>{
        const pid = row.dataset.pid;
        const p = (st.players||[]).find(x=> String(x.id)===String(pid));
        const role = p?.role || (st.hostId && String(p?.id)===String(st.hostId) ? 'host' : 'player');
        row.dataset.role = role;
        let b = row.querySelector('.role-badge');
        if (!b && (ROLE_LABEL[role]||'').length){
          b = document.createElement('span');
          b.className = 'role-badge';
          row.querySelector('.name')?.after(b);
        }
        if (b){
          b.className = `role-badge ${role}`;
          b.textContent = ROLE_LABEL[role] || '';
          if (!b.textContent) b.remove();
        }
      });
    }
  
    function attachContextMenu(container, st){
      // Nur Host darf verwalten
      const me = (st.players||[]).find(p=> String(p.id)===String(window.nzPlayerId));
      const isHost = me?.role==='host' || (st.hostId && String(st.hostId)===String(window.nzPlayerId)) || localStorage.getItem('nuz_isHost')==='1';
      if (!isHost) return;
  
      let menu;
      const closeMenu = ()=>{ if(menu){ menu.remove(); menu=null; } };
  
      const openMenu = (x,y, pid, isBanned)=>{
        closeMenu();
        menu = document.createElement('div');
        menu.className='ctx-menu';
        menu.style.left = x+'px';
        menu.style.top  = y+'px';
        menu.innerHTML = `
          <button data-act="set:host">Als Host setzen</button>
          <button data-act="set:cohost">Als Co-Host setzen</button>
          <button data-act="set:spectator">Als Spectator setzen</button>
          <button data-act="set:player">Rolle zurücksetzen</button>
          <hr>
          <button data-act="kick">Kicken</button>
          <button data-act="${isBanned?'unban':'ban'}">${isBanned?'Entbannen':'Bannen'}</button>
        `;
        document.body.appendChild(menu);
  
        menu.addEventListener('click', async (e)=>{
          const act = e.target?.dataset?.act; if(!act) return;
          try{
            if (act.startsWith('set:')) {
              await NZ.assignRole(pid, act.split(':')[1]);
            } else if (act==='kick') {
              await NZ.kickPlayer(pid);
            } else if (act==='ban') {
              await NZ.banPlayer(pid);
            } else if (act==='unban') {
              await NZ.unbanPlayer(pid);
            }
            await NZ.syncNow?.();
          } catch(err){
            alert('Aktion fehlgeschlagen: ' + (err?.message || err));
          }
          closeMenu();
        });
        setTimeout(()=> document.addEventListener('click', closeMenu, { once:true }), 0);
      };
  
      container.addEventListener('contextmenu', (e)=>{
        const row = e.target.closest('.player[data-pid]'); if(!row) return;
        const pid = row.dataset.pid;
        if (!pid || String(pid)===String(window.nzPlayerId)) return; // nicht auf sich selbst
        e.preventDefault();
        const p = (st.players||[]).find(x=> String(x.id)===String(pid));
        openMenu(e.pageX, e.pageY, pid, !!p?.banned);
      });
  
      // Mac/Trackpad-Fallbacks: ⌥/⌘-Klick & Long-Press
      container.addEventListener('click', (e)=>{
        if (!e.altKey && !e.metaKey) return;
        const row = e.target.closest('.player[data-pid]'); if(!row) return;
        const pid = row.dataset.pid; if (!pid || pid===String(window.nzPlayerId)) return;
        const p = (st.players||[]).find(x=> String(x.id)===String(pid));
        openMenu(e.pageX, e.pageY, pid, !!p?.banned);
      });
      let holdTimer=null;
      container.addEventListener('mousedown', (e)=>{
        if (e.button!==0) return;
        const row = e.target.closest('.player[data-pid]'); if(!row) return;
        const pid = row.dataset.pid; if (!pid || pid===String(window.nzPlayerId)) return;
        const sx=e.pageX, sy=e.pageY;
        holdTimer=setTimeout(()=>{
          const p = (st.players||[]).find(x=> String(x.id)===String(pid));
          openMenu(sx, sy, pid, !!p?.banned);
          holdTimer=null;
        }, 550);
      });
      ['mouseup','mouseleave','mousemove','scroll','wheel'].forEach(evt=>{
        container.addEventListener(evt, ()=>{ if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; } }, true);
      });
    }
  
    // Spectator: alle mutierenden Aktionen blockieren (soft-guard)
    function attachPermissionGuards(){
      const isSpectator = ()=>{
        const st = window.nzLastListState || {};
        const me = (st.players||[]).find(p=> String(p.id)===String(window.nzPlayerId));
        return me?.role === 'spectator';
      };
      const maybeBlock = (e)=>{
        if (!isSpectator()) return false;
        e.preventDefault(); e.stopPropagation();
        alert('Spectator-Modus: Aktion gesperrt.');
        return true;
      };
      document.addEventListener('click', (e)=>{
        if (e.target.closest('#btnCaught, #btnFailed, #btnClear, #addRouteBtn, .slot [data-remove], [data-remove]')) {
          maybeBlock(e);
        }
      }, true);
      document.addEventListener('dragstart', (e)=>{ maybeBlock(e); }, true);
      document.addEventListener('drop', (e)=>{ maybeBlock(e); }, true);
    }
  
    // Public
    window.attachLobbyRolesUI = function(st){
      const pane = document.querySelector('#nz-lobby'); if (!pane) return;
      renderBadges(pane, st);
      attachContextMenu(pane, st);
    };
  
    attachPermissionGuards();
  })();
  
  //BADEGE ADDON ENDE

  document.querySelector('#themeBtn')?.addEventListener('click', async ()=>{
    const sel = await UIPanels.openThemePicker({ initialType: AppActions.getTheme().type });
    if (sel) AppActions.setTheme(sel); // oder speichern & später anwenden
  });
  
  
// --- Lobby render ENDE ---



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
    try { await nzApi("heartbeat", { pid: nzPlayerId, code: nzLobbyCode }); } catch{}
  }
}
async function nzSync(){    
  if (!nzLobbyCode) { nzRenderLobby({ code:"", players:[] }); return; }
  try {

    const st = await nzListState(nzLobbyCode);

    // ▼ zusätzlich merken --> Anzeige des momentanen Picks in der Lobby
    window.nzLastListState = st;
    try { window._refillBoxViewerOptions?.(); } catch(_){}
    try { renderBox(); } catch(_){}
    //BADGE ADDON START
    try{
        const me = (st.players||[]).find(p=> String(p.id)===String(nzPlayerId));
        document.documentElement.classList.toggle('role-spectator', me?.role==='spectator');
        const hostId = st.hostId || (st.players||[]).find(p=>p.role==='host')?.id;
        if (hostId) localStorage.setItem('nuz_isHost', String(hostId)===String(nzPlayerId) ? '1' : '0');
      }catch{}
    //BADGE ADDON ENDE

    // Cache: letzter Stand route->slot (für Idempotenzcheck)
    nzLastRouteSlots = new Map((st.routeSlots || []).map(x => [x.route, x.slot]));
    nzRenderLobby(st);
    nzRenderAllTeams(st);
    nzApplyGlobalToLocal(st);
  } catch(e) {
    console.error("[NZ] sync failed:", e);
  }
}
// setInterval(nzHeartbeat, NZ_HEARTBEAT_MS);
// setInterval(nzSync, NZ_POLL_MS);

// --- Auto-Join bei ?code= ---
(async()=>{
  const urlCode = (new URL(location.href)).searchParams.get("code");
  if (urlCode) { nzLobbyCode = urlCode.toUpperCase(); localStorage.setItem("lobbyCode", nzLobbyCode); }
  if (nzLobbyCode && !nzPlayerId) {
    const nm = (state?.user?.name || nzPlayerName || prompt("Dein Name?") || "Spieler").trim();
    nzPlayerName = nm; localStorage.setItem("playerName", nm);
    const j = await nzApi("joinLobby", { name:nm, code:nzLobbyCode,id:nzPlayerId });
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
      const j = await nzApi("joinLobby", { name: nm, code: nzLobbyCode || "",id:nzPlayerId });
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
      try { await nzApi("rejoinLobby", { pid: nzPlayerId, name: (nzPlayerName || state?.user?.name || "Spieler"), code: nzLobbyCode }); } catch(_) {}
    }
  },

  async upsertPokemon(route, species, caught, nickname=getnickname()){
    console.warn(caught);
    await this.ensureJoined();
    await nzApi('upsertPokemon', {
        code: nzLobbyCode,          // <— wird gesendet
        pid: nzPlayerId,
        route,
        species,
        caught: caught,
        nickname
      });
  },

  async assignGlobalSlot(route, slot){
    await this.ensureJoined();
    await nzApi('assignRouteSlot', { code: nzLobbyCode, pid: nzPlayerId, route, slot });
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
      await nzApi('clearRouteSlot', { code: nzLobbyCode, pid: nzPlayerId, route });
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
      await nzApi('assignRouteSlot', { code: nzLobbyCode, pid: nzPlayerId, route, slot: targetSlot });
    } catch (e1) {
      const msg = String(e1.message || "");
      if (/duplicate|unique|exists/i.test(msg)) {
        // Versuch per UPDATE/UPSERT
        try {
          await nzApi('updateRouteSlot', { code: nzLobbyCode, pid: nzPlayerId, route, slot: targetSlot });
        } catch (e2) {
          try {
            await nzApi('upsertRouteSlot', { code: nzLobbyCode, pid: nzPlayerId, route, slot: targetSlot });
          } catch (e3) {
            // letzter Versuch: aktuelle Route löschen → dann normal setzen
            try {
              await this.clearRouteSlot(route);
              await nzApi('assignRouteSlot', { code: nzLobbyCode, pid: nzPlayerId, route, slot: targetSlot });
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
  //BADGE ADDON START
  // --- Rollen & Moderation ---
async assignRole(targetId, role){
    await this.ensureJoined();
    return nzApi('assignRole', {
      code: nzLobbyCode, pid: nzPlayerId, targetId, role // role: 'host'|'cohost'|'spectator'|'player'
    });
  },
  async kickPlayer(targetId){
    await this.ensureJoined();
    return nzApi('kickPlayer', { code: nzLobbyCode, pid: nzPlayerId, targetId });
  },
  async banPlayer(targetId){
    await this.ensureJoined();
    return nzApi('banPlayer', { code: nzLobbyCode, pid: nzPlayerId, targetId });
  },
  async unbanPlayer(targetId){
    await this.ensureJoined();
    return nzApi('unbanPlayer', { code: nzLobbyCode, pid: nzPlayerId, targetId });
  },
  
  //BADGE ADDON ENDE
  
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
  try{

  return nickname.value.trim() || null;
  }catch{
    console.warn("No nickname element found - Probably through Lobby loaded");
  }
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
  
  function clickjoinLobby(){
    alert("test2");
  nzJoin.click();
}

async function clickCreateLobby(){
  
    nzCreate.click();
  }

  async function copylink(){
    try{
      const el = window.nzShareLinkEl || document.querySelector('#nzShareLink');
      const url = el?.textContent?.trim() ||
                  `${location.origin}${location.pathname}?code=${(window.nzLobbyCode||'').toUpperCase()}`;
      await navigator.clipboard.writeText(url);
      // toast?.('Link kopiert!');
    }catch(e){ console.error(e); }
  }
  
  function copylooby(){
    //quickjoin('JFHUET');
    //return;
    try {
      const code = new URL(location.href).searchParams.get('code') || '';
      if (!code) { alert('Kein Lobby-Code in der URL gefunden.'); return; }
      navigator.clipboard.writeText(code.toUpperCase());
      // Optional: toast('Code kopiert!');
    } catch (e) {
      console.error(e);
      alert('Konnte den Code nicht kopieren.');
    }
  }

// immer nach dem Laden starten

if(localStorage.getItem('lobbyCode') == null)
{
    openNameDialog();
}

//ROUTES UTILITY LOAD DATA
//START
//ROUTES UTILITY LOAD DATA

// 1) Einfach & robust: exakt (case-insensitive)
function getRouteByName(name){
  console.log(state?.routes);
  if (!name || !Array.isArray(state?.routes)) return null;
  const target = String(name).trim().toLowerCase();
  console.warn('getRouteByName:', target);
  return state.routes.find(r => String(r.name).trim().toLowerCase() === target) || null;
}

// Aufrufsbeispiel
async function nzSyncBox(){
  const st = window.nzLastListState || {};

  // alle Spieler:
  (st.pokemons || []).forEach(p => {
    console.log('Spieler:', p.route, p.species, p.nickname,p.caught);
    catchPokemonByName(p.species, getRouteByName(p.route),p.nickname,p.caught);
  });
}
//setTimeout(nzSyncBox, 5000);
/*
setTimeout(() => {
  const st = window.nzLastListState || {};

// alle Spieler:
(st.pokemons || []).forEach(p => {
  console.log('Spieler:', p.route, p.species, p.nickname,p.caught);
  catchPokemonByName(p.species, getRouteByName(p.route),p.nickname);
});

  console.warn(getRouteByName('TEST'));
 
}, 5000);
*/

/** ID aus Name holen – nutzt normMonName + (pokedex || localStorage) */
function getPokemonIdByName(name, listOverride=null){
  if (!name) return null;
  const key = normMonName(String(name));
  const list =
    (Array.isArray(listOverride) && listOverride.length) ? listOverride :
    (Array.isArray(pokedex) && pokedex.length) ? pokedex :
    getLocalPokedex();
  if (!Array.isArray(list) || !list.length) return null;
  const hit = list.find(p => (p.name || '').toLowerCase() === key);
  return hit?.id ?? null;
}

async function catchPokemonByName(namePokemon,rt,nickname2,catchstatus)
{
  console.error(catchstatus);
  let catchaddon = '';
  if(catchstatus == 'true') {catchstatus = 'true'; catchaddon = ',ALIVE';}
  if(catchstatus == 'false') {catchstatus = 'false'; catchaddon = ',failed';}
  if(catchstatus == 'dead') {catchstatus = 'dead'; catchaddon = ',RIP BOX';}
  //ID durch Name bekommen
  const id = getPokemonIdByName(namePokemon); 
  //console.log('getPokemonIdByName Pikachu:', id); // Sollte 25 sein

  const chosen = pokedex.find(p=>p.id===id);
  if(!chosen) { console.warn('catchPokemonById: no such pokemon id', id); return; }
  // 🎯 Wurf + Fang-Animation
  //await RouteFX.epicCatch('#encSprite', rt.name); // ← Animation
      rt.encounter = {
        status:catchstatus, pokemonId: chosen.id, pokemonName: chosen.name, sprite: SPRITE(chosen.id), nickname: nickname2, updatedAt: now()
      };
      const exists = state.box.find(m=>m.routeName===rt.name);
      if(!exists){
        state.box.push({ uid:uid(), id:chosen.id, name:chosen.name, sprite:SPRITE(chosen.id), routeName:rt.name, nickname:nickname2, caughtAt:now(), isInTeam:false,
        lobbyCode: currentLobbyCode(),
        type: getTypesByNameFromLocal(chosen.name)+catchaddon    // ⬅️ neu
       });
      }
      save(); renderRoutes(); renderEncounter(); renderBox(); renderBoxDrawer(); renderRouteGroups();
      if(catchstatus == 'true') {catchstatus = 'true'; catchaddon = '';}
      // Server: species für "All Teams" aktualisieren
      if (window.NZ) window.NZ.upsertPokemon(rt.name, toTitle(chosen.name), catchstatus).catch(console.error);
} 



// Case-insensitive Route-Key aus einem Objekt wie boxes[pid] holen
function _findRouteKey(routesObj, routeName){
  const wanted = String(routeName || '').toLowerCase();
  for (const k of Object.keys(routesObj || {})){
    if (k.toLowerCase() === wanted) return k;
  }
  return null;
}

// Wert-Normalisierung: was gilt als "erfolgreich"?
function _isSuccess(val){
  const v = String(val ?? '').toLowerCase();
  return v === 'true' || v === 'caught' || v === 'yes' || v === '1';
}

/**
 * Prüft, ob für eine Route alle vorhandenen Einträge "erfolgreich" sind.
 * - nutzt standardmäßig window.nzLastListState (dein Objekt)
 * - Spieler ohne Eintrag für die Route werden ignoriert
 * Rückgabe:
 *   true  → keiner blockt
 *   [..]  → Array der Spielernamen, die blocken
 */
function checkifpokemonisusable(routeName, st = window.nzLastListState){
  if (!routeName) return true;
  if (!st || !st.boxes) return true;

  const players = Array.isArray(st.players) ? st.players : [];
  const boxes   = st.boxes || {};

  // Map: playerId -> Name
  const nameOf = (id) => (players.find(p => String(p.id) === String(id))?.name) || String(id);

  const blockers = [];

  // boxes: { player_id: { "Route": { caught, species, nickname }, ... }, ... }
  for (const [pid, routes] of Object.entries(boxes)){
    const key = _findRouteKey(routes, routeName);
    if (!key) continue; // kein Eintrag auf dieser Route → ignorieren
    const entry = routes[key];
    console.warn(entry);
    if (!_isSuccess(entry?.caught)) {
      blockers.push(nameOf(pid));
    }
  }

  return blockers.length === 0 ? true : blockers;
}



//ROUTES UTILITY LOAD DATA
//END
//ROUTES UTILITY LOAD DATA
  

PokeSelect.enhance('#boxViewerSelect', { placeholder: 'Box wählen…' });
  

  
  
  //EXPORT
  window.clickCreateLobby = clickCreateLobby; // <-- global verfügbar machen
  window.copylooby = copylooby; // <-- global verfügbar machen
  window.copylink = copylink; // <-- global verfügbar machen
  window.quickjoin = quickjoin; // <-- global verfügbar machen
