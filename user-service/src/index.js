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
    console.error("USER-SERVICE: KRYTYCZNY BŁĄD - Zmienna środowiskowa JWT_SECRET nie jest ustawiona!");
    process.exit(1);
} else {
    console.log(`USER-SERVICE: JWT_SECRET załadowany. JWT_EXPIRES_IN: ${JWT_EXPIRES_IN}`);
}

const DB_HOST = process.env.DB_HOST || "postgresql";
const DB_PORT = parseInt(process.env.DB_PORT || "5432");
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error("USER-SERVICE: KRYTYCZNY BŁĄD - Brak wszystkich zmiennych środowiskowych dla bazy danych (DB_USER, DB_PASSWORD, DB_NAME).");
    process.exit(1);
}

let pgClientInstance = null;
let appServerInstance = null;

app.use(express.json());
app.use((req, res, next) => {
    console.log(`USER-SERVICE: Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

async function connectWithRetry(maxRetries = 10, delayMs = 5000) {
    let retries = 0;
    console.log(`USER-SERVICE: Inicjalizacja połączenia z PostgreSQL: Host=${DB_HOST}, Port=${DB_PORT}, User=${DB_USER}, DBName=${DB_NAME}`);

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
            console.log("User Service: Połączono z PostgreSQL.");
            pgClientInstance = client;
            pgClientInstance.on('error', async (err) => {
                console.error('User Service: Utracono połączenie PostgreSQL lub inny błąd klienta:', err.stack);
                if (pgClientInstance && typeof pgClientInstance.end === 'function') {
                    await pgClientInstance.end().catch(e => console.warn("User Service: Błąd podczas zamykania błędnego klienta PG w handlerze błędu", e.message));
                }
                pgClientInstance = null;
            });
            return;
        } catch (err) {
            retries++;
            console.error(`User Service: Błąd połączenia z PostgreSQL (próba ${retries}/${maxRetries}): ${err.message}`);
            if (client && typeof client.end === 'function') {
                 await client.end().catch(endErr => console.warn("User Service: Błąd podczas zamykania nieudanego połączenia PG:", endErr.message));
            }
            if (retries >= maxRetries) {
                console.error("User Service: KRYTYCZNY BŁĄD - Nie udało się połączyć z PostgreSQL po maksymalnej liczbie prób.");
                throw err;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

async function getDbClient() {
    if (!pgClientInstance || pgClientInstance._ending) {
        console.log("USER-SERVICE: Klient PG nieaktywny lub zamykany, próba ponownego połączenia...");
        await connectWithRetry();
        if (!pgClientInstance) {
            console.error("USER-SERVICE: Nie udało się uzyskać aktywnego połączenia z bazą danych po ponownej próbie.");
            throw new Error("Nie udało się uzyskać aktywnego połączenia z bazą danych.");
        }
    }
    try {
        await pgClientInstance.query('SELECT 1');
    } catch (pingError) {
        console.error("USER-SERVICE: Klient PG zgłasza błąd przy teście 'SELECT 1', próba ponownego połączenia.", pingError.message);
        if (pgClientInstance && typeof pgClientInstance.end === 'function') {
            await pgClientInstance.end().catch(e => console.warn("User Service: Błąd podczas zamykania błędnego klienta PG przy getDbClient", e.message));
        }
        pgClientInstance = null;
        await connectWithRetry();
        if (!pgClientInstance) {
            console.error("USER-SERVICE: Nie udało się uzyskać aktywnego połączenia z bazą danych po teście 'SELECT 1'.");
            throw new Error("Nie udało się uzyskać aktywnego połączenia z bazą danych po teście 'SELECT 1'.");
        }
    }
    return pgClientInstance;
}


app.get("/api/status", async (req, res) => {
  let dbStatus = "Not Connected or Connection Error";
  try {
    const client = await getDbClient();
    await client.query('SELECT 1');
    dbStatus = "Connected";
    if (!res.headersSent) {
        res.status(200).json({ status: "User Service is running", db_status: dbStatus });
    }
  } catch (dbError) {
    console.error('USER-SERVICE: DB Error in /api/status:', dbError.message, dbError.stack);
    dbStatus = `Error: ${dbError.message}`;
    if (!res.headersSent) {
        res.status(503).json({ status: "User Service is running", db_status: dbStatus, error: dbError.message });
    }
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
    const client = await getDbClient();
    const userExists = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      console.log(`USER-SERVICE: Registration failed - email ${email} already exists.`);
      return res.status(409).json({ message: "User with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUserResult = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hashedPassword]
    );
    const newUser = newUserResult.rows[0];
    console.log('USER-SERVICE: New user registered (via local endpoint):', { id: newUser.id, email: newUser.email });
    
    const { password_hash, ...userToReturn } = newUser;
    if (!res.headersSent) {
        res.status(201).json({
          message: "User registered successfully (via local endpoint).",
          user: userToReturn,
        });
    }
  } catch (error) {
    console.error("USER-SERVICE: Error during local user registration for email " + email + ":", error.stack);
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error during registration." });
    }
  }
});

app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;
  console.log('USER-SERVICE: /users/login attempt for email (local endpoint):', email);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const client = await getDbClient();
    const result = await client.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      console.log(`USER-SERVICE: Local login failed - user not found for email: ${email}`);
      return res.status(401).json({ message: "Nieprawidłowe dane logowania." });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      console.log(`USER-SERVICE: Local login failed - incorrect password for email: ${email}`);
      return res.status(401).json({ message: "Nieprawidłowe dane logowania." });
    }

    const tokenPayload = {
      userId: user.id, 
      email: user.email,
    };

    if (!JWT_SECRET) {
        console.error("USER-SERVICE: KRYTYCZNY BŁĄD w /users/login - JWT_SECRET nie jest dostępny!");
        return res.status(500).json({ message: "Błąd konfiguracji serwera." });
    }
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`USER-SERVICE: User ${email} logged in successfully (via local endpoint).`);

    if (!res.headersSent) {
        res.status(200).json({
          message: "Logged in successfully (via local endpoint).",
          token: token,
          user: {
            id: user.id,
            email: user.email
          }
        });
    }
  } catch (error) {
    console.error("USER-SERVICE: Error during local user login for " + email + ":", error.stack);
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error during login." });
    }
  }
});

const extractUserFromGatewayHeaders = (req, res, next) => {
    const userIdFromHeader = req.headers['x-user-id'];
    const userEmailFromHeader = req.headers['x-user-email'];
    const userRolesFromHeader = (req.headers['x-user-roles'] || '').split(',').filter(role => role.trim() !== '');

    if (!userIdFromHeader) {
        console.warn("USER-SERVICE: /users/me - Brak nagłówka X-User-ID od API Gateway.");
        return res.status(401).json({ message: "Brak informacji o użytkowniku od API Gateway (brak ID)." });
    }
    if (!userEmailFromHeader) {
        console.warn("USER-SERVICE: /users/me - Brak nagłówka X-User-Email od API Gateway.");
        return res.status(401).json({ message: "Brak informacji o użytkowniku od API Gateway (brak emaila)." });
    }

    req.keycloakUser = {
        id: userIdFromHeader,
        email: userEmailFromHeader,
        roles: userRolesFromHeader
    };
    console.log(`USER-SERVICE: /users/me - Użytkownik z nagłówków Keycloak: ID=${req.keycloakUser.id}, Email=${req.keycloakUser.email}`);
    next();
};

app.get("/users/me", extractUserFromGatewayHeaders, async (req, res) => {
  console.log('USER-SERVICE: Handling /users/me with Keycloak user context');

  try {
    const client = await getDbClient();
    const keycloakUserEmail = req.keycloakUser.email;
    
    let userResult = await client.query("SELECT id, email, created_at FROM users WHERE email = $1", [keycloakUserEmail]);
    let localUser;

    if (userResult.rows.length > 0) {
        localUser = userResult.rows[0];
        console.log(`USER-SERVICE: /users/me - Znaleziono istniejącego użytkownika w lokalnej bazie (ID: ${localUser.id}) dla email: ${keycloakUserEmail}`);
    } else {
        console.log(`USER-SERVICE: /users/me - Użytkownik ${keycloakUserEmail} nie istnieje w lokalnej bazie. Tworzenie...`);
        const placeholderPassword = `keycloak_auto_generated_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const hashedPassword = await bcrypt.hash(placeholderPassword, SALT_ROUNDS);

        const newUserQuery = `
            INSERT INTO users (email, password_hash) 
            VALUES ($1, $2) 
            RETURNING id, email, created_at
        `; 
        try {
            const newUserResult = await client.query(newUserQuery, [keycloakUserEmail, hashedPassword]);
            localUser = newUserResult.rows[0];
            console.log('USER-SERVICE: /users/me - Nowy użytkownik stworzony (bez keycloak_id w bazie):', localUser);
        } catch (insertError) {
             console.error(`USER-SERVICE: /users/me - Błąd podczas tworzenia nowego użytkownika ${keycloakUserEmail}:`, insertError.stack);
             if (!res.headersSent) {
                return res.status(500).json({ message: "Błąd podczas tworzenia lokalnego profilu użytkownika." });
             }
             return;
        }
    }

    let responsePayload = {
        id_from_keycloak: req.keycloakUser.id,
        email_from_keycloak: req.keycloakUser.email,
        roles_from_keycloak: req.keycloakUser.roles,
        local_db_info: {
            id: localUser.id, 
            email: localUser.email,
            created_at: localUser.created_at
        }
    };
    if (!res.headersSent) {
        res.status(200).json(responsePayload);
    }

  } catch (error) {
      console.error("USER-SERVICE: Błąd podczas obsługi /users/me:", error.stack);
      if (!res.headersSent) {
          res.status(500).json({ message: "Błąd wewnętrzny serwera przy pobieraniu/synchronizacji danych użytkownika." });
      }
  }
});

app.use((err, req, res, next) => {
  console.error('USER-SERVICE GLOBAL ERROR HANDLER:', err.stack || err.message || err);
  if (res && !res.headersSent) {
    res.status(err.status || 500).json({
      message: err.message || 'Internal Server Error in User Service',
      error: process.env.NODE_ENV === 'development' ? (err.stack || err.message) : "Internal Server Error"
    });
  } else if (res && res.headersSent) {
     console.error('USER-SERVICE GLOBAL ERROR HANDLER: Headers already sent.');
     if (next) next(err);
  } else {
    console.error('USER-SERVICE GLOBAL ERROR HANDLER: Response object is undefined.');
  }
});

async function startApp() {
    try {
        await connectWithRetry();
        appServerInstance = app.listen(PORT, () => {
            console.log(`User Service nasłuchuje na porcie ${PORT} po pomyślnym połączeniu z DB.`);
        });
    } catch (error) {
        console.error("User Service: Nie można uruchomić serwisu z powodu błędu inicjalizacji zależności.", error.message, error.stack);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    console.log('User Service: Rozpoczęcie zamykania...');
    if (appServerInstance) {
        await new Promise((resolve, reject) => {
            appServerInstance.close((err) => {
                if (err) {
                    console.error("User Service: Błąd przy zamykaniu serwera HTTP:", err);
                    return reject(err);
                }
                console.log('User Service: Serwer HTTP zamknięty.');
                resolve();
            });
        }).catch(e => console.error("User Service: Wyjątek podczas zamykania serwera HTTP", e.message));
    }
    if (pgClientInstance) {
        try {
            await pgClientInstance.end();
            console.log('User Service: Połączenie PostgreSQL zamknięte.');
        } catch (e) {
            console.error('User Service: Błąd podczas zamykania połączenia PostgreSQL:', e.message);
        }
        pgClientInstance = null;
    }
    console.log('User Service: Zamykanie zakończone.');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

startApp();