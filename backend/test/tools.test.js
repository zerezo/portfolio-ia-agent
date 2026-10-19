import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCvTool, loadCv } from '../tools.js';

// Usa el cv.json real: además valida que el archivo tenga la estructura esperada.
const tool = createCvTool(loadCv());

describe('buscar_en_cv', () => {
  test('encuentra certificaciones por palabra clave', () => {
    assert.match(tool.run({ consulta: 'DORA' }), /\[certificaciones\].*DORA/);
  });

  test('las palabras raras pesan más que las comunes', () => {
    // "experiencia" coincide con cinco fragmentos; DORA solo con uno, que debe ir primero.
    assert.match(tool.run({ consulta: 'DORA experiencia' }).split('\n')[0], /DORA/);
  });

  test('busca con la pregunta completa del usuario (llamada forzada)', () => {
    assert.match(tool.run({ consulta: '¿Qué hace en su tiempo libre?' }).split('\n')[0], /\[intereses\]/);
  });

  test('ignora tildes y mayúsculas', () => {
    assert.match(tool.run({ consulta: 'MARATON' }), /Behobia/);
  });

  test('encuentra por etiquetas aunque no aparezcan en el texto', () => {
    assert.match(tool.run({ consulta: 'liderazgo' }), /capitán/);
  });

  test('encuentra aficiones con sinónimos habituales', () => {
    for (const consulta of ['tiempo libre', 'hobbies', 'aficiones']) {
      assert.match(tool.run({ consulta }), /\[intereses\]/, consulta);
    }
  });

  test('encuentra por nombre de sección', () => {
    assert.match(tool.run({ consulta: 'experiencia' }), /\[experiencia\]/);
  });

  test('ordena por relevancia y limita el número de resultados', () => {
    const lines = tool.run({ consulta: 'experiencia ciberseguridad riesgos' }).split('\n');
    assert.ok(lines.length <= 6);
    assert.match(lines[0], /IndraMind/);
  });

  test('una sección completa cabe en los resultados (6 certificaciones)', () => {
    const lines = tool.run({ consulta: '¿Qué certificaciones tiene?' }).split('\n');
    assert.equal(lines.filter((l) => l.startsWith('[certificaciones]')).length, 6);
  });

  test('sin resultados, indica las secciones disponibles', () => {
    assert.match(tool.run({ consulta: 'astronauta' }), /Sin resultados.*Secciones disponibles/);
  });

  test('rechaza una consulta vacía o que no es texto', () => {
    assert.match(tool.run({ consulta: '  ' }), /^Error/);
    assert.match(tool.run({}), /^Error/);
  });
});
