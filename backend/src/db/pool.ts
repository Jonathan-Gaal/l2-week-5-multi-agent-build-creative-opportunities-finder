/**
 * One shared Postgres pool for the backend, from DATABASE_URL (see backend/.env.example).
 * Connect through Supabase's pooler, not db.<ref>.supabase.co, which is IPv6-only.
 */

import pg from "pg";

// The project's Postgres allows 60 connections in total; the pooler multiplexes these.
const MAX_CONNECTIONS = 5;

let pool: pg.Pool | null = null;

export const getPool = (): pg.Pool => {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (copy backend/.env.example to backend/.env)");
  pool = new pg.Pool({ connectionString, max: MAX_CONNECTIONS });
  // An idle client can lose its connection (pooler restart, network). Without a listener the pool's
  // 'error' event would crash the process; the pool drops the client and opens a new one on demand.
  pool.on("error", (err) => console.error(`postgres idle client error: ${err.message}`));
  return pool;
};

export const closePool = async (): Promise<void> => {
  await pool?.end();
  pool = null;
};
