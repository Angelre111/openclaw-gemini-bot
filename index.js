'use strict';

require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');

// ─── Validación de variables de entorno ───────────────────────────────────────
const {
  TELEGRAM_BOT_TOKEN,
  GEMINI_API_KEY,
  PORT = 3000,
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN no está definido en las variables de entorno.');
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY no está definido en las variables de entorno.');
  process.exit(1);
}

// ─── Clientes ─────────────────────────────────────────────────────────────────
const app = express();
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Inicializar el cliente de Google Gen AI con la API Key
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Modelo Gemini a utilizar
const GEMINI_MODEL = 'gemini-2.5-flash';

// Prompt de sistema para el asistente
const SYSTEM_INSTRUCTION = 'Eres OpenClaw, un asistente personal inteligente, útil y conciso. Responde siempre en el mismo idioma que el usuario. Sé directo, preciso y evita respuestas innecesariamente largas.';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Función auxiliar: consultar a Gemini ────────────────────────────────────
/**
 * Envía un mensaje al modelo Gemini y retorna el texto generado.
 * @param {string} userMessage - Texto del usuario.
 * @returns {Promise<string>} Respuesta del modelo.
 */
async function askGemini(userMessage) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
    ?? response?.text;

  if (!text) throw new Error('Gemini no devolvió texto en la respuesta.');
  return text.trim();
}

// ─── Rutas del servidor web ───────────────────────────────────────────────────

// GET / → Ruta de estado (health check para Render)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: '🤖 Bot con Gemini activo',
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
  });
});

// POST /webhook/telegram → Recibe actualizaciones de Telegram
app.post('/webhook/telegram', async (req, res) => {
  try {
    const update = req.body;

    // Telegram espera un 200 rápido para evitar reintentos
    res.sendStatus(200);

    // Validar que hay un mensaje de texto
    const message = update?.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const userText = message.text;

    if (!chatId || !userText) return;

    // Manejar comandos especiales
    if (userText.startsWith('/start')) {
      await bot.telegram.sendMessage(
        chatId,
        '👋 ¡Hola! Soy *OpenClaw*, tu asistente IA impulsado por Google Gemini 2.5 Flash ✨\n\nEscríbeme cualquier pregunta y te responderé al instante.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (userText.startsWith('/help')) {
      await bot.telegram.sendMessage(
        chatId,
        '📖 *Comandos disponibles:*\n\n/start - Iniciar el bot\n/help - Ver esta ayuda\n\nO simplemente *escríbeme cualquier cosa* y te respondo con IA 🤖',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Indicador de "escribiendo..."
    await bot.telegram.sendChatAction(chatId, 'typing');

    // Consultar a Gemini con el mensaje del usuario
    console.log(`📩 Mensaje de ${message.from?.username || chatId}: "${userText}"`);
    const aiResponse = await askGemini(userText);
    console.log(`✨ Respuesta Gemini: "${aiResponse.substring(0, 80)}..."`);

    // Enviar la respuesta al usuario por Telegram
    await bot.telegram.sendMessage(chatId, aiResponse, {
      parse_mode: 'Markdown',
    });

  } catch (error) {
    console.error('❌ Error al procesar el webhook:', error.message);
    // El 200 ya fue enviado, solo logueamos el error internamente
  }
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Servidor OpenClaw (Gemini) escuchando en el puerto ${PORT}`);
  console.log(`✨ Modelo Google: ${GEMINI_MODEL}`);
  console.log(`🔗 Ruta de estado:    GET  http://localhost:${PORT}/`);
  console.log(`📡 Webhook Telegram:  POST http://localhost:${PORT}/webhook/telegram`);
});
