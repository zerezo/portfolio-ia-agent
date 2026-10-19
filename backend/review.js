import { randomBytes } from 'node:crypto';
import { describeSlot } from './calendar.js';
import { createInvite } from './ics.js';

// Revisión de solicitudes de contacto: páginas de aprobar/rechazar y emails de cada caso.

export const MODE_LABELS = { video: 'Videollamada', phone: 'Llamada telefónica', email: 'Contacto por email' };

// Los datos los escribe el solicitante: todo lo que va al HTML se escapa (XSS).
export const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// Sala de Jitsi con nombre aleatorio: no se puede adivinar ni reutilizar.
export const createJitsiUrl = () => `https://meet.jit.si/portfolio-${randomBytes(12).toString('hex')}`;

// "martes, 20 de octubre, 17:00 (hora de Madrid, 20 min)", o null si no hay hueco.
export function describeWhen(request, schedule) {
  if (!request.slotId) return null;
  const slot = describeSlot(request.slotId, schedule.timeZone);
  return `${slot.label}, ${slot.time} (hora de Madrid, ${schedule.slotMinutes} min)`;
}

export function summarize(request, schedule) {
  const when = describeWhen(request, schedule);
  return [
    `Modalidad: ${MODE_LABELS[request.mode]}`,
    ...(when ? [`Fecha: ${when}`] : []),
    `Nombre: ${request.name}`,
    `Email: ${request.email}`,
    ...(request.company ? [`Empresa: ${request.company}`] : []),
    ...(request.phone ? [`Teléfono: ${request.phone}`] : []),
    '',
    'Motivo:',
    request.reason,
  ].join('\n');
}

// Emails al crear la solicitud: aviso a Alejandro (con el enlace de revisión) y acuse.
// Reply-To cruzado: Alejandro responde directamente al solicitante, y las respuestas del
// solicitante llegan al email personal de Alejandro, no a la cuenta que envía.
export function newRequestEmails(request, { schedule, ownerEmail, reviewUrl }) {
  const summary = summarize(request, schedule);
  return [
    {
      to: ownerEmail,
      replyTo: request.email,
      subject: `Nueva solicitud de contacto: ${request.name} (${MODE_LABELS[request.mode]})`,
      text: `${summary}\n\nRevísala aquí para aprobarla o rechazarla (el enlace caduca en 7 días):\n${reviewUrl}\n`,
    },
    {
      to: request.email,
      replyTo: ownerEmail,
      subject: 'Hemos recibido tu solicitud de contacto',
      text:
        `Hola, ${request.name}:\n\n` +
        'Gracias por tu interés. Alejandro revisará tu solicitud y te responderá por email.\n' +
        `${request.slotId ? 'El hueco elegido queda reservado hasta entonces.\n' : ''}\n` +
        `Resumen de tu solicitud:\n${summary}\n`,
    },
  ];
}

// Emails al aprobar. Videollamada y llamada llevan la invitación .ics para ambos, para que
// aparezca en el calendario de los dos; el contacto por email no tiene cita.
export function approvalEmails(request, { schedule, ownerEmail, ownerName, now = new Date() }) {
  const when = describeWhen(request, schedule);
  const details = {
    video: `Enlace de la videollamada (Jitsi, sin registro): ${request.meetingUrl}`,
    phone: `${ownerName} te llamará al ${request.phone}.`,
    email: `${ownerName} te escribirá en breve a este email.`,
  }[request.mode];

  let attachments = [];
  if (request.slotId) {
    const slot = describeSlot(request.slotId, schedule.timeZone);
    const ics = createInvite({
      uid: `${request.id}@portfolio-ia-agent`,
      start: slot.start,
      minutes: schedule.slotMinutes,
      summary: `${MODE_LABELS[request.mode]}: ${ownerName} y ${request.name}`,
      description: `${details}\n\nMotivo: ${request.reason}`,
      location: request.mode === 'video' ? request.meetingUrl : `Teléfono: ${request.phone}`,
      organizer: { name: ownerName, email: ownerEmail },
      attendees: [
        { name: request.name, email: request.email },
        { name: ownerName, email: ownerEmail },
      ],
      now,
    });
    attachments = [{ filename: 'invitacion.ics', contentType: 'text/calendar; method=REQUEST; charset=utf-8', content: ics }];
  }

  const subject = when
    ? `${MODE_LABELS[request.mode]} confirmada: ${when}`
    : 'Tu solicitud de contacto ha sido aceptada';
  return [
    {
      to: request.email,
      replyTo: ownerEmail,
      subject,
      text:
        `Hola, ${request.name}:\n\n` +
        `${ownerName} ha aceptado tu solicitud.\n` +
        `${when ? `Fecha: ${when}\n` : ''}${details}\n\n` +
        `${attachments.length ? 'Adjuntamos la invitación para tu calendario.\n' : ''}`,
      attachments,
    },
    {
      to: ownerEmail,
      replyTo: request.email,
      subject: `[Aprobada] ${subject}`,
      text: `Has aprobado esta solicitud.\n${details}\n\n${summarize(request, schedule)}\n`,
      attachments,
    },
  ];
}

export function rejectionEmail(request, { ownerName, ownerEmail }) {
  return {
    to: request.email,
    replyTo: ownerEmail,
    subject: 'Sobre tu solicitud de contacto',
    text:
      `Hola, ${request.name}:\n\n` +
      `Gracias por tu interés. Ahora mismo ${ownerName} no puede atender tu solicitud en el formato ` +
      'o la fecha propuestos.\n' +
      'Puedes enviar otra con un formato o una fecha diferente desde el formulario de contacto, ' +
      'o escribirle por LinkedIn.\n',
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
