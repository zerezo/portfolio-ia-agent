// Invitaciones de calendario (iCalendar, RFC 5545). Gmail, Outlook y Apple Calendar muestran
// un archivo .ics con METHOD:REQUEST como invitación con botones de aceptar/rechazar.

// Escapa los caracteres especiales de los valores de texto.
const escapeText = (text) =>
  String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Las líneas no deben superar 75 octetos: las largas se pliegan con CRLF + espacio.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74; // las continuaciones empiezan con un espacio
    if (Buffer.byteLength(current + char, 'utf8') > limit) {
      parts.push(current);
      current = '';
    }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

// Fecha en UTC con el formato de iCalendar: 20261020T150000Z.
const toIcsDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function createInvite({ uid, start, minutes, summary, description, location, organizer, attendees, now = new Date() }) {
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//portfolio-ia-agent//contacto//ES',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    `ORGANIZER;CN=${escapeText(organizer.name)}:mailto:${organizer.email}`,
    ...attendees.map(
      (a) => `ATTENDEE;CN=${escapeText(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    ),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
