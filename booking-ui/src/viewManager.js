import * as dom from './domElements.js';

const allViews = [
    dom.homeView, dom.offersView, dom.registerView,
    dom.loginView, dom.bookingView, dom.myBookingsView
];

export function hideAllViews() {
    allViews.forEach(view => {
        if (view) view.style.display = 'none';
    });
}

export function showView(viewElement) {
    hideAllViews();
    if (viewElement) viewElement.style.display = 'block';
}

export function updateUserUI(currentUser) {
    if (!dom.userActions || !dom.userInfo || !dom.userEmailSpan || !dom.myBookingsBtn) {
        console.warn("viewManager.updateUserUI: Brakuje niektórych elementów UI użytkownika w DOM.");
        return;
    }
    if (currentUser && currentUser.email) {
        dom.userActions.style.display = 'none';
        dom.userInfo.style.display = 'flex'; 
        dom.userEmailSpan.textContent = currentUser.email;
        dom.myBookingsBtn.style.display = 'inline-block';
    } else {
        dom.userActions.style.display = 'flex';
        dom.userInfo.style.display = 'none';
        dom.userEmailSpan.textContent = '';
        dom.myBookingsBtn.style.display = 'none';
    }
}

export function initNavigation(callbacks) {
    const { loadOffersCallback, loadMyBookingsCallback, getCurrentUserCallback } = callbacks;

    if (dom.navHome) {
        dom.navHome.addEventListener('click', (e) => {
            e.preventDefault();
            if (dom.homeView) showView(dom.homeView);
        });
    }

    if (dom.navOffers) {
        dom.navOffers.addEventListener('click', (e) => {
            e.preventDefault();
            if (dom.offersView) showView(dom.offersView);
            if (typeof loadOffersCallback === 'function') loadOffersCallback();
        });
    }

    if (dom.myBookingsBtn) {
        dom.myBookingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const user = typeof getCurrentUserCallback === 'function' ? getCurrentUserCallback() : null;
            if (!user) {
                alert("Musisz być zalogowany, aby zobaczyć swoje rezerwacje.");
                if (dom.loginView) showView(dom.loginView);
                return;
            }
            if (dom.myBookingsView) showView(dom.myBookingsView);
            if (typeof loadMyBookingsCallback === 'function') loadMyBookingsCallback();
        });
    }

    if (dom.registerBtn) {
        dom.registerBtn.addEventListener('click', () => {
            if (dom.registerView) showView(dom.registerView);
        });
    }
    if (dom.loginBtn) {
        dom.loginBtn.addEventListener('click', () => {
            if (dom.loginView) showView(dom.loginView);
        });
    }
}