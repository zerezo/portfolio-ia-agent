// npm run linkedin — genera exports/linkedin.en.md y exports/linkedin.es.md desde
// data/profile.yaml, con bloques listos para pegar en LinkedIn y la longitud de cada campo.
//   --check: no escribe; falla si los archivos versionados no están al día o hay nombres de
//            clientes (CI).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile } from '../profile/load.js';
import { profileView } from '../profile/view.js';
import { linkedinMarkdown } from '../profile/linkedin.js';
import { findConfidential } from '../profile/checks.js';
import { LANGS } from '../profile/schema.js';

const OUT_DIR = fileURLToPath(new URL('../../exports/', import.meta.url));
const check = process.argv.includes('--check');
const profile = loadProfile();
const problems = [];

mkdirSync(OUT_DIR, { recursive: true });
for (const lang of LANGS) {
  const { markdown, warnings } = linkedinMarkdown(profileView(profile, { channel: 'linkedin', lang }));
  const file = join(OUT_DIR, `linkedin.${lang}.md`);
  const leaked = findConfidential(markdown);
  if (leaked.length) problems.push(`linkedin.${lang}.md: nombres de clientes (${leaked.join(', ')})`);
  if (/\bTODO\b/.test(markdown)) problems.push(`linkedin.${lang}.md: contiene un TODO`);
  warnings.forEach((w) => console.warn(`⚠️  linkedin.${lang}.md: ${w}`));

  if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== markdown) problems.push(`linkedin.${lang}.md no está al día con profile.yaml (npm run linkedin)`);
  } else {
    writeFileSync(file, markdown);
    console.log(`exports/linkedin.${lang}.md${warnings.length ? ` (${warnings.length} avisos de longitud)` : ''}`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
