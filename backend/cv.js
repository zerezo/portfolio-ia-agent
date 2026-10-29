import { readFileSync } from 'node:fs';

// El CV vive en data/cv.md (Markdown legible y editable); este módulo lo convierte a la
// estructura que usan la web (/api/profile) y la herramienta search_cv (tools.js).
// El formato está descrito en el comentario de la cabecera de cv.md. Un CV mal formado
// detiene el arranque con un mensaje claro: es mejor que servir una web con huecos.

// Secciones con elementos "###" y cómo se convierte cada uno.
const ITEM_SECTIONS = {
  Experience: (title, f, text) => ({
    company: required(f, 'company', title),
    role: title,
    start: required(f, 'start', title),
    end: f.end === 'present' ? null : required(f, 'end', title),
    location: required(f, 'location', title),
    description: text,
    tags: f.tags,
  }),
  Education: (title, f) => ({
    institution: required(f, 'institution', title),
    degree: title,
    start: required(f, 'start', title),
    end: required(f, 'end', title),
    tags: f.tags,
  }),
  Certifications: (title, f) => ({ name: title, tags: f.tags }),
  Projects: (title, f, text) => ({
    name: title,
    type: required(f, 'type', title),
    status: required(f, 'status', title),
    description: text,
    ...(f.url && { url: f.url }),
    tags: f.tags,
  }),
  Interests: (title, f, text) => ({ topic: title, description: text, tags: f.tags }),
};

function required(fields, name, title) {
  if (!fields[name]) throw new Error(`cv.md: falta "${name}" en "${title}"`);
  return fields[name];
}

// Campos "- clave: valor" al principio del bloque; el resto es la descripción.
function parseItem(block) {
  const fields = { tags: [] };
  const rest = [];
  for (const line of block.split('\n')) {
    const field = rest.length === 0 && line.match(/^- (\w+):\s*(.*)$/);
    if (field) {
      const [, key, value] = field;
      fields[key] = key === 'tags' ? value.split(',').map((t) => t.trim()).filter(Boolean) : value.trim();
    } else if (line.trim() || rest.length) {
      rest.push(line);
    }
  }
  return { fields, text: rest.join(' ').replace(/\s+/g, ' ').trim() };
}

const bullets = (body) =>
  body
    .split('\n')
    .map((line) => line.match(/^- (.+)$/)?.[1].trim())
    .filter(Boolean);

export function parseCv(markdown) {
  const text = markdown.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const header = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!header) throw new Error('cv.md: falta la cabecera (--- name, headline, location, linkedin ---)');
  const meta = Object.fromEntries(
    header[1].split('\n').map((line) => line.match(/^(\w+):\s*(.*)$/)?.slice(1)).filter(Boolean),
  );

  const sections = {};
  for (const part of text.slice(header[0].length).split(/^## /m).slice(1)) {
    const [title, ...body] = part.split('\n');
    sections[title.trim()] = body.join('\n').trim();
  }
  const section = (name) => {
    if (!(name in sections)) throw new Error(`cv.md: falta la sección "## ${name}"`);
    return sections[name];
  };
  const items = (name) =>
    section(name)
      .split(/^### /m)
      .slice(1)
      .map((block) => {
        const [title, ...body] = block.split('\n');
        const { fields, text: description } = parseItem(body.join('\n'));
        return ITEM_SECTIONS[name](title.trim(), fields, description);
      });

  return {
    profile: {
      name: required(meta, 'name', 'cabecera'),
      headline: required(meta, 'headline', 'cabecera'),
      location: required(meta, 'location', 'cabecera'),
      summary: section('Summary').replace(/\s+/g, ' '),
    },
    contact: { linkedin: required(meta, 'linkedin', 'cabecera') },
    experience: items('Experience'),
    education: items('Education'),
    skills: bullets(section('Skills')),
    certifications: items('Certifications'),
    languages: bullets(section('Languages')).map((line) => {
      const [language, ...level] = line.split(': ');
      return { language, level: level.join(': ') };
    }),
    projects: items('Projects'),
    interests: items('Interests'),
  };
}

export function loadCv(path = new URL('./data/cv.md', import.meta.url)) {
  return parseCv(readFileSync(path, 'utf8'));
}
