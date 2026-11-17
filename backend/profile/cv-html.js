import { formatPeriod, LABELS } from './format.js';

// Plantilla HTML del CV en PDF (vista "cv" del perfil). Pensada para los ATS: una columna, texto
// real (seleccionable), encabezados normales, sin tablas, iconos, imágenes ni columnas, y fuentes
// estándar (Arial; Liberation Sans, de métricas idénticas, en Linux).

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
@page { size: A4; margin: 9mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: 9.2pt; line-height: 1.22; color: #111; }
h1 { margin: 0; font-size: 16pt; }
.headline { margin: 0.5pt 0 1pt; font-size: 10.5pt; font-weight: bold; color: #333; }
.contact { margin: 0; }
h2 { margin: 5pt 0 2pt; padding-bottom: 0.5pt; border-bottom: 0.75pt solid #888; font-size: 9.8pt; letter-spacing: 0.03em; text-transform: uppercase; }
h3 { margin: 3pt 0 0; font-size: 9.4pt; }
h3 .meta, .role .meta { font-weight: normal; color: #444; }
.role { margin: 1.5pt 0 0; font-weight: bold; }
p { margin: 0 0 1pt; }
ul { margin: 0.5pt 0 0; padding-left: 10pt; }
li { margin: 0 0 0.5pt; }
a { color: inherit; text-decoration: none; }
/* URLs y fechas nunca se parten: un ATS leería "cerezo-gilarranz" como "cerezogilarranz". */
a, .nw { white-space: nowrap; }
`;

// dropped: ids recortados para que quepa en una página (scripts/cv.js).
export function cvHtml(view, { dropped = new Set() } = {}) {
  const { lang, basics } = view;
  const L = LABELS[lang];
  const keep = (item) => !dropped.has(item.id);
  const bullets = (list) => {
    const items = list.filter(keep);
    return items.length ? `<ul>${items.map((b) => `<li>${escape(b.text)}</li>`).join('')}</ul>` : '';
  };
  // parts: textos (se escapan) o { html } ya preparado (enlaces).
  const meta = (parts) => {
    const text = parts
      .filter(Boolean)
      .map((p) => (typeof p === 'string' ? escape(p) : p.html))
      .join(' · ');
    return text ? ` <span class="meta">· ${text}</span>` : '';
  };
  const link = (l) => ({ html: `<a href="${escape(l.url)}">${escape(l.label)}</a>` });
  const period = (start, end) => ({ html: `<span class="nw">${escape(formatPeriod(start, end, lang))}</span>` });
  const section = (title, body) => (body ? `<h2>${escape(title)}</h2>${body}` : '');

  const contact = [
    escape(basics.location),
    basics.email && `<a href="mailto:${escape(basics.email)}">${escape(basics.email)}</a>`,
    ...basics.links.map((l) => `<a href="${escape(l.url)}">${escape(l.label)}</a>`),
  ]
    .filter(Boolean)
    .join(' | ');

  const projects = view.projects
    .filter(keep)
    .map((p) => {
      // Los enlaces que ya aparecen en el contexto ("Live at alejandrocerezo.dev") no se repiten.
      const links = p.links.filter((l) => !p.context?.includes(l.label)).map(link);
      return `<h3>${escape(p.name)}${meta([p.context, ...links, p.date])}</h3>${bullets(p.bullets)}`;
    })
    .join('');

  const experience = view.experience
    .filter(keep)
    .map((job) => {
      const roles = job.roles
        .filter(keep)
        .map(
          (role) =>
            `<p class="role">${escape(role.title)}${meta([period(role.start, role.end)])}</p>${bullets(role.bullets)}`,
        )
        .join('');
      const company = job.companyNote ? `${job.company} (${job.companyNote})` : job.company;
      return roles ? `<h3>${escape(company)}${meta([job.location, job.note])}</h3>${roles}` : '';
    })
    .join('');

  const skills = [
    ...view.skills.map((g) => {
      const items = g.items.filter(keep);
      return items.length ? `<p><b>${escape(g.label)}:</b> ${items.map((s) => escape(s.name)).join(', ')}</p>` : '';
    }),
    view.languages.length
      ? `<p><b>${L.languages}:</b> ${view.languages.map((l) => `${escape(l.name)} (${escape(l.level)})`).join('; ')}</p>`
      : '',
  ].join('');

  const education = view.education
    .filter(keep)
    .map((e) => `<p><b>${escape(e.degree)}</b>${meta([e.institution, { html: `<span class="nw">${e.start}–${e.end ?? ''}</span>` }, e.note])}</p>`)
    .join('');
  const certs = view.certifications.filter(keep);
  const interests = view.interests.filter(keep);

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escape(basics.name)} – CV</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escape(basics.name)}</h1>
<p class="headline">${escape(basics.headline)}</p>
<p class="contact">${contact}</p>
${section(L.summary, view.summary.filter(keep).map((s) => `<p>${escape(s.text)}</p>`).join(''))}
${section(L.projects, projects)}
${section(L.experience, experience)}
${section(L.skills, skills)}
${section(L.education, education)}
${section(L.certifications, certs.length ? `<p>${certs.map((c) => escape(c.name)).join(' · ')}</p>` : '')}
${section(L.interests, interests.length ? `<p>${interests.map((i) => escape(i.text)).join('; ')}</p>` : '')}
</body>
</html>
`;
}

// Lo que se puede recortar, en el orden en que se recorta: primero todo lo de prioridad 3
// (elementos completos o bullets), después los bullets de prioridad 2, siempre desde el final
// del CV. La prioridad 1 y los elementos de prioridad 2 no se recortan nunca.
export function trimCandidates(view) {
  const found = [];
  const add = (node, isBullet) => found.push({ id: node.id, priority: node.priority, isBullet, order: found.length });
  view.summary.forEach((s) => add(s, true));
  for (const p of view.projects) {
    add(p, false);
    p.bullets.forEach((b) => add(b, true));
  }
  for (const job of view.experience) {
    add(job, false);
    for (const role of job.roles) {
      add(role, false);
      role.bullets.forEach((b) => add(b, true));
    }
  }
  view.skills.forEach((g) => g.items.forEach((s) => add(s, false)));
  view.education.forEach((e) => add(e, false));
  view.certifications.forEach((c) => add(c, false));
  view.interests.forEach((i) => add(i, false));

  return found
    .filter((c) => c.priority === 3 || (c.priority === 2 && c.isBullet))
    .sort((a, b) => b.priority - a.priority || b.order - a.order);
}
