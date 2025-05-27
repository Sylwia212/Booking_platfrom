# booking-platform/booking-api/Dockerfile

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

# Jeśli masz również inne pliki w głównym katalogu API, możesz je skopiować.
# W Twoim przypadku, sam server.js jest w src/.
# Więc nie potrzebujesz osobnej linii do kopiowania server.js, jeśli src jest już skopiowane.
# Upewnij się, że CMD wskazuje na właściwą ścieżkę.

EXPOSE 3000
CMD ["node", "src/server.js"] 