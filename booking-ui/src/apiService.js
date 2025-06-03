import { getAuthToken } from "./app.js"; 

const API_BASE_URL = "/api";

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  if (token) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const contentType = response.headers.get("content-type");
    let data = null;

    if (contentType && contentType.includes("application/json")) {
      const responseText = await response.text(); 
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error(
            `API Error (JSON parsing) for ${
              config.method || "GET"
            } ${url}: Status ${
              response.status
            }, Content-Type: ${contentType}, Failed to parse JSON: ${responseText}`
          );
          if (!response.ok) {
            const error = new Error(
              `Odpowiedź serwera nie jest poprawnym JSON (status: ${response.status}).`
            );
            error.status = response.status;
            throw error;
          }
          data = null; 
          console.warn(
            `API Warning for ${config.method || "GET"} ${url}: Status ${
              response.status
            } OK, but response was not valid JSON: ${responseText}`
          );
        }
      } else if (response.ok) {
        console.log(
          `API Info for ${config.method || "GET"} ${url}: Status ${
            response.status
          } OK, empty response body.`
        );
      }
    } else if (response.ok) {
      data = await response.text(); 
    }

    if (!response.ok) {
      const errorMessage =
        data?.message ||
        (typeof data === "string" ? data : null) ||
        response.statusText ||
        `HTTP error ${response.status}`;
      console.error(
        `API Error (response not ok) for ${
          config.method || "GET"
        } ${url}: Status ${response.status}, Message: ${errorMessage}`,
        data
      );
      const error = new Error(errorMessage);
      error.status = response.status;
      if (data && typeof data === "object") error.data = data;
      throw error;
    }
    return data;
  } catch (error) {
    const processedError =
      error instanceof Error && typeof error.status !== "undefined"
        ? error
        : new Error(`Błąd sieci lub inny problem dla ${url}: ${error.message}`);

    if (!(error instanceof Error && typeof error.status !== "undefined")) {
      console.error(
        `Network/other error for ${config.method || "GET"} ${url}:`,
        processedError.message,
        error
      );
    }
    throw processedError;
  }
}

export function fetchApiStatus() {
  return request("/status"); 
}

export function fetchCoreStatus() {
  return request("/core/status"); 
}

export function fetchOffers() {
  return request("/core/items"); 
}

export function createBooking(bookingData) {
  return request("/core/bookings", {
    method: "POST",
    body: JSON.stringify(bookingData),
  });
}

export function fetchMyBookings() {
  return request("/core/bookings/my", {
    method: "GET",
  });
}

export function fetchUserProfile() {
  return request("/users/me"); 
}