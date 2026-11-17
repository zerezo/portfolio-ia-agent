import { useState } from 'react';
import { CalendarCheck, CheckCircle2, Mail, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { sendContactRequest } from '../api.js';
import { formatTime, visitorTimeZone } from '../format.js';
import { PRIVACY_URL } from '../links.js';

const MODES = {
  video: { label: 'Video call', icon: Video },
  phone: { label: 'Phone call', icon: Phone },
  email: { label: 'Email contact', icon: Mail },
};

// Tarjeta de confirmación de una reunión propuesta por el asistente (propose_meeting). El
// visitante completa sus datos y confirma: la solicitud va por POST /api/contact, igual que
// desde la página Book, con la misma validación, límites y aprobación de Alejandro.
// proposal: { mode, slot?: { id, label, time, start, minutes }, reason? }
export default function MeetingCard({ proposal, onOpenBook }) {
  const { mode, slot } = proposal;
  const [form, setForm] = useState({ name: '', email: '', phone: '', reason: proposal.reason ?? '', consent: false });
  const [errors, setErrors] = useState([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [slotGone, setSlotGone] = useState(false);

  const { label, icon: Icon } = MODES[mode];
  const visitorZone = visitorTimeZone();
  const showLocalTime = slot && visitorZone && visitorZone !== 'Europe/Madrid';
  const id = (field) => `meeting-${slot?.id ?? mode}-${field}`;

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErrors([]);
    setSending(true);
    try {
      const data = await sendContactRequest({
        mode,
        name: form.name,
        email: form.email,
        reason: form.reason,
        consent: form.consent,
        ...(slot && { slotId: slot.id }),
        ...(mode === 'phone' && { phone: form.phone }),
      });
      setSent(data.message);
    } catch (err) {
      setErrors(err.errors);
      // El hueco puede haberse ocupado desde que el asistente lo propuso.
      if (err.status === 400 && slot && err.errors.some((m) => m.includes('no longer available'))) setSlotGone(true);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex w-full items-start gap-2 rounded-xl border bg-card p-3 text-sm" role="status">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>{sent}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col gap-2 rounded-xl border bg-card p-3 text-sm" aria-label="Confirm your meeting request">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" />
        {label}
      </p>
      {slot && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarCheck className="size-3.5" />
          {slot.label} · {slot.time} Madrid
          {showLocalTime && ` (${formatTime(slot.start, visitorZone)} your time)`} · {slot.minutes} min
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor={id('name')}>
          Name
        </label>
        <Input id={id('name')} placeholder="Name" value={form.name} onChange={update('name')} maxLength={100} autoComplete="name" />
        <label className="sr-only" htmlFor={id('email')}>
          Email
        </label>
        <Input
          id={id('email')}
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={update('email')}
          maxLength={254}
          autoComplete="email"
        />
        {mode === 'phone' && (
          <>
            <label className="sr-only" htmlFor={id('phone')}>
              Phone
            </label>
            <Input
              id={id('phone')}
              type="tel"
              className="col-span-2"
              placeholder="Phone, e.g. +34 600 000 000"
              value={form.phone}
              onChange={update('phone')}
              maxLength={20}
              autoComplete="tel"
            />
          </>
        )}
        <label className="sr-only" htmlFor={id('reason')}>
          What would you like to talk about?
        </label>
        <Textarea
          id={id('reason')}
          className="col-span-2 min-h-14 resize-none"
          rows={2}
          placeholder="What would you like to talk about?"
          value={form.reason}
          onChange={update('reason')}
          maxLength={1000}
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" className="mt-0.5 accent-primary" checked={form.consent} onChange={update('consent')} />
        <span>
          I agree to the processing of my data to handle this request (
          <a className="text-primary hover:underline" href={PRIVACY_URL} target="_blank" rel="noreferrer">
            privacy policy
          </a>
          ).
        </span>
      </label>

      {errors.length > 0 && (
        <ul className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive" role="alert">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
          {slotGone && <li>Ask the assistant for other times, or pick one on the Book page.</li>}
        </ul>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="rounded-full" disabled={sending || slotGone}>
          {sending ? 'Sending…' : 'Confirm'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onOpenBook}>
          Other times
        </Button>
      </div>
    </form>
  );
}
