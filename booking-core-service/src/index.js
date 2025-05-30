const express = require("express");
const amqp = require("amqplib");
const { Client } = require("pg");
const redis = require("redis");
require('dotenv').config();


const app = express();
const port = process.env.PORT || 3001;
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq";
const RABBITMQ_USER = process.env.RABBITMQ_USER; 
const RABBITMQ_PASS = process.env.RABBITMQ_PASS; 
const DB_HOST = process.env.DB_HOST || "postgresql";
const DB_USER = process.env.DB_USER || "user";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || "booking_db";
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD; 

let channel;

// Połączenie z PostgreSQL
const pgClient = new Client({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

pgClient
  .connect()
  .then(() => console.log("Core Service: Połączono z PostgreSQL"))
  .catch((err) =>
    console.error("Core Service: Błąd połączenia z PostgreSQL", err)
  );

// Połączenie z Redis
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
  .catch((err) => console.error("Core Service: Błąd połączenia z Redis", err));

// Połączenie z RabbitMQ
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(
      `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}`
    ); 
    channel = await connection.createChannel();
    await channel.assertQueue("booking_events", { durable: false });
    console.log("Core Service: Połączono z RabbitMQ");
  } catch (error) {
    console.error("Core Service: Błąd połączenia z RabbitMQ", error.message);
    setTimeout(connectRabbitMQ, 5000); 
  }
}
connectRabbitMQ();

app.get("/api/core/status", async (req, res) => {
  let rabbitmqStatus = "Offline";
  let dbStatus = "Offline";
  let redisStatus = "Offline";

  if (channel) {
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
    rabbitmq_status: rabbitmqStatus,
    database_status: dbStatus,
    redis_status: redisStatus,
  });
});

app.post("/book", async (req, res) => {
  if (channel) {
    const bookingData = {
      bookingId: Date.now(),
      item: "Hotel Room",
      user: "test@example.com",
    };
    channel.sendToQueue(
      "booking_events",
      Buffer.from(JSON.stringify(bookingData))
    );
    res
      .status(200)
      .json({ message: "Zdarzenie rezerwacji wysłane!", data: bookingData });
  } else {
    res
      .status(500)
      .json({ message: "Błąd: Połączenie z RabbitMQ niedostępne." });
  }
});

app.listen(port, () => {
  console.log(`Booking Core Service nasłuchuje na porcie ${port}`);
});

process.on("SIGINT", () => {
  if (channel) channel.close();
  pgClient.end();
  redisClient.quit();
  process.exit();
});
