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

export const WINDOWS = { MINUTE, DAY };

export function loadConfig(env = process.env) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY');
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

  return {
    apiKey: env.ANTHROPIC_API_KEY,
    port: Number(env.PORT) || 3000,
    profileName,
    limits,
    trustProxy,
  };
}
