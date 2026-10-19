import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp, detectContactIntent, forcedCvSearch, systemPromptFor } from '../app.js';
import { loadConfig, LIMIT_PROFILES } from '../config.js';
import { createMemorySessionStore } from '../sessions.js';
import { createMemoryContactStore } from '../contacts.js';

// Proveedor falso: registra las llamadas y nunca contacta con ningún modelo.
// `fail` se puede cambiar durante el test para simular un fallo a mitad de conversación.
function fakeLlm({ fail } = {}) {
  const llm = {
    name: 'fake',
    calls: [],
    fail,
    chat: async (params) => {
      llm.calls.push({ ...params, messages: [...params.messages] });
      if (llm.fail) throw llm.fail;
      return { text: 'respuesta', toolCalls: [] };
    },
  };
  return llm;
}

function buildApp({ limits = {}, fail } = {}) {
  const llm = fakeLlm({ fail });
  const config = {
    trustProxy: 1,
    limits: { ...LIMIT_PROFILES.funcional, ...limits },
  };
  const sessions = createMemorySessionStore();
  return { app: createApp({ llm, tools: [], sessions, contacts: createMemoryContactStore(), config }), llm, sessions };
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
    const res = await request(ctx.app).post('/api/chat').send({ message: ' hola ' }).expect(200);
    assert.equal(res.body.reply, 'respuesta');
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

  test('400 si sessionId no es un UUID, sin llamar al modelo', async () => {
    for (const sessionId of ['abc', 42, '../../etc']) {
      await request(ctx.app).post('/api/chat').send({ message: 'hola', sessionId }).expect(400);
    }
    assert.equal(ctx.llm.calls.length, 0);
  });

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

describe('systemPromptFor', () => {
  test('incluye la fecha de hoy en hora de Madrid', () => {
    // 23:30 UTC del 19-10 ya es día 20 en Madrid.
    const prompt = systemPromptFor(new Date('2026-10-19T23:30:00Z'));
    assert.match(prompt, /Hoy es martes, 20 de octubre de 2026 \(2026-10-20\)/);
  });
});

describe('detectContactIntent', () => {
  test('detecta peticiones de contacto y su idioma', () => {
    for (const message of ['Quiero una reunión', '¿Podemos hacer una VIDEOLLAMADA?', '¿Tiene huecos el jueves?', 'Me gustaría contactar con él']) {
      assert.equal(detectContactIntent(message), 'es', message);
    }
    for (const message of ['Can we book a call?', 'I would like to schedule an interview']) {
      assert.equal(detectContactIntent(message), 'en', message);
    }
  });

  test('no salta con preguntas sobre el CV que mencionan días u horas', () => {
    for (const message of ['¿Dónde trabaja?', '¿Qué hace los lunes por la mañana?', '¿Corre medias maratones?', 'What certifications does he have?']) {
      assert.equal(detectContactIntent(message), null, message);
    }
  });
});

describe('forcedCvSearch', () => {
  const forced = forcedCvSearch;

  test('sin historial busca con el mensaje', () => {
    assert.deepEqual(forced('¿Dónde trabaja?', []), { name: 'buscar_en_cv', input: { consulta: '¿Dónde trabaja?' } });
  });

  test('con historial añade la pregunta anterior del usuario', () => {
    const history = [
      { role: 'user', content: '¿Dónde trabaja?' },
      { role: 'assistant', content: 'En IndraMind.' },
    ];
    assert.equal(forced('¿Y antes?', history).input.consulta, '¿Dónde trabaja? ¿Y antes?');
  });
});

describe('historial de conversación', () => {
  const chat = (app, body) => request(app).post('/api/chat').send(body).expect(200);

  test('la primera respuesta crea una sesión y devuelve su id', async () => {
    const { app } = buildApp();
    const res = await chat(app, { message: 'hola' });
    assert.match(res.body.sessionId, /^[0-9a-f-]{36}$/);
  });

  test('con el sessionId, el modelo recibe los turnos anteriores', async () => {
    const { app, llm } = buildApp({ limits: { chatPerMinute: 10 } });
    const { sessionId } = (await chat(app, { message: 'primera' })).body;
    const res = await chat(app, { message: 'segunda', sessionId });

    assert.equal(res.body.sessionId, sessionId);
    assert.deepEqual(llm.calls[1].messages, [
      { role: 'user', content: 'primera' },
      { role: 'assistant', content: 'respuesta' },
      { role: 'user', content: 'segunda' },
    ]);
  });

  test('un sessionId desconocido no da error: se crea una sesión nueva', async () => {
    const { app, llm } = buildApp();
    const unknown = '00000000-0000-4000-8000-000000000000';
    const res = await chat(app, { message: 'hola', sessionId: unknown });
    assert.notEqual(res.body.sessionId, unknown);
    assert.equal(llm.calls[0].messages.length, 1);
  });

  test('si el modelo falla, el turno no se guarda en el historial', async () => {
    const { app, llm, sessions } = buildApp({ limits: { chatPerMinute: 10 } });
    const { sessionId } = (await chat(app, { message: 'primera' })).body;

    llm.fail = Object.assign(new Error('busy'), { status: 529 });
    await request(app).post('/api/chat').send({ message: 'perdida', sessionId }).expect(503);

    assert.deepEqual(sessions.get(sessionId).map((m) => m.content), ['primera', 'respuesta']);
  });
});

describe('peticiones de contacto en el chat', () => {
  test('responden con la acción abrir_formulario sin llamar al modelo', async () => {
    const { app, llm } = buildApp();
    const res = await request(app).post('/api/chat').send({ message: 'Quiero una reunión con él' }).expect(200);
    assert.equal(res.body.action, 'abrir_formulario');
    assert.match(res.body.reply, /formulario/);
    assert.equal(llm.calls.length, 0);
  });

  test('responden en inglés si la petición es en inglés', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/chat').send({ message: 'Can we book a call?' }).expect(200);
    assert.match(res.body.reply, /contact form/);
  });

  test('las preguntas normales no llevan acción', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/chat').send({ message: '¿Dónde trabaja?' }).expect(200);
    assert.equal(res.body.action, undefined);
  });

  test('consumen cupo del chat igual que el resto de mensajes', async () => {
    const { app } = buildApp({ limits: { chatPerMinute: 1 } });
    await request(app).post('/api/chat').send({ message: 'Quiero una reunión' }).expect(200);
    await request(app).post('/api/chat').send({ message: 'Quiero una reunión' }).expect(429);
  });
});

describe('GET /api/availability', () => {
  // Lunes 19-10-2026 a las 10:00 en Madrid.
  const now = () => new Date('2026-10-19T08:00:00Z');

  function availabilityApp(taken = []) {
    const config = { trustProxy: 1, limits: LIMIT_PROFILES.funcional };
    const contacts = { takenSlotIds: () => taken };
    return createApp({ llm: fakeLlm(), tools: [], sessions: createMemorySessionStore(), contacts, config, now });
  }

  test('devuelve zona horaria, duración y días con huecos', async () => {
    const res = await request(availabilityApp()).get('/api/availability').expect(200);
    assert.equal(res.body.timeZone, 'Europe/Madrid');
    assert.equal(res.body.slotMinutes, 20);
    assert.equal(res.body.days[0].date, '2026-10-20');
    assert.equal(res.body.days[0].slots[0].id, '2026-10-20T17:00');
  });

  test('excluye los huecos ocupados', async () => {
    const res = await request(availabilityApp(['2026-10-20T17:00'])).get('/api/availability').expect(200);
    assert.equal(res.body.days[0].slots[0].id, '2026-10-20T17:20');
  });
});

describe('POST /api/contact', () => {
  // Lunes 19-10-2026 a las 10:00 en Madrid: el primer hueco libre es el martes a las 17:00.
  const now = () => new Date('2026-10-19T08:00:00Z');
  const form = {
    name: 'Ana Recruiter',
    email: 'ana@empresa.com',
    reason: 'Me gustaría hablar sobre una posición de GRC.',
    mode: 'video',
    slotId: '2026-10-20T17:00',
    consent: true,
  };

  function contactApp({ failMail = false } = {}) {
    const sent = [];
    const mailer = {
      send: async (email) => {
        if (failMail) throw new Error('smtp caído');
        sent.push(email);
      },
    };
    const contacts = createMemoryContactStore();
    const config = { trustProxy: 1, limits: LIMIT_PROFILES.funcional, contact: { ownerEmail: 'yo@x.com' } };
    const app = createApp({ llm: fakeLlm(), tools: [], sessions: createMemorySessionStore(), contacts, mailer, config, now });
    return { app, sent, contacts };
  }

  test('crea la solicitud pendiente y envía aviso al dueño y acuse al solicitante', async () => {
    const { app, sent, contacts } = contactApp();
    const res = await request(app).post('/api/contact').send(form).expect(201);

    assert.equal(res.body.status, 'pending');
    assert.equal(contacts.get(res.body.id).email, 'ana@empresa.com');
    assert.deepEqual(sent.map((e) => e.to), ['yo@x.com', 'ana@empresa.com']);
    assert.match(sent[0].text, /martes, 20 de octubre, 17:00 \(hora de Madrid/);
    assert.match(sent[0].text, /Videollamada/);
  });

  test('el hueco solicitado desaparece de la disponibilidad', async () => {
    const { app } = contactApp();
    await request(app).post('/api/contact').send(form).expect(201);
    const res = await request(app).get('/api/availability').expect(200);
    assert.equal(res.body.days[0].slots[0].id, '2026-10-20T17:20');
  });

  test('no se puede pedir un hueco ya ocupado', async () => {
    const { app } = contactApp();
    await request(app).post('/api/contact').send(form).expect(201);
    const res = await request(app).post('/api/contact').send({ ...form, email: 'otro@x.com' }).expect(400);
    assert.match(res.body.error, /hueco/);
  });

  test('409 si el mismo email ya tiene una solicitud pendiente', async () => {
    const { app } = contactApp();
    await request(app).post('/api/contact').send(form).expect(201);
    await request(app).post('/api/contact').send({ ...form, slotId: '2026-10-20T17:20' }).expect(409);
  });

  test('400 con todos los errores si el formulario es inválido, sin enviar emails', async () => {
    const { app, sent } = contactApp();
    const res = await request(app).post('/api/contact').send({ mode: 'video' }).expect(400);
    assert.ok(res.body.errors.length > 1);
    assert.equal(sent.length, 0);
  });

  test('si falla el envío del email, la solicitud se guarda igualmente', async () => {
    const { app, contacts } = contactApp({ failMail: true });
    const res = await request(app).post('/api/contact').send(form).expect(201);
    assert.ok(contacts.get(res.body.id));
  });

  test('429 tras 3 solicitudes por hora desde la misma IP (aunque sean inválidas)', async () => {
    const { app } = contactApp();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/contact').send({}).expect(400);
    }
    await request(app).post('/api/contact').send(form).expect(429);
  });
});
