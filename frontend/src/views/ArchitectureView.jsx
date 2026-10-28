import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EDGES, GROUPS, NODE_H, NODE_W, NODES, VIEW_H, VIEW_W } from '../architecture.js';

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const center = (n) => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });

// Punto donde la recta entre los centros de dos cajas sale del borde de la primera.
function borderPoint(from, to, gap = 4) {
  const c = center(from);
  const t = center(to);
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const scale = Math.min((NODE_W / 2 + gap) / Math.abs(dx || 1e-9), (NODE_H / 2 + gap) / Math.abs(dy || 1e-9));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

// Cajas conectadas con una dada (para resaltarlas al pasar el ratón).
const neighbours = (id) =>
  new Set(EDGES.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : [])).concat(id));

function Node({ node, dimmed, active, onHover, onOpen }) {
  const color = GROUPS[node.group].color;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${node.label}: ${node.preview}`}
      className={cn('cursor-pointer outline-none transition-opacity', dimmed && 'opacity-30')}
      onMouseEnter={(e) => onHover(node, e.currentTarget)}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(node, e.currentTarget)}
      onBlur={() => onHover(null)}
      onClick={() => onOpen(node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(node);
        }
      }}
    >
      <rect
        x={node.x}
        y={node.y}
        width={NODE_W}
        height={NODE_H}
        rx={16}
        className={cn('fill-card stroke-border transition-all', active && 'stroke-primary')}
        strokeWidth={active ? 2 : 1}
      />
      <rect x={node.x + 12} y={node.y + 16} width={4} height={NODE_H - 32} rx={2} fill={color} />
      <text x={node.x + 26} y={node.y + 28} className="fill-foreground text-[15px] font-semibold">
        {node.label}
      </text>
      <text x={node.x + 26} y={node.y + 47} className="fill-muted-foreground text-[12px]">
        {node.sub}
      </text>
    </g>
  );
}

function Details({ node, onClose, onOpen }) {
  const links = EDGES.filter((e) => e.from === node.id || e.to === node.id).map((e) => ({
    ...e,
    other: byId[e.from === node.id ? e.to : e.from],
    outgoing: e.from === node.id,
  }));

  return (
    <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-6 text-sm">
      <header className="flex items-start gap-3">
        <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: GROUPS[node.group].color }} />
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground">{GROUPS[node.group].label}</p>
          <h2 className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            {node.label}
          </h2>
          <p className="text-muted-foreground">{node.sub}</p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </header>

      <section>
        <h3 className="mb-1 font-semibold">What it does</h3>
        <p className="leading-relaxed text-muted-foreground">{node.what}</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Why this choice</h3>
        <p className="leading-relaxed text-muted-foreground">{node.why}</p>
      </section>
      {node.security && (
        <section className="rounded-xl bg-accent/60 p-3">
          <h3 className="mb-1 font-semibold">🔒 Security</h3>
          <p className="leading-relaxed">{node.security}</p>
        </section>
      )}
      <ul className="flex flex-wrap gap-1.5" aria-label="Technologies">
        {node.tech.map((t) => (
          <li key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
            {t}
          </li>
        ))}
      </ul>
      {links.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Connected to</h3>
          <ul className="flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={`${l.from}-${l.to}`}>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => onOpen(l.other)}>
                  {l.outgoing ? '' : '← '}
                  {l.other.label}
                  {l.outgoing && <ArrowRight />}
                  <span className="text-muted-foreground">{l.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Mapa de arquitectura en SVG: al pasar por una caja se resaltan sus conexiones y aparece un
// avance; al pulsarla se abre la explicación completa encima (<dialog> nativo: Esc, la X o un
// clic fuera la cierran).
export default function ArchitectureView() {
  const [hover, setHover] = useState(null); // { node, rect }
  const [open, setOpen] = useState(null);
  const containerRef = useRef(null);
  const dialogRef = useRef(null);

  const lit = useMemo(() => (hover ? neighbours(hover.node.id) : null), [hover]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const onHover = (node, element) => {
    if (!node) return setHover(null);
    const box = containerRef.current.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    setHover({ node, left: r.left - box.left + r.width / 2, top: r.bottom - box.top + 8, flip: r.bottom > box.bottom - 140 });
  };

  const openNode = (node) => {
    setHover(null);
    setOpen(node);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-xl font-bold tracking-tight text-transparent">
            How this site works
          </h2>
          <p className="text-xs text-muted-foreground">
            <span className="hidden md:inline">Hover a box for a preview, click it for the full story.</span>
            <span className="md:hidden">Tap a component for the full story.</span>
          </p>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
          {Object.entries(GROUPS).map(([id, g]) => (
            <li key={id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: g.color }} />
              {g.label}
            </li>
          ))}
        </ul>
      </header>

      {/* En el móvil el mapa no se lee: lista de componentes por grupo, con la misma ficha. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto md:hidden" aria-label="Components">
        {NODES.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border bg-card/70 p-3 text-left"
              onClick={() => openNode(n)}
            >
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: GROUPS[n.group].color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{n.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{n.preview}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      <div ref={containerRef} className="relative hidden min-h-0 flex-1 rounded-2xl border bg-card/40 backdrop-blur md:block">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="size-full p-2"
          role="group"
          aria-label="Architecture map"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="fill-muted-foreground" />
            </marker>
          </defs>

          {EDGES.map((e) => {
            const a = borderPoint(byId[e.from], byId[e.to]);
            const b = borderPoint(byId[e.to], byId[e.from], 8);
            const on = lit && lit.has(e.from) && lit.has(e.to) && (e.from === hover.node.id || e.to === hover.node.id);
            return (
              <g key={`${e.from}-${e.to}`} className={cn('transition-opacity', lit && !on && 'opacity-20')}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={on ? 'stroke-primary' : 'stroke-muted-foreground/60'}
                  strokeWidth={on ? 2 : 1.25}
                  strokeDasharray={e.dashed ? '5 5' : undefined}
                  markerEnd="url(#arrow)"
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                  paintOrder="stroke"
                  stroke="var(--background)"
                  strokeWidth={4}
                >
                  {e.label}
                </text>
              </g>
            );
          })}

          {NODES.map((n) => (
            <Node
              key={n.id}
              node={n}
              active={hover?.node.id === n.id}
              dimmed={lit && !lit.has(n.id)}
              onHover={onHover}
              onOpen={openNode}
            />
          ))}
        </svg>

        {hover && (
          <div
            className={cn(
              'pointer-events-none absolute z-10 w-60 -translate-x-1/2 rounded-xl border bg-popover p-3 text-xs shadow-xl animate-in fade-in-0 zoom-in-95',
              hover.flip && '-translate-y-[calc(100%+80px)]',
            )}
            style={{ left: hover.left, top: hover.top }}
            role="tooltip"
          >
            <p className="font-semibold">{hover.node.label}</p>
            <p className="mt-1 text-muted-foreground">{hover.node.preview}</p>
            <p className="mt-2 font-medium text-primary">Click for details →</p>
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border bg-popover p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        onClose={() => setOpen(null)}
        onClick={(e) => {
          // Clic en el fondo (fuera del contenido): el destino es el propio <dialog>.
          if (e.target === e.currentTarget) setOpen(null);
        }}
        aria-label={open ? `${open.label} details` : undefined}
      >
        {open && <Details node={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
      </dialog>
    </div>
  );
}
