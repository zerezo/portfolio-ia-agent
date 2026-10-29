-- Contadores de los límites de peticiones (chat y formulario): sobreviven a los despliegues y
-- los comparten todas las instancias. La clave lleva el hash de la IP, nunca la IP.
CREATE TABLE rate_limits (
  key      text PRIMARY KEY,
  hits     integer NOT NULL,
  reset_at timestamptz NOT NULL
);

-- Para el borrado de ventanas terminadas.
CREATE INDEX rate_limits_reset_at ON rate_limits (reset_at);
