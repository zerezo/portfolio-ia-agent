// Formato de fechas y etiquetas compartido por el CV en PDF y los textos de LinkedIn.

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'mayo', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
};
const PRESENT = { en: 'Present', es: 'actualidad' };

// "2026-05" -> "May 2026" / "mayo 2026"; "2025" -> "2025"; null -> "Present" / "actualidad".
export function formatMonth(value, lang) {
  if (!value) return PRESENT[lang];
  const [year, month] = value.split('-');
  return month ? `${MONTHS[lang][Number(month) - 1]} ${year}` : year;
}

// Un solo valor si empieza y acaba igual ("2025").
export const formatPeriod = (start, end, lang) =>
  start === end ? formatMonth(start, lang) : `${formatMonth(start, lang)} – ${formatMonth(end, lang)}`;

export const LABELS = {
  en: {
    summary: 'Summary',
    projects: 'Projects',
    experience: 'Experience',
    skills: 'Skills',
    languages: 'Languages',
    education: 'Education',
    certifications: 'Certifications',
    interests: 'Interests',
    earlier: 'Earlier',
  },
  es: {
    summary: 'Perfil',
    projects: 'Proyectos',
    experience: 'Experiencia',
    skills: 'Competencias',
    languages: 'Idiomas',
    education: 'Formación',
    certifications: 'Certificaciones',
    interests: 'Intereses',
    earlier: 'Antes',
  },
};
