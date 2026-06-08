FROM node:21

WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 600000 \
 && npm install --no-audit --no-fund
COPY . .
EXPOSE 3002
ENV NODE_ENV=production
CMD [ "npm", "run", "start:docker" ]
