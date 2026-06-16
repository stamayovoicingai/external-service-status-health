# Imagen única: compila el frontend y lo sirve desde el backend.
# Easypanel construye esto al conectar el repo (Build: Dockerfile).

# ── Stage 1: build del frontend ──────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build   # genera /fe/dist

# ── Stage 2: runtime del backend (sirve también el frontend) ─────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev   # tsx está en dependencies, así que queda disponible
COPY backend/ ./

# Copiar el frontend compilado y decirle al backend dónde está.
COPY --from=frontend /fe/dist ./public
ENV STATIC_DIR=/app/public
ENV PORT=4000

EXPOSE 4000
CMD ["npm", "start"]
