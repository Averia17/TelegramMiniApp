FROM nginx:1.29-alpine
RUN mkdir -p /src/hero-assets
COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./proxy_params /etc/nginx/proxy_params
COPY ./prod.conf /etc/nginx/conf.d/default.conf
