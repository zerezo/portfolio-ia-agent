import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Tokens de revisión de solicitudes: `<caducidad>.<firma HMAC-SHA256>`. La firma cubre el id
// de la solicitud y la caducidad, así que un token no sirve para otra solicitud ni se puede
// alargar. El uso único lo garantiza el estado: solo se revisan solicitudes pendientes.

export const REVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createReviewTokens({ secret, now = Date.now, ttlMs = REVIEW_TOKEN_TTL_MS }) {
  const sign = (requestId, expiresAt) =>
    createHmac('sha256', secret).update(`${requestId}.${expiresAt}`).digest('base64url');

  return {
    create(requestId) {
      const expiresAt = now() + ttlMs;
      return `${expiresAt}.${sign(requestId, expiresAt)}`;
    },

    // true si el token es válido para esa solicitud y no ha caducado.
    verify(requestId, token) {
      if (typeof token !== 'string') return false;
      const [expiresAt, signature, ...rest] = token.split('.');
      if (rest.length || !/^\d+$/.test(expiresAt ?? '') || !signature) return false;
      if (Number(expiresAt) < now()) return false;

      const expected = Buffer.from(sign(requestId, expiresAt));
      const received = Buffer.from(signature);
      // Comparación en tiempo constante: no revela cuántos caracteres coinciden.
      return expected.length === received.length && timingSafeEqual(expected, received);
    },
  };
}

// Sin REVIEW_SECRET (solo en desarrollo) se genera uno aleatorio: los enlaces dejan de
// valer al reiniciar, igual que las solicitudes en memoria.
export const randomSecret = () => randomBytes(32).toString('hex');
