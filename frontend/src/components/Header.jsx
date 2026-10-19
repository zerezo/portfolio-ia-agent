export default function Header({ profile, onContact }) {
  const { name, headline, location } = profile.profile;
  return (
    <header className="header">
      <div className="header-inner">
        <div>
          <h1 className="name">{name}</h1>
          <p className="headline">{headline}</p>
          <p className="location">{location}</p>
        </div>
        <nav className="header-actions" aria-label="Contact">
          <a className="button button-secondary" href={profile.contact.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <button type="button" className="button" onClick={onContact}>
            Get in touch
          </button>
        </nav>
      </div>
    </header>
  );
}
