import 'dotenv/config';
import { createApp } from './app.js';
import { createReviewTokens, randomSecret } from './approvals.js';
import { loadConfig } from './config.js';
import { createMemoryContactStore, createPgContactStore } from './contacts.js';
import { createPool, migrate } from './db.js';
import { createMailer } from './mailer.js';
import { createLlm } from './llm.js';
import { createMemorySessionStore, createPgSessionStore } from './sessions.js';
import { createCvTool, loadCv } from './tools.js';

// Cada cuánto se borran las solicitudes y sesiones caducadas.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Configuración inválida: ${error.message}`);
  process.exit(1);
}

const llm = createLlm(config);
const profile = loadCv();
const tools = [createCvTool(profile)];

// Con DATABASE_URL, PostgreSQL (los datos sobreviven a reinicios y redespliegues); sin ella,
// memoria, solo para desarrollo.
let pool;
let sessions;
let contacts;
if (config.databaseUrl) {
  pool = createPool(config.databaseUrl);
  try {
    await migrate(pool);
  } catch (error) {
    console.error(`No se pudo preparar la base de datos: ${error.message}`);
    process.exit(1);
  }
  sessions = createPgSessionStore(pool);
  contacts = createPgContactStore(pool);
} else {
  console.warn('DATABASE_URL no definida: solicitudes y sesiones en memoria (se pierden al reiniciar).');
  sessions = createMemorySessionStore();
  contacts = createMemoryContactStore();
}

const purge = async () => {
  try {
    const [expiredContacts, expiredSessions] = await Promise.all([contacts.purgeExpired(), sessions.purgeExpired()]);
    if (expiredContacts || expiredSessions) {
      console.log(`[db] borradas ${expiredContacts} solicitudes y ${expiredSessions} sesiones caducadas`);
    }
  } catch (error) {
    console.error('Error al borrar datos caducados:', error);
  }
};
await purge();
setInterval(purge, PURGE_INTERVAL_MS).unref();

const mailer = createMailer(config.contact);

if (!config.contact.reviewSecret) {
  console.warn('REVIEW_SECRET no definido: se usa uno aleatorio y los enlaces de revisión caducan al reiniciar.');
}
const reviewTokens = createReviewTokens({ secret: config.contact.reviewSecret ?? randomSecret() });

const app = createApp({ llm, tools, profile, sessions, contacts, mailer, reviewTokens, config });

const server = app.listen(config.port, () => {
  console.log(
    `Servidor escuchando en el puerto ${config.port} (perfil: ${config.profileName}, modelo: ${llm.name}, ` +
      `emails: ${config.contact.transport}, datos: ${pool ? 'postgres' : 'memoria'})`,
  );
});

// Railway envía SIGTERM al redesplegar: se terminan las peticiones en curso antes de salir.
const shutdown = (signal) => {
  console.log(`${signal} recibido, cerrando servidor...`);
  server.close(async () => {
    await pool?.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10 * 1000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
