import * as dom from "./domElements.js";
import * as api from "./apiService.js";
import { handleBookNowClick } from "./booking.js"; 

export async function loadOffers() {
  if (!dom.offersGrid) {
    if (dom.offersView)
      dom.offersView.innerHTML =
        "<p>Błąd konfiguracji: Brak kontenera na oferty.</p>";
    return;
  }
  dom.offersGrid.innerHTML = "<p>Ładowanie apartamentów...</p>";
  try {
    const items = await api.fetchOffers();
    renderOffers(items);
  } catch (error) {
    console.error("Błąd podczas ładowania ofert:", error);
    dom.offersGrid.innerHTML = `<p>Nie udało się załadować ofert apartamentów. Błąd: ${error.message}</p>`;
  }
}

function renderOffers(items) {
  if (!dom.offersGrid) return;
  dom.offersGrid.innerHTML = "";

  if (!items || items.length === 0) {
    dom.offersGrid.innerHTML = "<p>Obecnie brak dostępnych apartamentów.</p>";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "offer-card";
    let priceInfo = "Zapytaj o cenę";
    if (item.pricePerNight) {
      priceInfo = `${item.pricePerNight} ${item.currency || ""} / noc`;
    } else if (item.pricePerHour) {
      priceInfo = `${item.pricePerHour} ${item.currency || ""} / godzina`;
    } else if (item.pricePerUnit) {
      priceInfo = `${item.pricePerUnit} ${item.currency || ""} / szt.`;
    }
    card.innerHTML = `
            <img 
                src="${item.imageUrl}" 
                alt="${item.name || "Zdjęcie oferty"}" 
                onerror="this.onerror=null; this.src='/images/fallback-placeholder.png';"
                >
            <h3>${item.name || "Brak nazwy"}</h3>
            <p>${item.description || "Brak opisu."}</p>
            <p><strong>Lokalizacja:</strong> ${
              item.location || "Nieokreślona"
            }</p>
            <p><strong>Cena:</strong> ${priceInfo}</p>
            <button class="book-now-btn" data-offer-id="${
              item.id
            }" data-offer-name="${item.name || "Apartament"}">Rezerwuj</button>
        `;
    dom.offersGrid.appendChild(card);
  });
  addEventListenersToBookButtons();
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
  // Funkcja loadOffers jest teraz wywoływana przez viewManager (initNavigation),
}
