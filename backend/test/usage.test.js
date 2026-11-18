import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { LIMIT_PROFILES } from '../config.js';
import { createMemoryContactStore } from '../contacts.js';
import { createMemorySessionStore } from '../sessions.js';
import { createMemoryUsageStore } from '../usage.js';
import { createCvTool, loadProfile } from '../tools.js';

describe('createMemoryUsageStore', () => {
  test('suma por hora y métrica; totales desde una fecha y por día local', async () => {
    const usage = createMemoryUsageStore();
    await usage.add('page_loads', 1, new Date('2026-11-16T22:30:00Z')); // 16 en UTC, 16 en Madrid (23:30)
    await usage.add('page_loads', 2, new Date('2026-11-16T23:10:00Z')); // ya es 17 en Madrid
    await usage.add('messages', 1, new Date('2026-11-17T09:00:00Z'));
    await usage.add('tokens_in:claude-haiku-5-5', 900, new Date('2026-11-17T09:00:00Z'));

    assert.deepEqual(await usage.totals(), { page_loads: 3, messages: 1, 'tokens_in:claude-haiku-5-5': 900 });
    assert.deepEqual(await usage.totals(new Date('2026-11-17T00:00:00Z')), { messages: 1, 'tokens_in:claude-haiku-5-5': 900 });
    assert.deepEqual(await usage.daily('page_loads', new Date('2026-11-10T00:00:00Z'), 'Europe/Madrid'), [
      { date: '2026-11-16', value: 1 },
      { date: '2026-11-17', value: 2 },
    ]);
  });

  test('rechaza métricas desconocidas y valores no enteros (solo contadores, nada de texto)', async () => {
    const usage = createMemoryUsageStore();
    await assert.rejects(usage.add('ip:1.2.3.4'), /Métrica desconocida/);
    await assert.rejects(usage.add('messages', 1.5), /Valor inválido/);
    await assert.rejects(usage.add('tokens_in:<script>'), /Métrica desconocida/);
  });
});

describe('contadores en la API', () => {
  function counted() {
    const usage = createMemoryUsageStore();
    const llm = {
      name: 'fake:m',
      model: 'm',
      chat: async () => ({ text: 'respuesta', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 } }),
    };
    const config = { trustProxy: 1, limits: { ...LIMIT_PROFILES.funcional, chatPerMinute: 10 } };
    const app = createApp({
      llm,
      tools: [createCvTool(loadProfile())],
      profile: { basics: { name: 'Ana' } },
      sessions: createMemorySessionStore(),
      contacts: createMemoryContactStore(),
      config,
      usage,
    });
    return { app, usage };
  }

  test('cuenta cargas, conversaciones, mensajes, bloqueados y tokens por modelo', async () => {
    const { app, usage } = counted();
    await request(app).get('/api/profile').expect(200);
    const first = await request(app).post('/api/chat').send({ message: 'What projects has he built?' }).expect(200);
    await request(app).post('/api/chat').send({ message: 'And his skills?', sessionId: first.body.sessionId }).expect(200);
    await request(app).post('/api/chat').send({ message: 'what is the capital of France?' }).expect(200);
    await new Promise((r) => setImmediate(r));

    assert.deepEqual(await usage.totals(), {
      page_loads: 1,
      conversations: 2,
      messages: 3,
      blocked: 1,
      // Dos respuestas del agente, cada una con dos llamadas al modelo (la búsqueda forzada y la
      // respuesta): se cuentan todas, que es lo que se paga.
      'tokens_in:m': 400,
      'tokens_out:m': 80,
    });
  });

  test('si contar falla, la petición sale igual', async () => {
    const { app, usage } = counted();
    usage.add = async () => {
      throw new Error('base de datos caída');
    };
    await request(app).get('/api/profile').expect(200);
  });
});
