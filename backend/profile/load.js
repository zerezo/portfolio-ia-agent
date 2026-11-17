import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { CASE_STUDY_SECTIONS, LANGS, ProfileSchema } from './schema.js';

// Carga data/profile.yaml: lo valida con el esquema, comprueba las reglas que el esquema no
// puede expresar (ids únicos, referencias, fechas) y rellena los metadatos heredados. Cada
// elemento con id sale con tags, priority, channels y verified ({ en, es }) completos.

export const PROFILE_PATH = new URL('../data/profile.yaml', import.meta.url);

// Un texto que empieza por TODO falta por escribir: no sale en ninguna salida.
export const isTodo = (value) => typeof value === 'string' && /^TODO\b/.test(value.trim());

const pair = (verified) =>
  typeof verified === 'boolean' ? { en: verified, es: verified } : { en: verified.en, es: verified.es };

// Metadatos efectivos: los del elemento o, si no tiene, los del padre. verified solo se
// conserva si el padre también lo está; las etiquetas se acumulan.
function inherit(node, parent) {
  const own = pair(node.verified ?? true);
  return {
    ...node,
    tags: [...new Set([...parent.tags, ...(node.tags ?? [])])],
    priority: node.priority ?? parent.priority,
    channels: node.channels ?? parent.channels,
    verified: Object.fromEntries(LANGS.map((lang) => [lang, parent.verified[lang] && own[lang]])),
  };
}

const withBullets = (node, parent) => {
  const item = inherit(node, parent);
  return { ...item, bullets: node.bullets.map((b) => inherit(b, item)) };
};

function formatIssues(error) {
  return error.issues.map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`).join('\n');
}

// Recorre el perfil y devuelve todos los objetos con id.
function collectIds(value, found = []) {
  if (Array.isArray(value)) value.forEach((v) => collectIds(v, found));
  else if (value && typeof value === 'object') {
    if (typeof value.id === 'string') found.push(value);
    Object.values(value).forEach((v) => collectIds(v, found));
  }
  return found;
}

function checkRules(data) {
  const errors = [];
  const nodes = collectIds(data);
  const seen = new Set();
  for (const { id } of nodes) {
    if (seen.has(id)) errors.push(`id repetido: "${id}"`);
    seen.add(id);
  }

  const bulletIds = new Set(data.projects.flatMap((p) => p.bullets.map((b) => b.id)));
  for (const project of data.projects) {
    for (const key of CASE_STUDY_SECTIONS) {
      const section = project.caseStudy?.[key];
      if (!Array.isArray(section)) continue;
      for (const p of section) {
        if (p.ref && !bulletIds.has(p.ref)) errors.push(`${project.id}.caseStudy.${key}: la referencia "${p.ref}" no es un bullet`);
      }
    }
  }

  const skillIds = new Set(data.skills.flatMap((g) => g.items.map((s) => s.id)));
  for (const id of data.linkedin.topSkills) {
    if (!skillIds.has(id)) errors.push(`linkedin.topSkills: "${id}" no es una competencia`);
  }

  for (const job of data.experience) {
    for (const role of job.roles) {
      if (!(role.start ?? job.start)) errors.push(`${role.id}: falta "start" (en el puesto o en la empresa)`);
    }
  }
  for (const [name, variant] of Object.entries(data.variants)) {
    if (variant.tags.length === 0) errors.push(`variants.${name}: sin etiquetas`);
  }
  return errors;
}

// Perfil validado y con los metadatos heredados.
export function parseProfile(text) {
  let raw;
  try {
    raw = parse(text);
  } catch (error) {
    throw new Error(`profile.yaml: YAML inválido: ${error.message}`);
  }
  const result = ProfileSchema.safeParse(raw);
  if (!result.success) throw new Error(`profile.yaml no cumple el esquema:\n${formatIssues(result.error)}`);
  const data = result.data;
  const errors = checkRules(data);
  if (errors.length) throw new Error(`profile.yaml no es válido:\n${errors.map((e) => `  - ${e}`).join('\n')}`);

  const root = { tags: [], priority: data.defaults.priority, channels: data.defaults.channels, verified: pair(data.defaults.verified) };
  const bullets = new Map();

  const projects = data.projects.map((project) => {
    const item = withBullets(project, root);
    item.bullets.forEach((b) => bullets.set(b.id, b));
    return item;
  });
  // Las referencias del caso de estudio se resuelven al bullet (con su propio verified).
  for (const project of projects) {
    if (!project.caseStudy) continue;
    const study = inherit(project.caseStudy, project);
    for (const key of CASE_STUDY_SECTIONS) {
      const section = study[key];
      if (Array.isArray(section)) study[key] = section.map((p) => (p.ref ? { ...bullets.get(p.ref), ref: p.ref } : inherit(p, study)));
    }
    project.caseStudy = study;
  }

  const linkedin = inherit(data.linkedin, root);
  return {
    basics: {
      ...data.basics,
      links: data.basics.links.map((l) => inherit(l, root)),
    },
    summary: data.summary.map((s) => inherit(s, root)),
    linkedin: {
      ...linkedin,
      headline: inherit(data.linkedin.headline, linkedin),
      about: data.linkedin.about.map((a) => inherit(a, linkedin)),
    },
    skills: data.skills.map((group) => {
      const item = inherit(group, root);
      return { ...item, items: group.items.map((s) => inherit(s, item)) };
    }),
    languages: data.languages.map((l) => inherit(l, root)),
    projects,
    experience: data.experience.map((job) => {
      const item = inherit(job, root);
      return { ...item, roles: job.roles.map((role) => withBullets(role, item)) };
    }),
    education: data.education.map((e) => inherit(e, root)),
    certifications: data.certifications.map((c) => inherit(c, root)),
    interests: data.interests.map((i) => inherit(i, root)),
    variants: data.variants,
  };
}

export function loadProfile(path = PROFILE_PATH) {
  return parseProfile(readFileSync(path, 'utf8'));
}
