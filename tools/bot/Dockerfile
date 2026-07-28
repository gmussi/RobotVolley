# Matchmaking bot fleet. Build from the repo root:
#   docker build -f tools/bot/Dockerfile -t robot-volley-bots .
#   docker run --rm -e BOT_MM_URL=wss://…/ws -e BOT_SECRET=… robot-volley-bots --count 8
#
# Bots run the real game engine, so this image needs src/ and shared/ as well as
# tools/bot/ — it is a client, not a service.
FROM node:20-slim

WORKDIR /app

# node-datachannel ships prebuilt binaries; nothing needs compiling.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm install --no-save ws node-datachannel \
 && npm cache clean --force

COPY src ./src
COPY shared ./shared
COPY tools/bot ./tools/bot

# Credentials live here so a mounted volume keeps the fleet's accounts stable
# across restarts. Without one, every run creates a fresh set of accounts.
VOLUME ["/app/tools/bot/.credentials"]

ENV NODE_ENV=production
ENTRYPOINT ["node", "tools/bot/run.mjs"]
CMD ["--count", "4"]
