import { readFileSync } from 'node:fs';

// Herramientas del agente. Cada una: { name, description, inputSchema, run(input) -> texto }.
// La definición es neutral; cada adaptador de llm.js la traduce al formato de su proveedor.
// La web está en inglés: descripciones, resultados y CV también, para que el modelo trabaje
// en un solo idioma.

// Cubre una sección completa (6 certificaciones, 5 experiencias) sin inflar el contexto.
const MAX_RESULTS = 6;

// Minúsculas y sin tildes, para que "Behobia" o "Politécnica" se encuentren igual.
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Palabras vacías (inglés y algo de español) que no aportan a la búsqueda.
const STOPWORDS = new Set(
  (
    'the a an and or of in on at to for with by from is are was were be been has have had does do did ' +
    'he his him what which who where when how about any some it its this that as can could tell me ' +
    'de la el en y los las del un una con por para que su sus al lo es tiene ha sobre como'
  ).split(' '),
);

const tokenize = (text) =>
  normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

// Convierte el CV en fragmentos de texto autocontenidos (la misma unidad que se vectorizará con pgvector).
export function buildCvChunks(cv) {
  const chunks = [
    {
      section: 'profile',
      text: `${cv.profile.name}. ${cv.profile.headline}. ${cv.profile.location}. ${cv.profile.summary}`,
      tags: ['about', 'summary', 'current job', 'work'],
    },
    { section: 'contact', text: `LinkedIn: ${cv.contact.linkedin}` },
    { section: 'skills', text: `Skills: ${cv.skills.join(', ')}.` },
    { section: 'languages', text: `Languages: ${cv.languages.map((l) => `${l.language} (${l.level})`).join(', ')}.` },
  ];

  for (const e of cv.experience) {
    chunks.push({
      section: 'experience',
      text: `${e.role} at ${e.company} (${e.start} - ${e.end ?? 'present'}, ${e.location}). ${e.description}`,
      tags: [...e.tags, 'work', 'job'],
    });
  }
  for (const e of cv.education) {
    chunks.push({
      section: 'education',
      text: `${e.degree}, ${e.institution} (${e.start} - ${e.end}).`,
      tags: [...e.tags, 'degree', 'university', 'studies'],
    });
  }
  for (const c of cv.certifications) {
    chunks.push({ section: 'certifications', text: `Certification: ${c.name}.`, tags: c.tags });
  }
  for (const p of cv.projects) {
    chunks.push({
      section: 'projects',
      text: `Project (${p.type}, ${p.status}): ${p.name}. ${p.description}${p.url ? ` ${p.url}` : ''}`,
      tags: p.tags,
    });
  }
  for (const i of cv.interests) {
    chunks.push({
      section: 'interests',
      text: `Hobbies and free time, ${i.topic}: ${i.description}`,
      tags: [...i.tags, 'hobbies', 'spare time', 'personal'],
    });
  }

  // Índice de palabras precalculado: sección + texto + etiquetas.
  return chunks.map((chunk) => ({
    ...chunk,
    words: new Set(tokenize(`${chunk.section} ${chunk.text} ${(chunk.tags ?? []).join(' ')}`)),
  }));
}

// Coincidencia por prefijo: "certification" encuentra "certifications". En sentido inverso
// solo con palabras de 3+ letras, para que "it" (IT) no coincida con "items".
const matches = (chunk, term) =>
  [...chunk.words].some((w) => w.startsWith(term) || (w.length >= 3 && term.startsWith(w)));

// Búsqueda por palabras clave. TODO(rag): sustituir por búsqueda vectorial en pgvector.
export function searchCv(chunks, query) {
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
    .slice(0, MAX_RESULTS)
    .map(({ chunk }) => chunk);
}

export function createCvTool(cv) {
  const chunks = buildCvChunks(cv);
  const sections = [...new Set(chunks.map((c) => c.section))];

  return {
    name: 'search_cv',
    // Para la búsqueda forzada de app.js: ¿encuentra algo esta consulta?
    hasResults: (query) => searchCv(chunks, query).length > 0,
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
      const results = searchCv(chunks, query);
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

export function loadCv(path = new URL('./data/cv.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
