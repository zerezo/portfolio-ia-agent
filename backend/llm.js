import Anthropic from '@anthropic-ai/sdk';

// Interfaz común de proveedores:
//   chat({ system, messages, tools, maxTokens }) -> { text, toolCalls: [{ id, name, input }] }
// Mensajes en formato neutral:
//   { role: 'user', content }
//   { role: 'assistant', content, toolCalls }
//   { role: 'tool', toolCallId, name, content }
// app.js y agent.js solo conocen esta interfaz, así se cambia de modelo sin tocar el agente.

const OLLAMA_TEMPERATURE = 0.2;

// Ollama: modelo local, sin coste. En CPU las respuestas pueden tardar bastante.
export function createOllamaLlm({ url, model, timeoutMs = 120 * 1000, fetchFn = fetch }) {
  const toOllamaMessage = (m) => {
    if (m.role === 'tool') return { role: 'tool', tool_name: m.name, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content ?? '',
        tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.input } })),
      };
    }
    return { role: m.role, content: m.content };
  };

  return {
    name: `ollama:${model}`,
    async chat({ system, messages, tools = [], maxTokens }) {
      let res;
      try {
        res = await fetchFn(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [{ role: 'system', content: system }, ...messages.map(toOllamaMessage)],
            ...(tools.length && {
              tools: tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
              })),
            }),
            // Temperatura baja: respuestas factuales; con la de defecto (0.8) el modelo alteraba datos.
            options: { num_predict: maxTokens, temperature: OLLAMA_TEMPERATURE },
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

      const { message = {} } = await res.json();
      return {
        text: message.content ?? '',
        // Ollama no asigna ids a las llamadas: se generan para poder emparejar resultados.
        toolCalls: (message.tool_calls ?? []).map((c, i) => ({
          id: `call_${i}`,
          name: c.function.name,
          input: c.function.arguments ?? {},
        })),
      };
    },
  };
}

// Anthropic: modelo de pago, reservado para producción.
export function createAnthropicLlm({ apiKey, model, client }) {
  const anthropic = client ?? new Anthropic({ apiKey, timeout: 30 * 1000, maxRetries: 2 });

  // Anthropic agrupa los resultados de herramientas consecutivos en un único mensaje de usuario.
  const toAnthropicMessages = (messages) => {
    const out = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        const last = out.at(-1);
        if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
          last.content.push(block);
        } else {
          out.push({ role: 'user', content: [block] });
        }
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: [
            ...(m.content ? [{ type: 'text', text: m.content }] : []),
            ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input })),
          ],
        });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  };

  return {
    name: `anthropic:${model}`,
    async chat({ system, messages, tools = [], maxTokens }) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        // Sin razonamiento previo: con el tope de tokens de los perfiles (300-1024) el
        // razonamiento consumiría el presupuesto de la respuesta, y buscar en el CV y resumir
        // no lo necesita. Haiku 5.5 lo admite con el esfuerzo por defecto (medium).
        thinking: { type: 'disabled' },
        system,
        messages: toAnthropicMessages(messages),
        ...(tools.length && {
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
        }),
      });
      return {
        text: response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n'),
        toolCalls: response.content
          .filter((block) => block.type === 'tool_use')
          .map((block) => ({ id: block.id, name: block.name, input: block.input })),
      };
    },
  };
}

export function createLlm(config) {
  const { provider } = config.llm;
  if (provider === 'anthropic') return createAnthropicLlm(config.llm.anthropic);
  return createOllamaLlm(config.llm.ollama);
}
