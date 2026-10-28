import { CalendarDays, Code2, LayoutGrid, Network, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIVACY_URL, SOURCE_URL } from '../links.js';

export const TABS = [
  { id: 'cv', label: 'Me', icon: LayoutGrid },
  { id: 'calendar', label: 'Book', icon: CalendarDays },
  { id: 'architecture', label: 'Stack', icon: Network },
];

export const initials = (name) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

function TabButton({ tab, active, onTab, className }) {
  const { id, label, icon: Icon } = tab;
  return (
    <button
      type="button"
      className={cn(
        'group flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground',
        active && 'text-foreground',
        className,
      )}
      aria-current={active ? 'page' : undefined}
      onClick={() => onTab(id)}
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-xl transition-all group-hover:bg-muted',
          active && 'bg-gradient-to-br from-primary to-brand-2 text-white shadow-lg shadow-primary/20',
        )}
      >
        <Icon className="size-5" />
      </span>
      {label}
    </button>
  );
}

// Marco del dashboard: barra de iconos a la izquierda en escritorio y pestañas abajo en el
// móvil. La página nunca hace scroll; cada vista ocupa el alto restante.
export default function AppShell({ profile, tab, onTab, children }) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-20 shrink-0 flex-col items-center gap-6 py-4 md:flex" aria-label="Main">
        <span
          className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-brand-2 text-sm font-bold text-white"
          title={profile.profile.name}
          aria-hidden="true"
        >
          {initials(profile.profile.name)}
        </span>

        <nav className="flex flex-col gap-4" aria-label="Sections">
          {TABS.map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id} onTab={onTab} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-3 text-muted-foreground">
          <a className="hover:text-foreground" href={SOURCE_URL} target="_blank" rel="noreferrer" aria-label="Source code" title="Source code">
            <Code2 className="size-5" />
          </a>
          <a className="hover:text-foreground" href={PRIVACY_URL} target="_blank" rel="noreferrer" aria-label="Privacy policy" title="Privacy policy">
            <ShieldCheck className="size-5" />
          </a>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 pb-16 md:pb-0">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid h-16 grid-cols-3 border-t bg-card/80 backdrop-blur md:hidden"
        aria-label="Sections"
      >
        {TABS.map((t) => (
          <TabButton key={t.id} tab={t} active={tab === t.id} onTab={onTab} />
        ))}
      </nav>
    </div>
  );
}
