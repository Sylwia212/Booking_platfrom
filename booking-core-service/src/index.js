const express = require("express");
const amqp = require("amqplib");
const { Client } = require("pg");
const redis = require("redis");
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
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

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
  port: process.env.DB_PORT || 5432, 
});

pgClient
  .connect()
  .then(() => console.log("Core Service: Połączono z PostgreSQL"))
  .catch((err) =>
    console.error("Core Service: Błąd połączenia z PostgreSQL", err.stack) 
  );


const redisClient = redis.createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
  password: REDIS_PASSWORD,
});

redisClient.on("error", (err) =>
  console.error("Core Service: Błąd Redis Client", err)
);
redisClient
  .connect()
  .then(() => console.log("Core Service: Połączono z Redis"))
  .catch((err) => console.error("Core Service: Błąd połączenia z Redis", err.stack)); 

async function connectRabbitMQ() {
  try {
    const connectionString = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}`;
    console.log(`Core Service: Próba połączenia z RabbitMQ używając: amqp://USER:PASS@${RABBITMQ_HOST}`); 
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


const allSampleItems = [
    {
        id: "hotel_room_101",
        name: "Przytulny Pokój Standard",
        description: "Idealny dla pary, z wygodnym łóżkiem i widokiem na ogród.",
        pricePerNight: 180,
        currency: "PLN",
        location: "Górki Małe",
        type: "pokój hotelowy",
        imageUrl: "https://placehold.co/350x250/E1E1E1/4A4A4A?text=Pokój+Standard"
    },
    {
        id: "conference_hall_A",
        name: "Sala Konferencyjna 'Biznes'",
        description: "Nowoczesna sala na 30 osób, wyposażona w projektor i flipchart.",
        pricePerHour: 120,
        currency: "PLN",
        location: "Centrum Miasta",
        type: "sala konferencyjna",
        imageUrl: "https://placehold.co/350x250/D1D1D1/5B5B5B?text=Sala+Biznes"
    },
    {
        id: "apartment_sea_view_01",
        name: "Apartament z Widokiem na Morze",
        description: "Luksusowy apartament z dwoma sypialniami i dużym tarasem.",
        pricePerNight: 550,
        currency: "PLN",
        location: "Sopot",
        type: "apartament",
        imageUrl: "https://placehold.co/350x250/C1C1C1/6C6C6C?text=Apartament+Morze"
    },
    {
        id: "event_ticket_concert_X",
        name: "Bilet na Koncert Zespołu X",
        description: "Niezapomniane wrażenia muzyczne z popularnym zespołem.",
        pricePerUnit: 99,
        currency: "PLN",
        location: "Hala Widowiskowa",
        type: "bilet na wydarzenie",
        eventDate: "2025-09-15T20:00:00Z",
        imageUrl: "https://placehold.co/350x250/B1B1B1/7D7D7D?text=Koncert+X"
    },
    {
        id: "apartment_city_center_penthouse",
        name: "Penthouse w Sercu Miasta",
        description: "Ekskluzywny penthouse z panoramicznym widokiem i prywatnym jacuzzi.",
        pricePerNight: 1200,
        currency: "PLN",
        location: "Warszawa",
        type: "apartament",
        imageUrl: "https://placehold.co/350x250/A1A1A1/8E8E8E?text=Penthouse+Centrum"
    },
    {
        id: "apartment_mountain_lodge",
        name: "Górski Domek Apartamentowy",
        description: "Przytulny apartament w górach, idealny na zimowy wypoczynek.",
        pricePerNight: 350,
        currency: "PLN",
        location: "Zakopane",
        type: "apartament",
        imageUrl: "https://placehold.co/350x250/919191/9F9F9F?text=Górski+Apartament"
    }
];

app.get("/items", (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /items");
    const apartments = allSampleItems.filter(item => item.type === "apartament");
    res.status(200).json(apartments);
});


app.post("/bookings", async (req, res) => {
    console.log("CORE-SERVICE: Obsługa POST /bookings");
    const { itemId, startDate, endDate, numberOfGuests /*, userId - z tokenu JWT */ } = req.body;

    
    if (!itemId || !startDate || !endDate) {
        return res.status(400).json({ message: "Brak wymaganych pól: itemId, startDate, endDate." });
    }

  
    const bookingData = {
        bookingId: `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Bardziej unikalne ID
        itemId,
        startDate,
        endDate,
        numberOfGuests: parseInt(numberOfGuests) || 1,
        status: "PENDING_CONFIRMATION",
        createdAt: new Date().toISOString(),
    };

    if (rabbitChannel) {
        try {
            rabbitChannel.sendToQueue(
                "booking_events",
                Buffer.from(JSON.stringify({ eventType: "NEW_BOOKING_REQUEST", ...bookingData }))
            );
            console.log("Core Service: Wysłano zdarzenie rezerwacji do RabbitMQ:", bookingData.bookingId);
            res.status(201).json({ message: "Żądanie rezerwacji przyjęte i zdarzenie wysłane.", booking: bookingData });
        } catch (error) {
            console.error("Core Service: Błąd wysyłania do RabbitMQ:", error.message);
            res.status(500).json({ message: "Żądanie rezerwacji przyjęte, ale wystąpił błąd podczas wysyłania zdarzenia." });
        }
    } else {
        console.error("Core Service: Błąd - Połączenie z RabbitMQ niedostępne przy próbie wysłania zdarzenia rezerwacji.");
        res.status(500).json({ message: "Żądanie rezerwacji przyjęte, ale połączenie z RabbitMQ jest niedostępne do wysłania zdarzenia." });
    }
});



app.get("/api/core/status", async (req, res) => {
    console.log("CORE-SERVICE: Obsługa GET /api/core/status");
    let rabbitmqStatus = "Offline";
    let dbStatus = "Offline";
    let redisStatus = "Offline";

    if (rabbitChannel) { 
        rabbitmqStatus = "Online";
    }

    try {
        await pgClient.query("SELECT 1");
        dbStatus = "Online";
    } catch (e) {
        console.error("Core Service: Błąd statusu DB:", e.message);
    }

    try {
        if (redisClient.isReady) {
            await redisClient.ping();
            redisStatus = "Online";
        } else {
            redisStatus = "Not Ready";
        }
    } catch (e) {
        console.error("Core Service: Błąd statusu Redis:", e.message);
    }

    res.json({
        message: "Booking Core Service działa!",
        dependencies: {
            rabbitmq: rabbitmqStatus,
            database: dbStatus,
            redis: redisStatus,
        }
    });
});


app.use((err, req, res, next) => {
    console.error("CORE-SERVICE - Nieobsłużony błąd:", err.stack);
    res.status(500).json({ message: "Wewnętrzny błąd serwera w Core Service" });
});


app.listen(PORT, () => {
    console.log(`Booking Core Service nasłuchuje na porcie ${PORT}`);
});


async function gracefulShutdown() {
    console.log("Core Service: Rozpoczęcie zamykania...");
    if (rabbitChannel) {
        try {
            
            const connection = rabbitChannel.connection;
            await rabbitChannel.close();
            console.log("Core Service: Kanał RabbitMQ zamknięty.");
            if (connection) {
                await connection.close();
                console.log("Core Service: Połączenie RabbitMQ zamknięte.");
            }
        } catch (err) {
            console.error("Core Service: Błąd podczas zamykania RabbitMQ", err.message);
        }
    }
    if (pgClient) {
        try {
            await pgClient.end();
            console.log("Core Service: Połączenie PostgreSQL zamknięte.");
        } catch (err) {
            console.error("Core Service: Błąd podczas zamykania PostgreSQL", err.message);
        }
    }
    if (redisClient && redisClient.isReady) { 
        try {
            await redisClient.quit();
            console.log("Core Service: Połączenie Redis zamknięte.");
        } catch (err) {
            console.error("Core Service: Błąd podczas zamykania Redis", err.message);
        }
    }
    console.log("Core Service: Zamykanie zakończone.");
    process.exit(0); 
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
