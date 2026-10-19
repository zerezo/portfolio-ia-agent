import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Interfaz común de envío: send({ to, subject, text, attachments? }).
// attachments: [{ filename, contentType, content }] (content es texto).
// En local se usa el mailer de archivos: cada email es un .eml que se abre con cualquier
// cliente de correo. TODO(smtp): mailer real con la misma interfaz.

// Asunto con caracteres no ASCII codificado según RFC 2047.
const encodeHeader = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

// Base64 en líneas de 76 caracteres, como exige MIME.
const base64 = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

export function toEml({ from, to, subject, text, attachments = [], date = new Date() }) {
  const headers = [`From: ${from}`, `To: ${to}`, `Subject: ${encodeHeader(subject)}`, `Date: ${date.toUTCString()}`, 'MIME-Version: 1.0'];
  const textPart = ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', base64(text)];

  if (attachments.length === 0) {
    return [...headers, ...textPart, ''].join('\r\n');
  }

  // Con adjuntos: multipart/mixed con el texto y cada adjunto como parte separada.
  const boundary = `=_${randomBytes(12).toString('hex')}`;
  const parts = [
    textPart,
    ...attachments.map((a) => [
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64(a.content),
    ]),
  ];
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...parts.flatMap((part) => [`--${boundary}`, ...part]),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function createFileMailer({ dir, from, now = () => new Date() }) {
  let counter = 0;
  return {
    async send({ to, subject, text, attachments }) {
      mkdirSync(dir, { recursive: true });
      const date = now();
      const file = join(dir, `${date.toISOString().replace(/[:.]/g, '-')}-${++counter}.eml`);
      writeFileSync(file, toEml({ from, to, subject, text, attachments, date }));
      console.log(`[mailer] email para ${to} guardado en ${file}`);
    },
  };
}
