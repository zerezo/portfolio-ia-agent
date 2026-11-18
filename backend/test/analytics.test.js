import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { LIMIT_PROFILES, loadConfig } from '../config.js';
import { createMemorySessionStore } from '../sessions.js';
import { createMemoryUsageStore } from '../usage.js';
import { aiCost, createAnalytics, createMemorySnapshotStore, createSources, loadCosts } from '../analytics.js';

const TZ = 'Europe/Madrid';
const NOW = new Date('2026-11-17T12:00:00Z');
const COSTS = {
  updated: '2026-11-17',
  currency: 'USD',
  hosting: { portfolio: { railway: 5, cloudflare: 0 }, entrenador: { cloudflare: 0 }, homecargarage: { supabase: 0, cloudflare: 0 } },
  shared: { domain: 1.25 },
  models: { 'claude-haiku-5-5': { input: 0.1, output: 0.5 } },
};

async function seededUsage() {
  const usage = createMemoryUsageStore();
  await usage.add('page_loads', 3, new Date('2026-11-17T09:00:00Z')); // últimas 24 h
  await usage.add('page_loads', 2, new Date('2026-11-12T09:00:00Z')); // últimos 7 días
  await usage.add('page_loads', 4, new Date('2026-10-01T09:00:00Z')); // antes (fuera de la gráfica)
  await usage.add('conversations', 2, new Date('2026-11-16T10:00:00Z'));
  await usage.add('messages', 10, new Date('2026-11-16T10:00:00Z'));
  await usage.add('blocked', 1, new Date('2026-11-16T10:00:00Z'));
  await usage.add('tokens_in:claude-haiku-5-5', 1_000_000, new Date('2026-11-16T10:00:00Z'));
  await usage.add('tokens_out:claude-haiku-5-5', 200_000, new Date('2026-11-16T10:00:00Z'));
  await usage.add('tokens_in:claude-haiku-5-5', 5_000_000, new Date('2026-10-20T10:00:00Z')); // mes anterior
  return usage;
}

describe('aiCost', () => {
  test('tokens por modelo × precio por millón', () => {
    assert.equal(aiCost({ 'tokens_in:claude-haiku-5-5': 2_000_000, 'tokens_out:claude-haiku-5-5': 1_000_000, messages: 4 }, COSTS.models), 0.7);
  });
  test('si un modelo usado no tiene precio, null (no se inventa)', () => {
    assert.equal(aiCost({ 'tokens_in:otro': 10 }, COSTS.models), null);
  });
});

describe('costs.yaml', () => {
  test('el real es válido: importes numéricos o null y precio del modelo de producción', () => {
    const costs = loadCosts();
    assert.equal(costs.currency, 'USD');
    assert.deepEqual(costs.models['claude-haiku-5-5'], { input: 0.1, output: 0.5 });
    for (const lines of [...Object.values(costs.hosting), costs.shared]) {
      for (const value of Object.values(lines)) assert.ok(value === null || (typeof value === 'number' && value >= 0));
    }
  });
});

describe('createAnalytics', () => {
  test('portfolio: conversaciones, % bloqueado, coste de IA del mes y por conversación, visitas', async () => {
    const analytics = createAnalytics({ usage: await seededUsage(), costs: COSTS, timeZone: TZ, now: () => NOW });
    const data = await analytics.get();
    const { metrics, cost } = data.projects.portfolio;
    assert.deepEqual(metrics.conversations, { total: 2, last7d: 2 });
    assert.equal(metrics.blockedPct, 10);
    // Noviembre: 1M de entrada (0,10 $) + 200K de salida (0,10 $). Octubre no cuenta.
    assert.equal(metrics.aiCostMonth, 0.2);
    assert.equal(metrics.aiCostPerConversation, 0.1);
    assert.deepEqual(cost, { hosting: 5, ai: 0.2, total: 5.2 });
    assert.deepEqual([data.visits.last24h, data.visits.last7d, data.visits.total], [3, 5, 9]);
    assert.equal(data.visits.days.length, 28);
    assert.deepEqual(data.visits.days.at(-1), { date: '2026-11-17', visits: 3 });
    // Total del mes: portfolio + entrenador + homecargarage + dominio.
    assert.equal(data.costs.monthlyTotal, 6.45);
    assert.equal(data.projects.portfolio.since, '2026-10-01T09:00:00.000Z');
  });

  test('sin datos de hosting el coste es null ("—"), nunca 0 inventado', async () => {
    const costs = { ...COSTS, hosting: { ...COSTS.hosting, portfolio: { railway: null, cloudflare: 0 } } };
    const analytics = createAnalytics({ usage: await seededUsage(), costs, timeZone: TZ, now: () => NOW });
    const data = await analytics.get();
    assert.equal(data.projects.portfolio.cost.hosting, null);
    assert.equal(data.projects.portfolio.cost.total, null);
    assert.equal(data.costs.monthlyTotal, null);
    assert.equal(data.projects.portfolio.metrics.aiCostMonth, 0.2);
  });

  test('fuentes sin configurar: "unconfigured" y sin métricas', async () => {
    const data = await createAnalytics({ usage: createMemoryUsageStore(), costs: COSTS, timeZone: TZ, now: () => NOW }).get();
    assert.deepEqual(data.projects.entrenador.status, 'unconfigured');
    assert.equal(data.projects.homecargarage.metrics, null);
    assert.equal(data.projects.portfolio.metrics.blockedPct, null);
  });

  test('si una fuente falla se sirve su último dato con su hora; el resto, normal', async () => {
    const snapshots = createMemorySnapshotStore();
    await snapshots.set('entrenador', { activities: 40 }, new Date('2026-11-15T08:00:00Z'));
    const sources = {
      entrenador: async () => {
        throw new Error('caído');
      },
      homecargarage: async () => {
        throw new Error('caído');
      },
    };
    const data = await createAnalytics({ usage: createMemoryUsageStore(), costs: COSTS, sources, snapshots, timeZone: TZ, now: () => NOW }).get();
    assert.deepEqual(
      { status: data.projects.entrenador.status, updatedAt: data.projects.entrenador.updatedAt, metrics: data.projects.entrenador.metrics },
      { status: 'stale', updatedAt: '2026-11-15T08:00:00.000Z', metrics: { activities: 40 } },
    );
    assert.equal(data.projects.homecargarage.status, 'unavailable');
    assert.equal(data.projects.portfolio.status, 'ok');
  });

  test('caché de 1 hora: no vuelve a consultar las fuentes antes', async () => {
    let calls = 0;
    let at = NOW;
    const sources = { homecargarage: async () => (calls++, { users: 3, vehicles: 5 }) };
    const analytics = createAnalytics({ usage: createMemoryUsageStore(), costs: COSTS, sources, timeZone: TZ, now: () => at });
    await analytics.get();
    at = new Date(NOW.getTime() + 59 * 60 * 1000);
    await analytics.get();
    assert.equal(calls, 1);
    at = new Date(NOW.getTime() + 61 * 60 * 1000);
    await analytics.get();
    assert.equal(calls, 2);
  });
});

describe('createSources', () => {
  const fakeFetch = (body) => {
    const calls = [];
    const fetchFn = async (url, init) => (calls.push({ url, init }), Response.json(body));
    return { fetchFn, calls };
  };

  test('Entrenador: token Bearer; solo conteos conocidos (lo demás se descarta)', async () => {
    const { fetchFn, calls } = fakeFetch({ activities: 120, analyzed: 80, plans: 3, workoutsSent: 25, duplicatesMerged: 7, daysInUse: 60, email: 'x@y.z', heartRate: 150 });
    const sources = createSources({ entrenador: { url: 'https://e.dev/api/public-stats', token: 't'.repeat(32) } }, fetchFn);
    const metrics = await sources.entrenador();
    assert.deepEqual(metrics, { activities: 120, analyzed: 80, plans: 3, workoutsSent: 25, duplicatesMerged: 7, daysInUse: 60, evalsPassPct: null });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${'t'.repeat(32)}`);
  });

  test('HomeCarGarage: RPC public_stats con la clave pública', async () => {
    const { fetchFn, calls } = fakeFetch({ users: 12, vehicles: 20 });
    const sources = createSources({ homecargarage: { url: 'https://abc.supabase.co', anonKey: 'anon' } }, fetchFn);
    assert.deepEqual(await sources.homecargarage(), { users: 12, vehicles: 20 });
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/rpc/public_stats');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.apikey, 'anon');
  });

  test('HomeCarGarage: la clave publishable va solo en apikey; la anon (JWT), también en Authorization', async () => {
    const run = async (anonKey) => {
      const { fetchFn, calls } = fakeFetch({ users: 1, vehicles: 1 });
      await createSources({ homecargarage: { url: 'https://abc.supabase.co', anonKey } }, fetchFn).homecargarage();
      return calls[0].init.headers;
    };
    const publishable = await run('sb_publishable_abc');
    assert.equal(publishable.apikey, 'sb_publishable_abc');
    assert.equal(publishable.Authorization, undefined);
    assert.equal((await run('eyJhbGciOi.x.y')).Authorization, 'Bearer eyJhbGciOi.x.y');
  });

  test('un valor que no es un número invalida la respuesta', async () => {
    const { fetchFn } = fakeFetch({ users: 'muchos', vehicles: 2 });
    const sources = createSources({ homecargarage: { url: 'https://abc.supabase.co', anonKey: 'anon' } }, fetchFn);
    await assert.rejects(sources.homecargarage(), /no es un número/);
  });
});

describe('config de analytics', () => {
  const base = { LIMIT_PROFILE: 'funcional' };
  test('las fuentes son opcionales y van por parejas', () => {
    assert.deepEqual(loadConfig(base).analytics, { entrenador: null, homecargarage: null });
    assert.throws(() => loadConfig({ ...base, ENTRENADOR_STATS_URL: 'https://e.dev/s' }), /van juntas/);
    assert.throws(() => loadConfig({ ...base, ENTRENADOR_STATS_URL: 'http://e.dev/s', ENTRENADOR_STATS_TOKEN: 'x'.repeat(32) }), /https/);
    assert.throws(() => loadConfig({ ...base, ENTRENADOR_STATS_URL: 'https://e.dev/s', ENTRENADOR_STATS_TOKEN: 'corto' }), /32 caracteres/);
  });
});

// Privacidad: el endpoint solo devuelve números, fechas y etiquetas conocidas; nunca texto libre,
// emails, IPs ni contenido de conversaciones.
describe('GET /api/analytics: sin datos personales', () => {
  const KEYS = new Set([
    'generatedAt', 'timeZone', 'costs', 'currency', 'updated', 'monthlyTotal', 'visits', 'last24h', 'last7d', 'total', 'days',
    'date', 'projects', 'portfolio', 'entrenador', 'homecargarage', 'status', 'updatedAt', 'since', 'metrics', 'cost', 'hosting',
    'ai', 'conversations', 'messages', 'blockedPct', 'aiCostMonth', 'aiCostPerConversation', 'visitsLast7d', 'activities',
    'analyzed', 'plans', 'workoutsSent', 'duplicatesMerged', 'daysInUse', 'evalsPassPct', 'users', 'vehicles',
  ]);
  const STRING = /^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?|ok|stale|unavailable|unconfigured|[A-Z]{3}|Europe\/Madrid)$/;

  function walk(value, path, problems) {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, problems));
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (!KEYS.has(key)) problems.push(`campo no permitido: ${path}.${key}`);
        walk(child, `${path}.${key}`, problems);
      }
    } else if (typeof value === 'string' && !STRING.test(value)) problems.push(`texto no permitido en ${path}: ${value}`);
    else if (!['string', 'number'].includes(typeof value) && value !== null) problems.push(`tipo no permitido en ${path}`);
    return problems;
  }

  test('todos los campos son números, fechas o estados conocidos', async () => {
    const usage = await seededUsage();
    const sources = {
      entrenador: async () => ({ activities: 1, analyzed: 1, plans: 1, workoutsSent: 1, duplicatesMerged: 0, daysInUse: 9, evalsPassPct: null }),
      homecargarage: async () => ({ users: 2, vehicles: 3 }),
    };
    const analytics = createAnalytics({ usage, costs: COSTS, sources, timeZone: TZ, now: () => NOW });
    const app = createApp({
      llm: { name: 'x', model: 'x', chat: async () => ({ text: '', toolCalls: [] }) },
      tools: [],
      sessions: createMemorySessionStore(),
      config: { trustProxy: 1, limits: LIMIT_PROFILES.funcional },
      analytics,
    });
    const res = await request(app).get('/api/analytics').expect(200);
    assert.match(res.headers['cache-control'], /max-age=300/);
    assert.deepEqual(walk(res.body, '$', []), []);
    assert.doesNotMatch(JSON.stringify(res.body), /@|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  test('si la analítica falla, 503 en JSON (la web enseña el último dato)', async () => {
    const app = createApp({
      llm: { name: 'x', chat: async () => ({}) },
      tools: [],
      sessions: createMemorySessionStore(),
      config: { trustProxy: 1, limits: LIMIT_PROFILES.funcional },
      analytics: {
        get: async () => {
          throw new Error('x');
        },
      },
    });
    const res = await request(app).get('/api/analytics').expect(503);
    assert.match(res.body.error, /temporarily unavailable/);
  });
});
