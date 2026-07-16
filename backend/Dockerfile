FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production

EXPOSE 5000

# Postgres (Neon): run migrations (idempotent — sequelize-cli tracks what
# already ran), then start. Seeding is a ONE-TIME setup step done separately,
# never on deploy.
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node server.js"]