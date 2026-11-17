import { ArrowRight, CalendarDays, Download, GraduationCap, MapPin, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatPeriod } from '../format.js';
import { CV_PDF } from '../links.js';
import { initials } from './AppShell.jsx';

const EMOJI = { running: '🏃', cycling: '🚴', football: '⚽' };
const emoji = (label) => EMOJI[label.toLowerCase()] ?? '✨';
const year = (value) => (value ? value.slice(0, 4) : 'now');
// Enlaces de la cabecera: la propia web no se enlaza a sí misma.
const HEADER_LINKS = { linkedin: 'LinkedIn', github: 'GitHub' };

function Tile({ title, className, children }) {
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2 rounded-2xl border bg-card/70 p-3.5 backdrop-blur', className)}
      aria-label={title}
    >
      {title && <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>}
      {children}
    </section>
  );
}

const Chip = ({ children, className }) => (
  <li className={cn('rounded-full bg-muted px-2.5 py-0.5 text-xs', className)}>{children}</li>
);

const Bullets = ({ items }) => (
  <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground marker:text-primary/60">
    {items.map((b) => (
      <li key={b.id}>{b.text}</li>
    ))}
  </ul>
);

const External = ({ href, children, className }) => (
  <a className={cn('hover:text-primary hover:underline', className)} href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

function Project({ project }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border bg-background/40 p-3">
      <div className="flex items-baseline gap-2">
        <h4 className="min-w-0 flex-1 font-semibold leading-snug">{project.name}</h4>
        {project.date && <span className="shrink-0 text-[11px] text-muted-foreground">{project.date}</span>}
      </div>
      {project.context && <p className="text-xs font-medium text-primary">{project.context}</p>}
      <Bullets items={project.bullets} />
      {(project.links.length > 0 || project.caseStudy) && (
        <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
          {project.caseStudy && (
            <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={`#cv/${project.id}`}>
              Case study <ArrowRight className="size-3" />
            </a>
          )}
          {project.links.map((l) => (
            <External key={l.url} href={l.url} className="text-muted-foreground">
              {l.label} ↗
            </External>
          ))}
        </p>
      )}
    </li>
  );
}

function Job({ job }) {
  return (
    <li className="flex flex-col gap-2">
      <div>
        <p className="font-semibold leading-snug">
          {job.company}
          {job.companyNote && <span className="font-normal text-muted-foreground"> ({job.companyNote})</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {[job.location, job.note].filter(Boolean).join(' · ')}
        </p>
      </div>
      <ol className="flex flex-col gap-2.5 border-l pl-3">
        {job.roles.map((role) => (
          <li key={role.id} className="relative flex flex-col gap-1">
            <span
              className={cn(
                'absolute top-1.5 -left-[16.5px] size-2 rounded-full bg-muted-foreground/40',
                !role.end && 'bg-primary',
              )}
              aria-hidden="true"
            />
            <p className="font-medium leading-snug">
              {role.title} <span className="text-xs font-normal text-muted-foreground">· {formatPeriod(role.start, role.end)}</span>
            </p>
            {role.bullets.length > 0 && <Bullets items={role.bullets} />}
          </li>
        ))}
      </ol>
    </li>
  );
}

// CV de la web, generado desde backend/data/profile.yaml (vía /api/profile, solo lo verificado).
// Orden: cabecera, About, Projects, Experience, Skills, Education y lo personal. El panel hace
// scroll dentro de su mitad; la página no.
export default function CvPanel({ profile, onOpenContact }) {
  const { basics, summary, projects, experience, skills, education, certifications, languages, interests } = profile;
  const links = basics.links.filter((l) => HEADER_LINKS[l.id]);

  return (
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2" aria-label="CV">
      <Tile className="col-span-full gap-3">
        <div className="flex items-center gap-4">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-brand-2 text-lg font-bold text-white md:hidden"
            aria-hidden="true"
          >
            {initials(basics.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
              {basics.name}
            </h2>
            <p className="font-medium">{basics.headline}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {basics.location}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="rounded-full" onClick={onOpenContact}>
            <CalendarDays /> Book a call
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={CV_PDF.en} download>
              <Download /> Download CV
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={CV_PDF.es} download hrefLang="es" aria-label="Download CV in Spanish">
              <Download /> CV en español
            </a>
          </Button>
          {links.map((l) => (
            <Button key={l.id} asChild size="sm" variant="ghost" className="rounded-full">
              <a href={l.url} target="_blank" rel="noreferrer">
                {HEADER_LINKS[l.id]} ↗
              </a>
            </Button>
          ))}
        </div>
      </Tile>

      <Tile title="About" className="col-span-full">
        {summary.map((s) => (
          <p key={s.id} className="leading-relaxed text-muted-foreground">
            {s.text}
          </p>
        ))}
      </Tile>

      <Tile title="Projects" className="col-span-full">
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {projects.map((p) => (
            <Project key={p.id} project={p} />
          ))}
        </ul>
      </Tile>

      <Tile title="Experience" className="col-span-full">
        <ol className="flex flex-col gap-4">
          {experience.map((job) => (
            <Job key={job.id} job={job} />
          ))}
        </ol>
      </Tile>

      <Tile title="Skills">
        {skills.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium">{group.label}</p>
            <ul className="flex flex-wrap gap-1.5">
              {group.items.map((s) => (
                <Chip key={s.id}>{s.name}</Chip>
              ))}
            </ul>
          </div>
        ))}
      </Tile>

      <Tile title="Education & certifications">
        {education.map((e) => (
          <div key={e.id}>
            <p className="flex items-start gap-1.5 font-semibold leading-snug">
              <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
              {e.degree}
            </p>
            <p className="pl-5.5 text-xs text-muted-foreground">
              {e.institution} · {year(e.start)}–{year(e.end)}
              {e.note && ` · ${e.note}`}
            </p>
          </div>
        ))}
        <ul className="mt-1 flex flex-col gap-1">
          {certifications.map((c) => (
            <li key={c.id} className="flex items-start gap-1.5 text-xs">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-brand-2" />
              {c.name}
            </li>
          ))}
        </ul>
      </Tile>

      <Tile title="Languages & interests" className="col-span-full">
        <ul className="flex flex-wrap gap-1.5">
          {languages.map((l) => (
            <Chip key={l.id}>
              💬 {l.name} · {l.level.split(/[;,]/)[0]}
            </Chip>
          ))}
          {interests.map((i) => (
            <Chip key={i.id}>
              <span aria-hidden="true">{emoji(i.label)}</span> {i.text}
            </Chip>
          ))}
        </ul>
      </Tile>
    </div>
  );
}
