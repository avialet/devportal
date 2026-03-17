# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Force development mode during build so devDependencies (typescript, vite) are installed
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm ci

COPY packages/shared/ packages/shared/
COPY backend/ backend/
COPY frontend/ frontend/
COPY tsconfig.base.json ./

RUN npm run build -w packages/shared
RUN npm run build -w frontend
RUN npm run build -w backend

# Stage 2: Run
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

RUN npm ci --omit=dev --workspace=backend --workspace=packages/shared

ENV NODE_ENV=production
ENV PORT=3000
VOLUME /app/data
EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
