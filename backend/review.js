import { randomBytes } from 'node:crypto';
import { describeSlot } from './calendar.js';
import { createInvite } from './ics.js';

// Revisión de solicitudes de contacto: páginas de aprobar/rechazar y emails de cada caso.
// Idiomas: lo que recibe el solicitante va en inglés (la web es en inglés); lo que ve
// Alejandro (avisos y páginas de revisión), en español.

const TEXT = {
  es: {
    modes: { video: 'Videollamada', phone: 'Llamada telefónica', email: 'Contacto por email' },
    when: (label, time, minutes) => `${label}, ${time} (hora de Madrid, ${minutes} min)`,
    fields: { mode: 'Modalidad', date: 'Fecha', name: 'Nombre', email: 'Email', company: 'Empresa', phone: 'Teléfono', reason: 'Motivo' },
    locale: 'es-ES',
  },
  en: {
    modes: { video: 'Video call', phone: 'Phone call', email: 'Email contact' },
    when: (label, time, minutes) => `${label}, ${time} (Madrid time, ${minutes} min)`,
    fields: { mode: 'Type', date: 'Date', name: 'Name', email: 'Email', company: 'Company', phone: 'Phone', reason: 'Reason' },
    locale: 'en-GB',
  },
};

export const MODE_LABELS = TEXT.es.modes;

// Los datos los escribe el solicitante: todo lo que va al HTML se escapa (XSS).
export const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// Sala de Jitsi con nombre aleatorio: no se puede adivinar ni reutilizar.
export const createJitsiUrl = () => `https://meet.jit.si/portfolio-${randomBytes(12).toString('hex')}`;

// "martes, 20 de octubre, 17:00 (hora de Madrid, 20 min)" / "Tuesday 20 October, 17:00
// (Madrid time, 20 min)", o null si no hay hueco.
export function describeWhen(request, schedule, lang = 'es') {
  if (!request.slotId) return null;
  const t = TEXT[lang];
  const slot = describeSlot(request.slotId, schedule.timeZone, t.locale);
  return t.when(slot.label, slot.time, schedule.slotMinutes);
}

export function summarize(request, schedule, lang = 'es') {
  const t = TEXT[lang];
  const when = describeWhen(request, schedule, lang);
  return [
    `${t.fields.mode}: ${t.modes[request.mode]}`,
    ...(when ? [`${t.fields.date}: ${when}`] : []),
    `${t.fields.name}: ${request.name}`,
    `${t.fields.email}: ${request.email}`,
    ...(request.company ? [`${t.fields.company}: ${request.company}`] : []),
    ...(request.phone ? [`${t.fields.phone}: ${request.phone}`] : []),
    '',
    `${t.fields.reason}:`,
    request.reason,
  ].join('\n');
}

// Emails al crear la solicitud: aviso a Alejandro (con el enlace de revisión) y acuse.
// Reply-To cruzado: Alejandro responde directamente al solicitante, y las respuestas del
// solicitante llegan al email personal de Alejandro, no a la cuenta que envía.
export function newRequestEmails(request, { schedule, ownerEmail, reviewUrl }) {
  return [
    {
      to: ownerEmail,
      replyTo: request.email,
      subject: `Nueva solicitud de contacto: ${request.name} (${TEXT.es.modes[request.mode]})`,
      text:
        `${summarize(request, schedule, 'es')}\n\n` +
        `Revísala aquí para aprobarla o rechazarla (el enlace caduca en 7 días):\n${reviewUrl}\n`,
    },
    {
      to: request.email,
      replyTo: ownerEmail,
      subject: 'We have received your contact request',
      text:
        `Hi ${request.name},\n\n` +
        'Thank you for your interest. Alejandro will review your request and reply by email.\n' +
        `${request.slotId ? 'The time slot you chose is held for you until then.\n' : ''}\n` +
        `Summary of your request:\n${summarize(request, schedule, 'en')}\n`,
    },
  ];
}

// Emails al aprobar. Videollamada y llamada llevan la invitación .ics para ambos, para que
// aparezca en el calendario de los dos; el contacto por email no tiene cita.
export function approvalEmails(request, { schedule, ownerEmail, ownerName, now = new Date() }) {
  const whenEn = describeWhen(request, schedule, 'en');
  const details = {
    video: `Video call link (Jitsi, no sign-up needed): ${request.meetingUrl}`,
    phone: `${ownerName} will call you at ${request.phone}.`,
    email: `${ownerName} will write to you at this email address shortly.`,
  }[request.mode];

  let attachments = [];
  if (request.slotId) {
    const slot = describeSlot(request.slotId, schedule.timeZone);
    // La invitación la ven los dos: en inglés, como el resto de lo que recibe el solicitante.
    const ics = createInvite({
      uid: `${request.id}@portfolio-ia-agent`,
      start: slot.start,
      minutes: schedule.slotMinutes,
      summary: `${TEXT.en.modes[request.mode]}: ${ownerName} and ${request.name}`,
      description: `${details}\n\nReason: ${request.reason}`,
      location: request.mode === 'video' ? request.meetingUrl : `Phone: ${request.phone}`,
      organizer: { name: ownerName, email: ownerEmail },
      attendees: [
        { name: request.name, email: request.email },
        { name: ownerName, email: ownerEmail },
      ],
      now,
    });
    attachments = [{ filename: 'invite.ics', contentType: 'text/calendar; method=REQUEST; charset=utf-8', content: ics }];
  }

  const whenEs = describeWhen(request, schedule, 'es');
  return [
    {
      to: request.email,
      replyTo: ownerEmail,
      subject: whenEn ? `${TEXT.en.modes[request.mode]} confirmed: ${whenEn}` : 'Your contact request has been accepted',
      text:
        `Hi ${request.name},\n\n` +
        `${ownerName} has accepted your request.\n` +
        `${whenEn ? `Date: ${whenEn}\n` : ''}${details}\n\n` +
        `${attachments.length ? 'The calendar invitation is attached.\n' : ''}`,
      attachments,
    },
    {
      to: ownerEmail,
      replyTo: request.email,
      subject: `[Aprobada] ${TEXT.es.modes[request.mode]}${whenEs ? `: ${whenEs}` : ''} con ${request.name}`,
      text:
        'Has aprobado esta solicitud. El solicitante ha recibido la confirmación' +
        `${attachments.length ? ' y la invitación' : ''}.\n` +
        `${request.meetingUrl ? `Enlace de la videollamada: ${request.meetingUrl}\n` : ''}\n` +
        `${summarize(request, schedule, 'es')}\n`,
      attachments,
    },
  ];
}

export function rejectionEmail(request, { ownerName, ownerEmail }) {
  return {
    to: request.email,
    replyTo: ownerEmail,
    subject: 'About your contact request',
    text:
      `Hi ${request.name},\n\n` +
      `Thank you for your interest. Unfortunately ${ownerName} cannot take your request in the ` +
      'proposed format or at the proposed time.\n' +
      'You can send a new request with a different format or time through the contact form, ' +
      'or reach out on LinkedIn.\n',
  };
}

// Página HTML mínima. CSP estricta en las cabeceras (ver app.js): sin scripts.
export function page(title, body) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; }
  dt { font-weight: 600; }
  dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  form { display: inline-block; margin: 1.5rem .5rem 0 0; }
  button { font-size: 1rem; padding: .6rem 1.2rem; border-radius: 6px; border: 1px solid #888; cursor: pointer; }
  .approve { background: #1f7a3a; color: #fff; border-color: #1f7a3a; }
  .reject { background: #fff; color: #a11; border-color: #a11; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

export function reviewPage(request, { schedule, token }) {
  const when = describeWhen(request, schedule);
  const rows = [
    ['Modalidad', MODE_LABELS[request.mode]],
    ...(when ? [['Fecha', when]] : []),
    ['Nombre', request.name],
    ['Email', request.email],
    ...(request.company ? [['Empresa', request.company]] : []),
    ...(request.phone ? [['Teléfono', request.phone]] : []),
    ['Motivo', request.reason],
  ];
  const form = (action, label, cls) =>
    `<form method="post" action="/api/contact/${escapeHtml(request.id)}/${action}">` +
    `<input type="hidden" name="token" value="${escapeHtml(token)}">` +
    `<button type="submit" class="${cls}">${label}</button></form>`;

  return page(
    'Solicitud de contacto',
    `<dl>${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
${form('approve', 'Aprobar y enviar invitación', 'approve')}
${form('reject', 'Rechazar', 'reject')}`,
  );
}
