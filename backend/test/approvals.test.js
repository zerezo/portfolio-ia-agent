import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createReviewTokens, randomSecret } from '../approvals.js';

describe('createReviewTokens', () => {
  let t = 1_000_000;
  const tokens = createReviewTokens({ secret: 'secreto', now: () => t, ttlMs: 1000 });

  test('un token es válido solo para su solicitud', () => {
    const token = tokens.create('a');
    assert.ok(tokens.verify('a', token));
    assert.ok(!tokens.verify('b', token));
  });

  test('caduca pasado el ttl', () => {
    const token = tokens.create('a');
    t += 1001;
    assert.ok(!tokens.verify('a', token));
  });

  test('no se puede alargar la caducidad: la firma la cubre', () => {
    const [, signature] = tokens.create('a').split('.');
    assert.ok(!tokens.verify('a', `${t + 10_000_000}.${signature}`));
  });

  test('otro secreto no sirve', () => {
    const other = createReviewTokens({ secret: 'otro', now: () => t, ttlMs: 1000 });
    assert.ok(!tokens.verify('a', other.create('a')));
  });

  test('rechaza tokens mal formados sin lanzar errores', () => {
    for (const token of [undefined, null, 42, '', 'abc', '123', '123.', 'x.y', '1.2.3']) {
      assert.equal(tokens.verify('a', token), false, String(token));
    }
  });

  test('randomSecret genera 64 caracteres hexadecimales distintos cada vez', () => {
    assert.match(randomSecret(), /^[0-9a-f]{64}$/);
    assert.notEqual(randomSecret(), randomSecret());
  });
});
