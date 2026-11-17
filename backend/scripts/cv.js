// npm run cv — genera el CV en PDF (EN y ES) desde data/profile.yaml.
//
//   npm run cv                        -> frontend/public/cv/cv-alejandro-cerezo-{en,es}.pdf (los de la web)
//   npm run cv -- --variant fde       -> exports/variants/cv-alejandro-cerezo-fde-{en,es}.pdf (sin versionar)
//   npm run cv -- --check             -> los regenera aparte, los valida y comprueba que los de la web
//                                        están al día (mismo texto). Lo usa el CI.
//
// Usa el Chrome instalado (playwright-core no descarga navegadores). Otra ruta: CHROME_PATH.
// Si no cabe en una página, recorta por prioridad (profile/cv-html.js) y avisa de lo recortado.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { extractText, getDocumentProxy } from 'unpdf';
import { loadProfile } from '../profile/load.js';
import { profileView } from '../profile/view.js';
import { cvHtml, trimCandidates } from '../profile/cv-html.js';
import { findConfidential } from '../profile/checks.js';
import { LABELS } from '../profile/format.js';
import { LANGS } from '../profile/schema.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB_DIR = join(ROOT, 'frontend', 'public', 'cv');
const VARIANT_DIR = join(ROOT, 'exports', 'variants');
const MAX_PAGES = 1;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : (args[i + 1] ?? '');
};
const check = args.includes('--check');
const variant = option('variant');
const fileName = (lang) => `cv-alejandro-cerezo-${variant ? `${variant}-` : ''}${lang}.pdf`;

async function pdfText(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { pages: totalPages, text };
}

// Comprobaciones del PDF final: páginas, texto extraíble, contenido esperado y confidencialidad.
async function validate(buffer, view) {
  const { pages, text } = await pdfText(buffer);
  const errors = [];
  if (pages > MAX_PAGES) errors.push(`${pages} páginas (máximo ${MAX_PAGES})`);
  if (text.replace(/\s/g, '').length < 1500) errors.push('apenas hay texto extraíble');
  for (const expected of [view.basics.name, view.basics.headline, LABELS[view.lang].projects, LABELS[view.lang].experience]) {
    if (!text.toLowerCase().includes(expected.toLowerCase())) errors.push(`falta "${expected}" en el texto`);
  }
  const leaked = findConfidential(text);
  if (leaked.length) errors.push(`nombres de clientes: ${leaked.join(', ')}`);
  if (/\bTODO\b/.test(text)) errors.push('contiene un TODO');
  return { pages, text, errors };
}

// Recorta en orden de prioridad hasta que cabe; después intenta devolver lo recortado, de lo más
// importante a lo menos, por si algo pequeño (una afición) se quitó sin hacer falta.
async function render(browser, view) {
  const page = await browser.newPage();
  const print = async (dropped) => {
    await page.setContent(cvHtml(view, { dropped }), { waitUntil: 'load' });
    const buffer = await page.pdf({ format: 'A4', printBackground: false, preferCSSPageSize: true, tagged: true });
    return { buffer, fits: (await pdfText(buffer)).pages <= MAX_PAGES };
  };
  try {
    const dropped = new Set();
    const candidates = trimCandidates(view);
    let result = await print(dropped);
    while (!result.fits) {
      const next = candidates.shift();
      if (!next) throw new Error(`no cabe en ${MAX_PAGES} página ni recortando todo lo recortable (prioridad 3 y bullets de prioridad 2)`);
      dropped.add(next.id);
      result = await print(dropped);
    }
    // Sin inversiones: lo de prioridad 3 solo vuelve si no queda fuera nada de prioridad 2.
    const priority = new Map(trimCandidates(view).map((c) => [c.id, c.priority]));
    for (const level of [2, 3]) {
      if (level === 3 && [...dropped].some((id) => priority.get(id) === 2)) break;
      for (const id of [...dropped].reverse().filter((d) => priority.get(d) === level)) {
        dropped.delete(id);
        const attempt = await print(dropped);
        if (attempt.fits) result = attempt;
        else dropped.add(id);
      }
    }
    return { buffer: (await print(dropped)).buffer, dropped: [...dropped] };
  } finally {
    await page.close();
  }
}

const normalize = (text) => text.replace(/\s+/g, '');

async function main() {
  const profile = loadProfile();
  const outDir = check ? mkdtempSync(join(tmpdir(), 'cv-')) : variant ? VARIANT_DIR : WEB_DIR;
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
  const problems = [];
  try {
    for (const lang of LANGS) {
      const view = profileView(profile, { channel: 'cv', lang, variant });
      const { buffer, dropped } = await render(browser, view);
      const { pages, text, errors } = await validate(buffer, view);
      const path = join(outDir, fileName(lang));
      writeFileSync(path, buffer);
      console.log(`${fileName(lang)}: ${pages} página, ${text.length} caracteres${dropped.length ? `, recortado: ${dropped.join(', ')}` : ''}`);
      errors.forEach((e) => problems.push(`${fileName(lang)}: ${e}`));

      // --check: los PDF publicados en la web tienen que coincidir con lo que sale ahora del perfil.
      if (check && !variant) {
        const published = join(WEB_DIR, fileName(lang));
        if (!existsSync(published)) problems.push(`${fileName(lang)}: no está en frontend/public/cv (npm run cv)`);
        else if (normalize((await pdfText(readFileSync(published))).text) !== normalize(text)) {
          problems.push(`${fileName(lang)}: el PDF de la web no está al día con profile.yaml (npm run cv)`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  if (!check) console.log(`Guardados en ${outDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
