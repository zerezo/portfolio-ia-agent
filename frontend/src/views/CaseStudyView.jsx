import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

// Títulos de las secciones, en el orden del caso de estudio (backend/profile/schema.js).
const TITLES = {
  problem: 'Problem',
  architecture: 'Architecture',
  tools: 'Tools',
  keyDecision: 'Key decision',
  evals: 'Evals',
  next: "What I'd do next",
};

// Caso de estudio de un proyecto (#cv/<id>). Solo trae las secciones verificadas: el resto
// no llega en /api/profile.
export default function CaseStudyView({ project }) {
  const heading = useRef(null);
  // Al abrir el caso, el foco va al título (lectores de pantalla y teclado).
  useEffect(() => heading.current?.focus(), [project.id]);

  return (
    <div className="h-full overflow-y-auto p-3 md:p-6">
      <article className="mx-auto flex max-w-3xl flex-col gap-4 text-sm">
        <a className="inline-flex w-fit items-center gap-1 text-muted-foreground hover:text-foreground" href="#cv">
          <ArrowLeft className="size-4" /> Back to the CV
        </a>
        <header className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Case study</p>
          <h2
            ref={heading}
            tabIndex={-1}
            className="bg-gradient-to-r from-primary to-brand-2 bg-clip-text text-2xl font-bold tracking-tight text-transparent outline-none"
          >
            {project.name}
          </h2>
          <p className="text-muted-foreground">{[project.context, project.date].filter(Boolean).join(' · ')}</p>
        </header>
        {project.caseStudy.sections.map((section) => (
          <section key={section.key} className="flex flex-col gap-2 rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{TITLES[section.key]}</h3>
            {section.paragraphs.map((text) => (
              <p key={text} className="leading-relaxed">
                {text}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
