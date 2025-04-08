FROM node:14.20.1-alpine

WORKDIR /usr/src/app

ARG REACT_APP_GA_TRACKING_ID

# First copy only package files for better caching
COPY package.json .
COPY yarn.lock .
COPY ./client/package.json ./client/
COPY ./common/package.json ./common/
COPY ./server/package.json ./server/

# Install dependencies for all workspaces
RUN yarn install --frozen-lockfile

# Copy the rest of the files
COPY . .

# Build
RUN BUILD_MODE=production yarn build

# Port
EXPOSE 3001
# Serve
CMD [ "yarn", "serve" ]