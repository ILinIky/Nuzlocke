import { neon } from "@netlify/neon";
const sql = neon();



// ===== tiny color logger for Node =====
const C = {
  reset:  '\x1b[0m',  bold: '\x1b[1m', dim:  '\x1b[2m',
  red:    '\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:   '\x1b[34m', magenta:'\x1b[35m', cyan:'\x1b[36m', gray:'\x1b[90m'
};
const tty = () => process.stdout?.isTTY || process.env.FORCE_COLOR;

function paint(s, color){ return tty() ? `${color}${s}${C.reset}` : String(s); }

export const log = {
  info:  (...a) => console.log(paint('[INFO]', C.cyan),   ...a),
  ok:    (...a) => console.log(paint('✔',       C.green),  ...a),
  warn:  (...a) => console.warn(paint('[WARN]', C.yellow), ...a),
  error: (...a) => console.error(paint('[ERR]', C.red),    ...a),
  step:  (t)    => console.log(paint(`» ${t}`,  C.magenta)),
};


const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const must = (v, name) => {
  if (v == null || String(v).trim() === "") throw new Error(`Missing ${name}`);
  return v;
};
const normCode  = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
const normRoute = r => String(r || "").trim().slice(0, 80);
const nowIso    = () => new Date().toISOString();
const genCode   = (n=6)=>{const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<n;i++)s+=A[Math.floor(Math.random()*A.length)];return s};

async function setup()  {
  // Tabellen anlegen
  await sql`CREATE TABLE IF NOT EXISTS players (
    id text PRIMARY KEY,
    name text NOT NULL,
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_seen timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS lobbies (
    code text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS lobby_members (
    code text NOT NULL,
    player_id text NOT NULL,
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_seen  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (code, player_id),
    FOREIGN KEY (code) REFERENCES lobbies(code) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  )`;
  await sql`CREATE TABLE IF NOT EXISTS pokemons (
    player_id text NOT NULL,
    route     text NOT NULL,
    species   text NOT NULL,
    caught    boolean NOT NULL DEFAULT true,
    nickname  text,
    code text NOT NULL,
    PRIMARY KEY (player_id, route, code),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  )`;

  // route_slots
  await sql`CREATE TABLE IF NOT EXISTS route_slots (
    code  text NOT NULL,
    route text NOT NULL,
    slot  integer NOT NULL CHECK (slot BETWEEN 1 AND 6),
    player_id text NOT NULL,
    PRIMARY KEY (code, route, player_id),
    FOREIGN KEY (code) REFERENCES lobbies(code) ON DELETE CASCADE
  )`;

  await sql`CREATE TABLE IF NOT EXISTS routes (
    code text NOT NULL,
    name text NOT NULL,
    ord  INTEGER NOT NULL CHECK (ord BETWEEN 1 AND 55),
    PRIMARY KEY (code, ord)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS lobby_bans (
    code text NOT NULL,
    player_id text,          -- optional (wenn bekannt)
    name_lower text,         -- optional (falls nur Name gebannt werden soll)
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS lobby_bans_code_pid_uidx ON lobby_bans (code, player_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS lobby_bans_code_name_uidx ON lobby_bans (code, name_lower)`;

  //Douplikate entfernen (player_id)
await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS name_lower text`;
await sql`CREATE INDEX IF NOT EXISTS players_name_lower_idx ON players(name_lower)`;

 // ---- Migrationen / Ergänzungen (idempotent) ----
  // route_slots: fehlende Spalte code (Altbestand)
  try { await sql`ALTER TABLE route_slots ADD COLUMN IF NOT EXISTS code text`; } catch {}
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS route_slots_code_route_uidx ON route_slots (code, route)`; } catch {}

   // lobbies: host_id
   try { await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS host_id text`; } catch {}

     // lobby_members: role & banned
  try { await sql`ALTER TABLE lobby_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'player'`; } catch {}
  try { await sql`ALTER TABLE lobby_members ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false`; } catch {}

  // Migration: pokemons.caught BOOLEAN -> VARCHAR(16)
try {
  await sql`ALTER TABLE pokemons ALTER COLUMN caught DROP DEFAULT`;
  await sql`
    ALTER TABLE pokemons
    ALTER COLUMN caught TYPE varchar(16)
    USING (
      CASE
        WHEN caught IS TRUE  THEN 'caught'
        WHEN caught IS FALSE THEN 'failed'
        ELSE 'caught'
      END
    )
  `;
  await sql`ALTER TABLE pokemons ALTER COLUMN caught SET DEFAULT 'caught'`;
  await sql`ALTER TABLE pokemons ALTER COLUMN caught SET NOT NULL`;

  //index
  await sql`create index if not exists pokemons_player_updated_idx on pokemons(player_id, updated_at desc)`;
await sql`create index if not exists players_lobby_updated_idx  on players(lobby_id, updated_at desc)`;


await sql`create index if not exists pokemons_player_route_idx on pokemons(player_id, route)`;
await sql`create index if not exists players_lobby_idx on players(lobby_id)`;


await sql`create index if not exists pokemons_code_idx on pokemons(code)`;

await sql`ALTER TABLE lobby_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`;
await sql`ALTER TABLE pokemons      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`;
await sql`ALTER TABLE players       ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`;

await sql`CREATE INDEX IF NOT EXISTS lobby_members_code_updated_idx ON lobby_members(code, updated_at)`;
await sql`CREATE INDEX IF NOT EXISTS pokemons_code_updated_idx      ON pokemons(code, updated_at)`;
await sql`CREATE INDEX IF NOT EXISTS pokemons_code_player_idx       ON pokemons(code, player_id)`;
await sql`CREATE INDEX IF NOT EXISTS route_slots_code_idx           ON route_slots(code)`;

} catch (_) {
  // schon migriert oder in Benutzung – sicher ignorieren
}
}

async function ensureTables() {
return;
  log.info('Ensuring tables...');


  //setup();
  //log.info('SETUP done.');
  //console.log("Ensuring tables...");
  // Basis-Tabellen
 


//Douplikate entfernen (player_id)
//await sql`UPDATE players SET name_lower = lower(name) WHERE name_lower IS NULL`;

  // ---- Migrationen / Ergänzungen (idempotent) ----
  // route_slots: fehlende Spalte code (Altbestand)
  //try { await sql`UPDATE route_slots SET code='__GLOBAL__' WHERE code IS NULL`; } catch {}

  // Falls es Lobbies ohne host_id gibt, ersten Member zum Host machen
  try {
    await sql/*sql*/`
      WITH first_member AS (
        SELECT m.code, MIN(m.player_id) AS player_id
        FROM lobby_members m
        GROUP BY m.code
      )
      UPDATE l SET host_id = f.player_id
      FROM first_member f
      WHERE l.host_id IS NULL AND l.code = f.code
    `;
  } catch {}
}

// ---- Helpers ----
async function assertMember(code, playerId) {
  const r = await sql`SELECT 1 FROM lobby_members WHERE code=${code} AND player_id=${playerId}`;
  if (r.length === 0) throw new Error("not a member of this lobby");
}
async function getHostId(code) {
  const rows = await sql`SELECT host_id FROM lobbies WHERE code=${code}`;
  return rows?.[0]?.host_id || null;
}
async function assertIsHost(code, playerId) {
  const hostId = await getHostId(code);
  if (!hostId || String(hostId) !== String(playerId)) throw new Error("host permission required");
}

// ---- Actions ----
async function createLobby({ name, code, id }){
  console.log("Current User: -->"+id);
  const nm = String(name || "").trim().slice(0, 40);
  if (!nm) throw new Error("name required");
  let cd = normCode(code); if (!cd) cd = genCode(6);

 

  await sql`INSERT INTO lobbies(code) VALUES(${cd}) ON CONFLICT(code) DO NOTHING`;

  //const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) + "-" + Date.now();
  const nametolower = nm.toLowerCase();
  await sql`INSERT INTO players(id,name,joined_at,last_seen,name_lower) VALUES(${id},${nm},now(),now(),${nametolower}) ON CONFLICT(id) DO NOTHING`;

  // ⛔ Ban-Check
  const nmLower = nm.toLowerCase();
  const banned = await sql`
    SELECT 1 FROM lobby_bans WHERE code=${cd} AND (player_id=${id} OR name_lower=${nmLower}) LIMIT 1
  `;
  if (banned.length) throw new Error("banned");

  await sql`
    INSERT INTO lobby_members(code,player_id,joined_at,last_seen)
    VALUES(${cd},${id},now(),now())
    ON CONFLICT(code,player_id) DO UPDATE SET last_seen=now()
  `;

  // ersten Spieler automatisch als Host setzen
  await sql`UPDATE lobbies SET host_id=COALESCE(host_id, ${id}) WHERE code=${cd}`;

  return { code: cd, player: { id, name: nm } };

}

async function joinLobby({ name, code, id }){
  const nm = String(name || "").trim().slice(0, 40);
  if (!nm) throw new Error("name required");
  let cd = normCode(code); if (!cd) cd = genCode(6);

  // ➜ NIE auto-anlegen, sondern Existenz prüfen
  const exists = await sql`SELECT 1 FROM lobbies WHERE code=${cd} LIMIT 1`;
  if (exists.length === 0) {
    throw new Error("Lobby existiert nicht");
  }else{
  console.log("Joining lobby", cd);
  await sql`INSERT INTO lobbies(code) VALUES(${cd}) ON CONFLICT(code) DO NOTHING`;

  //const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) + "-" + Date.now();
  const nametolower = nm.toLowerCase();
  await sql`INSERT INTO players(id,name,joined_at,last_seen,name_lower) VALUES(${id},${nm},now(),now(),${nametolower}) ON CONFLICT(id) DO NOTHING`;

  // ⛔ Ban-Check
  const nmLower = nm.toLowerCase();
  const banned = await sql`
    SELECT 1 FROM lobby_bans WHERE code=${cd} AND (player_id=${id} OR name_lower=${nmLower}) LIMIT 1
  `;
  if (banned.length) throw new Error("banned");

  await sql`
    INSERT INTO lobby_members(code,player_id,joined_at,last_seen)
    VALUES(${cd},${id},now(),now())
    ON CONFLICT(code,player_id) DO UPDATE SET last_seen=now()
  `;

  // ersten Spieler automatisch als Host setzen
  await sql`UPDATE lobbies SET host_id=COALESCE(host_id, ${id}) WHERE code=${cd}`;

  return { code: cd, player: { id, name: nm } };
}
}

async function rejoinLobby({ name, code,pid }){
  //const pid = must(playerId,"playerId");
  const nm = String(name||"").trim().slice(0,40);
  const cd = normCode(must(code,"code"));

  // ➜ NIE auto-anlegen, sondern Existenz prüfen
  const exists = await sql`SELECT 1 FROM lobbies WHERE code=${cd} LIMIT 1`;
  if (exists.length === 0) {
    throw new Error("Lobby existiert nicht");
  }else{
  const nametolower = nm.toLowerCase();
  //await sql`INSERT INTO lobbies(code) VALUES(${cd}) ON CONFLICT(code) DO NOTHING`;
  if (nm) await sql`UPDATE players SET name=${nm}, last_seen=now() WHERE id=${pid}`;

  //if new player, check if player exists
  const pExists = await sql`SELECT 1 FROM players WHERE id=${pid} LIMIT 1`;
  if (pExists.length === 0) {
    console.info("New player, inserting", pid, nm);
    await sql`INSERT INTO players(id,name,joined_at,last_seen,name_lower) VALUES(${pid},${nm},now(),now(),${nametolower}) ON CONFLICT(id) DO NOTHING`;
  }

  // ⛔ Ban-Check
  const nmLower = nm.toLowerCase();
  const banned = await sql`
    SELECT 1 FROM lobby_bans WHERE code=${cd} AND (player_id=${pid} OR name_lower=${nmLower}) LIMIT 1
  `;
  if (banned.length) throw new Error("banned");

  await sql`
    INSERT INTO lobby_members(code,player_id,joined_at,last_seen)
    VALUES(${cd},${pid},now(),now())
    ON CONFLICT(code,player_id) DO UPDATE SET last_seen=now()
  `;
  return { ok:true, code: cd };
}
}


async function heartbeat({ code,pid }){
  //const pid = must(playerId,"playerId");
  const cd  = normCode(must(code,"code"));
  await sql`UPDATE players SET last_seen=now() WHERE id=${pid}`;
  // nur wenn nicht gebannt
  await sql`UPDATE lobby_members SET last_seen=now()
            WHERE code=${cd} AND player_id=${pid} AND banned=false`;
  return { ok:true, at: nowIso() };
}

async function upsertPokemon({ code, pid, route, species, caught, nickname }){
  const cd = normCode(must(code, "code"));
  //const pid = must(playerId,"playerId");
  const rt  = normRoute(must(route,"route"));
  const sp  = String(must(species,"species")).slice(0,60);

  await assertMember(cd, pid);
  // Spectator darf serverseitig nicht schreiben (optional hart absichern)
  const roleRow = await sql`SELECT role FROM lobby_members WHERE code=${cd} AND player_id=${pid}`;
  if (roleRow?.[0]?.role === 'spectator') throw new Error("spectators cannot modify");
  //console.info("Upsert Pokemon", { code: cd, pid, route: rt, species: sp, caught, nickname });
  await sql/*sql*/`
  WITH upserted AS (
    INSERT INTO pokemons(player_id, route, species, caught, nickname, code)
    VALUES (${pid}, ${rt}, ${sp}, ${caught}, ${nickname}, ${cd})
    ON CONFLICT (player_id, route, code)
    DO UPDATE SET
      species  = EXCLUDED.species,
      caught   = EXCLUDED.caught,
      nickname = COALESCE(EXCLUDED.nickname, pokemons.nickname)
    RETURNING code, route, player_id, caught
  )
  UPDATE pokemons p
     SET caught = 'false_by_others'
  FROM upserted u
  WHERE p.code      = u.code
    AND p.route     = u.route
    AND p.player_id <> u.player_id        -- nur die anderen
    AND u.caught IN ('false','dead')     -- nur wenn der neue Wert fail/dead ist
    AND p.caught NOT IN ('false','dead') -- unnötige/„Downgrades“ vermeiden
`;

  return { ok:true };
}

async function assignRouteSlot({ code, pid, route, slot }) {
  const cd = normCode(must(code, "code"));
  //const pid = String(must(playerId ?? player, "playerId"));
  const rt  = normRoute(must(route, "route"));
  const s   = Number(must(slot, "slot"));
  if (!(s >= 1 && s <= 6)) throw new Error("slot must be 1..6");

  await assertMember(cd, pid);
  const roleRow = await sql`SELECT role FROM lobby_members WHERE code=${cd} AND player_id=${pid}`;
  if (roleRow?.[0]?.role === 'spectator') throw new Error("spectators cannot modify");

  // Zielslot freiräumen (pro Lobby global)
  await sql`DELETE FROM route_slots WHERE code=${cd} AND slot=${s}`;

  // Route → Slot idempotent für diesen Spieler
  await sql`
    INSERT INTO route_slots(code, player_id, route, slot)
    VALUES (${cd}, ${pid}, ${rt}, ${s})
    ON CONFLICT (code, player_id, route)
    DO UPDATE SET slot = EXCLUDED.slot
  `;
  return { ok: true };
}

async function clearRouteSlot({ code, pid, player, route }) {
  const cd = normCode(must(code, "code"));
  //const pid = String(must(playerId ?? player, "playerId"));
  const rt  = normRoute(must(route, "route"));

  await assertMember(cd, pid);
  const roleRow = await sql`SELECT role FROM lobby_members WHERE code=${cd} AND player_id=${pid}`;
  if (roleRow?.[0]?.role === 'spectator') throw new Error("spectators cannot modify");

  await sql`DELETE FROM route_slots WHERE code=${cd} AND player_id=${pid} AND route=${rt}`;
  return { ok: true };
}

// -------- Moderation / Rollen (korrekt, ohne "xc") --------
async function assignRole({ code, pid, targetId, role }) {
  const cd  = normCode(must(code, "code"));
  //const pid = must(playerId, "playerId");
  const tid = must(targetId, "targetId");
  const newRole = String(must(role, "role")).toLowerCase(); // host|cohost|spectator|player
  if (!['host','cohost','spectator','player'].includes(newRole)) throw new Error("invalid role");

  await assertIsHost(cd, pid);
  await assertMember(cd, tid);

  if (newRole === 'host') {
    const prev = await getHostId(cd);
    await sql`UPDATE lobbies SET host_id=${tid} WHERE code=${cd}`;
    if (prev && String(prev)!==String(tid)) {
      await sql`UPDATE lobby_members SET role='cohost' WHERE code=${cd} AND player_id=${prev}`;
    }
    await sql`UPDATE lobby_members SET role='host'   WHERE code=${cd} AND player_id=${tid}`;
  } else {
    await sql`UPDATE lobby_members SET role=${newRole} WHERE code=${cd} AND player_id=${tid}`;
  }
  return { ok:true };
}

async function kickPlayer({ code, pid, targetId }) {
  const cd  = normCode(must(code, "code"));
  //const pid = must(playerId, "playerId");
  const tid = must(targetId, "targetId");

  await assertIsHost(cd, pid);
  if (String(pid) === String(tid)) throw new Error("cannot kick yourself");
  const hostId = await getHostId(cd);
  if (String(hostId) === String(tid)) throw new Error("cannot kick the host");

  await sql`DELETE FROM route_slots   WHERE code=${cd} AND player_id=${tid}`;
  await sql`DELETE FROM lobby_members WHERE code=${cd} AND player_id=${tid}`;
  return { ok:true };
}

async function banPlayer({ code, pid, targetId }) {
  const cd  = normCode(must(code, "code"));
  //const pid = must(playerId, "playerId");
  const tid = must(targetId, "targetId");

  // Nur Host darf bannen
  const hostRow = await sql`SELECT host_id FROM lobbies WHERE code=${cd}`;
  const hostId = hostRow[0]?.host_id || null;
  if (String(hostId) !== String(pid)) throw new Error("host permission required");

  if (String(pid) === String(tid)) throw new Error("cannot ban yourself");
  if (String(hostId) === String(tid)) throw new Error("cannot ban the host");

  // Name holen (für name_lower-Blockade)
  const row = await sql`SELECT name FROM players WHERE id=${tid}`;
  const nameLower = (row[0]?.name || '').toLowerCase();

  // 1) Kick: Slots + Mitgliedschaft entfernen
  await sql`DELETE FROM route_slots   WHERE code=${cd} AND player_id=${tid}`;
  await sql`DELETE FROM lobby_members WHERE code=${cd} AND player_id=${tid}`;

  // 2) Ban eintragen (per id + per name_lower)
  await sql`
    INSERT INTO lobby_bans(code, player_id, name_lower)
    VALUES (${cd}, ${tid}, ${nameLower})
    ON CONFLICT DO NOTHING
  `;
  if (nameLower) {
    await sql`
      INSERT INTO lobby_bans(code, name_lower)
      VALUES (${cd}, ${nameLower})
      ON CONFLICT DO NOTHING
    `;
  }

  return { ok:true };
}


async function unbanPlayer({ code, pid, targetId }) {
  const cd  = normCode(must(code, "code"));
  //const pid = must(playerId, "playerId");
  const tid = must(targetId, "targetId");

  const hostRow = await sql`SELECT host_id FROM lobbies WHERE code=${cd}`;
  const hostId = hostRow[0]?.host_id || null;
  if (String(hostId) !== String(pid)) throw new Error("host permission required");

  const row = await sql`SELECT name FROM players WHERE id=${tid}`;
  const nameLower = (row[0]?.name || '').toLowerCase();

  await sql`DELETE FROM lobby_bans WHERE code=${cd} AND (player_id=${tid} OR name_lower=${nameLower})`;
  // (Kein Re-Add in lobby_members — der Spieler muss normal beitreten)
  return { ok:true };
}



// -------- Read State -------- START

// -------- Read State (1 Roundtrip, gleicher Return-Shape) --------
async function listState({ code, pid }) {
  console.info("List State for", code, pid);
  const cd = normCode((code ?? "").toString());

  if (!cd) return { code: "", players: [], routeSlots: [], pokemons: [], boxes: {}, now: nowIso() };

  const [row] = await sql/*sql*/`
    WITH members AS (
      SELECT p.id, p.name,
             (lm.last_seen > now() - interval '45 seconds') AS online,
             COALESCE(lm.role,'player') AS role,
             COALESCE(lm.banned,false)  AS banned
      FROM lobby_members lm
      JOIN players p ON p.id = lm.player_id
      WHERE lm.code = ${cd}
    ),
    rs AS (
      SELECT route, slot, player_id
      FROM route_slots
      WHERE code = ${cd}
    ),
    box AS (
      SELECT po.player_id, po.route, po.species, po.caught, po.nickname
      FROM pokemons po
      WHERE po.code = ${cd}
        AND po.player_id IN (SELECT id FROM members)
    ),
    mypoke AS (
      SELECT route, species, nickname, caught
      FROM pokemons
      WHERE code=${cd} AND player_id=${pid}
    ),
    host AS (
      SELECT host_id FROM lobbies WHERE code=${cd}
    )
    SELECT
      /* players[] */
      (
        SELECT COALESCE(
          json_agg(json_build_object(
            'id', m.id,
            'name', m.name,
            'online', m.online,
            'role', m.role,
            'banned', m.banned
          ) ORDER BY m.name),
          '[]'::json
        )
        FROM (SELECT * FROM members ORDER BY name) m
      ) AS players,

      /* routeSlots[] */
      (
        SELECT COALESCE(
          json_agg(json_build_object(
            'route', r.route,
            'slot',  r.slot,
            'player_id', r.player_id
          ) ORDER BY r.slot, r.route, r.player_id),
          '[]'::json
        )
        FROM rs r
      ) AS route_slots,

      /* boxes{}  ->  { player_id: { route: {species,caught,nickname}, ... }, ... } */
      (
        SELECT COALESCE(
          (
            SELECT json_object_agg(b.player_id, b.routes)
            FROM (
              SELECT player_id,
                     json_object_agg(route, json_build_object(
                       'species', species,
                       'caught',  caught,
                       'nickname', nickname
                     )) AS routes
              FROM box
              GROUP BY player_id
            ) b
          ),
          '{}'::json
        )
      ) AS boxes,

      /* hostId */
      (SELECT host_id FROM host) AS host_id,

      /* pokemons[] (eigene) */
      (
        SELECT COALESCE(
          json_agg(json_build_object(
            'route', route,
            'species', species,
            'nickname', nickname,
            'caught', caught
          ) ORDER BY route),
          '[]'::json
        )
        FROM mypoke
      ) AS pokemons
  `;

  const players    = row?.players     ?? [];
  const routeSlots = row?.route_slots ?? [];
  const boxes      = row?.boxes       ?? {};
  const hostId     = row?.host_id     ?? null;
  const pokemons   = row?.pokemons    ?? [];

  return { code: cd, hostId, players, routeSlots, pokemons, boxes, now: nowIso() };
}

/* UPLOAD FUNKTION */
/* Wird aktuell clientseitig erledigt, da selten und meist durch den Host */
// Erwartetes Schema: CREATE UNIQUE INDEX IF NOT EXISTS ux_routes ON routes(code, name);

// TX-Helper wie zuvor
async function withTx(sql, fn){
  if (typeof sql.begin === 'function') return await sql.begin(fn);
  await sql`BEGIN`;
  try { const r = await fn(sql); await sql`COMMIT`; return r; }
  catch(e){ try{ await sql`ROLLBACK`; }catch{} throw e; }
}

/**
 * Upload/merge von Routen.
 * - (code, ord) ist UNIQUE
 * - ord muss 1..55 sein
 * - fehlende ord werden auf die nächstfreie Position 1..55 gelegt
 * - mode: 'replace' löscht vorher alle Routen für code
 */
async function downloadRoutes({ code}) {
  const cd = normCode(must(code, 'code'));
  const getroutes = await sql`
   SELECT * FROM routes WHERE code = ${cd}
`;
return getroutes;
} 

async function uploadRoutes({ code, routes }) {
  console.info(routes);
  const cd = normCode(must(code, 'code'));
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('routes must be a non-empty array');
  }
  if (routes.length > 55) {
    throw new Error('Too many routes in one upload (limit 55)');
  }

  // 1) Säubern + harte Validierung (kein Auto-Assign)
  const cleaned = [];
  const ordSet = new Set();

  for (const r of routes) {
    if (!r) continue;
    const name = String((r.name ?? r.route ?? '').trim()).slice(0, 80);
    if (!name) throw new Error('Every route needs a non-empty name');

    const n = Number(r.ord);
    const ord = Number.isInteger(n) ? n : NaN;
    if (!Number.isInteger(ord)) throw new Error(`ord must be an integer (got: ${r.ord})`);
    if (ord < 1 || ord > 55) throw new Error(`ord out of range (1..55): ${ord}`);
    if (ordSet.has(ord)) throw new Error(`duplicate ord in payload: ${ord}`);
    ordSet.add(ord);

    cleaned.push({ name, ord });
  }

  // 2) Atomare Ersetzung: erst nach **erfolgreicher** Validierung löschen & neu einspielen
  return await withTx(sql, async (sqlt) => {
    const [{ cnt: prevCount } = { cnt: 0 }] = await sqlt/*sql*/`
      SELECT COUNT(*)::int AS cnt FROM routes WHERE code = ${cd}
    `;

    await sqlt`DELETE FROM routes WHERE code = ${cd}`;

    // Bulk-Insert (loop ist idR okay; optional VALUES-Block)
    for (const r of cleaned) {
      await sqlt/*sql*/`
        INSERT INTO routes (code, name, ord)
        VALUES (${cd}, ${r.name}, ${r.ord})
      `;
    }

    return {
      ok: true,
      code: cd,
      replaced: prevCount,
      inserted: cleaned.length,
      total: cleaned.length
    };
  });
}




/* UPLOAD FUNKTION ENDE */




async function listRoutes({ code }) {
  const cd = normCode(must(code, 'code'));
  const rows = await sql`
    SELECT name, ord
    FROM routes
    WHERE code = ${cd}
    ORDER BY ord ASC, name ASC
  `;
  return { routes: rows };
}
// -------- Read State -------- END

// --- Neu: Useable-Check ---
async function useable({ name, code, route }) {
  const cd = normCode(must(code, "code"));
  const rt = normRoute(must(route, "route"));

  const isTrue = v => String(v).trim().toLowerCase() === 'true';

  // Spieler-spezifisch
  if (name && String(name).trim() !== "") {
    const nmLower = String(name).trim().toLowerCase();
    const p = await sql`SELECT id, name FROM players WHERE name_lower=${nmLower} LIMIT 1`;
    if (p.length === 0) {
      // kein Spieler mit dem Namen
      return { usable: false, count: 0, players: [], scope: "player" };
    }
    const pid = p[0].id;

    const rows = await sql/*sql*/`
      SELECT po.caught, po.player_id, p.name
      FROM pokemons po
      JOIN players p ON p.id = po.player_id
      WHERE po.code=${cd} AND po.route=${rt} AND po.player_id=${pid}
    `;

    const offenders = rows.filter(r => !isTrue(r.caught))
                          .map(r => ({ playerId: r.player_id, name: r.name, caught: r.caught }));

    const usable = rows.length > 0 && offenders.length === 0;
    return { usable, count: rows.length, players: offenders, scope: "player" };
  }

  // Lobby-weit
  const rows = await sql/*sql*/`
    SELECT po.caught, po.player_id, p.name
    FROM pokemons po
    JOIN players p ON p.id = po.player_id
    WHERE po.code=${cd} AND po.route=${rt}
  `;

  const offenders = rows.filter(r => !isTrue(r.caught))
                        .map(r => ({ playerId: r.player_id, name: r.name, caught: r.caught }));

  const usable = rows.length > 0 && offenders.length === 0;
  return { usable, count: rows.length, players: offenders };
}
// End useable check


export default async (req) => {
  try {
    if (!process.env.NETLIFY_DATABASE_URL) return json({ error:"NETLIFY_DATABASE_URL fehlt" }, 500);
    await ensureTables();

    const url = new URL(req.url);
    const method  = url.method?.toUpperCase?.() || req.method.toUpperCase();
    const qpAct   = url.searchParams.get("action");
    const qpCode  = url.searchParams.get("code");

    if (method === "GET") {
      if (!qpAct || qpAct === "list") return json(await listState({ code: qpCode }));
      return json({ error: "Unknown action" }, 400);
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action || qpAct || "list";
    console.info("Action:", action);
    if (action === "joinLobby")        return json(await joinLobby(body));
    if (action === "createLobby")        return json(await createLobby(body));
    if (action === "rejoinLobby")      return json(await rejoinLobby(body));
    if (action === "heartbeat")        return json(await heartbeat(body));
    if (action === "upsertPokemon")    return json(await upsertPokemon(body));
    if (action === "assignRouteSlot")  return json(await assignRouteSlot(body));
    if (action === "clearRouteSlot")   return json(await clearRouteSlot(body));

    // NEW: Moderation / Roles
    if (action === "assignRole")       return json(await assignRole(body));
    if (action === "kickPlayer")       return json(await kickPlayer(body));
    if (action === "banPlayer")        return json(await banPlayer(body));
    if (action === "unbanPlayer")      return json(await unbanPlayer(body));

    if (action === "list")             return json(await listState(body));
    if (action === "listRoutes")       return json(await listRoutes(body));
    if (action === "useable")          return json(await useable(body));
    if (action === "uploadRoutes")          return json(await uploadRoutes(body));
    if (action === "downloadRoutes")          return json(await downloadRoutes(body));

    return json({ error:`Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
};
