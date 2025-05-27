document.addEventListener('DOMContentLoaded', () => {
    
    fetch('/api/status') 
        .then(response => {
            if (!response.ok) {
                
                console.error(`Błąd HTTP dla /api/status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            document.getElementById('api-data').innerText = data.message;
        })
        .catch(error => {
            document.getElementById('api-data').innerText = 'Błąd pobierania danych z API.';
            console.error('Błąd wywołania Booking-API:', error);
        });

    fetch('/api/core/status') 
        .then(response => {
            if (!response.ok) {
                
                console.error(`Błąd HTTP dla /api/core/status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            document.getElementById('core-service-status').innerText = data.message;
        })
        .catch(error => {
            document.getElementById('core-service-status').innerText = 'Błąd pobierania statusu Core Service.';
            console.error('Błąd wywołania Core Service przez API:', error);
        });
});