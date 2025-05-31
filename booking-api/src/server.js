const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = process.env.PORT || 3000;

console.log('BOOKING-API: Initializing...');

app.use((req, res, next) => {
    console.log(`BOOKING-API: Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization']
}));
console.log('BOOKING-API: CORS middleware configured.');

const coreServiceUrl = process.env.CORE_SERVICE_URL || 'http://booking-core-service:3001';
const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:3003';
console.log('BOOKING-API: Core Service URL:', coreServiceUrl);
console.log('BOOKING-API: User Service URL:', userServiceUrl);

app.get('/api/status', (req, res) => {
    res.json({ message: 'Booking API status OK' });
});

app.get('/api/core/status', async (req, res) => {
    try {
        const response = await fetch(`${coreServiceUrl}/api/core/status`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`BOOKING-API: Error fetching core status - HTTP ${response.status} - ${errorText}`);
            return res.status(response.status).json({ message: `Core Service returned HTTP error: ${response.status}`, details: errorText });
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('BOOKING-API: Error proxying to Core Service status:', error.message);
        res.status(502).json({ message: 'Error fetching Core Service status via proxy.' });
    }
});

const userProxyOptions = {
    target: userServiceUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/api/users': '/users',
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`BOOKING-API (HPM-User) onProxyReq: Proxying '${req.method} ${req.originalUrl}' to '${userServiceUrl}${proxyReq.path}'`);
        if (req.headers.authorization) {
            proxyReq.setHeader('Authorization', req.headers.authorization);
        }
    
        if (req.method === 'GET' || req.method === 'DELETE') {
            proxyReq.removeHeader('Content-Length');
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`BOOKING-API (HPM-User) onProxyRes: Received response: ${proxyRes.statusCode} for '${req.method} ${req.originalUrl}'`);
    },
    onError: (err, req, res, target) => {
        console.error(`BOOKING-API (HPM-User) onError: Proxy error for ${target ? target.href : 'user-service target'}:`, err.message, 'Code:', err.code);
        if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({ message: `Proxy error to user service: ${err.message}` });
        } else if (res && res.headersSent) {
            console.error('BOOKING-API (HPM-User) onError: Headers already sent. Terminating client socket.');
            if (req.socket && req.socket.writable && !req.socket.destroyed) req.socket.end();
        } else {
            console.error('BOOKING-API (HPM-User) onError: Response object unusable. Terminating client socket if possible.');
            if (req.socket && req.socket.writable && !req.socket.destroyed) req.socket.end();
        }
    },
    logLevel: 'warn',
};
const usersApiProxy = createProxyMiddleware(userProxyOptions);
app.use('/api/users', usersApiProxy);

const coreProxyOptions = {
    target: coreServiceUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/api/core': '',
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`BOOKING-API (HPM-Core) onProxyReq: Proxying '${req.method} ${req.originalUrl}' to '${coreServiceUrl}${proxyReq.path}'`);
        if (req.headers.authorization) {
            proxyReq.setHeader('Authorization', req.headers.authorization);
            console.log('BOOKING-API (HPM-Core) onProxyReq: Forwarding Authorization header.');
        }
        if (req.method === 'GET' || req.method === 'DELETE') {
            proxyReq.removeHeader('Content-Length');
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`BOOKING-API (HPM-Core) onProxyRes: Received response: ${proxyRes.statusCode} for '${req.method} ${req.originalUrl}'`);
    },
    onError: (err, req, res, target) => {
        console.error(`BOOKING-API (HPM-Core) onError: Proxy error for ${target ? target.href : 'core-service target'}:`, err.message, 'Code:', err.code);
        if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({ message: `Proxy error to core service: ${err.message}` });
        } else if (res && res.headersSent) {
            console.error('BOOKING-API (HPM-Core) onError: Headers already sent. Terminating client socket.');
            if (req.socket && req.socket.writable && !req.socket.destroyed) req.socket.end();
        } else {
            console.error('BOOKING-API (HPM-Core) onError: Response object unusable. Terminating client socket if possible.');
            if (req.socket && req.socket.writable && !req.socket.destroyed) req.socket.end();
        }
    },
    logLevel: 'warn',
};
const coreApiProxy = createProxyMiddleware(coreProxyOptions);
app.use('/api/core', coreApiProxy);

app.use(express.json());

app.use((err, req, res, next) => {
    console.error('BOOKING-API Global Error Handler:', err.stack || err.message || err);
    if (res && !res.headersSent) {
        res.status(err.status || 500).json({
            message: err.message || 'Internal Server Error in Booking API',
            error: process.env.NODE_ENV === 'development' ? (err.stack || err.message) : {}
        });
    } else if (res && res.headersSent) {
        console.error('BOOKING-API Global Error Handler: Headers already sent.');
        next(err);
    } else {
        console.error('BOOKING-API Global Error Handler: Response object is not available.');
    }
});

app.listen(port, () => {
    console.log(`Booking API listening on port ${port}`);
});
