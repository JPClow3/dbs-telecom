FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# better-sqlite3 (devDependency, usada em build/teste) é compilada pelo
# node-gyp durante o `npm ci` e precisa de toolchain nativa no alpine.
RUN apk add --no-cache python3 make g++ \
 && npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
