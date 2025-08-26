
(function(){
  const grid = document.getElementById('movesGrid');
  const qEl = document.getElementById('mvSearch');
  const resetEl = document.getElementById('mvReset');
  const typeHost = document.getElementById('mvTypeChips');
  const classHost = document.getElementById('mvClassChips');
  const countEl = document.getElementById('mvCount');
  const tierBar = document.getElementById('mvTierBar');
  const tierModeSel = document.getElementById('mvTierMode');
  const sortSel = document.getElementById('mvSort');
  const sortDirBtn = document.getElementById('mvSortDir');

  if(!grid) return;

  const state = {
    query: '',
    types: new Set(),
    classes: new Set(),
    tiers: new Set(), // filter S,A,B,C,D
    sort: 'tier',
    desc: true,
    tierMode: tierModeSel?.value || 'score',
    data: [],
    scored: [],
    thresholds: {S:0,A:0,B:0,C:0}
  };

  const norm = s => (s||'').toString().toLowerCase().trim();

  function loadMoves(){
    try{
        const raw = localStorage.getItem('nuz_moves_v1');
let parsed;
try { parsed = JSON.parse(raw || '[]'); } catch { parsed = []; }

// dein Array sitzt unter arr.list – aber wir erlauben auch andere gängige Shapes
const list = Array.isArray(parsed)        ? parsed
           : Array.isArray(parsed?.list)  ? parsed.list
           : Array.isArray(parsed?.moves) ? parsed.moves
           : Array.isArray(parsed?.data)  ? parsed.data
           : [];

state.data = list;
      console.log(`[moves] loaded ${state.data.length} moves from localStorage`);
    }catch{ state.data = []; }
  }

  // Heuristik, falls kein score vorhanden ist
  function autoScore(m){
    const power = Number(m.power||0);
    const acc = ('accuracy' in m && m.accuracy!=null) ? Number(m.accuracy) : 100;
    const pp = Number(m.pp||0);
    const prio = Number(m.priority||0);
    const crit = Number(m.crit_rate||0);
    const drain = Number(m.drain||0);
    const flinch = Number(m.flinch_chance||0);
    const ailment = (m.ailment||'none') !== 'none';
    const ailmentChance = Number(m.ailment_chance||0);
    const statChance = Number(m.stat_chance||0);
    const cls = m.damage_class;

    let base = 0;
    if(cls==='status' && !power){
      base = 25 + (ailment ? (15 + ailmentChance*0.5) : 0) + statChance*0.5 + Math.min(pp,25)*0.6 + flinch*0.8 + crit*3;
    }else{
      base = power * (acc/100);
      base += Math.max(prio,0)*18;        // Prio belohnen
      base += crit*6;
      base += (drain>0 ? Math.min(drain,100)*0.3 : 0);
      base += flinch*0.8;
      base += (ailment ? (12 + ailmentChance*0.4) : 0);
      base += statChance*0.4;
      base += Math.min(pp,25)*0.4;
      if(prio<0) base -= Math.abs(prio)*6; // negative Prio leicht abwerten
    }
    return Math.max(0, Math.round(base));
  }

 // Lies (optional) eigene Breakpoints aus LS, sonst Defaults:
function getTierBreaks(){
    try{
      const raw = localStorage.getItem('nuz_tier_breaks');
      if(!raw) return { S:0.85, A:0.70, B:0.50, C:0.30 };
      const b = JSON.parse(raw);
      // Sicherheits-Clamps + Monotonie
      const S = Math.min(0.98, Math.max(0.55, Number(b.S ?? 0.85)));
      const A = Math.min(S-0.01, Math.max(0.45, Number(b.A ?? 0.70)));
      const B = Math.min(A-0.01, Math.max(0.25, Number(b.B ?? 0.50)));
      const C = Math.min(B-0.01, Math.max(0.05, Number(b.C ?? 0.30)));
      return { S,A,B,C };
    }catch{ return { S:0.85, A:0.70, B:0.50, C:0.30 }; }
  }
  
  // ⬇️ REPLACE deine bisherige computeScores()
  function computeScores(){
    // Score vorbereiten (wie gehabt)
    const withScore = state.data.map(m=>{
      const scoreField = (typeof m.score==='number') ? m.score : null;
      const score = (state.tierMode==='score' && scoreField!=null) ? Number(scoreField) : autoScore(m);
      return { ...m, _score: score };
    });
  
    if(!withScore.length){
      state.scored = [];
      return;
    }
  
    // --- Support-Bucket: alle reinen Status-/Utility-Moves ---
    const isSupport = (m) => {
      const cls = (m.damage_class||'').toLowerCase();
      const pwr = Number(m.power||0);
      return cls === 'status' || pwr === 0;
    };
  
    const support = [];
    const offense = [];
    withScore.forEach(m => (isSupport(m) ? support : offense).push(m));
  
    // --- Offense-Tiering: feste Anteile, damit S < A ---
    const n = offense.length;
    let rankedOff = offense.slice().sort((a,b)=> b._score - a._score);
  
    // Zielanteile (anpassbar, aber bewährt):
    // S ≈10%, A ≈20%, B ≈30%, Rest C
    let sCount = Math.floor(n * 0.10);
    let aCount = Math.floor(n * 0.20);
    let bCount = Math.floor(n * 0.30);
    // Mindestabsicherung bei kleinen Samples
    if(n >= 1 && sCount === 0) sCount = 1;
    if(n >= 3 && aCount === 0) aCount = 1;
    if(n >= 5 && bCount === 0) bCount = 1;
    if(sCount + aCount + bCount > n) {
      // Falls Rundungen überschießen, korrigieren in Reihenfolge B→A→S
      const over = sCount + aCount + bCount - n;
      for(let i=0;i<over;i++){
        if(bCount>0) bCount--; else if(aCount>0) aCount--; else if(sCount>0) sCount--;
      }
    }
  
    const withTierOff = rankedOff.map((m, i)=>{
      let tier = 'C';
      if(i < sCount) tier = 'S';
      else if(i < sCount + aCount) tier = 'A';
      else if(i < sCount + aCount + bCount) tier = 'B';
      return { ...m, _tier: tier };
    });
  
    // --- Support: eigene Schublade "SUP" (ehem. D) ---
    const withTierSup = support.map(m => ({ ...m, _tier:'SUP' }));
  
    state.scored = withTierOff.concat(withTierSup);
  }
  
  

  function collectFacets(){
    const typeCount = new Map();
    const classCount= new Map();
    const tiers = { S:0, A:0, B:0, C:0, SUP:0 };


    state.scored.forEach(m=>{
      const t = (m.type||'').toLowerCase();
      if(t) typeCount.set(t,(typeCount.get(t)||0)+1);
      const c = (m.damage_class||'').toLowerCase();
      if(c) classCount.set(c,(classCount.get(c)||0)+1);
      tiers[m._tier] = (tiers[m._tier]||0)+1;
    });

    renderChips(typeHost, typeCount, 'type');
    renderChips(classHost, classCount, 'class');
    renderTierBar(tiers);
  }

  function renderChips(host, map, kind){
    if(!host) return;
    host.innerHTML='';
    [...map.entries()].sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0])).forEach(([label,count])=>{
      const btn = document.createElement('button');
      btn.type='button';
      btn.className = 'chip ' + (kind==='type'? `type-${label}` : '');
      btn.dataset.kind = kind;
      btn.dataset.value = label;
      btn.innerHTML = `<span class="txt">${label}</span><span class="count">${count}</span>`;
      btn.addEventListener('click', ()=>{
        const set = (kind==='type'?state.types:state.classes);
        set.has(label) ? set.delete(label) : set.add(label);
        btn.classList.toggle('active', set.has(label));
        render();
      });
      host.appendChild(btn);
    });
  }

  function renderTierBar(tiers){
    tierBar.innerHTML='';
    ['S','A','B','C','SUP'].forEach(t=>{
      const chip = document.createElement('button');
      chip.type='button';
      chip.className='tier-chip';
      if(state.tiers.has(t)) chip.classList.add('active');
      chip.dataset.tier=t;
      chip.innerHTML = `<span class="tier-badge tier-${t}">${t}</span><span class="count">${tiers[t]||0}</span>`;
      chip.addEventListener('click', ()=>{
        state.tiers.has(t) ? state.tiers.delete(t) : state.tiers.add(t);
        render();
      });
      tierBar.appendChild(chip);
    });
  }
  

  function applyFilters(data){
    const q = norm(state.query);
    const anyType = state.types.size>0;
    const anyClass= state.classes.size>0;
    const anyTier = state.tiers.size>0;

    return data.filter(m=>{
      const name = norm(m.name);
      const eff = norm(m.short_effect||m.effect||'');
      const okQ = q ? (name.includes(q)||eff.includes(q)) : true;
      const okT = anyType ? state.types.has((m.type||'').toLowerCase()) : true;
      const okC = anyClass? state.classes.has((m.damage_class||'').toLowerCase()) : true;
      const okR = anyTier ? state.tiers.has(m._tier) : true;
      return okQ && okT && okC && okR;
    });
  }

  function sortData(data){
    const dir = state.desc ? -1 : 1;
    const by = state.sort;
    const tierRank = { S:5, A:4, B:3, C:2, SUP:1 }; // SUP hinter C
    return data.slice().sort((a,b)=>{
      const va =
        by==='tier'   ? tierRank[a._tier] :
        by==='score'  ? a._score :
        by==='power'  ? (a.power||0) :
        by==='accuracy' ? (a.accuracy??100) :
        by==='pp'     ? (a.pp||0) :
        by==='name'   ? a.name?.toLowerCase() : 0;

      const vb =
        by==='tier'   ? tierRank[b._tier] :
        by==='score'  ? b._score :
        by==='power'  ? (b.power||0) :
        by==='accuracy' ? (b.accuracy??100) :
        by==='pp'     ? (b.pp||0) :
        by==='name'   ? b.name?.toLowerCase() : 0;

      if(va<vb) return -1*dir;
      if(va>vb) return  1*dir;
      // Tiebreaker: score, name
      if(a._score!==b._score) return (a._score<b._score ? -1:1)*dir;
      return (a.name||'').localeCompare(b.name||'')*dir;
    });
  }

  function renderList(data){
    grid.innerHTML='';
    const frag = document.createDocumentFragment();
    data.forEach(m=>{
      const card = document.createElement('div');
      card.className='move-card';

      const type = (m.type||'').toLowerCase();
      const dmgc = (m.damage_class||'').toLowerCase();
      const acc = (m.accuracy==null? '—' : `${m.accuracy}%`);
      const power = (m.power==null? '—' : m.power);
      const pp = (m.pp==null? '—' : m.pp);
      const prio = (m.priority==null? '—' : m.priority);

      card.innerHTML = `
        <div class="move-head">
          <div class="move-name">${m.name||'—'}</div>
          <div class="tier-badge tier-${m._tier}">${m._tier}</div>
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <span class="type-badge ${type?`type-${type}`:''}">${type||'—'}</span>
          <span class="class-badge class-${dmgc||'status'}">${dmgc||'—'}</span>
        </div>
        <div class="move-stats">
          <span class="stat-pill">Power: <b>${power}</b></span>
          <span class="stat-pill">Acc: <b>${acc}</b></span>
          <span class="stat-pill">PP: <b>${pp}</b></span>
          <span class="stat-pill">Prio: <b>${prio}</b></span>
          <span class="stat-pill">Score: <b>${m._score}</b></span>
        </div>
        <div class="move-effect">${m.short_effect ? m.short_effect : (m.effect||'')}</div>
      `;
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    countEl.textContent = String(data.length);
  }

  function render(){
    computeScores();
    collectFacets();
    const filtered = applyFilters(state.scored);
    const sorted = sortData(filtered);
    renderList(sorted);
    // refresh tier-bar active states
    [...tierBar.querySelectorAll('.tier-chip')].forEach(ch=>{
      const t = ch.dataset.tier;
      ch.classList.toggle('active', state.tiers.has(t));
    });
    // sort-dir icon
    sortDirBtn.textContent = state.desc ? '↓' : '↑';
  }

  // Events
  const debounce = (fn,ms=150)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
  qEl?.addEventListener('input', debounce(()=>{ state.query = qEl.value; render(); }, 120));
  resetEl?.addEventListener('click', ()=>{
    state.query=''; qEl.value='';
    state.types.clear(); state.classes.clear(); state.tiers.clear();
    sortSel.value='tier'; state.sort='tier'; state.desc=true;
    tierModeSel.value='score'; state.tierMode='score';
    render();
  });
  tierModeSel?.addEventListener('change', ()=>{
    state.tierMode = tierModeSel.value; render();
  });
  sortSel?.addEventListener('change', ()=>{
    state.sort = sortSel.value; render();
  });
  sortDirBtn?.addEventListener('click', ()=>{
    state.desc = !state.desc; render();
  });

  // Init
  loadMoves();
  render();
})();

