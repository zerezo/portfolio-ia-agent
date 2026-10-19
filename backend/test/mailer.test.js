import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileMailer, toEml } from '../mailer.js';

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
