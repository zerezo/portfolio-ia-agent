import { useEffect, useLayoutEffect, useState } from 'react';

// ¿Cumple la ventana la media query? Se actualiza al cambiar el tamaño.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Densidad que hace caber el contenido de `ref` sin scroll: empieza en 0 (todo) y, mientras el
// contenido desborde, sube un nivel (menos información, tarjetas más pequeñas) hasta `max`. Se
// mide en useLayoutEffect, antes de pintar, así que no hay parpadeo. Al cambiar el tamaño del
// contenedor (ventana, banner, zoom) vuelve a empezar desde 0. Lo que el visitante despliega a
// mano (la carrera, el About) no cambia el tamaño del contenedor: eso sí puede hacer scroll.
// El contenedor debe tener `scrollbar-gutter: stable`, para que la barra de scroll no cambie su
// ancho y provoque otra medida.
export function useFitDensity(ref, { max, enabled }) {
  // run: nueva medida desde 0; check: comprobación tardía que solo puede subir el nivel.
  const [state, setState] = useState({ level: 0, run: 0, check: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el || el.clientHeight === 0) return;
    if (el.scrollHeight > el.clientHeight + 1 && state.level < max) {
      setState((s) => ({ ...s, level: s.level + 1 }));
    }
  }, [state, enabled, max, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;
    let last = '';
    let alive = true;
    let timer;
    // Red de seguridad: si algo cambia de tamaño sin que se note (una transición, una imagen), se
    // vuelve a comprobar poco después; solo sube el nivel, nunca vuelve a 0.
    const refit = () => {
      setState((s) => ({ ...s, level: 0, run: s.run + 1 }));
      clearTimeout(timer);
      timer = setTimeout(() => alive && setState((s) => ({ ...s, check: s.check + 1 })), 350);
    };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const key = `${Math.round(width)}x${Math.round(height)}`;
      if (key !== last) {
        last = key;
        refit();
      }
    });
    observer.observe(el);
    // La fuente web cambia las medidas al cargar (fonts.ready puede resolverse antes de que empiece
    // a cargar: también se escucha cada carga terminada).
    document.fonts?.ready.then(() => alive && refit());
    document.fonts?.addEventListener('loadingdone', refit);
    return () => {
      alive = false;
      clearTimeout(timer);
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', refit);
    };
  }, [enabled, ref]);

  return state.level;
}
