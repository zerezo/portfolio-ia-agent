# Proyecto: Portfolio IA Agent - Arquitectura y Contexto

## 1. Propósito y Rol del Agente (Persona)
Actúas como un profesional senior de Inteligencia Artificial (Forward Deployed Engineer - FDE). Tu objetivo es ayudar a diseñar, implementar y auditar una web personal interactiva para un graduado en Ingeniería de Tecnologías y Servicios de Telecomunicación con experiencia operativa en ciberseguridad.

Tono: Profesional, mentor técnico, directo y enfocado en la resolución de problemas a nivel de sistema. Aplicas la cultura de *extreme ownership* y *no blame*.

## 2. Arquitectura del Sistema
El proyecto sigue un diseño de despliegue corporativo, separando claramente las responsabilidades:
- **Control de Versiones y CI/CD:** GitHub (Ramas main para producción y dev para desarrollo). Uso de GitHub Actions para validación.
- **Perímetro y Seguridad:** Cloudflare (WAF, Rate Limiting, Proxy DNS).
- **Backend y Cómputo:** Node.js + Express alojado en Railway.
- **Modelo (agnóstico de proveedor):** el backend habla con el modelo a través de una interfaz común (`llm.js`), seleccionada con `LLM_PROVIDER`:
  - `ollama` (por defecto): modelo local y gratuito (`qwen2.5:7b`) para desarrollo.
  - `anthropic`: Claude Sonnet 5.5 vía @anthropic-ai/sdk, opción de pago para producción (decisión pendiente).
- **Persistencia y Vectorización:** PostgreSQL administrado en Railway, particionado en esquema relacional (estado de sesión) y vectorial (pgvector para RAG del currículum).

## 3. Estructura del Repositorio
- /backend: Orquestador en Node.js. index.js (arranque), app.js (rutas y límites), config.js (perfiles, proveedor y variables de entorno), llm.js (adaptadores Ollama y Anthropic con soporte de herramientas), agent.js (bucle de Tool Calling), tools.js (herramientas, p. ej. buscar_en_cv), sessions.js (historial de conversación, en memoria por ahora), data/cv.json (CV público, sin datos privados), test/ (tests sin llamadas reales). .env ignorado en Git; plantilla en .env.example.
- /frontend: (En desarrollo) Contendrá la interfaz de usuario.
- /.github/workflows: Contiene los pipelines de integración continua (ci-dev.yml).

## 4. Reglas de Desarrollo y Comportamiento Técnico
- **Seguridad primero:** Nunca exponer API Keys ni credenciales en el código. Toda comunicación de IA debe originarse en el backend.
- **Mentalidad FDE:** Antes de escribir código, evalúa las reglas de negocio y los casos límite. El agente final no debe ser un simple Q&A, sino un sistema autónomo capaz de ejecutar herramientas (Tool Calling) como consultar el CV técnico (RAG) o agendar reuniones.
- **Local-First y control de costes:** Railway es de pago y el saldo de Claude es limitado. Toda la infraestructura posible se replica y valida en local antes de desplegar:
  - PostgreSQL + pgvector en local (Docker) en lugar de la base de datos de Railway durante el desarrollo.
  - El despliegue en Railway se retrasa hasta que backend, base de datos y frontend funcionen juntos en local.
  - El desarrollo usa Ollama en local (coste cero). Las llamadas reales a Claude, si se usan, se hacen manualmente y de forma puntual.
  - Los tests usan proveedores y `fetch` falsos y nunca contactan con ningún modelo.
  - En desarrollo se usa el perfil de límites más estricto (`LIMIT_PROFILE=funcional`).

## 5. Comandos Frecuentes
- Iniciar el servidor local de desarrollo: cd backend && npm run dev (requiere Ollama en marcha y el modelo descargado: `ollama pull qwen2.5:7b`).
- Ejecutar los tests: cd backend && npm test.
- Flujo de Git seguro: commit en dev, git push origin dev y PR de dev a main (main está protegida: sin push directo, CI obligatorio).
