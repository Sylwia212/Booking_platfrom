# Etap budowania (build stage)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . . 

# Etap produkcyjny (production stage)
FROM node:18-alpine
WORKDIR /app

# Dodaj curl dla healthcheck, jeśli go używasz
RUN apk add --no-cache curl 

# Kopiuj tylko to, co potrzebne z etapu budowania
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src 

EXPOSE 3000
CMD ["node", "src/server.js"] 