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
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
console.log('BOOKING-API: CORS middleware configured.');


const coreServiceUrl = process.env.CORE_SERVICE_URL || 'http://booking-core-service:3001';
const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:3003';
console.log('BOOKING-API: Core Service URL:', coreServiceUrl);
console.log('BOOKING-API: User Service URL:', userServiceUrl);


app.get('/api/status', (req, res) => {
    console.log('BOOKING-API: Handling /api/status');
    res.json({ message: 'Booking API status OK' });
});

app.get('/api/core/status', async (req, res) => {
    console.log('BOOKING-API: Handling /api/core/status');
    try {
        const response = await fetch(`${coreServiceUrl}/api/core/status`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`BOOKING-API: Error fetching core status - HTTP ${response.status} - ${errorText}`);
            throw new Error(`Core Service returned HTTP error: ${response.status}`);
        }
        const data = await response.json();
        console.log('BOOKING-API: Core status data received.');
        res.json({ message: `Status Core Service: ${data.message}` });
    } catch (error) {
        console.error('BOOKING-API: Error connecting to Core Service:', error.message);
        res.status(500).json({ message: 'Error fetching Core Service status. Check API Gateway logs.' });
    }
});


console.log('BOOKING-API: Defining proxy for /api/users...');

const userProxyOptions = {
    target: userServiceUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/api/users': '/users',
    },
    onProxyReq: (proxyReq, req, res) => { 
        console.log(`BOOKING-API (HPM) onProxyReq: Proxying '${req.method} ${req.originalUrl}' to '${userServiceUrl}${proxyReq.path}'`);
        if (req.body) {
            console.warn('BOOKING-API (HPM) onProxyReq: req.body IS POPULATED before proxying. HPM will attempt to re-serialize.');
            console.log('BOOKING-API (HPM) onProxyReq: Populated req.body:', JSON.stringify(req.body));
        } else {
            console.log('BOOKING-API (HPM) onProxyReq: req.body is UNDEFINED. HPM should stream the original request.');
        }
        console.log('BOOKING-API (HPM) onProxyReq: Headers sent to user-service:', JSON.stringify(proxyReq.getHeaders(), null, 2));
    },
    onProxyRes: (proxyRes, req, res) => { 
        let targetPath = req.originalUrl.replace(/^\/api\/users/, '/users');
        console.log(`BOOKING-API (HPM) onProxyRes: Received response: ${proxyRes.statusCode} for original request ${req.method} ${req.originalUrl} (proxied to ~${userServiceUrl}${targetPath})`);
    },
    onError: (err, req, res, target) => {
        console.error(`BOOKING-API (HPM) onError: Proxy error for ${target ? target.href : 'unknown target'}:`, err.message, 'Code:', err.code);
        if (res && typeof res.status === 'function' && typeof res.send === 'function' && !res.headersSent) {
            res.status(502).send(`Proxy error: ${err.message}`);
        } else if (res && res.headersSent) {
            console.error('BOOKING-API (HPM) onError: Headers already sent. Cannot send error response.');
            if (req.socket && req.socket.writable && !req.socket.destroyed) {
                req.socket.end();
            }
        } else {
            console.error('BOOKING-API (HPM) onError: Response object is unusable or undefined. Terminating client socket.');
            if (req.socket && req.socket.writable && !req.socket.destroyed) {
                req.socket.end();
            }
        }
    },
    logLevel: 'debug',
    proxyTimeout: 15000,
    timeout: 15000,
};

const usersApiProxy = createProxyMiddleware(userProxyOptions);
app.use('/api/users', usersApiProxy);

app.use(express.json());
console.log('BOOKING-API: Global express.json middleware configured (does not affect already proxied /api/users).');

app.use((req, res, next) => {
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('BOOKING-API: Request body after global express.json (for non-proxied or fallback routes):', JSON.stringify(req.body));
    }
    next();
});

app.use((err, req, res, next) => {
    console.error('BOOKING-API Global Error Handler:', err.stack || err.message || err);
    if (res && !res.headersSent) {
        res.status(err.status || 500).json({
            message: err.message || 'Internal Server Error in Booking API',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    } else {
        next(err);
    }
});

app.listen(port, () => {
    console.log(`Booking API listening on port ${port}`);
});