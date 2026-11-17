// npm run profile:review — lista lo que falta por escribir (TODO) y lo pendiente de revisar
// (verified: false) en data/profile.yaml, con el texto, para revisarlo de una vez.
import { loadProfile } from '../profile/load.js';
import { pendingItems } from '../profile/checks.js';

const preview = (node, lang) => {
  const value = node[lang] ?? node.title?.[lang] ?? node.name?.[lang] ?? node.company;
  return typeof value === 'string' ? value.trim() : JSON.stringify(value);
};

const pending = pendingItems(loadProfile());
const todos = pending.filter((p) => p.kind === 'todo');
const unverified = pending.filter((p) => p.kind === 'unverified');

console.log(`\nPendiente de revisar (${unverified.length}): cambia "verified" a true en profile.yaml cuando esté bien.\n`);
for (const { id, langs, node } of unverified) {
  console.log(`- ${id} [${langs.join(', ')}]`);
  for (const lang of langs) console.log(`    ${lang}: ${preview(node, lang)}`);
}
console.log(`\nFalta por escribir (${todos.length}):\n`);
for (const { path, text } of todos) console.log(`- ${path}: ${text}`);
console.log('\nDespués: npm run cv && npm run linkedin');
