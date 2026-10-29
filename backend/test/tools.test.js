import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCvTool, loadCv } from '../tools.js';

// Usa el cv.md real: además valida que el archivo tenga la estructura esperada.
const tool = createCvTool(loadCv());
const firstLine = (query) => tool.run({ query }).split('\n')[0];

describe('search_cv', () => {
  test('encuentra certificaciones por palabra clave', () => {
    assert.match(tool.run({ query: 'DORA' }), /\[certifications\].*DORA/);
  });

  test('las palabras raras pesan más que las comunes', () => {
    // "experience" coincide con cinco fragmentos; DORA solo con uno, que debe ir primero.
    assert.match(firstLine('DORA experience'), /DORA/);
  });

  test('busca con la pregunta completa del usuario (llamada forzada)', () => {
    assert.match(firstLine('What does he do in his free time?'), /\[interests\]/);
  });

  test('ignora tildes y mayúsculas', () => {
    assert.match(tool.run({ query: 'BEHOBIA' }), /Behobia/);
    assert.match(tool.run({ query: 'politecnica' }), /Politécnica/);
  });

  test('encuentra por etiquetas aunque no aparezcan en el texto', () => {
    assert.match(tool.run({ query: 'leadership' }), /captained/);
  });

  test('encuentra aficiones con sinónimos habituales', () => {
    for (const query of ['free time', 'hobbies', 'spare time', 'sports']) {
      assert.match(tool.run({ query }), /\[interests\]/, query);
    }
  });

  test('encuentra los proyectos, incluido el trabajo de fin de grado', () => {
    assert.match(firstLine('thesis'), /\[projects\].*military ontology/);
    assert.match(tool.run({ query: 'projects' }), /Car and component tracker/);
  });

  test('encuentra por nombre de sección', () => {
    assert.match(tool.run({ query: 'experience' }), /\[experience\]/);
  });

  test('ordena por relevancia y limita el número de resultados', () => {
    const lines = tool.run({ query: 'experience cybersecurity risk' }).split('\n').slice(0, -1);
    assert.ok(lines.length <= 6);
    assert.match(lines[0], /IndraMind/);
  });

  test('una sección completa cabe en los resultados (6 certificaciones)', () => {
    const lines = tool.run({ query: 'What certifications does he have?' }).split('\n');
    assert.equal(lines.filter((l) => l.startsWith('[certifications]')).length, 6);
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
