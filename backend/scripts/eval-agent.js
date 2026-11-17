// npm run eval:agent — evals del agente con el modelo real (no van en el CI: los tests nunca
// llaman a un modelo). Envía preguntas de recruiter por el mismo camino que la web (filtro previo,
// agente y herramientas) y comprueba cada respuesta con reglas por código.
//
//   npm run eval:agent                          -> con el proveedor de backend/.env (Ollama por defecto, gratis)
//   LLM_PROVIDER=anthropic npm run eval:agent   -> con Claude (cuesta tokens: úsalo puntualmente)
import 'dotenv/config';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createLlm } from '../llm.js';
import { createMemorySessionStore } from '../sessions.js';
import { createCvTool, loadProfile } from '../tools.js';
import { createKnowledgeTool, createLocalSource } from '../knowledge.js';
import { profileView } from '../profile/view.js';

// Coletillas y debilidades que no deben aparecer sin que se pregunten.
const FILLER = /according to|based on the information|describes himself|the tools say|según (su|el) cv|se describe/i;
const WEAKNESS = /little professional experience|poca experiencia profesional/i;
const OFFERS_CALL = /\b(call|meeting|book)\b|llamada|reuni[oó]n|reservar/i;
const SPANISH = /\b(es|su|sus|en|con|que|ha|él)\b/i;

const CASES = [
  {
    q: 'Why is he a good fit for a Forward Deployed Engineer role?',
    checks: [
      ['sin coletillas', (a) => !FILLER.test(a)],
      ['no adelanta debilidades', (a) => !WEAKNESS.test(a)],
      ['ofrece una llamada', (a) => OFFERS_CALL.test(a)],
    ],
  },
  {
    q: '¿Por qué encaja en un puesto de Forward Deployed Engineer?',
    checks: [
      ['responde en español', (a) => SPANISH.test(a)],
      ['sin coletillas', (a) => !FILLER.test(a)],
      ['no adelanta debilidades', (a) => !WEAKNESS.test(a)],
      ['ofrece una llamada', (a) => OFFERS_CALL.test(a)],
    ],
  },
  {
    q: 'What has he built with LLMs?',
    checks: [
      ['nombra proyectos reales', (a) => /Portfolio AI Agent|Entrenador/i.test(a)],
      ['sin coletillas', (a) => !FILLER.test(a)],
    ],
  },
  {
    q: 'Tell me about the Entrenador MCP server',
    checks: [
      ['enlaza el caso de estudio', (a) => /alejandrocerezo\.dev\/#cv\/entrenador/.test(a)],
      ['sin coletillas', (a) => !FILLER.test(a)],
    ],
  },
  {
    q: 'How many years of experience does he have?',
    checks: [
      ['habla de su experiencia', (a) => /year|month|since|2025|2026/i.test(a)],
      ['da contexto con los proyectos', (a) => /project|production|producci/i.test(a)],
      ['sin cifras retiradas', (a) => !/2 hours|10 minutes/i.test(a)],
    ],
  },
];

const config = loadConfig({ ...process.env, LIMIT_PROFILE: 'amplio', DATABASE_URL: '' });
const llm = createLlm(config);
const profile = loadProfile();
const knowledge = createKnowledgeTool(createLocalSource(), { allowPlaceholders: false });
await knowledge.refresh();
const app = createApp({
  llm,
  tools: [createCvTool(profile), knowledge],
  profile: profileView(profile, { channel: 'web', lang: 'en' }),
  sessions: createMemorySessionStore(),
  config,
});

console.log(`Evals del agente con ${llm.name}\n`);
let failed = 0;
for (const { q, checks } of CASES) {
  const res = await request(app).post('/api/chat').send({ message: q });
  const answer = res.body.reply ?? `(error ${res.status}: ${res.body.error})`;
  const results = checks.map(([name, check]) => [name, res.status === 200 && check(answer)]);
  const ok = results.every(([, pass]) => pass);
  if (!ok) failed += 1;
  console.log(`${ok ? '✔' : '✘'} ${q}`);
  for (const [name, pass] of results) console.log(`    ${pass ? '✔' : '✘'} ${name}`);
  console.log(`    > ${answer.replace(/\s+/g, ' ').slice(0, 400)}\n`);
}
console.log(`${CASES.length - failed}/${CASES.length} casos superados`);
process.exit(failed ? 1 : 0);
