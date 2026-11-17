import { useId, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  Bike,
  Bot,
  BrainCircuit,
  Briefcase,
  CalendarDays,
  Car,
  ChevronDown,
  Code2,
  Download,
  ExternalLink,
  Footprints,
  FolderGit2,
  GraduationCap,
  Heart,
  Languages,
  Layers,
  MapPin,
  Maximize2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMonth, formatPeriod } from '../format.js';
import { CV_PDF } from '../links.js';
import Modal from './Modal.jsx';
import { initials } from './AppShell.jsx';

// Iconos por id del perfil (presentación; el contenido sale de /api/profile).
const PROJECT_ICONS = { portfolio: Bot, entrenador: Activity, homecargarage: Car, tfg: ShieldCheck };
const SKILL_ICONS = { 'skills-ai': BrainCircuit, 'skills-engineering': Code2, 'skills-cloud-security': ShieldCheck };
const INTEREST_ICONS = { 'interest-running': Footprints, 'interest-cycling': Bike, 'interest-football': Trophy };
const HEADER_LINKS = { linkedin: 'LinkedIn', github: 'GitHub' };

// Densidad (d): 0 = todo; cada nivel recorta lo menos importante y encoge las tarjetas, para que
// el CV quepa sin scroll en pantallas más bajas (la elige CvAgentView midiendo el contenido).
//   1: sin descripciones de tarjeta, About en 2 líneas, menos relleno, áreas sin lista.
//   2: sin About ni certificaciones (Formación pasa a la izquierda), cabecera compacta.
//   3: sin idiomas e intereses; proyectos en lista (una fila por proyecto con 2 tecnologías).
const STACK_PREVIEW = [4, 3, 2, 2];
const cardSize = (d) => (d === 0 ? 'gap-3 py-5' : 'gap-2 py-3.5');
const padX = (d) => (d === 0 ? 'px-5' : 'px-4');

// "Entrenador: AI training coach on a custom MCP server" -> título "Entrenador" + subtítulo.
const splitName = (name) => {
  const [title, ...rest] = name.split(': ');
  return { title, subtitle: rest.join(': ') || null };
};

// Cabecera de tarjeta al estilo del dashboard: icono, título, descripción y acción a la derecha.
function Header({ icon: Icon, title, description, action, d = 0 }) {
  return (
    <CardHeader className={padX(d)}>
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="size-4 text-primary" />
        {title}
      </CardTitle>
      {description && d === 0 && <CardDescription className="text-xs">{description}</CardDescription>}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  );
}

const Bullets = ({ items, className }) => (
  <ul className={cn('flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed marker:text-primary/60', className)}>
    {items.map((b) => (
      <li key={b.id}>{b.text}</li>
    ))}
  </ul>
);

function PageHeader({ basics, onOpenContact, d }) {
  const links = basics.links.filter((l) => HEADER_LINKS[l.id]);
  const size = d >= 2 ? 'xs' : 'sm';
  return (
    <div className={cn('flex flex-wrap items-center justify-between', d >= 2 ? 'gap-2' : 'gap-3')}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-brand-2 font-bold text-white md:hidden"
          aria-hidden="true"
        >
          {initials(basics.name)}
        </span>
        <div className="min-w-0">
          <h2 className={cn('font-bold tracking-tight', d >= 2 ? 'text-xl' : 'text-2xl')}>{basics.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
              <Sparkles /> {basics.headline}
            </Badge>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {basics.location}
            </span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size={size} className="transition-colors" onClick={onOpenContact}>
          <CalendarDays /> Book a call
        </Button>
        <Button asChild size={size} variant="outline" className="transition-colors">
          <a href={CV_PDF.en} download>
            <Download /> Download CV
          </a>
        </Button>
        <Button asChild size={size} variant="outline" className="transition-colors">
          <a href={CV_PDF.es} download hrefLang="es" aria-label="Download CV in Spanish">
            <Download /> {d >= 2 ? 'ES' : 'CV en español'}
          </a>
        </Button>
        {links.map((l) => (
          <Button key={l.id} asChild size={size} variant="ghost" className="transition-colors">
            <a href={l.url} target="_blank" rel="noreferrer">
              {HEADER_LINKS[l.id]} <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}

// Toggle accesible para los textos que se despliegan dentro de la tarjeta.
function ExpandButton({ expanded, onClick, controls, className, children }) {
  return (
    <Button variant="ghost" size="xs" className={className} onClick={onClick} aria-expanded={expanded} aria-controls={controls}>
      {children}
      <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
    </Button>
  );
}

function AboutCard({ summary, d }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <Card className={cardSize(d)}>
      <Header
        d={d}
        icon={UserRound}
        title="About"
        action={
          <ExpandButton expanded={expanded} onClick={() => setExpanded(!expanded)} controls={id}>
            {expanded ? 'Less' : 'More'}
          </ExpandButton>
        }
      />
      <CardContent id={id} className={padX(d)}>
        {summary.map((s) => (
          <p
            key={s.id}
            className={cn('text-sm leading-relaxed text-muted-foreground', !expanded && (d === 0 ? 'line-clamp-3' : 'line-clamp-2'))}
          >
            {s.text}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function ProjectTile({ project, onOpen, d }) {
  const Icon = PROJECT_ICONS[project.id] ?? FolderGit2;
  const { title, subtitle } = splitName(project.name);
  const preview = STACK_PREVIEW[d];
  const rest = project.stack.length - preview;
  const badges = (
    <>
      {project.stack.slice(0, preview).map((s) => (
        <Badge key={s} variant="secondary" className="font-normal">
          {s}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{rest}
        </Badge>
      )}
    </>
  );
  if (d >= 3) {
    return (
      <li>
        <button
          type="button"
          className="group flex w-full items-center gap-2.5 rounded-lg border bg-background/60 px-3 py-2 text-left transition-[color,background-color,border-color,box-shadow,translate] outline-none hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={onOpen}
          aria-haspopup="dialog"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          <span className="hidden shrink-0 gap-1 @sm/projects:flex">{badges}</span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className={cn(
          'group flex h-full w-full flex-col rounded-lg border bg-background/60 text-left transition-[color,background-color,border-color,box-shadow,translate] outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50',
          d === 0 ? 'gap-3 p-4' : 'gap-2 p-3',
        )}
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <div className="flex w-full items-start gap-3">
          <span
            className={cn('grid shrink-0 place-items-center rounded-lg bg-primary/10 text-primary', d === 0 ? 'size-9' : 'size-8')}
          >
            <Icon className={d === 0 ? 'size-5' : 'size-4'} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block leading-snug font-semibold', d >= 1 && 'line-clamp-2')}>{title}</span>
            {subtitle && <span className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          <Maximize2 className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </div>
        <span className="mt-auto flex flex-wrap gap-1">{badges}</span>
      </button>
    </li>
  );
}

function ProjectDetails({ project, onClose }) {
  return (
    <div className="flex flex-col gap-5">
      {project.stack.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Stack</h3>
          <ul className="flex flex-wrap gap-1.5">
            {project.stack.map((s) => (
              <li key={s}>
                <Badge variant="secondary">{s}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">What I built</h3>
        <Bullets items={project.bullets} />
      </section>
      {(project.links.length > 0 || project.caseStudy) && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {project.caseStudy && (
            <Button asChild size="sm">
              <a href={`#cv/${project.id}`} onClick={onClose}>
                Read the case study <ArrowRight />
              </a>
            </Button>
          )}
          {project.links.map((l) => (
            <Button key={l.url} asChild size="sm" variant="outline">
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label} <ExternalLink />
              </a>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsCard({ projects, d }) {
  const [open, setOpen] = useState(null);
  const close = () => setOpen(null);
  return (
    <Card className={cn('flex-1', d === 0 ? 'gap-4 py-5' : 'gap-2.5 py-3.5')}>
      <Header
        d={d}
        icon={FolderGit2}
        title="Projects"
        description="Click a project to see how it was built"
        action={<Badge variant="outline">{projects.length}</Badge>}
      />
      <CardContent className={cn('@container/projects flex-1', padX(d))}>
        <ul
          className={cn(
            d >= 3
              ? 'flex h-full flex-col justify-center gap-1.5'
              : 'grid h-full auto-rows-fr grid-cols-1 @md/projects:grid-cols-2',
            d === 0 ? 'gap-3' : d < 3 && 'gap-2',
          )}
        >
          {projects.map((p) => (
            <ProjectTile key={p.id} project={p} onOpen={() => setOpen(p)} d={d} />
          ))}
        </ul>
      </CardContent>
      <Modal
        open={Boolean(open)}
        onClose={close}
        title={open?.name}
        icon={open ? (PROJECT_ICONS[open.id] ?? FolderGit2) : undefined}
        description={open && [open.context, open.date].filter(Boolean).join(' · ')}
      >
        {open && <ProjectDetails project={open} onClose={close} />}
      </Modal>
    </Card>
  );
}

function ExperienceCard({ experience, d }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const job = experience.find((j) => j.roles.some((r) => !r.end)) ?? experience[0];
  const role = job.roles.find((r) => !r.end) ?? job.roles[0];
  return (
    <Card className={cardSize(d)}>
      <Header
        d={d}
        icon={Briefcase}
        title="Experience"
        action={!role.end && <Badge className="bg-primary/10 text-primary">Current</Badge>}
      />
      <CardContent className={cn('flex flex-col', d === 0 ? 'gap-3' : 'gap-1.5', padX(d))}>
        <div>
          <p className="leading-snug font-semibold">{role.title}</p>
          <p className="text-sm text-muted-foreground">{job.company}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3" /> Since {formatMonth(role.start)} · {job.location}
          </p>
        </div>
        <ExpandButton className="self-start" expanded={expanded} onClick={() => setExpanded(!expanded)} controls={id}>
          {expanded ? 'Hide career' : 'Career details'}
        </ExpandButton>
        <ol id={id} hidden={!expanded} className="ml-1 flex animate-in flex-col gap-4 border-l pl-4 fade-in-0 slide-in-from-top-1">
            {experience.flatMap((j) =>
              j.roles.map((r) => (
                <li key={r.id} className="relative flex flex-col gap-1">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-muted-foreground/40',
                      !r.end && 'bg-primary',
                    )}
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-snug font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.company} · {formatPeriod(r.start, r.end)}
                  </p>
                  {r.bullets.length > 0 && <Bullets items={r.bullets} className="mt-1 gap-1 text-xs text-muted-foreground" />}
                </li>
              )),
            )}
        </ol>
      </CardContent>
    </Card>
  );
}

function SkillsCard({ skills, d }) {
  const [open, setOpen] = useState(false);
  const total = skills.reduce((n, g) => n + g.items.length, 0);
  return (
    <Card className={cn('relative flex-1 transition-[color,background-color,border-color,box-shadow,translate] hover:border-primary/40 hover:shadow-md', cardSize(d))}>
      <Header
        d={d}
        icon={Layers}
        title="Skills"
        description={`${total} skills in ${skills.length} areas`}
        action={
          // El botón cubre toda la tarjeta (after:inset-0): se abre al pulsar en cualquier parte.
          <Button
            variant="ghost"
            size="icon-sm"
            className="after:absolute after:inset-0 after:rounded-xl"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label="Show all skills"
          >
            <Maximize2 />
          </Button>
        }
      />
      <CardContent className={cn('flex flex-1 flex-col', d === 0 ? 'justify-center gap-4' : 'justify-start gap-1.5', padX(d))}>
        {skills.map((g) => {
          const Icon = SKILL_ICONS[g.id] ?? Layers;
          return (
            <div key={g.id} className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground',
                  d === 0 ? 'size-8' : 'size-6',
                )}
              >
                <Icon className={d === 0 ? 'size-4' : 'size-3.5'} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{g.label}</p>
                {d === 0 && <p className="truncate text-xs text-muted-foreground">{g.items.map((s) => s.name).join(' · ')}</p>}
              </div>
              <Badge variant="outline">{g.items.length}</Badge>
            </div>
          );
        })}
      </CardContent>
      <Modal open={open} onClose={() => setOpen(false)} title="Skills" icon={Layers} description={`${total} skills in ${skills.length} areas`}>
        <div className="flex flex-col gap-5">
          {skills.map((g) => {
            const Icon = SKILL_ICONS[g.id] ?? Layers;
            return (
              <section key={g.id} className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-primary" /> {g.label}
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <Badge variant="secondary" className="font-normal">
                        {s.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Modal>
    </Card>
  );
}

function EducationCard({ education, certifications, d }) {
  return (
    <Card className={cardSize(d)}>
      <Header d={d} icon={GraduationCap} title="Education" />
      <CardContent className={cn('flex flex-col', d === 0 ? 'gap-3' : 'gap-2', padX(d))}>
        {education.map((e) => (
          <div key={e.id}>
            <p className="text-sm leading-snug font-semibold">{e.degree}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {e.institution} · {e.start.slice(0, 4)}–{e.end ? e.end.slice(0, 4) : 'now'}
              {e.note && (
                <Badge variant="outline" className="font-normal">
                  {e.note}
                </Badge>
              )}
            </p>
          </div>
        ))}
        <ul className={cn('flex flex-col gap-1.5 border-t', d === 0 ? 'pt-3' : 'pt-2')} hidden={d >= 2}>
          {certifications.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <Award className="mt-px size-3.5 shrink-0 text-brand-2" />
              {c.name}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PersonalCard({ languages, interests, d }) {
  return (
    <Card className={cardSize(d)}>
      <Header d={d} icon={Heart} title="Languages & interests" />
      <CardContent className={cn('flex flex-wrap gap-1.5', padX(d))}>
        {languages.map((l) => (
          <Badge key={l.id} variant="secondary" className="font-normal" title={l.level}>
            <Languages /> {l.name} · {l.level.split(/[;,–]/)[0].trim()}
          </Badge>
        ))}
        {interests.map((i) => {
          const Icon = INTEREST_ICONS[i.id] ?? Heart;
          return (
            <Badge key={i.id} variant="secondary" className="font-normal" title={i.text}>
              <Icon /> {i.label}
            </Badge>
          );
        })}
      </CardContent>
    </Card>
  );
}

// CV de la web en formato dashboard (estilo next-shadcn-dashboard-starter): tarjetas limpias que
// se amplían al pulsar (proyectos y competencias en una ventana, experiencia desplegable). Todo
// sale de /api/profile (backend/data/profile.yaml, solo lo verificado).
export default function CvPanel({ profile, onOpenContact, density = 0 }) {
  const d = Math.min(Math.max(density, 0), STACK_PREVIEW.length - 1);
  const { basics, summary, experience, skills, education, certifications, languages, interests } = profile;
  // Durante un despliegue la web puede llegar antes que la API: sin stack, una lista vacía.
  const projects = profile.projects.map((p) => ({ ...p, stack: p.stack ?? [] }));
  return (
    <div
      className={cn(
        '@container/cv flex flex-col **:data-[slot=card]:bg-gradient-to-t **:data-[slot=card]:from-primary/5 **:data-[slot=card]:to-card **:data-[slot=card]:shadow-xs',
        d === 0 ? 'gap-4' : 'gap-3',
      )}
      data-density={d}
      aria-label="CV"
    >
      <PageHeader basics={basics} onOpenContact={onOpenContact} d={d} />
      {/* Las dos columnas acaban a la misma altura: Proyectos y Competencias absorben la diferencia.
          Sin About (d >= 2), Formación pasa a la izquierda para equilibrar las columnas. */}
      <div
        className={cn(
          'grid grid-cols-1 *:flex *:min-w-0 *:flex-col @lg/cv:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @3xl/cv:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
          d === 0 ? 'gap-4 *:gap-4' : 'gap-3 *:gap-3',
        )}
      >
        <div>
          {d < 2 && <AboutCard summary={summary} d={d} />}
          <ProjectsCard projects={projects} d={d} />
          {d >= 2 && <EducationCard education={education} certifications={certifications} d={d} />}
          {d < 3 && <PersonalCard languages={languages} interests={interests} d={d} />}
        </div>
        <div>
          <ExperienceCard experience={experience} d={d} />
          <SkillsCard skills={skills} d={d} />
          {d < 2 && <EducationCard education={education} certifications={certifications} d={d} />}
        </div>
      </div>
    </div>
  );
}
