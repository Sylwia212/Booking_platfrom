document.addEventListener('DOMContentLoaded', () => {
    // Elementy DOM
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
        homeView.style.display = 'none';
        offersView.style.display = 'none';
        registerView.style.display = 'none';
        loginView.style.display = 'none';
        bookingView.style.display = 'none';
    }

    function showView(viewElement) {
        hideAllViews();
        viewElement.style.display = 'block';
    }

    navHome.addEventListener('click', (e) => {
        e.preventDefault();
        showView(homeView);
    });

    navOffers.addEventListener('click', (e) => {
        e.preventDefault();
        showView(offersView);
        
    });

    registerBtn.addEventListener('click', () => showView(registerView));
    loginBtn.addEventListener('click', () => showView(loginView));

    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('authToken'); 
        localStorage.removeItem('userEmail');
        updateUserUI();
        showView(homeView);
       
    });

    
    function updateUserUI() {
        if (currentUser) {
            userActions.style.display = 'none';
            userInfo.style.display = 'inline'; 
            userEmailSpan.textContent = currentUser.email;
        } else {
            userActions.style.display = 'inline';
            userInfo.style.display = 'none';
            userEmailSpan.textContent = '';
        }
    }
    
    
    function checkLoginStatus() {
        const token = localStorage.getItem('authToken');
        const email = localStorage.getItem('userEmail');
        if (token && email) {
            currentUser = { email: email, token: token };
           
        }
        updateUserUI();
    }


   
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            registerMessage.textContent = '';
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            try {
                const response = await fetch('/api/users/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) { 
                    registerMessage.textContent = `Rejestracja pomyślna! Użytkownik: ${data.user.email}. Możesz się teraz zalogować.`;
                    registerMessage.style.color = 'green';
                    registerForm.reset();
                    setTimeout(() => showView(loginView), 2000);
                } else {
                    registerMessage.textContent = `Błąd rejestracji: ${data.message || response.statusText}`;
                    registerMessage.style.color = 'red';
                }
            } catch (error) {
                console.error('Błąd fetch podczas rejestracji:', error);
                registerMessage.textContent = 'Wystąpił błąd sieci. Spróbuj ponownie.';
                registerMessage.style.color = 'red';
            }
        });
    }

 
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginMessage.textContent = '';
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            try {
               
                const response = await fetch('/api/users/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) { 
                    loginMessage.textContent = 'Logowanie pomyślne!';
                    loginMessage.style.color = 'green';
                    currentUser = { email: data.user.email, token: data.token }; 
                    localStorage.setItem('authToken', data.token); 
                    localStorage.setItem('userEmail', data.user.email);
                    updateUserUI();
                    showView(homeView);
                    loginForm.reset();
                } else {
                    loginMessage.textContent = `Błąd logowania: ${data.message || response.statusText}`;
                    loginMessage.style.color = 'red';
                }
            } catch (error) {
                console.error('Błąd fetch podczas logowania:', error);
                loginMessage.textContent = 'Wystąpił błąd sieci lub endpoint logowania nie działa. Spróbuj ponownie.';
                loginMessage.style.color = 'red';
            }
        });
    }

    
    document.querySelectorAll('.book-now-btn').forEach(button => {
        button.addEventListener('click', function() {
            if (!currentUser) {
                alert('Musisz być zalogowany, aby dokonać rezerwacji.');
                showView(loginView);
                return;
            }
            const offerId = this.dataset.offerId;
            const offerName = this.closest('.offer-card').querySelector('h3').textContent;
            
            bookingOfferIdInput.value = offerId;
            bookingOfferNameSpan.textContent = offerName;
            bookingMessage.textContent = '';
            bookingForm.reset();
            showView(bookingView);
        });
    });

    // --- Formularz Rezerwacji ---
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            bookingMessage.textContent = '';

            if (!currentUser || !currentUser.token) {
                bookingMessage.textContent = 'Błąd: Musisz być zalogowany, aby dokonać rezerwacji (brak tokenu).';
                bookingMessage.style.color = 'red';
                return;
            }

            const offerId = document.getElementById('booking-offer-id').value;
            const dateStart = document.getElementById('booking-date-start').value;
            const dateEnd = document.getElementById('booking-date-end').value;
            const guests = document.getElementById('booking-guests').value;
            
            
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
                    bookingMessage.textContent = 'Rezerwacja złożona pomyślnie!';
                    bookingMessage.style.color = 'green';
                    setTimeout(() => {
                        showView(offersView); 
                    }, 2000);
                } else {
                    bookingMessage.textContent = `Błąd rezerwacji: ${data.message || response.statusText}`;
                    bookingMessage.style.color = 'red';
                }

            } catch (error) {
                console.error('Błąd fetch podczas składania rezerwacji:', error);
                bookingMessage.textContent = 'Wystąpił błąd sieci podczas składania rezerwacji.';
                bookingMessage.style.color = 'red';
            }
        });
    }


    
    fetch('/api/status')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            document.getElementById('api-data').innerText = data.message;
        })
        .catch(error => {
            document.getElementById('api-data').innerText = 'Błąd API Gateway.';
            console.error('Błąd Booking-API status:', error);
        });

    fetch('/api/core/status')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            document.getElementById('core-service-status').innerText = data.message;
        })
        .catch(error => {
            document.getElementById('core-service-status').innerText = 'Błąd Core Service.';
            console.error('Błąd Core Service status:', error);
        });

   
    checkLoginStatus();
    showView(homeView); 
});