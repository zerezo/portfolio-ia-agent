import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileMailer, createGmailMailer, toEml } from '../mailer.js';

const decodeBody = (eml) => Buffer.from(eml.split('\r\n\r\n')[1].trim(), 'base64').toString('utf8');

describe('toEml', () => {
  const eml = toEml({ from: 'a@x.com', to: 'b@y.com', subject: 'Reunión', text: 'Hola, ¿qué tal?' });

  test('codifica el asunto con acentos (RFC 2047) y el cuerpo en base64 UTF-8', () => {
    assert.match(eml, /^Subject: =\?UTF-8\?B\?.+\?=$/m);
    assert.equal(decodeBody(eml), 'Hola, ¿qué tal?');
  });

  test('incluye remitente, destinatario y tipo de contenido', () => {
    assert.match(eml, /^From: a@x\.com$/m);
    assert.match(eml, /^To: b@y\.com$/m);
    assert.match(eml, /charset=utf-8/);
  });
});

describe('toEml con adjuntos', () => {
  const eml = toEml({
    from: 'a@x.com',
    to: 'b@y.com',
    subject: 'Invitación',
    text: 'Te adjunto la invitación.',
    attachments: [{ filename: 'invitacion.ics', contentType: 'text/calendar; method=REQUEST; charset=utf-8', content: 'BEGIN:VCALENDAR' }],
  });

  test('usa multipart/mixed con el texto y el adjunto', () => {
    const boundary = eml.match(/boundary="([^"]+)"/)[1];
    assert.equal(eml.split(`--${boundary}\r\n`).length, 3);
    assert.ok(eml.includes(`--${boundary}--`));
    assert.match(eml, /Content-Type: text\/calendar; method=REQUEST; charset=utf-8; name="invitacion\.ics"/);
    assert.match(eml, /Content-Disposition: attachment; filename="invitacion\.ics"/);
  });

  test('el adjunto va en base64', () => {
    assert.ok(eml.includes(Buffer.from('BEGIN:VCALENDAR').toString('base64')));
  });

  test('la invitación también va en multipart/alternative (botones de aceptar en Gmail/Outlook)', () => {
    assert.match(eml, /Content-Type: multipart\/alternative; boundary=/);
    // Una parte de calendario sin nombre de archivo (la del cuerpo) y otra como adjunto.
    assert.match(eml, /Content-Type: text\/calendar; method=REQUEST; charset=utf-8\r\n/);
  });
});

describe('toEml con Reply-To', () => {
  test('incluye Reply-To solo si se indica', () => {
    assert.match(toEml({ from: 'a@x.com', to: 'b@y.com', subject: 's', text: 't', replyTo: 'c@z.com' }), /^Reply-To: c@z\.com$/m);
    assert.doesNotMatch(toEml({ from: 'a@x.com', to: 'b@y.com', subject: 's', text: 't' }), /Reply-To/);
  });
});

describe('createGmailMailer', () => {
  // fetch falso: responde al endpoint de tokens y al de envío, y registra las peticiones.
  function fakeGoogle({ tokenStatus = 200, sendStatus = 200 } = {}) {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('oauth2')) {
        return Response.json(
          tokenStatus === 200 ? { access_token: `tok${calls.length}`, expires_in: 3600 } : { error: 'invalid_grant' },
          { status: tokenStatus },
        );
      }
      return new Response(sendStatus === 200 ? '{}' : 'error', { status: sendStatus });
    };
    return { calls, fetchFn };
  }

  const options = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', from: 'Portfolio <p@gmail.com>' };

  test('renueva el token y envía el mensaje en base64url', async () => {
    const google = fakeGoogle();
    const mailer = createGmailMailer({ ...options, fetchFn: google.fetchFn });
    await mailer.send({ to: 'a@b.com', subject: 'Hola', text: 'Cuerpo' });

    const [tokenCall, sendCall] = google.calls;
    assert.equal(new URLSearchParams(tokenCall.init.body).get('grant_type'), 'refresh_token');
    assert.equal(new URLSearchParams(tokenCall.init.body).get('refresh_token'), 'refresh');
    assert.match(sendCall.url, /gmail\/v1\/users\/me\/messages\/send$/);
    assert.equal(sendCall.init.headers.Authorization, 'Bearer tok1');

    const raw = Buffer.from(JSON.parse(sendCall.init.body).raw, 'base64url').toString('utf8');
    assert.match(raw, /^From: Portfolio <p@gmail\.com>$/m);
    assert.match(raw, /^To: a@b\.com$/m);
  });

  test('reutiliza el token mientras no caduca y lo renueva después', async () => {
    let t = 0;
    const google = fakeGoogle();
    const mailer = createGmailMailer({ ...options, fetchFn: google.fetchFn, now: () => t });
    await mailer.send({ to: 'a@b.com', subject: 's', text: 't' });
    await mailer.send({ to: 'a@b.com', subject: 's', text: 't' });
    assert.equal(google.calls.filter((c) => c.url.includes('oauth2')).length, 1);

    t = 3600 * 1000; // pasada una hora
    await mailer.send({ to: 'a@b.com', subject: 's', text: 't' });
    assert.equal(google.calls.filter((c) => c.url.includes('oauth2')).length, 2);
  });

  test('si el refresh token no vale, el error lo explica', async () => {
    const google = fakeGoogle({ tokenStatus: 400 });
    const mailer = createGmailMailer({ ...options, fetchFn: google.fetchFn });
    await assert.rejects(mailer.send({ to: 'a@b.com', subject: 's', text: 't' }), /invalid_grant/);
  });

  test('si Gmail rechaza el envío, lanza un error con el estado', async () => {
    const google = fakeGoogle({ sendStatus: 403 });
    const mailer = createGmailMailer({ ...options, fetchFn: google.fetchFn });
    await assert.rejects(mailer.send({ to: 'a@b.com', subject: 's', text: 't' }), { status: 403 });
  });
});

describe('createFileMailer', () => {
  test('guarda cada email como un archivo .eml', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
    try {
      const mailer = createFileMailer({ dir, from: 'p@x.com' });
      await mailer.send({ to: 'a@b.com', subject: 's1', text: 'uno' });
      await mailer.send({ to: 'a@b.com', subject: 's2', text: 'dos' });
      const files = readdirSync(dir);
      assert.equal(files.length, 2);
      assert.ok(files.every((f) => f.endsWith('.eml')));
      assert.equal(decodeBody(readFileSync(join(dir, files[0]), 'utf8')), 'uno');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
