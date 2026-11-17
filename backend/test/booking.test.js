import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createBookingTools, isBookingMessage } from '../booking.js';
import { AVAILABILITY } from '../config.js';
import { listFreeSlots } from '../calendar.js';

// Huecos reales a partir de un lunes fijo: el martes 3 y el miércoles 4 de noviembre de 2026.
const NOW = new Date('2026-11-02T08:00:00Z');
const tools = (taken = new Set()) => {
  const [availability, propose] = createBookingTools({
    freeSlots: async () => listFreeSlots({ schedule: AVAILABILITY, now: NOW, taken }),
    schedule: AVAILABILITY,
  });
  return { availability, propose };
};

describe('isBookingMessage', () => {
  test('reconoce peticiones de reunión y respuestas con fechas u horas', () => {
    for (const m of ['Can we book a call?', 'Quiero una reunión', 'el jueves a las 5', 'Tuesday at 17:20', 'mejor por videollamada', 'a las 18h']) {
      assert.ok(isBookingMessage(m), m);
    }
  });

  test('no salta con preguntas normales sin fechas', () => {
    for (const m of ['What is the capital of France?', '¿Qué certificaciones tiene?']) {
      assert.ok(!isBookingMessage(m), m);
    }
  });
});

describe('get_availability', () => {
  test('lista los días con sus horas e indica el formato del id', async () => {
    const text = await tools().availability.run({});
    assert.match(text, /date \+ "T" \+ time/);
    assert.match(text, /- Tuesday 3 November \(2026-11-03\): 17:00, 17:20, 17:40/);
    assert.doesNotMatch(text, /2026-11-02/); // hoy no: 24 h de antelación
  });

  test('filtra por día y no ofrece los huecos ocupados', async () => {
    const text = await tools(new Set(['2026-11-04T17:00'])).availability.run({ date: '2026-11-04' });
    assert.match(text, /\(2026-11-04\): 17:20/);
    assert.doesNotMatch(text, /2026-11-03/);
  });

  test('un día sin huecos lo dice', async () => {
    assert.match(await tools().availability.run({ date: '2026-11-07' }), /No free slots on 2026-11-07/);
  });
});

describe('propose_meeting', () => {
  test('con un hueco libre deja la propuesta en el contexto, no reserva nada', async () => {
    const context = {};
    const text = await tools().propose.run({ mode: 'video', slot_id: '2026-11-03T17:20', reason: 'GRC role\ninterview' }, context);
    assert.match(text, /confirmation card is now shown right below/);
    assert.deepEqual(context.proposal, {
      mode: 'video',
      slot: { id: '2026-11-03T17:20', label: 'Tuesday 3 November', time: '17:20', start: '2026-11-03T16:20:00.000Z', minutes: 20 },
      reason: 'GRC role interview',
    });
  });

  test('email no necesita hueco', async () => {
    const context = {};
    await tools().propose.run({ mode: 'email' }, context);
    assert.deepEqual(context.proposal, { mode: 'email' });
  });

  test('rechaza huecos inventados, ocupados o mal formados sin dejar propuesta', async () => {
    for (const [input, taken, error] of [
      [{ mode: 'video', slot_id: '2026-11-03T17:10' }, new Set(), /not a free slot/],
      [{ mode: 'phone', slot_id: '2026-11-03T17:20' }, new Set(['2026-11-03T17:20']), /not a free slot/],
      [{ mode: 'video', slot_id: 'next Tuesday 5pm' }, new Set(), /exact slot id/],
      [{ mode: 'video' }, new Set(), /exact slot id/],
      [{ mode: 'fax' }, new Set(), /mode must be one of/],
    ]) {
      const context = {};
      assert.match(await tools(taken).propose.run(input, context), error);
      assert.equal(context.proposal, undefined);
    }
  });
});
