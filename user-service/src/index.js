const express = require("express");
const { Client } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'domyslnySuperTajnySekret123!@#'; 
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; 

console.log(`USER-SERVICE: DB_HOST is configured as: ${process.env.DB_HOST}`);
const pgClient = new Client({
  host: process.env.DB_HOST,
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
  });


app.use(express.json());

app.use((req, res, next) => {
    console.log(`USER-SERVICE: Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

app.get("/api/status", async (req, res) => {
  console.log('USER-SERVICE: Handling /api/status');
  try {
    await pgClient.query('SELECT 1');
    res.status(200).json({ status: "User Service is running", db_status: "Connected" });
  } catch (dbError) {
    console.error('USER-SERVICE: DB Error in /api/status:', dbError.message);
    res.status(500).json({ status: "User Service is running", db_status: "Error", error: dbError.message });
  }
});

app.post("/users/register", async (req, res) => {
  console.log('USER-SERVICE: Received request for /users/register');
  console.log('USER-SERVICE: Request headers:', JSON.stringify(req.headers, null, 2));
  
  const { email, password } = req.body; 
  console.log('USER-SERVICE: Body received (parsed by express.json):', { email: email, password: password ? '******' : undefined });

  if (!email || !password) {
    console.log('USER-SERVICE: Validation failed - email or password missing');
    return res.status(400).json({ message: "Email and password are required." });
  }
  if (password.length < 6) {
    console.log('USER-SERVICE: Validation failed - password too short');
    return res.status(400).json({ message: "Password must be at least 6 characters long." });
  }

  try {
    console.log('USER-SERVICE: Attempting to check if user exists...');
    const userExists = await pgClient.query("SELECT * FROM users WHERE email = $1", [email]);
    console.log('USER-SERVICE: User exists check completed. Rows:', userExists.rows.length);

    if (userExists.rows.length > 0) {
      console.log('USER-SERVICE: User already exists.');
      return res.status(409).json({ message: "User with this email already exists." });
    }

    console.log('USER-SERVICE: Hashing password...');
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    console.log('USER-SERVICE: Password hashed.');

    console.log('USER-SERVICE: Inserting new user...');
    const newUser = await pgClient.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hashedPassword]
    );
    console.log('USER-SERVICE: New user inserted:', newUser.rows[0]);

    res.status(201).json({
      message: "User registered successfully.",
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error("USER-SERVICE: Error during user registration:", error.stack);
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error during registration." });
    }
  }
});


app.post("/users/login", async (req, res) => {
  console.log('USER-SERVICE: Handling /users/login');
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const result = await pgClient.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      console.log(`USER-SERVICE: Login attempt failed - user not found for email: ${email}`);
      return res.status(401).json({ message: "Invalid credentials." }); 
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      console.log(`USER-SERVICE: Login attempt failed - incorrect password for email: ${email}`);
      return res.status(401).json({ message: "Invalid credentials." });
    }

    
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      
    };

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
    console.error("USER-SERVICE: Error during user login:", error.stack);
    res.status(500).json({ message: "Internal server error during login." });
  }
});


app.get("/users/me", (req, res) => { 
  console.log('USER-SERVICE: Handling /users/me (Not Implemented, placeholder)');
  
  res.status(501).json({ message: "Not Implemented: Get Current User (token verification placeholder)" });
});


app.use((err, req, res, next) => {
  console.error('USER-SERVICE GLOBAL ERROR HANDLER:', err.stack || err.message || err);
  if (res && !res.headersSent) {
    res.status(err.status || 500).json({
      message: err.message || 'Internal Server Error in User Service',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  } else if (res) {
     console.error('USER-SERVICE GLOBAL ERROR HANDLER: Headers already sent, cannot send error response.');
     next(err);
  } else {
    console.error('USER-SERVICE GLOBAL ERROR HANDLER: Response object is undefined.');
  }
});

app.listen(PORT, () => {
  console.log(`User Service listening on port ${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('User Service is shutting down...');
  if (pgClient) {
    try {
      await pgClient.end();
      console.log('PostgreSQL connection closed.');
    } catch (e) {
      console.error('Error closing PostgreSQL connection:', e);
    }
  }
  process.exit(0);
});