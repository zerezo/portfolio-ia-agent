import { readFileSync } from 'node:fs';

// Herramientas del agente. Cada una: { name, description, inputSchema, run(input) -> texto }.
// La definición es neutral; cada adaptador de llm.js la traduce al formato de su proveedor.

// Cubre una sección completa (6 certificaciones, 5 experiencias) sin inflar el contexto.
const MAX_RESULTS = 6;

// Minúsculas y sin tildes, para que "aptitudes" encuentre "Aptitudes" y "maraton" encuentre "maratón".
const normalize = (text) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Palabras vacías que no aportan a la búsqueda.
const STOPWORDS = new Set(
  'de la el en y a los las del un una con por para que su sus al lo es tiene ha sobre como o'.split(' '),
);

const tokenize = (text) =>
  normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

// Convierte el CV en fragmentos de texto autocontenidos (la misma unidad que se vectorizará con pgvector).
export function buildCvChunks(cv) {
  const chunks = [
    { section: 'perfil', text: `${cv.perfil.nombre}. ${cv.perfil.titular}. ${cv.perfil.ubicacion}. ${cv.perfil.resumen}` },
    { section: 'contacto', text: `LinkedIn: ${cv.contacto.linkedin}` },
    { section: 'aptitudes', text: `Aptitudes: ${cv.aptitudes.join(', ')}.` },
    { section: 'idiomas', text: `Idiomas: ${cv.idiomas.map((i) => `${i.idioma} (${i.nivel})`).join(', ')}.` },
  ];

  for (const e of cv.experiencia) {
    chunks.push({
      section: 'experiencia',
      text: `${e.puesto} en ${e.empresa} (${e.inicio} - ${e.fin ?? 'actualidad'}, ${e.ubicacion}). ${e.descripcion}`,
      tags: e.etiquetas,
    });
  }
  for (const e of cv.educacion) {
    chunks.push({
      section: 'educacion',
      text: `${e.titulo}, ${e.centro} (${e.inicio} - ${e.fin}).`,
      tags: e.etiquetas,
    });
  }
  for (const c of cv.certificaciones) {
    chunks.push({ section: 'certificaciones', text: `Certificación: ${c.nombre}.`, tags: c.etiquetas });
  }
  for (const i of cv.intereses) {
    chunks.push({
      section: 'intereses',
      text: `Aficiones y tiempo libre, ${i.tema}: ${i.descripcion}`,
      tags: [...i.etiquetas, 'hobbies', 'ocio', 'personal'],
    });
  }

  // Índice de palabras precalculado: sección + texto + etiquetas.
  return chunks.map((chunk) => ({
    ...chunk,
    words: new Set(tokenize(`${chunk.section} ${chunk.text} ${(chunk.tags ?? []).join(' ')}`)),
  }));
}

// Coincidencia por prefijo: "certificacion" encuentra "certificaciones".
const matches = (chunk, term) => [...chunk.words].some((w) => w.startsWith(term) || term.startsWith(w));

// Búsqueda por palabras clave. TODO(rag): sustituir por búsqueda vectorial en pgvector.
export function searchCv(chunks, query) {
  // Las palabras raras pesan más (tipo IDF): en "DORA experiencia", DORA aparece en un
  // fragmento y experiencia en cinco, así que el fragmento de DORA queda primero.
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
    name: 'buscar_en_cv',
    description:
      'Busca información en el currículum del ingeniero dueño del portfolio: perfil, experiencia, ' +
      'educación, aptitudes, certificaciones, idiomas, intereses personales y contacto. ' +
      'Úsala siempre antes de responder cualquier pregunta sobre él. ' +
      'La consulta debe ser palabras clave concretas, por ejemplo "DORA certificaciones" o "deporte".',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Palabras clave de lo que se busca.' },
      },
      required: ['consulta'],
    },
    run({ consulta }) {
      if (typeof consulta !== 'string' || consulta.trim() === '') {
        return 'Error: el parámetro "consulta" debe ser un texto no vacío.';
      }
      const results = searchCv(chunks, consulta);
      if (results.length === 0) {
        return `Sin resultados para "${consulta}". Secciones disponibles: ${sections.join(', ')}.`;
      }
      return results.map((r) => `[${r.section}] ${r.text}`).join('\n');
    },
  };
}

export function loadCv(path = new URL('./data/cv.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
