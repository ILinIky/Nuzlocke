/* ---------- Utilities ---------- */
// ==== Moves-Katalog (einmalig laden & lokal cachen) ====
const MOVES_VERSION = 1;                                  // bumpen, falls Schema ändert
const MOVES_CACHE_KEY = 'nuz_moves_v1';
let movesCatalog = null;

function loadMovesFromLocal(){
  try{
    const raw = localStorage.getItem(MOVES_CACHE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if (data?.version !== MOVES_VERSION) return null;
    return Array.isArray(data.list) ? data.list : null;
  }catch{ return null; }
}

function saveMovesToLocal(list){
  const payload = { version: MOVES_VERSION, savedAt: new Date().toISOString(), count: list.length, list };
  localStorage.setItem(MOVES_CACHE_KEY, JSON.stringify(payload));
}

// kleine Heuristik, wie „gut“ ein Move ist (theoretisch, nicht kompetitiv!)
function scoreMove(item){
  const pow = item.power || 0;
  const acc = (item.accuracy == null ? 100 : item.accuracy) / 100;
  const pri = Math.max(0, item.priority || 0);
  const sec = (item.flinch_chance||0)*0.2
            + (item.ailment_chance||0)*0.2
            + (item.stat_chance||0)*0.1
            + (item.crit_rate||0)*5
            + (item.drain>0 ? item.drain*0.3 : 0);
  return item.damage_class === 'status' ? pri*10 + sec : pow*acc + pri*10 + sec;
}

// PokeAPI-Harvest (einmalig), freundlich zum Rate-Limit
async function fetchAllMovesDirect(){
  const base = 'https://pokeapi.co/api/v2';
  const index = await fetch(`${base}/move?limit=2000`).then(r=>r.json());
  const results = index?.results || [];
  const out = [];
  const concurrency = 10;

  for (let i=0; i<results.length; i+=concurrency){
    const batch = results.slice(i, i+concurrency);
    const datas = await Promise.all(batch.map(x =>
      fetch(x.url).then(r=>r.json()).catch(()=>null)
    ));
    for (const m of datas){
      if (!m) continue;
      const mc = m.meta || {};
      const eff = (m.effect_entries||[]).find(e=>e.language?.name==='en');
      const item = {
        id: m.id,
        name: m.name,                       // z.B. "flamethrower"
        type: m.type?.name || null,         // "fire"
        damage_class: m.damage_class?.name || null, // "physical" | "special" | "status"
        power: m.power,
        accuracy: m.accuracy,
        pp: m.pp,
        priority: m.priority,
        crit_rate: mc.crit_rate || 0,
        drain: mc.drain || 0,               // >0 = Heilung, <0 = Recoil
        flinch_chance: mc.flinch_chance || 0,
        ailment: mc.ailment?.name || null,
        ailment_chance: mc.ailment_chance || 0,
        stat_chance: mc.stat_chance || 0,
        short_effect: eff?.short_effect || null
      };
      item.score = scoreMove(item);
      out.push(item);
    }
    // höfliche Pause gegen Rate-Limits
    await new Promise(res => setTimeout(res, 120));
  }
  return out;
}

// Optional: Server-Fallback, falls du einen Endpoint 'moves_dump' baust
async function fetchAllMovesViaServer(){
  if (typeof nzApi !== 'function') return null;
  try {
    const r = await nzApi('moves_dump', {}); // sollte { moves: [...] } liefern
    if (r && Array.isArray(r.moves)) return r.moves;
  } catch {}
  return null;
}

// öffentlicher Entry: einmalig sichern, dann nur noch aus localStorage lesen
async function ensureMovesCatalog(force=false){
  if (!force){
    const local = loadMovesFromLocal();
    if (local){ movesCatalog = local; return local; }
  }
  let list = await fetchAllMovesViaServer();
  if (!list) list = await fetchAllMovesDirect();
  saveMovesToLocal(list);
  movesCatalog = list;
  return list;
}

// einfache Suche/Filter darüber (optional, nützlich fürs UI)
function searchMoves({ q='', type='', damage_class='', minPower=null, minAcc=null }={}){
  const list = movesCatalog || loadMovesFromLocal() || [];
  const qq = q.trim().toLowerCase();
  return list
    .filter(m => {
      if (qq && !m.name.toLowerCase().includes(qq)) return false;
      if (type && m.type !== type) return false;
      if (damage_class && m.damage_class !== damage_class) return false;
      if (minPower!=null && (m.power||0) < minPower) return false;
      if (minAcc!=null && (m.accuracy||0) < minAcc) return false;
      return true;
    })
    .sort((a,b)=> (b.score||0) - (a.score||0));
}

let movesLoadPromise = null;

// Nur laden, wenn nichts im Speicher/LocalStorage vorhanden ist
async function ensureMovesCatalogIfMissing(){
  if (movesCatalog && movesCatalog.length) return movesCatalog;

  // Versuch: aus localStorage holen (z. B. wenn init zu früh kam)
  // 2) Aus localStorage ziehen?
  const local = loadMovesFromLocal();
  if (local && local.length){
    movesCatalog = local;
    console.log('[moves] loaded (localStorage):', movesCatalog.length);
    return movesCatalog;
  }

 // 3) Lädt bereits gerade?
 if (movesLoadPromise){
    console.log('[moves] loading already in progress (dedupe)…');
    return movesLoadPromise;
  }

   // 4) Nichts vorhanden -> jetzt laden
   console.log('[moves] not loaded -> fetching…');

  movesLoadPromise = (async () => {
    let list = await fetchAllMovesViaServer();
    if (!list) list = await fetchAllMovesDirect();
    saveMovesToLocal(list);
    movesCatalog = list;
    // UI kann darauf hören und neu rendern
    document.dispatchEvent(new CustomEvent('nz:moves-ready', { detail:{ count:list.length }}));
    return list;
  })();

  try { return await movesLoadPromise; }
  finally { movesLoadPromise = null; }
}

// Beim Start versuchen, lokalen Cache zu übernehmen
(function initMovesFromLocal(){
    const local = loadMovesFromLocal();
    if (local) movesCatalog = local;
  })();
  

// Wirklich nur, wenn nichts vorhanden ist
ensureMovesCatalogIfMissing().catch(err => console.warn('moves harvest failed', err));
