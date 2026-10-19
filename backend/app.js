import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { runAgent } from './agent.js';
import { availabilityByDay, formatLongDate, listFreeSlots, localDate } from './calendar.js';
import { AVAILABILITY, CONTACT_LIMITS, FLOOD_LIMIT, WINDOWS } from './config.js';
import { validateContactRequest } from './contacts.js';
import { SESSION_ID_PATTERN } from './sessions.js';

const SYSTEM_PROMPT = [
  'Eres el asistente del portfolio profesional de Alejandro Cerezo Gilarranz, ingeniero de',
  'Telecomunicaciones que trabaja en ciberseguridad (riesgo y cumplimiento).',
  'Reglas:',
  '- Antes de responder sobre Alejandro, consulta su CV con la herramienta buscar_en_cv.',
  '- Responde solo con datos que devuelva la herramienta. Si no aparecen, di que no tienes esa información.',
  '- No inventes fechas, empresas, cifras ni opiniones, y no añadas valoraciones propias.',
  '- Distingue experiencia laboral de certificaciones y formación: una certificación no es experiencia.',
  '- Si la búsqueda no da resultados, prueba otra vez con palabras distintas antes de rendirte.',
  '- Responde en el idioma del usuario, en tercera persona y en 2-4 frases.',
  '- Si la pregunta no trata sobre Alejandro ni su perfil profesional, indícalo con amabilidad y no la respondas.',
  '- Si quieren reunirse, llamarle o contactar con él, no propongas horarios ni pidas datos: indica que',
  '  pueden solicitarlo con el formulario de contacto de esta página, que muestra su disponibilidad.',
].join('\n');

// Peticiones de contacto: se detectan en el código, no con el modelo. Se responde con una
// frase fija y la acción abrir_formulario, sin llamar al modelo (más rápido y sin errores).
// Se evitan palabras ambiguas ("lunes", "mañana") que aparecen en preguntas sobre el CV.
const CONTACT_WORDS_ES =
  /\b(reunion|reunirme|reunirnos|reunirse|llamada|llamarle|videollamada|entrevista|entrevistarle|cita|agendar|contactar|contactarle|contacto|disponibilidad|hueco|huecos)\b/;
const CONTACT_WORDS_EN = /\b(meeting|meet|call|interview|appointment|schedule|book|contact|availability|available)\b/;

const CONTACT_REPLY = {
  es:
    'Puedes solicitar una reunión, una llamada o un contacto por email con el formulario de contacto: ' +
    'muestra la disponibilidad de Alejandro y él confirmará la solicitud por email.',
  en:
    'You can request a meeting, a call or an email contact using the contact form: ' +
    'it shows Alejandro’s availability and he will confirm your request by email.',
};

const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Idioma de la respuesta si el mensaje es una petición de contacto; null si no lo es.
export function detectContactIntent(message) {
  const text = normalize(message);
  if (CONTACT_WORDS_ES.test(text)) return 'es';
  if (CONTACT_WORDS_EN.test(text)) return 'en';
  return null;
}

// Búsqueda forzada cuando el modelo no usa herramientas en la primera ronda (ver agent.js).
// En preguntas de seguimiento ("¿y antes de eso?") el mensaje solo no basta, así que se
// combina con la pregunta anterior del usuario.
export const forcedCvSearch = (message, history) => {
  const previous = history.findLast((m) => m.role === 'user')?.content;
  return { name: 'buscar_en_cv', input: { consulta: previous ? `${previous} ${message}` : message } };
};

const EMPTY_REPLY = 'No he podido generar una respuesta. Prueba a reformular la pregunta.';

// Estados del proveedor que indican saturación o indisponibilidad temporal, no un fallo nuestro.
const UPSTREAM_BUSY = new Set([429, 503, 529]);

function limiter({ windowMs, limit, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

// El modelo no sabe la fecha actual (tiende a suponer la de su entrenamiento): se la damos.
export function systemPromptFor(now) {
  const { timeZone } = AVAILABILITY;
  return (
    `${SYSTEM_PROMPT}\n` +
    `- Hoy es ${formatLongDate(now, timeZone)} (${localDate(now, timeZone)}), hora de Madrid. ` +
    'Interpreta "mañana", "el jueves" o "la semana que viene" a partir de esta fecha.'
  );
}

const MODE_LABELS = { video: 'Videollamada', phone: 'Llamada telefónica', email: 'Contacto por email' };

// Textos de los emails de una solicitud nueva: aviso a Alejandro y acuse para quien la envía.
function contactEmails(request, slot, { ownerEmail }) {
  const when = slot ? `${slot.label}, ${slot.time} (hora de Madrid, ${AVAILABILITY.slotMinutes} min)` : null;
  const summary = [
    `Modalidad: ${MODE_LABELS[request.mode]}`,
    ...(when ? [`Fecha: ${when}`] : []),
    `Nombre: ${request.name}`,
    `Email: ${request.email}`,
    ...(request.company ? [`Empresa: ${request.company}`] : []),
    ...(request.phone ? [`Teléfono: ${request.phone}`] : []),
    '',
    'Motivo:',
    request.reason,
  ].join('\n');

  return [
    {
      to: ownerEmail,
      subject: `Nueva solicitud de contacto: ${request.name} (${MODE_LABELS[request.mode]})`,
      // TODO(reuniones): enlaces firmados para aprobar o rechazar.
      text: `${summary}\n\nId de la solicitud: ${request.id}\n`,
    },
    {
      to: request.email,
      subject: 'Hemos recibido tu solicitud de contacto',
      text:
        `Hola, ${request.name}:\n\n` +
        'Gracias por tu interés. Alejandro revisará tu solicitud y te responderá por email.\n' +
        `${when ? 'El hueco elegido queda reservado hasta entonces.\n' : ''}\n` +
        `Resumen de tu solicitud:\n${summary}\n`,
    },
  ];
}

// contacts: almacén de solicitudes (contacts.js). mailer: send({ to, subject, text }) (mailer.js).
export function createApp({ llm, tools, sessions, contacts, mailer, config, now = () => new Date() }) {
  const hasCvTool = tools.some((t) => t.name === 'buscar_en_cv');
  const freeSlots = () =>
    listFreeSlots({ schedule: AVAILABILITY, now: now(), taken: new Set(contacts?.takenSlotIds() ?? []) });
  const { limits, trustProxy } = config;
  const app = express();

  app.disable('x-powered-by');
  // Railway (y después Cloudflare) actúan como proxy: sin esto todas las IPs serían la del proxy.
  app.set('trust proxy', trustProxy);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    limiter({
      ...FLOOD_LIMIT,
      message: 'Demasiadas peticiones. Espera un minuto.',
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  // Disponibilidad para el formulario de contacto. Sin IA: basta el límite anti-saturación.
  app.get('/api/availability', (req, res) => {
    res.json({
      timeZone: AVAILABILITY.timeZone,
      slotMinutes: AVAILABILITY.slotMinutes,
      days: availabilityByDay(freeSlots(), AVAILABILITY.timeZone),
    });
  });

  // Los límites van antes de la validación: aquí un intento inválido también cuenta, para
  // que no se pueda sondear el formulario sin coste.
  const contactLimiters = [
    limiter({
      windowMs: 60 * WINDOWS.MINUTE,
      limit: CONTACT_LIMITS.perHourPerIp,
      message: 'Has enviado demasiadas solicitudes. Inténtalo dentro de una hora.',
    }),
    limiter({
      windowMs: WINDOWS.DAY,
      limit: CONTACT_LIMITS.globalPerDay,
      keyGenerator: () => 'global',
      message: 'El formulario ha alcanzado su capacidad diaria. Vuelve mañana o escribe por LinkedIn.',
    }),
  ];

  app.post('/api/contact', contactLimiters, async (req, res) => {
    const slots = freeSlots();
    const { errors, value } = validateContactRequest(req.body, { freeSlotIds: new Set(slots.map((s) => s.id)) });
    if (errors) {
      return res.status(400).json({ error: errors[0], errors });
    }
    if (contacts.hasPendingFor(value.email)) {
      return res.status(409).json({
        error: 'Ya tienes una solicitud pendiente. Alejandro te responderá por email.',
      });
    }

    const request = contacts.create(value);
    const slot = slots.find((s) => s.id === request.slotId);
    const label = slot && availabilityByDay([slot], AVAILABILITY.timeZone)[0].label;

    // La solicitud ya está guardada: si falla un email se registra, pero no se pierde.
    for (const email of contactEmails(request, slot && { ...slot, label }, config.contact)) {
      try {
        await mailer.send(email);
      } catch (error) {
        console.error(`Error al enviar el email de la solicitud ${request.id}:`, error);
      }
    }

    res.status(201).json({
      id: request.id,
      status: request.status,
      message: 'Solicitud enviada. Alejandro la revisará y te responderá por email.',
    });
  });

  const chatLimiters = [
    limiter({
      windowMs: WINDOWS.MINUTE,
      limit: limits.chatPerMinute,
      message: 'Has enviado demasiados mensajes seguidos. Espera un minuto.',
    }),
    limiter({
      windowMs: WINDOWS.DAY,
      limit: limits.chatPerDay,
      message: 'Has alcanzado el límite diario de mensajes.',
    }),
    limiter({
      windowMs: WINDOWS.DAY,
      limit: limits.globalPerDay,
      keyGenerator: () => 'global',
      message: 'El asistente ha alcanzado su capacidad diaria. Vuelve mañana.',
    }),
  ];

  const validateMessage = (req, res, next) => {
    const { message, sessionId } = req.body ?? {};

    if (sessionId !== undefined && (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId))) {
      return res.status(400).json({ error: 'El campo "sessionId" no es válido.' });
    }

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'El campo "message" debe ser un texto no vacío.' });
    }
    if (message.length > limits.maxMessageLength) {
      return res.status(400).json({
        error: `El mensaje supera el máximo de ${limits.maxMessageLength} caracteres.`,
      });
    }
    next();
  };

  // La validación va antes de los límites: un mensaje inválido no consume cupo.
  app.post('/api/chat', validateMessage, chatLimiters, async (req, res) => {
    // Una sesión desconocida o caducada se sustituye por una nueva: el id siempre lo crea el servidor.
    let { sessionId } = req.body;
    let history = sessionId && sessions.get(sessionId);
    if (!history) {
      sessionId = sessions.create();
      history = [];
    }
    const message = req.body.message.trim();

    // Solo se guarda el turno si hubo respuesta: un fallo no deja preguntas huérfanas en el historial.
    const saveTurn = (reply) =>
      sessions.save(sessionId, [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: reply },
      ]);

    const contactLang = detectContactIntent(message);
    if (contactLang) {
      const reply = CONTACT_REPLY[contactLang];
      saveTurn(reply);
      return res.json({ reply, sessionId, action: 'abrir_formulario' });
    }

    try {
      const { reply: rawReply } = await runAgent({
        llm,
        tools,
        system: systemPromptFor(now()),
        message,
        history,
        maxTokens: limits.maxTokens,
        forcedFirstCall: hasCvTool ? forcedCvSearch : undefined,
      });

      const reply = rawReply || EMPTY_REPLY;
      saveTurn(reply);
      res.json({ reply, sessionId });
    } catch (error) {
      console.error('Error en la llamada al modelo:', error);
      if (UPSTREAM_BUSY.has(error.status)) {
        return res.status(503).json({ error: 'El asistente está saturado. Inténtalo en unos segundos.' });
      }
      res.status(500).json({ error: 'No se pudo generar una respuesta.' });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON mal formado.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'La petición es demasiado grande.' });
    }
    console.error('Error no controlado:', err);
    res.status(500).json({ error: 'Error interno.' });
  });

  return app;
}
