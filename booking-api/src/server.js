const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const morgan = require("morgan");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const fetch = require("node-fetch"); 

const app = express();
const PORT = process.env.PORT || 3000;

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL_INTERNAL || "http://user-service:3003";
const CORE_SERVICE_URL =
  process.env.CORE_SERVICE_URL_INTERNAL || "http://booking-core-service:3001";

const KEYCLOAK_REALM_NAME =
  process.env.KEYCLOAK_REALM_NAME || "booking-app-realm";
const KEYCLOAK_INTERNAL_URL_BASE =
  process.env.KEYCLOAK_INTERNAL_URL_BASE || "http://keycloak:8180";
const KEYCLOAK_PUBLIC_URL_BASE =
  process.env.KEYCLOAK_PUBLIC_URL_BASE || "http://localhost:8180";
const KEYCLOAK_INTERNAL_CERTS_URL = `${KEYCLOAK_INTERNAL_URL_BASE}/realms/${KEYCLOAK_REALM_NAME}/protocol/openid-connect/certs`;
const KEYCLOAK_EXPECTED_ISSUER = `${KEYCLOAK_PUBLIC_URL_BASE}/realms/${KEYCLOAK_REALM_NAME}`;

console.log("BOOKING-API: Initializing...");
console.log("BOOKING-API: Core Service URL:", CORE_SERVICE_URL);
console.log("BOOKING-API: User Service URL:", USER_SERVICE_URL);
console.log(
  "BOOKING-API: Keycloak Internal Certs URL:",
  KEYCLOAK_INTERNAL_CERTS_URL
);
console.log(
  "BOOKING-API: Keycloak Expected Issuer for Tokens:",
  KEYCLOAK_EXPECTED_ISSUER
);

const keycloakJwksClient = jwksClient({
  jwksUri: KEYCLOAK_INTERNAL_CERTS_URL,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  fetcher: async (jwksUri) => {
    console.log(`BOOKING-API: Fetching JWKS from ${jwksUri}`);
    try {
      const response = await fetch(jwksUri);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `BOOKING-API: Failed to fetch JWKS response from ${jwksUri}: ${response.status} ${response.statusText}`,
          errorText
        );
        throw new Error(
          `Failed to fetch JWKS: ${response.status} ${response.statusText} from ${jwksUri}. Response: ${errorText}`
        );
      }
      return response.json();
    } catch (error) {
      console.error(
        `BOOKING-API: Error in JWKS fetcher for ${jwksUri}:`,
        error
      );
      throw error;
    }
  },
});

function getKey(header, callback) {
  console.log("BOOKING-API: getKey called for kid:", header.kid);
  keycloakJwksClient.getSigningKey(header.kid, function (err, key) {
    if (err) {
      console.error(
        "BOOKING-API: Błąd pobierania klucza publicznego z JWKS URI dla kid:",
        header.kid,
        "| Error:",
        err.message,
        err
      );
      return callback(err);
    }
    if (!key) {
      console.error(
        "BOOKING-API: Nie otrzymano obiektu klucza dla kid:",
        header.kid
      );
      return callback(
        new Error("Nie otrzymano obiektu klucza dla podanego KID.")
      );
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    if (!signingKey) {
      console.error(
        "BOOKING-API: Nie znaleziono klucza publicznego w obiekcie klucza dla kid:",
        header.kid
      );
      return callback(
        new Error(
          "Nie znaleziono klucza publicznego w obiekcie klucza dla podanego KID."
        )
      );
    }
    console.log(
      "BOOKING-API: Klucz publiczny pobrany pomyślnie dla kid:",
      header.kid
    );
    callback(null, signingKey);
  });
}

const authenticateKeycloakToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (!token) {
    console.warn("BOOKING-API: Auth Error - Brak tokenu Bearer.");
    return res.status(401).json({ message: "Brak autoryzacji (brak tokenu)." });
  }

  console.log("BOOKING-API: Próba weryfikacji tokenu Keycloak...");
  jwt.verify(
    token,
    getKey,
    { issuer: KEYCLOAK_EXPECTED_ISSUER, algorithms: ["RS256"] },
    (err, decoded) => {
      if (err) {
        const decodedTokenForIssuer = jwt.decode(token, { complete: true });
        const tokenIssuer = decodedTokenForIssuer?.payload?.iss;
        console.error(
          "BOOKING-API: Auth Error - Nieprawidłowy token Keycloak:",
          err.message,
          "| Nazwa błędu:",
          err.name,
          "| Issuer z tokenu:",
          tokenIssuer,
          "| Oczekiwany issuer:",
          KEYCLOAK_EXPECTED_ISSUER
        );
        let errorMessage = "Brak autoryzacji (nieprawidłowy token).";
        if (err.name === "TokenExpiredError")
          errorMessage = "Brak autoryzacji (token wygasł).";
        else if (
          err.name === "JsonWebTokenError" &&
          err.message.includes("issuer")
        )
          errorMessage = `Brak autoryzacji (nieprawidłowy wystawca tokenu: oczekiwano ${KEYCLOAK_EXPECTED_ISSUER}, otrzymano ${
            tokenIssuer || "nieznany"
          }).`;
        else if (
          err.name === "JsonWebTokenError" ||
          err.name === "NotBeforeError"
        )
          errorMessage = `Brak autoryzacji (błąd tokenu: ${err.message}).`;
        return res
          .status(403)
          .json({
            message: errorMessage,
            errorDetail: err.name,
            expectedIssuer: KEYCLOAK_EXPECTED_ISSUER,
            tokenIssuer: tokenIssuer,
          });
      }
      console.log(
        "BOOKING-API: Token Keycloak zweryfikowany pomyślnie dla użytkownika:",
        decoded.preferred_username || decoded.sub
      );
      req.user = decoded;
      next();
    }
  );
};

// --- Middleware globalne ---
app.use(
  cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(morgan("dev"));
app.use(express.json()); 

const commonOnProxyReq = (proxyReq, req, res) => {
  console.log(
    `BOOKING-API: ==> Proxying Request: ${req.method} ${req.originalUrl} to ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`
  );
  if (req.user && req.user.sub) {
    proxyReq.setHeader("X-User-ID", req.user.sub);
    if (req.user.email) proxyReq.setHeader("X-User-Email", req.user.email);
    if (req.user.preferred_username)
      proxyReq.setHeader("X-User-Name", req.user.preferred_username);
    if (req.user.realm_access && req.user.realm_access.roles) {
      proxyReq.setHeader("X-User-Roles", req.user.realm_access.roles.join(","));
    }
    console.log(
      `BOOKING-API: Added X-User-* headers for Keycloak user: ${req.user.sub}`
    );
  }

  if (
    req.body &&
    (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")
  ) {
    const bodyData = JSON.stringify(req.body);
    console.log(
      "BOOKING-API: Request Body (parsed by express.json, will be re-streamed):",
      bodyData
    );
    proxyReq.setHeader("Content-Type", "application/json");
    proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
    proxyReq.end();
  } else {
    console.log(
      "BOOKING-API: No request body parsed by express.json, or not a POST/PUT/PATCH. Proxying as is."
    );
  }
  console.log(
    "BOOKING-API: Final Request Headers Sent to Upstream:",
    JSON.stringify(proxyReq.getHeaders(), null, 2)
  );
};

const publicOnProxyReq = (proxyReq, req, res) => {
  console.log(
    `BOOKING-API (Public): ==> Proxying Request: ${req.method} ${req.originalUrl} to ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`
  );
  console.log(
    "BOOKING-API (Public): Final Request Headers Sent to Upstream:",
    JSON.stringify(proxyReq.getHeaders(), null, 2)
  );
};

const commonOnProxyRes = (proxyRes, req, res) => {
  console.log(
    `BOOKING-API: <== Received Response: ${proxyRes.statusCode} for ${req.method} ${req.originalUrl} from upstream service.`
  );
};

const commonOnError = (serviceName) => (err, req, res, target) => {
  console.error(
    `BOOKING-API: !!! Proxy Error for ${serviceName} (target: ${
      target?.href || "N/A"
    }) !!!`
  );
  console.error(
    `BOOKING-API: Error Code: ${err.code}, Message: ${err.message}`
  );
  console.error(
    "BOOKING-API: Failing Request Details - Method:",
    req.method,
    "URL:",
    req.originalUrl
  );
  console.error(
    "BOOKING-API: Failing Request Headers:",
    JSON.stringify(req.headers, null, 2)
  );
  if (req.body && Object.keys(req.body).length > 0) {
    console.error(
      "BOOKING-API: Failing Request Body:",
      JSON.stringify(req.body, null, 2)
    );
  } else {
    console.log("BOOKING-API: Failing Request had no body or body not parsed.");
  }
  console.error("BOOKING-API: Proxy Error Stack Trace:", err.stack);

  if (res && typeof res.status === "function" && !res.headersSent) {
    res.status(502).json({
      message: `Błąd proxy podczas komunikacji z serwisem ${serviceName}.`,
      error: err.message,
      code: err.code,
      details: `Original request: ${req.method} ${req.originalUrl}`,
    });
  } else if (res && res.headersSent) {
    console.error(
      `BOOKING-API: Headers already sent for ${serviceName} error. Cannot send error response to client.`
    );
    if (req.socket && req.socket.writable && !req.socket.destroyed)
      req.socket.end();
  } else {
    console.error(
      `BOOKING-API: Response object not available for proxy error to ${serviceName}. Closing request socket if possible.`
    );
    if (req.socket && req.socket.writable && !req.socket.destroyed)
      req.socket.end();
  }
};

// --- Definicje tras/proxy ---

app.get("/api/status", (req, res) => {
  console.log("BOOKING-API: /api/status endpoint hit!");
  res.status(200).json({ message: "Booking API Gateway działa!" });
});

app.use(
  "/api/core/items",
  createProxyMiddleware({
    target: CORE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/core": "" },
    onProxyReq: publicOnProxyReq,
    onProxyRes: commonOnProxyRes,
    onError: commonOnError("core-service (public /items)"),
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
  })
);

app.use(
  "/api/users/me",
  authenticateKeycloakToken,
  createProxyMiddleware({
    target: USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/users": "/users" },
    onProxyReq: commonOnProxyReq,
    onProxyRes: commonOnProxyRes,
    onError: commonOnError("user-service"),
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
  })
);

app.use(
  "/api/core",
  authenticateKeycloakToken,
  createProxyMiddleware({
    target: CORE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/core": "" },
    onProxyReq: commonOnProxyReq,
    onProxyRes: commonOnProxyRes,
    onError: commonOnError("core-service (protected core routes)"),
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
  })
);

// --- Globalny Error Handler dla Express ---
app.use((err, req, res, next) => {
  console.error(
    "BOOKING-API Global Error Handler:",
    err.stack || err.message || err
  );
  if (res && !res.headersSent) {
    res.status(err.status || 500).json({
      message: err.message || "Internal Server Error in Booking API Gateway",
      error:
        process.env.NODE_ENV === "development"
          ? err.stack || err.message || err
          : {},
    });
  } else if (res && res.headersSent) {
    console.error("BOOKING-API Global Error Handler: Headers already sent.");
    if (next) next(err);
  } else {
    console.error(
      "BOOKING-API Global Error Handler: Response object is undefined."
    );
  }
});

app
  .listen(PORT, () => {
    console.log(`Booking API Gateway nasłuchuje na porcie ${PORT}`);
  })
  .on("error", (err) => {
    console.error("BOOKING-API: Failed to start server:", err);
    process.exit(1);
  });
