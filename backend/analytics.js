import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

// /api/analytics: uso real, coste y visitas de los proyectos, solo con datos agregados.
//   - Portfolio: contadores propios (usage.js) y coste de IA calculado con los tokens registrados.
//   - Entrenador y HomeCarGarage: conteos de sus servidores (solo números). Si una fuente falla se
//     sirve su último dato bueno (tabla analytics_snapshots) con su hora; si nunca respondió, null.
//   - Hosting: data/costs.yaml, que mantiene Alejandro a mano (null = sin dato: la web enseña "—").
// Dos cachés: las fuentes externas, 1 hora (no se consultan en cada visita: D1 y Supabase cobran o
// limitan por consulta); los contadores propios, 1 minuto (casi en vivo, y una ráfaga de visitas no
// se convierte en una ráfaga de consultas a PostgreSQL).

export const COSTS_PATH = new URL('./data/costs.yaml', import.meta.url);
const SOURCES_TTL_MS = 60 * 60 * 1000;
const USAGE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_DAYS = 28;

const money = z.number().nonnegative().nullable();
const CostsSchema = z.strictObject({
  updated: z.union([z.string(), z.date()]).transform((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d)),
  currency: z.string().regex(/^[A-Z]{3}$/),
  hosting: z.record(z.string(), z.record(z.string(), money)),
  shared: z.record(z.string(), money).default({}),
  models: z.record(z.string(), z.strictObject({ input: z.number().nonnegative(), output: z.number().nonnegative() })),
});

export function loadCosts(path = COSTS_PATH) {
  const result = CostsSchema.safeParse(parse(readFileSync(path, 'utf8')));
  if (!result.success) {
    throw new Error(`costs.yaml no es válido: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return result.data;
}

// Suma de importes; null si falta alguno (mejor "—" que un total por debajo del real).
const sumKnown = (values) => (values.length && values.every((v) => v !== null && v !== undefined) ? values.reduce((a, b) => a + b, 0) : null);
const round = (value, decimals = 4) => (value === null ? null : Math.round(value * 10 ** decimals) / 10 ** decimals);

// Medianoche local (zona horaria) del día de `date`, como instante UTC.
function zonedDayStart(date, timeZone, { monthStart = false } = {}) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = asUtc - Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, monthStart ? 1 : parts.day) - offset);
}

const dayIn = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// Coste de IA de un periodo: tokens por modelo × precio por millón. null si algún modelo usado no
// tiene precio en costs.yaml (no se inventa).
export function aiCost(totals, models) {
  let cost = 0;
  for (const [metric, tokens] of Object.entries(totals)) {
    const match = metric.match(/^tokens_(in|out):(.+)$/);
    if (!match) continue;
    const price = models[match[2]];
    if (!price) return null;
    cost += (tokens / 1e6) * (match[1] === 'in' ? price.input : price.output);
  }
  return cost;
}

// Conteos de una fuente externa: solo enteros >= 0 (o null) con nombres conocidos. Cualquier otra
// cosa se descarta: así nunca se reenvía un dato personal aunque la fuente lo mandara.
function counts(data, keys) {
  if (!data || typeof data !== 'object') throw new Error('respuesta sin objeto');
  const out = {};
  for (const key of keys) {
    const value = data[key];
    if (value === null || value === undefined) out[key] = null;
    else if (Number.isFinite(value) && value >= 0) out[key] = key.endsWith('Pct') ? round(value, 1) : Math.round(value);
    else throw new Error(`"${key}" no es un número`);
  }
  return out;
}

export const ENTRENADOR_KEYS = ['activities', 'analyzed', 'plans', 'workoutsSent', 'duplicatesMerged', 'daysInUse', 'evalsPassPct'];
export const HOMECARGARAGE_KEYS = ['users', 'vehicles'];

async function fetchJson(fetchFn, url, init) {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Fuentes externas configurables (config.analytics). Cada una devuelve sus conteos.
export function createSources({ entrenador, homecargarage }, fetchFn = fetch) {
  return {
    ...(entrenador && {
      entrenador: async () =>
        counts(await fetchJson(fetchFn, entrenador.url, { headers: { Authorization: `Bearer ${entrenador.token}` } }), ENTRENADOR_KEYS),
    }),
    // RPC public_stats de Supabase: función de solo conteos accesible con la clave pública. La
    // clave nueva (sb_publishable_…) no es un JWT y va solo en `apikey`; la antigua (anon, JWT)
    // también en Authorization.
    ...(homecargarage && {
      homecargarage: async () =>
        counts(
          await fetchJson(fetchFn, `${homecargarage.url}/rest/v1/rpc/public_stats`, {
            method: 'POST',
            headers: {
              apikey: homecargarage.anonKey,
              ...(homecargarage.anonKey.startsWith('eyJ') && { Authorization: `Bearer ${homecargarage.anonKey}` }),
              'Content-Type': 'application/json',
            },
            body: '{}',
          }),
          HOMECARGARAGE_KEYS,
        ),
    }),
  };
}

export function createMemorySnapshotStore() {
  const rows = new Map();
  return {
    async get(source) {
      return rows.get(source) ?? null;
    },
    async set(source, data, fetchedAt) {
      rows.set(source, { data, fetchedAt });
    },
  };
}

export function createPgSnapshotStore(pool) {
  return {
    async get(source) {
      const { rows } = await pool.query('SELECT data, fetched_at FROM analytics_snapshots WHERE source = $1', [source]);
      return rows[0] ? { data: rows[0].data, fetchedAt: rows[0].fetched_at } : null;
    },
    async set(source, data, fetchedAt) {
      await pool.query(
        `INSERT INTO analytics_snapshots (source, data, fetched_at) VALUES ($1, $2, $3)
         ON CONFLICT (source) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at`,
        [source, JSON.stringify(data), fetchedAt],
      );
    },
  };
}

// Memoriza una función asíncrona durante `ttl` ms; las peticiones simultáneas comparten la misma
// llamada. Si falla, no se guarda nada y la siguiente petición lo vuelve a intentar.
function memoize(fn, ttl, now) {
  let cache = null; // { value, at } | null
  let pending = null;
  return async () => {
    if (cache && now().getTime() - cache.at < ttl) return cache.value;
    pending ??= fn()
      .then((value) => {
        cache = { value, at: now().getTime() };
        return value;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

export function createAnalytics({ usage, costs, sources = {}, snapshots = createMemorySnapshotStore(), timeZone, now = () => new Date() }) {

  async function external(name) {
    const fetchSource = sources[name];
    if (!fetchSource) return { status: 'unconfigured', updatedAt: null, metrics: null };
    try {
      const metrics = await fetchSource();
      const at = now();
      await snapshots.set(name, metrics, at).catch((error) => console.error(`[analytics] no se guardó ${name}:`, error.message));
      return { status: 'ok', updatedAt: at.toISOString(), metrics };
    } catch (error) {
      console.error(`[analytics] ${name} no responde: ${error.message}`);
      const snapshot = await snapshots.get(name).catch(() => null);
      return snapshot
        ? { status: 'stale', updatedAt: new Date(snapshot.fetchedAt).toISOString(), metrics: snapshot.data }
        : { status: 'unavailable', updatedAt: null, metrics: null };
    }
  }

  async function own(at) {
    const dayStart = zonedDayStart(at, timeZone);
    const monthStart = zonedDayStart(at, timeZone, { monthStart: true });
    const chartStart = new Date(dayStart.getTime() - (CHART_DAYS - 1) * DAY_MS);
    const [all, week, day, month, daily, first] = await Promise.all([
      usage.totals(),
      usage.totals(new Date(at.getTime() - 7 * DAY_MS)),
      usage.totals(new Date(at.getTime() - DAY_MS)),
      usage.totals(monthStart),
      usage.daily('page_loads', chartStart, timeZone),
      usage.firstHour(),
    ]);
    const n = (totals, metric) => totals[metric] ?? 0;
    const monthCost = aiCost(month, costs.models);
    const monthConversations = n(month, 'conversations');
    const byDay = new Map(daily.map((d) => [d.date, d.value]));
    const days = Array.from({ length: CHART_DAYS }, (_, i) => {
      const date = dayIn(new Date(chartStart.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000), timeZone);
      return { date, visits: byDay.get(date) ?? 0 };
    });
    return {
      since: first ? first.toISOString() : null,
      portfolio: {
        conversations: { total: n(all, 'conversations'), last7d: n(week, 'conversations') },
        messages: n(all, 'messages'),
        blockedPct: n(all, 'messages') ? round((n(all, 'blocked') / n(all, 'messages')) * 100, 1) : null,
        aiCostMonth: round(monthCost),
        aiCostPerConversation: monthCost !== null && monthConversations ? round(monthCost / monthConversations) : null,
        visitsLast7d: n(week, 'page_loads'),
      },
      visits: { last24h: n(day, 'page_loads'), last7d: n(week, 'page_loads'), total: n(all, 'page_loads'), days },
    };
  }

  const ownCached = memoize(async () => ({ at: now(), data: await own(now()) }), USAGE_TTL_MS, now);
  const externalCached = memoize(
    async () => {
      const [entrenador, homecargarage] = await Promise.all([external('entrenador'), external('homecargarage')]);
      return { entrenador, homecargarage };
    },
    SOURCES_TTL_MS,
    now,
  );

  async function build() {
    const [{ at, data: usageData }, { entrenador, homecargarage }] = await Promise.all([ownCached(), externalCached()]);
    const hosting = Object.fromEntries(
      Object.entries(costs.hosting).map(([project, lines]) => [project, round(sumKnown(Object.values(lines)), 2)]),
    );
    const projectTotal = (project, ai = 0) => (hosting[project] === null || ai === null ? null : round(hosting[project] + ai, 4));
    const portfolioTotal = projectTotal('portfolio', usageData.portfolio.aiCostMonth);
    const shared = sumKnown(Object.values(costs.shared));
    const totals = [portfolioTotal, projectTotal('entrenador'), projectTotal('homecargarage'), Object.keys(costs.shared).length ? shared : 0];
    return {
      generatedAt: at.toISOString(),
      timeZone,
      costs: { currency: costs.currency, updated: costs.updated, monthlyTotal: round(sumKnown(totals), 2) },
      visits: usageData.visits,
      projects: {
        portfolio: {
          status: 'ok',
          updatedAt: at.toISOString(),
          since: usageData.since,
          metrics: usageData.portfolio,
          cost: { hosting: hosting.portfolio, ai: usageData.portfolio.aiCostMonth, total: portfolioTotal },
        },
        // El Entrenador corre dentro de la suscripción de Claude.ai: no hay tokens que medir.
        entrenador: { ...entrenador, cost: { hosting: hosting.entrenador, ai: null, total: projectTotal('entrenador') } },
        homecargarage: { ...homecargarage, cost: { hosting: hosting.homecargarage, ai: 0, total: projectTotal('homecargarage') } },
      },
    };
  }

  return { get: build };
}
