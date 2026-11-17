-- Analítica agregada (usage.js y analytics.js). Solo números: sin IP, sesión ni contenido.

-- Contadores por hora: cargas de la web, conversaciones, mensajes, bloqueados y tokens por modelo.
CREATE TABLE usage_counters (
  hour   timestamptz NOT NULL,
  metric text NOT NULL,
  value  bigint NOT NULL,
  PRIMARY KEY (hour, metric)
);

-- Último dato bueno de cada fuente externa (Entrenador, HomeCarGarage): si una fuente falla, se
-- sirve este con su hora, también tras un reinicio.
CREATE TABLE analytics_snapshots (
  source     text PRIMARY KEY,
  data       jsonb NOT NULL,
  fetched_at timestamptz NOT NULL
);
