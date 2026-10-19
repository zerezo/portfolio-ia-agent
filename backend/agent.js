// Bucle del agente: el modelo pide herramientas, el backend las ejecuta y le devuelve los
// resultados, hasta que responde con texto o se agotan los pasos.

// Tope de rondas con herramientas por mensaje: acota el coste y evita bucles infinitos.
export const MAX_TOOL_STEPS = 3;

// forcedFirstCall(message) -> { name, input }: si el modelo no usa ninguna herramienta en la
// primera ronda, el backend hace esa llamada por él. Los modelos pequeños a veces responden
// "no tengo esa información" sin buscar; así cada respuesta parte siempre de datos reales.
export async function runAgent({
  llm,
  system,
  message,
  tools,
  maxTokens,
  maxSteps = MAX_TOOL_STEPS,
  forcedFirstCall,
}) {
  const messages = [{ role: 'user', content: message }];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const toolsUsed = [];

  for (let step = 0; step <= maxSteps; step++) {
    // En la última ronda no se ofrecen herramientas: el modelo tiene que responder con lo que tiene.
    const offered = step < maxSteps ? tools : [];
    let { text, toolCalls } = await llm.chat({ system, messages, tools: offered, maxTokens });

    if (step === 0 && toolCalls.length === 0 && forcedFirstCall) {
      toolCalls = [{ id: 'forced_0', ...forcedFirstCall(message) }];
      text = '';
    }

    if (toolCalls.length === 0) {
      return { reply: text.trim(), toolsUsed };
    }

    messages.push({ role: 'assistant', content: text, toolCalls });
    for (const call of toolCalls) {
      toolsUsed.push(call.name);
      console.log(`[agente] paso ${step + 1}: ${call.name} ${JSON.stringify(call.input)}`);
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: await runTool(byName.get(call.name), call),
      });
    }
  }

  // Solo se llega aquí si el modelo pide herramientas incluso sin ofrecérselas.
  return { reply: '', toolsUsed };
}

// Los fallos de una herramienta se devuelven al modelo como texto: puede reintentar o explicarlo.
async function runTool(tool, call) {
  if (!tool) return `Error: la herramienta "${call.name}" no existe.`;
  try {
    return String(await tool.run(call.input ?? {}));
  } catch (error) {
    console.error(`Error en la herramienta ${call.name}:`, error);
    return `Error al ejecutar "${call.name}".`;
  }
}
