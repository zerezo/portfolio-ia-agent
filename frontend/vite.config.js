import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { markdownToHtml } from './tools/markdown.js';

const PRIVACY_SOURCE = new URL('../PRIVACY.md', import.meta.url);

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
    plugins: [react(), sitePages(env.VITE_API_URL)],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});
