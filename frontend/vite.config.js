import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { parse as parseYaml } from 'yaml';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { markdownToHtml } from './tools/markdown.js';

const PRIVACY_SOURCE = new URL('../PRIVACY.md', import.meta.url);
// Perfil: la única fuente del título, la descripción y Open Graph de la web (y del CV).
const PROFILE_SOURCE = new URL('../backend/data/profile.yaml', import.meta.url);
const PROFILE_PLACEHOLDER = /<!-- profile-meta:.*-->/;

const escapeAttr = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// <title>, meta description, Open Graph y Twitter desde basics de profile.yaml. Sin og:image
// todavía (pendiente: imagen para compartir). El backend valida el esquema en el CI.
function profileMetaTags() {
  const { basics } = parseYaml(readFileSync(PROFILE_SOURCE, 'utf8'));
  const { title, description } = basics.meta;
  const site = `${new URL(basics.links.find((l) => l.id === 'website').url).origin}/`;
  const meta = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`;
  return [
    `<title>${escapeAttr(title)}</title>`,
    meta('name', 'description', description),
    `<link rel="canonical" href="${escapeAttr(site)}" />`,
    meta('property', 'og:type', 'profile'),
    meta('property', 'og:site_name', basics.name),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', site),
    meta('property', 'og:locale', 'en_GB'),
    meta('name', 'twitter:card', 'summary'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
  ].join(`
    `);
}

// Página de la política de privacidad generada desde PRIVACY.md (la única fuente del texto).
function privacyPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Privacy Policy · Alejandro Cerezo Gilarranz</title>
<link rel="stylesheet" href="/privacy.css">
</head>
<body>
<main>
<p><a href="/">← Back to the portfolio</a></p>
${markdownToHtml(readFileSync(PRIVACY_SOURCE, 'utf8'))}
</main>
</body>
</html>
`;
}

// Cabeceras de seguridad para Cloudflare Pages (archivo _headers). La CSP solo permite
// scripts y estilos propios y conexiones a la propia web y a la API.
function securityHeaders(apiUrl) {
  const apiOrigin = apiUrl ? new URL(apiUrl).origin : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
`;
}

function sitePages(apiUrl) {
  return {
    name: 'site-pages',
    // En desarrollo, /privacy.html se genera al vuelo desde PRIVACY.md.
    configureServer(server) {
      server.middlewares.use('/privacy.html', (req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(privacyPage());
      });
    },
    // Metadatos de la página desde el perfil (también en desarrollo).
    transformIndexHtml(html) {
      if (!PROFILE_PLACEHOLDER.test(html)) throw new Error('index.html: falta el comentario profile-meta');
      return html.replace(PROFILE_PLACEHOLDER, profileMetaTags());
    },
    // Al compilar, se añaden al resultado privacy.html y _headers.
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'privacy.html', source: privacyPage() });
      this.emitFile({ type: 'asset', fileName: '_headers', source: securityHeaders(apiUrl) });
    },
  };
}

// En desarrollo, /api se redirige al backend local: mismo origen, sin CORS.
// En producción el frontend (Cloudflare Pages) llama a la API con VITE_API_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss(), sitePages(env.VITE_API_URL)],
    // Alias de shadcn/ui: @/components/ui/... -> src/components/ui/...
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});
