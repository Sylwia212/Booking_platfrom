const API_BASE_URL = '/api';

async function request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    try {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            const errorMessage = data?.message || data?.error || response.statusText || `HTTP error ${response.status}`;
            console.error(`API Error for ${options.method || 'GET'} ${url}: Status ${response.status}, Message: ${errorMessage}`, data);
            throw new Error(errorMessage);
        }
        return data; 
    } catch (error) {
        const networkOrParsingError = (error instanceof Error) ? error : new Error('Błąd sieci lub parsowania odpowiedzi.');
        console.error(`Network or parsing error for ${options.method || 'GET'} ${url}:`, networkOrParsingError.message);
        throw networkOrParsingError;
    }
}

export function registerUser(email, password) {
    return request('/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
}

export function loginUser(email, password) {
    return request('/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
}

export function fetchApiStatus() {
    return request('/status');
}

export function fetchCoreStatus() {
    return request('/core/status');
}

export function fetchOffers() {
    return request('/core/items');
}

export function createBooking(bookingData, token) {
    return request('/core/bookings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bookingData)
    });
}

export function fetchMyBookings(token) {
    return request('/core/bookings/my', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}`
        }
    });
}