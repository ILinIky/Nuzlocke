
/* ------------------------------ Box Filters (Pokémon Style) ------------------------------ */
(function(){
  const grid = document.getElementById('boxGrid');
  const grid2 = document.getElementById('boxDrawer');
  if (!grid && !grid2) return; // ⬅️ nur abbrechen, wenn beide fehlen

  const searchEl  = document.getElementById('boxSearch');
  const searchEl2  = document.getElementById('boxSearch2');
  const typesWrap = document.getElementById('chipTypes');
  const routesWrap= document.getElementById('chipRoutes');
  const  specialboxes = document.getElementById('chipBoxes');
  const clearBtn  = document.getElementById('boxClear');
  const countEl   = document.getElementById('boxCount');

  // ⬇️ eigener Zustand pro Grid
  const selected  = { types:new Set(), routes:new Set(), query:'' };   // grid1
  const selected2 = { types:new Set(), routes:new Set(), query:'' };   // grid2 (falls du später Chips willst)


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

  function applyFilters2(){
    if (!grid2) return;
    const q = norm(selected2.query);          // ⬅️ eigener Query-State
    const anyType   = selected2.types.size>0; // falls du später Chips für grid2 willst
    const anyRoute  = selected2.routes.size>0;
    let visible=0;

    grid2.querySelectorAll('.poke-card').forEach(card=>{
      const {route, types, name, nick, tagText} = getCardMeta(card);
      const hay = [name, nick, route, ...types, tagText].join(' ');
      const matchSearch = q? hay.includes(q) : true;
      const matchType   = anyType ? types.some(t=> selected2.types.has(t)) : true;
      const matchRoute  = anyRoute? selected2.routes.has(route) : true;
      const show = matchSearch && matchType && matchRoute;
      card.style.display = show ? '' : 'none';
      if(show) visible++;
    });

    // Optional: eigener Counter für grid2 (boxCount2), sonst weglassen
    // const countEl2 = document.getElementById('boxCount2');
    // if (countEl2) countEl2.textContent = String(visible);
  }

  function resetFilters(){
    selected.types.clear();
    selected.routes.clear();
    selected.query = '';
    searchEl.value = '';
    syncChipActiveState();
    applyFilters();
    applyFilters2();
  }

  // Events
  searchEl?.addEventListener('input', debounce(()=>{ selected.query = searchEl.value; applyFilters(); }, 120));
  searchEl2?.addEventListener('input', debounce(()=>{ selected2.query = searchEl2.value; applyFilters2(); }, 120));
  clearBtn?.addEventListener('click', resetFilters);

  // Beobachte Box-Grid (Render durch deine App) und baue Facets + filtere erneut
   // Observer: BEIDE Container korrekt beobachten
   const obs = new MutationObserver(()=>{
    collectFacets();   // nur grid1-Chips
    applyFilters();
    applyFilters2();   // ⬅️ re-applien für grid2 nach DOM-Updates
  });
  if (grid)  obs.observe(grid,  { childList:true, subtree:true });
  if (grid2) obs.observe(grid2, { childList:true, subtree:true });

  // Falls Box bereits initial befüllt war:
  collectFacets();
  applyFilters();
  applyFilters2();
})();

