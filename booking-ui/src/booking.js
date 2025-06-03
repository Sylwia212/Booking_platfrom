import * as dom from './domElements.js';
import * as api from './apiService.js';
import { todayFormatted } from './utils.js';
import { showView } from './viewManager.js';
import { getCurrentUser, getAuthToken, loginWithKeycloak } from './app.js'; 
import { loadMyBookings } from './myBookings.js';

function setupBookingFormDates() {
    if (dom.bookingDateStartInput) {
        dom.bookingDateStartInput.min = todayFormatted;
        dom.bookingDateStartInput.value = '';
    }
    if (dom.bookingDateEndInput) {
        dom.bookingDateEndInput.min = todayFormatted;
        dom.bookingDateEndInput.value = '';
    }
}

export function handleBookNowClick() {
    console.log("BOOKING.JS: handleBookNowClick triggered for offer:", this.dataset.offerId);
    const currentUser = getCurrentUser();
    if (!currentUser) {
        alert('Musisz być zalogowany, aby dokonać rezerwacji. Zostaniesz przekierowany na stronę logowania.');
        console.log("BOOKING.JS: Użytkownik nie jest zalogowany. Wywołanie loginWithKeycloak().");
        loginWithKeycloak(); 
        return;
    }

    const offerId = this.dataset.offerId;
    const offerName = this.dataset.offerName;

    if (dom.bookingOfferIdInput) dom.bookingOfferIdInput.value = offerId;
    if (dom.bookingOfferNameSpan) dom.bookingOfferNameSpan.textContent = offerName;
    if (dom.bookingMessage) dom.bookingMessage.textContent = '';
    if (dom.bookingForm) dom.bookingForm.reset();

    setupBookingFormDates();
    if (dom.bookingView) showView(dom.bookingView);
    console.log("BOOKING.JS: Formularz rezerwacji przygotowany i wyświetlony dla oferty:", offerId);
}

async function handleBookingFormSubmit(event) {
    event.preventDefault();
    if (!dom.bookingForm || !dom.bookingMessage) return;

    dom.bookingMessage.textContent = '';
    const token = getAuthToken(); 

    if (!token) {
        dom.bookingMessage.textContent = 'Błąd: Sesja wygasła lub problem z autoryzacją. Spróbuj się zalogować ponownie.';
        dom.bookingMessage.style.color = 'red';
        loginWithKeycloak(); 
        return;
    }

    const itemId = dom.bookingOfferIdInput.value;
    const startDate = dom.bookingDateStartInput.value;
    const endDate = dom.bookingDateEndInput.value;
    const numberOfGuests = dom.bookingGuestsInput.value;

    if (!startDate || !endDate) {
        dom.bookingMessage.textContent = 'Daty rozpoczęcia i zakończenia są wymagane.';
        dom.bookingMessage.style.color = 'red';
        return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        dom.bookingMessage.textContent = 'Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.';
        dom.bookingMessage.style.color = 'red';
        return;
    }
    if (startDate < todayFormatted || endDate < todayFormatted) {
        dom.bookingMessage.textContent = 'Daty rezerwacji nie mogą być wcześniejsze niż dzisiejsza data.';
        dom.bookingMessage.style.color = 'red';
        return;
    }

    const bookingData = { itemId, startDate, endDate, numberOfGuests: parseInt(numberOfGuests) || 1 };
    console.log("BOOKING.JS: Próba wysłania danych rezerwacji:", bookingData);

    try {
        const data = await api.createBooking(bookingData);
        console.log("BOOKING.JS: Odpowiedź z serwera po utworzeniu rezerwacji:", data);
        dom.bookingMessage.textContent = `Rezerwacja (${data.booking?.id || ''}) złożona: ${data.message || 'Sukces!'}`;
        dom.bookingMessage.style.color = 'green';

        if (dom.bookingForm) dom.bookingForm.reset();

        setTimeout(() => {
            if (dom.myBookingsView) showView(dom.myBookingsView);
            if (typeof loadMyBookings === 'function') loadMyBookings();
        }, 2000);
    } catch (error) {
        console.error('BOOKING.JS: Błąd podczas składania rezerwacji:', error);
        let errorMsg = `Błąd rezerwacji: ${error.message || 'Nieznany błąd'}`;
        if (error.data && error.data.message) { 
            errorMsg = `Błąd rezerwacji: ${error.data.message}`;
        }
        dom.bookingMessage.textContent = errorMsg;
        dom.bookingMessage.style.color = 'red';
    }
}

export function initBookingForm() {
    if (dom.bookingForm) {
        dom.bookingForm.addEventListener('submit', handleBookingFormSubmit);
    }
    setupBookingFormDates();
}