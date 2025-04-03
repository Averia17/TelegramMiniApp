FROM node:14.20.1-alpine

WORKDIR /usr/src/app

ARG REACT_APP_GA_TRACKING_ID

# Dependencies
COPY ./package.json .
COPY ./yarn.lock .
COPY ./client/package.json ./client/
COPY ./common/package.json ./common/
COPY ./server/package.json ./server/
RUN yarn

# Files
COPY . .

# Build
RUN BUILD_MODE=production yarn build

# Port
EXPOSE 3001
# Serve
CMD [ "yarn", "serve" ]
