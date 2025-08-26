/* ===== Games Tab (self-contained) ===== */

// Utilities
const _q  = (s, r=document) => r.querySelector(s);
const _qq = (s, r=document) => Array.from(r.querySelectorAll(s));

// Build PokeAPI official artwork URL
const OFFICIAL_ART = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

// Fallback Pokéball (Data-URL)
const POKEBALL_FALLBACK =
  "data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>\
<defs><radialGradient id='g' cx='50%' cy='35%'><stop offset='0%' stop-color='%23fff'/><stop offset='60%' stop-color='%23ddd'/><stop offset='100%' stop-color='%23999'/></radialGradient></defs>\
<circle cx='60' cy='60' r='56' fill='url(%23g)'/>\
<rect x='0' y='54' width='120' height='12' fill='%23111'/>\
<circle cx='60' cy='60' r='16' fill='%23fff' stroke='%23111' stroke-width='8'/>\
</svg>";

// Data
const GAME_LS_KEY = 'nuz_game_v1';

const GAMES = [
  {slug:'red-blue',      name:'Red / Blue',           gen:1, region:'Kanto'},
  {slug:'yellow',        name:'Yellow',               gen:1, region:'Kanto'},
  {slug:'firered-leafgreen', name:'FireRed / LeafGreen', gen:3, region:'Kanto'},
  {slug:'gold-silver',   name:'Gold / Silver',        gen:2, region:'Johto'},
  {slug:'crystal',       name:'Crystal',              gen:2, region:'Johto'},
  {slug:'heartgold-soulsilver', name:'HeartGold / SoulSilver', gen:4, region:'Johto'},
  {slug:'ruby-sapphire', name:'Ruby / Sapphire',      gen:3, region:'Hoenn'},
  {slug:'emerald',       name:'Emerald',              gen:3, region:'Hoenn'},
  {slug:'diamond-pearl', name:'Diamond / Pearl',      gen:4, region:'Sinnoh'},
  {slug:'platinum',      name:'Platinum',             gen:4, region:'Sinnoh'},
  {slug:'black-white',   name:'Black / White',        gen:5, region:'Unova'},
  {slug:'black2-white2', name:'Black 2 / White 2',    gen:5, region:'Unova'},
  {slug:'x-y',           name:'X / Y',                gen:6, region:'Kalos'},
  {slug:'oras',          name:'Omega Ruby / Alpha Sapphire', gen:6, region:'Hoenn'},
  {slug:'sun-moon',      name:'Sun / Moon',           gen:7, region:'Alola'},
  {slug:'ultra-sun-moon',name:'Ultra Sun / Ultra Moon',gen:7, region:'Alola'},
  {slug:'letsgo',        name:"Let's Go Pikachu/Eevee", gen:7, region:'Kanto'},
  {slug:'sword-shield',  name:'Sword / Shield',       gen:8, region:'Galar'},
  {slug:'bdsp',          name:'Brilliant Diamond / Shining Pearl', gen:8, region:'Sinnoh'},
  {slug:'arceus',        name:'Legends: Arceus',      gen:8, region:'Hisui'},
  {slug:'scarlet-violet',name:'Scarlet / Violet',     gen:9, region:'Paldea'}
];

// Cover/Mascot dex ids (official-artwork exists für diese IDs)
const GAME_ART = {
  'red-blue':6, 'yellow':25, 'firered-leafgreen':3,
  'gold-silver':250, 'crystal':249, 'heartgold-soulsilver':250,
  'ruby-sapphire':382, 'emerald':384, 'oras':384,
  'diamond-pearl':483, 'platinum':487, 'bdsp':483,
  'black-white':643, 'black2-white2':644,
  'x-y':716, 'sun-moon':791, 'ultra-sun-moon':792, 'letsgo':25,
  'sword-shield':888, 'arceus':493, 'scarlet-violet':1008
};

// Accent color per region
const REGION_ACCENT = {
  'Kanto':'#FF4D4D', 'Johto':'#C0A256', 'Hoenn':'#2EC4B6', 'Sinnoh':'#7F8CFF',
  'Unova':'#00C2FF', 'Kalos':'#8D4DFF', 'Alola':'#FFB84D', 'Galar':'#FF4DA6',
  'Paldea':'#6FE07D', 'Hisui':'#8BB9FF'
};

const GAME_ROUTES = {
  'kanto-basic': ['Route 1','Route 2','Route 3','Route 4','Route 5','Route 6','Viridian Forest','Pewter City','Mt. Moon','Cerulean City','Route 24','Route 25'],
  'johto-basic': ['New Bark Town','Route 29','Cherrygrove City','Route 30','Route 31','Dark Cave','Violet City','Sprout Tower','Route 32','Ruins of Alph','Union Cave'],
  'hoenn-basic': ['Littleroot Town','Route 101','Route 102','Route 103','Petalburg Woods','Route 104','Rustboro City','Dewford Town','Granite Cave','Route 109'],
  'sinnoh-basic':['Twinleaf Town','Route 201','Lake Verity','Route 202','Jubilife City','Route 203','Oreburgh Gate','Oreburgh Mine','Route 204','Floaroma Town'],
  'unova-basic': ['Nuvema Town','Route 1','Route 2','Accumula Town','Wellspring Cave','Striaton City','Dreamyard','Route 3','Pinwheel Forest','Castelia City'],
  'kalos-basic': ['Vaniville Town','Route 2','Santalune Forest','Route 3','Santalune City','Route 4','Lumiose City','Route 5','Camphrier Town','Route 6'],
  'alola-basic': ['Route 1','Iki Town','Hau’oli City','Hau’oli Outskirts','Route 2','Verdant Cavern','Route 3','Melemele Meadow','Seaward Cave','Heahea City'],
  'galar-basic': ['Route 1','Route 2','Motostoke','Wild Area','Route 3','Galar Mine','Route 4','Turffield','Hulbury','Route 5'],
  'paldea-basic':['Los Platos','South Province (Area One)','South Province (Area Two)','South Province (Area Three)','Artazon','East Province (Area One)','East Province (Area Two)','Levincia','West Province (Area One)','West Province (Area Two)']
};

const GAME_TO_ROUTESET = {
  'red-blue':'kanto-basic','yellow':'kanto-basic','firered-leafgreen':'kanto-basic','letsgo':'kanto-basic',
  'gold-silver':'johto-basic','crystal':'johto-basic','heartgold-soulsilver':'johto-basic',
  'ruby-sapphire':'hoenn-basic','emerald':'hoenn-basic','oras':'hoenn-basic',
  'diamond-pearl':'sinnoh-basic','platinum':'sinnoh-basic','bdsp':'sinnoh-basic',
  'black-white':'unova-basic','black2-white2':'unova-basic',
  'x-y':'kalos-basic','sun-moon':'alola-basic','ultra-sun-moon':'alola-basic',
  'sword-shield':'galar-basic','arceus':'sinnoh-basic','scarlet-violet':'paldea-basic'
};

function genLabel(n){ return `Gen ${['I','II','III','IV','V','VI','VII','VIII','IX'][n-1] || n}`; }

/* Ensure tab & panel exist (auto-insert if missing) */
(function ensureGamesTab(){
  const tabs = _q('#tabs');
  if (tabs && !tabs.querySelector('[data-tab="games"]')){
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = 'games';
    btn.textContent = 'Spiel';
    tabs.appendChild(btn);
    btn.addEventListener('click', ()=> setActiveTab ? setActiveTab('games') : activateTabFallback('games'));
  }
  if (!_q('#panel-games')){
    const sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'panel-games';
    sec.innerHTML = `
      <div class="card">
        <div class="lobby-head" style="margin-bottom:10px">
          <div class="brand">
            <div class="logo" aria-hidden="true"></div>
            <div class="title">Spiel auswählen<small>Pokémon • moderne Auswahl</small></div>
          </div>
          <span class="pill" id="gameSelectedPill">Aktuell: –</span>
        </div>

        <div class="pk-toolbar">
          <div class="input-wrap" style="flex:1">
            <span class="poke-ball" aria-hidden="true"></span>
            <input id="gameSearch" type="search" placeholder="Suche nach Spiel, Region, Gen …" autocomplete="off">
            <button class="btn ghost" id="gameClear">Reset</button>
          </div>
          <div class="chip-group">
            <div class="chip-title">Generationen</div>
            <div class="chip-row" id="genChips"></div>
          </div>
        </div>

        <div class="games-grid" id="gameGrid" aria-live="polite"></div>

        <div class="game-actions">
          <div class="helper" id="pickedInfo">Kein Spiel ausgewählt.</div>
          <div class="row" style="gap:8px">
            <button class="btn" id="gameCancel">Abbrechen</button>
            <button class="btn ok" id="gameConfirm" disabled>Auswahl übernehmen</button>
          </div>
        </div>
      </div>
    `;
    // ans Ende von <main> hängen
    const main = _q('main') || document.body;
    main.appendChild(sec);
  }
})();

// Fallback, falls setActiveTab nicht existiert
function activateTabFallback(tab){
  _qq('#tabs .tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  _qq('.panel').forEach(p=>p.classList.toggle('active', p.id===`panel-${tab}`));
}

/* Render + Behavior */
function renderGamesTab(){
  const grid = _q('#gameGrid');
  if(!grid) return;

  const chipHost   = _q('#genChips');
  const searchEl   = _q('#gameSearch');
  const clearBtn   = _q('#gameClear');
  const confirmBtn = _q('#gameConfirm');
  const cancelBtn  = _q('#gameCancel');
  const pickedInfo = _q('#pickedInfo');
  const pill       = _q('#gameSelectedPill');

  // Pill aktualisieren
  try {
    const sel = JSON.parse(localStorage.getItem(GAME_LS_KEY) || 'null');
    pill.textContent = `Aktuell: ${sel ? sel.name : '–'}`;
  } catch { pill.textContent = 'Aktuell: –'; }

  // Gen-Chips
  const gens = [...new Set(GAMES.map(g=>g.gen))].sort((a,b)=>a-b);
  chipHost.innerHTML = '';
  gens.forEach(g=>{
    const c = document.createElement('button');
    c.type='button'; c.className='gen-chip'; c.dataset.gen=String(g);
    c.textContent = genLabel(g);
    c.addEventListener('click', ()=>{ c.classList.toggle('active'); filterGames(); });
    chipHost.appendChild(c);
  });

  // Suche / Reset
  searchEl?.addEventListener('input', filterGames);
  clearBtn?.addEventListener('click', ()=>{
    if (searchEl) searchEl.value='';
    _qq('#genChips .gen-chip.active').forEach(x=>x.classList.remove('active'));
    filterGames();
  });

  cancelBtn?.addEventListener('click', ()=>{
    if (searchEl) searchEl.value='';
    _qq('#genChips .gen-chip.active').forEach(x=>x.classList.remove('active'));
    filterGames();
  });

  // Initial
  filterGames();

  function filterGames(){
    const q = (searchEl?.value||'').toLowerCase().trim();
    const picked = JSON.parse(localStorage.getItem(GAME_LS_KEY) || 'null');
    const gensOn = new Set(_qq('#genChips .gen-chip.active').map(x=>Number(x.dataset.gen)));

    const list = GAMES.filter(g=>{
      const text = `${g.name} ${g.region} ${genLabel(g.gen)}`.toLowerCase();
      const okQ = q ? text.includes(q) : true;
      const okGen = gensOn.size ? gensOn.has(g.gen) : true;
      return okQ && okGen;
    });

    draw(list, picked);
  }

  function draw(list, picked){
    grid.innerHTML='';
    list.forEach(g=>{
      const card = document.createElement('div');
      card.className = 'game-card';
      if (picked && picked.slug===g.slug) card.classList.add('selected');

      const accent = REGION_ACCENT[g.region] || getComputedStyle(document.documentElement).getPropertyValue('--ring') || '#ffd23f';
      card.style.setProperty('--accent', accent);

      card.innerHTML = `
        <div class="art" aria-hidden="true"><img class="art-img" alt="" loading="lazy"></div>
        <div class="glow"></div>
        <div class="head">
          <div class="name">${g.name}</div>
          <span class="badge">${genLabel(g.gen)}</span>
        </div>
        <div class="rgn">${g.region}</div>
        <div class="chips"><span class="type-badge">${g.region}</span></div>
      `;

      // Bild robust setzen
      const img = card.querySelector('.art-img');
      const url = OFFICIAL_ART(GAME_ART[g.slug]);
      img.onload = ()=>{}; // noop
      img.onerror = ()=>{ img.src = POKEBALL_FALLBACK; };
      img.src = url;

      // Auswahl
      card.addEventListener('click', ()=>{
        _qq('#gameGrid .game-card').forEach(x=>x.classList.remove('selected'));
        card.classList.add('selected');
        pickedInfo.textContent = `Ausgewählt: ${g.name} (${g.region}, ${genLabel(g.gen)})`;
        grid.dataset.selected = g.slug;
        if (confirmBtn) confirmBtn.disabled = false;
      });

      // Parallax
      card.addEventListener('pointermove', (e)=>{
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top  + r.height/2;
        const dx = (e.clientX - cx) / (r.width/2);
        const dy = (e.clientY - cy) / (r.height/2);
        const max = 6;
        card.style.setProperty('--tiltX', `${dx*max}deg`);
        card.style.setProperty('--tiltY', `${-dy*max}deg`);
      });
      card.addEventListener('pointerleave', ()=>{
        card.style.setProperty('--tiltX','0deg');
        card.style.setProperty('--tiltY','0deg');
      });

      grid.appendChild(card);
    });

    if (!grid.children.length){
      grid.innerHTML = `<div class="card" style="grid-column:1/-1; padding:14px">Keine Treffer.</div>`;
    }
    if (confirmBtn){
      confirmBtn.disabled = !_q('#gameGrid .game-card.selected');
      if(confirmBtn.disabled) pickedInfo.textContent = 'Kein Spiel ausgewählt.';
    }
  }

  // Übernehmen
  confirmBtn?.addEventListener('click', ()=>{
    const slug = grid.dataset.selected;
    const game = GAMES.find(g=>g.slug===slug);
    if(!game) return;

    localStorage.setItem(GAME_LS_KEY, JSON.stringify({ slug: game.slug, name: game.name, gen: game.gen, region: game.region, ts: Date.now() }));
    if (pill) pill.textContent = `Aktuell: ${game.name}`;

    // Nur im Singleplayer: Routen setzen (wenn deine App-Funktionen verfügbar sind)
    const inLobby = !!(window.nzLobbyCode);
    if(!inLobby){
      const key = GAME_TO_ROUTESET[game.slug];
      const routes = key ? GAME_ROUTES[key] : null;
      if (Array.isArray(routes) && routes.length){
        if (typeof window.applyServerRoutes === 'function'){
          const serverRoutes = routes.map(n => ({ name:n, ord:9999 }));
          window.applyServerRoutes(serverRoutes);
        } else if (window.state){
          // Fallback (ohne applyServerRoutes)
          const next = routes.map(n => ({
            id: routeIdFromName ? routeIdFromName(n) : `r${Math.abs(n.split('').reduce((h,c)=>(h*31+c.charCodeAt(0))|0,0))}`,
            name: n,
            encounter: { status:'pending', pokemonId:null, pokemonName:'', sprite:null, nickname:'', updatedAt:null }
          }));
          window.state.routes = next;
          try {
            window.save?.();
            window.renderRoutes?.();
            window.renderEncounter?.();
          } catch {}
        }
      }
    } else {
      alert('In der Lobby verwaltet der Server die Routen. Deine Spielwahl wurde gespeichert.');
    }
  });
}

// Initial render after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderGamesTab);
} else {
  renderGamesTab();
}

// Expose for manual re-render (optional)
window.renderGamesTab = renderGamesTab;
