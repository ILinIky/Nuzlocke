// Global-/Multi-Key-Counter auf Neon (Postgres) mit atomarem UPSERT.
// Voraussetzungen: Neon angebunden, NETLIFY_DATABASE_URL gesetzt.
// @netlify/neon liest die URL automatisch ein.
import { neon } from "@netlify/neon";

/** Einzige DB-Connection (pro Lambda-Container wiederverwendet) */
const sql = neon();

/** Setup: Tabelle anlegen, falls nicht vorhanden */
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS counters (
      key   text PRIMARY KEY,
      count integer NOT NULL DEFAULT 0
    )
  `;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** @param {Request} req @param {import('@netlify/functions').Context} context */
export default async (req, context) => {
  await ensureTable();

  // optional: mehrere Zähler unterstützen → /api/counter?key=global
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "global";

  if (req.method === "GET") {
    // Erstellt den Datensatz bei Bedarf, liefert aktuellen Stand.
    const [row] = await sql`
      INSERT INTO counters (key, count)
      VALUES (${key}, 0)
      ON CONFLICT (key) DO UPDATE
      SET count = counters.count
      RETURNING count
    `;
    return json({ count: Number(row.count) });
  }

  if (req.method === "POST") {
    // Atomar: legt an (1) oder inkrementiert (+1) – keine Race Conditions.
    const [row] = await sql`
      INSERT INTO counters (key, count)
      VALUES (${key}, 1)
      ON CONFLICT (key) DO UPDATE
      SET count = counters.count + 1
      RETURNING count
    `;
    return json({ count: Number(row.count) });
  }

  return new Response("Method Not Allowed", { status: 405 });
};
