# Nuzlocke Lobby (Box → Team → Alle Teams Sync)

**Was du bekommst**
- `1.html` – UI (Tabs: Box, Team, Alle Teams), Drag&Drop, selektierbarer Spieler
- `nuz.js` – stabile Logik mit Idempotenz-Guard + `snapshot`-Refresh
- `netlify/functions/nuzlocke.js` – Netlify Function (Postgres), Actions: health, ensurePlayer, addBoxPokemon, removeBoxPokemon, assign, clearTeamSlot, snapshot
- `schema.sql` – DB-Schema
- `netlify.toml` – Functions-Setup
- `package.json` – für Netlify-Build (pg)

## Quickstart
1) Postgres bereitstellen und `schema.sql` ausführen. `DATABASE_URL` als Netlify-Env setzen.  
2) Optional `PGSSL=disable` falls lokal ohne SSL.  
3) Deploy zu Netlify.  
4) `1.html` + `nuz.js` in dein Site-Root legen (oder als Single Page deployen).  
5) In der UI: Lobby wählen, Spieler beitreten, „Demo-Box befüllen“, Pokémon in Slots ziehen → „Alle Teams“ aktualisiert automatisch.

## Hinweise
- Slots sind **1..6** (Frontend clamped, Backend hard-check).  
- Doppelte Drops werden clientseitig entdoppelt.  
- Route→Slot ist **global pro Lobby** (Tausch wirkt in „Alle Teams“).  
- Team ist **pro Spieler** (wer welches Pokémon/Route in welchem Slot).

## Endpunkte (POST außer snapshot/health)
- `action=health` (GET)
- `action=ensurePlayer`, { lobbyId, name }
- `action=addBoxPokemon`, { lobbyId, playerId, routeId, dex?, name?, sprite?, caught? }
- `action=removeBoxPokemon`, { lobbyId, id }
- `action=assign`, { lobbyId, playerId, routeId, slot(1..6), pokemonId? }
- `action=clearTeamSlot`, { lobbyId, playerId, slot }
- `action=snapshot` (GET), ?lobbyId=...

**Sparringspartner-Tipp:** Wenn du bereits eigene Tabellen hast, mappe sie 1:1 auf die hier verwendeten Felder oder passe die SELECTs an. Wichtig ist nur die zentrale Quelle `route_slots` und ein konsistenter `snapshot`.
