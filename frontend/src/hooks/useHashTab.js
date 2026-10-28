import { useCallback, useEffect, useState } from 'react';

// Pestaña activa guardada en la URL (#cv, #calendar, #architecture): los enlaces y el botón
// "atrás" del navegador funcionan. Un hash desconocido vuelve a la primera pestaña.
export function useHashTab(ids) {
  const read = useCallback(() => {
    const hash = window.location.hash.slice(1);
    return ids.includes(hash) ? hash : ids[0];
  }, [ids]);

  const [tab, setTab] = useState(read);

  useEffect(() => {
    const onChange = () => setTab(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [read]);

  const go = useCallback((id) => {
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
    else setTab(id);
  }, []);

  return [tab, go];
}
