/**
 * Redis connection for BullMQ.
 * Returns null when REDIS_URL is not configured so the app starts in
 * environments that have no Redis (SQLite-only dev machines).
 * All queue operations are no-ops in that case — see queue/index.ts.
 */
import Redis from "ioredis";

let _connection: Redis | null = null;

function buildConnection(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const conn = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  conn.on("error", () => {
    // Silent — queue is optional; noisy logs when Redis is absent serve no one.
  });

  return conn;
}

export function getRedisConnection(): Redis | null {
  if (_connection) return _connection;
  _connection = buildConnection();
  return _connection;
}
