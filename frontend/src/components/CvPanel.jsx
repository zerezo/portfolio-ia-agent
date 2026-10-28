import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatMonth, formatPeriod } from '../format.js';

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

// CV completo en un panel: resumen, experiencia, proyectos, formación, idiomas e intereses.
export default function CvPanel({ profile }) {
  const { name, headline, location, summary } = profile.profile;
  const current = profile.experience.find((e) => !e.end);

  return (
    <article className="flex flex-col gap-6 text-sm" aria-label="CV">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{name}</h2>
        <p className="text-muted-foreground">{headline}</p>
        <p className="text-xs text-muted-foreground">
          {location}
          {current && ` · ${current.role} since ${formatMonth(current.start)}`}
        </p>
      </header>

      <p className="leading-relaxed">{summary}</p>

      <Section title="Skills">
        <ul className="flex flex-wrap gap-1.5">
          {profile.skills.map((skill) => (
            <li key={skill}>
              <Badge variant="secondary">{skill}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Separator />

      <Section title="Experience">
        <ol className="flex flex-col gap-4 border-l pl-4">
          {profile.experience.map((e) => (
            <li key={`${e.company}-${e.role}`} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h4 className="font-medium">{e.role}</h4>
                <span className="text-xs text-muted-foreground">{formatPeriod(e.start, e.end)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.company} · {e.location}
              </p>
              <p className="leading-relaxed">{e.description}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Separator />

      <Section title="Projects">
        <ul className="flex flex-col gap-3">
          {profile.projects.map((p) => (
            <li key={p.name} className="flex flex-col gap-1 rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium">{p.name}</h4>
                <Badge variant={p.status === 'in progress' ? 'default' : 'outline'}>{p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{p.type}</p>
              <p className="leading-relaxed">{p.description}</p>
              {p.url && (
                <a className="text-primary hover:underline" href={p.url} target="_blank" rel="noreferrer">
                  View source
                </a>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Separator />

      <Section title="Education">
        {profile.education.map((e) => (
          <div key={e.degree}>
            <h4 className="font-medium">{e.degree}</h4>
            <p className="text-xs text-muted-foreground">
              {e.institution} · {formatPeriod(e.start, e.end)}
            </p>
          </div>
        ))}
      </Section>

      <Section title="Certifications">
        <ul className="flex flex-wrap gap-1.5">
          {profile.certifications.map((c) => (
            <li key={c.name}>
              <Badge variant="outline">{c.name}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Languages">
        <ul className="flex flex-col gap-1">
          {profile.languages.map((l) => (
            <li key={l.language}>
              <span className="font-medium">{l.language}</span>
              <span className="text-muted-foreground"> · {l.level}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Separator />

      <Section title="Outside work">
        <ul className="flex flex-col gap-3">
          {profile.interests.map((i) => (
            <li key={i.topic}>
              <h4 className="font-medium">{i.topic}</h4>
              <p className="leading-relaxed">{i.description}</p>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
