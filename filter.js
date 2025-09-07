
/* ------------------------------ Box Filters (Pokémon Style) ------------------------------ */
(function(){
  const grid = document.getElementById('boxGrid');
  if(!grid) return;

  const searchEl  = document.getElementById('boxSearch');
  const typesWrap = document.getElementById('chipTypes');
  const routesWrap= document.getElementById('chipRoutes');
  const  specialboxes = document.getElementById('chipBoxes');
  const clearBtn  = document.getElementById('boxClear');
  const countEl   = document.getElementById('boxCount');

  const selected = { types:new Set(), routes:new Set(), query:'' };

  const typeClass = t => `type-${t.toLowerCase()}`;

  const norm = s => (s||'').toString().toLowerCase().trim();
  const splitTypes = s => norm(s)
      .replace(/\s+/g,' ')
      .split(/[\/,|]+/)                 // "Water/Ice" | "Water, Ice" | "Water|Ice"
      .map(x=>x.trim()).filter(Boolean);

  const getCardMeta = (card) => {
    // Versuche strukturierte Daten, sonst aus .tag parsen
    let route = card.dataset.route || '';
    let types = (card.dataset.types||'').split('|').filter(Boolean);

    const tag = card.querySelector('.tag');
    if(tag){
      const raw = tag.textContent || '';
      if(!route || !types.length){
        const parts = raw.split('+'); // "Route 101 + Water/Ice"
        route = route || norm(parts[0]||'');
        const right = norm(parts[1]||'');
        if(!types.length && right) types = splitTypes(right);
      }
    }
    const name = norm(card.querySelector('.poke-name')?.textContent || card.getAttribute('data-name') || '');
    const nick = norm(card.getAttribute('data-nickname') || '');

    // Cache auf dem Element, damit Filter schnell werden
    if(route) card.dataset.route = route;
    if(types.length) card.dataset.types = types.join('|');

    return { route, types, name, nick, tagText: norm(tag?.textContent||'') };
  };

  function collectFacets(){
    const typeCount = new Map();
    const routeCount= new Map();

    grid.querySelectorAll('.poke-card').forEach(card=>{
      const {route, types} = getCardMeta(card);
      if(route){ routeCount.set(route, (routeCount.get(route)||0)+1); }
      types.forEach(t=>{
        if(!t) return;
        typeCount.set(t, (typeCount.get(t)||0)+1);
      });
    });

    // Sort nice: by count desc then name
    //const sortedTypes  = [...typeCount.entries()].sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
// Keys, die rausfliegen sollen
const EXCLUDE = new Set(['failed', 'rip box','alive']);

// 1) Gefilterte & sortierte Paare [type, count]
const sortedTypes = [...typeCount.entries()]
  .filter(([type]) => !EXCLUDE.has(String(type).toLowerCase()))
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));


    const sortedRoutes = [...routeCount.entries()].sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));

    const ONLY = new Set(['failed', 'rip box','alive']);

const failedRip = [...typeCount.entries()]
  .filter(([type]) => ONLY.has(String(type).toLowerCase()))
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    renderChips(typesWrap, sortedTypes, 'type');
    renderChips(routesWrap, sortedRoutes, 'route');
    renderChips(specialboxes, failedRip, 'type');
  }

  function renderChips(container, entries, kind){
    container.innerHTML = '';
    entries.forEach(([label,count])=>{
      const chip = document.createElement('button');
      chip.type='button';
      const cls = ['chip'];
      if(kind==='type') cls.push(typeClass(label));
      chip.className = cls.join(' ');
      chip.dataset.kind = kind;
      chip.dataset.value = label;
      chip.innerHTML = `<span class="txt">${label}</span><span class="count">${count}</span>`;
      chip.addEventListener('click', ()=> {
        toggleChip(kind, label);
      });
      container.appendChild(chip);
    });
    syncChipActiveState();
  }

  function syncChipActiveState(){
    document.querySelectorAll('.chip').forEach(ch=>{
      const kind = ch.dataset.kind, val = ch.dataset.value;
      const on = (kind==='type'?selected.types:selected.routes).has(val);
      ch.classList.toggle('active', on);
    });
  }

  function toggleChip(kind, value){
    const set = (kind==='type'?selected.types:selected.routes);
    if(set.has(value)) set.delete(value); else set.add(value);
    syncChipActiveState();
    applyFilters();
  }

  const debounce = (fn,ms=150)=>{ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms);} };

  function applyFilters(){
    const q = norm(selected.query);
    const anyType   = selected.types.size>0;
    const anyRoute  = selected.routes.size>0;
    let visible=0;

    grid.querySelectorAll('.poke-card').forEach(card=>{
      const {route, types, name, nick, tagText} = getCardMeta(card);

      // Textsuche über Name, Nick, Route, Typen, Tag
      const hay = [name, nick, route, ...types, tagText].join(' ');
      const matchSearch = q? hay.includes(q) : true;

      // Typ-Filter: OR innerhalb Typen, AND zwischen Kategorien
      const matchType  = anyType ? types.some(t=> selected.types.has(t)) : true;
      const matchRoute = anyRoute? selected.routes.has(route) : true;

      const show = matchSearch && matchType && matchRoute;
      card.style.display = show ? '' : 'none';
      if(show) visible++;
    });

    countEl.textContent = String(visible);
  }

  function resetFilters(){
    selected.types.clear();
    selected.routes.clear();
    selected.query = '';
    searchEl.value = '';
    syncChipActiveState();
    applyFilters();
  }

  // Events
  searchEl?.addEventListener('input', debounce(()=>{ selected.query = searchEl.value; applyFilters(); }, 120));
  clearBtn?.addEventListener('click', resetFilters);

  // Beobachte Box-Grid (Render durch deine App) und baue Facets + filtere erneut
  const obs = new MutationObserver(()=>{
    collectFacets();
    applyFilters();
  });
  obs.observe(grid, {childList:true, subtree:true});

  // Falls Box bereits initial befüllt war:
  collectFacets();
  applyFilters();
})();

