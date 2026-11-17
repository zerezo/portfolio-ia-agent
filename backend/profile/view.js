import { isTodo } from './load.js';
import { CASE_STUDY_SECTIONS, CHANNELS, LANGS } from './schema.js';

// Vista del perfil para una salida (web, cv, linkedin, agent) y un idioma. Es el único filtro
// que usan todas las salidas: deja fuera lo que no es de ese canal, lo pendiente de revisar
// (verified: false en ese idioma) y los textos TODO. Con variant, los elementos con alguna de
// sus etiquetas suben un punto de prioridad y van primero (proyectos y competencias).

const present = (end) => (end === 'present' || end === undefined ? null : end);

export function profileView(profile, { channel, lang = 'en', variant } = {}) {
  if (!CHANNELS.includes(channel)) throw new Error(`Canal desconocido: "${channel}" (${CHANNELS.join(', ')})`);
  if (!LANGS.includes(lang)) throw new Error(`Idioma desconocido: "${lang}" (${LANGS.join(', ')})`);
  const chosen = variant ? profile.variants[variant] : null;
  if (variant && !chosen) {
    throw new Error(`Variante desconocida: "${variant}" (hay: ${Object.keys(profile.variants).join(', ')})`);
  }

  const text = (value) => {
    const s = typeof value === 'string' ? value : value?.[lang];
    return s && !isTodo(s) ? s.trim() : null;
  };
  const shown = (node) => node.channels.includes(channel) && node.verified[lang];
  const boosted = (node) => Boolean(chosen && node.tags.some((t) => chosen.tags.includes(t)));
  // sort es estable: sin variante, o entre elementos igual de relevantes, se respeta el orden del archivo.
  const ordered = (list) => (chosen ? [...list].sort((a, b) => boosted(b) - boosted(a)) : list);
  const base = (node) => ({
    id: node.id,
    priority: boosted(node) ? Math.max(1, node.priority - 1) : node.priority,
    tags: node.tags,
  });
  const bullets = (list) =>
    list
      .filter(shown)
      .map((b) => ({ ...base(b), text: text(b) }))
      .filter((b) => b.text);

  const caseStudy = (study) => {
    if (!study || !shown(study)) return null;
    const sections = CASE_STUDY_SECTIONS.map((key) => ({
      key,
      paragraphs: Array.isArray(study[key]) ? study[key].filter(shown).map(text).filter(Boolean) : [],
    })).filter((s) => s.paragraphs.length);
    return sections.length ? { sections } : null;
  };

  const { basics } = profile;
  const allSkills = profile.skills.flatMap((g) => (shown(g) ? g.items.filter(shown) : []));

  const view = {
    channel,
    lang,
    variant: variant ?? null,
    basics: {
      name: basics.name,
      headline: text(basics.headline),
      location: text(basics.location),
      email: basics.email.channels.includes(channel) ? basics.email.value : null,
      links: basics.links.filter(shown).map(({ id, label, url }) => ({ id, label, url })),
      ...(channel === 'web' && { meta: basics.meta }),
    },
    highlights: profile.highlights
      .filter(shown)
      .map((h) => ({ ...base(h), value: h.value, label: text(h.label), detail: text(h.detail) }))
      .filter((h) => h.label),
    summary: chosen?.summary
      ? [{ id: `summary-${variant}`, priority: 1, tags: chosen.tags, text: chosen.summary[lang] }]
      : bullets(profile.summary),
    projects: ordered(profile.projects.filter(shown))
      .map((p) => ({
        ...base(p),
        name: text(p.name),
        context: text(p.context),
        date: p.date ?? null,
        stack: p.stack,
        links: p.links,
        bullets: bullets(p.bullets),
        caseStudy: caseStudy(p.caseStudy),
      }))
      .filter((p) => p.name && p.bullets.length),
    experience: profile.experience
      .filter(shown)
      .map((job) => {
        const roles = job.roles
          .filter(shown)
          .map((role) => ({
            ...base(role),
            title: text(role.title),
            start: role.start ?? job.start,
            end: present(role.end ?? job.end),
            bullets: bullets(role.bullets),
          }))
          .filter((role) => role.title);
        const starts = roles.map((r) => r.start).sort();
        const ends = roles.map((r) => r.end);
        return {
          ...base(job),
          company: job.company,
          companyNote: text(job.companyNote),
          location: job.location,
          start: job.start ?? starts[0],
          end: job.end ? present(job.end) : ends.includes(null) ? null : ends.sort().at(-1),
          note: text(job.note),
          roles,
        };
      })
      .filter((job) => job.roles.length),
    education: profile.education
      .filter(shown)
      .map((e) => ({
        ...base(e),
        degree: text(e.degree),
        institution: e.institution,
        start: e.start,
        end: present(e.end),
        note: text(e.note),
      }))
      .filter((e) => e.degree),
    skills: ordered(profile.skills.filter(shown))
      .map((group) => ({
        ...base(group),
        label: text(group.label),
        items: ordered(group.items.filter(shown))
          .map((s) => ({ ...base(s), name: text(s.name) }))
          .filter((s) => s.name),
      }))
      .filter((g) => g.label && g.items.length),
    languages: profile.languages
      .filter(shown)
      .map((l) => ({ ...base(l), name: text(l.name), level: text(l.level) }))
      .filter((l) => l.name && l.level),
    certifications: profile.certifications
      .filter(shown)
      .map((c) => ({ ...base(c), name: text(c.name) }))
      .filter((c) => c.name),
    interests: profile.interests
      .filter(shown)
      .map((i) => ({ ...base(i), label: text(i.label), text: text(i.text) }))
      .filter((i) => i.label && i.text),
  };

  if (channel === 'linkedin') {
    const { linkedin } = profile;
    view.linkedin = shown(linkedin)
      ? {
          headline: shown(linkedin.headline) ? text(linkedin.headline) : null,
          about: bullets(linkedin.about).map((p) => p.text),
          topSkills: linkedin.topSkills
            .map((id) => allSkills.find((s) => s.id === id))
            .filter(Boolean)
            .map((s) => text(s.name))
            .filter(Boolean),
        }
      : null;
  }
  return view;
}

// Todos los textos de una vista, para las comprobaciones (confidencialidad, TODO).
export function viewStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => viewStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => viewStrings(v, out));
  return out;
}
