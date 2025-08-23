import { neon } from "@netlify/neon";
const sql = neon();

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

async function ensureTables() {
    // Basis-Tabellen (idempotent)
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
      PRIMARY KEY (player_id, route),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )`;
  
    // Neu-Schema für route_slots (pro Lobby):
    await sql`CREATE TABLE IF NOT EXISTS route_slots (
      code  text NOT NULL,
      route text NOT NULL,
      slot  integer NOT NULL CHECK (slot BETWEEN 1 AND 6),
      player_id text NOT NULL,
      PRIMARY KEY (code, route, player_id),
      FOREIGN KEY (code) REFERENCES lobbies(code) ON DELETE CASCADE
    )`;
  
    // 🔁 MIGRATION für Altbestände:
    // Falls eine alte route_slots-Tabelle ohne "code" existiert, ergänzen wir sie.
    try {
      await sql`ALTER TABLE route_slots ADD COLUMN IF NOT EXISTS code text`;
    } catch (_) { /* ignorieren, falls nicht nötig */ }
  
    // Alte Reihen ohne code mit einem Default-Namespace markieren,
    // damit Abfragen nicht crashen (du kannst das später löschen/überschreiben).
    try {
      await sql`UPDATE route_slots SET code = '__GLOBAL__' WHERE code IS NULL`;
    } catch (_) {}
    
    // Sicherstellen, dass ON CONFLICT (code, route) funktioniert:
    try {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS route_slots_code_route_uidx ON route_slots (code, route)`;
    } catch (_) {}
  }


async function joinLobby({ name, code }){
  const nm = String(name || "").trim().slice(0, 40);
  if (!nm) throw new Error("name required");
  let cd = normCode(code); if (!cd) cd = genCode(6);
  await sql`INSERT INTO lobbies(code) VALUES(${cd}) ON CONFLICT(code) DO NOTHING`;
  const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) + "-" + Date.now();
  await sql`INSERT INTO players(id,name,joined_at,last_seen) VALUES(${id},${nm},now(),now()) ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO lobby_members(code,player_id,joined_at,last_seen) VALUES(${cd},${id},now(),now()) ON CONFLICT(code,player_id) DO UPDATE SET last_seen=now()`;
  return { code: cd, player: { id, name: nm } };
}

async function rejoinLobby({ playerId, name, code }){
  const pid = must(playerId,"playerId");
  const nm = String(name||"").trim().slice(0,40);
  const cd = normCode(must(code,"code"));
  await sql`INSERT INTO lobbies(code) VALUES(${cd}) ON CONFLICT(code) DO NOTHING`;
  if (nm) await sql`UPDATE players SET name=${nm}, last_seen=now() WHERE id=${pid}`;
  await sql`INSERT INTO lobby_members(code,player_id,joined_at,last_seen) VALUES(${cd},${pid},now(),now()) ON CONFLICT(code,player_id) DO UPDATE SET last_seen=now()`;
  return { ok:true, code: cd };
}

async function heartbeat({ playerId, code }){
  const pid = must(playerId,"playerId");
  const cd  = normCode(must(code,"code"));
  await sql`UPDATE players SET last_seen=now() WHERE id=${pid}`;
  await sql`UPDATE lobby_members SET last_seen=now() WHERE code=${cd} AND player_id=${pid}`;
  return { ok:true, at: nowIso() };
}

async function upsertPokemon({ playerId, route, species, caught=true }){
  const pid = must(playerId,"playerId");
  const rt  = normRoute(must(route,"route"));
  const sp  = String(must(species,"species")).slice(0,60);
  await sql`INSERT INTO pokemons(player_id,route,species,caught) VALUES(${pid},${rt},${sp},${Boolean(caught)}) ON CONFLICT(player_id,route) DO UPDATE SET species=EXCLUDED.species, caught=EXCLUDED.caught`;
  return { ok:true };
}

async function assignRouteSlot({ code, playerId, player, route, slot }) {
    const cd = normCode(must(code, "code"));
    const pid = Number(must(playerId ?? player, "playerId")); // akzeptiert beides
    const rt = normRoute(must(route, "route"));
    const s  = Number(must(slot, "slot"));
    if (!(s >= 1 && s <= 6)) throw new Error("slot must be 1..6");
  
    // 1) Falls der Ziel-Slot für diesen Spieler bereits von einer *anderen* Route belegt ist → freiräumen.
    await sql`
      DELETE FROM route_slots
      WHERE code = ${cd}  AND slot = ${s}
    `;
  
    // 2) Route → Slot idempotent setzen (player-scoped)
    await sql`
      INSERT INTO route_slots(code, player_id, route, slot)
      VALUES (${cd}, ${playerId}, ${rt}, ${s})
      ON CONFLICT (code, player_id, route)
      DO UPDATE SET slot = EXCLUDED.slot
    `;
  
    return { ok: true };
  }

  async function clearRouteSlot({ code, playerId, player, route }) {
    const cd = normCode(must(code, "code"));
    const pid = Number(must(playerId ?? player, "playerId"));
    const rt = normRoute(must(route, "route"));
    await sql`DELETE FROM route_slots WHERE code=${cd} AND player_id=${playerId} AND route=${rt}`;
    return { ok: true };
  }
  
  

async function listState({ code }){
  const cdRaw = (code ?? "").toString();
  const cd = normCode(cdRaw);

  // ➊ Kein Code? → leeres State (statt 400)
  if (!cd) return { code: "", players: [], routeSlots: [], boxes: {}, now: nowIso() };

  // ➋ Stelle sicher, dass die Lobby existiert (auch wenn niemand beigetreten ist)
  await sql`INSERT INTO lobbies(code) VALUES(${cd}) ON CONFLICT(code) DO NOTHING`;

  // ➌ Mitglieder + online-Flag
  const members = await sql/*sql*/`
    SELECT p.id, p.name, (m.last_seen > now() - interval '45 seconds') AS online
    FROM lobby_members m
    JOIN players p ON p.id = m.player_id
    WHERE m.code = ${cd}
    ORDER BY p.name
  `;

  // ➍ Slots dieser Lobby
  const routeSlots = await sql`SELECT route, slot FROM route_slots WHERE code=${cd}`;

  // ➎ Boxen aller Mitglieder – OHNE ANY(${ids}), robust via Subselect
  const rows = await sql/*sql*/`
    SELECT po.player_id, po.route, po.species, po.caught
    FROM pokemons po
    WHERE po.player_id IN (SELECT player_id FROM lobby_members WHERE code=${cd})
  `;
  const boxes = {};
  for (const r of rows) {
    boxes[r.player_id] ??= {};
    boxes[r.player_id][r.route] = { species: r.species, caught: r.caught };
  }

  return { code: cd, players: members, routeSlots, boxes, now: nowIso() };
}

export default async (req) => {
  try {
    if (!process.env.NETLIFY_DATABASE_URL) return json({ error:"NETLIFY_DATABASE_URL fehlt" }, 500);
    await ensureTables();

    const url = new URL(req.url);
    const method  = req.method.toUpperCase();
    const qpAct   = url.searchParams.get("action");
    const qpCode  = url.searchParams.get("code");

    if (method === "GET") {
      // GET list ist tolerant (kein code → leeres State)
      if (!qpAct || qpAct === "list") return json(await listState({ code: qpCode }));
      return json({ error: "Unknown action" }, 400);
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action || qpAct || "list";

    if (action === "joinLobby")        return json(await joinLobby(body));
    if (action === "rejoinLobby")      return json(await rejoinLobby(body));
    if (action === "heartbeat")        return json(await heartbeat(body));
    if (action === "upsertPokemon")    return json(await upsertPokemon(body));
    if (action === "assignRouteSlot")  return json(await assignRouteSlot(body));
    if (action === "clearRouteSlot")  return json(await clearRouteSlot(body));
    if (action === "list")             return json(await listState(body));

    return json({ error:`Unknown action: ${action}` }, 400);
  } catch (e) {
    // serverseitige Fehler als 500 ausgeben (besseres Debugging)
    return json({ error: e?.message ?? String(e) }, 500);
  }
};
