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
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
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

  return {
    llm,
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
