import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Visitas por día (28 días) y total acumulado, al estilo de las gráficas interactivas de
// next-shadcn-dashboard-starter: dos pestañas en la cabecera, cada una con su cifra. Una serie y
// un eje por vista (nunca dos escalas en la misma gráfica). SVG propio, sin librerías: barras de
// 24 px como mucho con el extremo redondeado, separación de 2 px, rejilla fina, tooltip al pasar
// y tabla oculta para lectores de pantalla. El color sale de --chart-1 (validado en claro y oscuro).

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 36 };
const VIEWS = [
  { id: 'daily', label: 'Visits per day' },
  { id: 'cumulative', label: 'Cumulative' },
];

const fmt = new Intl.NumberFormat('en-US');
const dayLabel = (date, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));

// Escala "limpia": paso de 1, 2 o 5 × 10^n y dos pasos hasta el máximo.
function niceTicks(max) {
  const raw = Math.max(1, max) / 2;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
  return [0, step, step * 2];
}

// Barra con el extremo superior redondeado (4 px) y la base recta.
function barPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export default function VisitsChart({ visits }) {
  const [view, setView] = useState('daily');
  const [hover, setHover] = useState(null);
  const [width, setWidth] = useState(0);
  const box = useRef(null);
  const gradientId = useId().replace(/:/g, '');

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const days = useMemo(() => visits?.days ?? [], [visits]);
  const series = useMemo(() => {
    if (view === 'daily') return days.map((d) => d.visits);
    // Acumulado: lo anterior a las 4 semanas más lo de cada día.
    let running = (visits?.total ?? 0) - days.reduce((sum, d) => sum + d.visits, 0);
    return days.map((d) => (running += d.visits));
  }, [days, view, visits]);

  const totals = { daily: days.reduce((sum, d) => sum + d.visits, 0), cumulative: visits?.total ?? null };
  const ticks = niceTicks(Math.max(0, ...series));
  const top = ticks.at(-1);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = days.length ? innerW / days.length : 0;
  const barW = Math.max(1, Math.min(24, band - 2));
  const x = (i) => PAD.left + i * band + band / 2;
  const y = (v) => PAD.top + innerH - (v / top) * innerH;
  const empty = !days.length || (totals.cumulative ?? 0) === 0;

  const line = series.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = series.length ? `${line}L${x(series.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';
  const tooltipDay = hover !== null ? days[hover] : null;

  const onKeyDown = (e) => {
    if (!days.length) return;
    if (e.key === 'ArrowRight') setHover((h) => Math.min(days.length - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? days.length) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-col items-stretch gap-0 border-b !p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-5 py-4">
          <CardTitle className="text-base">Visits</CardTitle>
          <CardDescription className="text-xs">
            Page loads of alejandrocerezo.dev, last 4 weeks. Counted without cookies; no IPs stored.
          </CardDescription>
        </div>
        <div className="flex" role="tablist" aria-label="Chart view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={cn(
                'flex flex-1 flex-col justify-center gap-1 border-t px-5 py-3 text-left outline-none even:border-l focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:border-t-0 sm:border-l sm:px-6',
                view === v.id && 'bg-muted/50',
              )}
              onClick={() => {
                setView(v.id);
                setHover(null);
              }}
            >
              <span className="text-xs whitespace-nowrap text-muted-foreground">{v.id === 'daily' ? 'Last 28 days' : 'All time'}</span>
              <span className="text-xl leading-none font-semibold tabular-nums">
                {totals[v.id] === null ? '—' : fmt.format(totals[v.id])}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-3 pt-4 pb-3 sm:px-5">
        <div ref={box} className="relative h-[220px] w-full">
          {width > 0 && (
            <svg
              width={width}
              height={HEIGHT}
              className="text-chart-1 outline-none"
              role="img"
              aria-label={`${VIEWS.find((v) => v.id === view).label}, last 28 days. Use the arrow keys to read each day.`}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth="1" />
                  <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                    {fmt.format(t)}
                  </text>
                </g>
              ))}
              {days.map((d, i) =>
                i % 7 === 0 || i === days.length - 1 ? (
                  <text key={d.date} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {dayLabel(d.date, { day: 'numeric', month: 'short' })}
                  </text>
                ) : null,
              )}
              {view === 'daily' ? (
                series.map((v, i) => (
                  <path
                    key={days[i].date}
                    d={barPath(x(i) - barW / 2, y(v), barW, y(0) - y(v))}
                    fill="currentColor"
                    className={cn('transition-opacity', hover !== null && hover !== i && 'opacity-40')}
                  />
                ))
              ) : (
                <>
                  <path d={area} fill={`url(#${gradientId})`} />
                  <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {hover !== null && (
                    <>
                      <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} className="stroke-muted-foreground/50" strokeWidth="1" />
                      <circle cx={x(hover)} cy={y(series[hover])} r="4.5" fill="currentColor" className="stroke-card" strokeWidth="2" />
                    </>
                  )}
                </>
              )}
              {/* Zonas de pasar el ratón: toda la columna de cada día (más grandes que la marca). */}
              {days.map((d, i) => (
                <rect
                  key={`hit-${d.date}`}
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              ))}
            </svg>
          )}
          {tooltipDay && width > 0 && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
              style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}
            >
              <p className="text-muted-foreground">{dayLabel(tooltipDay.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              <p className="font-semibold tabular-nums">
                {fmt.format(series[hover])} {view === 'daily' ? (series[hover] === 1 ? 'visit' : 'visits') : 'in total'}
              </p>
            </div>
          )}
          {empty && (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              {days.length ? 'No visits recorded yet.' : 'Visit data is not available right now.'}
            </p>
          )}
        </div>
        <table className="sr-only">
          <caption>Visits per day, last 28 days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Visits</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
