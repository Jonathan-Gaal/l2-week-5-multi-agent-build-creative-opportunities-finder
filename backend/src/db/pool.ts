/**
 * One shared Postgres pool for the backend, from DATABASE_URL (see backend/.env.example).
 * Connect through Supabase's pooler, not db.<ref>.supabase.co, which is IPv6-only.
 *
 * TLS is on by default (DATABASE_SSL, see sslOptions) so the password and data never cross the network in
 * plain text. Statements time out so a slow query cannot hold a pooled connection forever.
 */

import { readFileSync } from "node:fs";

import pg from "pg";

// The project's Postgres allows 60 connections in total; the pooler multiplexes these.
const MAX_CONNECTIONS = 5;
const STATEMENT_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * TLS settings from DATABASE_SSL:
 *   unset / "require"   encrypted; the server certificate is not verified (Supabase's pooler uses its own CA).
 *   "verify"            encrypted and verified against DATABASE_SSL_CA (path to Supabase's CA certificate,
 *                       Database Settings > SSL Configuration). Blocks a man in the middle as well.
 *   "off"               plain text: only for a local Postgres on this machine.
 */
export const sslOptions = (env: Record<string, string | undefined>): pg.PoolConfig["ssl"] => {
  const mode = env.DATABASE_SSL?.trim() || "require";
  if (mode === "off") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify") {
    if (!env.DATABASE_SSL_CA) throw new Error("DATABASE_SSL=verify needs DATABASE_SSL_CA (path to the CA certificate)");
    return { rejectUnauthorized: true, ca: readFileSync(env.DATABASE_SSL_CA, "utf8") };
  }
  throw new Error("DATABASE_SSL must be require, verify or off");
};

let pool: pg.Pool | null = null;

export const getPool = (): pg.Pool => {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (copy backend/.env.example to backend/.env)");
  pool = new pg.Pool({
    connectionString, max: MAX_CONNECTIONS, ssl: sslOptions(process.env),
    statement_timeout: STATEMENT_TIMEOUT_MS, connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  // An idle client can lose its connection (pooler restart, network). Without a listener the pool's
  // 'error' event would crash the process; the pool drops the client and opens a new one on demand.
  pool.on("error", (err) => console.error(`postgres idle client error: ${err.message}`));
  return pool;
};

export const closePool = async (): Promise<void> => {
  await pool?.end();
  pool = null;
};
