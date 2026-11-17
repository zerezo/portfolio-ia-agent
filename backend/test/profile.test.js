import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadProfile, parseProfile, PROFILE_PATH } from '../profile/load.js';
import { profileView, viewStrings } from '../profile/view.js';
import { findConfidential, pendingItems } from '../profile/checks.js';
import { CHANNELS, LANGS } from '../profile/schema.js';

// Perfil mínimo válido; cada test lo modifica para probar una regla.
const MINIMAL = `
defaults: { channels: [web, cv, linkedin, agent], verified: true, priority: 2 }
basics:
  name: Ana
  headline: { en: Engineer, es: Ingeniera }
  location: Madrid
  email: { value: ana@example.com, channels: [cv] }
  links:
    - { id: website, label: ana.dev, url: https://ana.dev }
  meta: { title: Ana, description: Engineer. }
summary:
  - { id: summary, en: Builds things., es: Construye cosas. }
linkedin:
  channels: [linkedin]
  headline: { id: li-headline, en: Engineer, es: Ingeniera }
  about:
    - { id: li-about, verified: { en: true, es: false }, en: About me., es: Sobre mí. }
  topSkills: [skill-node]
skills:
  - id: skills-eng
    tags: [fullstack]
    label: { en: Engineering, es: Ingeniería }
    items:
      - { id: skill-node, name: Node.js }
      - { id: skill-rust, priority: 3, tags: [systems], name: Rust }
languages:
  - { id: lang-en, name: { en: English, es: Inglés }, level: C1 }
projects:
  - id: alpha
    tags: [ai]
    priority: 1
    name: Alpha
    date: '2026'
    bullets:
      - { id: alpha-1, en: Shipped alpha., es: Publicó alpha. }
      - { id: alpha-2, verified: false, en: Unverified claim., es: Afirmación sin verificar. }
      - { id: alpha-3, en: TODO describe, es: TODO describir }
    caseStudy:
      id: alpha-case
      channels: [web, agent]
      problem: [{ id: alpha-problem, verified: false, en: Hidden problem., es: Problema oculto. }]
      architecture: TODO
      tools: [{ ref: alpha-1 }]
      keyDecision: TODO
      evals: TODO
      next: TODO
  - id: beta
    tags: [systems]
    name: Beta
    bullets:
      - { id: beta-1, en: Built beta., es: Construyó beta. }
experience:
  - id: acme
    company: ACME
    location: Madrid
    start: 2024-02
    end: 2026-09
    roles:
      - id: acme-dev
        title: { en: Developer, es: Desarrolladora }
        bullets:
          - { id: acme-dev-1, en: Wrote code., es: Escribió código. }
  - id: old
    channels: [web, linkedin]
    company: Old Co
    location: Segovia
    roles:
      - id: old-role
        title: Helper
        start: 2020-01
        end: 2021-01
        bullets:
          - { id: old-1, en: Helped., es: Ayudó. }
education:
  - { id: degree, degree: { en: BSc, es: Grado }, institution: UPM, start: '2021', end: '2026' }
certifications:
  - { id: cert-a, name: Cert A }
  - { id: cert-b, channels: [linkedin], name: Cert B }
interests:
  - { id: running, label: Running, text: { en: Half marathons, es: Medias maratones } }
variants:
  systems: { tags: [systems], summary: { en: Systems person., es: Persona de sistemas. } }
`;

const minimal = () => parseProfile(MINIMAL);
const view = (channel, lang = 'en', variant) => profileView(minimal(), { channel, lang, variant });
const ids = (list) => list.map((x) => x.id);

describe('profile.yaml: esquema y reglas', () => {
  test('el perfil real cumple el esquema', () => {
    assert.doesNotThrow(() => loadProfile());
  });

  test('cada elemento sale con sus metadatos completos', () => {
    const profile = loadProfile();
    const nodes = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if (typeof v.id === 'string') nodes.push(v);
        Object.entries(v).forEach(([k, child]) => k !== 'variants' && walk(child));
      }
    };
    walk(profile);
    assert.ok(nodes.length > 50);
    for (const node of nodes) {
      assert.ok(Array.isArray(node.tags), node.id);
      assert.ok([1, 2, 3].includes(node.priority), node.id);
      assert.ok(node.channels.length && node.channels.every((c) => CHANNELS.includes(c)), node.id);
      assert.deepEqual(Object.keys(node.verified).sort(), [...LANGS].sort(), node.id);
    }
  });

  const rejects = (yaml, pattern) => assert.throws(() => parseProfile(yaml), pattern);

  test('rechaza YAML inválido', () => rejects('a: [1,', /YAML inválido/));
  test('rechaza un campo obligatorio ausente', () => rejects(MINIMAL.replace('  name: Ana\n', ''), /basics\.name/));
  test('rechaza un canal desconocido', () => rejects(MINIMAL.replace('[web, linkedin]', '[web, twitter]'), /channels/));
  test('rechaza una prioridad fuera de 1-3', () => rejects(MINIMAL.replace('priority: 3, tags', 'priority: 7, tags'), /priority/));
  test('rechaza campos desconocidos (erratas)', () => rejects(MINIMAL.replace('    date:', '    dates:'), /dates/));
  test('rechaza ids repetidos', () => rejects(MINIMAL.replace('id: beta-1', 'id: alpha-1'), /id repetido: "alpha-1"/));
  test('rechaza referencias rotas del caso de estudio', () => rejects(MINIMAL.replace('ref: alpha-1', 'ref: nope'), /referencia "nope"/));
  test('rechaza competencias destacadas inexistentes', () => rejects(MINIMAL.replace('topSkills: [skill-node]', 'topSkills: [nope]'), /topSkills/));
  test('rechaza fechas mal escritas', () => rejects(MINIMAL.replace('start: 2024-02', 'start: Feb 2024'), /start/));
  test('rechaza un puesto sin fecha de inicio', () => rejects(MINIMAL.replace('    start: 2024-02\n', ''), /acme-dev: falta "start"/));
});

describe('profile.yaml: herencia de metadatos', () => {
  const profile = minimal();

  test('los hijos heredan canales y prioridad y acumulan etiquetas', () => {
    const rust = profile.skills[0].items[1];
    assert.deepEqual(rust.tags, ['fullstack', 'systems']);
    assert.equal(rust.priority, 3);
    assert.deepEqual(profile.experience[1].roles[0].bullets[0].channels, ['web', 'linkedin']);
    assert.equal(profile.skills[0].items[0].priority, 2);
  });

  test('verified se hereda y puede ser por idioma', () => {
    assert.deepEqual(profile.linkedin.about[0].verified, { en: true, es: false });
    assert.deepEqual(profile.projects[0].bullets[1].verified, { en: false, es: false });
  });

  test('las referencias del caso de estudio apuntan al bullet', () => {
    assert.equal(profile.projects[0].caseStudy.tools[0].en, 'Shipped alpha.');
  });
});

describe('profileView', () => {
  test('excluye lo no verificado y los TODO', () => {
    const web = view('web');
    assert.deepEqual(ids(web.projects[0].bullets), ['alpha-1']);
    assert.ok(!viewStrings(web).some((s) => /Unverified|TODO|Hidden problem/.test(s)));
  });

  test('verified por idioma: el texto en español pendiente no sale, el inglés sí', () => {
    assert.deepEqual(view('linkedin', 'en').linkedin.about, ['About me.']);
    assert.deepEqual(view('linkedin', 'es').linkedin.about, []);
  });

  test('cada canal solo ve lo suyo', () => {
    assert.deepEqual(ids(view('cv').experience), ['acme']);
    assert.deepEqual(ids(view('web').experience), ['acme', 'old']);
    assert.deepEqual(ids(view('cv').certifications), ['cert-a']);
    assert.deepEqual(ids(view('linkedin').certifications), ['cert-a', 'cert-b']);
    assert.equal(view('cv').basics.email, 'ana@example.com');
    assert.equal(view('web').basics.email, null);
    assert.equal(view('web').linkedin, undefined);
  });

  test('el caso de estudio solo muestra las secciones verificadas y no está en el CV', () => {
    assert.deepEqual(view('web').projects[0].caseStudy, { sections: [{ key: 'tools', paragraphs: ['Shipped alpha.'] }] });
    assert.equal(view('cv').projects[0].caseStudy, null);
  });

  test('textos en el idioma pedido', () => {
    const es = view('cv', 'es');
    assert.equal(es.basics.headline, 'Ingeniera');
    assert.equal(es.experience[0].roles[0].title, 'Desarrolladora');
    assert.equal(es.basics.location, 'Madrid');
  });

  test('los puestos heredan las fechas de la empresa', () => {
    const [role] = view('web').experience[0].roles;
    assert.deepEqual([role.start, role.end], ['2024-02', '2026-09']);
    assert.deepEqual([view('web').experience[1].start, view('web').experience[1].end], ['2020-01', '2021-01']);
  });

  test('una variante reordena y sube la prioridad de lo etiquetado, y sustituye el resumen', () => {
    const v = view('cv', 'en', 'systems');
    assert.deepEqual(ids(v.projects), ['beta', 'alpha']);
    assert.deepEqual(ids(v.skills[0].items), ['skill-rust', 'skill-node']);
    assert.equal(v.skills[0].items[0].priority, 2);
    assert.equal(v.summary[0].text, 'Systems person.');
  });

  test('variante, canal o idioma desconocidos fallan con un mensaje claro', () => {
    assert.throws(() => view('cv', 'en', 'voice'), /Variante desconocida: "voice" \(hay: systems\)/);
    assert.throws(() => view('fax'), /Canal desconocido/);
    assert.throws(() => view('web', 'fr'), /Idioma desconocido/);
  });

  test('pendingItems lista los TODO y lo no verificado (solo el elemento más alto)', () => {
    const pending = pendingItems(minimal());
    assert.deepEqual(
      pending.filter((p) => p.kind === 'unverified').map((p) => `${p.id}:${p.langs}`),
      ['li-about:es', 'alpha-2:en,es', 'alpha-problem:en,es'],
    );
    assert.ok(pending.some((p) => p.kind === 'todo' && p.path === 'projects.alpha.caseStudy.architecture'));
  });
});

describe('perfil real: verified y confidencialidad', () => {
  const profile = loadProfile();
  const views = CHANNELS.flatMap((channel) =>
    LANGS.flatMap((lang) => [undefined, ...Object.keys(profile.variants)].map((variant) => profileView(profile, { channel, lang, variant }))),
  );

  test('ninguna salida contiene textos pendientes de revisar', () => {
    const pending = pendingItems(profile).filter((p) => p.kind === 'unverified');
    assert.ok(pending.length > 0);
    for (const v of views) {
      const all = viewStrings(v).join('\n');
      for (const { id, langs, node } of pending) {
        if (!langs.includes(v.lang)) continue;
        for (const value of viewStrings(node[v.lang] ?? node.title?.[v.lang] ?? [])) {
          assert.ok(!all.includes(value.trim()), `${id} (${v.lang}) aparece en ${v.channel}`);
        }
      }
    }
  });

  test('ninguna salida contiene TODO', () => {
    for (const v of views) assert.ok(!viewStrings(v).some((s) => /\bTODO\b/.test(s)), `${v.channel}/${v.lang}`);
  });

  test('los indicadores solo salen en la web (máximo 4)', () => {
    const web = profileView(profile, { channel: 'web', lang: 'en' });
    assert.deepEqual(ids(web.highlights), ['kpi-automation', 'kpi-mcp', 'kpi-clients', 'kpi-thesis']);
    assert.equal(web.highlights[0].value, '2 h → 10 min');
    for (const channel of ['cv', 'linkedin', 'agent']) assert.deepEqual(profileView(profile, { channel, lang: 'en' }).highlights, []);
  });

  test('las frases de Entrenador ya verificadas están en la web y en el agente', () => {
    for (const channel of ['web', 'agent']) {
      const entrenador = profileView(profile, { channel, lang: 'en' }).projects.find((p) => p.id === 'entrenador');
      assert.deepEqual(ids(entrenador.bullets), ['entrenador-mcp-server', 'entrenador-methodology', 'entrenador-evals']);
    }
  });

  // Los clientes del trabajo actual no se nombran nunca: ni en la fuente, ni en ninguna salida,
  // ni en la base de conocimiento, ni en los textos de LinkedIn o la web compilada si existen.
  test('no aparecen nombres de clientes en la fuente ni en las salidas', () => {
    assert.deepEqual(findConfidential(readFileSync(PROFILE_PATH, 'utf8')), []);
    for (const v of views) assert.deepEqual(findConfidential(viewStrings(v).join('\n')), [], `${v.channel}/${v.lang}/${v.variant}`);
  });

  test('no aparecen nombres de clientes en la base de conocimiento, exports ni la web compilada', () => {
    const root = new URL('../../', import.meta.url);
    const files = [];
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(md|html|js|json|txt)$/.test(name)) files.push(path);
      }
    };
    for (const dir of ['backend/knowledge', 'exports', 'frontend/dist']) walk(new URL(dir, root).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    assert.ok(files.some((f) => f.includes('knowledge')));
    for (const file of files) assert.deepEqual(findConfidential(readFileSync(file, 'utf8')), [], file);
  });

  test('findConfidential detecta los nombres en cualquier forma', () => {
    assert.deepEqual(findConfidential('Client: MERCEDES-Benz'), ['MERCEDES']);
    assert.deepEqual(findConfidential('MasOrange and Orange'), ['Orange']);
  });
});
