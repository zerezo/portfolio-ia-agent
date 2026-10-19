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

const tool = {
  name: 'buscar_en_cv',
  description: 'Busca en el CV',
  inputSchema: { type: 'object', properties: { consulta: { type: 'string' } } },
};

// Conversación con una ronda de herramienta ya resuelta, en formato neutral.
const history = [
  { role: 'user', content: 'hola' },
  { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'buscar_en_cv', input: { consulta: 'x' } }] },
  { role: 'tool', toolCallId: 't1', name: 'buscar_en_cv', content: 'resultado' },
];

describe('Ollama', () => {
  test('envía sistema, mensajes y límite de tokens; devuelve el texto', async () => {
    const fetchFn = fakeFetch(Response.json({ message: { role: 'assistant', content: 'respuesta' } }));
    const llm = createOllamaLlm({ url: 'http://ollama:11434', model: 'm', fetchFn });

    const result = await llm.chat({ system: 'sistema', messages: [history[0]], maxTokens: 300 });
    assert.deepEqual(result, { text: 'respuesta', toolCalls: [] });
    const [{ url, body }] = fetchFn.calls;
    assert.equal(url, 'http://ollama:11434/api/chat');
    assert.equal(body.model, 'm');
    assert.equal(body.stream, false);
    assert.equal(body.options.num_predict, 300);
    assert.ok(body.options.temperature <= 0.3);
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  });

  test('traduce herramientas e historial, y devuelve las llamadas con id', async () => {
    const fetchFn = fakeFetch(
      Response.json({
        message: { content: '', tool_calls: [{ function: { name: 'buscar_en_cv', arguments: { consulta: 'DORA' } } }] },
      }),
    );
    const llm = createOllamaLlm({ url: 'http://x', model: 'm', fetchFn });

    const result = await llm.chat({ system: 's', messages: history, tools: [tool], maxTokens: 300 });
    assert.deepEqual(result.toolCalls, [{ id: 'call_0', name: 'buscar_en_cv', input: { consulta: 'DORA' } }]);

    const { body } = fetchFn.calls[0];
    assert.equal(body.tools[0].type, 'function');
    assert.deepEqual(body.tools[0].function.parameters, tool.inputSchema);
    assert.deepEqual(body.messages[2].tool_calls, [{ function: { name: 'buscar_en_cv', arguments: { consulta: 'x' } } }]);
    assert.deepEqual(body.messages[3], { role: 'tool', tool_name: 'buscar_en_cv', content: 'resultado' });
  });

  test('si Ollama no responde lanza un error 503', async () => {
    const llm = createOllamaLlm({ url: 'http://x', model: 'm', fetchFn: fakeFetch(new TypeError('fetch failed')) });
    await assert.rejects(llm.chat({ system: 's', messages: [history[0]] }), { status: 503 });
  });

  test('propaga el estado HTTP si Ollama devuelve error', async () => {
    const fetchFn = fakeFetch(new Response('model not found', { status: 404 }));
    const llm = createOllamaLlm({ url: 'http://x', model: 'm', fetchFn });
    await assert.rejects(llm.chat({ system: 's', messages: [history[0]] }), { status: 404 });
  });
});

describe('Anthropic', () => {
  function fakeClient(content) {
    const calls = [];
    return { calls, messages: { create: async (p) => (calls.push(p), { content }) } };
  }

  test('une los bloques de texto y extrae las llamadas a herramientas', async () => {
    const client = fakeClient([
      { type: 'text', text: 'a' },
      { type: 'tool_use', id: 'tu1', name: 'buscar_en_cv', input: { consulta: 'DORA' } },
      { type: 'text', text: 'b' },
    ]);
    const llm = createAnthropicLlm({ model: 'claude-x', client });

    const result = await llm.chat({ system: 'sistema', messages: [history[0]], tools: [tool], maxTokens: 300 });
    assert.equal(result.text, 'a\nb');
    assert.deepEqual(result.toolCalls, [{ id: 'tu1', name: 'buscar_en_cv', input: { consulta: 'DORA' } }]);
    assert.equal(client.calls[0].max_tokens, 300);
    assert.deepEqual(client.calls[0].tools[0].input_schema, tool.inputSchema);
  });

  test('traduce el historial: tool_use del asistente y tool_result agrupados en un mensaje de usuario', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);
    const llm = createAnthropicLlm({ model: 'claude-x', client });
    const twoResults = [...history, { role: 'tool', toolCallId: 't2', name: 'buscar_en_cv', content: 'otro' }];

    await llm.chat({ system: 's', messages: twoResults, maxTokens: 300 });
    const sent = client.calls[0].messages;
    assert.deepEqual(sent.map((m) => m.role), ['user', 'assistant', 'user']);
    assert.equal(sent[1].content[0].type, 'tool_use');
    assert.deepEqual(sent[2].content.map((b) => b.tool_use_id), ['t1', 't2']);
    assert.equal(client.calls[0].tools, undefined);
  });
});
