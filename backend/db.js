import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

// Conexión a PostgreSQL y migraciones. Sin DATABASE_URL el servidor usa almacenes en memoria
// (ver index.js): así los tests y el desarrollo rápido no necesitan base de datos.

const MIGRATIONS_DIR = new URL('./db/migrations/', import.meta.url);

// Identificador arbitrario del cerrojo de migraciones: si arrancan dos instancias a la vez,
// solo una aplica las migraciones y la otra espera.
const MIGRATION_LOCK_ID = 727274;

export function createPool(connectionString) {
  return new pg.Pool({
    connectionString,
    max: 5,
    // Una conexión colgada no debe bloquear la petición indefinidamente.
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
}

// Aplica en orden las migraciones (db/migrations/NNN_nombre.sql) que aún no se han aplicado.
// Cada una va en su propia transacción: si falla, no queda a medias.
export async function migrate(pool, { log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const pending = readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d+_.+\.sql$/.test(file) && !applied.has(file))
      .sort();

    for (const file of pending) {
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`[db] migración aplicada: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${file}: ${error.message}`, { cause: error });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
