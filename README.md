# OpenClaw — Bot de Telegram con Google Gemini 2.5 Flash

> Bot de Telegram impulsado por IA utilizando el SDK oficial [@google/genai](https://www.npmjs.com/package/@google/genai) con el modelo `gemini-2.5-flash`. Desplegable en [Render](https://render.com/) con Docker.

---

## 🛠️ Stack Tecnológico

| Tecnología | Uso |
|---|---|
| **Node.js 18** | Runtime de JavaScript |
| **Express** | Servidor web / webhook |
| **Telegraf** | Cliente de la API de Telegram |
| **@google/genai** | SDK oficial de Google Gemini |
| **Docker** | Contenerización |
| **Render** | Plataforma de despliegue |

---

## ⚙️ Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto (**no lo subas a Git**):

```env
TELEGRAM_BOT_TOKEN=tu_token_del_bot_de_telegram
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
PORT=3000
```

| Variable | Descripción | Cómo obtenerla |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token de tu bot | [@BotFather](https://t.me/BotFather) en Telegram |
| `GEMINI_API_KEY` | API Key de Google | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `PORT` | Puerto del servidor | Render lo asigna automáticamente |

---

## 🚀 Ejecución Local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo .env con tus credenciales

# 3. Iniciar el servidor
npm start
```

---

## 🐳 Ejecución con Docker

```bash
docker build -t openclaw-gemini-bot .

docker run -p 3000:3000 \
  -e TELEGRAM_BOT_TOKEN=tu_token \
  -e GEMINI_API_KEY=tu_api_key \
  openclaw-gemini-bot
```

---

## 📡 Configurar el Webhook de Telegram

```bash
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<TU_APP>.onrender.com/webhook/telegram"}'
```

---

*Desarrollado con ❤️ usando Google Gemini 2.5 Flash*
