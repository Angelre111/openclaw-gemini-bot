# ─── Etapa 1: Imagen base ─────────────────────────────────────────────────────
FROM node:18-alpine

# Metadatos de la imagen
LABEL maintainer="OpenClaw Bot"
LABEL description="Bot de Telegram con Google Gemini 2.5 Flash - Desplegado en Render"

# ─── Etapa 2: Directorio de trabajo ──────────────────────────────────────────
WORKDIR /app

# ─── Etapa 3: Dependencias ────────────────────────────────────────────────────
# Copiamos primero solo package*.json para aprovechar la caché de capas de Docker.
# Si el código cambia pero no las dependencias, Docker reutiliza esta capa.
COPY package*.json ./

# Instalamos solo dependencias de producción (sin devDependencies)
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# ─── Etapa 4: Código fuente ───────────────────────────────────────────────────
COPY . .

# ─── Etapa 5: Configuración de red ───────────────────────────────────────────
# Render asigna el puerto dinámicamente via la variable PORT.
# Exponemos 3000 como referencia; el valor real viene de process.env.PORT.
EXPOSE 3000

# ─── Etapa 6: Usuario no-root (buena práctica de seguridad) ──────────────────
USER node

# ─── Etapa 7: Comando de inicio ──────────────────────────────────────────────
CMD ["npm", "start"]
