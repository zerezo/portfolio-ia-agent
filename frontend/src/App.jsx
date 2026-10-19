import { useCallback, useEffect, useState } from 'react';
import { getProfile } from './api.js';
import Chat from './components/Chat.jsx';
import ContactForm from './components/ContactForm.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import ProfilePanel from './components/ProfilePanel.jsx';
import Sections from './components/Sections.jsx';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, []);

  // El chat pide abrir el formulario: se desplaza hasta él y se enfoca el primer campo.
  const openContact = useCallback(() => {
    const section = document.getElementById('contact');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.querySelector('input, button')?.focus({ preventScroll: true });
  }, []);

  if (error) {
    return (
      <main className="page">
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page">
        <p className="loading" aria-live="polite">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <>
      <Header profile={profile} onContact={openContact} />
      <main className="page">
        <section className="hero" aria-label="Profile and assistant">
          <ProfilePanel profile={profile} />
          <Chat onOpenContact={openContact} />
        </section>
        <ContactForm />
        <Sections profile={profile} />
      </main>
      <Footer />
    </>
  );
}
