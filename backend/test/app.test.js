import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig, LIMIT_PROFILES } from '../config.js';

// Proveedor falso: registra las llamadas y nunca contacta con ningún modelo.
function fakeLlm({ fail } = {}) {
  const calls = [];
  return {
    name: 'fake',
    calls,
    chat: async (params) => {
      calls.push(params);
      if (fail) throw fail;
      return { text: 'respuesta', toolCalls: [] };
    },
  };
}

function buildApp({ limits = {}, fail } = {}) {
  const llm = fakeLlm({ fail });
  const config = {
    trustProxy: 1,
    limits: { ...LIMIT_PROFILES.funcional, ...limits },
  };
  return { app: createApp({ llm, tools: [], config }), llm };
}

describe('loadConfig', () => {
  test('usa Ollama y el perfil funcional por defecto, sin API key', () => {
    const config = loadConfig({});
    assert.equal(config.profileName, 'funcional');
    assert.equal(config.llm.provider, 'ollama');
    assert.equal(config.llm.ollama.url, 'http://localhost:11434');
  });

  test('rechaza un perfil desconocido', () => {
    assert.throws(() => loadConfig({ LIMIT_PROFILE: 'infinito' }), /LIMIT_PROFILE inválido/);
  });

  test('rechaza un proveedor desconocido', () => {
    assert.throws(() => loadConfig({ LLM_PROVIDER: 'otro' }), /LLM_PROVIDER inválido/);
  });

  test('anthropic exige una API key con formato válido', () => {
    assert.throws(() => loadConfig({ LLM_PROVIDER: 'anthropic' }), /ANTHROPIC_API_KEY/);
    assert.throws(
      () => loadConfig({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'tu_api_key_aqui' }),
      /ANTHROPIC_API_KEY/,
    );
    const config = loadConfig({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-x' });
    assert.equal(config.llm.anthropic.model, 'claude-sonnet-5-5');
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
    await request(ctx.app).post('/api/chat').send({ message: ' hola ' }).expect(200, { reply: 'respuesta' });
    assert.equal(ctx.llm.calls[0].maxTokens, LIMIT_PROFILES.funcional.maxTokens);
    assert.deepEqual(ctx.llm.calls[0].messages, [{ role: 'user', content: 'hola' }]);
  });

  for (const [caso, body] of [
    ['sin message', {}],
    ['message vacío', { message: '   ' }],
    ['message no es texto', { message: 42 }],
  ]) {
    test(`400 si ${caso}, sin llamar al modelo`, async () => {
      await request(ctx.app).post('/api/chat').send(body).expect(400);
      assert.equal(ctx.llm.calls.length, 0);
    });
  }

  test('400 si el mensaje supera la longitud máxima', async () => {
    const message = 'a'.repeat(LIMIT_PROFILES.funcional.maxMessageLength + 1);
    await request(ctx.app).post('/api/chat').send({ message }).expect(400);
    assert.equal(ctx.llm.calls.length, 0);
  });

  test('400 si el JSON está mal formado', async () => {
    await request(ctx.app)
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send('{"message":')
      .expect(400, { error: 'JSON mal formado.' });
  });

  for (const status of [429, 503, 529]) {
    test(`503 si el proveedor devuelve ${status}`, async () => {
      const { app } = buildApp({ fail: Object.assign(new Error('busy'), { status }) });
      await request(app).post('/api/chat').send({ message: 'hola' }).expect(503);
    });
  }

  test('500 genérico si el proveedor falla de otra forma', async () => {
    const { app } = buildApp({ fail: new Error('boom') });
    const res = await request(app).post('/api/chat').send({ message: 'hola' }).expect(500);
    assert.doesNotMatch(res.body.error, /boom/);
  });
});

describe('límites', () => {
  test('429 al superar el límite por minuto de una IP', async () => {
    const { app, llm } = buildApp({ limits: { chatPerMinute: 2 } });
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/chat').send({ message: 'hola' }).expect(200);
    }
    await request(app).post('/api/chat').send({ message: 'hola' }).expect(429);
    assert.equal(llm.calls.length, 2);
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
