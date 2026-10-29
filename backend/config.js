const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Perfiles de consumo seleccionables con LIMIT_PROFILE.
// chatPerMinute / chatPerDay: mensajes por IP. globalPerDay: mensajes entre todas las IPs.
export const LIMIT_PROFILES = {
  funcional: {
    chatPerMinute: 2,
    chatPerDay: 10,
    globalPerDay: 50,
    maxMessageLength: 500,
    maxTokens: 300,
  },
  normal: {
    chatPerMinute: 4,
    chatPerDay: 25,
    globalPerDay: 200,
    maxMessageLength: 1000,
    maxTokens: 600,
  },
  amplio: {
    chatPerMinute: 8,
    chatPerDay: 60,
    globalPerDay: 600,
    maxMessageLength: 2000,
    maxTokens: 1024,
  },
};

// Protección anti-saturación por IP, común a todos los perfiles y a todas las rutas.
export const FLOOD_LIMIT = { windowMs: MINUTE, limit: 30 };

// Formulario de contacto: cada solicitud genera emails, así que el límite es estricto.
export const CONTACT_LIMITS = { perHourPerIp: 3, globalPerDay: 20 };

// Envío de emails: file (archivos .eml, desarrollo) | gmail (API de Gmail por HTTPS).
export const MAIL_TRANSPORTS = ['file', 'gmail'];

export const WINDOWS = { MINUTE, DAY };

// Disponibilidad para reuniones (hora local de timeZone). weekdays: 1 = lunes ... 5 = viernes.
export const AVAILABILITY = {
  timeZone: 'Europe/Madrid',
  weekdays: [1, 2, 3, 4, 5],
  start: '17:00',
  end: '20:00',
  slotMinutes: 20,
  minNoticeHours: 24,
  maxDaysAhead: 14,
};

// Proveedores de modelo. ollama (local, gratuito) es el de desarrollo.
export const LLM_PROVIDERS = ['ollama', 'anthropic'];

// Origen de la base de conocimiento (knowledge.js): local (carpeta knowledge/) | r2 (Cloudflare R2).
export const KNOWLEDGE_SOURCES = ['local', 'r2'];

function loadKnowledgeConfig(env) {
  const source = env.KNOWLEDGE_SOURCE || 'local';
  if (!KNOWLEDGE_SOURCES.includes(source)) {
    throw new Error(`KNOWLEDGE_SOURCE inválido: "${source}". Valores: ${KNOWLEDGE_SOURCES.join(', ')}`);
  }
  if (source === 'local') return { source };

  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`KNOWLEDGE_SOURCE=r2 requiere: ${missing.join(', ')}`);
  }
  // El id de cuenta forma parte del host: solo hexadecimal, para no poder desviar la petición.
  if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID)) {
    throw new Error('R2_ACCOUNT_ID debe ser el id de cuenta de Cloudflare (32 caracteres hexadecimales)');
  }
  return {
    source,
    r2: {
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    },
  };
}

// Entorno desplegado (APP_ENV): local en el ordenador; development y production en Railway.
export const APP_ENVS = ['local', 'development', 'production'];

function loadLlmConfig(env) {
  const provider = env.LLM_PROVIDER || 'ollama';
  if (!LLM_PROVIDERS.includes(provider)) {
    throw new Error(`LLM_PROVIDER inválido: "${provider}". Valores: ${LLM_PROVIDERS.join(', ')}`);
  }

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY?.startsWith('sk-ant-')) {
      throw new Error('LLM_PROVIDER=anthropic requiere una ANTHROPIC_API_KEY válida (sk-ant-...)');
    }
    return {
      provider,
      anthropic: {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      },
    };
  }

  return {
    provider,
    ollama: {
      url: (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, ''),
      model: env.OLLAMA_MODEL || 'qwen2.5:7b',
    },
  };
}

export function loadConfig(env = process.env) {
  const llm = loadLlmConfig(env);
  const knowledge = loadKnowledgeConfig(env);

  const appEnv = env.APP_ENV || 'local';
  if (!APP_ENVS.includes(appEnv)) {
    throw new Error(`APP_ENV inválido: "${appEnv}". Valores: ${APP_ENVS.join(', ')}`);
  }

  const profileName = env.LIMIT_PROFILE || 'funcional';
  const limits = LIMIT_PROFILES[profileName];
  if (!limits) {
    throw new Error(
      `LIMIT_PROFILE inválido: "${profileName}". Valores: ${Object.keys(LIMIT_PROFILES).join(', ')}`,
    );
  }

  const trustProxy = Number(env.TRUST_PROXY ?? 1);
  if (!Number.isInteger(trustProxy) || trustProxy < 0) {
    throw new Error('TRUST_PROXY debe ser un entero >= 0');
  }

  // Un secreto corto se puede adivinar por fuerza bruta: mínimo 32 caracteres.
  if (env.REVIEW_SECRET && env.REVIEW_SECRET.length < 32) {
    throw new Error('REVIEW_SECRET debe tener al menos 32 caracteres');
  }

  const transport = env.MAIL_TRANSPORT || 'file';
  if (!MAIL_TRANSPORTS.includes(transport)) {
    throw new Error(`MAIL_TRANSPORT inválido: "${transport}". Valores: ${MAIL_TRANSPORTS.join(', ')}`);
  }
  if (transport === 'gmail') {
    const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'MAIL_FROM', 'OWNER_EMAIL'].filter(
      (name) => !env[name],
    );
    if (missing.length) {
      throw new Error(`MAIL_TRANSPORT=gmail requiere: ${missing.join(', ')}`);
    }
  }

  const ownerEmail = env.OWNER_EMAIL || 'owner@localhost';
  if (!/^[^\s@]+@[^\s@]+$/.test(ownerEmail)) {
    throw new Error('OWNER_EMAIL no es un email válido');
  }

  // Orígenes del frontend con acceso a la API desde el navegador (p. ej. el dominio de
  // Cloudflare Pages). Cada uno exactamente "https://host[:puerto]", sin ruta ni barra final.
  const corsOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) {
      throw new Error(`CORS_ORIGINS contiene un origen inválido: "${origin}"`);
    }
  }

  // PostgreSQL: postgres://usuario:contraseña@host:puerto/base. Opcional en desarrollo.
  const databaseUrl = env.DATABASE_URL || undefined;
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL debe empezar por postgres:// o postgresql://');
  }

  // En producción (NODE_ENV=production) los valores por defecto de desarrollo serían un fallo
  // silencioso: el servidor no arranca si falta algo crítico.
  const production = env.NODE_ENV === 'production';
  if (production) {
    const problems = [
      appEnv === 'local' && 'APP_ENV=development o production (qué entorno de Railway es)',
      !env.REVIEW_SECRET && 'REVIEW_SECRET (sin él, los enlaces de aprobación caducan en cada despliegue)',
      !databaseUrl && 'DATABASE_URL (sin ella, las solicitudes se pierden en cada despliegue)',
      !env.PUBLIC_URL?.startsWith('https://') && 'PUBLIC_URL con https:// (enlaces de los emails)',
      corsOrigins.length === 0 && 'CORS_ORIGINS (el frontend no podría llamar a la API)',
      corsOrigins.some((o) => !o.startsWith('https://')) && 'CORS_ORIGINS solo con orígenes https://',
      transport !== 'gmail' && 'MAIL_TRANSPORT=gmail (con file los emails no salen)',
      env.LOG_USER_CONTENT === 'true' && 'LOG_USER_CONTENT desactivado (no registrar mensajes de visitantes)',
    ].filter(Boolean);
    if (problems.length) {
      throw new Error(`Configuración de producción incompleta: ${problems.join('; ')}`);
    }
  }

  return {
    llm,
    // Los documentos de ejemplo (placeholder) nunca se sirven en producción.
    knowledge: { ...knowledge, allowPlaceholders: appEnv !== 'production' },
    appEnv,
    production,
    corsOrigins,
    databaseUrl,
    // Registrar las consultas que el agente hace con el mensaje del visitante: solo desarrollo.
    logUserContent: env.LOG_USER_CONTENT === 'true',
    // Solicitudes de contacto: a quién se avisan y dónde guarda los emails el mailer de archivos.
    contact: {
      ownerEmail,
      ownerName: env.OWNER_NAME || 'Alejandro',
      // Con gmail, MAIL_FROM debe ser la dirección de la cuenta que envía (Gmail la impone).
      from: env.MAIL_FROM || 'Portfolio <no-reply@localhost>',
      transport,
      outboxDir: env.OUTBOX_DIR || 'outbox',
      gmail: {
        clientId: env.GMAIL_CLIENT_ID,
        clientSecret: env.GMAIL_CLIENT_SECRET,
        refreshToken: env.GMAIL_REFRESH_TOKEN,
      },
      // URL pública del backend, para los enlaces de revisión de los emails.
      publicUrl: (env.PUBLIC_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/+$/, ''),
      // Secreto para firmar esos enlaces. Opcional en desarrollo (ver index.js).
      reviewSecret: env.REVIEW_SECRET || undefined,
    },
    port: Number(env.PORT) || 3000,
    profileName,
    limits,
    trustProxy,
  };
}
