import * as dom from "./domElements.js";
import * as api from "./apiService.js";
// import { getAuthToken } from "./app.js"; 

export async function loadMyBookings() {
    if (!dom.myBookingsList) {
        console.error("MYBOOKINGS.JS: Element #my-bookings-list nie znaleziony!");
        return;
    }


    dom.myBookingsList.innerHTML = '<p>Ładowanie Twoich rezerwacji...</p>';
    console.log("MYBOOKINGS.JS: Próba pobrania moich rezerwacji...");

    try {
        const bookings = await api.fetchMyBookings();
        console.log("MYBOOKINGS.JS: Otrzymano rezerwacje z API:", bookings); 

        if (Array.isArray(bookings) && bookings.length > 0) {
            renderMyBookings(bookings);
        } else if (Array.isArray(bookings) && bookings.length === 0) {
            dom.myBookingsList.innerHTML = '<p>Nie masz jeszcze żadnych rezerwacji.</p>';
        } else {
            console.warn("MYBOOKINGS.JS: Otrzymano nieoczekiwane dane dla rezerwacji (nie jest to tablica lub jest pusta/null):", bookings);
            dom.myBookingsList.innerHTML = '<p>Nie udało się załadować Twoich rezerwacji (nieprawidłowe dane).</p>';
        }
    } catch (error) {
        console.error('MYBOOKINGS.JS: Błąd podczas ładowania moich rezerwacji:', error.message, error.status ? `Status: ${error.status}` : '', error.data ? `Data: ${JSON.stringify(error.data)}` : '');
        let errorMsg = `<p>Nie udało się załadować Twoich rezerwacji.`;
        if (error.status === 401 || error.status === 403) {
            errorMsg += ` Błąd autoryzacji (HTTP ${error.status}). Spróbuj zalogować się ponownie.`;
        } else if (error.message) {
            errorMsg += ` Błąd: ${error.message}`;
        } else {
            errorMsg += ` Nieznany błąd.`;
        }
        errorMsg += `</p>`;
        dom.myBookingsList.innerHTML = errorMsg;
    }
}


function renderMyBookings(bookings) {
    if (!dom.myBookingsList) return;
    dom.myBookingsList.innerHTML = ''; 

    if (!bookings || bookings.length === 0) {
        dom.myBookingsList.innerHTML = '<p>Nie masz jeszcze żadnych rezerwacji.</p>';
        return;
    }

    const ul = document.createElement('ul');
    bookings.forEach(booking => {
        const li = document.createElement('li');
        li.className = 'booking-item';

        const startDate = booking.start_date; 
        const endDate = booking.end_date;  

        li.innerHTML = `
            <h4>Rezerwacja ID: ${booking.id}</h4>
            <p><strong>Produkt:</strong> ${booking.item_id}</p>
            <p><strong>Od:</strong> ${startDate} <strong>Do:</strong> ${endDate}</p>
            <p><strong>Liczba gości:</strong> ${booking.number_of_guests || 1}</p>
            <p><strong>Status:</strong> ${booking.status || 'Nieznany'}</p>
            <p><em>Zarezerwowano: ${new Date(booking.created_at).toLocaleString()}</em></p>
        `;
        ul.appendChild(li);
    });
    dom.myBookingsList.appendChild(ul);
}

export function initMyBookings() {
    console.log("MYBOOKINGS.JS: initMyBookings called.");
}
