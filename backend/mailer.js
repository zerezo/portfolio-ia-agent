import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Interfaz común de envío: send({ to, subject, text, replyTo?, attachments? }).
// attachments: [{ filename, contentType, content }] (content es texto).
// Transportes:
//   - file: cada email es un .eml en una carpeta (desarrollo, sin red).
//   - gmail: API de Gmail por HTTPS. Railway bloquea el SMTP saliente en los planes
//     Free/Hobby, así que en producción no se puede usar SMTP.

// Cabecera con caracteres no ASCII codificada según RFC 2047.
const encodeHeader = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

// Base64 en líneas de 76 caracteres, como exige MIME.
const base64 = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

const boundary = () => `=_${randomBytes(12).toString('hex')}`;

const textPart = (text) => ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', base64(text)];

const multipart = (type, parts) => {
  const b = boundary();
  return [
    `Content-Type: multipart/${type}; boundary="${b}"`,
    '',
    ...parts.flatMap((part) => [`--${b}`, ...part]),
    `--${b}--`,
  ];
};

const isCalendar = (attachment) => attachment.contentType.startsWith('text/calendar');

// Construye el mensaje MIME completo.
// Una invitación de calendario va dos veces: dentro de multipart/alternative (así Gmail y
// Outlook muestran los botones de aceptar/rechazar) y como adjunto .ics (para el resto).
export function toEml({ from, to, subject, text, replyTo, attachments = [], date = new Date() }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
  ];

  const calendar = attachments.find(isCalendar);
  const body = calendar
    ? multipart('alternative', [
        textPart(text),
        [`Content-Type: ${calendar.contentType}`, 'Content-Transfer-Encoding: base64', '', base64(calendar.content)],
      ])
    : textPart(text);

  if (attachments.length === 0) {
    return [...headers, ...body, ''].join('\r\n');
  }

  const files = attachments.map((a) => [
    `Content-Type: ${a.contentType}; name="${a.filename}"`,
    `Content-Disposition: attachment; filename="${a.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64(a.content),
  ]);
  return [...headers, ...multipart('mixed', [body, ...files]), ''].join('\r\n');
}

export function createFileMailer({ dir, from, now = () => new Date() }) {
  let counter = 0;
  return {
    async send(email) {
      mkdirSync(dir, { recursive: true });
      const date = now();
      const file = join(dir, `${date.toISOString().replace(/[:.]/g, '-')}-${++counter}.eml`);
      writeFileSync(file, toEml({ ...email, from, date }));
      console.log(`[mailer] email para ${email.to} guardado en ${file}`);
    },
  };
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// API de Gmail con OAuth (permiso gmail.send: solo enviar, no leer el correo).
// El token de acceso dura ~1 h: se pide con el refresh token y se reutiliza hasta que caduca.
export function createGmailMailer({ clientId, clientSecret, refreshToken, from, fetchFn = fetch, now = Date.now }) {
  let accessToken;
  let expiresAt = 0;

  async function getAccessToken() {
    // Margen de 60 s para no usar un token a punto de caducar.
    if (accessToken && now() < expiresAt - 60 * 1000) return accessToken;

    const res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15 * 1000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // invalid_grant: token revocado o caducado (p. ej. app en modo "Prueba"). Hay que
      // volver a ejecutar npm run gmail:auth.
      throw Object.assign(new Error(`Gmail: no se pudo renovar el token (${data.error ?? res.status})`), {
        status: res.status,
      });
    }
    accessToken = data.access_token;
    expiresAt = now() + data.expires_in * 1000;
    return accessToken;
  }

  return {
    async send(email) {
      const raw = Buffer.from(toEml({ ...email, from })).toString('base64url');
      const res = await fetchFn(SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(15 * 1000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw Object.assign(new Error(`Gmail: envío fallido (${res.status}) ${detail.slice(0, 200)}`), {
          status: res.status,
        });
      }
      console.log(`[mailer] email para ${email.to} enviado con Gmail`);
    },
  };
}

export function createMailer(contact) {
  if (contact.transport === 'gmail') return createGmailMailer({ ...contact.gmail, from: contact.from });
  return createFileMailer({ dir: contact.outboxDir, from: contact.from });
}
