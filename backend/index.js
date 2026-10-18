import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Configuración inválida: ${error.message}`);
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: config.apiKey,
  timeout: 30 * 1000,
  maxRetries: 2,
});

const app = createApp({ anthropic, config });

const server = app.listen(config.port, () => {
  console.log(`Servidor escuchando en el puerto ${config.port} (perfil: ${config.profileName})`);
});

// Railway envía SIGTERM al redesplegar: se terminan las peticiones en curso antes de salir.
const shutdown = (signal) => {
  console.log(`${signal} recibido, cerrando servidor...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10 * 1000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
