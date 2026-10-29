import { createHmac } from 'node:crypto';

// Almacén de express-rate-limit en PostgreSQL: los contadores sobreviven a los despliegues y
// valen con varias instancias (en memoria se reiniciaban con cada despliegue).
// Ventana fija: el primer golpe abre la ventana y el contador vuelve a 1 cuando termina.
//
// Privacidad: la clave guarda un HMAC de la IP con un secreto del servidor, no la IP (un hash
// simple de una IPv4 se revierte probando todas), y las filas se borran al terminar su ventana
// (purgeExpiredRateLimits).

// Cada limitador usa su propio prefijo (chat-minute, chat-day...): comparten tabla sin mezclarse.
export function createPgRateLimitStore(pool, prefix, { secret }) {
  const hashKey = (key) => `${prefix}:${createHmac('sha256', secret).update(`${prefix}:${key}`).digest('hex').slice(0, 32)}`;
  let windowMs;
  return {
    prefix,
    // Los contadores son compartidos (no locales a la instancia): express-rate-limit lo usa
    // para sus comprobaciones.
    localKeys: false,
    init(options) {
      windowMs = options.windowMs;
    },
    // Un solo UPSERT atómico: dos peticiones simultáneas no pueden leer el mismo contador.
    async increment(key) {
      const { rows } = await pool.query(
        `INSERT INTO rate_limits (key, hits, reset_at)
         VALUES ($1, 1, now() + $2 * interval '1 millisecond')
         ON CONFLICT (key) DO UPDATE SET
           hits     = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
           reset_at = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
         RETURNING hits, reset_at`,
        [hashKey(key), windowMs],
      );
      return { totalHits: rows[0].hits, resetTime: rows[0].reset_at };
    },
    async decrement(key) {
      await pool.query('UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1', [hashKey(key)]);
    },
    async resetKey(key) {
      await pool.query('DELETE FROM rate_limits WHERE key = $1', [hashKey(key)]);
    },
  };
}

// Borra las ventanas terminadas. Devuelve cuántas filas borró.
export async function purgeExpiredRateLimits(pool) {
  const { rowCount } = await pool.query('DELETE FROM rate_limits WHERE reset_at <= now()');
  return rowCount;
}
