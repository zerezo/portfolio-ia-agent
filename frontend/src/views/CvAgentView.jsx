import { useState } from 'react';
import { cn } from '@/lib/utils';
import Chat from '../components/Chat.jsx';
import CvPanel from '../components/CvPanel.jsx';

const PANES = [
  { id: 'cv', label: 'CV' },
  { id: 'chat', label: 'Assistant' },
];

// CV a la izquierda y chat a la derecha, al 50 %. Cada mitad desplaza su propio contenido.
// En el móvil no caben las dos: un selector muestra una u otra (el chat no se desmonta, así
// la conversación se conserva al cambiar).
export default function CvAgentView({ profile, onOpenContact }) {
  const [pane, setPane] = useState('cv');

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:grid md:grid-cols-2 md:gap-4 md:p-4 2xl:grid-cols-[1.2fr_1fr]">
      <div className="grid grid-cols-2 rounded-full bg-muted p-1 md:hidden" role="tablist" aria-label="View">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pane === p.id}
            className={cn(
              'rounded-full py-1.5 text-sm font-medium text-muted-foreground',
              pane === p.id && 'bg-card text-foreground shadow-sm',
            )}
            onClick={() => setPane(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto md:block md:overflow-hidden',
          pane !== 'cv' && 'hidden',
        )}
      >
        <CvPanel profile={profile} onOpenContact={onOpenContact} />
      </div>
      <div className={cn('min-h-0 flex-1 md:flex', pane === 'chat' ? 'flex' : 'hidden')}>
        <Chat onOpenContact={onOpenContact} />
      </div>
    </div>
  );
}
