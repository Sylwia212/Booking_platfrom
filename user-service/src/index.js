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

console.log(`USER-SERVICE: DB_HOST is configured as: ${process.env.DB_HOST || "postgresql"}`);
const pgClient = new Client({
  host: process.env.DB_HOST || "postgresql",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pgClient
  .connect()
  .then(() => console.log("User Service: Połączono z PostgreSQL"))
  .catch((err) => {
    console.error("User Service: KRYTYCZNY BŁĄD połączenia z PostgreSQL przy starcie:", err.stack);
    process.exit(1);
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
    console.error('USER-SERVICE: DB Error in /api/status:', dbError.message);
    res.status(500).json({ status: "User Service is running", db_status: "Error", error: dbError.message });
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
    res.status(201).json({
      message: "User registered successfully.",
      user: { id: newUser.id, email: newUser.email, created_at: newUser.created_at },
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
  console.log('USER-SERVICE: Handling /users/me (Not Implemented)');
  res.status(501).json({ message: "Not Implemented: Get Current User" });
});

app.use((err, req, res, next) => {
  console.error('USER-SERVICE GLOBAL ERROR HANDLER:', err.stack || err.message || err);
  if (res && !res.headersSent) {
    res.status(err.status || 500).json({
      message: err.message || 'Internal Server Error in User Service',
      error: process.env.NODE_ENV === 'development' ? (err.stack || err.message) : {}
    });
  } else if (res && res.headersSent) {
     console.error('USER-SERVICE GLOBAL ERROR HANDLER: Headers already sent.');
     next(err);
  } else {
    console.error('USER-SERVICE GLOBAL ERROR HANDLER: Response object is undefined.');
  }
});

app.listen(PORT, () => {
  console.log(`User Service listening on port ${PORT}`);
});

async function gracefulShutdown() {
    console.log('User Service: Shutting down...');
    if (pgClient) {
        try {
            await pgClient.end();
            console.log('User Service: PostgreSQL connection closed.');
        } catch (e) {
            console.error('User Service: Error closing PostgreSQL connection:', e.message);
        }
    }
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
