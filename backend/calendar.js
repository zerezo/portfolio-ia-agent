// Calendario propio del portfolio: calcula los huecos libres a partir del horario configurado.
// Sin APIs externas; las fechas se manejan en UTC y se muestran en la zona horaria del horario.

const MINUTE = 60 * 1000;
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Partes de fecha y hora de un instante en una zona horaria.
function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

// Instante UTC de una fecha y hora locales en timeZone (tiene en cuenta el cambio de hora).
export function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  // Dos ajustes bastan: el segundo corrige si el primero cruza un cambio de horario.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

const pad = (n) => String(n).padStart(2, '0');

// Fecha local 'YYYY-MM-DD' de un instante en timeZone.
export function localDate(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Huecos libres: [{ id: 'YYYY-MM-DDTHH:MM' (hora local), start: Date, date, time, weekday }]
export function listFreeSlots({ schedule, now = new Date(), taken = new Set() }) {
  const today = zonedParts(now, schedule.timeZone);
  const earliest = now.getTime() + schedule.minNoticeHours * 60 * MINUTE;
  const slots = [];

  for (let offset = 0; offset <= schedule.maxDaysAhead; offset++) {
    // El día de la semana de una fecha de calendario no depende de la zona horaria.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = day.getUTCDay();
    if (!schedule.weekdays.includes(weekday)) continue;

    const date = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() };
    const dateId = `${date.year}-${pad(date.month)}-${pad(date.day)}`;

    for (let m = toMinutes(schedule.start); m + schedule.slotMinutes <= toMinutes(schedule.end); m += schedule.slotMinutes) {
      const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const id = `${dateId}T${time}`;
      const start = zonedToUtc({ ...date, hour: Math.floor(m / 60), minute: m % 60 }, schedule.timeZone);
      if (start.getTime() < earliest || taken.has(id)) continue;
      slots.push({ id, start, date: dateId, time, weekday: DAY_NAMES[weekday] });
    }
  }
  return slots;
}

// Datos de un hueco a partir de su id ('YYYY-MM-DDTHH:MM', hora local de timeZone):
// { start: Date, label: 'Tuesday 20 October', time: '17:00' }. La web y los emails al
// visitante van en inglés; lo que ve Alejandro, en español (locale 'es-ES').
export function describeSlot(slotId, timeZone, locale = 'en-GB') {
  const [, year, month, day, hour, minute] = slotId.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/).map(Number);
  const start = zonedToUtc({ year, month, day, hour, minute }, timeZone);
  return { start, label: formatDay(start, timeZone, locale), time: slotId.slice(11) };
}

const formatDay = (date, timeZone, locale = 'en-GB') =>
  new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(date);

// Huecos agrupados por día para el formulario: [{ date, label, slots: [{ id, time, start }] }].
// start va en ISO (UTC) para que el frontend pueda mostrarlo también en la hora del visitante.
export function availabilityByDay(slots, timeZone) {
  const days = new Map();
  for (const slot of slots) {
    if (!days.has(slot.date)) {
      days.set(slot.date, { date: slot.date, label: formatDay(slot.start, timeZone), slots: [] });
    }
    days.get(slot.date).slots.push({ id: slot.id, time: slot.time, start: slot.start.toISOString() });
  }
  return [...days.values()];
}
