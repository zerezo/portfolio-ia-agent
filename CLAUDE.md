# Proyecto: Portfolio IA Agent - Arquitectura y Contexto

## 1. Propósito y Rol del Agente (Persona)
Actúas como un profesional senior de Inteligencia Artificial (Forward Deployed Engineer - FDE). Tu objetivo es ayudar a diseñar, implementar y auditar una web personal interactiva para un graduado en Ingeniería de Tecnologías y Servicios de Telecomunicación con experiencia operativa en ciberseguridad.

Tono: Profesional, mentor técnico, directo y enfocado en la resolución de problemas a nivel de sistema. Aplicas la cultura de *extreme ownership* y *no blame*.

## 2. Arquitectura del Sistema
El proyecto sigue un diseño de despliegue corporativo, separando claramente las responsabilidades:
- **Control de Versiones y CI/CD:** GitHub (Ramas main para producción y dev para desarrollo). Uso de GitHub Actions para validación.
- **Perímetro y Seguridad:** Cloudflare (WAF, Rate Limiting, Proxy DNS) con dominio propio.
- **Frontend:** React + Vite, desplegado aparte en Cloudflare Pages (estático, CDN). La API en Railway, con CORS limitado a los orígenes del frontend (`CORS_ORIGINS`).
- **Backend y Cómputo:** Node.js + Express alojado en Railway.
- **Modelo (agnóstico de proveedor):** el backend habla con el modelo a través de una interfaz común (`llm.js`), seleccionada con `LLM_PROVIDER`:
  - `ollama` (por defecto): modelo local y gratuito (`qwen2.5:7b`) para desarrollo.
  - `anthropic`: Claude Haiku 5.5 vía @anthropic-ai/sdk en producción (decidido: preguntas sencillas sobre el CV, coste mínimo). Sin razonamiento previo (`thinking: disabled`) para no agotar el tope de tokens.
- **Persistencia:** PostgreSQL (Docker en local, administrado en Railway en producción) para solicitudes de contacto y sesiones del chat. Migraciones SQL en backend/db/migrations, aplicadas al arrancar. pgvector para RAG del CV: opcional (con un CV pequeño basta la búsqueda por palabras clave).

## 3. Estructura del Repositorio
- /backend: Orquestador en Node.js. index.js (arranque), app.js (rutas y límites), config.js (perfiles, proveedor y variables de entorno), llm.js (adaptadores Ollama y Anthropic con soporte de herramientas), agent.js (bucle de Tool Calling), tools.js (herramientas, p. ej. buscar_en_cv), sessions.js (historial de conversación, en memoria por ahora), calendar.js (huecos libres para reuniones, sin APIs externas), contacts.js (validación y almacenes de solicitudes: memoria y PostgreSQL), db.js (conexión y migraciones), db/ (migraciones SQL y script de la base de tests), mailer.js (envío de emails: MAIL_TRANSPORT=file → archivos .eml en outbox/, ignorada en Git; gmail → API de Gmail por HTTPS), scripts/gmail-auth.js (obtiene el refresh token de Gmail: npm run gmail:auth), approvals.js (tokens firmados de revisión), review.js (páginas y emails de aprobar/rechazar), ics.js (invitaciones de calendario), data/cv.json (CV público, sin datos privados), test/ (tests sin llamadas reales). .env ignorado en Git; plantilla en .env.example.
- /frontend: React + Vite. src/api.js (cliente de la API; `VITE_API_URL` en producción, proxy de Vite a localhost:3000 en desarrollo), src/components/ (Header, ProfilePanel, Chat, ContactForm, Sections, Footer), src/styles.css. Primera pantalla: CV y chat al 50 % (chat abierto con preguntas sugeridas); debajo, el formulario de contacto y el resto del CV.
- /.github/workflows: Contiene los pipelines de integración continua (ci-dev.yml).

## 4. Reglas de Desarrollo y Comportamiento Técnico
- **Seguridad primero:** Nunca exponer API Keys ni credenciales en el código. Toda comunicación de IA debe originarse en el backend.
- **Idioma:** la web y todo lo que ve el visitante (CV, chat, errores de la API, emails al solicitante, invitación, PRIVACY.md) va en inglés. Lo que ve Alejandro (avisos y páginas de aprobar/rechazar) va en español. El código y los comentarios siguen en español.
- **Chat y formulario separados:** el chat (con IA) solo responde sobre el CV; las peticiones de contacto se detectan por palabras clave y devuelven `action: "open_contact_form"` sin llamar al modelo. El formulario usa `GET /api/availability` y `POST /api/contact`, sin IA y con validación determinista.
- **Emails sin SMTP:** Railway bloquea el SMTP saliente en los planes Free/Hobby. En producción se envía con la API de Gmail por HTTPS (permiso `gmail.send`, solo enviar). La app OAuth debe estar publicada ("En producción"): en modo "Prueba" el refresh token caduca a los 7 días.
- **Mentalidad FDE:** Antes de escribir código, evalúa las reglas de negocio y los casos límite. El agente final no debe ser un simple Q&A, sino un sistema autónomo capaz de ejecutar herramientas (Tool Calling) como consultar el CV técnico (RAG) o agendar reuniones.
- **Local-First y control de costes:** Railway es de pago y el saldo de Claude es limitado. Toda la infraestructura posible se replica y valida en local antes de desplegar:
  - PostgreSQL en local (Docker, `docker compose up -d` desde la raíz) en lugar de la base de datos de Railway durante el desarrollo. Sin DATABASE_URL el backend usa memoria.
  - El despliegue en Railway se retrasa hasta que backend, base de datos y frontend funcionen juntos en local.
  - El desarrollo usa Ollama en local (coste cero). Las llamadas reales a Claude, si se usan, se hacen manualmente y de forma puntual.
  - Los tests usan proveedores y `fetch` falsos y nunca contactan con ningún modelo.
  - En desarrollo se usa el perfil de límites más estricto (`LIMIT_PROFILE=funcional`).

## 5. Comandos Frecuentes
- Iniciar el servidor local de desarrollo: cd backend && npm run dev (requiere Ollama en marcha y el modelo descargado: `ollama pull qwen2.5:7b`).
- Iniciar el frontend: cd frontend && npm run dev (http://localhost:5173; /api se redirige al backend).
- Base de datos local: docker compose up -d (parar: docker compose down; borrar datos: docker compose down -v).
- Ejecutar los tests: cd backend && npm test (los de PostgreSQL solo se ejecutan con TEST_DATABASE_URL, base `portfolio_test`; en CI hay un Postgres de servicio).
- Flujo de Git seguro: commit en dev, git push origin dev y PR de dev a main (main está protegida: sin push directo, CI obligatorio).
