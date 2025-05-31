import * as dom from './domElements.js';
import * as api from './apiService.js';
import { todayFormatted } from './utils.js';
import { showView } from './viewManager.js';
import { getCurrentUser } from './auth.js';
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
    const currentUser = getCurrentUser();
    if (!currentUser) {
        alert('Musisz być zalogowany, aby dokonać rezerwacji.');
        if (dom.loginView) showView(dom.loginView);
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
}

async function handleBookingFormSubmit(event) {
    event.preventDefault();
    if (!dom.bookingForm || !dom.bookingMessage) return;

    dom.bookingMessage.textContent = '';
    const currentUser = getCurrentUser();

    if (!currentUser || !currentUser.token) {
        dom.bookingMessage.textContent = 'Błąd: Musisz być zalogowany (brak tokenu).';
        dom.bookingMessage.style.color = 'red';
        return;
    }

    if (!dom.bookingOfferIdInput || !dom.bookingDateStartInput || !dom.bookingDateEndInput || !dom.bookingGuestsInput) {
        console.error("Brakuje elementów formularza rezerwacji w DOM.");
        dom.bookingMessage.textContent = 'Błąd wewnętrzny formularza.';
        dom.bookingMessage.style.color = 'red';
        return;
    }

    const itemId = dom.bookingOfferIdInput.value;
    const startDate = dom.bookingDateStartInput.value;
    const endDate = dom.bookingDateEndInput.value;
    const numberOfGuests = dom.bookingGuestsInput.value;

    if (!startDate || !endDate) {
        dom.bookingMessage.textContent = 'Proszę wybrać datę rozpoczęcia i zakończenia.';
        dom.bookingMessage.style.color = 'red';
        return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        dom.bookingMessage.textContent = 'Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.';
        dom.bookingMessage.style.color = 'red';
        return;
    }
    if (startDate < todayFormatted || endDate < todayFormatted) {
        dom.bookingMessage.textContent = 'Daty rezerwacji nie mogą być z przeszłości.';
        dom.bookingMessage.style.color = 'red';
        return;
    }

    const bookingData = { itemId, startDate, endDate, numberOfGuests: parseInt(numberOfGuests) || 1 };

    try {
        const data = await api.createBooking(bookingData, currentUser.token);
        dom.bookingMessage.textContent = `Rezerwacja (${data.booking?.id || ''}) złożona: ${data.message || 'Sukces!'}`;
        dom.bookingMessage.style.color = 'green';
        
        if (dom.bookingForm) dom.bookingForm.reset();

        setTimeout(() => {
            if (dom.myBookingsView) showView(dom.myBookingsView);
            if (typeof loadMyBookings === 'function') loadMyBookings(); 
        }, 2000);
    } catch (error) {
        console.error('Błąd podczas składania rezerwacji:', error);
        dom.bookingMessage.textContent = `Błąd rezerwacji: ${error.message}`;
        dom.bookingMessage.style.color = 'red';
    }
}

export function initBookingForm() {
    if (dom.bookingDateStartInput && dom.bookingDateEndInput) {
        dom.bookingDateStartInput.addEventListener('change', () => {
            const startDateVal = dom.bookingDateStartInput.value;
            if (startDateVal) {
                dom.bookingDateEndInput.min = startDateVal;
                if (dom.bookingDateEndInput.value && dom.bookingDateEndInput.value < startDateVal) {
                    dom.bookingDateEndInput.value = startDateVal; 
                }
            } else {
                dom.bookingDateEndInput.min = todayFormatted;
            }
        });
    }

    if (dom.bookingForm) {
        dom.bookingForm.addEventListener('submit', handleBookingFormSubmit);
    }
}