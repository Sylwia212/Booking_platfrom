import * as dom from "./domElements.js";

const allViews = [
  dom.homeView,
  dom.offersView,
  document.getElementById("register-view"),
  document.getElementById("login-view"),
  dom.bookingView,
  dom.myBookingsView,
  document.getElementById("admin-view"),
].filter((view) => view != null);

export function hideAllViews() {
  allViews.forEach((view) => {
    if (view) view.style.display = "none";
  });
}

export function showView(viewElement) {
  hideAllViews();
  if (viewElement) viewElement.style.display = "block";
}

export function updateUserUI(keycloakUser) {
  if (
    !dom.userActions ||
    !dom.userInfo ||
    !dom.userEmailSpan ||
    !dom.myBookingsBtn ||
    !dom.logoutBtn ||
    !dom.loginBtn ||
    !dom.registerBtn
  ) {
    console.warn(
      "viewManager.updateUserUI: Brakuje niektórych kluczowych elementów UI w DOM."
    );
  }

  const adminPanelLink = document.getElementById("admin-panel-link");

  if (keycloakUser && (keycloakUser.email || keycloakUser.name)) {
    if (dom.userActions) dom.userActions.style.display = "none";
    if (dom.userInfo) dom.userInfo.style.display = "flex";
    if (dom.userEmailSpan)
      dom.userEmailSpan.textContent = keycloakUser.name || keycloakUser.email;
    if (dom.myBookingsBtn) dom.myBookingsBtn.style.display = "inline-block";
    if (dom.logoutBtn) dom.logoutBtn.style.display = "inline-block";
    if (dom.loginBtn) dom.loginBtn.style.display = "none";
    if (dom.registerBtn) dom.registerBtn.style.display = "none";

    if (adminPanelLink) {
      adminPanelLink.style.display =
        keycloakUser.roles && keycloakUser.roles.includes("admin")
          ? "inline-block"
          : "none";
    }
  } else {
    if (dom.userActions) dom.userActions.style.display = "flex";
    if (dom.userInfo) dom.userInfo.style.display = "none";
    if (dom.userEmailSpan) dom.userEmailSpan.textContent = "";
    if (dom.myBookingsBtn) dom.myBookingsBtn.style.display = "none";
    if (dom.logoutBtn) dom.logoutBtn.style.display = "none";
    if (dom.loginBtn) dom.loginBtn.style.display = "inline-block";
    if (dom.registerBtn) dom.registerBtn.style.display = "inline-block";

    if (adminPanelLink) {
      adminPanelLink.style.display = "none";
    }
  }
}

export function initNavigation(callbacks) {
  const { loadOffersCallback, loadMyBookingsCallback, getCurrentUserCallback } =
    callbacks;

  if (dom.navHome) {
    dom.navHome.addEventListener("click", (e) => {
      e.preventDefault();
      if (dom.homeView) showView(dom.homeView);
    });
  }

  if (dom.navOffers) {
    dom.navOffers.addEventListener("click", (e) => {
      e.preventDefault();
      if (dom.offersView) showView(dom.offersView);
      if (typeof loadOffersCallback === "function") loadOffersCallback();
    });
  }

  const adminPanelLink = document.getElementById("admin-panel-link");
  if (adminPanelLink) {
    adminPanelLink.addEventListener("click", (e) => {
      e.preventDefault();
      const adminView = document.getElementById("admin-view");
      if (adminView) showView(adminView);
    });
  }

  if (dom.myBookingsBtn) {
    dom.myBookingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const user =
        typeof getCurrentUserCallback === "function"
          ? getCurrentUserCallback()
          : null;
      if (!user) {
        alert(
          "Musisz być zalogowany (przez Keycloak), aby zobaczyć swoje rezerwacje."
        );
        return;
      }
      if (dom.myBookingsView) showView(dom.myBookingsView);
      if (typeof loadMyBookingsCallback === "function")
        loadMyBookingsCallback();
    });
  }
}
