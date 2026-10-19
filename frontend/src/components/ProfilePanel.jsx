import { formatMonth } from '../format.js';

// Resumen del CV junto al chat: lo esencial de un vistazo. El detalle va más abajo.
export default function ProfilePanel({ profile }) {
  const current = profile.experience.find((e) => !e.end);
  const degree = profile.education[0];

  return (
    <article className="panel profile-panel">
      <h2 className="panel-title">About</h2>
      <p className="summary">{profile.profile.summary}</p>

      <dl className="facts">
        {current && (
          <>
            <dt>Current role</dt>
            <dd>
              {current.role}
              <span className="muted">
                {' '}
                · {current.company} · since {formatMonth(current.start)}
              </span>
            </dd>
          </>
        )}
        {degree && (
          <>
            <dt>Education</dt>
            <dd>
              {degree.degree}
              <span className="muted"> · {degree.institution}</span>
            </dd>
          </>
        )}
        <dt>Languages</dt>
        <dd>{profile.languages.map((l) => `${l.language} (${l.level.split(',')[0]})`).join(' · ')}</dd>
      </dl>

      <h3 className="subtitle">Skills</h3>
      <ul className="tags">
        {profile.skills.map((skill) => (
          <li key={skill}>{skill}</li>
        ))}
      </ul>

      <h3 className="subtitle">Certifications</h3>
      <ul className="tags">
        {profile.certifications.map((c) => (
          <li key={c.name}>{c.name}</li>
        ))}
      </ul>
    </article>
  );
}
