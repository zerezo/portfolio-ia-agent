import { formatPeriod } from './format.js';

// Textos para LinkedIn (vista "linkedin" del perfil). LinkedIn no permite editar el perfil por
// API: el resultado es Markdown con bloques listos para copiar y pegar, para Alejandro (las
// etiquetas van en español; el contenido, en el idioma del archivo).

// Límites de LinkedIn (comprobados en 2026-11 en guías recientes; LinkedIn los cambia a veces).
// El de la descripción de proyecto no aparece en ninguna fuente: se asume el de los puestos.
export const LIMITS = { headline: 220, about: 2600, positionTitle: 100, description: 2000, projectDescription: 2000 };

const block = (text) => `\`\`\`text\n${text}\n\`\`\``;
const bulletList = (items) => items.map((b) => `• ${b.text}`).join('\n');
const PENDING = '⚠️ Pendiente de revisar o de escribir (npm run profile:review).';

export function linkedinMarkdown(view) {
  const { lang, linkedin } = view;
  const warnings = [];
  const count = (label, text, limit) => {
    const n = [...text].length;
    if (n > limit) warnings.push(`${label}: ${n}/${limit} caracteres`);
    return n > limit ? `⚠️ ${n}/${limit}, se pasa del límite` : `${n}/${limit}`;
  };

  const out = [
    `# LinkedIn (${lang.toUpperCase()})`,
    '',
    '> Generado desde `backend/data/profile.yaml` con `npm run linkedin`. No lo edites a mano: edita el perfil',
    '> y vuelve a generarlo. Cada bloque es texto plano listo para pegar (LinkedIn no interpreta Markdown).',
    '> Lo pendiente de revisar (verified: false) no aparece aquí.',
    '',
  ];

  out.push(`## Titular · ${linkedin?.headline ? count('Titular', linkedin.headline, LIMITS.headline) : 'falta'}`, '');
  out.push(linkedin?.headline ? block(linkedin.headline) : PENDING, '');

  const about = (linkedin?.about ?? []).join('\n\n');
  out.push(`## Acerca de · ${about ? count('Acerca de', about, LIMITS.about) : 'falta'}`, '');
  out.push(about ? block(about) : PENDING, '');

  out.push(`### Aptitudes principales (${linkedin?.topSkills.length ?? 0}/5)`, '');
  out.push(...(linkedin?.topSkills ?? []).map((s) => `- ${s}`), '');

  out.push('## Experiencia', '');
  for (const job of view.experience) {
    for (const role of job.roles) {
      const description = bulletList(role.bullets);
      out.push(
        `### ${role.title} · ${job.company}`,
        '',
        `- Cargo: ${role.title} (${count(`Cargo "${role.title}"`, role.title, LIMITS.positionTitle)})`,
        `- Empresa: ${job.company}`,
        `- Ubicación: ${job.location}`,
        `- Fechas: ${formatPeriod(role.start, role.end, lang)}`,
        `- Descripción · ${count(`Descripción de "${role.title}"`, description, LIMITS.description)}`,
        '',
        block(description),
        '',
      );
    }
  }

  out.push('## Proyectos', '');
  for (const project of view.projects) {
    const description = [project.context, bulletList(project.bullets)].filter(Boolean).join('\n');
    out.push(
      `### ${project.name}`,
      '',
      ...(project.date ? [`- Fechas: ${project.date}`] : []),
      ...(project.links[0] ? [`- URL: ${project.links[0].url}`] : []),
      `- Descripción · ${count(`Proyecto "${project.name}"`, description, LIMITS.projectDescription)}`,
      '',
      block(description),
      '',
    );
  }

  out.push('## Formación', '');
  for (const e of view.education) {
    out.push(`- ${e.institution}: ${e.degree} (${e.start}–${e.end ?? ''})${e.note ? `. ${e.note}` : ''}`);
  }
  out.push('', '## Licencias y certificaciones', '', ...view.certifications.map((c) => `- ${c.name}`), '');

  return { markdown: `${out.join('\n').trimEnd()}\n`, warnings };
}
