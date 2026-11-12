FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Cache dependency layer
COPY pyproject.toml /app/
RUN uv sync --no-dev --no-install-project

COPY src /app/src

FROM python:3.12-slim-bookworm AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH="/app/src" \
    PLAYWRIGHT_BROWSERS_PATH="/ms-playwright" \
    PATH="/app/.venv/bin:$PATH"

# Install Chromium runtime dependencies, OpenCV libraries, and healthcheck tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built virtual environment
COPY --from=builder /app/.venv /app/.venv

# Install Chromium browser binary for Playwright into fixed system path
RUN python -m playwright install chromium

# Copy application source code
COPY src /app/src
COPY pyproject.toml /app/

# Create runtime storage directories
RUN mkdir -p /app/storage/logs /app/storage/media /app/storage/browser_sessions /app/storage/recipes

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]