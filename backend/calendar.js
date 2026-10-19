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

// Fecha legible en español, p. ej. "lunes, 19 de octubre de 2026".
export const formatLongDate = (date, timeZone) =>
  new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    date,
  );
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

const MAX_DAYS_SHOWN = 3;

const addMinutes = (hhmm, minutes) => {
  const total = toMinutes(hhmm) + minutes;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

// Agrupa huecos consecutivos en tramos ("de 17:00 a 18:20"): respuestas más cortas y
// sin agotar el límite de tokens. Cualquier inicio de hueco dentro del tramo es válido.
export function toRanges(daySlots, slotMinutes) {
  const ranges = [];
  for (const { time } of daySlots) {
    const last = ranges.at(-1);
    if (last && last.end === time) last.end = addMinutes(time, slotMinutes);
    else ranges.push({ start: time, end: addMinutes(time, slotMinutes) });
  }
  return ranges.map((r) => `de ${r.start} a ${r.end}`).join(' y ');
}

const formatDay = (slot, timeZone) =>
  new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(slot.start);

// getTakenSlots() -> ids ocupados (solicitudes pendientes o aprobadas). TODO(reuniones): conectar.
export function createAvailabilityTool({ schedule, now = () => new Date(), getTakenSlots = () => [] }) {
  return {
    name: 'consultar_disponibilidad',
    description:
      'Consulta los huecos libres para una reunión con Alejandro (videollamada o llamada). ' +
      `Cada hueco dura ${schedule.slotMinutes} minutos, en hora de ${schedule.timeZone}. ` +
      'Úsala siempre antes de proponer horarios: no inventes huecos. ' +
      'Sin parámetros devuelve los próximos días con huecos; con "fecha" (YYYY-MM-DD) solo ese día.',
    inputSchema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Día concreto en formato YYYY-MM-DD (opcional).' },
      },
    },
    run({ fecha } = {}) {
      // Los modelos envían null o "" para decir "sin fecha".
      if (fecha === null || fecha === '') fecha = undefined;
      if (fecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return 'Error: "fecha" debe tener el formato YYYY-MM-DD.';
      }
      const current = now();
      const today = localDate(current, schedule.timeZone);
      // Los modelos no saben la fecha actual y tienden a usar años pasados.
      if (fecha !== undefined && fecha < today) {
        return `La fecha ${fecha} ya ha pasado: hoy es ${today}. Consulta sin fecha o con una fecha futura.`;
      }
      const slots = listFreeSlots({ schedule, now: current, taken: new Set(getTakenSlots()) });
      const sameDay = fecha ? slots.filter((s) => s.date === fecha) : [];

      // Si el día pedido no tiene huecos, se ofrecen directamente los siguientes: el modelo
      // no tiene que hacer otra consulta (y no suele hacerla).
      let header = 'Tramos libres (hora de Madrid):';
      let shown = sameDay;
      if (sameDay.length === 0) {
        shown = fecha ? slots.filter((s) => s.date > fecha) : slots;
        if (fecha) header = `El ${fecha} no hay huecos. Próximos tramos libres (hora de Madrid):`;
      }

      if (shown.length === 0) {
        return 'No hay huecos libres en los próximos días. Ofrece contactar por email.';
      }

      const byDay = new Map();
      for (const slot of shown) byDay.set(slot.date, [...(byDay.get(slot.date) ?? []), slot]);
      const lines = [...byDay].slice(0, MAX_DAYS_SHOWN).map(
        ([date, daySlots]) =>
          `- ${formatDay(daySlots[0], schedule.timeZone)} (${date}): ${toRanges(daySlots, schedule.slotMinutes)}`,
      );
      // La duración va aparte de los tramos: los modelos pequeños mezclan "20 minutos" con "20:00".
      return [
        header,
        ...lines,
        `Nota: cada reunión dura ${schedule.slotMinutes} min. Copia los tramos tal cual, sin cambiar las horas.`,
      ].join('\n');
    },
  };
}
