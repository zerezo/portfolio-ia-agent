import { useCallback, useEffect, useState } from 'react';
import { getProfile } from './api.js';
import AppShell, { TABS } from './components/AppShell.jsx';
import EnvBanner from './components/EnvBanner.jsx';
import { useHashTab } from './hooks/useHashTab.js';
import ArchitectureView from './views/ArchitectureView.jsx';
import BookView from './views/BookView.jsx';
import CvAgentView from './views/CvAgentView.jsx';

const TAB_IDS = TABS.map((t) => t.id);

export default function App() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [tab, goTo] = useHashTab(TAB_IDS);

  useEffect(() => {
    getProfile()
      .then(setProfile)
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
    content = (
      <AppShell profile={profile} tab={tab} onTab={goTo}>
        {tab === 'cv' && <CvAgentView profile={profile} onOpenContact={openContact} />}
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
