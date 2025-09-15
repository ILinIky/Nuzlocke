const POKEDEX_KEY = 'nuz_pokedex_v2';

/* ---------- Pokédex ---------- */
let pokedex = [];                // Arbeitsspeicher
let pokedexLoadPromise = null;   // Dedupe paralleler Loads

function loadPokedexFromLocal(){
  try{
    const raw = localStorage.getItem(POKEDEX_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  }catch{ return null; }
}

function savePokedexToLocal(list){
  localStorage.setItem(POKEDEX_KEY, JSON.stringify(list));
}

// Beim Start: falls vorhanden, direkt aus localStorage holen
(function initPokedexFromLocal(){
  const local = loadPokedexFromLocal();
  if (local && local.length){
    pokedex = local;
    console.log('[pokedex] loaded (init/localStorage):', pokedex.length);
  } else {
    console.log('[pokedex] not loaded at init (no cache)');
  }
})();

// Nur laden, wenn nicht vorhanden
async function ensurePokedexIfMissing(){
  // 1) Im Speicher?
  if (Array.isArray(pokedex) && pokedex.length){
    console.log('[pokedex] loaded (memory):', pokedex.length);
    return pokedex;
  }
  // 2) localStorage?
  const local = loadPokedexFromLocal();
  if (local && local.length){
    pokedex = local;
    console.log('[pokedex] loaded (localStorage):', pokedex.length);
    return pokedex;
  }
  // 3) Lädt bereits?
  if (pokedexLoadPromise){
    console.log('[pokedex] loading already in progress (dedupe)…');
    return pokedexLoadPromise;
  }

  // 4) Nicht vorhanden → jetzt laden
  console.log('[pokedex] not loaded -> fetching…');
  pokedexLoadPromise = (async () => {
    try{
      const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=2025 ');
      const data = await res.json();
      const list = (data.results || [])
        .map(x => {
          const m = x.url.match(/pokemon\/(\d+)\/?$/);
          return { id: m ? Number(m[1]) : null, name: x.name };
        })
        .filter(x => x.id);
      savePokedexToLocal(list);
      pokedex = list;
      console.log('[pokedex] loaded (network):', pokedex.length);
      document.dispatchEvent(new CustomEvent('nz:pokedex-ready', { detail:{ count: pokedex.length }}));
      return pokedex;
    } catch (e){
      console.warn('[pokedex] fetch failed, using fallback:', e);
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
      return pokedex;
    } finally {
      pokedexLoadPromise = null;
    }
  })();

  return pokedexLoadPromise;
}

// neu:
ensurePokedexIfMissing()
  .then(()=>{ renderEncounter(); save(); })
  .catch(()=>{});