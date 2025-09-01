
(function () {
  const KEY = "playerId";

  function genId() {
    try {
      if (crypto?.randomUUID) return crypto.randomUUID() + "-" + Date.now();
      if (crypto?.getRandomValues) {
        const buf = new Uint32Array(4);
        crypto.getRandomValues(buf);
        return Array.from(buf).map(n => n.toString(16).padStart(8, "0")).join("") + "-" + Date.now();
      }
    } catch (_) {}
    // Fallback
    return Math.random().toString(36).slice(2) + "-" + Date.now();
  }

  function ensureStablePlayerId() {
    let pid = null;
    try { pid = localStorage.getItem(KEY); } catch (_) {}
    if (!pid) {
      pid = genId();
      try { localStorage.setItem(KEY, pid); } catch (_) {}
    }
    // global setzen
    window.nzPlayerId = pid;
    window.getPlayerId = () => pid;

    // optional: Event für andere Module
    try {
      document.dispatchEvent(new CustomEvent("playerid:ready", { detail: { id: pid } }));
    } catch (_) {}

    return pid;
  }

  // direkt beim Laden ausführen
  ensureStablePlayerId();

  // optional als API exportieren
  window.ensureStablePlayerId = ensureStablePlayerId;
})();

