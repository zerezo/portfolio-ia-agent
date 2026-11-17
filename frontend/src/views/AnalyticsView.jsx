import { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Car,
  CircleCheck,
  CircleDashed,
  Clock,
  ExternalLink,
  GraduationCap,
  History,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getAnalytics } from '../api.js';
import VisitsChart from '../components/VisitsChart.jsx';

// Página Analytics: que un recruiter vea que los proyectos están en producción, con uso real y
// coste controlado. Una tarjeta por proyecto (al estilo de las SectionCards de la plantilla) y la
// gráfica de visitas. Todo sale de /api/analytics (solo agregados); si una cifra no está, "—".
// Si la API no responde, se enseña el último dato guardado con su hora (api.js).

const num = new Intl.NumberFormat('en-US');
const n = (value) => (value === null || value === undefined ? '—' : num.format(value));
const pct = (value) => (value === null || value === undefined ? '—' : `${value}%`);
function money(value, currency = 'USD') {
  if (value === null || value === undefined) return '—';
  const digits = value !== 0 && Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}
function ago(iso) {
  if (!iso) return null;
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  if (Math.abs(minutes) < 48 * 60) return rtf.format(-Math.round(minutes / 60), 'hour');
  return rtf.format(-Math.round(minutes / 1440), 'day');
}
const shortDate = (iso) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : null;

const STATUS = {
  ok: { icon: CircleCheck, label: 'Live', className: 'border-primary/30 text-primary' },
  stale: { icon: History, label: 'Last known', className: 'text-muted-foreground' },
  unavailable: { icon: WifiOff, label: 'Unavailable', className: 'text-muted-foreground' },
  unconfigured: { icon: CircleDashed, label: 'Not connected yet', className: 'text-muted-foreground' },
};

function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.unavailable;
  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', s.className)}>
      <s.icon /> {s.label}
    </Badge>
  );
}

// Tarjeta de proyecto: etiqueta, cifra principal grande, estado y métricas secundarias; en el pie,
// su coste mensual y la hora del dato.
function ProjectCard({ icon: Icon, name, href, status, headline, headlineLabel, metrics, footer, updatedAt }) {
  return (
    <Card className="@container/card gap-3 py-4">
      <CardHeader className="px-5">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Icon className="size-3.5 text-primary" />
          {href ? (
            <a className="hover:text-foreground hover:underline" href={href} target="_blank" rel="noreferrer">
              {name} <ExternalLink className="inline size-3" />
            </a>
          ) : (
            name
          )}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[16rem]/card:text-3xl">{headline}</CardTitle>
        <p className="text-xs text-muted-foreground">{headlineLabel}</p>
        {status && (
          <CardAction>
            <StatusBadge status={status} />
          </CardAction>
        )}
      </CardHeader>
      {metrics.length > 0 && (
        <CardContent className="px-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {metrics.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      )}
      <CardFooter className="mt-auto flex-col items-start gap-1 border-t px-5 pt-3 text-xs">
        {footer}
        {updatedAt && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" /> Updated {ago(updatedAt)}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}

// Coste mensual: total, hosting (de costs.yaml) y la parte de IA. "—" si falta el dato.
function CostLine({ cost, currency, ai }) {
  return (
    <p className="text-muted-foreground">
      Monthly cost <span className="font-medium text-foreground tabular-nums">{money(cost?.total, currency)}</span>
      {' · '}hosting <span className="tabular-nums">{money(cost?.hosting, currency)}</span>
      {' · '}
      {ai}
    </p>
  );
}

export default function AnalyticsView({ profile }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    getAnalytics()
      .then((result) => setState({ ...result, loading: false }))
      .catch(() => setState({ loading: false, data: null }));
  }, []);

  const project = (id) => profile.projects.find((p) => p.id === id);
  const link = (id) => project(id)?.links?.[0]?.url;
  const name = (id, fallback) => project(id)?.name.split(': ')[0] ?? fallback;
  const tfg = project('tfg');
  const grade = (tfg?.context ?? '').match(/\d+(?:[.,]\d+)?\/10/)?.[0];

  const data = state.data;
  const currency = data?.costs?.currency ?? 'USD';
  const p = data?.projects ?? {};
  const pm = p.portfolio?.metrics ?? {};
  const em = p.entrenador?.metrics ?? {};
  const hm = p.homecargarage?.metrics ?? {};

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-4 **:data-[slot=card]:bg-gradient-to-t **:data-[slot=card]:from-primary/5 **:data-[slot=card]:to-card **:data-[slot=card]:shadow-xs">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
            <p className="text-sm text-muted-foreground">
              My projects in production: real usage and what they cost to run. Aggregated counts only.
            </p>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            <p>
              Running cost of everything:{' '}
              <span className="text-base font-semibold text-foreground tabular-nums">{money(data?.costs?.monthlyTotal, currency)}</span> /
              month
            </p>
            {data?.costs?.updated && <p>Hosting costs as of {shortDate(data.costs.updated)}; AI costs computed live.</p>}
          </div>
        </header>

        {state.source && state.source !== 'live' && (
          <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" role="status">
            <WifiOff className="size-3.5" /> The live data is unavailable right now: showing the last saved snapshot
            {state.savedAt ? ` (${ago(state.savedAt)})` : ''}.
          </p>
        )}
        {!state.loading && !data && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" role="status">
            Analytics are not available right now. Please try again later.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 @container sm:grid-cols-2 2xl:grid-cols-4" aria-busy={state.loading}>
          <ProjectCard
            icon={Bot}
            name={name('portfolio', 'Portfolio AI Agent')}
            href={link('portfolio')}
            status={p.portfolio?.status}
            headline={n(pm.conversations?.total)}
            headlineLabel={`Conversations with the AI assistant${p.portfolio?.since ? ` since ${shortDate(p.portfolio.since)}` : ''}`}
            metrics={[
              ['Last 7 days', n(pm.conversations?.last7d)],
              ['Blocked by the guard', pct(pm.blockedPct)],
              ['AI cost this month', money(pm.aiCostMonth, currency)],
              ['AI cost per conversation', money(pm.aiCostPerConversation, currency)],
              ['Visits, last 7 days', n(pm.visitsLast7d)],
              ['Messages', n(pm.messages)],
            ]}
            footer={<CostLine cost={p.portfolio?.cost} currency={currency} ai={`AI ${money(p.portfolio?.cost?.ai, currency)}`} />}
            updatedAt={p.portfolio?.updatedAt}
          />
          <ProjectCard
            icon={Activity}
            name={name('entrenador', 'Entrenador')}
            status={p.entrenador?.status}
            headline={n(em.activities)}
            headlineLabel="Training sessions synced and tracked"
            metrics={[
              ['Analysed by Claude', n(em.analyzed)],
              ['Training plans designed', n(em.plans)],
              ['Workouts sent to intervals.icu', n(em.workoutsSent)],
              ['Duplicates merged', n(em.duplicatesMerged)],
              ['Days in use', n(em.daysInUse)],
              ['Evals passed', em.evalsPassPct === null || em.evalsPassPct === undefined ? '— (in progress)' : pct(em.evalsPassPct)],
            ]}
            footer={<CostLine cost={p.entrenador?.cost} currency={currency} ai="AI runs on Claude.ai" />}
            updatedAt={p.entrenador?.updatedAt}
          />
          <ProjectCard
            icon={Car}
            name={name('homecargarage', 'HomeCarGarage')}
            href={link('homecargarage')}
            status={p.homecargarage?.status}
            headline={n(hm.users)}
            headlineLabel="Registered users"
            metrics={[['Cars added', n(hm.vehicles)]]}
            footer={<CostLine cost={p.homecargarage?.cost} currency={currency} ai="no AI" />}
            updatedAt={p.homecargarage?.updatedAt}
          />
          <ProjectCard
            icon={GraduationCap}
            name={name('tfg', "Bachelor's thesis")}
            href={tfg?.links?.[0]?.url}
            headline={grade ?? '—'}
            headlineLabel={tfg?.context ?? "Bachelor's thesis"}
            metrics={[]}
            footer={<p className="text-muted-foreground">Research project: no usage metrics. The code is on GitHub.</p>}
          />
        </div>

        <VisitsChart visits={data?.visits} />
      </div>
    </div>
  );
}
