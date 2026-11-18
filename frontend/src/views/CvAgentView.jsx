import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import Chat from '../components/Chat.jsx';
import CvPanel from '../components/CvPanel.jsx';
import { useFitDensity, useMediaQuery } from '../hooks/useFitDensity.js';

// Niveles de densidad del CV (CvPanel.jsx): 0 = todo, 3 = solo lo más importante.
const MAX_DENSITY = 3;

const PANES = [
  { id: 'cv', label: 'CV' },
  { id: 'chat', label: 'Assistant' },
];

// CV a la izquierda y chat a la derecha, al 50 %. Cada mitad desplaza su propio contenido (la
// página nunca hace scroll).
// En el móvil no caben las dos: un selector muestra una u otra (el chat no se desmonta, así
// la conversación se conserva al cambiar).
export default function CvAgentView({ profile, onOpenContact }) {
  const [pane, setPane] = useState('cv');
  const paneRef = useRef(null);
  // En escritorio el CV se ajusta al alto de la pantalla sin scroll; en el móvil (una columna)
  // no cabe todo: densidad compacta fija y scroll vertical.
  const desktop = useMediaQuery('(min-width: 768px)');
  const fitted = useFitDensity(paneRef, { max: MAX_DENSITY, enabled: desktop });
  const density = desktop ? fitted : 1;

  return (
    // Chat: la mitad en tablet, 20-22rem en portátil y un cuarto del ancho desde 1536 px (monitor de 27").
    <div className="flex h-full flex-col gap-3 p-3 md:grid md:grid-cols-2 md:gap-4 md:p-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,3fr)_minmax(22rem,1fr)]">
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
        ref={paneRef}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] md:block',
          pane !== 'cv' && 'hidden',
        )}
      >
        <CvPanel profile={profile} onOpenContact={onOpenContact} density={density} />
      </div>
      <div className={cn('min-h-0 flex-1 md:flex', pane === 'chat' ? 'flex' : 'hidden')}>
        <Chat onOpenContact={onOpenContact} />
      </div>
    </div>
  );
}
