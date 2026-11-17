import { z } from 'zod';

// Esquema de data/profile.yaml (la fuente única del perfil). Lo que no cumpla el esquema detiene
// el arranque del backend y hace fallar el CI (npm run profile:check y los tests).

export const CHANNELS = ['web', 'cv', 'linkedin', 'agent'];
export const LANGS = ['en', 'es'];

const str = z.string().trim().min(1);
// Texto bilingüe, o uno solo si no cambia con el idioma (nombres propios, tecnologías).
const Text = z.union([str, z.strictObject({ en: str, es: str })]);
const Verified = z.union([z.boolean(), z.strictObject({ en: z.boolean(), es: z.boolean() })]);
const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id en minúsculas, números y guiones');
const Url = z.string().regex(/^https:\/\/\S+$/, 'URL https');
// "2026-05" o "2026".
const DateStr = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'fecha AAAA o AAAA-MM');
const End = z.union([DateStr, z.literal('present')]);

// Metadatos de cada elemento; si faltan se heredan del padre y de "defaults" (load.js).
const meta = {
  tags: z.array(str).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  channels: z.array(z.enum(CHANNELS)).min(1).optional(),
  verified: Verified.optional(),
};
const Item = (shape) => z.strictObject({ id: Id, ...meta, ...shape });

const Bilingual = Item({ en: str, es: str });
const Link = z.strictObject({ label: str, url: Url });

// Sección del caso de estudio: párrafos propios o referencias a bullets ({ ref: id }), o un TODO.
const Paragraph = z.union([Bilingual, z.strictObject({ ref: Id })]);
const Section = z.union([z.array(Paragraph).min(1), str]);
export const CASE_STUDY_SECTIONS = ['problem', 'architecture', 'tools', 'keyDecision', 'evals', 'next'];
const CaseStudy = Item({
  ...Object.fromEntries(CASE_STUDY_SECTIONS.map((key) => [key, Section])),
  screenshots: str.optional(),
  video: str.optional(),
});

const Role = Item({
  title: Text,
  start: DateStr.optional(),
  end: End.optional(),
  bullets: z.array(Bilingual).min(1),
});

export const ProfileSchema = z.strictObject({
  defaults: z.strictObject({
    channels: z.array(z.enum(CHANNELS)).min(1),
    verified: z.boolean(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  basics: z.strictObject({
    name: str,
    headline: Text,
    location: Text,
    email: z.strictObject({ value: z.email(), channels: z.array(z.enum(CHANNELS)) }),
    links: z.array(Item({ label: str, url: Url })).min(1),
    meta: z.strictObject({ title: str, description: str.max(200, 'meta description: 200 caracteres como máximo') }),
  }),
  summary: z.array(Bilingual).min(1),
  linkedin: z.strictObject({
    ...meta,
    headline: Bilingual,
    about: z.array(Bilingual).min(1),
    topSkills: z.array(Id).max(5),
  }),
  skills: z.array(Item({ label: Text, items: z.array(Item({ name: Text })).min(1) })).min(1),
  languages: z.array(Item({ name: Text, level: Text })).min(1),
  projects: z
    .array(
      Item({
        name: Text,
        context: Text.optional(),
        date: str.optional(),
        links: z.array(Link).default([]),
        bullets: z.array(Bilingual).min(1),
        caseStudy: CaseStudy.optional(),
      }),
    )
    .min(1),
  experience: z
    .array(
      Item({
        company: str,
        companyNote: Text.optional(),
        location: str,
        start: DateStr.optional(),
        end: End.optional(),
        note: Text.optional(),
        roles: z.array(Role).min(1),
      }),
    )
    .min(1),
  education: z.array(Item({ degree: Text, institution: str, start: DateStr, end: End, note: Text.optional() })).min(1),
  certifications: z.array(Item({ name: Text })),
  interests: z.array(Item({ label: Text, text: Text })),
  variants: z.record(Id, z.strictObject({ tags: z.array(str).min(1), summary: z.strictObject({ en: str, es: str }).optional() })),
});
