FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV DB_DIALECT=sqlite
ENV DB_STORAGE_PATH=/app/database.sqlite

EXPOSE 5000

# First boot (empty volume): migrate + seed the demo data.
# Every later boot: migrate only (idempotent — sequelize-cli tracks what
# already ran) so we never re-seed on top of live data.
CMD ["sh", "-c", "mkdir -p $(dirname \"$DB_STORAGE_PATH\") && if [ ! -f \"$DB_STORAGE_PATH\" ]; then npx sequelize-cli db:migrate && npx sequelize-cli db:seed:all; else npx sequelize-cli db:migrate; fi && node server.js"]