# Stage 1: Build TypeScript
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

# Copy SQL schema (needed at runtime for migrations)
COPY src/database/schema.sql ./src/database/schema.sql

EXPOSE 3000

CMD ["node", "dist/index.js"]
