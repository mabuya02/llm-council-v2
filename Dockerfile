# ── Stage 1: Build frontend ──────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + static frontend ───
FROM python:3.12-slim AS runtime
WORKDIR /app

# Install Python dependencies (pip, no uv in container)
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Copy backend code
COPY backend/ ./backend/
COPY main.py ./

# Copy built frontend for optional static serving
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Data volume
VOLUME /app/data

EXPOSE 8001

CMD ["python", "-m", "backend.main"]
