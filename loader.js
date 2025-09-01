// pokemon-loader.js (robust gegen early calls)
(function () {
    const ID = 'poke-loader-root';
    let queuedShowArg = null;           // falls show() vor DOM ready aufgerufen wird
    let readyFired = false;
  
    function onReady(fn){
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { readyFired = true; fn(); }, { once:true });
      } else {
        readyFired = true;(function () {
            const ID = 'poke-loader-root';
            let queuedShowArg = null;
          
            function onReady(fn){
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', fn, { once:true });
              } else fn();
            }
          
            function buildRoot(){
              const root = document.createElement('div');
              root.id = ID;
              root.className = 'poke-loader-overlay';
              root.innerHTML = `
                <div class="poke-loader-card" role="status" aria-live="polite" aria-busy="true">
                  <div class="poke-loader-head">
                    <div class="pokeball" aria-hidden="true"></div>
                    <div class="poke-loader-title">Lade…</div>
                  </div>
                  <div class="poke-loader-body">
                    <div class="poke-loader-status">
                      <span id="pokeLoaderText">Bitte warten</span>
                      <span class="poke-loader-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                    </div>
                    <!-- ⬇️ NEU: Bar mit 2 Indet-Segmenten + Fill -->
                    <div class="poke-loader-bar">
                      <div class="indet bar1"></div>
                      <div class="indet bar2"></div>
                      <div class="poke-loader-fill"></div>
                    </div>
                    <div class="poke-loader-hint" id="pokeLoaderHint"></div>
                  </div>
                  <div class="poke-sparkle" aria-hidden="true"></div>
                </div>
              `;
              return root;
            }
          
            function ensureRoot() {
              let root = document.getElementById(ID);
              if (root) return root;
          
              if (!document.body) {
                onReady(() => {
                  if (!document.getElementById(ID)) {
                    const r = buildRoot();
                    document.body.appendChild(r);
                    if (queuedShowArg != null) { applyShowArg(queuedShowArg); queuedShowArg = null; }
                    requestAnimationFrame(() => r.classList.add('is-in'));
                  }
                });
                return null;
              }
              root = buildRoot();
              document.body.appendChild(root);
              requestAnimationFrame(() => root.classList.add('is-in'));
              return root;
            }
          
            function setText(text) {
              const el = document.getElementById(ID)?.querySelector('#pokeLoaderText');
              if (el) el.textContent = String(text ?? '').trim() || 'Lade…';
            }
            function setHint(hint) {
              const el = document.getElementById(ID)?.querySelector('#pokeLoaderHint');
              if (el) el.textContent = String(hint ?? '');
            }
          
            function applyShowArg(arg){
              if (typeof arg === 'string') { setText(arg); setHint(''); }
              else if (arg && typeof arg === 'object') { setText(arg.text); if ('hint' in arg) setHint(arg.hint); }
              const root = document.getElementById(ID);
              if (root) requestAnimationFrame(() => root.classList.add('is-in'));
              // Standard: indeterminate
              setIndeterminate();
            }
          
            function show(arg) {
              const root = ensureRoot();
              if (!root) { queuedShowArg = arg ?? 'Lade…'; return; }
              applyShowArg(arg);
            }
          
            function hide() {
              const root = document.getElementById(ID);
              queuedShowArg = null;
              if (!root) return;
              root.classList.remove('is-in');
              setTimeout(() => root.remove(), 220);
            }
          
            // ---------- NEU: Progress-API ----------
            function setIndeterminate(){
              const root = document.getElementById(ID);
              if (!root) return;
              root.classList.remove('is-det');
            }
            function progress(value){ // 0..1
              const root = document.getElementById(ID);
              if (!root) return;
              const fill = root.querySelector('.poke-loader-fill');
              root.classList.add('is-det');
              const v = Math.max(0, Math.min(1, Number(value || 0)));
              // leichte „Trickle“-Korrektur, damit 0.0→0.02 nicht leer aussieht
              const shown = v === 0 ? 0 : Math.max(0.02, v);
              fill.style.transform = `scaleX(${shown})`;
            }
          
            // Public API
            window.PokeLoader = { show, hide, setText, setHint, progress, setIndeterminate };
          })();
          
        fn();
      }
    }
  
    function ensureRoot() {
      let root = document.getElementById(ID);
      if (root) return root;
  
      // body kann bei sehr frühem Aufruf noch fehlen
      if (!document.body) {
        // Safety: beim allerersten show() warten wir auf DOMReady
        onReady(() => {
          // wenn zwischenzeitlich schon erzeugt, nicht doppelt anlegen
          if (!document.getElementById(ID)) {
            const r = buildRoot();
            document.body.appendChild(r);
            // evtl. aufgestautes show()-Argument übernehmen
            if (queuedShowArg != null) applyShowArg(queuedShowArg);
            queuedShowArg = null;
          }
        });
        return null;
      }
  
      // body vorhanden → direkt anlegen
      root = buildRoot();
      document.body.appendChild(root);
      requestAnimationFrame(() => root.classList.add('is-in'));
      return root;
    }
  
    function buildRoot(){
      const root = document.createElement('div');
      root.id = ID;
      root.className = 'poke-loader-overlay';
      root.innerHTML = `
        <div class="poke-loader-card" role="status" aria-live="polite" aria-busy="true">
          <div class="poke-loader-head">
            <div class="pokeball" aria-hidden="true"></div>
            <div class="poke-loader-title">Lade…</div>
          </div>
          <div class="poke-loader-body">
            <div class="poke-loader-status">
              <span id="pokeLoaderText">Bitte warten</span>
              <span class="poke-loader-dots" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
            </div>
            <div class="poke-loader-bar"><div class="poke-loader-fill"></div></div>
            <div class="poke-loader-hint" id="pokeLoaderHint"></div>
          </div>
          <div class="poke-sparkle" aria-hidden="true"></div>
        </div>
      `;
      return root;
    }
  
    function setText(text) {
      const el = document.getElementById(ID)?.querySelector('#pokeLoaderText');
      if (el) el.textContent = String(text ?? '').trim() || 'Lade…';
    }
    function setHint(hint) {
      const el = document.getElementById(ID)?.querySelector('#pokeLoaderHint');
      if (el) el.textContent = String(hint ?? '');
    }
  
    function applyShowArg(arg){
      if (typeof arg === 'string') {
        setText(arg); setHint('');
      } else if (arg && typeof arg === 'object') {
        setText(arg.text);
        if ('hint' in arg) setHint(arg.hint);
      }
      // Eintritts-Transition sicher triggern
      const root = document.getElementById(ID);
      if (root) requestAnimationFrame(() => root.classList.add('is-in'));
    }
  
    function show(arg) {
      const root = ensureRoot();
      if (!root) {
        // DOM noch nicht bereit → merken und später anwenden
        queuedShowArg = arg ?? 'Lade…';
        return;
      }
      applyShowArg(arg);
    }
  
    function hide() {
      const root = document.getElementById(ID);
      queuedShowArg = null;
      if (!root) return;
      root.classList.remove('is-in');
      setTimeout(() => root.remove(), 220);
    }
  
    // Public API
    window.PokeLoader = { show, hide, setText, setHint };
  })();
  