-- schema.sql — Minimal DB schema for lobby-based Nuzlocke sync

CREATE TABLE IF NOT EXISTS players (
  lobby_id   text NOT NULL,
  id         text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lobby_id, id)
);

CREATE TABLE IF NOT EXISTS route_slots (
  lobby_id   text NOT NULL,
  route_id   text NOT NULL,
  slot       int  NOT NULL CHECK (slot BETWEEN 1 AND 6),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lobby_id, route_id)
);

CREATE TABLE IF NOT EXISTS team_members (
  lobby_id   text NOT NULL,
  player_id  text NOT NULL,
  slot       int  NOT NULL CHECK (slot BETWEEN 1 AND 6),
  route_id   text NOT NULL,
  pokemon_id text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lobby_id, player_id, slot)
);

CREATE TABLE IF NOT EXISTS box_pokemon (
  id         text NOT NULL,
  lobby_id   text NOT NULL,
  player_id  text NOT NULL,
  route_id   text NOT NULL,
  dex        int NULL,
  name       text NULL,
  sprite     text NULL,
  caught     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lobby_id, id)
);
