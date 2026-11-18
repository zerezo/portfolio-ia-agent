// Cliente de la API del backend. En desarrollo VITE_API_URL está vacía y las rutas /api las
// redirige Vite al backend local; en producción apunta al dominio de la API.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

// Error con el estado HTTP y, si los hay, todos los errores de validación del backend.
export class ApiError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message);
    this.status = status;
    this.errors = errors ?? [message];
  }
}

async function request(path, { body, method = body ? 'POST' : 'GET' } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      // Content-Type solo con cuerpo: un GET sin cabeceras extra no necesita preflight de CORS.
      ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Please check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `Something went wrong (${res.status}). Please try again.`, {
      status: res.status,
      errors: data.errors,
    });
  }
  return data;
}

// Si la API no responde (caída o despliegue), el último dato bueno: primero el que guardó este
// navegador y después el que se incrusta en la web al compilar (vite.config.js). Así el CV y la
// página Analytics se ven aunque el backend esté caído.
async function withFallback(path, key) {
  try {
    const data = await request(path);
    try {
      localStorage.setItem(key, JSON.stringify({ data, savedAt: new Date().toISOString() }));
    } catch {
      // Sin almacenamiento (modo privado): sin copia local.
    }
    return { data, source: 'live', savedAt: null };
  } catch (error) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved?.data) return { data: saved.data, source: 'cached', savedAt: saved.savedAt };
    } catch {
      // Copia local ilegible: se prueba la de la web.
    }
    try {
      const res = await fetch(`/${key}.json`);
      if (res.ok) {
        const snapshot = await res.json();
        if (snapshot?.data) return { data: snapshot.data, source: 'snapshot', savedAt: snapshot.savedAt };
      }
    } catch {
      // Sin copia en la web: se devuelve el error original.
    }
    throw error;
  }
}

export const getProfile = async () => (await withFallback('/api/profile', 'profile-snapshot')).data;
export const getAnalytics = () => withFallback('/api/analytics', 'analytics-snapshot');
export const getAvailability = () => request('/api/availability');
export const sendChatMessage = (message, sessionId) =>
  request('/api/chat', { body: { message, ...(sessionId && { sessionId }) } });
export const sendContactRequest = (form) => request('/api/contact', { body: form });
