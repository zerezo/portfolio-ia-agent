import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../profile/load.js';
import { profileView } from '../profile/view.js';
import { cvHtml, trimCandidates } from '../profile/cv-html.js';
import { formatMonth, formatPeriod } from '../profile/format.js';

// La plantilla del CV en PDF, sin navegador (el PDF real lo prueba npm run cv -- --check en el CI).
const profile = loadProfile();
const view = (lang = 'en', variant) => profileView(profile, { channel: 'cv', lang, variant });

describe('CV en PDF: plantilla', () => {
  test('compatible con ATS: sin tablas, imágenes, iconos ni columnas, y fuentes estándar', () => {
    const html = cvHtml(view());
    assert.doesNotMatch(html, /<(table|img|svg|canvas|iframe)\b/i);
    assert.doesNotMatch(html, /columns?:|display:\s*(grid|flex)|float:|@font-face|url\(/i);
    assert.match(html, /font-family: Arial, "Liberation Sans", Helvetica, sans-serif/);
  });

  test('una sola fuente de verdad: contenido del perfil en el idioma pedido, sin teléfono', () => {
    const en = cvHtml(view('en'));
    const es = cvHtml(view('es'));
    assert.match(en, /<h1>Alejandro Cerezo Gilarranz<\/h1>/);
    assert.match(en, /<h2>Projects<\/h2>[\s\S]*<h2>Experience<\/h2>/);
    assert.match(es, /<h2>Proyectos<\/h2>[\s\S]*<h2>Experiencia<\/h2>/);
    assert.match(en, /alezerezo@gmail\.com/);
    assert.match(es, /Segovia y Madrid, España/);
    assert.doesNotMatch(en + es, /\+34|651/);
    assert.doesNotMatch(en, /Maxieventos|MATLAB/);
  });

  test('escapa el texto', () => {
    const v = view();
    const html = cvHtml({ ...v, summary: [{ id: 'x', text: '<script>alert(1)</script> & co' }] });
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; co/);
  });

  test('lo recortado no aparece', () => {
    const html = cvHtml(view(), { dropped: new Set(['portfolio-ci', 'fotomaton']) });
    assert.doesNotMatch(html, /CI on GitHub Actions|Fotomatón/);
  });

  test('las URLs no se parten entre líneas (ATS)', () => {
    assert.match(cvHtml(view()), /a, \.nw \{ white-space: nowrap; \}/);
  });
});

describe('CV en PDF: orden de recorte', () => {
  test('primero la prioridad 3, después solo bullets de prioridad 2; nunca la prioridad 1', () => {
    const candidates = trimCandidates(view());
    const priorities = candidates.map((c) => c.priority);
    assert.deepEqual(priorities, [...priorities].sort((a, b) => b - a));
    assert.ok(candidates.every((c) => c.priority === 3 || (c.priority === 2 && c.isBullet)));
    const ids = candidates.map((c) => c.id);
    for (const keep of ['summary', 'portfolio-agent', 'entrenador-mcp-server', 'crc-automation', 'upm', 'portfolio', 'tfg']) {
      assert.ok(!ids.includes(keep), keep);
    }
  });

  test('dentro de cada prioridad, recorta desde el final del CV', () => {
    const ids = trimCandidates(view()).map((c) => c.id);
    assert.ok(ids.indexOf('interest-football') < ids.indexOf('fotomaton'));
    // Los dos son bullets de prioridad 2: el del TFG está más abajo, así que se recorta antes.
    assert.ok(ids.indexOf('tfg-architecture') < ids.indexOf('homecargarage-app'));
    // Los bullets heredan la prioridad del proyecto: los del portfolio (1) no se recortan.
    assert.ok(!ids.includes('portfolio-meetings'));
  });

  test('una variante protege lo etiquetado: sube un punto de prioridad', () => {
    const base = trimCandidates(view()).map((c) => c.id);
    const fde = trimCandidates(view('en', 'fde')).map((c) => c.id);
    assert.ok(base.includes('fotomaton') && !fde.includes('fotomaton'));
  });
});

describe('fechas', () => {
  test('en inglés y en español', () => {
    assert.equal(formatMonth('2026-05', 'en'), 'May 2026');
    assert.equal(formatMonth('2025-09', 'es'), 'sept 2025');
    assert.equal(formatMonth(null, 'es'), 'actualidad');
    assert.equal(formatPeriod('2025', '2025', 'en'), '2025');
    assert.equal(formatPeriod('2025-09', '2026-05', 'en'), 'Sep 2025 – May 2026');
  });
});
