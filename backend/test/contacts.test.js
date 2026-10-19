import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryContactStore, validateContactRequest } from '../contacts.js';

const freeSlotIds = new Set(['2026-10-20T17:00', '2026-10-20T17:20']);

const valid = {
  name: 'Ana Recruiter',
  email: 'Ana@Empresa.com',
  company: 'Empresa',
  reason: 'Me gustaría hablar sobre una posición de GRC.',
  mode: 'video',
  slotId: '2026-10-20T17:00',
  consent: true,
};

const errorsOf = (body) => validateContactRequest(body, { freeSlotIds }).errors ?? [];

describe('validateContactRequest', () => {
  test('acepta una videollamada válida y normaliza el email', () => {
    const { value, errors } = validateContactRequest(valid, { freeSlotIds });
    assert.equal(errors, undefined);
    assert.equal(value.email, 'ana@empresa.com');
    assert.equal(value.slotId, '2026-10-20T17:00');
  });

  test('email: no necesita hueco y lo ignora si llega', () => {
    const { value } = validateContactRequest({ ...valid, mode: 'email', slotId: 'cualquiera' }, { freeSlotIds });
    assert.equal(value.slotId, undefined);
  });

  test('llamada: exige un teléfono válido', () => {
    assert.match(errorsOf({ ...valid, mode: 'phone' }).join(), /phone/);
    assert.match(errorsOf({ ...valid, mode: 'phone', phone: 'llámame' }).join(), /teléfono no es válido/);
    assert.deepEqual(errorsOf({ ...valid, mode: 'phone', phone: '+34 600 000 000' }), []);
  });

  test('videollamada y llamada exigen un hueco libre', () => {
    assert.match(errorsOf({ ...valid, slotId: undefined }).join(), /hueco/);
    assert.match(errorsOf({ ...valid, slotId: '2026-10-20T19:40' }).join(), /hueco/);
  });

  test('exige consentimiento explícito (true, no "true")', () => {
    assert.match(errorsOf({ ...valid, consent: 'true' }).join(), /tratamiento de tus datos/);
    assert.match(errorsOf({ ...valid, consent: undefined }).join(), /tratamiento de tus datos/);
  });

  test('rechaza modalidades desconocidas y emails inválidos', () => {
    assert.match(errorsOf({ ...valid, mode: 'fax' }).join(), /mode/);
    assert.match(errorsOf({ ...valid, email: 'no-es-email' }).join(), /email no es válido/);
  });

  test('rechaza saltos de línea en campos de una línea (inyección de cabeceras)', () => {
    assert.match(errorsOf({ ...valid, name: 'Ana\r\nBcc: victima@x.com' }).join(), /no permitidos/);
  });

  test('el motivo sí admite saltos de línea', () => {
    assert.deepEqual(errorsOf({ ...valid, reason: 'Primera línea.\nSegunda línea.' }), []);
  });

  test('comprueba longitudes y tipos', () => {
    assert.match(errorsOf({ ...valid, reason: 'corto' }).join(), /reason/);
    assert.match(errorsOf({ ...valid, name: 42 }).join(), /name/);
    assert.match(errorsOf({ ...valid, name: 'a'.repeat(101) }).join(), /name/);
  });

  test('devuelve todos los errores a la vez y tolera un cuerpo vacío', () => {
    assert.ok(errorsOf(undefined).length >= 5);
  });
});

describe('createMemoryContactStore', () => {
  test('crea solicitudes pendientes con id', () => {
    const store = createMemoryContactStore();
    const request = store.create({ email: 'a@b.com', slotId: 's1' });
    assert.equal(request.status, 'pending');
    assert.equal(store.get(request.id).email, 'a@b.com');
  });

  test('una solicitud pendiente bloquea su hueco y su email', () => {
    const store = createMemoryContactStore();
    store.create({ email: 'a@b.com', slotId: 's1' });
    store.create({ email: 'c@d.com' });
    assert.deepEqual(store.takenSlotIds(), ['s1']);
    assert.ok(store.hasPendingFor('a@b.com'));
    assert.ok(!store.hasPendingFor('x@y.com'));
  });

  test('borra las solicitudes pasado el plazo de retención', () => {
    let t = 0;
    const store = createMemoryContactStore({ now: () => t, retentionMs: 1000 });
    const { id } = store.create({ email: 'a@b.com', slotId: 's1' });
    t = 1001;
    assert.equal(store.get(id), undefined);
    assert.deepEqual(store.takenSlotIds(), []);
  });

  test('get devuelve una copia', () => {
    const store = createMemoryContactStore();
    const { id } = store.create({ email: 'a@b.com' });
    store.get(id).status = 'approved';
    assert.equal(store.get(id).status, 'pending');
  });
});
