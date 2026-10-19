import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityByDay, listFreeSlots, zonedToUtc } from '../calendar.js';
import { AVAILABILITY } from '../config.js';

const TZ = 'Europe/Madrid';
// Lunes 19-10-2026 a las 10:00 en Madrid (UTC+2, horario de verano).
const MONDAY_10H = new Date('2026-10-19T08:00:00Z');

describe('zonedToUtc', () => {
  test('horario de verano: Madrid es UTC+2', () => {
    const d = zonedToUtc({ year: 2026, month: 10, day: 20, hour: 17, minute: 0 }, TZ);
    assert.equal(d.toISOString(), '2026-10-20T15:00:00.000Z');
  });

  test('horario de invierno: Madrid es UTC+1 (tras el 25-10-2026)', () => {
    const d = zonedToUtc({ year: 2026, month: 10, day: 26, hour: 17, minute: 0 }, TZ);
    assert.equal(d.toISOString(), '2026-10-26T16:00:00.000Z');
  });
});

describe('listFreeSlots', () => {
  const slots = listFreeSlots({ schedule: AVAILABILITY, now: MONDAY_10H });

  test('9 huecos de 20 min entre 17:00 y 20:00', () => {
    const tuesday = slots.filter((s) => s.date === '2026-10-20').map((s) => s.time);
    assert.deepEqual(tuesday, ['17:00', '17:20', '17:40', '18:00', '18:20', '18:40', '19:00', '19:20', '19:40']);
  });

  test('respeta la antelación mínima de 24 h: hoy no hay huecos', () => {
    assert.ok(!slots.some((s) => s.date === '2026-10-19'));
  });

  test('solo de lunes a viernes', () => {
    assert.ok(slots.every((s) => !['sábado', 'domingo'].includes(s.weekday)));
    assert.ok(!slots.some((s) => s.date === '2026-10-24' || s.date === '2026-10-25'));
  });

  test('no pasa de maxDaysAhead (14 días)', () => {
    assert.equal(slots.at(-1).date, '2026-11-02');
  });

  test('a menos de 24 h exactas, el hueco de mañana se descarta', () => {
    // Lunes a las 17:10: el martes 17:00 está a menos de 24 h; el de 17:20 no.
    const now = new Date('2026-10-19T15:10:00Z');
    const first = listFreeSlots({ schedule: AVAILABILITY, now })[0];
    assert.equal(first.id, '2026-10-20T17:20');
  });

  test('excluye los huecos ocupados', () => {
    const taken = new Set(['2026-10-20T17:00']);
    const free = listFreeSlots({ schedule: AVAILABILITY, now: MONDAY_10H, taken });
    assert.equal(free[0].id, '2026-10-20T17:20');
  });

  test('cada hueco lleva su instante UTC correcto', () => {
    assert.equal(slots[0].start.toISOString(), '2026-10-20T15:00:00.000Z');
  });
});

describe('availabilityByDay', () => {
  const days = availabilityByDay(listFreeSlots({ schedule: AVAILABILITY, now: MONDAY_10H }), TZ);

  test('agrupa por día con etiqueta legible y huecos con id, hora e instante UTC', () => {
    assert.equal(days[0].date, '2026-10-20');
    assert.equal(days[0].label, 'Tuesday 20 October');
    assert.deepEqual(days[0].slots[0], { id: '2026-10-20T17:00', time: '17:00', start: '2026-10-20T15:00:00.000Z' });
    assert.equal(days[0].slots.length, 9);
  });

  test('10 días laborables en los próximos 14 días', () => {
    assert.equal(days.length, 10);
  });
});
