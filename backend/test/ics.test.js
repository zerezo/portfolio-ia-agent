import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createInvite } from '../ics.js';

const base = {
  uid: 'u1@test',
  start: new Date('2026-10-20T15:00:00Z'),
  minutes: 20,
  summary: 'Videollamada',
  description: 'Hola',
  organizer: { name: 'Alejandro', email: 'a@x.com' },
  attendees: [{ name: 'Ana', email: 'b@y.com' }],
  now: new Date('2026-10-19T08:00:00Z'),
};

// Despliega las líneas plegadas (CRLF + espacio) para poder buscar en el contenido.
const unfold = (ics) => ics.replace(/\r\n /g, '');

describe('createInvite', () => {
  test('es una invitación (METHOD:REQUEST) con inicio y fin en UTC', () => {
    const ics = createInvite(base);
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /\r\nMETHOD:REQUEST\r\n/);
    assert.match(ics, /\r\nDTSTART:20261020T150000Z\r\n/);
    assert.match(ics, /\r\nDTEND:20261020T152000Z\r\n/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
  });

  test('incluye organizador y asistentes con RSVP', () => {
    const ics = unfold(createInvite(base));
    assert.match(ics, /ORGANIZER;CN=Alejandro:mailto:a@x\.com/);
    assert.match(ics, /ATTENDEE;CN=Ana;.*RSVP=TRUE:mailto:b@y\.com/);
  });

  test('escapa comas, punto y coma y saltos de línea', () => {
    const ics = unfold(createInvite({ ...base, summary: 'a, b; c', description: 'uno\ndos' }));
    assert.match(ics, /SUMMARY:a\\, b\\; c/);
    assert.match(ics, /DESCRIPTION:uno\\ndos/);
  });

  test('pliega las líneas de más de 75 octetos sin partir caracteres', () => {
    const ics = createInvite({ ...base, description: 'á'.repeat(100) });
    for (const line of ics.split('\r\n')) {
      assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
    }
    assert.ok(unfold(ics).includes(`DESCRIPTION:${'á'.repeat(100)}`));
  });

  test('LOCATION es opcional', () => {
    assert.doesNotMatch(createInvite(base), /LOCATION/);
    assert.match(createInvite({ ...base, location: 'https://meet.jit.si/x' }), /LOCATION:https:\/\/meet\.jit\.si\/x/);
  });
});
