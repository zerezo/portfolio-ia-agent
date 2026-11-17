import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Ventana con <dialog> nativo (la CSP no permite los componentes de Radix que inyectan
// <style>). Esc, la X o un clic fuera la cierran; al abrirse "crece" (zoom-in de tw-animate).
export default function Modal({ open, onClose, title, icon: Icon, description, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="m-auto max-h-[min(48rem,calc(100dvh-2rem))] w-[min(46rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover p-0 text-popover-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:animate-in open:flex-col open:fade-in-0 open:zoom-in-90 open:duration-200"
      onClose={onClose}
      onClick={(e) => {
        // Clic en el fondo (fuera del contenido): el destino es el propio <dialog>.
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      {open && (
        <>
          <header className="flex items-start gap-3 border-b p-5">
            {Icon && (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-snug font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </header>
          <div className="min-h-0 overflow-y-auto p-5">{children}</div>
        </>
      )}
    </dialog>
  );
}
