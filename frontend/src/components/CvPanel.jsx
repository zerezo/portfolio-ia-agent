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
const STACK_PREVIEW = 4;

// "Entrenador: AI training coach on a custom MCP server" -> título "Entrenador" + subtítulo.
const splitName = (name) => {
  const [title, ...rest] = name.split(': ');
  return { title, subtitle: rest.join(': ') || null };
};

// Cabecera de tarjeta al estilo del dashboard: icono, título, descripción y acción a la derecha.
function Header({ icon: Icon, title, description, action }) {
  return (
    <CardHeader className="px-5">
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="size-4 text-primary" />
        {title}
      </CardTitle>
      {description && <CardDescription className="text-xs">{description}</CardDescription>}
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

function PageHeader({ basics, onOpenContact }) {
  const links = basics.links.filter((l) => HEADER_LINKS[l.id]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-brand-2 font-bold text-white md:hidden"
          aria-hidden="true"
        >
          {initials(basics.name)}
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">{basics.name}</h2>
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
        <Button size="sm" onClick={onOpenContact}>
          <CalendarDays /> Book a call
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={CV_PDF.en} download>
            <Download /> Download CV
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={CV_PDF.es} download hrefLang="es" aria-label="Download CV in Spanish">
            <Download /> CV en español
          </a>
        </Button>
        {links.map((l) => (
          <Button key={l.id} asChild size="sm" variant="ghost">
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

function AboutCard({ summary }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <Card className="gap-3 py-5">
      <Header
        icon={UserRound}
        title="About"
        action={
          <ExpandButton expanded={expanded} onClick={() => setExpanded(!expanded)} controls={id}>
            {expanded ? 'Less' : 'More'}
          </ExpandButton>
        }
      />
      <CardContent id={id} className="px-5">
        {summary.map((s) => (
          <p key={s.id} className={cn('text-sm leading-relaxed text-muted-foreground', !expanded && 'line-clamp-3')}>
            {s.text}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function ProjectTile({ project, onOpen }) {
  const Icon = PROJECT_ICONS[project.id] ?? FolderGit2;
  const { title, subtitle } = splitName(project.name);
  const rest = project.stack.length - STACK_PREVIEW;
  return (
    <li>
      <button
        type="button"
        className="group flex h-full w-full flex-col gap-3 rounded-lg border bg-background/60 p-4 text-left transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <div className="flex w-full items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block leading-snug font-semibold">{title}</span>
            {subtitle && <span className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          <Maximize2 className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </div>
        <span className="mt-auto flex flex-wrap gap-1">
          {project.stack.slice(0, STACK_PREVIEW).map((s) => (
            <Badge key={s} variant="secondary" className="font-normal">
              {s}
            </Badge>
          ))}
          {rest > 0 && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              +{rest}
            </Badge>
          )}
        </span>
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

function ProjectsCard({ projects }) {
  const [open, setOpen] = useState(null);
  const close = () => setOpen(null);
  return (
    <Card className="flex-1 gap-4 py-5">
      <Header
        icon={FolderGit2}
        title="Projects"
        description="Click a project to see how it was built"
        action={<Badge variant="outline">{projects.length}</Badge>}
      />
      <CardContent className="@container/projects flex-1 px-5">
        <ul className="grid h-full auto-rows-fr grid-cols-1 gap-3 @md/projects:grid-cols-2">
          {projects.map((p) => (
            <ProjectTile key={p.id} project={p} onOpen={() => setOpen(p)} />
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

function ExperienceCard({ experience }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const job = experience.find((j) => j.roles.some((r) => !r.end)) ?? experience[0];
  const role = job.roles.find((r) => !r.end) ?? job.roles[0];
  return (
    <Card className="gap-3 py-5">
      <Header
        icon={Briefcase}
        title="Experience"
        action={!role.end && <Badge className="bg-primary/10 text-primary">Current</Badge>}
      />
      <CardContent className="flex flex-col gap-3 px-5">
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

function SkillsCard({ skills }) {
  const [open, setOpen] = useState(false);
  const total = skills.reduce((n, g) => n + g.items.length, 0);
  return (
    <Card className="relative flex-1 gap-3 py-5 transition-all hover:border-primary/40 hover:shadow-md">
      <Header
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
      <CardContent className="flex flex-1 flex-col justify-center gap-4 px-5">
        {skills.map((g) => {
          const Icon = SKILL_ICONS[g.id] ?? Layers;
          return (
            <div key={g.id} className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{g.label}</p>
                <p className="truncate text-xs text-muted-foreground">{g.items.map((s) => s.name).join(' · ')}</p>
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

function EducationCard({ education, certifications }) {
  return (
    <Card className="gap-3 py-5">
      <Header icon={GraduationCap} title="Education" />
      <CardContent className="flex flex-col gap-3 px-5">
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
        <ul className="flex flex-col gap-1.5 border-t pt-3">
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

function PersonalCard({ languages, interests }) {
  return (
    <Card className="gap-3 py-5">
      <Header icon={Heart} title="Languages & interests" />
      <CardContent className="flex flex-wrap gap-1.5 px-5">
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
export default function CvPanel({ profile, onOpenContact }) {
  const { basics, summary, experience, skills, education, certifications, languages, interests } = profile;
  // Durante un despliegue la web puede llegar antes que la API: sin stack, una lista vacía.
  const projects = profile.projects.map((p) => ({ ...p, stack: p.stack ?? [] }));
  return (
    <div
      className="@container/cv flex flex-col gap-4 **:data-[slot=card]:bg-gradient-to-t **:data-[slot=card]:from-primary/5 **:data-[slot=card]:to-card **:data-[slot=card]:shadow-xs"
      aria-label="CV"
    >
      <PageHeader basics={basics} onOpenContact={onOpenContact} />
      {/* Las dos columnas acaban a la misma altura: Proyectos y Competencias absorben la diferencia. */}
      <div className="grid grid-cols-1 gap-4 *:flex *:min-w-0 *:flex-col *:gap-4 @3xl/cv:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <AboutCard summary={summary} />
          <ProjectsCard projects={projects} />
          <PersonalCard languages={languages} interests={interests} />
        </div>
        <div>
          <ExperienceCard experience={experience} />
          <SkillsCard skills={skills} />
          <EducationCard education={education} certifications={certifications} />
        </div>
      </div>
    </div>
  );
}
