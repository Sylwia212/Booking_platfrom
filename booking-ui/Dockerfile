# booking-ui/Dockerfile
FROM nginx:alpine

# Usunięcie domyślnego pliku konfiguracyjnego Nginx, aby nie kolidował z Twoim
RUN rm /etc/nginx/conf.d/default.conf

# Kopiujemy Twoją niestandardową konfigurację Nginx
COPY ./nginx/my-app.conf /etc/nginx/conf.d/my-app.conf

# Kopiujemy pliki Twojej aplikacji frontendowej
COPY ./src /usr/share/nginx/html

# Odsłaniamy port
EXPOSE 80

# Domyślna komenda do uruchomienia Nginx w tle (daemon off)
CMD ["nginx", "-g", "daemon off;"]