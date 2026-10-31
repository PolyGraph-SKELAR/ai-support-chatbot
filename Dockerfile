FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
USER node
CMD ["npx", "tsx", "src/index.ts"]
