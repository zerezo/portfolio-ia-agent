// En local, TEST_DATABASE_URL se lee de backend/.env; en CI la define el workflow.
import 'dotenv/config';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ContactConflictError, createPgContactStore } from '../contacts.js';
import { createPool, migrate } from '../db.js';
import { createPgSessionStore } from '../sessions.js';
import { createPgRateLimitStore, purgeExpiredRateLimits } from '../ratelimit.js';

// Tests contra PostgreSQL real. Solo se ejecutan con TEST_DATABASE_URL (en CI hay un servicio
// de Postgres; en local: docker compose up -d). Vacían las tablas: no usar una base con datos reales.
const url = process.env.TEST_DATABASE_URL;

describe('PostgreSQL', { skip: !url && 'sin TEST_DATABASE_URL' }, () => {
  let pool;

  before(async () => {
    pool = createPool(url);
    await migrate(pool, { log: () => {} });
  });

  after(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE contact_requests, chat_sessions, rate_limits');
  });

  const request = (overrides = {}) => ({
    name: 'Ana',
    email: 'ana@empresa.com',
    reason: 'Hablar sobre una posición de GRC.',
    mode: 'video',
    slotId: '2026-10-20T17:00',
    ...overrides,
  });

  describe('migraciones', () => {
    test('se pueden ejecutar varias veces sin efecto', async () => {
      await migrate(pool, { log: () => {} });
      const { rows } = await pool.query('SELECT name FROM schema_migrations');
      assert.deepEqual(rows.map((r) => r.name), ['001_initial.sql', '002_rate_limits.sql']);
    });
  });

  describe('createPgContactStore', () => {
    test('crea, lee y resuelve una solicitud una sola vez', async () => {
      const store = createPgContactStore(pool);
      const created = await store.create(request({ company: 'Empresa' }));
      assert.equal(created.status, 'pending');
      assert.equal(created.company, 'Empresa');
      assert.equal(created.phone, undefined);

      const approved = await store.resolve(created.id, 'approved', { meetingUrl: 'https://meet.jit.si/x' });
      assert.equal(approved.status, 'approved');
      assert.equal(approved.meetingUrl, 'https://meet.jit.si/x');
      assert.ok(approved.resolvedAt);
      assert.equal(await store.resolve(created.id, 'rejected'), undefined);
    });

    test('ids que no son UUID o inexistentes devuelven undefined sin error', async () => {
      const store = createPgContactStore(pool);
      assert.equal(await store.get('no-es-uuid'), undefined);
      assert.equal(await store.get('00000000-0000-4000-8000-000000000000'), undefined);
      assert.equal(await store.resolve("x'; DROP TABLE contact_requests; --", 'approved'), undefined);
    });

    test('el índice único impide reservar un hueco activo dos veces, aunque sea a la vez', async () => {
      const store = createPgContactStore(pool);
      const results = await Promise.allSettled([
        store.create(request({ email: 'a@x.com' })),
        store.create(request({ email: 'b@x.com' })),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const [rejected] = results.filter((r) => r.status === 'rejected');
      assert.ok(rejected.reason instanceof ContactConflictError);
      assert.equal(rejected.reason.reason, 'slot_taken');
    });

    test('una sola solicitud pendiente por email', async () => {
      const store = createPgContactStore(pool);
      await store.create(request({ mode: 'email', slotId: undefined }));
      await assert.rejects(store.create(request({ mode: 'email', slotId: undefined })), { reason: 'pending_email' });
      assert.ok(await store.hasPendingFor('ana@empresa.com'));
    });

    test('rechazar libera el hueco; aprobar lo mantiene ocupado', async () => {
      const store = createPgContactStore(pool);
      const a = await store.create(request({ email: 'a@x.com', slotId: 's1' }));
      const b = await store.create(request({ email: 'b@x.com', slotId: 's2' }));
      await store.resolve(a.id, 'approved');
      await store.resolve(b.id, 'rejected');
      assert.deepEqual(await store.takenSlotIds(), ['s1']);
      await store.create(request({ email: 'c@x.com', slotId: 's2' }));
    });

    test('las solicitudes caducadas no se ven y purgeExpired las borra', async () => {
      const store = createPgContactStore(pool, { retentionMs: 60 * 1000 });
      const { id } = await store.create(request());
      await pool.query("UPDATE contact_requests SET created_at = now() - interval '2 minutes'");
      assert.equal(await store.get(id), undefined);
      assert.deepEqual(await store.takenSlotIds(), []);
      assert.equal(await store.purgeExpired(), 1);
    });
  });

  describe('createPgSessionStore', () => {
    test('crea, guarda y recupera el historial', async () => {
      const store = createPgSessionStore(pool);
      const id = await store.create();
      assert.deepEqual(await store.get(id), []);
      await store.save(id, [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'respuesta' },
      ]);
      assert.deepEqual((await store.get(id)).map((m) => m.content), ['hola', 'respuesta']);
    });

    test('conserva solo los últimos maxTurns turnos', async () => {
      const store = createPgSessionStore(pool, { limits: { maxTurns: 1, ttlMs: 60 * 1000 } });
      const id = await store.create();
      await store.save(id, [
        { role: 'user', content: 'p1' },
        { role: 'assistant', content: 'r1' },
        { role: 'user', content: 'p2' },
        { role: 'assistant', content: 'r2' },
      ]);
      assert.deepEqual((await store.get(id)).map((m) => m.content), ['p2', 'r2']);
    });

    test('las sesiones inactivas caducan y purgeExpired las borra', async () => {
      const store = createPgSessionStore(pool, { limits: { maxTurns: 6, ttlMs: 60 * 1000 } });
      const id = await store.create();
      await pool.query("UPDATE chat_sessions SET updated_at = now() - interval '2 minutes'");
      assert.equal(await store.get(id), undefined);
      assert.equal(await store.purgeExpired(), 1);
    });

    test('un id inválido devuelve undefined sin error', async () => {
      assert.equal(await createPgSessionStore(pool).get('basura'), undefined);
    });
  });

  describe('createPgRateLimitStore', () => {
    const store = (prefix = 'chat-day', windowMs = 60_000) => {
      const s = createPgRateLimitStore(pool, prefix, { secret: 'secreto-de-prueba' });
      s.init({ windowMs });
      return s;
    };

    test('cuenta por clave y comparte el contador entre instancias (redespliegue)', async () => {
      assert.equal((await store().increment('203.0.113.7')).totalHits, 1);
      assert.equal((await store().increment('203.0.113.7')).totalHits, 2);
      assert.equal((await store().increment('198.51.100.1')).totalHits, 1);
    });

    test('los prefijos no se mezclan', async () => {
      await store('chat-day').increment('203.0.113.7');
      assert.equal((await store('chat-minute').increment('203.0.113.7')).totalHits, 1);
    });

    test('no guarda la IP en claro', async () => {
      await store().increment('203.0.113.7');
      const { rows } = await pool.query('SELECT key FROM rate_limits');
      assert.ok(rows.every((r) => !r.key.includes('203.0.113.7')));
    });

    test('peticiones simultáneas no pierden golpes', async () => {
      const s = store();
      await Promise.all(Array.from({ length: 20 }, () => s.increment('203.0.113.7')));
      assert.equal((await s.increment('203.0.113.7')).totalHits, 21);
    });

    test('al terminar la ventana el contador vuelve a 1 y la purga borra la fila', async () => {
      const s = store('chat-minute', 1);
      await s.increment('203.0.113.7');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(await purgeExpiredRateLimits(pool), 1);
      await s.increment('203.0.113.7');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal((await s.increment('203.0.113.7')).totalHits, 1);
    });

    test('decrement y resetKey', async () => {
      const s = store();
      await s.increment('ip');
      await s.increment('ip');
      await s.decrement('ip');
      assert.equal((await s.increment('ip')).totalHits, 2);
      await s.resetKey('ip');
      assert.equal((await s.increment('ip')).totalHits, 1);
    });
  });
});
