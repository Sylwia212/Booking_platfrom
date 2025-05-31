const express = require("express");
const { Client } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;
const SALT_ROUNDS = 10;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

if (!JWT_SECRET) {
    console.error("USER-SERVICE: KRYTYCZNY BŁĄD - Zmienna środowiskowa JWT_SECRET nie jest ustawiona! Serwis nie będzie mógł poprawnie generować tokenów.");
    process.exit(1); 
} else {
    console.log(`USER-SERVICE: JWT_SECRET załadowany (długość: ${JWT_SECRET.length}). JWT_EXPIRES_IN: ${JWT_EXPIRES_IN}`);
}

const DB_HOST = process.env.DB_HOST || "postgresql-service";
const DB_PORT = parseInt(process.env.DB_PORT || "5432");
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

console.log(`USER-SERVICE: Konfiguracja DB: Host=${DB_HOST}, Port=${DB_PORT}, User=${DB_USER ? 'OK' : 'BRAK'}, DBName=${DB_NAME ? 'OK' : 'BRAK'}`);
if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error("USER-SERVICE: KRYTYCZNY BŁĄD - Brak wszystkich zmiennych środowiskowych dla bazy danych (DB_USER, DB_PASSWORD, DB_NAME).");
    process.exit(1);
}

const pgClient = new Client({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

app.use(express.json());

app.use((req, res, next) => {
    console.log(`USER-SERVICE: Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

app.get("/api/status", async (req, res) => {
  try {
    await pgClient.query('SELECT 1');
    res.status(200).json({ status: "User Service is running", db_status: "Connected" });
  } catch (dbError) {
    console.warn('USER-SERVICE: DB Error or not connected in /api/status:', dbError.message);
    res.status(503).json({ status: "User Service is running", db_status: "Error or Not Connected", error: dbError.message });
  }
});

app.post("/users/register", async (req, res) => {
  const { email, password } = req.body;
  console.log('USER-SERVICE: /users/register attempt for email:', email);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters long." });
  }

  try {
    const userExists = await pgClient.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      console.log(`USER-SERVICE: Registration failed - email ${email} already exists.`);
      return res.status(409).json({ message: "User with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUserResult = await pgClient.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hashedPassword]
    );
    const newUser = newUserResult.rows[0];
    console.log('USER-SERVICE: New user registered:', { id: newUser.id, email: newUser.email });
    
    const { password_hash, ...userToReturn } = newUser;
    res.status(201).json({
      message: "User registered successfully.",
      user: userToReturn,
    });
  } catch (error) {
    console.error("USER-SERVICE: Error during user registration for email " + email + ":", error.stack);
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error during registration." });
    }
  }
});

app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;
  console.log('USER-SERVICE: /users/login attempt for email:', email);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const result = await pgClient.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      console.log(`USER-SERVICE: Login failed - user not found for email: ${email}`);
      return res.status(401).json({ message: "Nieprawidłowe dane logowania." });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      console.log(`USER-SERVICE: Login failed - incorrect password for email: ${email}`);
      return res.status(401).json({ message: "Nieprawidłowe dane logowania." });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
    };

    if (!JWT_SECRET) {
        console.error("USER-SERVICE: KRYTYCZNY BŁĄD w /users/login - JWT_SECRET nie jest dostępny do podpisania tokenu!");
        return res.status(500).json({ message: "Błąd konfiguracji serwera uniemożliwiający logowanie." });
    }
    console.log(`USER-SERVICE: Generating token for userId: ${user.id} with secret (length: ${JWT_SECRET.length})`);
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`USER-SERVICE: User ${email} logged in successfully.`);

    res.status(200).json({
      message: "Logged in successfully.",
      token: token,
      user: {
        id: user.id,
        email: user.email
      }
    });

  } catch (error) {
    console.error("USER-SERVICE: Error during user login for " + email + ":", error.stack);
    res.status(500).json({ message: "Internal server error during login." });
  }
});

app.get("/users/me", (req, res) => {
  console.log('USER-SERVICE: Handling /users/me');
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Brak tokenu autoryzacyjnego lub niepoprawny format.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    if (!JWT_SECRET) {
        console.error("USER-SERVICE: KRYTYCZNY BŁĄD w /users/me - JWT_SECRET nie jest dostępny do weryfikacji tokenu!");
        return res.status(500).json({ message: "Błąd konfiguracji serwera." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('USER-SERVICE: /users/me - token valid for userId:', decoded.userId);
    res.status(200).json({ id: decoded.userId, email: decoded.email });
  } catch (err) {
    console.error('USER-SERVICE: /users/me - Invalid or expired token:', err.message);
    res.status(401).json({ message: 'Nieprawidłowy lub wygasły token.' });
  }
});

app.use((err, req, res, next) => {
  console.error('USER-SERVICE GLOBAL ERROR HANDLER:', err.stack || err.message || err);
  if (res && !res.headersSent) {
    res.status(err.status || 500).json({
      message: err.message || 'Internal Server Error in User Service',
      error: process.env.NODE_ENV === 'development' ? (err.stack || err.message) : {}
    });
  } else if (res && res.headersSent) {
     console.error('USER-SERVICE GLOBAL ERROR HANDLER: Headers already sent, cannot send error response.');
     next(err);
  } else {
    console.error('USER-SERVICE GLOBAL ERROR HANDLER: Response object is undefined, cannot send error.');
  }
});


async function connectWithRetry(client, maxRetries = 10, delayMs = 5000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            await client.connect();
            console.log("User Service: Połączono z PostgreSQL.");
            return; 
        } catch (err) {
            retries++;
            console.error(`User Service: Błąd połączenia z PostgreSQL (próba ${retries}/${maxRetries}): ${err.message}`);
            if (retries >= maxRetries) {
                console.error("User Service: KRYTYCZNY BŁĄD - Nie udało się połączyć z PostgreSQL po maksymalnej liczbie prób.");
                throw err; 
            }
            console.log(`User Service: Ponowna próba za ${delayMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

async function startApp() {
    try {
        await connectWithRetry(pgClient);
        
        const server = app.listen(PORT, () => { 
            console.log(`User Service nasłuchuje na porcie ${PORT} po pomyślnym połączeniu z DB.`);
        });
        app.set('serverInstance', server);

    } catch (error) {
        console.error("User Service: Nie można uruchomić serwisu z powodu braku połączenia z bazą danych.", error.message);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    console.log('User Service: Rozpoczęcie zamykania...');
    
    const server = app.get('serverInstance');
    if (server) {
        console.log('User Service: Zamykanie serwera HTTP...');
        await new Promise(resolve => server.close(() => {
            console.log('User Service: Serwer HTTP zamknięty.');
            resolve();
        }));
    }

   
    if (pgClient && typeof pgClient.end === 'function') {
        try {
            await pgClient.end();
            console.log('User Service: Połączenie PostgreSQL zamknięte.');
        } catch (e) {
            console.error('User Service: Błąd podczas zamykania połączenia PostgreSQL:', e.message);
        }
    } else {
        console.log('User Service: Połączenie PostgreSQL nie było aktywne lub klient nie istnieje/nie ma metody end.');
    }
    console.log('User Service: Zamykanie zakończone.');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

startApp();