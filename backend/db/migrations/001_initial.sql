-- Solicitudes de contacto del formulario.
CREATE TABLE contact_requests (
  id          uuid PRIMARY KEY,
  status      text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  name        text NOT NULL,
  email       text NOT NULL,
  company     text,
  reason      text NOT NULL,
  mode        text NOT NULL CHECK (mode IN ('video', 'phone', 'email')),
  slot_id     text,
  phone       text,
  meeting_url text
);

-- Un hueco solo puede estar en una solicitud activa (pendiente o aprobada): la base de
-- datos lo garantiza aunque lleguen dos peticiones a la vez. Rechazar lo libera.
CREATE UNIQUE INDEX contact_requests_active_slot
  ON contact_requests (slot_id)
  WHERE slot_id IS NOT NULL AND status IN ('pending', 'approved');

-- Una sola solicitud pendiente por email.
CREATE UNIQUE INDEX contact_requests_pending_email
  ON contact_requests (email)
  WHERE status = 'pending';

-- Para el borrado por antigüedad (retención de 30 días).
CREATE INDEX contact_requests_created_at ON contact_requests (created_at);

-- Historial de conversación del chat.
CREATE TABLE chat_sessions (
  id         uuid PRIMARY KEY,
  messages   jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_sessions_updated_at ON chat_sessions (updated_at);
