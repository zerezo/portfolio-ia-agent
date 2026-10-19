// "2026-05" -> "May 2026"; "2021" -> "2021".
export function formatMonth(value) {
  if (!value) return 'Present';
  const [year, month] = value.split('-').map(Number);
  if (!month) return String(year);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export const formatPeriod = (start, end) => `${formatMonth(start)} – ${formatMonth(end)}`;

// Zona horaria del visitante, o null si el navegador no la expone.
export function visitorTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

// Hora de un instante ISO en una zona horaria: "17:00".
export const formatTime = (iso, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
