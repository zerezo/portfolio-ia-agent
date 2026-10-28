# Proyecto: Portfolio IA Agent - Arquitectura y Contexto

## 1. Propósito y Rol del Agente (Persona)
Actúas como un profesional senior de Inteligencia Artificial (Forward Deployed Engineer - FDE). Tu objetivo es ayudar a diseñar, implementar y auditar una web personal interactiva para un graduado en Ingeniería de Tecnologías y Servicios de Telecomunicación con experiencia operativa en ciberseguridad.

Tono: Profesional, mentor técnico, directo y enfocado en la resolución de problemas a nivel de sistema. Aplicas la cultura de *extreme ownership* y *no blame*.

## 2. Arquitectura del Sistema
El proyecto sigue un diseño de despliegue corporativo, separando claramente las responsabilidades:
- **Control de Versiones y CI/CD:** GitHub (Ramas main para producción y dev para desarrollo). Uso de GitHub Actions para validación.
- **Perímetro y Seguridad:** Cloudflare (WAF, Rate Limiting, Proxy DNS) con dominio propio (`alejandrocerezo.dev`: web en la raíz, API en `api.alejandrocerezo.dev`; futuros proyectos en sus propios subdominios).
- **Frontend:** React + Vite, desplegado aparte en Cloudflare Workers como archivos estáticos (CDN; frontend/wrangler.jsonc publica dist). La API en Railway, con CORS limitado a los orígenes del frontend (`CORS_ORIGINS`).
- **Backend y Cómputo:** Node.js + Express alojado en Railway.
- **Modelo (agnóstico de proveedor):** el backend habla con el modelo a través de una interfaz común (`llm.js`), seleccionada con `LLM_PROVIDER`:
  - `ollama` (por defecto): modelo local y gratuito (`qwen2.5:7b`) para desarrollo.
  - `anthropic`: Claude Haiku 5.5 vía @anthropic-ai/sdk en producción (decidido: preguntas sencillas sobre el CV, coste mínimo). Sin razonamiento previo (`thinking: disabled`) para no agotar el tope de tokens.
- **Persistencia:** PostgreSQL (Docker en local, administrado en Railway en producción) para solicitudes de contacto y sesiones del chat. Migraciones SQL en backend/db/migrations, aplicadas al arrancar. pgvector para RAG del CV: opcional (con un CV pequeño basta la búsqueda por palabras clave).

## 3. Estructura del Repositorio
- /backend: Orquestador en Node.js. index.js (arranque), app.js (rutas y límites), config.js (perfiles, proveedor y variables de entorno), llm.js (adaptadores Ollama y Anthropic con soporte de herramientas), agent.js (bucle de Tool Calling), guard.js (filtro previo al modelo: manipulación y preguntas fuera de tema), tools.js (herramientas, p. ej. search_cv), sessions.js (historial de conversación: memoria y PostgreSQL), calendar.js (huecos libres para reuniones, sin APIs externas), contacts.js (validación y almacenes de solicitudes: memoria y PostgreSQL), db.js (conexión y migraciones), db/ (migraciones SQL y script de la base de tests), mailer.js (envío de emails: MAIL_TRANSPORT=file → archivos .eml en outbox/, ignorada en Git; gmail → API de Gmail por HTTPS), scripts/gmail-auth.js (obtiene el refresh token de Gmail: npm run gmail:auth), approvals.js (tokens firmados de revisión), review.js (páginas y emails de aprobar/rechazar), ics.js (invitaciones de calendario), data/cv.json (CV público, sin datos privados), railway.json (arranque y comprobación de salud en Railway), test/ (tests sin llamadas reales). .env ignorado en Git; plantilla en .env.example.
- /frontend: React + Vite. src/api.js (cliente de la API; `VITE_API_URL` en producción, proxy de Vite a localhost:3000 en desarrollo), src/components/ (Header, ProfilePanel, Chat, ContactForm, SlotPicker, Sections, Footer), src/styles.css. vite.config.js (con tools/markdown.js) genera al compilar privacy.html (desde PRIVACY.md, la única fuente del texto) y _headers (cabeceras de seguridad que aplica Cloudflare, con la CSP limitada a la propia web y a VITE_API_URL). wrangler.jsonc: despliegue en Cloudflare Workers (Root directory `frontend`, build `npm run build`, deploy `npx wrangler deploy`). Primera pantalla: CV y chat al 50 % (chat abierto con preguntas sugeridas); debajo, el formulario de contacto y el resto del CV.
- /.github/workflows: Contiene los pipelines de integración continua (ci-dev.yml).

## 4. Reglas de Desarrollo y Comportamiento Técnico
- **Seguridad primero:** Nunca exponer API Keys ni credenciales en el código. Toda comunicación de IA debe originarse en el backend.
- **Idioma:** la web y todo lo que ve el visitante (CV, chat, errores de la API, emails al solicitante, invitación, PRIVACY.md) va en inglés. Lo que ve Alejandro (avisos y páginas de aprobar/rechazar) va en español. El código y los comentarios siguen en español.
- **Filtro previo al modelo (guard.js):** antes de llamar al modelo, el código bloquea intentos de manipulación del prompt (patrones) y preguntas sin relación con el CV (búsqueda en el CV, mención al candidato o seguimiento corto). Respuesta fija, sin coste. No es infalible: la protección de fondo es que el modelo solo puede leer el CV y su salida se muestra como texto plano.
- **Chat y formulario separados:** el chat (con IA) solo responde sobre el CV; las peticiones de contacto se detectan por palabras clave y devuelven `action: "open_contact_form"` sin llamar al modelo. El formulario usa `GET /api/availability` y `POST /api/contact`, sin IA y con validación determinista.
- **Emails sin SMTP:** Railway bloquea el SMTP saliente en los planes Free/Hobby. En producción se envía con la API de Gmail por HTTPS (permiso `gmail.send`, solo enviar). La app OAuth debe estar publicada ("En producción"): en modo "Prueba" el refresh token caduca a los 7 días.
- **Mentalidad FDE:** Antes de escribir código, evalúa las reglas de negocio y los casos límite. El agente final no debe ser un simple Q&A, sino un sistema autónomo capaz de ejecutar herramientas (Tool Calling) como consultar el CV técnico (RAG) o agendar reuniones.
- **Local-First y control de costes:** Railway es de pago y el saldo de Claude es limitado. Toda la infraestructura posible se replica y valida en local antes de desplegar:
  - PostgreSQL en local (Docker, `docker compose up -d` desde la raíz) en lugar de la base de datos de Railway durante el desarrollo. Sin DATABASE_URL el backend usa memoria.
  - El despliegue en Railway se retrasa hasta que backend, base de datos y frontend funcionen juntos en local.
  - El desarrollo usa Ollama en local (coste cero). Las llamadas reales a Claude, si se usan, se hacen manualmente y de forma puntual.
  - Los tests usan proveedores y `fetch` falsos y nunca contactan con ningún modelo.
  - En desarrollo se usa el perfil de límites más estricto (`LIMIT_PROFILE=funcional`); en producción, `normal`.

## 5. Entornos y Flujo de Trabajo
Un solo código; el entorno lo decide la configuración (`.env` en local, variables en Railway y Cloudflare). No hay ramas por entorno.

| | Local (`backend/.env`) | Producción (Railway) |
|---|---|---|
| Modelo | `LLM_PROVIDER=ollama` (gratis) o `anthropic` para probar Haiku puntualmente | `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` |
| Emails | `MAIL_TRANSPORT=file` (archivos .eml) o `gmail` | `MAIL_TRANSPORT=gmail` + `GMAIL_*`, `MAIL_FROM`, `OWNER_EMAIL` |
| Base de datos | PostgreSQL en Docker (`DATABASE_URL`) | PostgreSQL de Railway (`DATABASE_URL`) |
| Seguridad | `REVIEW_SECRET` opcional, `CORS_ORIGINS` vacío (proxy de Vite) | `NODE_ENV=production`, `REVIEW_SECRET`, `PUBLIC_URL` https, `CORS_ORIGINS` https, `TRUST_PROXY=2` (Cloudflare + Railway) |
| Logs | `LOG_USER_CONTENT=true` (consultas del agente) | Sin contenido de los visitantes (`LOG_USER_CONTENT` prohibido) |
| Límites | `LIMIT_PROFILE=funcional` (10 mensajes/día por IP) | `LIMIT_PROFILE=normal` (4/min y 25/día por IP, 200/día en total) |
| Frontend | `npm run dev` (proxy /api) | Cloudflare Workers (estáticos) con `VITE_API_URL` y `NODE_VERSION=22` |

- Con `NODE_ENV=production` el backend no arranca si falta algo crítico (lo comprueba config.js y lo dice).
- Flujo: desarrollar y probar en local en `dev` → PR a `main` (CI) → Railway despliega `main` automáticamente.
- Probar en local evita romper la web pública, ensuciar datos reales y gastar despliegues.

## 6. Comandos Frecuentes
- Iniciar el servidor local de desarrollo: cd backend && npm run dev (requiere Ollama en marcha y el modelo descargado: `ollama pull qwen2.5:7b`).
- Iniciar el frontend: cd frontend && npm run dev (http://localhost:5173; /api se redirige al backend).
- Base de datos local: docker compose up -d (parar: docker compose down; borrar datos: docker compose down -v).
- Ejecutar los tests: cd backend && npm test (los de PostgreSQL solo se ejecutan con TEST_DATABASE_URL, base `portfolio_test`; en CI hay un Postgres de servicio).
- Flujo de Git seguro: commit en dev, git push origin dev y PR de dev a main (main está protegida: sin push directo, CI obligatorio). Railway despliega main.

## 7. Versiones
- **v1.0 (congelada, 2026-10-28):** primera versión pública en `https://alejandrocerezo.dev` (API en `https://api.alejandrocerezo.dev`; dominio activo desde 2026-10-28) con todo lo descrito arriba (chat con Tool Calling sobre el CV, filtro previo, formulario con aprobación, emails por Gmail, PostgreSQL, Cloudflare + Railway). Solo admite correcciones de seguridad o errores; marcada con la etiqueta `v1.0.0` en `main`. `package.json` en `1.0.0`.
- **v2.0 (en desarrollo):** nuevas funciones según la revisión del tutor (notas locales, no versionadas). Objetivos:
  - Frontend tipo dashboard sin scroll, navbar lateral y shadcn/ui: pestañas CV + Agente, Calendario y Mapa de arquitectura (cajas y flechas; al pulsar una caja, panel lateral con información).
  - Agente orquestador con dos herramientas: consulta del CV y RAG sobre archivos .md (personalidad, enlaces, información fuera del CV) en Cloudflare R2, accedido solo desde el backend con claves en variables de entorno.
  - CV fuera del código: archivo .md o PostgreSQL, consultado por la herramienta, no en el prompt.
  - Entornos `dev` y `prod` en Railway (cada uno con su API y base de datos) con un frontend propio en Cloudflare cada uno y URLs distinguibles.
  - Prompt multiidioma explícito (inglés y español).
- Al cambiar algo de la arquitectura de las secciones 2-6 en v2.0, actualizar esas secciones; esta sección solo resume versiones.
