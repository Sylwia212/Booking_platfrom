document.addEventListener('DOMContentLoaded', () => {
    // Przykładowe wywołanie API
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            document.getElementById('api-data').innerText = data.message;
        })
        .catch(error => {
            document.getElementById('api-data').innerText = 'Błąd pobierania danych z API.';
            console.error('Błąd wywołania Booking-API:', error);
        });

    // Przykładowe wywołanie Core Service (przez API Gateway)
    fetch('/api/core/status') // Zakładamy, że API Gateway przekieruje to do Core Service
        .then(response => response.json())
        .then(data => {
            document.getElementById('core-service-status').innerText = data.message;
        })
        .catch(error => {
            document.getElementById('core-service-status').innerText = 'Błąd pobierania statusu Core Service.';
            console.error('Błąd wywołania Core Service przez API:', error);
        });
});