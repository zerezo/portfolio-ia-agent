import { randomUUID } from 'node:crypto';

// Solicitudes de contacto del formulario. Sin IA: validación determinista.
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
    return required ? { error: `El campo "${label}" es obligatorio.` } : { value: undefined };
  }
  if (typeof value !== 'string') return { error: `El campo "${label}" debe ser texto.` };
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return { error: `El campo "${label}" debe tener entre ${min} y ${max} caracteres.` };
  }
  if ((allowNewlines ? CONTROL_CHARS_EXCEPT_NEWLINES : CONTROL_CHARS).test(trimmed)) {
    return { error: `El campo "${label}" contiene caracteres no permitidos.` };
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

  if (value.email && !EMAIL_PATTERN.test(value.email)) errors.push('El email no es válido.');
  if (value.email) value.email = value.email.toLowerCase();

  const mode = body?.mode;
  if (!CONTACT_MODES.includes(mode)) {
    errors.push(`El campo "mode" debe ser uno de: ${CONTACT_MODES.join(', ')}.`);
  } else {
    value.mode = mode;
  }

  if (MODES_WITH_SLOT.has(mode)) {
    if (typeof body?.slotId !== 'string' || !freeSlotIds.has(body.slotId)) {
      errors.push('El hueco elegido no está disponible. Vuelve a cargar la disponibilidad y elige otro.');
    } else {
      value.slotId = body.slotId;
    }
  }

  if (mode === 'phone') {
    const phone = textField(body?.phone, { label: 'phone', min: 7, max: 20 });
    if (phone.error) errors.push(phone.error);
    else if (!PHONE_PATTERN.test(phone.value)) errors.push('El teléfono no es válido.');
    else value.phone = phone.value;
  }

  // Consentimiento explícito para tratar los datos (RGPD): debe ser exactamente true.
  if (body?.consent !== true) errors.push('Debes aceptar el tratamiento de tus datos para enviar la solicitud.');

  return errors.length ? { errors } : { value };
}

// Almacén en memoria. TODO(db): implementación en PostgreSQL con la misma interfaz.
export function createMemoryContactStore({ now = Date.now, retentionMs = CONTACT_RETENTION_MS } = {}) {
  const requests = new Map();

  const purgeExpired = () => {
    for (const [id, request] of requests) {
      if (now() - request.createdAt > retentionMs) requests.delete(id);
    }
  };

  return {
    create(data) {
      purgeExpired();
      const request = { id: randomUUID(), status: 'pending', createdAt: now(), ...data };
      requests.set(request.id, request);
      return { ...request };
    },

    get(id) {
      purgeExpired();
      const request = requests.get(id);
      return request && { ...request };
    },

    hasPendingFor(email) {
      purgeExpired();
      return [...requests.values()].some((r) => r.status === 'pending' && r.email === email);
    },

    // Huecos ocupados: los de solicitudes pendientes o aprobadas (las rechazadas lo liberan).
    takenSlotIds() {
      purgeExpired();
      return [...requests.values()]
        .filter((r) => r.slotId && (r.status === 'pending' || r.status === 'approved'))
        .map((r) => r.slotId);
    },
  };
}
