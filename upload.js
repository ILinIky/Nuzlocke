
// ---------- Parser: TXT/CSV → [{name, ord}] ----------
async function downloadRoutesSample(){
  const code = window.nzLobbyCode;
  const file = await window.nzApi('downloadRoutes', { code });
  //convert this to text
  const lines = file.map(r => `${r.code},${r.name},${r.ord}`);
  let text  = lines.join("\n");
  if (text  == '') { text = code+',Starter,1' }
  //download this file from browser as text file
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `routes-${code || 'sample'}.txt`;
  document.body.appendChild(a);
  a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function parseRoutesText(rawText) {

  console.log('[parseRoutesText] parsing…');
  const text = String(rawText || '').trim();
  if (!text) return [];

  // Delimiter-Heuristik
  const hasComma = text.includes(',');
  const hasSemicolon = text.includes(';');
  const hasTab = text.includes('\t');
  const delimiter = hasComma ? ',' : (hasSemicolon ? ';' : (hasTab ? '\t' : null));

  // TXT: eine Route je Zeile
  if (!delimiter) {
    const lines = text.split(/\r?\n/);
    const out = [];
    let n = 0;
    for (const line of lines) {
      const name = line.trim();
      if (!name) continue;
      out.push({ name, ord: n++ });
    }
    return out;
  }

  // CSV (einfach): unterstützt 1-2 Spalten, optional Header: name,ord
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];

  const first = lines[0].split(delimiter).map(s => s.trim().toLowerCase());
  const looksLikeHeader = first.includes('name') || first.includes('route') || first.includes('ord');
  const startIdx = looksLikeHeader ? 1 : 0;

  const out = [];
  let autoOrd = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(s => s.trim());
    let name = '';
    let ord = null;

    if (looksLikeHeader) {
      const idxName = first.indexOf('name') !== -1 ? first.indexOf('name')
                    : (first.indexOf('route') !== -1 ? first.indexOf('route') : 0);
      const idxOrd = first.indexOf('ord');
      name = cols[idxName] || '';
      if (idxOrd >= 0) {
        const n = parseInt(cols[idxOrd], 10);
        ord = Number.isFinite(n) ? n : null;
      }
    } else {
      if (cols.length === 1) {
        name = cols[0] || '';
      } else {
        name = cols[0] || '';
        const n = parseInt(cols[1], 10);
        ord = Number.isFinite(n) ? n : null;
      }
    }

    name = String(name).trim();
    if (!name) continue;

    out.push({ name, ord: ord ?? autoOrd++ });
  }

  return out;
}

// ---------- Klick-Handler: Datei wählen → parsen → hochladen ----------
async function handleUploadRoutesClick(e){
  if(!window.isHost) { 
    PokeBanner.warn('Nur der Lobby Host kann die Routen hochladen.');
    return; }
  e?.preventDefault?.();

  // File-Input einmalig anlegen
  let picker = document.getElementById('routePicker');
  if (!picker) {
    picker = document.createElement('input');
    picker.type = 'file';
    picker.id = 'routePicker';
    picker.accept = '.txt,.csv,text/plain,text/csv';
    picker.style.display = 'none';
    document.body.appendChild(picker);
  }

  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const routes = parseRoutesText(text);
      if (!routes.length) { alert('Die Datei enthält keine verwertbaren Routen.'); return; }

      const mode = 'merge'; // oder 'replace'
      const code = (typeof nzLobbyCode !== 'undefined' && window.nzLobbyCode) ? nzLobbyCode
                  : (typeof currentLobbyCode === 'function' ? currentLobbyCode() : null);
                 
      if (!code) { alert('Kein Lobby-Code gefunden.'); return; }

      await window.nzApi('uploadRoutes', { code, routes, mode });

      if (typeof renderRoutes === 'function') await renderRoutes();
      //alert(`Upload erfolgreich: ${routes.length} Routen (${mode}).`);
      PokeBanner.warn('Alle Spieler müssen der Lobby erneut beitreten!', { duration: 0 });
      PokeBanner.warn('<b style="color:red">Lobby</b> -> <b style="color:red">Einstellungen</b> -> <b style="color:red">Lobby beitreten</b>', { duration: 0 });
      setTimeout(() => window.quickjoin?.(window.nzLobbyCode), 1000);
    } catch (err) {
      console.error(err);
      PokeBanner.warn('Upload fehlgeschlagen: ' + (err?.message || err), { duration: 0 });
      //alert('Upload fehlgeschlagen: ' + (err?.message || err));
    } finally {
      picker.value = ''; // erneutes Hochladen derselben Datei erlauben
    }
  };

  picker.click();
  
}

// Global machen, damit inline onclick sie findet
window.parseRoutesText = parseRoutesText;
window.handleUploadRoutesClick = handleUploadRoutesClick;
