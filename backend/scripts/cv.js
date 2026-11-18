// npm run cv — genera el CV en PDF (EN y ES) desde data/profile.yaml.
//
//   npm run cv                        -> frontend/public/cv/cv-alejandro-cerezo-{en,es}.pdf (los de la web)
//   npm run cv -- --variant fde       -> exports/variants/cv-alejandro-cerezo-fde-{en,es}.pdf (sin versionar)
//   npm run cv -- --private           -> private/cv-alejandro-cerezo-private-{en,es}.pdf, con el teléfono de
//                                        private/contact.yaml (carpeta ignorada por Git: no se publica)
//   npm run cv -- --check             -> los regenera aparte con los mismos recortes (exports/cv-trim.json),
//                                        los valida y comprueba que los de la web están al día (mismo
//                                        texto). Lo usa el CI. Los recortes se guardan porque Linux
//                                        (Liberation Sans) y Windows (Arial) no parten las líneas igual.
//
// EN y ES llevan siempre los mismos recortes (mismo contenido en los dos idiomas): se recorta hasta
// que los dos caben en una página. Usa el Chrome instalado (playwright-core no descarga
// navegadores); otra ruta: CHROME_PATH.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { extractText, getDocumentProxy } from 'unpdf';
import { parse } from 'yaml';
import { loadProfile } from '../profile/load.js';
import { profileView } from '../profile/view.js';
import { cvHtml, trimCandidates } from '../profile/cv-html.js';
import { findConfidential } from '../profile/checks.js';
import { LABELS } from '../profile/format.js';
import { LANGS } from '../profile/schema.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB_DIR = join(ROOT, 'frontend', 'public', 'cv');
const VARIANT_DIR = join(ROOT, 'exports', 'variants');
const PRIVATE_DIR = join(ROOT, 'private');
const TRIM_FILE = join(ROOT, 'exports', 'cv-trim.json');
const MAX_PAGES = 1;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : (args[i + 1] ?? '');
};
const check = args.includes('--check');
const isPrivate = args.includes('--private');
const variant = option('variant');
const fileName = (lang) =>
  `cv-alejandro-cerezo-${isPrivate ? 'private-' : ''}${variant ? `${variant}-` : ''}${lang}.pdf`;

// Teléfono de la variante privada: solo en private/contact.yaml (nunca en el repo, que es público).
function privatePhone() {
  const file = join(PRIVATE_DIR, 'contact.yaml');
  if (!existsSync(file)) throw new Error('falta private/contact.yaml (phone: "+34 …") para la variante privada');
  const { phone } = parse(readFileSync(file, 'utf8')) ?? {};
  if (!phone) throw new Error('private/contact.yaml: falta "phone"');
  return String(phone);
}

async function readPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const links = [];
  for (let n = 1; n <= totalPages; n += 1) {
    const annotations = await (await pdf.getPage(n)).getAnnotations();
    links.push(...annotations.filter((a) => a.subtype === 'Link' && a.url).map((a) => a.url));
  }
  return { pages: totalPages, text, links };
}

// Comprobaciones del PDF final: páginas, texto extraíble, enlaces clicables, contenido esperado y
// confidencialidad.
async function validate(buffer, view, phone) {
  const { pages, text, links } = await readPdf(buffer);
  const errors = [];
  if (pages > MAX_PAGES) errors.push(`${pages} páginas (máximo ${MAX_PAGES})`);
  if (text.replace(/\s/g, '').length < 1500) errors.push('apenas hay texto extraíble');
  for (const expected of [view.basics.name, view.basics.headline, LABELS[view.lang].projects, LABELS[view.lang].experience]) {
    if (!text.toLowerCase().includes(expected.toLowerCase())) errors.push(`falta "${expected}" en el texto`);
  }
  const expectedLinks = [...view.basics.links.map((l) => l.url), ...(view.basics.email ? [`mailto:${view.basics.email}`] : [])];
  for (const url of expectedLinks) {
    if (!links.some((l) => l.replace(/\/$/, '') === url.replace(/\/$/, ''))) errors.push(`el enlace ${url} no es clicable`);
  }
  if (phone && !text.includes(phone)) errors.push('falta el teléfono en la variante privada');
  if (!phone && /\+34|651 ?595/.test(text)) errors.push('el teléfono aparece en un CV público');
  const leaked = findConfidential(text);
  if (leaked.length) errors.push(`nombres de clientes: ${leaked.join(', ')}`);
  if (/\bTODO\b/.test(text)) errors.push('contiene un TODO');
  return { pages, text, links, errors };
}

// Imprime EN y ES con los mismos recortes. Recorta en orden de prioridad hasta que los dos caben;
// después devuelve lo recortado que quepa, de lo más importante a lo menos, sin inversiones (lo de
// prioridad 3 solo vuelve si no queda fuera nada de prioridad 2).
// fixed: recortes ya decididos (--check): se imprime con ellos, sin volver a buscar.
async function renderBoth(browser, views, { fixed, phone }) {
  const page = await browser.newPage();
  const print = async (dropped) => {
    const out = {};
    for (const view of views) {
      await page.setContent(cvHtml(view, { dropped, phone }), { waitUntil: 'load' });
      const buffer = await page.pdf({ format: 'A4', printBackground: false, preferCSSPageSize: true, tagged: true });
      out[view.lang] = { buffer, fits: (await readPdf(buffer)).pages <= MAX_PAGES };
    }
    return out;
  };
  const fitsAll = (result) => Object.values(result).every((r) => r.fits);
  try {
    if (fixed) return { result: await print(new Set(fixed)), dropped: fixed };
    const dropped = new Set();
    const candidates = trimCandidates(views[0]);
    let result = await print(dropped);
    while (!fitsAll(result)) {
      const next = candidates.shift();
      if (!next) throw new Error(`no cabe en ${MAX_PAGES} página ni recortando todo lo recortable (prioridad 3 y bullets de prioridad 2)`);
      dropped.add(next.id);
      result = await print(dropped);
    }
    const priority = new Map(trimCandidates(views[0]).map((c) => [c.id, c.priority]));
    for (const level of [2, 3]) {
      if (level === 3 && [...dropped].some((id) => priority.get(id) === 2)) break;
      for (const id of [...dropped].reverse().filter((d) => priority.get(d) === level)) {
        dropped.delete(id);
        const attempt = await print(dropped);
        if (fitsAll(attempt)) result = attempt;
        else dropped.add(id);
      }
    }
    return { result, dropped: [...dropped] };
  } finally {
    await page.close();
  }
}

const normalize = (text) => text.replace(/\s+/g, '');

async function main() {
  const profile = loadProfile();
  const phone = isPrivate ? privatePhone() : undefined;
  const outDir = check ? mkdtempSync(join(tmpdir(), 'cv-')) : isPrivate ? PRIVATE_DIR : variant ? VARIANT_DIR : WEB_DIR;
  mkdirSync(outDir, { recursive: true });
  const problems = [];
  const recorded = check && existsSync(TRIM_FILE) ? JSON.parse(readFileSync(TRIM_FILE, 'utf8')) : {};
  if (check && !existsSync(TRIM_FILE)) problems.push('falta exports/cv-trim.json (npm run cv)');

  const views = LANGS.map((lang) => profileView(profile, { channel: 'cv', lang, variant }));
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
  let dropped;
  try {
    const rendered = await renderBoth(browser, views, { fixed: check ? (recorded.dropped ?? []) : undefined, phone });
    dropped = rendered.dropped;
    const checked = {};
    for (const view of views) {
      const { buffer } = rendered.result[view.lang];
      const name = fileName(view.lang);
      const validation = await validate(buffer, view, phone);
      checked[view.lang] = validation;
      writeFileSync(join(outDir, name), buffer);
      console.log(`${name}: ${validation.pages} página, ${validation.text.length} caracteres, ${validation.links.length} enlaces`);
      validation.errors.forEach((e) => problems.push(`${name}: ${e}`));

      // --check: los PDF publicados en la web tienen que coincidir con lo que sale ahora del perfil.
      if (check && !variant && !isPrivate) {
        const published = join(WEB_DIR, name);
        if (!existsSync(published)) problems.push(`${name}: no está en frontend/public/cv (npm run cv)`);
        else if (normalize((await readPdf(readFileSync(published))).text) !== normalize(validation.text)) {
          problems.push(`${name}: el PDF de la web no está al día con profile.yaml (npm run cv)`);
        }
      }
    }
    // Mismo contenido en los dos idiomas: mismos recortes (por construcción) y mismos enlaces.
    if (checked.en.links.join() !== checked.es.links.join()) problems.push('EN y ES no tienen los mismos enlaces');
    if (dropped.length) console.log(`Recortado en los dos idiomas: ${dropped.join(', ')}`);
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  if (!check) {
    if (!variant && !isPrivate) writeFileSync(TRIM_FILE, `${JSON.stringify({ dropped }, null, 2)}\n`);
    console.log(`Guardados en ${outDir}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
