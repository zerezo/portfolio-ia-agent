import { useCallback, useEffect, useState } from 'react';
import { getAvailability, sendContactRequest } from '../api.js';
import { formatTime, visitorTimeZone } from '../format.js';
import { PRIVACY_URL } from '../links.js';

const MODES = [
  { id: 'video', label: 'Video call', hint: 'A Jitsi link, no sign-up needed' },
  { id: 'phone', label: 'Phone call', hint: 'Alejandro calls you' },
  { id: 'email', label: 'Email', hint: 'No meeting, just a reply' },
];

const EMPTY_FORM = { name: '', email: '', company: '', phone: '', reason: '', consent: false };

export default function ContactForm() {
  const [mode, setMode] = useState('video');
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [day, setDay] = useState(null);
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
      // Conserva el día elegido si sigue teniendo huecos; si no, el primero disponible.
      setDay((current) => (data.days.some((d) => d.date === current) ? current : (data.days[0]?.date ?? null)));
    } catch (err) {
      setAvailabilityError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

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
        ...(form.company.trim() && { company: form.company }),
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

  const selectedDay = availability?.days.find((d) => d.date === day);
  const showLocalTime = visitorZone && availability && visitorZone !== availability.timeZone;

  if (sent) {
    return (
      <section id="contact" className="section contact" aria-labelledby="contact-title">
        <h2 id="contact-title" className="section-title">
          Get in touch
        </h2>
        <div className="notice notice-success" role="status">
          <p>{sent}</p>
          <button type="button" className="button button-secondary" onClick={() => setSent(null)}>
            Send another request
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="section contact" aria-labelledby="contact-title">
      <h2 id="contact-title" className="section-title">
        Get in touch
      </h2>
      <p className="muted">
        Choose how you would like to talk. Alejandro reviews every request and confirms it by email.
      </p>

      <form onSubmit={submit} noValidate>
        <fieldset className="modes">
          <legend>How would you like to talk?</legend>
          {MODES.map((m) => (
            <label key={m.id} className={`mode ${mode === m.id ? 'mode-selected' : ''}`}>
              <input
                type="radio"
                name="mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
              />
              <span className="mode-label">{m.label}</span>
              <span className="muted small">{m.hint}</span>
            </label>
          ))}
        </fieldset>

        {needsSlot && (
          <fieldset className="slots">
            <legend>
              Pick a time{' '}
              <span className="muted small">
                ({availability?.slotMinutes ?? 20} min · Madrid time
                {showLocalTime && `, your time in brackets`})
              </span>
            </legend>

            {availabilityError && (
              <p className="notice notice-error" role="alert">
                {availabilityError}
              </p>
            )}
            {availability && availability.days.length === 0 && (
              <p className="muted">There are no free slots in the next two weeks. Please choose the email option.</p>
            )}

            {availability && availability.days.length > 0 && (
              <>
                <div className="days" role="group" aria-label="Day">
                  {availability.days.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      className={`chip ${d.date === day ? 'chip-selected' : ''}`}
                      aria-pressed={d.date === day}
                      onClick={() => {
                        setDay(d.date);
                        setSlotId(null);
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {selectedDay && (
                  <div className="times" role="group" aria-label="Time">
                    {selectedDay.slots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`chip ${s.id === slotId ? 'chip-selected' : ''}`}
                        aria-pressed={s.id === slotId}
                        onClick={() => setSlotId(s.id)}
                      >
                        {s.time}
                        {showLocalTime && <span className="muted small"> ({formatTime(s.start, visitorZone)})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </fieldset>
        )}

        <div className="fields">
          <label>
            Name
            <input type="text" value={form.name} onChange={update('name')} maxLength={100} autoComplete="name" required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} maxLength={254} autoComplete="email" required />
          </label>
          <label>
            <span>
              Company <span className="muted small">(optional)</span>
            </span>
            <input type="text" value={form.company} onChange={update('company')} maxLength={100} autoComplete="organization" />
          </label>
          {mode === 'phone' && (
            <label>
              Phone
              <input
                type="tel"
                value={form.phone}
                onChange={update('phone')}
                maxLength={20}
                autoComplete="tel"
                placeholder="+34 600 000 000"
                required
              />
            </label>
          )}
          <label className="field-wide">
            What would you like to talk about?
            <textarea value={form.reason} onChange={update('reason')} minLength={10} maxLength={1000} rows={4} required />
          </label>
        </div>

        <label className="consent">
          <input type="checkbox" checked={form.consent} onChange={update('consent')} required />
          <span>
            I agree to the processing of my data to handle this request, as described in the{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              privacy policy
            </a>
            .
          </span>
        </label>

        {errors.length > 0 && (
          <ul className="notice notice-error" role="alert">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}

        <button type="submit" className="button" disabled={sending || (needsSlot && !slotId)}>
          {sending ? 'Sending…' : 'Send request'}
        </button>
        {needsSlot && !slotId && <span className="muted small hint">Pick a time to continue.</span>}
      </form>
    </section>
  );
}
