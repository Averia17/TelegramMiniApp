FROM node:22-bookworm-slim

WORKDIR /home/node/app

COPY package*.json /home/node/app/

RUN npm ci --no-audit --no-fund

COPY . /home/node/app

RUN mkdir -p /home/node/app/dist && chown -R node:node /home/node/app
USER node
