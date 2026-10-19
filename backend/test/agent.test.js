import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../agent.js';

// Modelo falso con guion: devuelve las respuestas en orden y registra cada llamada.
function scriptedLlm(responses) {
  const calls = [];
  return {
    calls,
    chat: async (params) => {
      calls.push({ ...params, messages: [...params.messages] });
      return responses[Math.min(calls.length - 1, responses.length - 1)];
    },
  };
}

const callTool = (name, input = {}) => ({ text: '', toolCalls: [{ id: 'c1', name, input }] });
const answer = (text) => ({ text, toolCalls: [] });

function echoTool() {
  const inputs = [];
  return { inputs, name: 'eco', description: 'd', inputSchema: {}, run: (input) => (inputs.push(input), 'dato') };
}

const base = { system: 's', message: 'pregunta', maxTokens: 100 };

describe('runAgent', () => {
  test('sin herramientas pedidas, devuelve el texto en una sola llamada', async () => {
    const llm = scriptedLlm([answer(' hola ')]);
    const result = await runAgent({ ...base, llm, tools: [echoTool()] });
    assert.deepEqual(result, { reply: 'hola', toolsUsed: [] });
    assert.equal(llm.calls.length, 1);
  });

  test('ejecuta la herramienta pedida y le pasa el resultado al modelo', async () => {
    const tool = echoTool();
    const llm = scriptedLlm([callTool('eco', { consulta: 'DORA' }), answer('respuesta final')]);

    const result = await runAgent({ ...base, llm, tools: [tool] });
    assert.deepEqual(result, { reply: 'respuesta final', toolsUsed: ['eco'] });
    assert.deepEqual(tool.inputs, [{ consulta: 'DORA' }]);
    assert.deepEqual(llm.calls[1].messages.at(-1), { role: 'tool', toolCallId: 'c1', name: 'eco', content: 'dato' });
  });

  test('si el modelo no usa herramientas en la primera ronda, se fuerza la llamada', async () => {
    const tool = echoTool();
    const llm = scriptedLlm([answer('no tengo esa información'), answer('con datos')]);
    const forcedFirstCall = (message) => ({ name: 'eco', input: { consulta: message } });

    const result = await runAgent({ ...base, llm, tools: [tool], forcedFirstCall });
    assert.deepEqual(result, { reply: 'con datos', toolsUsed: ['eco'] });
    assert.deepEqual(tool.inputs, [{ consulta: 'pregunta' }]);
    // La respuesta descartada no entra en el historial.
    assert.equal(llm.calls[1].messages[1].content, '');
  });

  test('la llamada forzada solo aplica a la primera ronda', async () => {
    const llm = scriptedLlm([callTool('eco'), answer('final')]);
    const forcedFirstCall = () => assert.fail('no debe forzarse');
    const result = await runAgent({ ...base, llm, tools: [echoTool()], forcedFirstCall });
    assert.equal(result.reply, 'final');
  });

  test('una herramienta inexistente se informa al modelo, sin romper', async () => {
    const llm = scriptedLlm([callTool('no_existe'), answer('ok')]);
    await runAgent({ ...base, llm, tools: [echoTool()] });
    assert.match(llm.calls[1].messages.at(-1).content, /no existe/);
  });

  test('si la herramienta falla, el error se devuelve como texto al modelo', async () => {
    const broken = { ...echoTool(), run: () => { throw new Error('secreto interno'); } };
    const llm = scriptedLlm([callTool('eco'), answer('ok')]);
    await runAgent({ ...base, llm, tools: [broken] });
    const content = llm.calls[1].messages.at(-1).content;
    assert.match(content, /Error/);
    assert.doesNotMatch(content, /secreto/);
  });

  test('tras maxSteps rondas deja de ofrecer herramientas para forzar la respuesta', async () => {
    const llm = scriptedLlm([callTool('eco'), callTool('eco'), answer('final')]);
    const result = await runAgent({ ...base, llm, tools: [echoTool()], maxSteps: 2 });
    assert.equal(result.reply, 'final');
    assert.equal(llm.calls.length, 3);
    assert.equal(llm.calls[1].tools.length, 1);
    assert.equal(llm.calls[2].tools.length, 0);
  });

  test('si el modelo insiste en pedir herramientas, termina con respuesta vacía', async () => {
    const llm = scriptedLlm([callTool('eco')]);
    const result = await runAgent({ ...base, llm, tools: [echoTool()], maxSteps: 2 });
    assert.equal(result.reply, '');
    assert.equal(llm.calls.length, 3);
  });
});
