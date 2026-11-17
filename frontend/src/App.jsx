import { useCallback, useEffect, useState } from 'react';
import { getProfile } from './api.js';
import AppShell, { TABS } from './components/AppShell.jsx';
import EnvBanner from './components/EnvBanner.jsx';
import { useHashTab } from './hooks/useHashTab.js';
import ArchitectureView from './views/ArchitectureView.jsx';
import BookView from './views/BookView.jsx';
import CaseStudyView from './views/CaseStudyView.jsx';
import CvAgentView from './views/CvAgentView.jsx';

const TAB_IDS = TABS.map((t) => t.id);

export default function App() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [tab, goTo, sub] = useHashTab(TAB_IDS);

  useEffect(() => {
    getProfile()
      .then((data) => {
        // Durante un despliegue la web y la API se actualizan por separado (Cloudflare y Railway):
        // con un /api/profile de la versión anterior se avisa en vez de romper la página.
        if (data?.basics) setProfile(data);
        else setError('The site is being updated. Please reload the page in a minute.');
      })
      .catch((err) => setError(err.message));
  }, []);

  // El chat pide abrir el formulario: se cambia a la pestaña del calendario.
  const openContact = useCallback(() => goTo('calendar'), [goTo]);

  let content;
  if (error) {
    content = (
      <p className="m-4 rounded-md bg-destructive/10 p-3 text-destructive" role="alert">
        {error}
      </p>
    );
  } else if (!profile) {
    content = (
      <p className="m-4 text-muted-foreground" aria-live="polite">
        Loading…
      </p>
    );
  } else {
    // #cv/<id>: caso de estudio de un proyecto, si lo tiene (si no, el CV).
    const study = tab === 'cv' && sub ? profile.projects.find((p) => p.id === sub && p.caseStudy) : null;
    content = (
      <AppShell profile={profile} tab={tab} onTab={goTo}>
        {study && <CaseStudyView project={study} />}
        {tab === 'cv' && !study && <CvAgentView profile={profile} onOpenContact={openContact} />}
        {tab === 'calendar' && <BookView />}
        {tab === 'architecture' && <ArchitectureView />}
      </AppShell>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <EnvBanner />
      {content}
    </div>
  );
}
