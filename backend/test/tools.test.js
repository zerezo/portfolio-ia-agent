import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCvTool, loadProfile } from '../tools.js';
import { parseProfile } from '../profile/load.js';
import { profileView } from '../profile/view.js';
import { pendingItems } from '../profile/checks.js';

// Usa el profile.yaml real: además valida que el agente vea lo que la web publica.
const profile = loadProfile();
const tool = createCvTool(profile);
const firstLine = (query) => tool.run({ query }).split('\n')[0];

// Perfil mínimo con un bullet verificado o no, para probar el filtro de verified.
const tinyProfile = (verified) => `
defaults: { channels: [web, cv, linkedin, agent], verified: true, priority: 2 }
basics:
  name: Ana
  headline: Engineer
  location: Madrid
  email: { value: a@b.dev, channels: [cv] }
  links: [{ id: web, label: a.dev, url: https://a.dev }]
  meta: { title: Ana, description: Ana. }
summary: [{ id: s, en: Engineer., es: Ingeniera. }]
linkedin: { headline: { id: h, en: H, es: H }, about: [{ id: a, en: A, es: A }], topSkills: [] }
skills: [{ id: g, label: Eng, items: [{ id: k, name: Node }] }]
languages: [{ id: l, name: English, level: C1 }]
projects:
  - id: p
    name: Zephyr
    bullets: [{ id: b, verified: ${verified}, en: Quantum widget launcher., es: Lanzador. }]
experience:
  - id: e
    company: ACME
    location: Madrid
    start: 2024-01
    roles: [{ id: r, title: Dev, bullets: [{ id: rb, en: Code., es: Código. }] }]
education: [{ id: d, degree: BSc, institution: UPM, start: '2021', end: '2026' }]
certifications: []
interests: []
variants: {}
`;

describe('search_cv', () => {
  test('encuentra certificaciones por palabra clave', () => {
    assert.match(tool.run({ query: 'DORA' }), /\[certifications\].*DORA/);
  });

  test('las palabras raras pesan más que las comunes', () => {
    // "certification" coincide con tres fragmentos; Cambridge con menos, que deben ir primero.
    assert.match(firstLine('Cambridge certification'), /Cambridge/);
  });

  test('busca con la pregunta completa del usuario (llamada forzada)', () => {
    assert.match(firstLine('What does he do in his free time?'), /\[interests\]/);
  });

  test('ignora tildes y mayúsculas', () => {
    assert.match(tool.run({ query: 'BEHOBIA' }), /Behobia/);
    assert.match(tool.run({ query: 'politecnica' }), /Politécnica/);
  });

  test('encuentra por etiquetas aunque no aparezcan en el texto', () => {
    assert.match(tool.run({ query: 'leadership' }), /captain/);
  });

  test('encuentra aficiones con sinónimos habituales', () => {
    for (const query of ['free time', 'hobbies', 'spare time', 'sports']) {
      assert.match(tool.run({ query }), /\[interests\]/, query);
    }
  });

  test('encuentra los proyectos, incluido el trabajo de fin de grado', () => {
    assert.match(tool.run({ query: 'thesis' }), /\[projects\].*Cyber-Risk Simulator/);
    assert.match(tool.run({ query: 'projects' }), /HomeCarGarage/);
  });

  test('encuentra los proyectos nuevos con preguntas de recruiter', () => {
    assert.match(firstLine('Tell me about the Entrenador MCP server'), /\[projects\].*Entrenador/);
    assert.match(tool.run({ query: 'What has he built with LLMs?' }), /Portfolio AI Agent/);
    assert.match(tool.run({ query: 'evals LLM judge' }), /Entrenador/);
    assert.match(tool.run({ query: 'prompt injection guard' }), /Portfolio AI Agent/);
    assert.match(tool.run({ query: 'car service intervals app' }), /HomeCarGarage/);
  });

  test('responde al encaje como Forward Deployed Engineer y al trato con clientes', () => {
    assert.match(tool.run({ query: 'Why is he a good fit for a Forward Deployed Engineer role?' }), /\[profile\].*Forward Deployed/);
    assert.match(tool.run({ query: 'How does he work with enterprise clients?' }), /Germany and South Korea/);
  });

  test('encuentra dónde vive con cualquier palabra habitual', () => {
    for (const query of ['location', 'city', 'Where is he based?', 'hometown']) {
      assert.match(firstLine(query), /\[profile\].*Based in Madrid, Spain/, query);
    }
  });

  test('encuentra los proyectos por su stack', () => {
    assert.match(tool.run({ query: 'Supabase' }), /\[projects\] Project: HomeCarGarage.*Stack: React, Supabase/);
    assert.match(tool.run({ query: 'HermiT reasoner' }), /Cyber-Risk Simulator/);
  });

  test('encuentra con preguntas en español (etiquetas bilingües)', () => {
    assert.match(firstLine('¿Dónde vive y qué hace ahora?'), /\[profile\].*Madrid, Spain/);
    assert.match(tool.run({ query: '¿Qué proyectos ha construido?' }), /\[projects\]/);
    assert.match(tool.run({ query: 'aficiones' }), /\[interests\]/);
  });

  test('el caso de estudio lleva su enlace para que el agente lo dé', () => {
    assert.match(tool.run({ query: 'Entrenador case study' }), /https:\/\/alejandrocerezo\.dev\/#cv\/entrenador/);
  });

  test('la experiencia muestra la progresión en IndraMind y sin las cifras retiradas', () => {
    const result = tool.run({ query: 'IndraMind experience internship analyst' });
    assert.match(result, /CRC Analyst, Cyber Risk & Compliance \(2026-05 - present\), then Cybersecurity Intern, GRC/);
    assert.match(result, /Offered a full-time analyst role before the end of my internship/);
    assert.doesNotMatch(tool.run({ query: 'automation reporting hours minutes' }), /2 hours|2-hour|10 minutes/);
  });

  test('el caso de estudio de Entrenador (lo verificado) está disponible', () => {
    assert.match(tool.run({ query: 'Entrenador case study' }), /Case study of the project Entrenador.*Key decision:/);
  });

  test('nunca devuelve contenido pendiente de revisar (verified: false)', () => {
    const results = [
      'Entrenador problem architecture subscription Strava Hevy',
      'Maxieventos children events',
      'what is he looking for Solutions Engineer remote Europe',
      'Daniels Gabbett warning recovery week',
    ]
      .map((query) => tool.run({ query }))
      .join('\n');
    const pending = pendingItems(profile).filter((p) => p.kind === 'unverified' && p.langs.includes('en'));
    assert.ok(pending.length > 0);
    for (const { id, node } of pending) {
      if (node.en) assert.ok(!results.includes(node.en.trim()), id);
    }
    assert.doesNotMatch(results, /subscription|Hevy|Gabbett|remote in Europe/);
  });

  test('un bullet con verified: false no llega al agente; al verificarlo, sí', () => {
    assert.doesNotMatch(createCvTool(parseProfile(tinyProfile(false))).run({ query: 'quantum widget' }), /Quantum widget/);
    assert.match(createCvTool(parseProfile(tinyProfile(true))).run({ query: 'quantum widget' }), /Quantum widget/);
  });

  test('solo ve lo del canal "agent": las certificaciones solo de LinkedIn no están', () => {
    assert.equal(tool.hasResults('MATLAB Onramp pivot tables'), false);
    assert.equal(profileView(profile, { channel: 'linkedin', lang: 'en' }).certifications.length, 6);
  });

  test('encuentra por nombre de sección', () => {
    assert.match(tool.run({ query: 'experience' }), /\[experience\]/);
  });

  test('ordena por relevancia y limita el número de resultados', () => {
    const lines = tool.run({ query: 'experience cybersecurity compliance' }).split('\n').slice(0, -1);
    assert.ok(lines.length <= 6);
    assert.match(lines[0], /IndraMind/);
  });

  test('una sección completa cabe en los resultados (4 proyectos)', () => {
    const lines = tool.run({ query: 'projects' }).split('\n');
    assert.equal(lines.filter((l) => l.startsWith('[projects] Project:')).length, 4);
  });

  test('"it" (IT) no coincide con palabras más largas como "items"', () => {
    assert.doesNotMatch(tool.run({ query: 'items' }), /\[skills\]/);
  });

  test('los resultados acaban con el recordatorio de no responder fuera de tema', () => {
    assert.match(tool.run({ query: 'Madrid' }).split('\n').at(-1), /^Note: .*only answer questions about him/);
  });

  test('hasResults indica si una consulta encuentra algo', () => {
    assert.equal(tool.hasResults('DORA'), true);
    assert.equal(tool.hasResults('And before that?'), false);
  });

  test('sin resultados, indica las secciones disponibles', () => {
    assert.match(tool.run({ query: 'astronaut' }), /No results.*Available sections/);
  });

  test('rechaza una consulta vacía o que no es texto', () => {
    assert.match(tool.run({ query: '  ' }), /^Error/);
    assert.match(tool.run({}), /^Error/);
  });
});
