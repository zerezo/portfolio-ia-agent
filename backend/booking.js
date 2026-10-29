import { describeSlot } from './calendar.js';
import { CONTACT_MODES } from './contacts.js';

// Reservas desde el chat. El modelo conversa y propone; el código valida; el visitante confirma.
// - get_availability: lee los huecos libres reales (los mismos que GET /api/availability).
// - propose_meeting: comprueba el hueco elegido y deja una propuesta para el frontend, que
//   muestra una tarjeta con nombre, email y consentimiento. La reserva la crea POST /api/contact
//   cuando el visitante pulsa Confirm: el modelo nunca escribe nada ni maneja datos personales.

// Palabras de reunión y de fecha u hora (inglés y español, sin tildes): el filtro previo deja
// pasar estos mensajes ("el jueves a las 5 me va bien") aunque no aparezcan en el CV.
const BOOKING_WORDS =
  /\b(reunion|reunirme|reunirnos|llamada|llamar|llamarle|videollamada|entrevista|cita|agendar|reservar|contactar|contacto|disponibilidad|hueco|huecos|meeting|meet|call|interview|appointment|schedule|book|booking|contact|availability|available|slot|slots|video|phone|telefono|email|correo)\b/;
const DATE_WORDS =
  /\b(lunes|martes|miercoles|jueves|viernes|hoy|manana|semana|tarde|monday|tuesday|wednesday|thursday|friday|today|tomorrow|week|afternoon|evening|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}([:.h]\d{2})?\s*(h|pm|am)?\b/;

const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const isBookingMessage = (text) => {
  const t = normalize(text);
  return BOOKING_WORDS.test(t) || DATE_WORDS.test(t);
};

// Lo que no venga de get_availability no es un hueco: solo se aceptan ids con este formato.
const SLOT_ID = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// Resumen opcional del motivo para la tarjeta (el visitante lo puede editar).
const MAX_REASON = 300;

// freeSlots() -> huecos libres ahora (calendar.js). schedule: AVAILABILITY de config.js.
export function createBookingTools({ freeSlots, schedule }) {
  const getAvailability = {
    name: 'get_availability',
    isRelevant: isBookingMessage,
    description:
      'Lists the free meeting slots with Alejandro in the next two weeks (Madrid time). Use it as soon as ' +
      'someone wants to meet, call or contact him, and again before proposing a slot. Optionally filter ' +
      'by a date (YYYY-MM-DD).',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional day to list, YYYY-MM-DD.' },
      },
    },
    async run({ date } = {}) {
      const slots = (await freeSlots()).filter((s) => !date || s.date === date);
      if (slots.length === 0) {
        return date
          ? `No free slots on ${date}. Call get_availability without a date to see other days.`
          : 'There are no free slots in the next two weeks. He can still be contacted by email (mode "email").';
      }
      const days = new Map();
      for (const slot of slots) {
        const label = describeSlot(slot.id, schedule.timeZone).label;
        if (!days.has(slot.date)) days.set(slot.date, { label, times: [] });
        days.get(slot.date).times.push(slot.time);
      }
      return [
        `Free slots (Madrid time, ${schedule.slotMinutes} minutes each). A slot id is the date + "T" + time, ` +
          'for example 2026-11-05T17:20. Offer the visitor a few options, not the whole list.',
        ...[...days].map(([d, { label, times }]) => `- ${label} (${d}): ${times.join(', ')}`),
        `Modes: video (Jitsi link), phone (he calls them) or email (no meeting, no slot).`,
      ].join('\n');
    },
  };

  const proposeMeeting = {
    name: 'propose_meeting',
    description:
      'Shows the visitor a confirmation card for the chosen meeting, where they enter their name, email ' +
      'and consent and confirm it themselves. Call it only once the visitor has chosen a mode and, for ' +
      'video or phone, an exact free slot from get_availability. This does not book anything by itself.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: CONTACT_MODES, description: 'video, phone or email.' },
        slot_id: { type: 'string', description: 'Exact slot id from get_availability (not for email).' },
        reason: { type: 'string', description: 'Optional one-line summary of what they want to talk about.' },
      },
      required: ['mode'],
    },
    async run({ mode, slot_id: slotId, reason } = {}, context = {}) {
      if (!CONTACT_MODES.includes(mode)) return `Error: mode must be one of ${CONTACT_MODES.join(', ')}.`;

      let slot;
      if (mode !== 'email') {
        if (typeof slotId !== 'string' || !SLOT_ID.test(slotId)) {
          return 'Error: video and phone need slot_id, an exact slot id from get_availability.';
        }
        if (!(await freeSlots()).some((s) => s.id === slotId)) {
          return `Error: ${slotId} is not a free slot. Call get_availability and offer the visitor other times.`;
        }
        const { start, label, time } = describeSlot(slotId, schedule.timeZone);
        slot = { id: slotId, label, time, start: start.toISOString(), minutes: schedule.slotMinutes };
      }

      // Texto del modelo que acaba en un campo editable: recortado y sin caracteres de control.
      const summary =
        typeof reason === 'string'
          ? // eslint-disable-next-line no-control-regex
            reason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_REASON)
          : '';
      context.proposal = { mode, ...(slot && { slot }), ...(summary && { reason: summary }) };

      return (
        'The confirmation card is now shown right below your reply. Tell them briefly to fill in their details and ' +
        'press Confirm in the card; Alejandro will then review the request and reply by email. Do not ask ' +
        'for their name, email or phone in the chat, and do not say the meeting is booked yet.'
      );
    },
  };

  return [getAvailability, proposeMeeting];
}
