import { profileView } from './profile/view.js';

// Herramientas del agente. Cada una: { name, description, inputSchema, run(input) -> texto }.
// La definición es neutral; cada adaptador de llm.js la traduce al formato de su proveedor.
// La web está en inglés: descripciones, resultados y CV también, para que el modelo trabaje
// en un solo idioma.

// Cubre una sección completa (4 proyectos, 5 puestos) sin inflar el contexto.
const MAX_RESULTS = 6;

// Minúsculas y sin tildes, para que "Behobia" o "Politécnica" se encuentren igual.
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Palabras vacías (inglés y algo de español) que no aportan a la búsqueda.
const STOPWORDS = new Set(
  (
    'the a an and or of in on at to for with by from is are was were be been has have had does do did ' +
    'he his him what which who where when how about any some it its this that as can could tell me ' +
    'before after then than into also just only very there their they them we you your ' +
    'de la el en y los las del un una con por para que su sus al lo es tiene ha sobre como'
  ).split(' '),
);

export const tokenize = (text) =>
  normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

// Nombres visibles de las secciones del caso de estudio (profile.yaml).
const CASE_STUDY_TITLES = {
  problem: 'Problem',
  architecture: 'Architecture',
  tools: 'Tools',
  keyDecision: 'Key decision',
  evals: 'Evals',
  next: 'What comes next',
};
const LINK_NAMES = { website: 'Website', github: 'GitHub', linkedin: 'LinkedIn' };
// Etiquetas en español de cada sección: el CV está en inglés y los modelos pequeños buscan a
// veces con la pregunta tal cual ("¿dónde vive?"). Misma idea que las etiquetas bilingües de knowledge/.
const ES_TAGS = {
  profile: ['perfil', 'resumen', 'donde', 'vive', 'ubicacion', 'ahora', 'actualmente', 'puesto', 'encaje'],
  contact: ['enlaces', 'contacto'],
  skills: ['competencias', 'habilidades', 'tecnologias'],
  languages: ['idiomas', 'ingles', 'espanol'],
  experience: ['experiencia', 'trabajo', 'empresa', 'clientes'],
  education: ['formacion', 'estudios', 'carrera', 'universidad'],
  certifications: ['certificaciones', 'certificados'],
  projects: ['proyectos', 'construido'],
  interests: ['aficiones', 'tiempo libre', 'deportes'],
};
const sentence = (parts) => parts.filter(Boolean).join(' ');

// Convierte la vista del agente (profile/view.js: solo lo verificado y del canal "agent") en
// fragmentos de texto autocontenidos: la unidad de búsqueda.
export function buildCvChunks(cv) {
  const { basics } = cv;
  const chunks = [
    {
      section: 'profile',
      text: sentence([`${basics.name}. ${basics.headline}. Based in ${basics.location}.`, ...cv.summary.map((s) => s.text)]),
      tags: ['about', 'summary', 'current job', 'work', 'role', 'fit', 'background'],
    },
    {
      section: 'contact',
      text: `${basics.links.map((l) => `${LINK_NAMES[l.id] ?? l.label}: ${l.url}`).join('. ')}.`,
      tags: ['links', 'contact'],
    },
    ...cv.skills.map((group) => ({
      section: 'skills',
      text: `Skills, ${group.label}: ${group.items.map((s) => s.name).join(', ')}.`,
      tags: [...group.tags, 'technologies', 'stack', 'tools'],
    })),
    {
      section: 'languages',
      text: `Languages: ${cv.languages.map((l) => `${l.name} (${l.level})`).join(', ')}.`,
      tags: ['english', 'spanish'],
    },
  ];

  for (const job of cv.experience) {
    const company = job.companyNote ? `${job.company} (${job.companyNote})` : job.company;
    for (const role of job.roles) {
      const where = [`${role.start} - ${role.end ?? 'present'}`, job.location, job.note].filter(Boolean).join(', ');
      chunks.push({
        section: 'experience',
        text: sentence([`${role.title} at ${company} (${where}).`, ...role.bullets.map((b) => b.text)]),
        tags: [...role.tags, 'work', 'job'],
      });
    }
  }
  for (const e of cv.education) {
    chunks.push({
      section: 'education',
      text: sentence([`${e.degree}, ${e.institution} (${e.start} - ${e.end ?? 'present'}).`, e.note && `${e.note}.`]),
      tags: [...e.tags, 'degree', 'university', 'studies'],
    });
  }
  for (const c of cv.certifications) {
    chunks.push({ section: 'certifications', text: `Certification: ${c.name}.`, tags: c.tags });
  }
  for (const p of cv.projects) {
    const about = [p.context, p.date].filter(Boolean).join(', ');
    chunks.push({
      section: 'projects',
      text: sentence([
        `Project: ${p.name}${about ? ` (${about})` : ''}.`,
        ...p.bullets.map((b) => b.text),
        ...p.links.map((l) => l.url),
      ]),
      tags: [...p.tags, 'built', 'side project'],
    });
    if (p.caseStudy) {
      chunks.push({
        section: 'projects',
        text: sentence([
          `Case study of the project ${p.name}.`,
          ...p.caseStudy.sections.map((s) => `${CASE_STUDY_TITLES[s.key]}: ${s.paragraphs.join(' ')}`),
        ]),
        tags: [...p.tags, 'case study'],
      });
    }
  }
  for (const i of cv.interests) {
    chunks.push({
      section: 'interests',
      text: `Hobbies and free time, ${i.label}: ${i.text}.`,
      tags: [...i.tags, 'hobbies', 'spare time', 'personal'],
    });
  }

  return indexChunks(chunks.map((c) => ({ ...c, tags: [...(c.tags ?? []), ...ES_TAGS[c.section]] })));
}

// Índice de palabras precalculado: sección + texto + etiquetas. Lo comparten el CV y la
// herramienta de conocimiento (knowledge.js).
export const indexChunks = (chunks) =>
  chunks.map((chunk) => ({
    ...chunk,
    words: new Set(tokenize(`${chunk.section} ${chunk.text} ${(chunk.tags ?? []).join(' ')}`)),
  }));

// Coincidencia por prefijo: "certification" encuentra "certifications". Las palabras de 1-2
// letras solo coinciden exactas, en ambos sentidos: "it" (IT) no encuentra "items" ni "hi"
// encuentra "high".
const matches = (chunk, term) =>
  [...chunk.words].some(
    (w) => w === term || (term.length >= 3 && w.startsWith(term)) || (w.length >= 3 && term.startsWith(w)),
  );

// Búsqueda por palabras clave (decisión v2.0: sin embeddings mientras el corpus sea pequeño).
export function searchChunks(chunks, query, maxResults = MAX_RESULTS) {
  // Las palabras raras pesan más (tipo IDF): en "DORA experience", DORA aparece en un
  // fragmento y experience en cinco, así que el fragmento de DORA queda primero.
  const weights = tokenize(query).map((term) => {
    const df = chunks.filter((chunk) => matches(chunk, term)).length;
    return { term, weight: df ? Math.log(1 + chunks.length / df) : 0 };
  });

  return chunks
    .map((chunk) => ({
      chunk,
      score: weights.reduce((sum, { term, weight }) => sum + (matches(chunk, term) ? weight : 0), 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ chunk }) => chunk);
}

// profile: el perfil cargado (profile/load.js). La herramienta solo ve lo publicable en el canal
// "agent" y en inglés: lo pendiente de revisar (verified: false) no llega nunca al modelo.
export function createCvTool(profile) {
  const chunks = buildCvChunks(profileView(profile, { channel: 'agent', lang: 'en' }));
  const sections = [...new Set(chunks.map((c) => c.section))];

  return {
    name: 'search_cv',
    // Para la búsqueda forzada de app.js: ¿encuentra algo esta consulta?
    hasResults: (query) => searchChunks(chunks, query).length > 0,
    description:
      "Searches the CV of the portfolio's owner: profile, experience, education, skills, certifications, " +
      'languages, projects, personal interests and contact. Always use it before answering any question ' +
      'about him. The query should be specific keywords, for example "DORA certifications" or "sports".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords describing what to look for.' },
      },
      required: ['query'],
    },
    run({ query }) {
      if (typeof query !== 'string' || query.trim() === '') {
        return 'Error: the "query" parameter must be a non-empty string.';
      }
      const results = searchChunks(chunks, query);
      if (results.length === 0) {
        return `No results for "${query}". Available sections: ${sections.join(', ')}.`;
      }
      // El recordatorio va pegado a los datos: los modelos pequeños lo siguen mucho mejor que
      // una regla del prompt inicial, y la búsqueda por palabras clave puede devolver
      // fragmentos que no responden a la pregunta (p. ej. "Madrid" en una pregunta de viajes).
      return [
        ...results.map((r) => `[${r.section}] ${r.text}`),
        'Note: use these results only if they answer the question. If the question is not about ' +
          'Alejandro, say you can only answer questions about him and do not answer it.',
      ].join('\n');
    },
  };
}

// El perfil se lee de data/profile.yaml (profile/load.js).
export { loadProfile } from './profile/load.js';
