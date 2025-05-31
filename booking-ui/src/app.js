import * as dom from './domElements.js';
import { initAuth, getCurrentUser } from './auth.js';
import { showView, initNavigation } from './viewManager.js';
import { loadOffers } from './offers.js'; 
import { loadMyBookings } from './myBookings.js'; 
import { initBookingForm } from './booking.js';
import * as api from './apiService.js'; 

document.addEventListener('DOMContentLoaded', () => {
    const criticalDOMElements = [
        dom.homeView, dom.offersView, dom.loginView, dom.registerView, dom.bookingView, dom.myBookingsView,
        dom.navHome, dom.navOffers, dom.userActions, dom.userInfo, dom.myBookingsBtn, dom.logoutBtn,
        dom.apiDataSpan, dom.coreServiceStatusSpan
    ];

    if (criticalDOMElements.some(el => !el)) {
        console.error(
            "Krytyczny błąd: Brak co najmniej jednego z podstawowych elementów DOM! " +
            "Sprawdź ID elementów w pliku index.html oraz poprawność ich selekcji w domElements.js."
        );
        document.body.innerHTML = `
            <p style="color:red; font-size:1.2em; text-align:center; margin-top: 40px;">
                Wystąpił krytyczny błąd podczas inicjalizacji aplikacji.<br>
                Sprawdź konsolę przeglądarki, aby uzyskać więcej informacji.
            </p>`;
        return; 
    }

    initAuth();

    initNavigation({
        loadOffersCallback: loadOffers,
        loadMyBookingsCallback: loadMyBookings,
        getCurrentUserCallback: getCurrentUser
    });

    initBookingForm();

    if (dom.apiDataSpan) {
        api.fetchApiStatus()
            .then(data => {
                if (dom.apiDataSpan) dom.apiDataSpan.innerText = data.message || 'N/A';
            })
            .catch(error => {
                if (dom.apiDataSpan) dom.apiDataSpan.innerText = 'Błąd API Gateway.';
                console.error('Błąd pobierania statusu Booking-API:', error.message);
            });
    }

    if (dom.coreServiceStatusSpan) {
        api.fetchCoreStatus()
            .then(data => {
                if (dom.coreServiceStatusSpan) {
                    if (data.message && data.dependencies) {
                        dom.coreServiceStatusSpan.innerText =
                            `Core: ${data.message}, DB: ${data.dependencies.database || 'N/A'}, ` +
                            `RabbitMQ: ${data.dependencies.rabbitmq || 'N/A'}, Redis: ${data.dependencies.redis || 'N/A'}`;
                    } else {
                        dom.coreServiceStatusSpan.innerText = data.message || "Status Core Service nieznany";
                    }
                }
            })
            .catch(error => {
                if (dom.coreServiceStatusSpan) dom.coreServiceStatusSpan.innerText = 'Błąd Core Service.';
                console.error('Błąd pobierania statusu Core Service:', error.message);
            });
    }
    
    if (dom.homeView) showView(dom.homeView);
});