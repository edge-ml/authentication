FROM node:21

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3002
ENV NODE_ENV=production
CMD [ "npm", "run", "start:docker" ]
