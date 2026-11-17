// Filtro previo al modelo, sin IA: decide si un mensaje del chat llega al modelo o recibe una
// respuesta fija. Reduce el abuso (manipulación, preguntas fuera de tema) y el coste. No es
// infalible: la protección de fondo es que el modelo solo puede leer el CV y la base de conocimiento.

const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Frases típicas de manipulación del prompt (inglés y español), sobre el texto normalizado.
const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules?|prompts?|guidelines?|directions?)\b/,
  /\b(ignora|olvida|omite|salta(te)?)\b.{0,40}\b(instrucciones|reglas|normas|indicaciones)\b/,
  /\b(system|initial|hidden|original)\s+(prompt|message|instructions?)\b/,
  /\b(prompt|mensaje|instrucciones)\s+(del\s+)?sistema\b/,
  /\byou\s+are\s+(now|no\s+longer)\b/,
  /\b(ahora\s+eres|a\s+partir\s+de\s+ahora\s+eres)\b/,
  /\b(pretend|act|roleplay|role-play)\s+(to\s+be|as|that)\b/,
  /\b(finge|actua\s+como|haz\s+como\s+si)\b/,
  /\b(jailbreak|dan\s+mode|developer\s+mode|do\s+anything\s+now)\b/,
  /\b(reveal|show|print|repeat|leak)\b.{0,30}\b(prompt|instructions?|rules)\b/,
  /\b(new|updated)\s+instructions?\b/,
];

// Mensajes sobre el dueño del portfolio aunque no coincidan con el CV ("tell me about him").
const SUBJECT_PATTERN = /\b(alejandro|cerezo|gilarranz|he|him|his|himself)\b/;

// Un seguimiento corto ("and before that?") se acepta si la pregunta anterior era sobre él.
const MAX_FOLLOW_UP_WORDS = 8;

export const GUARD_REPLIES = {
  injection:
    "I can only answer questions about Alejandro's professional background: his experience, " +
    'certifications, projects or interests.',
  offTopic:
    "I can only help with questions about Alejandro's professional background: his experience, " +
    'certifications, projects or interests. What would you like to know?',
};

export function looksLikeInjection(message) {
  const text = normalize(message);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ¿Tiene sentido que el modelo responda? Cada herramienta de búsqueda (CV, base de
// conocimiento) indica con hasResults(query) si contiene algo.
export function isOnTopic(message, history, searchTools) {
  const found = (query) => searchTools.some((tool) => tool.hasResults(query));
  if (found(message)) return true;
  if (SUBJECT_PATTERN.test(normalize(message))) return true;

  const previous = history.findLast((m) => m.role === 'user')?.content;
  const words = message.trim().split(/\s+/).length;
  return Boolean(previous && words <= MAX_FOLLOW_UP_WORDS && found(`${previous} ${message}`));
}

// null si el mensaje puede llegar al modelo; si no, { reason, reply } con la respuesta fija.
// searchTools: una herramienta o una lista; sin ninguna no se filtra por tema.
export function guardMessage(message, history, searchTools = []) {
  const tools = [searchTools].flat();
  if (looksLikeInjection(message)) return { reason: 'injection', reply: GUARD_REPLIES.injection };
  if (tools.length && !isOnTopic(message, history, tools)) return { reason: 'off_topic', reply: GUARD_REPLIES.offTopic };
  return null;
}
