FROM nginx:alpine

RUN apk add --no-cache gettext

RUN rm -f /etc/nginx/conf.d/default.conf

COPY ./nginx/my-app.conf /etc/nginx/conf.d/my-app.conf
COPY ./src /app-src
COPY ./docker-entrypoint-ui.sh /docker-entrypoint-ui.sh

RUN chmod +x /docker-entrypoint-ui.sh


EXPOSE 80

CMD ["/docker-entrypoint-ui.sh"]