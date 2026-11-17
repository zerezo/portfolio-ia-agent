import { useCallback, useEffect, useState } from 'react';

// Pestaña activa guardada en la URL (#cv, #calendar, #architecture): los enlaces y el botón
// "atrás" del navegador funcionan. Un hash desconocido vuelve a la primera pestaña. Lo que va
// tras la barra es una subpágina de la pestaña: #cv/entrenador = caso de estudio de Entrenador.
const parse = (ids) => {
  const [head, sub = null] = window.location.hash.slice(1).split('/');
  return ids.includes(head) ? { tab: head, sub } : { tab: ids[0], sub: null };
};

export function useHashTab(ids) {
  const [state, setState] = useState(() => parse(ids));

  useEffect(() => {
    const onChange = () => setState(parse(ids));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [ids]);

  const go = useCallback((id) => {
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
    else setState({ tab: id, sub: null });
  }, []);

  return [state.tab, go, state.sub];
}
