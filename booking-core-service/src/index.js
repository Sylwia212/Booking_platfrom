const express = require("express");
const amqp = require("amqplib");
const { Client } = require("pg");
const redis = require("redis");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json()); 

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq";
const RABBITMQ_USER = process.env.RABBITMQ_USER;
const RABBITMQ_PASS = process.env.RABBITMQ_PASS;
const DB_HOST = process.env.DB_HOST || "postgresql";
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME; 
const DB_PORT = parseInt(process.env.DB_PORT || "5432");
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let rabbitConnection = null;
let rabbitChannel = null;
let pgClientInstance = null;
let appServerInstance = null;


app.use((req, res, next) => {
    console.log(`CORE-SERVICE: Incoming request: ${req.method} ${req.originalUrl}`);
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
        console.log("CORE-SERVICE: Request body (after express.json):", JSON.stringify(req.body, null, 2));
    } else if (req.method === 'POST' || req.method === 'PUT') {
        console.log("CORE-SERVICE: Request body is empty or not yet parsed at logging middleware for POST/PUT.");
    }
    next();
});

async function getPgClient() {
    if (!pgClientInstance || pgClientInstance._ending) {
        console.log("CORE-SERVICE: Klient PG nieaktywny lub zamykany, próba ponownego połączenia...");
        await connectPostgreSQL();
        if (!pgClientInstance) {
            console.error("CORE-SERVICE: Nie udało się uzyskać aktywnego połączenia z bazą danych po ponownej próbie.");
            throw new Error("Nie udało się uzyskać aktywnego połączenia z bazą danych.");
        }
    }
    try {
        await pgClientInstance.query('SELECT 1');
    } catch (pingError) {
        console.error("CORE-SERVICE: Klient PG zgłasza błąd przy teście 'SELECT 1', próba ponownego połączenia.", pingError.message);
        if (pgClientInstance && typeof pgClientInstance.end === 'function') {
            await pgClientInstance.end().catch(e => console.warn("Core Service: Błąd podczas zamykania błędnego klienta PG przy getPgClient", e.message));
        }
        pgClientInstance = null;
        await connectPostgreSQL();
        if (!pgClientInstance) {
            console.error("CORE-SERVICE: Nie udało się uzyskać aktywnego połączenia z bazą danych po teście 'SELECT 1'.");
            throw new Error("Nie udało się uzyskać aktywnego połączenia z bazą danych po teście 'SELECT 1'.");
        }
    }
    return pgClientInstance;
}

async function connectPostgreSQL(maxRetries = 10, delayMs = 5000) {
    let retries = 0;
    console.log(`CORE-SERVICE: Inicjalizacja połączenia z PostgreSQL: Host=${DB_HOST}, Port=${DB_PORT}, User=${DB_USER}, DBName=${DB_NAME}`);
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
            pgClientInstance.on('error', async (err) => {
                console.error('Core Service: Utracono połączenie PostgreSQL lub inny błąd klienta:', err.stack);
                if (pgClientInstance && typeof pgClientInstance.end === 'function') {
                    await pgClientInstance.end().catch(e => console.warn("Core Service: Błąd podczas zamykania błędnego klienta PG", e.message));
                }
                pgClientInstance = null;
            });
            return;
        } catch (err) {
            retries++;
            console.error(`Core Service: Błąd połączenia z PostgreSQL (próba ${retries}/${maxRetries}): ${err.message}`);
            if (client && typeof client.end === 'function') {
                await client.end().catch(endErr => console.warn("Core Service: Błąd przy zamykaniu nieudanego połączenia PG:", endErr.message));
            }
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
    socket: { connectTimeout: 10000, reconnectStrategy: (retries) => Math.min(retries * 500, 30000) }
});
redisClient.on("error", (err) => console.error("Core Service: Błąd Redis Client:", err.message));
redisClient.on("connect", () => console.log("Core Service: Nawiązywanie połączenia z Redis..."));
redisClient.on("ready", () => console.log("Core Service: Połączono z Redis i gotowy do użycia."));
redisClient.on("reconnecting", () => console.log("Core Service: Ponowne łączenie z Redis..."));

async function connectRabbitMQWithRetry(maxRetries = 10, delayMs = 5000) {
    // ... (kod RabbitMQ bez zmian, zakładamy, że jest OK)
}

const trustGatewayHeaders = (req, res, next) => {
    const keycloakIdFromHeader = req.headers['x-user-id']; 
    const userEmailFromHeader = req.headers['x-user-email'];

    if (!keycloakIdFromHeader) {
        console.warn("CORE-SERVICE: Brak nagłówka X-User-ID od API Gateway.");
        return res.status(403).json({ message: "Brak autoryzacji (niekompletne dane od API Gateway - brak ID)." });
    }
    if (!userEmailFromHeader) { 
        console.warn("CORE-SERVICE: Brak nagłówka X-User-Email od API Gateway. Nie można zmapować użytkownika.");
        return res.status(403).json({ message: "Brak autoryzacji (niekompletne dane od API Gateway - brak emaila)." });
    }

    req.user = { 
        keycloakId: keycloakIdFromHeader,
        email: userEmailFromHeader,
    };
    console.log(`CORE-SERVICE: Użytkownik z API Gateway: KeycloakID=${req.user.keycloakId}, Email=${req.user.email}`);
    next();
};

async function getLocalUserId(userEmail, pgClient) {
    if (!userEmail) {
        console.error("CORE-SERVICE (getLocalUserId): Brak emaila do mapowania.");
        throw new Error("Brak emaila użytkownika do mapowania na ID lokalne."); 
    }
    console.log(`CORE-SERVICE (getLocalUserId): Próba mapowania emaila '${userEmail}' na lokalne user.id.`);
    const userResult = await pgClient.query("SELECT id FROM users WHERE email = $1", [userEmail]);
    if (userResult.rows.length === 0) {
        console.warn(`CORE-SERVICE (getLocalUserId): Nie znaleziono lokalnego użytkownika dla email ${userEmail}. Użytkownik musi zostać utworzony przez user-service.`);
        throw new Error(`Użytkownik o emailu ${userEmail} nie istnieje w lokalnej bazie danych. Upewnij się, że user-service synchronizuje użytkowników.`);
    }
    const localUserId = userResult.rows[0].id; 
    console.log(`CORE-SERVICE (getLocalUserId): Zmapowano email ${userEmail} na lokalne user.id: ${localUserId}.`);
    return localUserId;
}


const allSampleItems = [
    { id: "apartment_sea_view_01", name: "Apartament z Widokiem na Morze", description: "Luksusowy apartament z dwoma sypialniami i dużym tarasem.", pricePerNight: 550, currency: "PLN", location: "Sopot", type: "apartament", imageUrl: "/images/a1.jpg" },
    { id: "apartment_city_center_penthouse", name: "Penthouse w Sercu Miasta", description: "Ekskluzywny penthouse z panoramicznym widokiem i prywatnym jacuzzi.", pricePerNight: 1200, currency: "PLN", location: "Warszawa", type: "apartament", imageUrl: "/images/a2.jpg" },
    { id: "apartment_mountain_lodge", name: "Górski Domek Apartamentowy", description: "Przytulny apartament w górach, idealny na zimowy wypoczynek.", pricePerNight: 350, currency: "PLN", location: "Zakopane", type: "apartament", imageUrl: "/images/a3.jpg" },
];

app.get("/items", (req, res) => { 
    console.log("CORE-SERVICE: Obsługa GET /items - zwracanie tylko apartamentów");
    const apartments = allSampleItems.filter(item => item.type === "apartament");
    console.log(`CORE-SERVICE: Znaleziono ${apartments.length} apartamentów.`);
    res.status(200).json(apartments);
});

app.post("/bookings", trustGatewayHeaders, async (req, res) => {
    console.log("CORE-SERVICE: Handling POST /bookings (Full Logic)");
    const { itemId, startDate, endDate, numberOfGuests } = req.body;

    if (!req.user || !req.user.email) {
        console.error("CORE-SERVICE: POST /bookings - Brak danych użytkownika (email) po middleware!");
        return res.status(403).json({ message: "Błąd autoryzacji: niekompletne dane użytkownika." });
    }

    if (!itemId || !startDate || !endDate) {
        if (!res.headersSent) return res.status(400).json({ message: "Brak wymaganych pól: itemId, startDate, endDate." });
        return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        if (!res.headersSent) return res.status(400).json({ message: "Data zakończenia nie może być wcześniejsza niż data rozpoczęcia." });
        return;
    }

    let currentPgClient;
    try {
        currentPgClient = await getPgClient();
        const localUserId = await getLocalUserId(req.user.email, currentPgClient); 

        const bookingId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const guests = parseInt(numberOfGuests) || 1;
        const statusValue = "CONFIRMED";

        const queryText = `
            INSERT INTO bookings (id, item_id, user_id, start_date, end_date, number_of_guests, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, item_id, user_id, TO_CHAR(start_date, 'YYYY-MM-DD') as start_date, TO_CHAR(end_date, 'YYYY-MM-DD') as end_date, number_of_guests, status, created_at;
        `; 
        const values = [bookingId, itemId, localUserId, startDate, endDate, guests, statusValue];

        console.log("CORE-SERVICE: Próba zapisu rezerwacji do DB dla lokalnego user_id:", localUserId, "Values:", values);
        const result = await currentPgClient.query(queryText, values);
        const newDbBooking = result.rows[0];

        if (!newDbBooking) {
            console.error("CORE-SERVICE: Nie udało się pobrać danych zapisanej rezerwacji z bazy po INSERT.");
            if (!res.headersSent) return res.status(500).json({ message: "Nie udało się zapisać rezerwacji (brak zwrotu z bazy)." });
            return;
        }
        console.log("Core Service: Rezerwacja zapisana do bazy danych:", newDbBooking);

        let rabbitMqErrorMessage = null;
        if (rabbitChannel) {
            try {
                const eventData = { eventType: "BOOKING_CONFIRMED", bookingDetails: { ...newDbBooking } };
                const sent = rabbitChannel.sendToQueue("booking_events", Buffer.from(JSON.stringify(eventData)), { persistent: true });
                if (sent) console.log("Core Service: Wysłano zdarzenie BOOKING_CONFIRMED do RabbitMQ:", newDbBooking.id);
                else {
                    console.warn("Core Service: RabbitMQ channel.sendToQueue zwróciło false.");
                    rabbitMqErrorMessage = "Nie udało się wysłać powiadomienia (kanał RabbitMQ może być przepełniony).";
                }
            } catch (rabbitError) {
                console.error("Core Service: Błąd podczas wysyłania zdarzenia do RabbitMQ:", rabbitError.message, rabbitError.stack);
                rabbitMqErrorMessage = `Błąd wysyłania powiadomienia: ${rabbitError.message}`;
            }
        } else {
            console.warn("Core Service: Kanał RabbitMQ niedostępny. Zdarzenie rezerwacji nie zostało wysłane.");
            rabbitMqErrorMessage = "Powiadomienie nie zostało wysłane (kanał RabbitMQ niedostępny).";
        }
        const responseMessage = rabbitMqErrorMessage ? `Rezerwacja utworzona, ale: ${rabbitMqErrorMessage}` : "Rezerwacja utworzona i potwierdzona. Zdarzenie wysłane.";
        
        if (!res.headersSent) {
            res.status(201).json({ message: responseMessage, booking: newDbBooking, ...(rabbitMqErrorMessage && { notificationInfo: rabbitMqErrorMessage }) });
        }

    } catch (error) {
        const emailForLog = req.user && req.user.email ? req.user.email : 'nieznany email';
        console.error(`CORE-SERVICE: Błąd w POST /bookings (Full Logic) dla użytkownika (email: ${emailForLog}):`, error.stack);
        if (!res.headersSent) {
            let errMsg = "Wystąpił błąd serwera podczas tworzenia rezerwacji.";
            if (error.message && error.message.includes("Nie udało się uzyskać aktywnego połączenia")) {
                errMsg = "Usługa bazy danych jest tymczasowo niedostępna.";
            } else if (error.message && error.message.includes("nie istnieje w lokalnej bazie danych")) {
                errMsg = error.message;
                return res.status(404).json({ message: errMsg });
            }
            res.status(500).json({ message: errMsg });
        }
    }
});


app.get("/bookings/my", trustGatewayHeaders, async (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /bookings/my");

    if (!req.user || !req.user.email) {
        console.error("CORE-SERVICE: GET /bookings/my - Brak danych użytkownika (email) po middleware!");
        return res.status(403).json({ message: "Błąd autoryzacji: niekompletne dane użytkownika." });
    }
    let currentPgClient;

    try {
        currentPgClient = await getPgClient();
        const localUserId = await getLocalUserId(req.user.email, currentPgClient); 

        const queryText = "SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC;";
        console.log(`CORE-SERVICE: Pobieranie rezerwacji dla zmapowanego lokalnego user_id: ${localUserId}`);

        const result = await currentPgClient.query(queryText, [localUserId]); 
        console.log(`CORE-SERVICE: Znaleziono ${result.rows.length} rezerwacji dla lokalnego użytkownika ${localUserId}.`);
        
        if (!res.headersSent) {
            res.status(200).json(result.rows);
        }

    } catch (error) {
        const emailForLog = req.user && req.user.email ? req.user.email : 'nieznany email';
        console.error(`CORE-SERVICE: Błąd podczas pobierania rezerwacji dla użytkownika (email: ${emailForLog}):`, error.stack);
        
        if (!res.headersSent) {
            let errMsg = "Wystąpił błąd serwera podczas pobierania rezerwacji.";
            if (error.message && error.message.includes("Nie udało się uzyskać aktywnego połączenia")) {
                errMsg = "Usługa bazy danych jest tymczasowo niedostępna.";
            } else if (error.message && error.message.includes("nie istnieje w lokalnej bazie danych")) {
                console.log(`CORE-SERVICE: Użytkownik ${emailForLog} nie znaleziony lokalnie (błąd z getLocalUserId), zwracam pustą listę rezerwacji.`);
                return res.status(200).json([]); 
            }
            res.status(500).json({ message: errMsg });
        }
    }
});

app.get("/status", async (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /status");
    let rabbitmqStatus = "Offline";
    let dbStatus = "Offline";
    let redisStatus = "Offline";

    if (rabbitChannel && rabbitConnection && !rabbitConnection.closed) {
        rabbitmqStatus = "Online";
    }
    try {
        await getPgClient(); 
        dbStatus = "Online";
    } catch (e) {
        dbStatus = `Error: ${e.message}`; 
    }
    try {
        if (redisClient.isReady) { 
            await redisClient.ping();
            redisStatus = "Online";
        } else {
            redisStatus = "Not Ready";
        }
    } catch (e) {
        redisStatus = `Error: ${e.message}`;
    }

    if (!res.headersSent) {
        res.json({
            message: "Booking Core Service działa!",
            dependencies: { rabbitmq: rabbitmqStatus, database: dbStatus, redis: redisStatus }
        });
    }
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
        if (req.socket && req.socket.writable && !req.socket.destroyed) req.socket.end();
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
    } catch (error) {
        console.error("Core Service: Nie można uruchomić serwisu z powodu krytycznego błędu inicjalizacji zależności.", error.message, error.stack);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    // ... 
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startApp();