import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig, LIMIT_PROFILES } from '../config.js';

// Cliente falso: registra las llamadas y nunca contacta con Anthropic.
function fakeAnthropic({ fail } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        if (fail) throw fail;
        return { content: [{ type: 'text', text: 'respuesta' }] };
      },
    },
  };
}

function buildApp({ limits = {}, fail } = {}) {
  const anthropic = fakeAnthropic({ fail });
  const config = {
    trustProxy: 1,
    limits: { ...LIMIT_PROFILES.funcional, ...limits },
  };
  return { app: createApp({ anthropic, config }), anthropic };
}

describe('loadConfig', () => {
  test('falla si falta la API key', () => {
    assert.throws(() => loadConfig({}), /ANTHROPIC_API_KEY/);
  });

  test('usa el perfil funcional por defecto', () => {
    assert.equal(loadConfig({ ANTHROPIC_API_KEY: 'x' }).profileName, 'funcional');
  });

  test('rechaza un perfil desconocido', () => {
    assert.throws(
      () => loadConfig({ ANTHROPIC_API_KEY: 'x', LIMIT_PROFILE: 'infinito' }),
      /LIMIT_PROFILE inválido/,
    );
  });
});

describe('rutas', () => {
  test('GET /health responde ok', async () => {
    const { app } = buildApp();
    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  test('ruta inexistente devuelve 404 en JSON', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/nada').expect(404);
    assert.ok(res.body.error);
  });
});

describe('POST /api/chat', () => {
  let ctx;
  beforeEach(() => {
    ctx = buildApp();
  });

  test('responde con el texto del modelo', async () => {
    await request(ctx.app).post('/api/chat').send({ message: 'hola' }).expect(200, { reply: 'respuesta' });
    assert.equal(ctx.anthropic.calls[0].max_tokens, LIMIT_PROFILES.funcional.maxTokens);
  });

  for (const [caso, body] of [
    ['sin message', {}],
    ['message vacío', { message: '   ' }],
    ['message no es texto', { message: 42 }],
  ]) {
    test(`400 si ${caso}, sin llamar al modelo`, async () => {
      await request(ctx.app).post('/api/chat').send(body).expect(400);
      assert.equal(ctx.anthropic.calls.length, 0);
    });
  }

  test('400 si el mensaje supera la longitud máxima', async () => {
    const message = 'a'.repeat(LIMIT_PROFILES.funcional.maxMessageLength + 1);
    await request(ctx.app).post('/api/chat').send({ message }).expect(400);
    assert.equal(ctx.anthropic.calls.length, 0);
  });

  test('400 si el JSON está mal formado', async () => {
    await request(ctx.app)
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send('{"message":')
      .expect(400, { error: 'JSON mal formado.' });
  });

  test('503 si Anthropic está saturado', async () => {
    const { app } = buildApp({ fail: Object.assign(new Error('overloaded'), { status: 529 }) });
    await request(app).post('/api/chat').send({ message: 'hola' }).expect(503);
  });
});

describe('límites', () => {
  test('429 al superar el límite por minuto de una IP', async () => {
    const { app, anthropic } = buildApp({ limits: { chatPerMinute: 2 } });
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/chat').send({ message: 'hola' }).expect(200);
    }
    await request(app).post('/api/chat').send({ message: 'hola' }).expect(429);
    assert.equal(anthropic.calls.length, 2);
  });

  test('el tope global bloquea aunque cambie la IP', async () => {
    const { app } = buildApp({ limits: { chatPerMinute: 100, chatPerDay: 100, globalPerDay: 2 } });
    for (const ip of ['1.1.1.1', '2.2.2.2']) {
      await request(app).post('/api/chat').set('X-Forwarded-For', ip).send({ message: 'hola' }).expect(200);
    }
    await request(app).post('/api/chat').set('X-Forwarded-For', '3.3.3.3').send({ message: 'hola' }).expect(429);
  });

  test('los mensajes inválidos no consumen cupo', async () => {
    const { app } = buildApp({ limits: { chatPerMinute: 1 } });
    await request(app).post('/api/chat').send({}).expect(400);
    await request(app).post('/api/chat').send({ message: 'hola' }).expect(200);
  });
});
