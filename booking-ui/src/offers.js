import * as dom from "./domElements.js";
import * as api from "./apiService.js"; 
import { handleBookNowClick } from "./booking.js"; 
import { getCurrentUser } from "./app.js";

export async function loadOffers() {
  if (!dom.offersGrid) {
    if (dom.offersView) {
      dom.offersView.innerHTML =
        "<p>Błąd konfiguracji: Brak kontenera na oferty.</p>";
    }
    console.error("offers.js: Element offersGrid nie znaleziony w DOM.");
    return;
  }
  dom.offersGrid.innerHTML = "<p>Ładowanie dostępnych ofert...</p>";
  try {
    console.log("OFFERS.JS: Próba pobrania ofert przez api.fetchOffers()..."); 
    const items = await api.fetchOffers();
    console.log("OFFERS.JS: Otrzymano odpowiedź z api.fetchOffers():", items); 
    renderOffers(items);
  } catch (error) {
    console.error("OFFERS.JS: Błąd podczas ładowania ofert:", error.message, error); 
    let userFriendlyMessage = `<p>Nie udało się załadować ofert. Błąd: ${error.message}</p>`;
    if (error.status === 401 || error.status === 403) {
        userFriendlyMessage += "<p>Prawdopodobnie musisz się zalogować lub Twój token wygasł.</p>";
    }
    dom.offersGrid.innerHTML = userFriendlyMessage;
  }
}

function renderOffers(items) {
  if (!dom.offersGrid) return;
  dom.offersGrid.innerHTML = ""; 

  if (!items || items.length === 0) {
    dom.offersGrid.innerHTML = "<p>Obecnie brak dostępnych ofert.</p>";
    return;
  }

  const currentUser = getCurrentUser();

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "offer-card";
    let priceInfo = "Zapytaj o cenę";
    if (item.pricePerNight) {
      priceInfo = `${item.pricePerNight} ${item.currency || "PLN"} / noc`;
    } else if (item.pricePerHour) {
      priceInfo = `${item.pricePerHour} ${item.currency || "PLN"} / godzina`;
    } else if (item.pricePerUnit) {
      priceInfo = `${item.pricePerUnit} ${item.currency || "PLN"} / szt.`;
    }

    const imageUrl = item.imageUrl ? item.imageUrl : '/images/fallback-placeholder.png';


    let bookingButtonHtml = '';
    if (currentUser) {
      bookingButtonHtml = `<button class="book-now-btn" data-offer-id="${item.id}" data-offer-name="${item.name || "Oferta"}">Rezerwuj</button>`;
    } else {
      bookingButtonHtml = `<p class="login-to-book-info">Zaloguj się, aby zarezerwować.</p>`;
    }

    card.innerHTML = `
            <img 
                src="${imageUrl}" 
                alt="${item.name || "Zdjęcie oferty"}" 
                onerror="this.onerror=null; this.src='/images/fallback-placeholder.png';"
            >
            <h3>${item.name || "Brak nazwy"}</h3>
            <p>${item.description || "Brak opisu."}</p>
            <p><strong>Lokalizacja:</strong> ${item.location || "Nieokreślona"}</p>
            <p><strong>Cena:</strong> ${priceInfo}</p>
            ${bookingButtonHtml} 
        `;
    dom.offersGrid.appendChild(card);
  });
  if (currentUser) {
    addEventListenersToBookButtons();
  }
}

function addEventListenersToBookButtons() {
  const buttons = document.querySelectorAll(
    "#offers-view .offer-card .book-now-btn" 
  );
  buttons.forEach((button) => {
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    newButton.addEventListener("click", handleBookNowClick); 
  });
}

export function initOffers() { 
  console.log("offers.js: initOffers called (zazwyczaj puste, bo loadOffers jest wyzwalane przez nawigację)");
}
