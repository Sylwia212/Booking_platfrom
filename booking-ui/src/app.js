document.addEventListener('DOMContentLoaded', () => {
    
    const contentArea = document.getElementById('content-area');
    const homeView = document.getElementById('home-view');
    const offersView = document.getElementById('offers-view');
    const registerView = document.getElementById('register-view');
    const loginView = document.getElementById('login-view');
    const bookingView = document.getElementById('booking-view');

    const navHome = document.getElementById('nav-home');
    const navOffers = document.getElementById('nav-offers');
    
    const userActions = document.getElementById('user-actions');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');

    const userInfo = document.getElementById('user-info');
    const userEmailSpan = document.getElementById('user-email');
    const myBookingsBtn = document.getElementById('my-bookings-btn');
    const logoutBtn = document.getElementById('logout-btn');

    const registerForm = document.getElementById('register-form');
    const registerMessage = document.getElementById('register-message');
    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');

    const bookingOfferNameSpan = document.getElementById('booking-offer-name');
    const bookingOfferIdInput = document.getElementById('booking-offer-id');
    const bookingForm = document.getElementById('booking-form');
    const bookingMessage = document.getElementById('booking-message');

    
    const offersGrid = document.querySelector('#offers-view .offers-grid');

    let currentUser = null; 
    
    function hideAllViews() {
        if(homeView) homeView.style.display = 'none';
        if(offersView) offersView.style.display = 'none';
        if(registerView) registerView.style.display = 'none';
        if(loginView) loginView.style.display = 'none';
        if(bookingView) bookingView.style.display = 'none';
    }

    function showView(viewElement) {
        hideAllViews();
        if(viewElement) viewElement.style.display = 'block';
    }

    if(navHome) navHome.addEventListener('click', (e) => {
        e.preventDefault();
        showView(homeView);
    });

    if(navOffers) navOffers.addEventListener('click', (e) => {
        e.preventDefault();
        showView(offersView);
        loadOffers(); 
    });

    if(registerBtn) registerBtn.addEventListener('click', () => showView(registerView));
    if(loginBtn) loginBtn.addEventListener('click', () => showView(loginView));

    if(logoutBtn) logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('authToken'); 
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userId'); 
        updateUserUI();
        showView(homeView);
    });
    
    function updateUserUI() {
        if (currentUser && currentUser.email) {
            if(userActions) userActions.style.display = 'none';
            if(userInfo) userInfo.style.display = 'inline'; 
            if(userEmailSpan) userEmailSpan.textContent = currentUser.email;
        } else {
            if(userActions) userActions.style.display = 'inline';
            if(userInfo) userInfo.style.display = 'none';
            if(userEmailSpan) userEmailSpan.textContent = '';
        }
    }
    
    function checkLoginStatus() {
        const token = localStorage.getItem('authToken');
        const email = localStorage.getItem('userEmail');
        const userId = localStorage.getItem('userId'); 

        if (token && email) {
            currentUser = { email: email, token: token, id: userId }; 
        } else {
            currentUser = null; 
        }
        updateUserUI();
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(registerMessage) registerMessage.textContent = '';
            const emailInput = document.getElementById('reg-email');
            const passwordInput = document.getElementById('reg-password');
            if (!emailInput || !passwordInput) return;
            const email = emailInput.value;
            const password = passwordInput.value;
            try {
                const response = await fetch('/api/users/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (response.ok) { 
                    if(registerMessage) {
                        registerMessage.textContent = `Rejestracja pomyślna! Użytkownik: ${data.user.email}. Możesz się teraz zalogować.`;
                        registerMessage.style.color = 'green';
                    }
                    registerForm.reset();
                    setTimeout(() => showView(loginView), 2000);
                } else {
                    if(registerMessage) {
                        registerMessage.textContent = `Błąd rejestracji: ${data.message || response.statusText}`;
                        registerMessage.style.color = 'red';
                    }
                }
            } catch (error) {
                console.error('Błąd fetch podczas rejestracji:', error);
                if(registerMessage) {
                    registerMessage.textContent = 'Wystąpił błąd sieci. Spróbuj ponownie.';
                    registerMessage.style.color = 'red';
                }
            }
        });
    }
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(loginMessage) loginMessage.textContent = '';
            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            if (!emailInput || !passwordInput) return;
            const email = emailInput.value;
            const password = passwordInput.value;
            try {
                const response = await fetch('/api/users/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (response.ok) { 
                    if(loginMessage) {
                        loginMessage.textContent = 'Logowanie pomyślne!';
                        loginMessage.style.color = 'green';
                    }
                    if (data.user && data.user.email && data.token && data.user.id) { 
                        currentUser = { email: data.user.email, token: data.token, id: data.user.id }; 
                        localStorage.setItem('authToken', data.token); 
                        localStorage.setItem('userEmail', data.user.email);
                        localStorage.setItem('userId', data.user.id); 
                        updateUserUI();
                        showView(homeView); 
                        loginForm.reset();
                    } else {
                        console.error("Odpowiedź serwera logowania nie zawiera wszystkich wymaganych pól (user.id, user.email, token):", data);
                        throw new Error("Niekompletne dane logowania z serwera.");
                    }
                } else {
                    if(loginMessage) {
                        loginMessage.textContent = `Błąd logowania: ${data.message || response.statusText}`;
                        loginMessage.style.color = 'red';
                    }
                    currentUser = null; 
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('userId');
                    updateUserUI();
                }
            } catch (error) {
                console.error('Błąd fetch podczas logowania:', error);
                if(loginMessage) {
                    loginMessage.textContent = `Wystąpił błąd: ${error.message}. Sprawdź konsolę.`;
                    loginMessage.style.color = 'red';
                }
            }
        });
    }


    async function loadOffers() {
        if (!offersGrid) {
            console.error("Element .offers-grid nie znaleziony w #offers-view!");
            if(offersView) offersView.innerHTML = "<p>Błąd konfiguracji: Brak kontenera na oferty.</p>";
            return;
        }
        offersGrid.innerHTML = '<p>Ładowanie apartamentów...</p>';
        try {
            const response = await fetch('/api/core/items');
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
                throw new Error(errorData.message || `Nie udało się pobrać ofert: ${response.statusText}`);
            }
            const items = await response.json();
            renderOffers(items); 
        } catch (error) {
            console.error('Błąd podczas ładowania ofert:', error);
            offersGrid.innerHTML = `<p>Nie udało się załadować ofert apartamentów. Błąd: ${error.message}</p>`;
        }
    }

    function renderOffers(items) {
        if (!offersGrid) return;
        offersGrid.innerHTML = '';

        if (!items || items.length === 0) {
            offersGrid.innerHTML = '<p>Obecnie brak dostępnych apartamentów.</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'offer-card';
            
            let priceInfo = 'Zapytaj o cenę';
            if (item.pricePerNight) {
                priceInfo = `${item.pricePerNight} ${item.currency || ''} / noc`;
            } else if (item.pricePerHour) {
                priceInfo = `${item.pricePerHour} ${item.currency || ''} / godzina`;
            } else if (item.pricePerUnit) {
                priceInfo = `${item.pricePerUnit} ${item.currency || ''} / szt.`;
            }

            card.innerHTML = `
                <img src="${item.imageUrl || 'https://placehold.co/300x200/EFEFEF/AAAAAA?text=Apartament'}" alt="${item.name || 'Apartament'}">
                <h3>${item.name || 'Brak nazwy'}</h3>
                <p>${item.description || 'Brak opisu.'}</p>
                <p><strong>Lokalizacja:</strong> ${item.location || 'Nieokreślona'}</p>
                <p><strong>Cena:</strong> ${priceInfo}</p>
                <button class="book-now-btn" data-offer-id="${item.id}" data-offer-name="${item.name || 'Apartament'}">Rezerwuj</button>
            `;
            offersGrid.appendChild(card);
        });
        addEventListenersToBookButtons(); 
    }

    function addEventListenersToBookButtons() {
        const buttons = document.querySelectorAll('#offers-view .offer-card .book-now-btn');
        buttons.forEach(button => {
            
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button); 
            
            newButton.addEventListener('click', handleBookNowClick); 
        });
    }

    function handleBookNowClick() {
        if (!currentUser) {
            alert('Musisz być zalogowany, aby dokonać rezerwacji.');
            showView(loginView);
            return;
        }
        const offerId = this.dataset.offerId;
        const offerName = this.dataset.offerName; 
        
        if(bookingOfferIdInput) bookingOfferIdInput.value = offerId;
        if(bookingOfferNameSpan) bookingOfferNameSpan.textContent = offerName;
        if(bookingMessage) bookingMessage.textContent = '';
        if(bookingForm) bookingForm.reset();
        showView(bookingView);
    }
    
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(bookingMessage) bookingMessage.textContent = '';
            if (!currentUser || !currentUser.token) {
                if(bookingMessage) {
                    bookingMessage.textContent = 'Błąd: Musisz być zalogowany (brak tokenu).';
                    bookingMessage.style.color = 'red';
                }
                return;
            }
            const offerIdInput = document.getElementById('booking-offer-id');
            const dateStartInput = document.getElementById('booking-date-start');
            const dateEndInput = document.getElementById('booking-date-end');
            const guestsInput = document.getElementById('booking-guests');
            if (!offerIdInput || !dateStartInput || !dateEndInput || !guestsInput) return;

            const offerId = offerIdInput.value;
            const dateStart = dateStartInput.value;
            const dateEnd = dateEndInput.value;
            const guests = guestsInput.value;
            
            const bookingApiUrl = '/api/core/bookings'; 
            try {
                const response = await fetch(bookingApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentUser.token}` 
                    },
                    body: JSON.stringify({
                        itemId: offerId, 
                        startDate: dateStart,
                        endDate: dateEnd,
                        numberOfGuests: parseInt(guests)
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    if(bookingMessage) {
                        bookingMessage.textContent = `Rezerwacja (${data.booking?.bookingId || ''}) złożona: ${data.message || 'Sukces!'}`;
                        bookingMessage.style.color = 'green';
                    }
                    setTimeout(() => {
                        showView(offersView); 
                        loadOffers(); 
                    }, 3000);
                } else {
                    if(bookingMessage) {
                        bookingMessage.textContent = `Błąd rezerwacji: ${data.message || response.statusText}`;
                        bookingMessage.style.color = 'red';
                    }
                }
            } catch (error) {
                console.error('Błąd fetch podczas składania rezerwacji:', error);
                if(bookingMessage) {
                    bookingMessage.textContent = 'Wystąpił błąd sieci podczas składania rezerwacji.';
                    bookingMessage.style.color = 'red';
                }
            }
        });
    }

    const apiDataSpan = document.getElementById('api-data');
    const coreServiceStatusSpan = document.getElementById('core-service-status');

    if (apiDataSpan) {
        fetch('/api/status')
            .then(response => response.ok ? response.json() : Promise.reject(response))
            .then(data => { apiDataSpan.innerText = data.message; })
            .catch(error => { apiDataSpan.innerText = 'Błąd API Gateway.'; console.error('Błąd Booking-API status:', error); });
    }
    if (coreServiceStatusSpan) {
        fetch('/api/core/status')
            .then(response => response.ok ? response.json() : Promise.reject(response))
            .then(data => {
                if (data.dependencies && data.dependencies.database) {
                    coreServiceStatusSpan.innerText = `Core: ${data.message}, DB: ${data.dependencies.database}, RabbitMQ: ${data.dependencies.rabbitmq}, Redis: ${data.dependencies.redis}`;
                } else {
                    coreServiceStatusSpan.innerText = data.message || "Status Core Service nieznany";
                }
            })
            .catch(error => { coreServiceStatusSpan.innerText = 'Błąd Core Service.'; console.error('Błąd Core Service status:', error); });
    }
    
    checkLoginStatus(); 
    showView(homeView); 
});