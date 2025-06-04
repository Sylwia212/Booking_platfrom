export APP_KEYCLOAK_URL=${APP_KEYCLOAK_URL:-http://localhost:8180}
export APP_KEYCLOAK_REALM=${APP_KEYCLOAK_REALM:-booking-app-realm}
export APP_KEYCLOAK_CLIENT_ID=${APP_KEYCLOAK_CLIENT_ID:-booking-ui-client}


echo "--- Booking UI Entrypoint ---"
echo "Injecting runtime configuration into index.html..."
echo "  APP_KEYCLOAK_URL: ${APP_KEYCLOAK_URL}"
echo "  APP_KEYCLOAK_REALM: ${APP_KEYCLOAK_REALM}"
echo "  APP_KEYCLOAK_CLIENT_ID: ${APP_KEYCLOAK_CLIENT_ID}"

mkdir -p /usr/share/nginx/html

cp -r /app-src/* /usr/share/nginx/html/

envsubst '$APP_KEYCLOAK_URL $APP_KEYCLOAK_REALM $APP_KEYCLOAK_CLIENT_ID' < /usr/share/nginx/html/index.html > /usr/share/nginx/html/index.html.tmp
mv /usr/share/nginx/html/index.html.tmp /usr/share/nginx/html/index.html

echo "Configuration injected."
echo "Starting Nginx..."

exec nginx -g 'daemon off;'