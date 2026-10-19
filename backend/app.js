import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { runAgent } from './agent.js';
import { availabilityByDay, describeSlot, listFreeSlots, localDate } from './calendar.js';
import { AVAILABILITY, CONTACT_LIMITS, FLOOD_LIMIT, WINDOWS } from './config.js';
import { validateContactRequest } from './contacts.js';
import {
  approvalEmails,
  createJitsiUrl,
  escapeHtml,
  newRequestEmails,
  page,
  rejectionEmail,
  reviewPage,
} from './review.js';
import { SESSION_ID_PATTERN } from './sessions.js';

// La web está en inglés: el prompt también, para que el modelo trabaje en un solo idioma.
const SYSTEM_PROMPT = [
  'You are the assistant on the professional portfolio of Alejandro Cerezo Gilarranz, a',
  'Telecommunications Engineer working in cybersecurity (cyber risk and compliance).',
  'Rules:',
  '- Before answering anything about Alejandro, search his CV with the search_cv tool.',
  "- Answer only with facts returned by the tool. If they are not there, say you don't have that information.",
  '- Never invent dates, companies, figures or opinions, and do not add your own judgements.',
  '- Distinguish work experience from certifications and education: a certification is not experience.',
  '- If a search returns nothing, try again with different keywords before giving up.',
  "- Answer in the user's language, in the third person, in 2-4 sentences.",
  '- If the question is not about Alejandro or his professional profile, say so politely and do not answer it.',
  '- If they want to meet, call or contact him, do not suggest times or ask for details: tell them they',
  '  can request it with the contact form on this page, which shows his availability.',
].join('\n');

// Peticiones de contacto: se detectan en el código, no con el modelo. Se responde con una
// frase fija y la acción open_contact_form, sin llamar al modelo (más rápido y sin errores).
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
  return { name: 'search_cv', input: { query: previous ? `${previous} ${message}` : message } };
};

const EMPTY_REPLY = "I couldn't generate an answer. Please try rephrasing your question.";

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
  const today = new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'full' }).format(now);
  return `${SYSTEM_PROMPT}\n- Today is ${today} (${localDate(now, timeZone)}), Madrid time.`;
}

// CORS: el frontend se sirve desde otro origen (Cloudflare Pages). Solo los orígenes de la
// lista reciben las cabeceras; el resto no puede leer las respuestas desde un navegador.
// No es autenticación (la API es pública): evita que otras webs usen la API desde el navegador.
function cors(allowedOrigins) {
  return (req, res, next) => {
    const { origin } = req.headers;
    res.vary('Origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        return res
          .set({
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '600',
          })
          .sendStatus(204);
      }
    }
    next();
  };
}

// Cabeceras de las páginas de revisión: sin scripts ni incrustación en otras webs, sin caché,
// y sin Referer (el token va en la URL y no debe filtrarse a otros sitios).
function setPageHeaders(res) {
  res.set({
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

// profile: CV público (data/cv.json). contacts: almacén de solicitudes (contacts.js).
// mailer: send({ to, subject, text, attachments }) (mailer.js). reviewTokens: firma y verifica
// los enlaces de revisión (approvals.js).
export function createApp({
  llm,
  tools,
  profile,
  sessions,
  contacts,
  mailer,
  reviewTokens,
  config,
  now = () => new Date(),
}) {
  const hasCvTool = tools.some((t) => t.name === 'search_cv');
  const freeSlots = () =>
    listFreeSlots({ schedule: AVAILABILITY, now: now(), taken: new Set(contacts?.takenSlotIds() ?? []) });
  const { limits, trustProxy } = config;
  const app = express();

  // Envía varios emails; un fallo se registra pero no interrumpe el resto ni la respuesta.
  const sendAll = async (emails, requestId) => {
    for (const email of emails) {
      try {
        await mailer.send(email);
      } catch (error) {
        console.error(`Error al enviar un email de la solicitud ${requestId}:`, error);
      }
    }
  };

  app.disable('x-powered-by');
  // Railway (y después Cloudflare) actúan como proxy: sin esto todas las IPs serían la del proxy.
  app.set('trust proxy', trustProxy);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Antes de los límites: así un 429 también lleva CORS y el frontend puede mostrar el error.
  app.use('/api', cors(config.corsOrigins ?? []));
  app.use(
    limiter({
      ...FLOOD_LIMIT,
      message: 'Too many requests. Please wait a minute.',
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  // CV público para la web: la misma fuente que usa el chat.
  app.get('/api/profile', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300').json(profile);
  });

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
      message: 'You have sent too many requests. Please try again in an hour.',
    }),
    limiter({
      windowMs: WINDOWS.DAY,
      limit: CONTACT_LIMITS.globalPerDay,
      keyGenerator: () => 'global',
      message: 'The contact form has reached its daily capacity. Please come back tomorrow or reach out on LinkedIn.',
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
        error: 'You already have a pending request. Alejandro will reply by email.',
      });
    }

    const request = contacts.create(value);
    const token = reviewTokens.create(request.id);
    const reviewUrl = `${config.contact.publicUrl}/api/contact/${request.id}/review?token=${encodeURIComponent(token)}`;

    // La solicitud ya está guardada: si falla un email se registra, pero no se pierde.
    await sendAll(
      newRequestEmails(request, { schedule: AVAILABILITY, ownerEmail: config.contact.ownerEmail, reviewUrl }),
      request.id,
    );

    res.status(201).json({
      id: request.id,
      status: request.status,
      message: 'Request sent. Alejandro will review it and reply by email.',
    });
  });

  // Revisión de solicitudes desde el enlace del email. GET solo muestra la página: los
  // clientes de correo y antivirus abren los enlaces para analizarlos, y eso no debe aprobar
  // nada. El cambio de estado lo hacen los botones (POST).
  // Enlace inválido, caducado o de una solicitud inexistente dan la misma respuesta.
  const INVALID_LINK = page('Enlace no válido', '<p>El enlace no es válido o ha caducado.</p>');
  const ALREADY_REVIEWED = page('Solicitud ya revisada', '<p>Esta solicitud ya fue revisada.</p>');

  app.get('/api/contact/:id/review', (req, res) => {
    setPageHeaders(res);
    const request = contacts.get(req.params.id);
    if (!request || !reviewTokens.verify(request.id, req.query.token)) {
      return res.status(404).type('html').send(INVALID_LINK);
    }
    if (request.status !== 'pending') {
      return res.type('html').send(ALREADY_REVIEWED);
    }
    res.type('html').send(reviewPage(request, { schedule: AVAILABILITY, token: req.query.token }));
  });

  const reviewForm = express.urlencoded({ extended: false, limit: '2kb' });

  const handleDecision = (decision) => async (req, res) => {
    setPageHeaders(res);
    const pending = contacts.get(req.params.id);
    if (!pending || !reviewTokens.verify(pending.id, req.body?.token)) {
      return res.status(404).type('html').send(INVALID_LINK);
    }
    // Una cita cuya hora ya pasó no se puede aprobar (sí rechazar, para cerrar la solicitud).
    if (
      decision === 'approve' &&
      pending.slotId &&
      describeSlot(pending.slotId, AVAILABILITY.timeZone).start <= now()
    ) {
      return res
        .status(409)
        .type('html')
        .send(page('Fuera de plazo', '<p>La hora de esta cita ya ha pasado. Puedes rechazarla.</p>'));
    }

    const { ownerEmail, ownerName } = config.contact;
    const extra = decision === 'approve' && pending.mode === 'video' ? { meetingUrl: createJitsiUrl() } : {};
    // resolve solo cierra solicitudes pendientes: si dos clics llegan a la vez, gana uno.
    const request = contacts.resolve(pending.id, decision === 'approve' ? 'approved' : 'rejected', extra);
    if (!request) {
      return res.status(409).type('html').send(ALREADY_REVIEWED);
    }

    if (decision === 'approve') {
      await sendAll(approvalEmails(request, { schedule: AVAILABILITY, ownerEmail, ownerName, now: now() }), request.id);
      return res.type('html').send(
        page(
          'Solicitud aprobada',
          `<p>Se ha enviado la confirmación a ${escapeHtml(request.email)}` +
            `${request.slotId ? ', con la invitación para los dos calendarios' : ''}.</p>`,
        ),
      );
    }

    await sendAll([rejectionEmail(request, { ownerName, ownerEmail })], request.id);
    res
      .type('html')
      .send(page('Solicitud rechazada', `<p>Se ha avisado a ${escapeHtml(request.email)} y el hueco queda libre.</p>`));
  };

  app.post('/api/contact/:id/approve', reviewForm, handleDecision('approve'));
  app.post('/api/contact/:id/reject', reviewForm, handleDecision('reject'));

  const chatLimiters = [
    limiter({
      windowMs: WINDOWS.MINUTE,
      limit: limits.chatPerMinute,
      message: 'You have sent too many messages in a row. Please wait a minute.',
    }),
    limiter({
      windowMs: WINDOWS.DAY,
      limit: limits.chatPerDay,
      message: 'You have reached the daily message limit.',
    }),
    limiter({
      windowMs: WINDOWS.DAY,
      limit: limits.globalPerDay,
      keyGenerator: () => 'global',
      message: 'The assistant has reached its daily capacity. Please come back tomorrow.',
    }),
  ];

  const validateMessage = (req, res, next) => {
    const { message, sessionId } = req.body ?? {};

    if (sessionId !== undefined && (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId))) {
      return res.status(400).json({ error: 'The "sessionId" field is not valid.' });
    }

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'The "message" field must be a non-empty string.' });
    }
    if (message.length > limits.maxMessageLength) {
      return res.status(400).json({
        error: `The message exceeds the maximum of ${limits.maxMessageLength} characters.`,
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
      return res.json({ reply, sessionId, action: 'open_contact_form' });
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
        return res.status(503).json({ error: 'The assistant is busy. Please try again in a few seconds.' });
      }
      res.status(500).json({ error: 'Could not generate an answer.' });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'The request is too large.' });
    }
    console.error('Error no controlado:', err);
    res.status(500).json({ error: 'Internal error.' });
  });

  return app;
}
