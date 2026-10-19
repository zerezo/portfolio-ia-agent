import 'dotenv/config';
import { createApp } from './app.js';
import { createReviewTokens, randomSecret } from './approvals.js';
import { loadConfig } from './config.js';
import { createMemoryContactStore } from './contacts.js';
import { createMailer } from './mailer.js';
import { createLlm } from './llm.js';
import { createMemorySessionStore } from './sessions.js';
import { createCvTool, loadCv } from './tools.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Configuración inválida: ${error.message}`);
  process.exit(1);
}

const llm = createLlm(config);
const tools = [createCvTool(loadCv())];

const sessions = createMemorySessionStore();
const contacts = createMemoryContactStore();
const mailer = createMailer(config.contact);

if (!config.contact.reviewSecret) {
  console.warn('REVIEW_SECRET no definido: se usa uno aleatorio y los enlaces de revisión caducan al reiniciar.');
}
const reviewTokens = createReviewTokens({ secret: config.contact.reviewSecret ?? randomSecret() });

const app = createApp({ llm, tools, sessions, contacts, mailer, reviewTokens, config });

const server = app.listen(config.port, () => {
  console.log(
    `Servidor escuchando en el puerto ${config.port} (perfil: ${config.profileName}, modelo: ${llm.name}, ` +
      `emails: ${config.contact.transport})`,
  );
});

// Railway envía SIGTERM al redesplegar: se terminan las peticiones en curso antes de salir.
const shutdown = (signal) => {
  console.log(`${signal} recibido, cerrando servidor...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10 * 1000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
