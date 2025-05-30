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
                    
                    if (data.user && data.user.email && data.token) {
                        currentUser = { email: data.user.email, token: data.token, id: data.user.id }; 
                        localStorage.setItem('authToken', data.token); 
                        localStorage.setItem('userEmail', data.user.email);
                        localStorage.setItem('userId', data.user.id); 
                        updateUserUI();
                        showView(homeView); 
                        loginForm.reset();
                    } else {
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

    function addEventListenersToBookButtons() {
        document.querySelectorAll('.book-now-btn').forEach(button => {
            button.addEventListener('click', function() {
                if (!currentUser) {
                    alert('Musisz być zalogowany, aby dokonać rezerwacji.');
                    showView(loginView);
                    return;
                }
                const offerId = this.dataset.offerId;
                const offerName = this.dataset.offerName || this.closest('.offer-card').querySelector('h3').textContent;
                
                if(bookingOfferIdInput) bookingOfferIdInput.value = offerId;
                if(bookingOfferNameSpan) bookingOfferNameSpan.textContent = offerName;
                if(bookingMessage) bookingMessage.textContent = '';
                if(bookingForm) bookingForm.reset();
                showView(bookingView);
            });
        });
    }
    addEventListenersToBookButtons(); 

    
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(bookingMessage) bookingMessage.textContent = '';

            if (!currentUser || !currentUser.token) {
                if(bookingMessage) {
                    bookingMessage.textContent = 'Błąd: Musisz być zalogowany, aby dokonać rezerwacji (brak tokenu).';
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
                        bookingMessage.textContent = 'Rezerwacja złożona pomyślnie!';
                        bookingMessage.style.color = 'green';
                    }
                    setTimeout(() => {
                        showView(offersView); 
                    }, 2000);
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
            .then(data => {
                apiDataSpan.innerText = data.message;
            })
            .catch(error => {
                apiDataSpan.innerText = 'Błąd API Gateway.';
                console.error('Błąd Booking-API status:', error);
            });
    }

    if (coreServiceStatusSpan) {
        fetch('/api/core/status')
            .then(response => response.ok ? response.json() : Promise.reject(response))
            .then(data => {
                coreServiceStatusSpan.innerText = data.message;
            })
            .catch(error => {
                coreServiceStatusSpan.innerText = 'Błąd Core Service.';
                console.error('Błąd Core Service status:', error);
            });
    }
    
    
    checkLoginStatus(); 
    showView(homeView); 
});