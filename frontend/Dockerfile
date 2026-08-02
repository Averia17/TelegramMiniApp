FROM node:18

WORKDIR /home/node/app

COPY package*.json /home/node/app/

RUN npm ci --no-audit --no-fund

COPY . /home/node/app
