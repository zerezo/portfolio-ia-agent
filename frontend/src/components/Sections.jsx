import { formatPeriod } from '../format.js';

// Detalle del CV debajo del formulario: experiencia, proyectos, formación e intereses.
export default function Sections({ profile }) {
  return (
    <>
      <section className="section" aria-labelledby="experience-title">
        <h2 id="experience-title" className="section-title">
          Experience
        </h2>
        <ol className="timeline">
          {profile.experience.map((e) => (
            <li key={`${e.company}-${e.role}`} className="timeline-item">
              <div className="timeline-head">
                <h3>{e.role}</h3>
                <span className="muted small">{formatPeriod(e.start, e.end)}</span>
              </div>
              <p className="muted">
                {e.company} · {e.location}
              </p>
              <p>{e.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="projects-title">
        <h2 id="projects-title" className="section-title">
          Projects
        </h2>
        <ul className="cards">
          {profile.projects.map((p) => (
            <li key={p.name} className="card">
              <div className="card-head">
                <h3>{p.name}</h3>
                <span className={`badge ${p.status === 'in progress' ? 'badge-active' : ''}`}>{p.status}</span>
              </div>
              <p className="muted small">{p.type}</p>
              <p>{p.description}</p>
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer">
                  View source
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="section columns" aria-label="Education, languages and interests">
        <div>
          <h2 className="section-title">Education</h2>
          {profile.education.map((e) => (
            <div key={e.degree} className="entry">
              <h3>{e.degree}</h3>
              <p className="muted">
                {e.institution} · {formatPeriod(e.start, e.end)}
              </p>
            </div>
          ))}
          <h2 className="section-title">Languages</h2>
          <ul className="plain">
            {profile.languages.map((l) => (
              <li key={l.language}>
                <strong>{l.language}</strong> <span className="muted">· {l.level}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="section-title">Outside work</h2>
          <ul className="plain">
            {profile.interests.map((i) => (
              <li key={i.topic} className="entry">
                <h3>{i.topic}</h3>
                <p>{i.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
