const express = require("express");
const amqp = require("amqplib");
const { Client } = require("pg");
const redis = require("redis");
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq";
const RABBITMQ_USER = process.env.RABBITMQ_USER;
const RABBITMQ_PASS = process.env.RABBITMQ_PASS;
const DB_HOST = process.env.DB_HOST || "postgresql";
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT || 5432;
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("CORE-SERVICE: KRYTYCZNY BŁĄD - Zmienna środowiskowa JWT_SECRET nie jest ustawiona! Serwis nie będzie mógł poprawnie weryfikować tokenów.");
    process.exit(1);
} else {
    console.log(`CORE-SERVICE: JWT_SECRET załadowany (długość: ${JWT_SECRET.length}).`);
}

let rabbitChannel;

app.use(express.json());

app.use((req, res, next) => {
    console.log(`CORE-SERVICE: Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

const pgClient = new Client({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
});

pgClient
  .connect()
  .then(() => console.log("Core Service: Połączono z PostgreSQL"))
  .catch((err) => {
    console.error("Core Service: Błąd połączenia z PostgreSQL", err.stack);
    process.exit(1);
  });

const redisClient = redis.createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
  password: REDIS_PASSWORD,
});

redisClient.on("error", (err) => console.error("Core Service: Błąd Redis Client", err));
redisClient
  .connect()
  .then(() => console.log("Core Service: Połączono z Redis"))
  .catch((err) => console.error("Core Service: Błąd połączenia z Redis", err.stack));

async function connectRabbitMQ() {
  try {
    const connectionString = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}`;
    const connection = await amqp.connect(connectionString);
    rabbitChannel = await connection.createChannel();
    await rabbitChannel.assertQueue("booking_events", { durable: true });
    console.log("Core Service: Połączono z RabbitMQ i utworzono kolejkę 'booking_events'");
  } catch (error) {
    console.error("Core Service: Błąd połączenia z RabbitMQ:", error.message);
    console.log("Core Service: Ponowna próba połączenia z RabbitMQ za 5 sekund...");
    setTimeout(connectRabbitMQ, 5000);
  }
}
connectRabbitMQ();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        console.log("CORE-SERVICE: Auth Error - Brak tokenu.");
        return res.status(401).json({ message: "Brak autoryzacji (brak tokenu)." });
    }

    console.log(`CORE-SERVICE: Weryfikacja tokenu przy użyciu JWT_SECRET o długości: ${JWT_SECRET.length}`);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("CORE-SERVICE: Auth Error - Nieprawidłowy token:", err.message);
            return res.status(403).json({ message: "Brak autoryzacji (nieprawidłowy lub wygasły token)." });
        }
        req.user = user; 
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
    const userId = req.user.userId; 

    if (!userId) {
        console.error("CORE-SERVICE: Błąd krytyczny - brak userId w zdekodowanym tokenie!");
        return res.status(403).json({ message: "Błąd autoryzacji: nie można zidentyfikować użytkownika." });
    }
    if (!itemId || !startDate || !endDate) {
        return res.status(400).json({ message: "Brak wymaganych pól: itemId, startDate, endDate." });
    }
    if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ message: "Data zakończenia nie może być wcześniejsza niż data rozpoczęcia." });
    }

    const bookingId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const guests = parseInt(numberOfGuests) || 1;
    const status = "CONFIRMED"; 

    try {
        const query = `
            INSERT INTO bookings (id, item_id, user_id, start_date, end_date, number_of_guests, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [bookingId, itemId, userId, startDate, endDate, guests, status];
        
        console.log("CORE-SERVICE: Próba zapisu rezerwacji do DB dla userId:", userId, "Values:", values);
        const result = await pgClient.query(query, values);
        const newDbBooking = result.rows[0];
        console.log("Core Service: Rezerwacja zapisana do bazy danych:", newDbBooking);

        if (rabbitChannel) {
            const eventData = { eventType: "BOOKING_CONFIRMED", ...newDbBooking };
            rabbitChannel.sendToQueue("booking_events", Buffer.from(JSON.stringify(eventData)), { persistent: true });
            console.log("Core Service: Wysłano zdarzenie BOOKING_CONFIRMED do RabbitMQ:", newDbBooking.id);
        } else {
            console.error("Core Service: Błąd - Połączenie z RabbitMQ niedostępne przy próbie wysłania zdarzenia rezerwacji.");
        }
        res.status(201).json({ message: "Rezerwacja utworzona i potwierdzona.", booking: newDbBooking });
    } catch (dbError) {
        console.error("Core Service: Błąd podczas zapisu rezerwacji do bazy danych:", dbError.stack);
        res.status(500).json({ message: "Wystąpił błąd serwera podczas tworzenia rezerwacji." });
    }
});

app.get("/bookings/my", authenticateToken, async (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /bookings/my");
    const userId = req.user.userId;

    if (!userId) {
        console.error("CORE-SERVICE: Błąd krytyczny w /bookings/my - brak userId w zdekodowanym tokenie!");
        return res.status(403).json({ message: "Błąd autoryzacji: nie można zidentyfikować użytkownika." });
    }

    try {
        const query = "SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC;";
        console.log(`CORE-SERVICE: Pobieranie rezerwacji dla userId: ${userId}`);
        const result = await pgClient.query(query, [userId]);
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

    if (rabbitChannel) { rabbitmqStatus = "Online"; }
    try { await pgClient.query("SELECT 1"); dbStatus = "Online"; }
    catch (e) { console.error("Core Service: Błąd statusu DB:", e.message); }
    try {
        if (redisClient.isReady) { await redisClient.ping(); redisStatus = "Online"; }
        else { redisStatus = "Not Ready"; }
    } catch (e) { console.error("Core Service: Błąd statusu Redis:", e.message); }

    res.json({
        message: "Booking Core Service działa!",
        dependencies: { rabbitmq: rabbitmqStatus, database: dbStatus, redis: redisStatus }
    });
});

app.use((err, req, res, next) => {
    console.error("CORE-SERVICE - Nieobsłużony błąd:", err.stack || err.message || err);
    if (res && !res.headersSent) {
        res.status(err.status || 500).json({
            message: err.message || "Wewnętrzny błąd serwera w Core Service",
            error: process.env.NODE_ENV === 'development' ? (err.stack || err.message) : {}
        });
    } else if (res && res.headersSent) {
        console.error('CORE-SERVICE Global Error Handler: Headers already sent.');
        next(err);
    } else {
        console.error('CORE-SERVICE Global Error Handler: Response object is undefined.');
    }
});

app.listen(PORT, () => {
    console.log(`Booking Core Service nasłuchuje na porcie ${PORT}`);
});

async function gracefulShutdown() {
    console.log("Core Service: Rozpoczęcie zamykania...");
    if (rabbitChannel) {
        try {
            const connection = rabbitChannel.connection;
            await rabbitChannel.close(); console.log("Core Service: Kanał RabbitMQ zamknięty.");
            if (connection) { await connection.close(); console.log("Core Service: Połączenie RabbitMQ zamknięte."); }
        } catch (err) { console.error("Core Service: Błąd podczas zamykania RabbitMQ", err.message); }
    }
    if (pgClient) {
        try { await pgClient.end(); console.log("Core Service: Połączenie PostgreSQL zamknięte."); }
        catch (err) { console.error("Core Service: Błąd podczas zamykania PostgreSQL", err.message); }
    }
    if (redisClient && redisClient.isReady) {
        try { await redisClient.quit(); console.log("Core Service: Połączenie Redis zamknięte."); }
        catch (err) { console.error("Core Service: Błąd podczas zamykania Redis", err.message); }
    }
    console.log("Core Service: Zamykanie zakończone.");
    process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
