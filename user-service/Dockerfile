# Etap budowania (builder stage)
FROM node:20-alpine AS builder
LABEL stage="builder"

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev # lub npm install --only=production

COPY ./src ./src

# Etap produkcyjny (production stage)
FROM node:20-alpine AS production
LABEL stage="production"

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3003

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk add --no-cache curl # Dla healthcheck

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/package-lock.json* ./package-lock.json*
COPY --from=builder --chown=appuser:appgroup /app/src ./src

USER appuser

EXPOSE ${PORT}

CMD ["node", "src/index.js"]
