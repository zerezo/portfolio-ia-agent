import Anthropic from '@anthropic-ai/sdk';

// Interfaz común de proveedores: complete({ system, message, maxTokens }) -> texto.
// app.js solo conoce esta interfaz, así se cambia de modelo sin tocar las rutas.

// Ollama: modelo local, sin coste. En CPU las respuestas pueden tardar bastante.
export function createOllamaLlm({ url, model, timeoutMs = 120 * 1000, fetchFn = fetch }) {
  return {
    name: `ollama:${model}`,
    async complete({ system, message, maxTokens }) {
      let res;
      try {
        res = await fetchFn(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: message },
            ],
            options: { num_predict: maxTokens },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        // Ollama apagado o tiempo agotado: indisponibilidad temporal, no un fallo nuestro.
        throw Object.assign(new Error(`Ollama no responde en ${url}`, { cause }), { status: 503 });
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw Object.assign(new Error(`Ollama devolvió ${res.status}: ${detail}`), { status: res.status });
      }

      const data = await res.json();
      return data.message?.content ?? '';
    },
  };
}

// Anthropic: modelo de pago, reservado para producción.
export function createAnthropicLlm({ apiKey, model, client }) {
  const anthropic = client ?? new Anthropic({ apiKey, timeout: 30 * 1000, maxRetries: 2 });
  return {
    name: `anthropic:${model}`,
    async complete({ system, message, maxTokens }) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: message }],
      });
      return response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    },
  };
}

export function createLlm(config) {
  const { provider } = config.llm;
  if (provider === 'anthropic') return createAnthropicLlm(config.llm.anthropic);
  return createOllamaLlm(config.llm.ollama);
}
