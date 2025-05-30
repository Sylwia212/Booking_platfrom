const express = require('express');
const cors = require('cors'); 
const app = express();
const port = process.env.PORT || 3000;

// Konfiguracja CORS

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'], 
    allowedHeaders: ['Content-Type', 'Authorization'] 
}));

app.use(express.json());

// Przykładowa trasa statusu dla API Gateway
app.get('/api/status', (req, res) => {
    res.json({ message: 'Booking API działa i odbiera dane!' });
});

app.get('/api/core/status', async (req, res) => {
    try {
        const coreServiceUrl = process.env.CORE_SERVICE_URL || 'http://booking-core-service:3001';
        
        const response = await fetch(`${coreServiceUrl}/api/core/status`);
        if (!response.ok) {
           
            throw new Error(`Core Service zwrócił błąd HTTP: ${response.status}`);
        }
        const data = await response.json();
        res.json({ message: `Status Core Service: ${data.message}` });
    } catch (error) {
        console.error('Błąd podczas próby połączenia z Core Service:', error.message);
        res.status(500).json({ message: 'Błąd pobierania statusu Core Service. Sprawdź logi API Gateway.' });
    }
});

// Nasłuchiwanie serwera
app.listen(port, () => {
    console.log(`Booking API nasłuchuje na porcie ${port}`);
});
