FROM node:20-bookworm-slim

# Install Chromium + FFmpeg + libs + Arabic-capable fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    fonts-noto \
    fonts-noto-core \
    fonts-noto-cjk \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
    libgtk-3-0 libgbm1 libasound2 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV OUTPUT_DIR=/data/videos
ENV PORT=3000

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -20

COPY . .
RUN mkdir -p /data/videos

EXPOSE 3000
CMD ["node", "server.js"]
