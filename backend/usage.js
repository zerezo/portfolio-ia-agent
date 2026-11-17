// Contadores agregados de uso para /api/analytics: cargas de la web, conversaciones, mensajes,
// mensajes bloqueados por el filtro previo y tokens por modelo. Solo números por hora: ni IP, ni
// sesión, ni contenido. En PostgreSQL (tabla usage_counters) o en memoria sin DATABASE_URL.

const METRIC = /^(page_loads|conversations|messages|blocked|tokens_(in|out):[A-Za-z0-9._:-]{1,64})$/;
const HOUR_MS = 60 * 60 * 1000;
const hourOf = (at) => new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);

function check(metric, value) {
  if (!METRIC.test(metric)) throw new Error(`Métrica desconocida: ${metric}`);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Valor inválido para ${metric}: ${value}`);
}

// Día local (AAAA-MM-DD) de un instante en una zona horaria.
const dayIn = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export function createMemoryUsageStore() {
  const rows = new Map(); // `${hora ISO}|${métrica}` -> valor
  return {
    async add(metric, value = 1, at = new Date()) {
      check(metric, value);
      const key = `${hourOf(at).toISOString()}|${metric}`;
      rows.set(key, (rows.get(key) ?? 0) + value);
    },
    // { métrica: total } desde `since` (incluido); sin since, de siempre.
    async totals(since) {
      const out = {};
      for (const [key, value] of rows) {
        const [hour, metric] = key.split('|');
        if (since && new Date(hour) < hourOf(since)) continue;
        out[metric] = (out[metric] ?? 0) + value;
      }
      return out;
    },
    // [{ date, value }] por día local de una métrica, desde `since`.
    async daily(metric, since, timeZone) {
      const byDay = new Map();
      for (const [key, value] of rows) {
        const [hour, m] = key.split('|');
        if (m !== metric || new Date(hour) < hourOf(since)) continue;
        const day = dayIn(new Date(hour), timeZone);
        byDay.set(day, (byDay.get(day) ?? 0) + value);
      }
      return [...byDay].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    },
    // Primera hora con datos: desde cuándo se cuenta (la web lo enseña).
    async firstHour() {
      const hours = [...rows.keys()].map((key) => key.split('|')[0]).sort();
      return hours.length ? new Date(hours[0]) : null;
    },
  };
}

export function createPgUsageStore(pool) {
  return {
    async add(metric, value = 1, at = new Date()) {
      check(metric, value);
      await pool.query(
        `INSERT INTO usage_counters (hour, metric, value) VALUES ($1, $2, $3)
         ON CONFLICT (hour, metric) DO UPDATE SET value = usage_counters.value + EXCLUDED.value`,
        [hourOf(at), metric, value],
      );
    },
    async totals(since) {
      const { rows } = await pool.query(
        'SELECT metric, sum(value)::bigint AS total FROM usage_counters WHERE $1::timestamptz IS NULL OR hour >= $1 GROUP BY metric',
        [since ? hourOf(since) : null],
      );
      return Object.fromEntries(rows.map((r) => [r.metric, Number(r.total)]));
    },
    async daily(metric, since, timeZone) {
      const { rows } = await pool.query(
        `SELECT to_char(hour AT TIME ZONE $3, 'YYYY-MM-DD') AS date, sum(value)::bigint AS value
         FROM usage_counters WHERE metric = $1 AND hour >= $2 GROUP BY 1 ORDER BY 1`,
        [metric, hourOf(since), timeZone],
      );
      return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
    },
    async firstHour() {
      const { rows } = await pool.query('SELECT min(hour) AS first FROM usage_counters');
      return rows[0]?.first ?? null;
    },
  };
}
