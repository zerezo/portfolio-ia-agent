import { isTodo } from './load.js';
import { LANGS } from './schema.js';

// Confidencialidad: los clientes del trabajo actual no se nombran nunca (se usa la redacción
// anonimizada: "a global automotive group", "a major Spanish telecom operator"). "orange"
// cubre también "MasOrange". Lo comprueban los tests, npm run profile:check y npm run cv.
const CONFIDENTIAL = /mercedes|orange/gi;

export function findConfidential(text) {
  return [...new Set(String(text).match(CONFIDENTIAL) ?? [])];
}

// Lo pendiente de Alejandro: textos TODO y elementos con verified: false (solo el elemento más
// alto de cada rama: sus hijos heredan el false). Lo usa npm run profile:review.
export function pendingItems(profile) {
  const pending = [];
  const visit = (value, path, parentVerified) => {
    if (typeof value === 'string') {
      if (isTodo(value)) pending.push({ kind: 'todo', path: path.join('.'), text: value.trim() });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, [...path, v?.id ?? i], parentVerified));
      return;
    }
    if (!value || typeof value !== 'object') return;
    let verified = parentVerified;
    if (value.id && value.verified) {
      const langs = LANGS.filter((lang) => !value.verified[lang] && parentVerified[lang]);
      if (langs.length && !value.ref) pending.push({ kind: 'unverified', id: value.id, langs, node: value });
      verified = value.verified;
    }
    for (const [key, child] of Object.entries(value)) {
      if (['id', 'tags', 'priority', 'channels', 'verified', 'variants'].includes(key)) continue;
      visit(child, [...path, key], verified);
    }
  };
  visit(profile, [], { en: true, es: true });
  return pending;
}
