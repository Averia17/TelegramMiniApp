FROM nginx:1.26.1-alpine
COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./proxy_params /etc/nginx/proxy_params
COPY ./prod.conf /etc/nginx/conf.d/default.conf
