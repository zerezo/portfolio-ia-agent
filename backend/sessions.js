import { randomUUID } from 'node:crypto';

// Historial de conversación. Interfaz: create() -> id, get(id) -> mensajes | undefined,
// save(id, mensajes). Solo se guardan preguntas y respuestas finales (sin resultados de
// herramientas): ocupa poco y no depende del proveedor.
// Dos implementaciones: memoria (tests, desarrollo sin base de datos) y PostgreSQL.

export const SESSION_LIMITS = {
  maxTurns: 6, // pares pregunta/respuesta que se conservan (acota los tokens por petición)
  ttlMs: 30 * 60 * 1000, // inactividad tras la que la sesión caduca
  maxSessions: 1000, // tope de memoria: al superarlo se descarta la sesión menos reciente
};

export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// En memoria: se pierde al reiniciar y solo vale con una instancia (igual que los límites).
export function createMemorySessionStore({ limits = SESSION_LIMITS, now = Date.now } = {}) {
  // Map conserva el orden de inserción: reinsertar al usar la deja como la más reciente.
  const sessions = new Map();

  const isExpired = (session) => now() - session.updatedAt > limits.ttlMs;

  return {
    get size() {
      return sessions.size;
    },

    // En memoria las caducadas se descartan al guardar; existe por paridad con PostgreSQL.
    purgeExpired() {
      return 0;
    },

    create() {
      const id = randomUUID();
      this.save(id, []);
      return id;
    },

    get(id) {
      const session = sessions.get(id);
      if (!session) return undefined;
      if (isExpired(session)) {
        sessions.delete(id);
        return undefined;
      }
      return [...session.messages];
    },

    save(id, messages) {
      sessions.delete(id);
      sessions.set(id, { messages: messages.slice(-limits.maxTurns * 2), updatedAt: now() });

      // Descarta caducadas y, si aún sobra, las menos recientes (las primeras del Map).
      for (const [key, session] of sessions) {
        if (sessions.size <= limits.maxSessions && !isExpired(session)) break;
        if (key !== id) sessions.delete(key);
      }
    },
  };
}

// En PostgreSQL: sobrevive a los reinicios y redespliegues. Sin tope de sesiones: las
// caducadas se borran con purgeExpired() y los límites de peticiones acotan el ritmo de alta.
export function createPgSessionStore(pool, { limits = SESSION_LIMITS } = {}) {
  const fresh = 'updated_at > now() - make_interval(secs => $1::double precision / 1000)';

  return {
    async purgeExpired() {
      const { rowCount } = await pool.query(
        'DELETE FROM chat_sessions WHERE updated_at <= now() - make_interval(secs => $1::double precision / 1000)',
        [limits.ttlMs],
      );
      return rowCount;
    },

    async create() {
      const id = randomUUID();
      await pool.query('INSERT INTO chat_sessions (id) VALUES ($1)', [id]);
      return id;
    },

    async get(id) {
      if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) return undefined;
      const { rows } = await pool.query(`SELECT messages FROM chat_sessions WHERE id = $2 AND ${fresh}`, [
        limits.ttlMs,
        id,
      ]);
      return rows[0]?.messages;
    },

    async save(id, messages) {
      await pool.query(
        `INSERT INTO chat_sessions (id, messages, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()`,
        [id, JSON.stringify(messages.slice(-limits.maxTurns * 2))],
      );
    },
  };
}
