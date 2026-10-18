import express from 'express';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// Inyección de variables de entorno locales
dotenv.config();

const app = express();
app.use(express.json());

// Inicialización del cliente
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

// Endpoint principal del agente
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    // Llamada base. Más adelante inyectaremos las Tools y el RAG de PostgreSQL
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1024,
      system: "Eres un ingeniero Forward Deployed en ciberseguridad actuando como representante autónomo...",
      messages: [
        { role: "user", content: message }
      ],
    });

    res.json({ reply: response.content[0].text });
  } catch (error) {
    console.error("Fallo en la comunicación del orquestador:", error);
    res.status(500).json({ error: "Interrupción de enlace con el razonamiento del agente." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor local activo y orquestando peticiones en el puerto ${PORT}`);
});