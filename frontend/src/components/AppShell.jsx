import { CalendarDays, FileText, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PRIVACY_URL, SOURCE_URL } from '../links.js';

export const TABS = [
  { id: 'cv', label: 'CV + Agent', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'architecture', label: 'Architecture', icon: Network },
];

const initials = (name) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

// Marco del dashboard: barra lateral en escritorio y pestañas abajo en el móvil. La página
// nunca hace scroll; cada vista ocupa el alto restante y desplaza solo sus paneles.
export default function AppShell({ profile, tab, onTab, children }) {
  const { name, headline } = profile.profile;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex" aria-label="Main">
        <div className="flex items-center gap-3 border-b p-4">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground" title={headline}>
              {headline.split('|')[0].trim()}
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-2" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={cn('justify-start', tab === id && 'bg-accent text-accent-foreground')}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => onTab(id)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t p-4">
          <Button asChild variant="outline" size="sm">
            <a href={profile.contact.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            <a className="hover:underline" href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy
            </a>
            {' · '}
            <a className="hover:underline" href={SOURCE_URL} target="_blank" rel="noreferrer">
              Source code
            </a>
          </p>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 pb-16 md:pb-0">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid h-16 grid-cols-3 border-t bg-card md:hidden"
        aria-label="Sections"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground',
              tab === id && 'text-primary',
            )}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => onTab(id)}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
