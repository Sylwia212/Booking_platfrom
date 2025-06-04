FROM nginx:alpine

# Obraz nginx:alpine zwykle go nie ma.
RUN apk add --no-cache gettext

# Usuń domyślną konfigurację Nginx
RUN rm -f /etc/nginx/conf.d/default.conf

# Skopiuj swoją konfigurację Nginx
COPY ./nginx/my-app.conf /etc/nginx/conf.d/my-app.conf

# Skopiuj pliki aplikacji UI do katalogu tymczasowego /app-src w obrazie
COPY ./src /app-src

# Skopiuj skrypt startowy
COPY ./docker-entrypoint-ui.sh /docker-entrypoint-ui.sh
RUN chmod +x /docker-entrypoint-ui.sh


EXPOSE 80

CMD ["/docker-entrypoint-ui.sh"]