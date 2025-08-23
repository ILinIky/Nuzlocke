// netlify/functions/nuzlocke.js — Postgres-backed synchronization for Box→Team and All Teams
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

function ok(body){ return { statusCode:200, headers:{...CORS,'Content-Type':'application/json'}, body: JSON.stringify(body) }; }
function err(e){ return { statusCode:500, headers:{...CORS,'Content-Type':'application/json'}, body: JSON.stringify({ error: String(e?.message || e) }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  const isGet = event.httpMethod === 'GET';
  const q = event.queryStringParameters || {};
  const body = isGet ? {} : (JSON.parse(event.body || '{}'));
  const action = (body.action || q.action || 'snapshot');
  const lobbyId = String(body.lobbyId || q.lobbyId || 'default');

  try {
    const client = await pool.connect();
    try {
      if (action === 'health') return ok({ ok:true });
      if (action === 'ensurePlayer') {
        const name = String(body.name || '').trim();
        if (!name) throw new Error('name required');
        // try find existing
        let row = (await client.query(`SELECT id, name FROM players WHERE lobby_id=$1 AND lower(name)=lower($2) LIMIT 1`, [lobbyId, name])).rows[0];
        if (!row) {
          const id = randomUUID();
          await client.query(`INSERT INTO players (lobby_id, id, name, created_at) VALUES ($1,$2,$3, NOW())`, [lobbyId, id, name]);
          row = { id, name };
        }
        return ok({ player: row });
      }

      if (action === 'addBoxPokemon') {
        const playerId = String(body.playerId || '');
        const routeId = String(body.routeId || '');
        const dex = body.dex ? Number(body.dex) : null;
        const name = body.name ? String(body.name) : null;
        const sprite = body.sprite ? String(body.sprite) : (dex ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png` : null);
        const caught = !!body.caught;
        if (!playerId || !routeId) throw new Error('playerId and routeId required');
        const id = randomUUID();
        await client.query(`
          INSERT INTO box_pokemon (id, lobby_id, player_id, route_id, dex, name, sprite, caught, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        `, [id, lobbyId, playerId, routeId, dex, name, sprite, caught]);
        return ok({ ok:true, id });
      }

      if (action === 'removeBoxPokemon') {
        const id = String(body.id || '');
        if (!id) throw new Error('id required');
        await client.query(`DELETE FROM box_pokemon WHERE lobby_id=$1 AND id=$2`, [lobbyId, id]);
        return ok({ ok:true });
      }

      if (action === 'assign') {
        const playerId = String(body.playerId || '');
        const routeId = String(body.routeId || '');
        const pokemonId = body.pokemonId ? String(body.pokemonId) : null;
        let slot = Number(body.slot);
        if (!Number.isFinite(slot)) throw new Error('slot must be 1..6');
        slot = Math.max(1, Math.min(6, slot|0));
        if (!playerId || !routeId) throw new Error('playerId and routeId required');

        await client.query('BEGIN');
        await client.query(`
          INSERT INTO route_slots (lobby_id, route_id, slot, updated_at)
          VALUES ($1,$2,$3, NOW())
          ON CONFLICT (lobby_id, route_id)
          DO UPDATE SET slot = EXCLUDED.slot, updated_at = NOW()
        `, [lobbyId, routeId, slot]);

        await client.query(`
          INSERT INTO team_members (lobby_id, player_id, slot, route_id, pokemon_id, updated_at)
          VALUES ($1,$2,$3,$4,$5,NOW())
          ON CONFLICT (lobby_id, player_id, slot)
          DO UPDATE SET route_id=EXCLUDED.route_id, pokemon_id=EXCLUDED.pokemon_id, updated_at=NOW()
        `, [lobbyId, playerId, slot, routeId, pokemonId]);

        await client.query('COMMIT');
        return ok({ ok:true });
      }

      if (action === 'clearTeamSlot') {
        const playerId = String(body.playerId || '');
        let slot = Number(body.slot);
        if (!playerId || !Number.isFinite(slot)) throw new Error('playerId and slot required');
        slot = Math.max(1, Math.min(6, slot|0));
        await client.query(`DELETE FROM team_members WHERE lobby_id=$1 AND player_id=$2 AND slot=$3`, [lobbyId, playerId, slot]);
        return ok({ ok:true });
      }

      if (action === 'snapshot') {
        const routeRows = (await client.query(`SELECT route_id, slot FROM route_slots WHERE lobby_id=$1`, [lobbyId])).rows;
        const players = (await client.query(`SELECT id, name FROM players WHERE lobby_id=$1 ORDER BY name`, [lobbyId])).rows;
        const teams = (await client.query(`SELECT player_id, slot, route_id, pokemon_id FROM team_members WHERE lobby_id=$1`, [lobbyId])).rows;
        const box = (await client.query(`SELECT id, player_id, route_id, dex, name, sprite, caught FROM box_pokemon WHERE lobby_id=$1 ORDER BY created_at`, [lobbyId])).rows;

        const routeSlots = {}; for (const r of routeRows) routeSlots[r.route_id] = r.slot;

        const playersOut = players.map(p => ({
          id: p.id, name: p.name,
          team: teams.filter(t => t.player_id === p.id).map(t => ({
            slot: t.slot,
            routeId: t.route_id,
            pokemon: t.pokemon_id ? { id: t.pokemon_id } : null
          })),
          box: box.filter(b => b.player_id === p.id).map(b => ({
            id: b.id, routeId: b.route_id, dex: b.dex, name: b.name, sprite: b.sprite, caught: b.caught
          }))
        }));

        return ok({ lobbyId, players: playersOut, routeSlots });
      }

      // Fallback
      return ok({ ok:true });
    } finally {
      client.release();
    }
  } catch(e) {
    console.error(e);
    return err(e);
  }
};
