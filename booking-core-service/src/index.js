const express = require("express");
const amqp = require("amqplib");
const { Client } = require("pg");
const redis = require("redis");
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq-service";
const RABBITMQ_USER = process.env.RABBITMQ_USER;
const RABBITMQ_PASS = process.env.RABBITMQ_PASS;
const DB_HOST = process.env.DB_HOST || "postgresql-service";
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = parseInt(process.env.DB_PORT || "5432");
const REDIS_HOST = process.env.REDIS_HOST || "redis-service";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("CORE-SERVICE: KRYTYCZNY BŁĄD - Zmienna środowiskowa JWT_SECRET nie jest ustawiona! Serwis nie będzie mógł poprawnie weryfikować tokenów.");
    process.exit(1);
} else {
    console.log(`CORE-SERVICE: JWT_SECRET załadowany (długość: ${JWT_SECRET.length}).`);
}

let rabbitConnection = null;
let rabbitChannel = null;
let pgClientInstance = null; 
let appServerInstance = null; 

app.use(express.json());

app.use((req, res, next) => {
    console.log(`CORE-SERVICE: Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

async function connectPostgreSQL(maxRetries = 10, delayMs = 5000) {
    let retries = 0;
    console.log(`CORE-SERVICE: Inicjalizacja połączenia z PostgreSQL: Host=${DB_HOST}, Port=${DB_PORT}, User=${DB_USER ? 'OK' : 'BRAK'}, DBName=${DB_NAME ? 'OK' : 'BRAK'}`);
    if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
        console.error("CORE-SERVICE: KRYTYCZNY BŁĄD - Brak wszystkich zmiennych środowiskowych dla bazy danych (DB_USER, DB_PASSWORD, DB_NAME).");
        throw new Error("Brak konfiguracji bazy danych.");
    }

    while (retries < maxRetries) {
        const client = new Client({ 
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            connectionTimeoutMillis: 5000, 
        });
        try {
            await client.connect();
            console.log("Core Service: Połączono z PostgreSQL.");
            pgClientInstance = client; 
            pgClientInstance.on('error', (err) => {
                console.error('Core Service: Utracono połączenie PostgreSQL lub inny błąd klienta:', err.stack);
                
            });
            return; 
        } catch (err) {
            retries++;
            console.error(`Core Service: Błąd połączenia z PostgreSQL (próba ${retries}/${maxRetries}): ${err.message}`);
            await client.end().catch(endErr => console.warn("Core Service: Błąd przy zamykaniu nieudanego połączenia PG:", endErr.message)); 
            if (retries >= maxRetries) {
                console.error("Core Service: KRYTYCZNY BŁĄD - Nie udało się połączyć z PostgreSQL po maksymalnej liczbie prób.");
                throw err;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

const redisClient = redis.createClient({
    url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
    password: REDIS_PASSWORD,
    socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => Math.min(retries * 500, 30000) 
    }
});

redisClient.on("error", (err) => console.error("Core Service: Błąd Redis Client:", err.message));
redisClient.on("connect", () => console.log("Core Service: Nawiązywanie połączenia z Redis..."));
redisClient.on("ready", () => console.log("Core Service: Połączono z Redis i gotowy do użycia."));
redisClient.on("reconnecting", () => console.log("Core Service: Ponowne łączenie z Redis..."));

async function connectRabbitMQWithRetry(maxRetries = 10, delayMs = 5000) {
    let retries = 0;
    while(retries < maxRetries) {
        try {
            const connectionString = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}`;
            console.log(`Core Service: Próba połączenia z RabbitMQ (próba ${retries + 1}/${maxRetries})...`);
            rabbitConnection = await amqp.connect(connectionString);
            console.log("Core Service: Połączono z RabbitMQ (serwer).");

            rabbitConnection.on("error", (err) => {
                console.error("Core Service: Błąd połączenia RabbitMQ (event 'error'):", err.message);
                rabbitChannel = null;
                rabbitConnection = null; 
                setTimeout(() => connectRabbitMQWithRetry(maxRetries, delayMs), delayMs * 2); // Dłuższe opóźnienie
            });
            rabbitConnection.on("close", () => {
                if (rabbitConnection) { 
                    console.error("Core Service: Połączenie RabbitMQ zamknięte (event 'close'). Próba ponownego połączenia...");
                    rabbitChannel = null;
                    rabbitConnection.removeAllListeners(); 
                    rabbitConnection = null;
                    setTimeout(() => connectRabbitMQWithRetry(maxRetries, delayMs), delayMs);
                }
            });

            rabbitChannel = await rabbitConnection.createChannel();
            console.log("Core Service: Utworzono kanał RabbitMQ.");

            rabbitChannel.on("error", (err) => {
                console.error("Core Service: Błąd kanału RabbitMQ (event 'error'):", err.message);
                rabbitChannel = null;
                
                if (rabbitConnection && !rabbitConnection.closed) { 
                    console.log("Core Service: Próba odtworzenia kanału RabbitMQ...");
                    rabbitConnection.createChannel().then(ch => {
                        rabbitChannel = ch;
                        console.log("Core Service: Kanał RabbitMQ odtworzony.");
                        return rabbitChannel.assertQueue("booking_events", { durable: true });
                    }).catch(channelErr => {
                        console.error("Core Service: Nie udało się odtworzyć kanału RabbitMQ:", channelErr.message);
                        rabbitChannel = null;
                    });
                }
            });
            rabbitChannel.on("close", () => {
                console.log("Core Service: Kanał RabbitMQ został zamknięty (event 'close').");
                rabbitChannel = null;
            });

            await rabbitChannel.assertQueue("booking_events", { durable: true });
            console.log("Core Service: Kolejka 'booking_events' zapewniona.");
            return; 
        } catch (error) {
            retries++;
            console.error(`Core Service: Błąd połączenia z RabbitMQ (próba ${retries}/${maxRetries}):`, error.message);
            if (rabbitConnection) { 
                await rabbitConnection.close().catch(e => console.error("Core Service: Błąd przy zamykaniu nieudanego połączenia RabbitMQ:", e.message));
                rabbitConnection = null;
                rabbitChannel = null;
            }
            if (retries >= maxRetries) {
                console.warn("Core Service: Nie udało się połączyć z RabbitMQ po maksymalnej liczbie prób. Serwis będzie działać w ograniczonym zakresie (bez wysyłania zdarzeń).");
                return; 
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        console.log("CORE-SERVICE: Auth Error - Brak tokenu.");
        return res.status(401).json({ message: "Brak autoryzacji (brak tokenu)." });
    }

    console.log(`CORE-SERVICE: Weryfikacja tokenu...`);
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) {
            console.error("CORE-SERVICE: Auth Error - Nieprawidłowy token:", err.message);
            return res.status(403).json({ message: `Brak autoryzacji (${err.name === 'TokenExpiredError' ? 'token wygasł' : 'nieprawidłowy token'}).` });
        }
        req.user = userPayload; 
        console.log("CORE-SERVICE: Token zweryfikowany pomyślnie dla userId:", req.user.userId);
        next();
    });
};

const allSampleItems = [
    { id: "apartment_sea_view_01", name: "Apartament z Widokiem na Morze", description: "Luksusowy apartament z dwoma sypialniami i dużym tarasem.", pricePerNight: 550, currency: "PLN", location: "Sopot", type: "apartament", imageUrl: "/images/a1.jpg" },
    { id: "apartment_city_center_penthouse", name: "Penthouse w Sercu Miasta", description: "Ekskluzywny penthouse z panoramicznym widokiem i prywatnym jacuzzi.", pricePerNight: 1200, currency: "PLN", location: "Warszawa", type: "apartament", imageUrl: "/images/a2.jpg" },
    { id: "apartment_mountain_lodge", name: "Górski Domek Apartamentowy", description: "Przytulny apartament w górach, idealny na zimowy wypoczynek.", pricePerNight: 350, currency: "PLN", location: "Zakopane", type: "apartament", imageUrl: "/images/a3.jpg" },
    { id: "hotel_room_101", name: "Przytulny Pokój Standard", pricePerNight: 180, currency: "PLN", location: "Górki Małe", type: "pokój hotelowy", imageUrl: "/images/a4.jpg" }
];

app.get("/items", (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /items - zwracanie tylko apartamentów");
    const apartments = allSampleItems.filter(item => item.type === "apartament");
    res.status(200).json(apartments);
});

app.post("/bookings", authenticateToken, async (req, res) => {
    console.log("CORE-SERVICE: Obsługa POST /bookings (uwierzytelniona)");
    const { itemId, startDate, endDate, numberOfGuests } = req.body;
    
    if (!req.user || !req.user.userId) { 
        console.error("CORE-SERVICE: Błąd krytyczny w POST /bookings - brak userId w zdekodowanym tokenie (req.user niepoprawny)!");
        return res.status(403).json({ message: "Błąd autoryzacji: nie można zidentyfikować użytkownika (błąd tokenu)." });
    }
    const userId = req.user.userId;

    if (!itemId || !startDate || !endDate) {
        return res.status(400).json({ message: "Brak wymaganych pól: itemId, startDate, endDate." });
    }
    if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ message: "Data zakończenia nie może być wcześniejsza niż data rozpoczęcia." });
    }

    const bookingId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const guests = parseInt(numberOfGuests) || 1;
    const status = "CONFIRMED"; 
    let newDbBooking;

    if (!pgClientInstance) {
        console.error("Core Service: Brak połączenia z bazą danych do zapisu rezerwacji.");
        return res.status(503).json({ message: "Usługa bazy danych jest tymczasowo niedostępna." });
    }

    try {
        const query = `
            INSERT INTO bookings (id, item_id, user_id, start_date, end_date, number_of_guests, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [bookingId, itemId, userId, startDate, endDate, guests, status];
        
        console.log("CORE-SERVICE: Próba zapisu rezerwacji do DB dla userId:", userId, "Values:", values);
        const result = await pgClientInstance.query(query, values); 
        newDbBooking = result.rows[0];

        if (!newDbBooking) {
            throw new Error("Nie udało się pobrać danych zapisanej rezerwacji z bazy (brak wiersza zwrotnego).");
        }
        console.log("Core Service: Rezerwacja zapisana do bazy danych:", newDbBooking);

        let rabbitMqErrorMessage = null;
        if (rabbitChannel) { 
            try {
                const eventData = { eventType: "BOOKING_CONFIRMED", bookingDetails: { ...newDbBooking } };
                const sent = rabbitChannel.sendToQueue(
                    "booking_events", 
                    Buffer.from(JSON.stringify(eventData)), 
                    { persistent: true }
                );
                if (sent) {
                    console.log("Core Service: Wysłano zdarzenie BOOKING_CONFIRMED do RabbitMQ:", newDbBooking.id);
                } else {
                    console.warn("Core Service: RabbitMQ channel.sendToQueue zwróciło false. Wiadomość mogła nie zostać wysłana.");
                    rabbitMqErrorMessage = "Nie udało się wysłać powiadomienia (kanał RabbitMQ może być przepełniony).";
                }
            } catch (rabbitError) {
                console.error("Core Service: Błąd krytyczny podczas wysyłania zdarzenia do RabbitMQ:", rabbitError.message, rabbitError.stack);
                rabbitMqErrorMessage = `Błąd wysyłania powiadomienia: ${rabbitError.message}`;
            }
        } else {
            console.warn("Core Service: Kanał RabbitMQ niedostępny. Zdarzenie rezerwacji nie zostało wysłane.");
            rabbitMqErrorMessage = "Powiadomienie nie zostało wysłane (kanał RabbitMQ niedostępny).";
        }
            
        const responseMessage = rabbitMqErrorMessage ? 
            `Rezerwacja utworzona, ale: ${rabbitMqErrorMessage}` : 
            "Rezerwacja utworzona i potwierdzona. Zdarzenie wysłane.";
            
        return res.status(201).json({ 
            message: responseMessage, 
            booking: newDbBooking,
            ...(rabbitMqErrorMessage && { notificationInfo: rabbitMqErrorMessage }) 
        });

    } catch (error) { 
        console.error("Core Service: Błąd krytyczny podczas operacji na bazie danych lub innej logiki w POST /bookings:", error.stack);
        if (!res.headersSent) {
            return res.status(500).json({ message: "Wystąpił błąd serwera podczas tworzenia rezerwacji." });
        }
    }
});

app.get("/bookings/my", authenticateToken, async (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /bookings/my");
    
    if (!req.user || !req.user.userId) {
        console.error("CORE-SERVICE: Błąd krytyczny w /bookings/my - brak userId w zdekodowanym tokenie (req.user niepoprawny)!");
        return res.status(403).json({ message: "Błąd autoryzacji: nie można zidentyfikować użytkownika (błąd tokenu)." });
    }
    const userId = req.user.userId;

    if (!pgClientInstance) {
        console.error("Core Service: Brak połączenia z bazą danych do pobrania rezerwacji.");
        return res.status(503).json({ message: "Usługa bazy danych jest tymczasowo niedostępna." });
    }

    try {
        const query = "SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC;";
        console.log(`CORE-SERVICE: Pobieranie rezerwacji dla userId: ${userId}`);
        const result = await pgClientInstance.query(query, [userId]); // Używamy pgClientInstance
        console.log(`CORE-SERVICE: Znaleziono ${result.rows.length} rezerwacji dla użytkownika ${userId}.`);
        res.status(200).json(result.rows);
    } catch (dbError) {
        console.error(`CORE-SERVICE: Błąd podczas pobierania rezerwacji dla użytkownika ${userId}:`, dbError.stack);
        res.status(500).json({ message: "Wystąpił błąd serwera podczas pobierania rezerwacji." });
    }
});

app.get("/api/core/status", async (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /api/core/status");
    let rabbitmqStatus = "Offline";
    let dbStatus = "Offline";
    let redisStatus = "Offline";

    if (rabbitChannel && rabbitConnection && !rabbitConnection.closed) { 
        rabbitmqStatus = "Online";
    }
    try { 
        if (pgClientInstance) await pgClientInstance.query("SELECT 1"); 
        else throw new Error("pgClientInstance not initialized");
        dbStatus = "Online"; 
    } catch (e) { 
        // console.warn("Core Service: Błąd statusu DB (może być normalne podczas startu):", e.message); 
    }
    try {
        if (redisClient.isReady) { 
            await redisClient.ping(); 
            redisStatus = "Online"; 
        } else { 
            redisStatus = "Not Ready"; 
        }
    } catch (e) { 
        // console.warn("Core Service: Błąd statusu Redis (może być normalne podczas startu):", e.message);
    }

    res.json({
        message: "Booking Core Service działa!",
        dependencies: { rabbitmq: rabbitmqStatus, database: dbStatus, redis: redisStatus }
    });
});

app.use((err, req, res, next) => {
    console.error("CORE-SERVICE - Nieobsłużony błąd globalny:", err.stack || err.message || err);
    if (res && !res.headersSent) {
        res.status(err.status || 500).json({
            message: err.message || "Wewnętrzny błąd serwera w Core Service",
            error: process.env.NODE_ENV === 'development' ? (err.stack || err.message) : "Internal Server Error"
        });
    } else if (res && res.headersSent) {
        console.error('CORE-SERVICE Global Error Handler: Headers already sent.');
        next(err); 
    } else {
        console.error('CORE-SERVICE Global Error Handler: Response object is undefined.');
    }
});

async function startApp() {
    try {
        
        await connectPostgreSQL(); 
        await redisClient.connect().catch(err => { 
            console.error("Core Service: Inicjalne połączenie z Redis nie powiodło się, polegamy na wbudowanym retry:", err.message);
        });
        await connectRabbitMQWithRetry(); 

        appServerInstance = app.listen(PORT, () => { 
            console.log(`Booking Core Service nasłuchuje na porcie ${PORT} po zainicjowaniu zależności.`);
        });
        app.set('serverInstance', appServerInstance); 

    } catch (error) {
        console.error("Core Service: Nie można uruchomić serwisu z powodu krytycznego błędu inicjalizacji zależności.", error.message, error.stack);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    console.log("Core Service: Rozpoczęcie zamykania...");
    
    if (appServerInstance) {
        console.log('Core Service: Zamykanie serwera HTTP...');
        await new Promise(resolve => appServerInstance.close(() => {
            console.log('Core Service: Serwer HTTP zamknięty.');
            resolve();
        }));
    }

    if (rabbitChannel) {
        try { await rabbitChannel.close(); console.log("Core Service: Kanał RabbitMQ zamknięty."); } 
        catch (err) { console.error("Core Service: Błąd podczas zamykania kanału RabbitMQ", err.message); }
    }
    if (rabbitConnection) {
        try { await rabbitConnection.close(); console.log("Core Service: Połączenie RabbitMQ zamknięte."); } 
        catch (err) { console.error("Core Service: Błąd podczas zamykania połączenia RabbitMQ", err.message); }
    }

    if (pgClientInstance) { 
        try { await pgClientInstance.end(); console.log("Core Service: Połączenie PostgreSQL zamknięte."); }
        catch (err) { console.error("Core Service: Błąd podczas zamykania PostgreSQL", err.message); }
    }
    if (redisClient && redisClient.isOpen) { 
        try { await redisClient.quit(); console.log("Core Service: Połączenie Redis zamknięte."); }
        catch (err) { console.error("Core Service: Błąd podczas zamykania Redis", err.message); }
    }
    console.log("Core Service: Zamykanie zakończone.");
    process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startApp();