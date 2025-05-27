# --- Etap I: Etap budowania (builder) ---
# Używamy oficjalnego obrazu Node.js jako bazowego
FROM node:18-alpine AS builder

# Ustawiamy katalog roboczy w kontenerze
WORKDIR /app

# Kopiujemy pliki package.json i package-lock.json (jeśli używasz)
# Ułatwia to cachowanie warstw - jeśli zmienisz tylko kod, a nie zależności,
# npm install nie będzie uruchamiane ponownie.
COPY package*.json ./

# Instalujemy zależności projektu.
# --omit=dev usuwa zależności deweloperskie, które nie są potrzebne w produkcji.
RUN npm install --omit=dev

# Kopiujemy resztę kodu źródłowego aplikacji
# Upewnij się, że ta ścieżka jest poprawna dla Twojego projektu.
# Zakładam, że pliki źródłowe są bezpośrednio w katalogu /app lub w podkatalogu 'src'.
# Jeśli Twój kod jest np. w katalogu 'src' w projekcie lokalnym,
# a chcesz, aby w kontenerze był w '/app/src', to zostaw 'src/'.
# Jeśli wszystkie pliki są bezpośrednio w katalogu 'booking-core-service',
# a chcesz, aby były w '/app', to użyj 'COPY . .'
COPY . .

# Jeśli Twoja aplikacja ma jakieś procesy kompilacji (np. TypeScript, Babel),
# dodaj je tutaj. Na przykład: RUN npm run build

# --- Etap II: Etap końcowy (produkcyjny) ---
# Używamy mniejszego obrazu Node.js dla finalnego kontenera
# To zmniejsza rozmiar obrazu i powierzchnię ataku.
FROM node:18-alpine

# Ustawiamy katalog roboczy dla aplikacji w kontenerze
WORKDIR /app

# Kopiujemy tylko niezbędne pliki z etapu 'builder' do finalnego obrazu:
# 1. Zainstalowane zależności npm (node_modules)
COPY --from=builder /app/node_modules ./node_modules

# 2. Pliki konfiguracyjne projektu (np. package.json, żeby npm mógł odnaleźć skrypty)
# To jest kluczowe, bo błąd "ENOENT: no such file or directory, open '/app/package.json'" wskazywał,
# że tego pliku brakowało w finalnym obrazie.
COPY --from=builder /app/package.json ./package.json

# 3. Kopiujemy główny kod aplikacji.
# Ponownie, dostosuj ścieżkę do struktury Twojego projektu.
# Jeśli Twój główny plik startowy to np. 'src/index.js' i reszta kodu jest w 'src/', użyj:
COPY --from=builder /app/src ./src

# Jeśli pliki źródłowe są bezpośrednio w katalogu 'booking-core-service', użyj:
# COPY --from=builder /app .
# Ale upewnij się, że nie kopiujesz niepotrzebnych rzeczy jak Dockerfile, git itp.
# Jeśli masz pliki konfiguracyjne poza 'src', też musisz je skopiować.

# Odsłaniamy port, na którym nasłuchuje Twoja aplikacja Node.js
# Zastąp 3000 rzeczywistym portem, na którym nasłuchuje booking-core-service
EXPOSE 3000

# Komenda do uruchomienia aplikacji po starcie kontenera
# Zastąp 'npm start' rzeczywistą komendą, która uruchamia Twoją aplikację.
# Często jest to skrypt 'start' zdefiniowany w package.json
CMD ["npm", "start"]
# Alternatywnie, jeśli uruchamiasz plik bezpośrednio:
# CMD ["node", "src/index.js"]