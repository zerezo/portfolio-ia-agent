import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createOllamaLlm, createAnthropicLlm } from '../llm.js';

// fetch falso: registra la petición y devuelve la respuesta indicada, sin red.
function fakeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (response instanceof Error) throw response;
    return response;
  };
  return Object.assign(fn, { calls });
}

const params = { system: 'sistema', message: 'hola', maxTokens: 300 };

describe('Ollama', () => {
  test('envía sistema, mensaje y límite de tokens; devuelve el texto', async () => {
    const fetchFn = fakeFetch(Response.json({ message: { role: 'assistant', content: 'respuesta' } }));
    const llm = createOllamaLlm({ url: 'http://ollama:11434', model: 'm', fetchFn });

    assert.equal(await llm.complete(params), 'respuesta');
    const [{ url, body }] = fetchFn.calls;
    assert.equal(url, 'http://ollama:11434/api/chat');
    assert.equal(body.model, 'm');
    assert.equal(body.stream, false);
    assert.equal(body.options.num_predict, 300);
    assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  });

  test('si Ollama no responde lanza un error 503', async () => {
    const fetchFn = fakeFetch(new TypeError('fetch failed'));
    const llm = createOllamaLlm({ url: 'http://x', model: 'm', fetchFn });
    await assert.rejects(llm.complete(params), { status: 503 });
  });

  test('propaga el estado HTTP si Ollama devuelve error', async () => {
    const fetchFn = fakeFetch(new Response('model not found', { status: 404 }));
    const llm = createOllamaLlm({ url: 'http://x', model: 'm', fetchFn });
    await assert.rejects(llm.complete(params), { status: 404 });
  });
});

describe('Anthropic', () => {
  test('traduce la interfaz común a messages.create y une los bloques de texto', async () => {
    const calls = [];
    const client = {
      messages: {
        create: async (p) => {
          calls.push(p);
          return { content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }] };
        },
      },
    };
    const llm = createAnthropicLlm({ model: 'claude-x', client });

    assert.equal(await llm.complete(params), 'a\nb');
    assert.equal(calls[0].max_tokens, 300);
    assert.equal(calls[0].system, 'sistema');
  });
});
