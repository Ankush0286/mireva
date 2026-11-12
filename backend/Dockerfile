FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/


# - UV_PYTHON_DOWNLOADS=never forces uv to use the container's system Python 3.12
# - PLAYWRIGHT_BROWSERS_PATH="/ms-playwright" stores Chromium in a fixed system path
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONPATH="/app/src" \
    PLAYWRIGHT_BROWSERS_PATH="/ms-playwright" \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app


RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libatomic1 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


COPY pyproject.toml uv.lock* ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-project --no-dev


RUN uv run playwright install --with-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


COPY src /app/src

# Ensure required runtime & volume mount directories exist
RUN mkdir -p /app/storage/logs /app/storage/media /app/storage/browser_sessions /app/storage/recipes

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]   
