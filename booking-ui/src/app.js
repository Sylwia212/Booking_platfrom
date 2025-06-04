import * as dom from "./domElements.js";
import { showView, initNavigation, updateUserUI } from "./viewManager.js";
import { loadOffers, initOffers } from "./offers.js";
import { loadMyBookings, initMyBookings } from "./myBookings.js";
import { initBookingForm } from "./booking.js";
import * as api from "./apiService.js";

const keycloakConfig = {
    url: window.APP_KEYCLOAK_CONFIG?.url || 'http://localhost:8180', 
    realm: window.APP_KEYCLOAK_CONFIG?.realm || 'booking-app-realm',
    clientId: window.APP_KEYCLOAK_CONFIG?.clientId || 'booking-ui-client'
};
console.log("APP.JS: Używam konfiguracji Keycloak:", keycloakConfig);

if (typeof Keycloak === "undefined") {
  console.error(
    "KRYTYCZNY BŁĄD: Biblioteka Keycloak (Keycloak global object) nie została załadowana! Sprawdź index.html i czy Keycloak działa."
  );
  const errorMsg =
    '<p style="color:red;text-align:center;margin-top:50px;">Błąd krytyczny: Biblioteka Keycloak nie została załadowana...</p>';
  if (document.body) {
    document.body.innerHTML = errorMsg;
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body) document.body.innerHTML = errorMsg;
    });
  }
  throw new Error("Keycloak library not loaded!");
}

const keycloak = new Keycloak(keycloakConfig);
let keycloakAuthenticatedUser = null;

async function loadUserProfileAndToken() {
  try {
    if (!keycloak.authenticated) {
      console.log(
        "Keycloak: (loadUserProfileAndToken) Użytkownik nie jest uwierzytelniony. Czyszczenie danych użytkownika."
      );
      keycloakAuthenticatedUser = null;
      updateUserUI(null);
      return;
    }
    console.log(
      "Keycloak: (loadUserProfileAndToken) Próba załadowania profilu użytkownika..."
    );
    const profile = await keycloak.loadUserProfile();
    keycloakAuthenticatedUser = {
      email: profile.email,
      name:
        profile.firstName && profile.lastName
          ? `${profile.firstName} ${profile.lastName}`
          : profile.username || "Użytkownik",
      username: profile.username,
      token: keycloak.token,
      idTokenParsed: keycloak.idTokenParsed,
      id: keycloak.subject,
      roles: keycloak.tokenParsed?.realm_access?.roles || [],
    };
    console.log(
      "Keycloak: Profil użytkownika i token załadowane:",
      keycloakAuthenticatedUser
    );
  } catch (error) {
    console.error(
      "Keycloak: (loadUserProfileAndToken) Błąd ładowania profilu użytkownika:",
      error
    );
    keycloakAuthenticatedUser = null;
    updateUserUI(null);
  }
}

async function initializeKeycloakAndApp() {
  try {
    console.log("Keycloak: Próba inicjalizacji (keycloak.init)...");
    const authenticated = await keycloak.init({
      onLoad: "check-sso",
      silentCheckSsoRedirectUri:
        window.location.origin + "/silent-check-sso.html",
      pkceMethod: "S256",
      checkLoginIframe: false,
    });

    if (authenticated) {
      console.log("Keycloak: Użytkownik jest uwierzytelniony po init.");
      await loadUserProfileAndToken();
    } else {
      console.log("Keycloak: Użytkownik NIE jest uwierzytelniony po init.");
      keycloakAuthenticatedUser = null;
    }
  } catch (error) {
    console.error("Keycloak: Błąd podczas keycloak.init():", error);
    keycloakAuthenticatedUser = null;
  } finally {
    console.log(
      "Keycloak: Zakończono inicjalizację (lub błąd), aktualizacja UI i listenerów."
    );
    updateUserUI(keycloakAuthenticatedUser);
    setupApplicationEventListeners();
    loadInitialView();

    if (keycloakAuthenticatedUser) {
      console.log(
        "Keycloak: (finally) Użytkownik uwierzytelniony, ładowanie danych chronionych."
      );
      if (
        dom.offersView &&
        (dom.offersView.style.display !== "none" ||
          (dom.offersGrid && !dom.offersGrid.querySelector(".offer-card")))
      ) {
        loadOffers();
      }
    }
  }
}

export function getCurrentUser() {
  return keycloakAuthenticatedUser;
}

export function getAuthToken() {
  if (keycloak && keycloak.authenticated && keycloak.token) {
    return keycloak.token;
  }
  return null;
}

export function loginWithKeycloak() {
  if (keycloak) {
    console.log(
      "APP.JS: Wywołanie keycloak.login() z funkcji loginWithKeycloak."
    );
    keycloak.login();
  } else {
    console.error(
      "APP.JS: Instancja Keycloak nie jest dostępna do wywołania login()."
    );
    alert(
      "Błąd: System autentykacji jest niedostępny. Spróbuj odświeżyć stronę."
    );
  }
}

function setupApplicationEventListeners() {
  if (dom.loginBtn) {
    dom.loginBtn.onclick = () => {
      console.log(
        "UI: Kliknięto Zaloguj - wywołanie keycloak.login() bezpośrednio."
      );
      loginWithKeycloak();
    };
  }
  if (dom.registerBtn) {
    dom.registerBtn.onclick = () => {
      console.log("UI: Kliknięto Zarejestruj - wywołanie keycloak.register()");
      if (keycloak) keycloak.register();
    };
  }
  if (dom.logoutBtn) {
    dom.logoutBtn.onclick = () => {
      console.log("UI: Kliknięto Wyloguj - wywołanie keycloak.logout()");
      const logoutOptions = { redirectUri: window.location.origin };
      if (keycloak) keycloak.logout(logoutOptions);
    };
  }

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  if (loginForm) loginForm.style.display = "none";
  if (registerForm) registerForm.style.display = "none";

  initNavigation({
    loadOffersCallback: loadOffers,
    loadMyBookingsCallback: loadMyBookings,
    getCurrentUserCallback: getCurrentUser,
  });

  initBookingForm();
  initOffers();
  initMyBookings();
}

async function fetchAndDisplayCoreStatus() {
  if (!dom.coreServiceStatusSpan) return;

  dom.coreServiceStatusSpan.innerText = "Ładowanie statusu Core...";
  try {
    console.log("APP: Próba pobrania statusu Core Service...");
    const data = await api.fetchCoreStatus();
    if (dom.coreServiceStatusSpan) {
      if (data && data.message && data.dependencies) {
        dom.coreServiceStatusSpan.innerText =
          `Core: ${data.message}, DB: ${
            data.dependencies.database || "N/A"
          }, ` +
          `RabbitMQ: ${data.dependencies.rabbitmq || "N/A"}, Redis: ${
            data.dependencies.redis || "N/A"
          }`;
      } else {
        dom.coreServiceStatusSpan.innerText =
          data?.message || "Status Core Service nieznany";
      }
    }
    console.log("APP: Status Core Service pobrany:", data);
  } catch (error) {
    if (dom.coreServiceStatusSpan) {
      let errorMessageText = `Błąd Core Service`;
      if (error.status) {
        errorMessageText += ` (HTTP ${error.status})`;
      } else if (error.message) {
        errorMessageText += ` (${error.message})`;
      } else {
        errorMessageText += ` (Błąd sieci lub nieznany)`;
      }
      dom.coreServiceStatusSpan.innerText = errorMessageText;
    }
    console.error(
      "APP: Błąd pobierania statusu Core Service:",
      error.message,
      error.status ? `Status: ${error.status}` : "",
      error
    );
  }
}

function loadInitialView() { 
    if (keycloakAuthenticatedUser) {
        if (keycloakAuthenticatedUser.roles && keycloakAuthenticatedUser.roles.includes('admin')) {
            console.log("APP.JS: loadInitialView - Użytkownik jest adminem, pokazuję panel admina.");
            if (dom.adminView) {
                showView(dom.adminView);
                if (dom.adminUserGreeting && keycloakAuthenticatedUser.name) {
                    dom.adminUserGreeting.textContent = keycloakAuthenticatedUser.name || keycloakAuthenticatedUser.username;
                }
            } else if (dom.homeView) { 
                showView(dom.homeView);
            }
        } else {
            console.log("APP.JS: loadInitialView - Użytkownik jest zalogowany (nie admin), pokazuję oferty.");
            if (dom.offersView) { 
                showView(dom.offersView);
                loadOffers(); 
            } else if (dom.homeView) { 
                showView(dom.homeView);
            }
        }
        fetchAndDisplayCoreStatus(); 
    } else {
        console.log("APP.JS: loadInitialView - Użytkownik niezalogowany, pokazuję stronę główną.");
        if (dom.homeView) showView(dom.homeView); 
        if (dom.coreServiceStatusSpan) dom.coreServiceStatusSpan.innerText = 'Zaloguj się przez Keycloak, aby zobaczyć status Core Service.';
    }

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
}

keycloak.onAuthSuccess = async () => {
  console.log("Keycloak Event: onAuthSuccess.");

  await loadUserProfileAndToken();

  updateUserUI(keycloakAuthenticatedUser);

  if (keycloakAuthenticatedUser) {
    try {
      console.log(
        "APP.JS: onAuthSuccess - Wywołanie fetchUserProfile() w celu synchronizacji z user-service..."
      );
      const userProfileFromUserService = await api.fetchUserProfile();
      console.log(
        "APP.JS: onAuthSuccess - Odpowiedź z user-service /users/me:",
        userProfileFromUserService
      );
    } catch (error) {
      console.error(
        "APP.JS: onAuthSuccess - Błąd podczas wywoływania fetchUserProfile():",
        error
      );
    }
  }
  loadInitialView();

};

keycloak.onAuthError = (errorData) => {
  console.error("Keycloak Event: onAuthError.", errorData);
  keycloakAuthenticatedUser = null;
  updateUserUI(null);
  if (dom.coreServiceStatusSpan)
    dom.coreServiceStatusSpan.innerText = "Błąd autentykacji.";
};

keycloak.onAuthRefreshSuccess = async () => {
  console.log(
    "Keycloak Event: onAuthRefreshSuccess - Token pomyślnie odświeżony."
  );
  await loadUserProfileAndToken();
  updateUserUI(keycloakAuthenticatedUser);
};

keycloak.onAuthRefreshError = () => {
  console.error(
    "Keycloak Event: onAuthRefreshError - Błąd odświeżania tokenu."
  );
  keycloakAuthenticatedUser = null;
  updateUserUI(null);
  loginWithKeycloak();
};

keycloak.onAuthLogout = () => {
  console.log("Keycloak Event: onAuthLogout.");
  keycloakAuthenticatedUser = null;
  updateUserUI(null);
  if (dom.homeView) showView(dom.homeView);
  if (dom.coreServiceStatusSpan)
    dom.coreServiceStatusSpan.innerText =
      "Zaloguj się przez Keycloak, aby zobaczyć status Core Service.";
};

keycloak.onTokenExpired = () => {
  console.log("Keycloak Event: onTokenExpired - próba odświeżenia.");
  keycloak
    .updateToken(30)
    .then(async (refreshed) => {
      if (refreshed) {
        console.log(
          "Keycloak: Token pomyślnie odświeżony przez onTokenExpired."
        );
        await loadUserProfileAndToken();
        updateUserUI(keycloakAuthenticatedUser);
      } else {
        console.warn(
          "Keycloak: (onTokenExpired) Token nie został odświeżony. Prawdopodobnie sesja wygasła. Przekierowanie do logowania."
        );
        keycloakAuthenticatedUser = null;
        updateUserUI(null);
        loginWithKeycloak();
      }
    })
    .catch(() => {
      console.error(
        "Keycloak: (onTokenExpired) Krytyczny błąd podczas odświeżania tokenu. Przekierowanie do logowania."
      );
      keycloakAuthenticatedUser = null;
      updateUserUI(null);
      loginWithKeycloak();
    });
};

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM w pełni załadowany. Inicjalizacja Keycloak i aplikacji...");
  initializeKeycloakAndApp();
});
