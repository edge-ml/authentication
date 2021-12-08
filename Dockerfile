FROM node:latest

WORKDIR /opt/aura-auth
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3002
ENV NODE_ENV=production
CMD [ "npm", "run", "start:docker" ]
