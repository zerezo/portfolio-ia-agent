import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createR2Client, signGet } from '../r2.js';

const KEYS = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secreto-de-prueba' };
const NOW = new Date('2026-10-29T10:20:30.456Z');

describe('signGet', () => {
  const signed = signGet({ host: 'cuenta.r2.cloudflarestorage.com', path: '/bucket/index.md', now: NOW, ...KEYS });

  test('firma con AWS Signature V4 para R2 (región auto, servicio s3)', () => {
    assert.equal(signed.url, 'https://cuenta.r2.cloudflarestorage.com/bucket/index.md');
    assert.equal(signed.headers['x-amz-date'], '20261029T102030Z');
    assert.match(
      signed.headers.Authorization,
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261029\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  test('la firma depende del secreto y de la ruta', () => {
    const other = (changes) => signGet({ host: 'cuenta.r2.cloudflarestorage.com', path: '/bucket/index.md', now: NOW, ...KEYS, ...changes });
    assert.equal(other({}).headers.Authorization, signed.headers.Authorization);
    assert.notEqual(other({ secretAccessKey: 'otro' }).headers.Authorization, signed.headers.Authorization);
    assert.notEqual(other({ path: '/bucket/faq.md' }).headers.Authorization, signed.headers.Authorization);
  });

  test('codifica cada segmento de la ruta', () => {
    const { url } = signGet({ host: 'h', path: "/b/a b(1).md", now: NOW, ...KEYS });
    assert.equal(url, 'https://h/b/a%20b%281%29.md');
  });
});

describe('createR2Client', () => {
  const client = (response) => {
    const calls = [];
    const fetch = async (url, options) => {
      calls.push({ url, options });
      return response;
    };
    return { calls, r2: createR2Client({ accountId: 'abc', bucket: 'conocimiento', fetch, ...KEYS }) };
  };

  test('lee un objeto del bucket con la petición firmada', async () => {
    const { calls, r2 } = client(new Response('# Index'));
    assert.equal(await r2.getText('index.md'), '# Index');
    assert.equal(calls[0].url, 'https://abc.r2.cloudflarestorage.com/conocimiento/index.md');
    assert.match(calls[0].options.headers.Authorization, /^AWS4-HMAC-SHA256 /);
  });

  test('un estado distinto de 200 es un error', async () => {
    const { r2 } = client(new Response('denied', { status: 403 }));
    await assert.rejects(r2.getText('index.md'), /R2 respondió 403/);
  });
});
