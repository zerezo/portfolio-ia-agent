import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../profile/load.js';
import { profileView } from '../profile/view.js';
import { LIMITS, linkedinMarkdown } from '../profile/linkedin.js';
import { findConfidential } from '../profile/checks.js';

const profile = loadProfile();
const markdown = (lang) => linkedinMarkdown(profileView(profile, { channel: 'linkedin', lang }));

describe('textos para LinkedIn', () => {
  test('incluye titular, acerca de, un bloque por puesto y por proyecto y las aptitudes', () => {
    const { markdown: md } = markdown('en');
    assert.match(md, /## Titular · 143\/220/);
    assert.match(md, /AI \/ Forward Deployed Engineer · I build and ship LLM agents/);
    for (const role of ['CRC Analyst, Cyber Risk & Compliance', 'Cybersecurity Intern, GRC', 'Sales representative', 'Event staff', 'Activity leader and coordinator']) {
      assert.match(md, new RegExp(`### ${role.replace(/[()]/g, '\\$&')} · `), role);
    }
    for (const project of ['Portfolio AI Agent', 'Entrenador', 'HomeCarGarage', 'Multi-Domain Operations']) {
      assert.match(md, new RegExp(`### ${project}`), project);
    }
    assert.match(md, /### Aptitudes principales \(5\/5\)/);
    assert.match(md, /- MATLAB Onramp/);
  });

  test('el perfil actual cabe en todos los límites', () => {
    for (const lang of ['en', 'es']) assert.deepEqual(markdown(lang).warnings, [], lang);
  });

  test('avisa si un campo se pasa del límite', () => {
    const view = profileView(profile, { channel: 'linkedin', lang: 'en' });
    const long = { ...view, linkedin: { ...view.linkedin, headline: 'x'.repeat(LIMITS.headline + 1) } };
    const { markdown: md, warnings } = linkedinMarkdown(long);
    assert.deepEqual(warnings, ['Titular: 221/220 caracteres']);
    assert.match(md, /⚠️ 221\/220, se pasa del límite/);
  });

  test('lo pendiente de revisar no sale: en español faltan el titular y el acerca de', () => {
    const { markdown: md } = markdown('es');
    assert.match(md, /## Titular · falta\n\n⚠️ Pendiente de revisar/);
    assert.match(md, /## Acerca de · falta/);
    assert.doesNotMatch(md, /Maxieventos|Construyo y despliego/);
    assert.doesNotMatch(markdown('en').markdown, /What I build:|What I'm looking for/);
  });

  test('sin nombres de clientes ni TODO', () => {
    for (const lang of ['en', 'es']) {
      const { markdown: md } = markdown(lang);
      assert.deepEqual(findConfidential(md), []);
      assert.doesNotMatch(md, /\bTODO\b/);
    }
  });
});
