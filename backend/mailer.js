import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Interfaz común de envío: send({ to, subject, text }).
// En local se usa el mailer de archivos: cada email es un .eml que se abre con cualquier
// cliente de correo. TODO(smtp): mailer real con la misma interfaz.

// Asunto con caracteres no ASCII codificado según RFC 2047.
const encodeHeader = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

export function toEml({ from, to, subject, text, date = new Date() }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    '',
  ].join('\r\n');
}

export function createFileMailer({ dir, from, now = () => new Date() }) {
  let counter = 0;
  return {
    async send({ to, subject, text }) {
      mkdirSync(dir, { recursive: true });
      const date = now();
      const file = join(dir, `${date.toISOString().replace(/[:.]/g, '-')}-${++counter}.eml`);
      writeFileSync(file, toEml({ from, to, subject, text, date }));
      console.log(`[mailer] email para ${to} guardado en ${file}`);
    },
  };
}
