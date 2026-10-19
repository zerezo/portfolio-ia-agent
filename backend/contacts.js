import { randomUUID } from 'node:crypto';

// Solicitudes de contacto del formulario. Sin IA: validación determinista.
// Los mensajes de error los ve el visitante: en inglés, como la web.
// Modalidades: video (videollamada, con hueco), phone (llamada, con hueco y teléfono), email.

export const CONTACT_MODES = ['video', 'phone', 'email'];
const MODES_WITH_SLOT = new Set(['video', 'phone']);

// Las solicitudes caducan a los 30 días (RGPD: no guardar datos personales sin necesidad).
export const CONTACT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Caracteres de control (incluidos saltos de línea): se rechazan para evitar la inyección de
// cabeceras en los emails. El motivo es la excepción: admite saltos de línea.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_EXCEPT_NEWLINES = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

function textField(value, { label, min, max, required = true, allowNewlines = false }) {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `The "${label}" field is required.` } : { value: undefined };
  }
  if (typeof value !== 'string') return { error: `The "${label}" field must be text.` };
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return { error: `The "${label}" field must be between ${min} and ${max} characters.` };
  }
  if ((allowNewlines ? CONTROL_CHARS_EXCEPT_NEWLINES : CONTROL_CHARS).test(trimmed)) {
    return { error: `The "${label}" field contains characters that are not allowed.` };
  }
  return { value: trimmed };
}

// Valida el cuerpo del formulario. freeSlotIds: huecos libres en este momento.
// Devuelve { errors: [...] } o { value: { ...campos normalizados } }.
export function validateContactRequest(body, { freeSlotIds }) {
  const errors = [];
  const value = {};
  const take = (key, result) => {
    if (result.error) errors.push(result.error);
    else if (result.value !== undefined) value[key] = result.value;
  };

  take('name', textField(body?.name, { label: 'name', min: 2, max: 100 }));
  take('email', textField(body?.email, { label: 'email', min: 6, max: 254 }));
  take('company', textField(body?.company, { label: 'company', min: 2, max: 100, required: false }));
  take('reason', textField(body?.reason, { label: 'reason', min: 10, max: 1000, allowNewlines: true }));

  if (value.email && !EMAIL_PATTERN.test(value.email)) errors.push('The email address is not valid.');
  if (value.email) value.email = value.email.toLowerCase();

  const mode = body?.mode;
  if (!CONTACT_MODES.includes(mode)) {
    errors.push(`The "mode" field must be one of: ${CONTACT_MODES.join(', ')}.`);
  } else {
    value.mode = mode;
  }

  if (MODES_WITH_SLOT.has(mode)) {
    if (typeof body?.slotId !== 'string' || !freeSlotIds.has(body.slotId)) {
      errors.push('The selected time slot is no longer available. Please reload the availability and choose another one.');
    } else {
      value.slotId = body.slotId;
    }
  }

  if (mode === 'phone') {
    const phone = textField(body?.phone, { label: 'phone', min: 7, max: 20 });
    if (phone.error) errors.push(phone.error);
    else if (!PHONE_PATTERN.test(phone.value)) errors.push('The phone number is not valid.');
    else value.phone = phone.value;
  }

  // Consentimiento explícito para tratar los datos (RGPD): debe ser exactamente true.
  if (body?.consent !== true) errors.push('You must accept the privacy policy to send the request.');

  return errors.length ? { errors } : { value };
}

/// Una solicitud choca con otra activa: el hueco ya está cogido o el email ya tiene una
// pendiente. En PostgreSQL lo detectan los índices únicos (también con peticiones simultáneas).
export class ContactConflictError extends Error {
  constructor(reason) {
    super(reason === 'slot_taken' ? 'El hueco ya está ocupado' : 'Ya hay una solicitud pendiente con ese email');
    this.reason = reason; // 'slot_taken' | 'pending_email'
  }
}

const isActive = (request) => request.status === 'pending' || request.status === 'approved';

// Almacén en memoria (tests y desarrollo sin base de datos). Misma interfaz y mismas reglas
// que el de PostgreSQL; los métodos son síncronos, pero app.js los usa con await.
export function createMemoryContactStore({ now = Date.now, retentionMs = CONTACT_RETENTION_MS } = {}) {
  const requests = new Map();

  const purgeExpired = () => {
    for (const [id, request] of requests) {
      if (now() - request.createdAt > retentionMs) requests.delete(id);
    }
  };

  return {
    purgeExpired,

    create(data) {
      purgeExpired();
      const all = [...requests.values()];
      if (data.slotId && all.some((r) => isActive(r) && r.slotId === data.slotId)) {
        throw new ContactConflictError('slot_taken');
      }
      if (all.some((r) => r.status === 'pending' && r.email === data.email)) {
        throw new ContactConflictError('pending_email');
      }
      const request = { id: randomUUID(), status: 'pending', createdAt: now(), ...data };
      requests.set(request.id, request);
      return { ...request };
    },

    get(id) {
      purgeExpired();
      const request = requests.get(id);
      return request && { ...request };
    },

    // Cierra una solicitud pendiente (approved | rejected) y guarda datos extra (p. ej. el
    // enlace de la videollamada). Devuelve la solicitud actualizada, o undefined si no existe
    // o ya estaba cerrada: así cada enlace de revisión solo funciona una vez.
    resolve(id, status, extra = {}) {
      purgeExpired();
      const request = requests.get(id);
      if (!request || request.status !== 'pending') return undefined;
      Object.assign(request, extra, { status, resolvedAt: now() });
      return { ...request };
    },

    hasPendingFor(email) {
      purgeExpired();
      return [...requests.values()].some((r) => r.status === 'pending' && r.email === email);
    },

    // Huecos ocupados: los de solicitudes pendientes o aprobadas (las rechazadas lo liberan).
    takenSlotIds() {
      purgeExpired();
      return [...requests.values()].filter((r) => r.slotId && isActive(r)).map((r) => r.slotId);
    },
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = 'id, status, created_at, resolved_at, name, email, company, reason, mode, slot_id, phone, meeting_url';

// Fila de la base de datos -> el mismo objeto que usa el resto del código (sin nulos).
function toRequest(row) {
  if (!row) return undefined;
  const request = {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.getTime(),
    resolvedAt: row.resolved_at?.getTime(),
    name: row.name,
    email: row.email,
    company: row.company,
    reason: row.reason,
    mode: row.mode,
    slotId: row.slot_id,
    phone: row.phone,
    meetingUrl: row.meeting_url,
  };
  for (const key of Object.keys(request)) {
    if (request[key] === null || request[key] === undefined) delete request[key];
  }
  return request;
}

// Almacén en PostgreSQL. Las reglas (un hueco por solicitud activa, una pendiente por email)
// las garantizan los índices únicos de la migración 001.
export function createPgContactStore(pool, { retentionMs = CONTACT_RETENTION_MS } = {}) {
  // Las caducadas se excluyen en cada consulta; el borrado físico lo hace purgeExpired().
  const fresh = 'created_at > now() - make_interval(secs => $1::double precision / 1000)';

  return {
    async purgeExpired() {
      const { rowCount } = await pool.query(
        'DELETE FROM contact_requests WHERE created_at <= now() - make_interval(secs => $1::double precision / 1000)',
        [retentionMs],
      );
      return rowCount;
    },

    async create(data) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO contact_requests (id, status, name, email, company, reason, mode, slot_id, phone)
           VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${COLUMNS}`,
          [randomUUID(), data.name, data.email, data.company ?? null, data.reason, data.mode, data.slotId ?? null, data.phone ?? null],
        );
        return toRequest(rows[0]);
      } catch (error) {
        // 23505: violación de un índice único.
        if (error.code === '23505' && error.constraint === 'contact_requests_active_slot') {
          throw new ContactConflictError('slot_taken');
        }
        if (error.code === '23505' && error.constraint === 'contact_requests_pending_email') {
          throw new ContactConflictError('pending_email');
        }
        throw error;
      }
    },

    async get(id) {
      // Un id que no es UUID haría fallar la consulta: simplemente no existe.
      if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return undefined;
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM contact_requests WHERE id = $2 AND ${fresh}`, [
        retentionMs,
        id,
      ]);
      return toRequest(rows[0]);
    },

    // Solo cierra solicitudes pendientes: con dos clics simultáneos, solo uno actualiza la fila.
    async resolve(id, status, extra = {}) {
      if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return undefined;
      const { rows } = await pool.query(
        `UPDATE contact_requests
            SET status = $3, resolved_at = now(), meeting_url = COALESCE($4, meeting_url)
          WHERE id = $2 AND status = 'pending' AND ${fresh}
          RETURNING ${COLUMNS}`,
        [retentionMs, id, status, extra.meetingUrl ?? null],
      );
      return toRequest(rows[0]);
    },

    async hasPendingFor(email) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM contact_requests WHERE email = $2 AND status = 'pending' AND ${fresh}`,
        [retentionMs, email],
      );
      return rowCount > 0;
    },

    async takenSlotIds() {
      const { rows } = await pool.query(
        `SELECT slot_id FROM contact_requests
          WHERE slot_id IS NOT NULL AND status IN ('pending', 'approved') AND ${fresh}`,
        [retentionMs],
      );
      return rows.map((r) => r.slot_id);
    },
  };
}
