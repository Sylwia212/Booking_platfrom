# Etap budowania (builder stage)
FROM node:18-alpine AS builder
LABEL stage="builder"

# Ustawienie środowiska - ARG NODE_ENV jest przekazywane z docker-compose.yml
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Kopiuj pliki manifestu aplikacji
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

COPY ./src ./src


# Etap produkcyjny (production stage)
FROM node:18-alpine AS production
LABEL stage="production"

# Ustawienie środowiska
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3000

WORKDIR /app

# Utwórz użytkownika i grupę aplikacji dla bezpieczeństwa
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Zainstaluj curl dla healthcheck (jeśli jest używany w docker-compose.yml)
RUN apk add --no-cache curl

# Kopiuj zależności z etapu buildera
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Kopiuj pliki manifestu aplikacji
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/package-lock.json* ./package-lock.json*

# Kopiuj kod aplikacji z etapu buildera
COPY --from=builder --chown=appuser:appgroup /app/src ./src

# Ustaw użytkownika aplikacji
USER appuser

EXPOSE ${PORT}

CMD ["node", "src/server.js"]
