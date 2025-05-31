import * as dom from './domElements.js';
import * as api from './apiService.js';
import { getCurrentUser } from './auth.js';
import { showView } from './viewManager.js'; 

export async function loadMyBookings() {
    if (!dom.myBookingsList) {
        console.error("Element #my-bookings-list nie znaleziony!");
        return;
    }
    const currentUser = getCurrentUser();

    if (!currentUser || !currentUser.token) {
        dom.myBookingsList.innerHTML = '<p>Musisz być zalogowany, aby zobaczyć swoje rezerwacje.</p>';
        return;
    }
    dom.myBookingsList.innerHTML = '<p>Ładowanie Twoich rezerwacji...</p>';

    try {
        const bookings = await api.fetchMyBookings(currentUser.token);
        renderMyBookings(bookings);
    } catch (error) {
        console.error('Błąd podczas ładowania moich rezerwacji:', error);
        dom.myBookingsList.innerHTML = `<p>Nie udało się załadować Twoich rezerwacji. Błąd: ${error.message}</p>`;
        if (error.message.toLowerCase().includes('autoryzacji') || error.message.toLowerCase().includes('token')) {
            // 
        }
    }
}

function renderMyBookings(bookings) {
    if (!dom.myBookingsList) return;
    dom.myBookingsList.innerHTML = '';

    if (!bookings || bookings.length === 0) {
        dom.myBookingsList.innerHTML = '<p>Nie masz jeszcze żadnych rezerwacji.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'bookings-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>ID Rezerwacji</th>
                <th>ID Oferty</th>
                <th>Od</th>
                <th>Do</th>
                <th>Goście</th>
                <th>Status</th>
                <th>Data Utworzenia</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    bookings.forEach(booking => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${booking.id || 'Brak'}</td>
            <td>${booking.item_id || 'Brak'}</td>
            <td>${booking.start_date ? new Date(booking.start_date).toLocaleDateString('pl-PL') : 'Brak'}</td>
            <td>${booking.end_date ? new Date(booking.end_date).toLocaleDateString('pl-PL') : 'Brak'}</td>
            <td>${booking.number_of_guests || 1}</td>
            <td>${booking.status || 'Nieznany'}</td>
            <td>${booking.created_at ? new Date(booking.created_at).toLocaleString('pl-PL') : 'Brak'}</td>
        `;
        tbody.appendChild(row);
    });
    dom.myBookingsList.appendChild(table);
}

export function initMyBookings() {
    // loadMyBookings() jest wywoływane z viewManager (initNavigation)
}