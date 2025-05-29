# Etap budowania (builder stage)
FROM node:20-alpine AS builder
LABEL stage="builder"

# Ustawienie środowiska - ARG NODE_ENV jest przekazywane z docker-compose.yml
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Kopiuj pliki manifestu aplikacji
COPY package.json package-lock.json* ./

# Zainstaluj zależności produkcyjne używając npm ci
RUN npm ci --omit=dev

# Kopiuj resztę kodu aplikacji
COPY ./src ./src


# Etap produkcyjny (production stage)
FROM node:20-alpine AS production
LABEL stage="production"

# Ustawienie środowiska
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3001 

WORKDIR /app

# Utwórz użytkownika i grupę aplikacji dla bezpieczeństwa
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Zainstaluj curl dla healthcheck (wymagany przez Twój docker-compose.yml)
RUN apk add --no-cache curl

# Kopiuj zależności z etapu buildera
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Kopiuj pliki manifestu aplikacji
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/package-lock.json* ./package-lock.json*

# Kopiuj kod aplikacji z etapu buildera - TO BYŁ KLUCZOWY BŁĄD W POPRZEDNIEJ WERSJI
COPY --from=builder --chown=appuser:appgroup /app/src ./src

# Ustaw użytkownika aplikacji
USER appuser

EXPOSE ${PORT}

CMD ["node", "src/index.js"]
