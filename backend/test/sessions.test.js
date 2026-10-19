import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySessionStore, SESSION_ID_PATTERN } from '../sessions.js';

// Reloj falso: el tiempo solo avanza cuando el test lo indica.
function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

const turn = (n) => [
  { role: 'user', content: `p${n}` },
  { role: 'assistant', content: `r${n}` },
];

describe('createMemorySessionStore', () => {
  test('crea sesiones vacías con un UUID', () => {
    const store = createMemorySessionStore();
    const id = store.create();
    assert.match(id, SESSION_ID_PATTERN);
    assert.deepEqual(store.get(id), []);
  });

  test('un id desconocido devuelve undefined', () => {
    assert.equal(createMemorySessionStore().get('nada'), undefined);
  });

  test('get devuelve una copia: modificarla no altera la sesión', () => {
    const store = createMemorySessionStore();
    const id = store.create();
    store.get(id).push({ role: 'user', content: 'x' });
    assert.deepEqual(store.get(id), []);
  });

  test('conserva solo los últimos maxTurns turnos', () => {
    const store = createMemorySessionStore({ limits: { maxTurns: 2, ttlMs: 1000, maxSessions: 10 } });
    const id = store.create();
    store.save(id, [...turn(1), ...turn(2), ...turn(3)]);
    assert.deepEqual(store.get(id).map((m) => m.content), ['p2', 'r2', 'p3', 'r3']);
  });

  test('la sesión caduca tras ttlMs de inactividad', () => {
    const clock = fakeClock();
    const store = createMemorySessionStore({ limits: { maxTurns: 6, ttlMs: 1000, maxSessions: 10 }, now: clock.now });
    const id = store.create();
    clock.advance(999);
    assert.deepEqual(store.get(id), []);
    clock.advance(2);
    assert.equal(store.get(id), undefined);
  });

  test('guardar renueva la caducidad', () => {
    const clock = fakeClock();
    const store = createMemorySessionStore({ limits: { maxTurns: 6, ttlMs: 1000, maxSessions: 10 }, now: clock.now });
    const id = store.create();
    clock.advance(800);
    store.save(id, turn(1));
    clock.advance(800);
    assert.equal(store.get(id).length, 2);
  });

  test('al superar maxSessions descarta la menos reciente', () => {
    const store = createMemorySessionStore({ limits: { maxTurns: 6, ttlMs: 1000, maxSessions: 2 } });
    const [a, b] = [store.create(), store.create()];
    store.save(a, turn(1)); // a pasa a ser la más reciente
    const c = store.create();

    assert.equal(store.size, 2);
    assert.equal(store.get(b), undefined);
    assert.ok(store.get(a));
    assert.ok(store.get(c));
  });

  test('al guardar se limpian las sesiones caducadas', () => {
    const clock = fakeClock();
    const store = createMemorySessionStore({ limits: { maxTurns: 6, ttlMs: 1000, maxSessions: 10 }, now: clock.now });
    store.create();
    store.create();
    clock.advance(2000);
    store.create();
    assert.equal(store.size, 1);
  });
});
