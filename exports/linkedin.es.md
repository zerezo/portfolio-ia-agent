# LinkedIn (ES)

> Generado desde `backend/data/profile.yaml` con `npm run linkedin`. No lo edites a mano: edita el perfil
> y vuelve a generarlo. Cada bloque es texto plano listo para pegar (LinkedIn no interpreta Markdown).
> Lo pendiente de revisar (verified: false) no aparece aquí.

## Titular · falta

⚠️ Pendiente de revisar o de escribir (npm run profile:review).

## Acerca de · falta

⚠️ Pendiente de revisar o de escribir (npm run profile:review).

### Aptitudes principales (5/5)

- bucles agénticos y tool calling
- servidores MCP
- Claude API
- Node.js/Express
- ISO/IEC 27001

## Experiencia

### CRC Analyst, Cyber Risk & Compliance · IndraMind Cybersecurity

- Cargo: CRC Analyst, Cyber Risk & Compliance (36/100)
- Empresa: IndraMind Cybersecurity
- Ubicación: Madrid
- Fechas: mayo 2026 – actualidad
- Descripción · 571/2000

```text
• Cumplimiento de ciberseguridad para el negocio de servicios financieros de un grupo automovilístico global: responsable de los KPIs de análisis y de la revisión de perfiles de seguridad y controles de protección de la información.
• Trato directo con los equipos del cliente en Alemania y Corea del Sur, en inglés.
• Evaluaciones de riesgo de proveedores para un gran operador de telecomunicaciones español (continuación de mis prácticas).
• Automatización del procesamiento de archivos y de la generación de informes: una tarea recurrente pasó de 2 horas a 10 minutos.
```

### Becario de Ciberseguridad, GRC · IndraMind Cybersecurity

- Cargo: Becario de Ciberseguridad, GRC (30/100)
- Empresa: IndraMind Cybersecurity
- Ubicación: Madrid
- Fechas: sept 2025 – mayo 2026
- Descripción · 146/2000

```text
• Evaluaciones de riesgo de proveedores para un gran operador de telecomunicaciones español; apoyo en tareas de gobernanza, riesgo y cumplimiento.
```

### Comercial · Fotomatón y Más

- Cargo: Comercial (9/100)
- Empresa: Fotomatón y Más
- Ubicación: Madrid / Segovia
- Fechas: 2025
- Descripción · 47/2000

```text
• Propuestas a medida para clientes de eventos.
```

### Personal de eventos · Fotomatón y Más

- Cargo: Personal de eventos (19/100)
- Empresa: Fotomatón y Más
- Ubicación: Madrid / Segovia
- Fechas: feb 2024 – sept 2026
- Descripción · 65/2000

```text
• Atención del servicio de fotomatón en bodas y eventos privados.
```

## Proyectos

### Portfolio AI Agent

- Fechas: 2026
- URL: https://alejandrocerezo.dev
- Descripción · 880/2000

```text
En producción en alejandrocerezo.dev
• Asistente de IA público que responde preguntas sobre mi perfil mediante un bucle agéntico con tool calling sobre un CV estructurado; Claude Haiku en producción y Ollama (qwen2.5) en local, con un backend independiente del proveedor.
• Guard previo al modelo, sin coste, que bloquea prompt injection y preguntas fuera de tema antes de llegar al LLM; rate limiting por IP y global, CSP estricta, CORS restringido y ningún contenido de visitantes en los logs de producción.
• Flujo de solicitud de reuniones con disponibilidad real, enlaces de aprobación firmados con HMAC, invitaciones .ics, salas Jitsi y envío de emails con la Gmail API; persistencia en PostgreSQL con migraciones.
• CI con GitHub Actions (auditoría, tests contra un servicio Postgres, build del frontend); frontend React en Cloudflare Workers y API Node/Express en Railway.
```

### Entrenador: coach de entrenamiento con IA sobre un servidor MCP propio

- Fechas: 2026
- Descripción · 747/2000

```text
Cloudflare
• Servidor MCP remoto con ~25 herramientas con el que Claude gestiona mi entrenamiento multideporte: sincroniza actividades, detecta y unifica duplicados entre fuentes, calcula ritmos, carga semanal y bienestar, y programa entrenamientos estructurados directamente en intervals.icu; panel web protegido.
• La metodología de entrenamiento está codificada como una herramienta que el modelo debe consultar antes de planificar o analizar, de modo que las decisiones siguen reglas explícitas (progresión de volumen, carga aguda:crónica) y no intuiciones del modelo.
• Diseño de un set de evals para el prompt de coaching: casos en pares de contraste, veredicto evaluado por código y un juez LLM para el contenido obligatorio y el prohibido.
```

### HomeCarGarage

- Fechas: 2026
- URL: https://homecargarage.alejandrocerezo.dev
- Descripción · 248/2000

```text
React + Supabase
• App web gratuita para controlar kilometraje, piezas e intervalos de mantenimiento de todos los coches de casa, avisando de lo pendiente antes de que sea un problema. Datos alojados en la UE, cuentas de usuario y ejemplos de demo.
```

### Simulador de riesgos de ciberseguridad para Operaciones Multidominio

- URL: https://github.com/zerezo/TFG-Alejandro-Cerezo
- Descripción · 635/2000

```text
TFG, 9/10
• Sistema basado en conocimiento que recibe un escenario de misión militar y calcula la exposición a riesgos de ciberseguridad y la resiliencia en los dominios tierra, mar, aire, espacio y ciberespacio.
• Arquitectura híbrida: ontología OWL 2 DL (Protégé) con el razonador HermiT para clasificar los activos en riesgo; orquestador en Python que aplica la matriz de riesgos de NIST SP 800-30 y devuelve los resultados a la ontología para el veredicto global de la misión.
• Validación estricta de los escenarios de entrada (JSON), informe de riesgos automático en PDF y exportación del grafo inferido como rastro de auditoría.
```

## Formación

- Universidad Politécnica de Madrid (ETSIT): Grado en Ingeniería de Tecnologías y Servicios de Telecomunicación (2021–2026). TFG 9/10

## Licencias y certificaciones

- ISO/IEC 27001 Implementing Information Security
- DORA (EU Digital Operational Resilience Act)
- Cambridge C1 Advanced (190)
- MATLAB Onramp
- Excel Pivot Tables
- Dashboards & Data Analysis
