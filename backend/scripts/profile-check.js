// npm run profile:check — valida data/profile.yaml (esquema, reglas y confidencialidad) y
// resume qué publica cada salida. Sale con código 1 si algo falla: lo usa el CI.
import { readFileSync } from 'node:fs';
import { loadProfile, PROFILE_PATH } from '../profile/load.js';
import { profileView, viewStrings } from '../profile/view.js';
import { findConfidential, pendingItems } from '../profile/checks.js';
import { CHANNELS, LANGS } from '../profile/schema.js';

try {
  const profile = loadProfile();
  const problems = [];
  const found = findConfidential(readFileSync(PROFILE_PATH, 'utf8'));
  if (found.length) problems.push(`nombres de clientes en profile.yaml: ${found.join(', ')}`);

  for (const channel of CHANNELS) {
    for (const lang of LANGS) {
      for (const variant of [undefined, ...Object.keys(profile.variants)]) {
        const view = profileView(profile, { channel, lang, variant });
        const text = viewStrings(view).join('\n');
        const leaked = findConfidential(text);
        if (leaked.length) problems.push(`${channel}/${lang}: nombres de clientes (${leaked.join(', ')})`);
        if (/\bTODO\b/.test(text)) problems.push(`${channel}/${lang}: un TODO llega a la salida`);
        if (!variant) {
          console.log(
            `${channel.padEnd(8)} ${lang}: ${view.projects.length} proyectos, ` +
              `${view.experience.reduce((n, j) => n + j.roles.length, 0)} puestos, ` +
              `${view.skills.reduce((n, g) => n + g.items.length, 0)} competencias, ` +
              `${view.certifications.length} certificaciones`,
          );
        }
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const pending = pendingItems(profile);
  console.log(`profile.yaml válido. Pendiente: ${pending.length} (npm run profile:review).`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
