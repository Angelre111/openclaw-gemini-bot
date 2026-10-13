'use strict';

require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');
const cron = require('node-cron');

// ─── Validación de variables de entorno ───────────────────────────────────────
const {
  TELEGRAM_BOT_TOKEN,
  GEMINI_API_KEY,
  PORT = 3000,
  TZ = 'America/Caracas', // UTC-4, cámbiala si tu zona es diferente
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
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const GEMINI_MODEL = 'gemini-2.5-flash';

// Prompt de sistema — incluye instrucción especial para recordatorios
const SYSTEM_INSTRUCTION = `Eres OpenClaw, un asistente personal inteligente, útil y conciso.
Responde siempre en el mismo idioma que el usuario. Sé directo, preciso y evita respuestas innecesariamente largas.

REGLA ESPECIAL PARA RECORDATORIOS:
Si el usuario pide que le recuerdes algo (frases como "recuérdame", "avísame", "reminder", "no me dejes olvidar", etc.),
responde ÚNICAMENTE con un objeto JSON sin ningún texto adicional, en este formato exacto:
{"reminder":true,"hour":<0-23>,"minute":<0-59>,"message":"<texto breve del recordatorio>"}

Si el usuario NO pide un recordatorio, responde con texto normal.`;

// ─── Almacén de recordatorios en memoria ─────────────────────────────────────
// Map<chatId, Array<{ id, job, time, message }>>
const reminders = new Map();
let reminderIdCounter = 0;

/**
 * Programa un recordatorio con node-cron.
 * @param {number} chatId
 * @param {number} hour
 * @param {number} minute
 * @param {string} message
 * @returns {{ id: number, time: string }}
 */
function scheduleReminder(chatId, hour, minute, message) {
  reminderIdCounter++;
  const id = reminderIdCounter;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const cronExpr = `${minute} ${hour} * * *`;

  const job = cron.schedule(
    cronExpr,
    async () => {
      try {
        await bot.telegram.sendMessage(chatId, `⏰ *Recordatorio:* ${message}`, {
          parse_mode: 'Markdown',
        });
        console.log(`🔔 Recordatorio #${id} disparado para chat ${chatId}`);
        // Recordatorio de un solo uso: se cancela tras dispararse
        cancelReminder(chatId, id);
      } catch (err) {
        console.error(`❌ Error enviando recordatorio #${id}:`, err.message);
      }
    },
    { timezone: TZ, scheduled: true }
  );

  if (!reminders.has(chatId)) reminders.set(chatId, []);
  reminders.get(chatId).push({ id, job, time: timeStr, message });

  return { id, time: timeStr };
}

/**
 * Cancela y elimina un recordatorio por ID.
 * @param {number} chatId
 * @param {number} id
 * @returns {boolean}
 */
function cancelReminder(chatId, id) {
  const list = reminders.get(chatId);
  if (!list) return false;
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  list[idx].job.stop();
  list.splice(idx, 1);
  if (list.length === 0) reminders.delete(chatId);
  return true;
}

/**
 * Intenta parsear la respuesta de Gemini como un recordatorio JSON.
 * @param {string} text
 * @returns {{ reminder: boolean, hour: number, minute: number, message: string } | null}
 */
function tryParseReminder(text) {
  try {
    const match = text.match(/\{[\s\S]*"reminder"\s*:\s*true[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (
      parsed.reminder === true &&
      typeof parsed.hour === 'number' &&
      typeof parsed.minute === 'number' &&
      typeof parsed.message === 'string' &&
      parsed.hour >= 0 && parsed.hour <= 23 &&
      parsed.minute >= 0 && parsed.minute <= 59
    ) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

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

// GET / → Health check para Render y UptimeRobot
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: '🤖 OpenClaw activo',
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
    timezone: TZ,
    activeReminders: [...reminders.values()].reduce((a, b) => a + b.length, 0),
  });
});

// POST /webhook/telegram → Recibe actualizaciones de Telegram
app.post('/webhook/telegram', async (req, res) => {
  try {
    const update = req.body;

    // Telegram espera un 200 rápido para evitar reintentos
    res.sendStatus(200);

    const message = update?.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const userText = message.text;
    if (!chatId || !userText) return;

    // ── /start ────────────────────────────────────────────────────────────────
    if (userText.startsWith('/start')) {
      await bot.telegram.sendMessage(
        chatId,
        '👋 ¡Hola! Soy *OpenClaw*, tu asistente IA con Google Gemini 2.5 Flash ✨\n\n' +
        '📌 *Comandos:*\n' +
        '/start — Iniciar el bot\n' +
        '/help — Ver ayuda\n' +
        '/recordatorios — Ver tus recordatorios activos\n' +
        '/cancelar <número> — Cancelar un recordatorio\n\n' +
        '⏰ *Recordatorios:* solo dímelo en lenguaje natural:\n' +
        '"Recuérdame tomar agua a las 8pm"',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // ── /help ─────────────────────────────────────────────────────────────────
    if (userText.startsWith('/help')) {
      await bot.telegram.sendMessage(
        chatId,
        '📖 *Ayuda de OpenClaw*\n\n' +
        '*Comandos:*\n' +
        '/recordatorios — Ver recordatorios activos\n' +
        '/cancelar 2 — Cancela el recordatorio #2\n\n' +
        '*Ejemplos de recordatorios:*\n' +
        '• "Recuérdame llamar a mamá a las 9pm"\n' +
        '• "Avísame de la reunión a las 3:30"\n' +
        '• "Reminder: pastillas a las 8 de la noche"',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // ── /recordatorios ────────────────────────────────────────────────────────
    if (userText.startsWith('/recordatorios')) {
      const list = reminders.get(chatId) || [];
      if (list.length === 0) {
        await bot.telegram.sendMessage(chatId, '📭 No tienes recordatorios activos.');
      } else {
        const lines = list.map((r) => `#${r.id} — ⏰ ${r.time} → ${r.message}`).join('\n');
        await bot.telegram.sendMessage(
          chatId,
          `📋 *Recordatorios activos:*\n\n${lines}\n\nUsa /cancelar <número> para eliminar uno.`,
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }

    // ── /cancelar ─────────────────────────────────────────────────────────────
    if (userText.startsWith('/cancelar')) {
      const id = parseInt(userText.split(' ')[1], 10);
      if (isNaN(id)) {
        await bot.telegram.sendMessage(chatId, '⚠️ Uso: /cancelar <número>  (ej: /cancelar 3)');
        return;
      }
      const removed = cancelReminder(chatId, id);
      await bot.telegram.sendMessage(
        chatId,
        removed ? `✅ Recordatorio #${id} cancelado.` : `❌ No encontré el recordatorio #${id}.`
      );
      return;
    }

    // ── Respuesta de IA + detección de recordatorios ──────────────────────────
    await bot.telegram.sendChatAction(chatId, 'typing');

    console.log(`📩 Mensaje de ${message.from?.username || chatId}: "${userText}"`);
    const aiResponse = await askGemini(userText);
    console.log(`✨ Gemini raw: "${aiResponse.substring(0, 120)}"`);

    const reminderData = tryParseReminder(aiResponse);

    if (reminderData) {
      const { id, time } = scheduleReminder(
        chatId,
        reminderData.hour,
        reminderData.minute,
        reminderData.message
      );
      await bot.telegram.sendMessage(
        chatId,
        `✅ ¡Recordatorio *#${id}* programado para las *${time}*!\n📌 _${reminderData.message}_`,
        { parse_mode: 'Markdown' }
      );
      console.log(`🔔 Recordatorio #${id} creado → ${time}`);
    } else {
      await bot.telegram.sendMessage(chatId, aiResponse, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    console.error('❌ Error al procesar el webhook:', error.message);
  }
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Servidor OpenClaw (Gemini) escuchando en el puerto ${PORT}`);
  console.log(`✨ Modelo: ${GEMINI_MODEL}`);
  console.log(`🌍 Zona horaria: ${TZ}`);
  console.log(`🔗 Health check: GET  http://localhost:${PORT}/`);
  console.log(`📡 Webhook:      POST http://localhost:${PORT}/webhook/telegram`);
});
