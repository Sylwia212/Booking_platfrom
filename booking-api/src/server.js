const express = require('express');
const fetch = require('node-fetch');
const { Client } = require('pg');
const redis = require('redis');

const app = express();
const port = process.env.PORT || 3000;
const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://booking-core-service:3001';
const DB_HOST = process.env.DB_HOST || 'postgresql';
const DB_USER = process.env.DB_USER || 'user';
const DB_PASSWORD = process.env.DB_PASSWORD; // Odczytaj hasło z zmiennej środowiskowej
const DB_NAME = process.env.DB_NAME || 'booking_db';
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD; // Odczytaj hasło z zmiennej środowiskowej

// Połączenie z PostgreSQL
const pgClient = new Client({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
});

pgClient.connect()
    .then(() => console.log('Połączono z PostgreSQL'))
    .catch(err => console.error('Błąd połączenia z PostgreSQL', err));

// Połączenie z Redis
const redisClient = redis.createClient({
    url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
    password: REDIS_PASSWORD // Użyj hasła dla Redis
});

redisClient.on('error', (err) => console.error('Błąd Redis Client', err));
redisClient.connect()
    .then(() => console.log('Połączono z Redis'))
    .catch(err => console.error('Błąd połączenia z Redis', err));


app.get('/api/status', async (req, res) => {
    let dbStatus = 'Offline';
    let redisStatus = 'Offline';
    try {
        await pgClient.query('SELECT 1');
        dbStatus = 'Online';
    } catch (e) {
        console.error('Błąd statusu DB:', e.message);
    }

    try {
        // Upewnij się, że klient Redis jest podłączony przed pingowaniem
        if (redisClient.isReady) {
            await redisClient.ping();
            redisStatus = 'Online';
        } else {
            redisStatus = 'Not Ready';
        }
    } catch (e) {
        console.error('Błąd statusu Redis:', e.message);
    }

    res.json({
        message: 'Booking API działa!',
        database_status: dbStatus,
        redis_status: redisStatus
    });
});

app.get('/api/core/status', async (req, res) => {
    try {
        const response = await fetch(`${CORE_SERVICE_URL}/status`);
        const data = await response.json();
        res.json({
            message: `Status Core Service: ${data.message}`
        });
    } catch (error) {
        console.error('Błąd komunikacji z Core Service:', error);
        res.status(500).json({ message: 'Błąd komunikacji z Booking Core Service' });
    }
});

app.listen(port, () => {
    console.log(`Booking API nasłuchuje na porcie ${port}`);
});

process.on('SIGINT', () => {
    pgClient.end();
    redisClient.quit();
    process.exit();
});