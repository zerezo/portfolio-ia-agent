import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 1024;
const SYSTEM_PROMPT =
  'Eres el asistente de un portfolio profesional. Respondes preguntas sobre la ' +
  'trayectoria de un ingeniero de Telecomunicaciones con experiencia en ciberseguridad. ' +
  'Si no dispones de un dato, lo indicas en lugar de inventarlo.';

// TODO(tools): definir aquí el Tool Calling (consulta RAG del CV, agendar reuniones).
// TODO(sesión): persistir el historial de conversación en PostgreSQL.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body ?? {};

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({ reply });
  } catch (error) {
    console.error('Error en la llamada al modelo:', error);
    res.status(500).json({ error: 'No se pudo generar una respuesta.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
