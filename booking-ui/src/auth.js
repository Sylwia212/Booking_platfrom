import * as dom from './domElements.js';
import * as api from './apiService.js';
import { showView, updateUserUI } from './viewManager.js';

let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

function updateLocalCurrentUserAndUI(userData) {
    if (userData && userData.token && userData.user && userData.user.email && userData.user.id) {
        currentUser = {
            email: userData.user.email,
            token: userData.token,
            id: userData.user.id
        };
        localStorage.setItem('authToken', currentUser.token);
        localStorage.setItem('userEmail', currentUser.email);
        localStorage.setItem('userId', currentUser.id);
    } else {
        currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userId');
    }
    updateUserUI(currentUser); 
}

export function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    const email = localStorage.getItem('userEmail');
    const userId = localStorage.getItem('userId');

    if (token && email && userId) {
        updateLocalCurrentUserAndUI({ token, user: { email, id: userId } });
    } else {
        updateLocalCurrentUserAndUI(null);
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (!dom.registerForm || !dom.registerMessage || !dom.registerEmailInput || !dom.registerPasswordInput) {
        console.error("Auth: Brakuje elementów DOM formularza rejestracji.");
        return;
    }
    
    dom.registerMessage.textContent = '';
    const email = dom.registerEmailInput.value;
    const password = dom.registerPasswordInput.value;

    try {
        const data = await api.registerUser(email, password);
        dom.registerMessage.textContent = `Rejestracja pomyślna! Użytkownik: ${data.user.email}. Możesz się teraz zalogować.`;
        dom.registerMessage.style.color = 'green';
        dom.registerForm.reset();
        setTimeout(() => {
            if (dom.loginView) showView(dom.loginView);
        }, 2000);
    } catch (error) {
        console.error('Auth: Błąd podczas rejestracji:', error);
        dom.registerMessage.textContent = `Błąd rejestracji: ${error.message}`;
        dom.registerMessage.style.color = 'red';
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    if (!dom.loginForm || !dom.loginMessage || !dom.loginEmailInput || !dom.loginPasswordInput) {
        console.error("Auth: Brakuje elementów DOM formularza logowania.");
        return;
    }

    dom.loginMessage.textContent = '';
    const email = dom.loginEmailInput.value;
    const password = dom.loginPasswordInput.value;

    try {
        const data = await api.loginUser(email, password);
        dom.loginMessage.textContent = 'Logowanie pomyślne!';
        dom.loginMessage.style.color = 'green';
        
        updateLocalCurrentUserAndUI(data); 
        
        if (dom.homeView) showView(dom.homeView);
        dom.loginForm.reset();

    } catch (error) {
        console.error('Auth: Błąd podczas logowania:', error);
        dom.loginMessage.textContent = `Błąd logowania: ${error.message}`;
        dom.loginMessage.style.color = 'red';
        updateLocalCurrentUserAndUI(null);
    }
}

function handleLogout() {
    updateLocalCurrentUserAndUI(null);
    if (dom.homeView) showView(dom.homeView);
}

export function initAuth() {
    if (dom.registerForm) {
        dom.registerForm.addEventListener('submit', handleRegisterSubmit);
    }
    if (dom.loginForm) {
        dom.loginForm.addEventListener('submit', handleLoginSubmit);
    }
    if (dom.logoutBtn) {
        dom.logoutBtn.addEventListener('click', handleLogout);
    }
    checkLoginStatus(); 
}