import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAvailabilityTool, listFreeSlots, zonedToUtc } from '../calendar.js';
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

describe('consultar_disponibilidad', () => {
  const tool = createAvailabilityTool({ schedule: AVAILABILITY, now: () => MONDAY_10H });

  test('sin fecha muestra como máximo 3 días, en tramos y con hora de Madrid', () => {
    const out = tool.run({});
    assert.match(out, /hora de Madrid/);
    assert.match(out, /dura 20 min/);
    const days = out.split('\n').filter((l) => l.startsWith('- '));
    assert.equal(days.length, 3);
    assert.equal(days[0], '- martes, 20 de octubre (2026-10-20): de 17:00 a 20:00');
  });

  test('con fecha muestra solo ese día', () => {
    const out = tool.run({ fecha: '2026-10-22' });
    assert.match(out, /jueves, 22 de octubre/);
    assert.doesNotMatch(out, /2026-10-20/);
  });

  test('un hueco ocupado parte el tramo en dos', () => {
    const busy = createAvailabilityTool({
      schedule: AVAILABILITY,
      now: () => MONDAY_10H,
      getTakenSlots: () => ['2026-10-20T18:00'],
    });
    assert.match(busy.run({ fecha: '2026-10-20' }), /de 17:00 a 18:00 y de 18:20 a 20:00/);
  });

  test('un día sin huecos ofrece directamente los siguientes', () => {
    const out = tool.run({ fecha: '2026-10-24' }); // sábado
    assert.match(out, /^El 2026-10-24 no hay huecos\. Próximos tramos/);
    assert.match(out, /lunes, 26 de octubre/);
  });

  test('hoy (sin huecos por la antelación) ofrece los próximos días', () => {
    assert.match(tool.run({ fecha: '2026-10-19' }), /martes, 20 de octubre/);
  });

  test('fecha null o vacía equivale a no indicar fecha', () => {
    for (const fecha of [null, '']) {
      assert.match(tool.run({ fecha }), /^Tramos libres/, String(fecha));
    }
  });

  test('una fecha pasada se rechaza indicando la fecha de hoy', () => {
    assert.match(tool.run({ fecha: '2023-10-22' }), /ya ha pasado: hoy es 2026-10-19/);
  });

  test('rechaza una fecha mal formada', () => {
    assert.match(tool.run({ fecha: 'mañana' }), /^Error/);
  });

  test('con todo ocupado, propone el email', () => {
    const all = listFreeSlots({ schedule: AVAILABILITY, now: MONDAY_10H }).map((s) => s.id);
    const full = createAvailabilityTool({ schedule: AVAILABILITY, now: () => MONDAY_10H, getTakenSlots: () => all });
    assert.match(full.run({}), /email/);
  });
});
