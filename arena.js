// arena.js – dynamischer „Arenen“-Tab (Pokémon Style) mit Banner-Karten, Levelcap & Besiegt-Toggle
(function(){
    const $  = (s,r=document)=> r.querySelector(s);
    const $$ = (s,r=document)=> Array.from(r.querySelectorAll(s));
  
    const LS_KEY = 'nuz_gyms_v1';
  
    // === Daten: Games + Leader (mit Bildpfad) ===
    // Lege die PNGs unter /assets/gyms/kanto/ ab (Dateinamen wie unten).
    const GYMSETS = {
      kanto: [
        { key:'brock',   name:'Rocko',    city:'Striaton Gym',  badge:'Felsorden',    cap:14, type:'water',    img:'assets/gyms/kanto/blwh-ccc.webp',   colors:['#B6A136','#7A6524'] },
        { key:'misty',   name:'Lenora',   city:'Nacrene Gym',    badge:'Quellorden',   cap:20, type:'normal',   img:'assets/gyms/kanto/blwh-lenora.webp',   colors:['#6390F0','#2F62CE'] },
        { key:'surge',   name:'Burgh',    city:'Castelia Gym',    badge:'Donnerorden',  cap:23, type:'bug',img:'assets/gyms/kanto/blwh-burgh.webp',   colors:['#F7D02C','#C7A40A'] },
        { key:'erika',   name:'Elesa',    city:'Nimbasa Gym', badge:'Regenbogen',   cap:27, type:'electric',   img:'assets/gyms/kanto/blwh-elesa.webp',   colors:['#7AC74C','#3F8F26'] },
        { key:'koga',    name:'Clay',     city:'Driftveil Gym', badge:'Seelenorden',  cap:31, type:'ground',  img:'assets/gyms/kanto/blwh-clay.webp',    colors:['#A33EA1','#6B1E6A'] },
        { key:'sabrina', name:'Skyla',  city:'Mistralton Gym', badge:'Sumpforden',   cap:35, type:'flying', img:'assets/gyms/kanto/blwh-skyla.webp', colors:['#F95587','#BC2154'] },
        { key:'blaine',  name:'Brycen',     city:'Iccirus Gym',  badge:'Vulkanorden',  cap:39, type:'ice',    img:'assets/gyms/kanto/blwh-brycen.webp',  colors:['#EE8130','#B34D0B'] },
        { key:'gio',     name:'Drayden', city:'Opelucid Gym',  badge:'Erdorden',     cap:43, type:'dragon',  img:'assets/gyms/kanto/blwh-drayden.webp',colors:['#E2BF65','#9B7D36'] }
      ]
      // → später: johto, hoenn, … ergänzen
    };
  
    // === State ===
    function loadGyms(){
      try{
        const raw = localStorage.getItem(LS_KEY);
        const s = raw ? JSON.parse(raw) : null;
        return normalizeState(s);
      }catch{ return normalizeState(null); }
    }
    function saveGyms(s){ localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  
    function normalizeState(s){
      const game = s?.game || 'kanto';
      const base = GYMSETS[game] || GYMSETS.kanto;
      const prev = s?.leaders || [];
      const leaders = base.map(x=>{
        const old = prev.find(p=>p.key===x.key);
        return { ...x, defeated: !!old?.defeated };
      });
      return { game, leaders };
    }
  
    let gyms = loadGyms();
  
    // === Mount: Tab + Panel nur einmal hinzufügen ===
    function ensureMount(){
      // Tab-Button
      const tabs = $('#tabs');
      if (tabs && !tabs.querySelector('[data-tab="gyms"]')){
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.tab = 'gyms';
        btn.textContent = 'Arenen';
        tabs.appendChild(btn);
        btn.addEventListener('click', ()=> setActiveTab?.('gyms'));
      }
  
      // Panel
      const main = document.querySelector('main');
      if (main && !$('#panel-gyms')){
        const sec = document.createElement('section');
        sec.className = 'panel';
        sec.id = 'panel-gyms';
        sec.innerHTML = `
          <div class="gym-toolbar">
            <div class="brand">
              <div class="logo" aria-hidden="true"></div>
              <div class="title">Arenen<small>Badges & Levelcaps</small></div>
            </div>
            <div class="row">
              <select id="gyGameSel" class="gy-select">
                <option value="kanto">black and white</option>
              </select>
              <div class="gy-progress" title="Fortschritt">
                <div class="gy-progress-bar"><span id="gyProgFill"></span></div>
                <span class="gy-progress-text"><b id="gyProgNum">0</b>/8 Badges</span>
              </div>
            </div>
          </div>
          <div class="gym-grid" id="gymGrid"></div>
        `;
        main.appendChild(sec);
      }
    }
  
    // === Render ===
    function render(){
      ensureMount();
      const wrap = $('#gymGrid'); if (!wrap) return;
      const sel  = $('#gyGameSel');
  
      // Select initialisieren
      if (sel && !sel.dataset.ready){
        sel.dataset.ready = '1';
        // weitere Sets ggf. hinzufügen:
        const have = new Set(['kanto']);
        for (const key of Object.keys(GYMSETS)){
          if (have.has(key)) continue;
          const o = document.createElement('option');
          o.value = key; o.textContent = key[0].toUpperCase()+key.slice(1);
          sel.appendChild(o);
        }
        sel.value = gyms.game || 'kanto';
        sel.onchange = ()=>{
          gyms.game = sel.value;
          gyms = normalizeState(gyms);
          saveGyms(gyms);
          render();
        };
      }
  
      // Fortschritt
      const total = gyms.leaders.length;
      const beaten = gyms.leaders.filter(l=>l.defeated).length;
     // sichere Variante
var numEl  = document.getElementById('gyProgNum');
if (numEl) { numEl.textContent = String(beaten); }

var fillEl = document.getElementById('gyProgFill');
if (fillEl && fillEl.style) {
  fillEl.style.width = Math.round((beaten/Math.max(total,1))*100) + '%';
}

  
      // Grid
      wrap.innerHTML = '';
      gyms.leaders.forEach(L=>{
        const [c1,c2] = L.colors || ['var(--ring,#ffd23f)','var(--ok,#31d0aa)'];
  
        const card = document.createElement('div');
        card.className = 'gym-card' + (L.defeated ? ' defeated' : '');
        card.dataset.key = L.key;
  
        card.innerHTML = `
          ${L.defeated ? `<div class="gym-ribbon">Besiegt</div>` : ``}
          <div class="gym-banner" style="background-image:url('${(L.img||'').replace(/'/g,"%27")}')">
            <div class="gym-info">
              <div>
                <div class="gym-title">${escapeHtml(L.name)}</div>
                <div class="gym-sub">${escapeHtml(L.city)} • ${escapeHtml(L.badge)}</div>
              </div>
              <div class="gym-chip" style="--ring:${c1};--ok:${c2}">${Number(L.cap)||'—'}</div>
            </div>
          </div>
          <div class="gym-actions">
            <button class="btn ${L.defeated?'':'ok'}" data-toggle>${L.defeated?'Markierung entfernen':'Besiegt!'}</button>
            <span class="gym-note" style="color:#9fb1ff;font-size:12px">Typ: <b>${(L.type||'—').toUpperCase()}</b></span>
          </div>
        `;
  
        card.querySelector('[data-toggle]').addEventListener('click', ()=>{
          if (!L.defeated){
            L.defeated = true; saveGyms(gyms);
            winFX(card, c1, c2);
          } else {
            L.defeated = false; saveGyms(gyms);
          }
          render();
        });
  
        wrap.appendChild(card);
      });
    }
  
    // === FX ===
    function winFX(card, a='#ffd23f', b='#31d0aa'){
      // Button pulse
      const btn = card.querySelector('[data-toggle]');
      try{ btn?.animate([{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],
        {duration:420,easing:'cubic-bezier(.2,.7,.2,1)'}); }catch{}
  
      // Konfetti
      const host = document.createElement('div');
      host.className = 'gy-burst';
      card.appendChild(host);
      const colors = [a,b,'#ff6b6b','#7f8cff','#ff9f1a'];
      for(let i=0;i<30;i++){
        const e = document.createElement('i');
        e.style.background = colors[i%colors.length];
        host.appendChild(e);
        const rect = card.getBoundingClientRect();
        const x = rect.width*0.5 + (Math.random()-0.5)*rect.width*0.5;
        const y = rect.height*0.34 + (Math.random()-0.5)*30;
        const tx = (Math.random()-0.5)*rect.width*0.8;
        const ty = rect.height*(0.5 + Math.random()*0.3);
        const rot = (Math.random()*720)*(Math.random()<.5?-1:1);
        const dur = 700 + Math.random()*700;
        e.animate([{transform:`translate(${x}px,${y}px) rotate(0deg)`,opacity:1},
                   {transform:`translate(${x+tx}px,${y+ty}px) rotate(${rot}deg)`,opacity:.9}],
                   {duration:dur,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'})
         .onfinish = ()=> e.remove();
      }
      setTimeout(()=> host.remove(), 1600);
    }
  
    // === Utils ===
    function escapeHtml(s){
      return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
  
    // === Public API ===
    function init(){
      // falls CSS nicht eingebunden ist, warnen (nur Konsole)
      const styleProbe = getComputedStyle(document.documentElement).getPropertyValue('--ring');
      if (styleProbe == null) console.warn('[Arena] Stelle sicher, dass arena.css eingebunden ist.');
      ensureMount();
      render();
    }
  
    window.Arena = { init, render }; // optional render-API
  
  })();
