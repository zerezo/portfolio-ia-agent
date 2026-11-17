import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Mail, Phone, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getAvailability, sendContactRequest } from '../api.js';
import { formatTime, visitorTimeZone } from '../format.js';
import { PRIVACY_URL } from '../links.js';

const MODES = [
  { id: 'video', label: 'Video', icon: Video, hint: 'Jitsi link, no sign-up' },
  { id: 'phone', label: 'Phone', icon: Phone, hint: 'Alejandro calls you' },
  { id: 'email', label: 'Email', icon: Mail, hint: 'No meeting, just a reply' },
];

const EMPTY_FORM = { name: '', email: '', phone: '', reason: '', consent: false };
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Las fechas 'YYYY-MM-DD' se tratan en UTC: son fechas de calendario, sin hora.
const toUtc = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toDateString = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthLabel = (ms) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ms);

// Semanas de lunes a viernes desde la del primer día con huecos hasta la del último. Los días
// sin huecos aparecen desactivados en su sitio.
function buildWeeks(days) {
  if (!days.length) return [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = toUtc(days[0].date);
  const last = toUtc(days.at(-1).date);
  const weeks = [];
  for (let monday = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY_MS; monday <= last; monday += 7 * DAY_MS) {
    weeks.push(
      WEEKDAYS.map((_, i) => {
        const date = toDateString(monday + i * DAY_MS);
        return { date, dayOfMonth: Number(date.slice(8)), day: byDate.get(date) };
      }),
    );
  }
  return weeks;
}

const Card = ({ className, children }) => (
  <section className={cn('flex min-h-0 flex-col gap-4 rounded-2xl border bg-card/70 p-4 backdrop-blur', className)}>
    {children}
  </section>
);
const Step = ({ n, children }) => (
  <h3 className="flex items-center gap-2 text-sm font-semibold">
    <span className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-primary to-brand-2 text-[11px] text-white">
      {n}
    </span>
    {children}
  </h3>
);

// Reserva en una pantalla: a la izquierda modo y día; a la derecha hora y formulario. Usa
// GET /api/availability y POST /api/contact (sin IA; la validación real la hace el backend).
export default function BookView() {
  const [mode, setMode] = useState('video');
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [date, setDate] = useState(null);
  const [slotId, setSlotId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const needsSlot = mode !== 'email';
  const visitorZone = visitorTimeZone();

  const loadAvailability = useCallback(async () => {
    try {
      const data = await getAvailability();
      setAvailability(data);
      setAvailabilityError(null);
    } catch (err) {
      setAvailabilityError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const weeks = useMemo(() => buildWeeks(availability?.days ?? []), [availability]);

  // Si el día elegido ya no tiene huecos (o no hay ninguno elegido), se elige el primero libre.
  useEffect(() => {
    const days = availability?.days ?? [];
    if (!days.some((d) => d.date === date)) setDate(days[0]?.date ?? null);
  }, [availability, date]);

  const selectedDay = availability?.days.find((d) => d.date === date);
  const selectedSlot = selectedDay?.slots.find((s) => s.id === slotId);
  const showLocalTime = visitorZone && availability && visitorZone !== availability.timeZone;

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
        ...(needsSlot && { slotId }),
        ...(mode === 'phone' && { phone: form.phone }),
      });
      setSent(data.message);
      setForm(EMPTY_FORM);
      setSlotId(null);
      loadAvailability();
    } catch (err) {
      setErrors(err.errors);
      // El hueco puede haberse ocupado mientras tanto: se recarga la disponibilidad.
      if (err.status === 400 && needsSlot) {
        setSlotId(null);
        loadAvailability();
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="grid h-full place-items-center p-4">
        <Card className="max-w-sm items-center text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="text-sm">{sent}</p>
          <Button variant="outline" className="rounded-full" onClick={() => setSent(null)}>
            Send another request
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid h-full grid-cols-1 content-start items-start gap-3 overflow-y-auto p-3 text-sm md:grid-cols-2 md:gap-4 md:p-4"
    >
      <Card>
        <div>
          <h2 className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-xl font-bold tracking-tight text-transparent">
            Let&apos;s talk
          </h2>
          <p className="text-xs text-muted-foreground">Alejandro reviews every request and confirms it by email.</p>
        </div>

        <Step n={1}>How?</Step>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="How would you like to talk?">
          {MODES.map(({ id, label, icon: Icon, hint }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              title={hint}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-full py-1.5 font-medium text-muted-foreground',
                mode === id && 'bg-card text-foreground shadow-sm',
              )}
              onClick={() => setMode(id)}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-center text-xs text-muted-foreground">{MODES.find((m) => m.id === mode).hint}</p>

        {needsSlot && (
          <>
            <Step n={2}>Pick a day</Step>
            {availabilityError && <p className="text-destructive">{availabilityError}</p>}
            {!availability && !availabilityError && <p className="text-muted-foreground">Loading availability…</p>}
            {availability && weeks.length === 0 && (
              <p className="text-muted-foreground">No free slots in the next two weeks. Please choose Email.</p>
            )}
            {weeks.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">{monthLabel(toUtc(weeks[0][0].date))}</p>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] text-muted-foreground">
                  {WEEKDAYS.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                {weeks.map((week) => (
                  <div key={week[0].date} className="grid grid-cols-5 gap-1.5" role="group">
                    {week.map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        disabled={!d.day}
                        aria-pressed={d.date === date}
                        aria-label={d.day?.label ?? `${d.date}, no free slots`}
                        className={cn(
                          'h-9 rounded-xl font-medium tabular-nums transition-colors',
                          !d.day && 'text-muted-foreground/40',
                          d.day && d.date !== date && 'bg-muted hover:bg-accent',
                          d.date === date && 'bg-gradient-to-br from-primary to-brand-2 text-white',
                        )}
                        onClick={() => {
                          setDate(d.date);
                          setSlotId(null);
                        }}
                      >
                        {d.dayOfMonth}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        {needsSlot && selectedDay && (
          <div className="flex flex-col gap-2">
            <Step n={3}>
              {selectedDay.label} <span className="font-normal text-muted-foreground">· Madrid time</span>
            </Step>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={`Times on ${selectedDay.label}`}>
              {selectedDay.slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === slotId}
                  className={cn(
                    'h-8 rounded-full border text-xs font-medium tabular-nums transition-colors',
                    s.id === slotId ? 'border-transparent bg-gradient-to-br from-primary to-brand-2 text-white' : 'hover:border-primary',
                  )}
                  onClick={() => setSlotId(s.id)}
                >
                  {s.time}
                </button>
              ))}
            </div>
            {selectedSlot && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                ✓ {selectedSlot.time} Madrid
                {showLocalTime && ` (${formatTime(selectedSlot.start, visitorZone)} your time)`} · {availability.slotMinutes} min
              </p>
            )}
          </div>
        )}

        <Step n={needsSlot ? 4 : 2}>About you</Step>
        <div className="grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="book-name">
            Name
          </label>
          <Input id="book-name" placeholder="Name" value={form.name} onChange={update('name')} maxLength={100} autoComplete="name" />
          <label className="sr-only" htmlFor="book-email">
            Email
          </label>
          <Input
            id="book-email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={update('email')}
            maxLength={254}
            autoComplete="email"
          />
          {mode === 'phone' && (
            <>
              <label className="sr-only" htmlFor="book-phone">
                Phone
              </label>
              <Input
                id="book-phone"
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
          <label className="sr-only" htmlFor="book-reason">
            What would you like to talk about?
          </label>
          <Textarea
            id="book-reason"
            className="col-span-2 min-h-16 resize-none"
            rows={3}
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
          <ul className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}

        <Button type="submit" className="rounded-full" disabled={sending || (needsSlot && !slotId)}>
          {sending ? 'Sending…' : needsSlot && !slotId ? 'Pick a time first' : 'Send request'}
        </Button>
      </Card>
    </form>
  );
}
