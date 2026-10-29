import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCv, parseCv } from '../cv.js';

const MINIMAL = `---
name: Ana
headline: Engineer
location: Madrid
linkedin: https://www.linkedin.com/in/ana
---
<!-- nota para el autor -->
## Summary
Line one
line two.

## Experience
### Analyst
- company: ACME
- start: 2025-01
- end: present
- location: Madrid
- tags: risk, GRC

Does things.
Over two lines.

## Education
### Degree
- institution: UPM
- start: 2020
- end: 2024

## Skills
- Networks

## Certifications
### ISO 27001
- tags: ISMS

## Languages
- English: C1: fluent

## Projects
### Tracker
- type: Personal project
- status: in progress
- url: https://example.com

An app.

## Interests
### Running
Half marathons.
`;

describe('parseCv', () => {
  const cv = parseCv(MINIMAL);

  test('lee la cabecera y el resumen en una sola línea', () => {
    assert.deepEqual(cv.profile, { name: 'Ana', headline: 'Engineer', location: 'Madrid', summary: 'Line one line two.' });
    assert.equal(cv.contact.linkedin, 'https://www.linkedin.com/in/ana');
  });

  test('cada "###" es un elemento con sus campos y su descripción', () => {
    assert.deepEqual(cv.experience, [
      {
        company: 'ACME',
        role: 'Analyst',
        start: '2025-01',
        end: null,
        location: 'Madrid',
        description: 'Does things. Over two lines.',
        tags: ['risk', 'GRC'],
      },
    ]);
    assert.deepEqual(cv.projects[0], {
      name: 'Tracker',
      type: 'Personal project',
      status: 'in progress',
      description: 'An app.',
      url: 'https://example.com',
      tags: [],
    });
    assert.deepEqual(cv.interests[0], { topic: 'Running', description: 'Half marathons.', tags: [] });
  });

  test('listas simples e idiomas (el nivel puede contener ": ")', () => {
    assert.deepEqual(cv.skills, ['Networks']);
    assert.deepEqual(cv.languages, [{ language: 'English', level: 'C1: fluent' }]);
  });

  test('admite saltos de línea de Windows', () => {
    assert.deepEqual(parseCv(MINIMAL.replace(/\n/g, '\r\n')), cv);
  });

  test('un CV mal formado detiene el arranque con un mensaje claro', () => {
    assert.throws(() => parseCv('## Summary\nx'), /falta la cabecera/);
    assert.throws(() => parseCv(MINIMAL.replace('## Skills', '## Skill')), /falta la sección "## Skills"/);
    assert.throws(() => parseCv(MINIMAL.replace('- company: ACME\n', '')), /falta "company" en "Analyst"/);
  });
});

describe('data/cv.md', () => {
  test('el CV real tiene todas las secciones y un puesto actual', () => {
    const cv = loadCv();
    for (const key of ['experience', 'education', 'skills', 'certifications', 'languages', 'projects', 'interests']) {
      assert.ok(cv[key].length > 0, key);
    }
    assert.ok(cv.experience.some((e) => e.end === null));
  });
});
