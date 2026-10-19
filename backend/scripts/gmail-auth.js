// Obtiene el refresh token de Gmail (permiso gmail.send) y lo guarda en backend/.env.
// Uso: npm run gmail:auth (con GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET ya en .env).
// Flujo OAuth para apps de escritorio: redirección a 127.0.0.1, con PKCE y state.
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const ENV_PATH = new URL('../.env', import.meta.url);
const TIMEOUT_MS = 5 * 60 * 1000;

const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error('Faltan GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en backend/.env.');
  process.exit(1);
}

// PKCE: aunque alguien intercepte el código, no puede canjearlo sin el verificador.
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
// state: la respuesta tiene que corresponder a esta petición (evita CSRF).
const state = randomBytes(16).toString('hex');

// Sustituye o añade una variable en .env sin tocar el resto del archivo.
function saveToEnv(name, value) {
  const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const updated = pattern.test(content) ? content.replace(pattern, line) : `${content.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(ENV_PATH, updated);
}

const finish = (server, code) => {
  server.close();
  process.exit(code);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  const reply = (message) => res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);

  if (url.searchParams.get('state') !== state) {
    reply('La respuesta no corresponde a esta petición. Vuelve a ejecutar el script.');
    return finish(server, 1);
  }
  if (url.searchParams.get('error')) {
    reply(`Autorización cancelada: ${url.searchParams.get('error')}`);
    console.error(`Autorización cancelada: ${url.searchParams.get('error')}`);
    return finish(server, 1);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: url.searchParams.get('code'),
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const data = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || !data.refresh_token) {
    reply('No se pudo obtener el token. Revisa la consola.');
    console.error('Error al canjear el código:', data.error ?? tokenRes.status, data.error_description ?? '');
    return finish(server, 1);
  }
  if (!data.scope?.split(' ').includes(SCOPE)) {
    reply('No se concedió el permiso de envío. Vuelve a ejecutar el script y acéptalo.');
    console.error('El permiso gmail.send no se concedió.');
    return finish(server, 1);
  }

  saveToEnv('GMAIL_REFRESH_TOKEN', data.refresh_token);
  reply('Listo. Ya puedes cerrar esta pestaña y volver al terminal.');
  console.log('\nGMAIL_REFRESH_TOKEN guardado en backend/.env (no se muestra por seguridad).');
  console.log('Siguiente paso: MAIL_TRANSPORT=gmail en .env y reinicia el servidor.');
  finish(server, 0);
});

let redirectUri;
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent: Google devuelve un refresh token (si no, solo da uno la primera vez).
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  console.log('1. Abre este enlace en el navegador e inicia sesión con la cuenta de Gmail del proyecto:\n');
  console.log(`   ${authUrl}\n`);
  console.log('2. Si aparece "Google no ha verificado esta app": Configuración avanzada → Ir a Portfolio IA Agent.');
  console.log('3. Acepta el permiso de enviar emails. El script guardará el token en .env.\n');
  console.log('Esperando la autorización (5 minutos como máximo)...');
});

setTimeout(() => {
  console.error('Tiempo agotado. Vuelve a ejecutar npm run gmail:auth.');
  finish(server, 1);
}, TIMEOUT_MS).unref();
