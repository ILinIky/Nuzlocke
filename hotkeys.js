document.addEventListener('keydown', (e)=>{
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k==='r') setActiveTab('routes');
    if (k==='b') setActiveTab('box');
    if (k==='t') setActiveTab('team');
    if (k==='g') setActiveTab('arena'); // falls Tab so heißt
    if (k==='/'){ e.preventDefault(); document.querySelector('#pokeSearch')?.focus(); }
  });