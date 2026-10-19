import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { FLOOD_LIMIT, WINDOWS } from './config.js';

const SYSTEM_PROMPT =
  'Eres el asistente de un portfolio profesional. Respondes preguntas sobre la ' +
  'trayectoria de un ingeniero de Telecomunicaciones con experiencia en ciberseguridad. ' +
  'Si no dispones de un dato, lo indicas en lugar de inventarlo.';

// TODO(tools): definir aquí el Tool Calling (consulta RAG del CV, agendar reuniones).
// TODO(sesión): persistir el historial de conversación en PostgreSQL.

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

export function createApp({ llm, config }) {
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
    const { message } = req.body ?? {};

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
    try {
      const reply = await llm.complete({
        system: SYSTEM_PROMPT,
        message: req.body.message.trim(),
        maxTokens: limits.maxTokens,
      });

      res.json({ reply });
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
