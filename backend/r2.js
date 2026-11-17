import { createHash, createHmac } from 'node:crypto';

// Cliente mínimo de Cloudflare R2 (API compatible con S3), solo lectura: GET de un objeto
// firmado con AWS Signature V4. Sin SDK: una sola operación no justifica la dependencia.
// Las claves viven en variables de entorno del backend; el frontend nunca habla con R2.

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

// Codificación de cada segmento de la ruta según S3: también ! ' ( ) *.
const encodeSegment = (segment) =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// URL y cabeceras firmadas de un GET sin cuerpo. Exportada para los tests.
export function signGet({ host, path, accessKeyId, secretAccessKey, region = 'auto', service = 's3', now = new Date() }) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256('');
  const canonicalUri = path.split('/').map(encodeSegment).join('/');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'GET',
    canonicalUri,
    '',
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signingKey = [dateStamp, region, service, 'aws4_request'].reduce(hmac, `AWS4${secretAccessKey}`);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

// getText(key) -> contenido del objeto como texto. Lanza un error si R2 no responde 200.
export function createR2Client({ accountId, accessKeyId, secretAccessKey, bucket, fetch = globalThis.fetch, timeoutMs = 10_000 }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  return {
    name: `r2:${bucket}`,
    async getText(key) {
      const { url, headers } = signGet({ host, path: `/${bucket}/${key}`, accessKeyId, secretAccessKey });
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`R2 respondió ${res.status} al leer "${key}"`);
      return res.text();
    },
  };
}
