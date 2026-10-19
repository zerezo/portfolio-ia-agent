import { useEffect, useMemo, useState } from 'react';
import { formatTime } from '../format.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = 5; // lunes a viernes, como la disponibilidad

// Las fechas 'YYYY-MM-DD' se tratan en UTC: son fechas de calendario, sin hora.
const toUtc = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toDateString = (ms) => new Date(ms).toISOString().slice(0, 10);
const shortDay = (ms) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms);
const shortDate = (ms) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(ms);

// Agrupa los días con huecos en semanas de lunes a viernes, como un calendario: los días sin
// huecos aparecen desactivados en su sitio, en vez de desaparecer.
function groupIntoWeeks(days) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks = new Map();
  for (const day of days) {
    const ms = toUtc(day.date);
    const monday = ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
    if (!weeks.has(monday)) {
      weeks.set(
        monday,
        Array.from({ length: WEEKDAYS }, (_, i) => {
          const date = toDateString(monday + i * DAY_MS);
          return { date, short: shortDay(monday + i * DAY_MS), day: byDate.get(date) };
        }),
      );
    }
  }
  return [...weeks.entries()].map(([monday, weekDays]) => ({
    label: `${shortDate(monday)} – ${shortDate(monday + (WEEKDAYS - 1) * DAY_MS)}`,
    days: weekDays,
  }));
}

// Horas agrupadas por hora en punto: una fila por hora ("17:00 17:20 17:40").
function groupByHour(slots) {
  const rows = new Map();
  for (const slot of slots) {
    const hour = slot.time.slice(0, 2);
    rows.set(hour, [...(rows.get(hour) ?? []), slot]);
  }
  return [...rows.values()];
}

export default function SlotPicker({ availability, slotId, onSelect, visitorZone }) {
  const weeks = useMemo(() => groupIntoWeeks(availability.days), [availability]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [date, setDate] = useState(null);

  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  const firstAvailable = (w) => w?.days.find((d) => d.day)?.date ?? null;

  // Al cambiar de semana o recargar la disponibilidad, si el día elegido ya no está en la
  // semana visible (o se quedó sin huecos), se elige el primer día disponible de esa semana.
  useEffect(() => {
    if (!week?.days.some((d) => d.date === date && d.day)) setDate(firstAvailable(week));
  }, [week, date]);

  const selectedDay = week?.days.find((d) => d.date === date)?.day;
  const selectedSlot = selectedDay?.slots.find((s) => s.id === slotId);
  const showLocalTime = visitorZone && visitorZone !== availability.timeZone;

  if (!week) {
    return <p className="muted">There are no free slots in the next two weeks. Please choose the email option.</p>;
  }

  const goToWeek = (index) => {
    setWeekIndex(index);
    onSelect(null);
  };

  return (
    <div className="picker">
      <div className="picker-head">
        <span className="picker-step">1. Pick a day</span>
        <div className="week-nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => goToWeek(weekIndex - 1)}
            disabled={weekIndex === 0}
            aria-label="Previous week"
          >
            ‹
          </button>
          <span className="week-label" aria-live="polite">
            {week.label}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => goToWeek(weekIndex + 1)}
            disabled={weekIndex >= weeks.length - 1}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="week-days" role="group" aria-label="Day">
        {week.days.map((d) => (
          <button
            key={d.date}
            type="button"
            className={`day ${d.date === date ? 'day-selected' : ''}`}
            aria-pressed={d.date === date}
            disabled={!d.day}
            title={d.day ? d.day.label : 'No free slots'}
            onClick={() => {
              setDate(d.date);
              onSelect(null);
            }}
          >
            {d.short}
          </button>
        ))}
      </div>

      {selectedDay && (
        <>
          <span className="picker-step">
            2. Pick a time <span className="muted small">· Madrid time</span>
          </span>
          <div className="time-grid" role="group" aria-label={`Times on ${selectedDay.label}`}>
            {groupByHour(selectedDay.slots).map((row) => (
              <div key={row[0].time} className="time-row">
                {row.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`time ${s.id === slotId ? 'time-selected' : ''}`}
                    aria-pressed={s.id === slotId}
                    onClick={() => onSelect(s.id)}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <p className={`picker-summary ${selectedSlot ? 'picker-summary-done' : ''}`} aria-live="polite">
        {selectedSlot ? (
          <>
            ✓ {selectedDay.label} at <strong>{selectedSlot.time}</strong> Madrid time
            {showLocalTime && ` (${formatTime(selectedSlot.start, visitorZone)} your time)`}
            {` · ${availability.slotMinutes} min`}
          </>
        ) : (
          'No time selected yet.'
        )}
      </p>
    </div>
  );
}
