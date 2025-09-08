
(function(w){
  function onReady(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else fn();
  }
  function appendToBody(el, after){
    if (document.body) { document.body.appendChild(el); after && after(); }
    else onReady(()=>{ document.body.appendChild(el); after && after(); });
  }
  function focusables(root){
    return Array.from(root.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])'))
      .filter(el=>!el.disabled && el.offsetParent!==null);
  }

  // Einfache MsgBox: zeigt Text + OK, gibt Promise<void> zurück
  function nzMsg(message, { title='Hinweis', okText='OK' } = {}){
    return new Promise(resolve=>{
      const ov = document.createElement('div');
      ov.className = 'nz-overlay';
      ov.setAttribute('role','presentation');

      const box = document.createElement('div');
      box.className = 'nz-msg';
      box.setAttribute('role','dialog');
      box.setAttribute('aria-modal','true');

      const head = document.createElement('div');
      head.className = 'nz-head';
      const ball = document.createElement('div'); ball.className = 'nz-ball';
      const h = document.createElement('h3'); h.className = 'nz-title'; h.textContent = title;
      head.appendChild(ball); head.appendChild(h);

      const body = document.createElement('div');
      body.className = 'nz-body'; body.textContent = String(message ?? '');

      const foot = document.createElement('div'); foot.className = 'nz-foot';
      const ok = document.createElement('button'); ok.type='button'; ok.className='nz-btn'; ok.textContent = okText;
      foot.appendChild(ok);

      box.appendChild(head); box.appendChild(body); box.appendChild(foot);
      ov.appendChild(box);

      function close(){
        ov.removeEventListener('keydown', onKey);
        ov.remove();
        resolve();
      }
      ok.addEventListener('click', close);

      // ESC = OK; Klick auf Overlay NICHT schließen (User soll OK drücken)
      const onKey = (e)=>{
        if (e.key === 'Escape'){ e.preventDefault(); close(); }
        else if (e.key === 'Tab'){
          const list = focusables(ov); if(!list.length) return;
          const cur = document.activeElement; let i = Math.max(0, list.indexOf(cur));
          const n = e.shiftKey ? (i-1+list.length)%list.length : (i+1)%list.length;
          e.preventDefault(); list[n].focus();
        } else if (e.key === 'Enter'){ e.preventDefault(); ok.click(); }
      };
      ov.addEventListener('keydown', onKey);

      appendToBody(ov, ()=>{
        (focusables(ov)[0] || ok).focus?.();
      });
    });
  }

  // global bereitstellen
  w.nzMsg = nzMsg;
  // optional Alias
  w.pokeAlert = (opts) => nzMsg(opts?.message ?? '', { title: opts?.title ?? 'Hinweis', okText: opts?.okText ?? 'OK' });
})(window);

/*
setTimeout(() => 
    introduction() 
       , 3500);
       */

function introduction()
{ 
    const NZ_HELP = {
    lobby: {
      title: 'Lobby',
      body: `Erstelle eine eigene Lobby oder tritt per Code bei.
Teile den Code – alle sehen Änderungen live. (Einstellungen → Lobby)`
    },
    routen: {
      title: 'Routen',
      body: `Tracke deine Pokémon pro Route (caught / failed / dead / Nickname).
Setzt du einen Encounter auf „failed“ oder „dead“, werden die anderen Spieler
auf derselben Route in dieser Lobby automatisch auf „failed“ gesetzt.`
    },
    box: {
      title: 'Box',
      body: `Betrachte deine gefangenen Pokémon im Detail:
Typen, Nicknames, Filter & Suche – alles übersichtlich.`
    },
    team: {
      title: 'Team',
      body: `Stelle dein aktives Team zusammen und verknüpfe Pokémon
per Soul-Link mit deinem Partner.`
    },
    souls: {
      title: 'Souls',
      body: `Sieh alle Pokémon und Soul-Links aller beigetretenen Spieler
in deiner Lobby – zentral und live.`
    }
  };

  (async () => {
    setActiveTab?.('lobby');
    await showSectionHelp('lobby');
  
    setActiveTab?.('routes');
    await showSectionHelp('routen');

    setActiveTab?.('box');
    await showSectionHelp('box');

    setActiveTab?.('team');
    await showSectionHelp('team');

    setActiveTab?.('allteams');
    await showSectionHelp('souls');

    
  
    // optional weitere Schritte …
    // setActiveTab?.('box');    await showSectionHelp('box');
  })();
  

   
  // 👉 Eine Box nach Schlüssel anzeigen
  async function showSectionHelp(key){
    const m = NZ_HELP[key?.toLowerCase()];
    if (!m) return;
    await nzMsg(m.body, { title: m.title, okText: 'Okay' });
  }

  // 👉 Komplettes Onboarding (in Reihenfolge)
  async function showOnboarding(){
    for (const k of ['lobby','routen','box','team','souls']) {
      await showSectionHelp(k);
    }
  }
}

  
window.introduction = introduction;


//USAGE 

/*

// simple
nzMsg('Ein neues Pokémon wurde registriert!');

// mit Titel/OK-Text
await nzMsg('Encounter verbraucht.', { title: 'Route 101', okText: 'Okay' });

// Alias (falls du gern pokeAlert nutzt)
await pokeAlert({ title:'Pokédex', message:'Willkommen!', okText:'Los geht’s' });


*/