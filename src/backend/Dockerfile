FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy the pyproject.toml and lockfile from root
COPY src/backend/pyproject.toml /backend/pyproject.toml
COPY src/backend/uv.lock /backend/uv.lock
COPY src/backend/python_fit_tool_jnkue /backend/python_fit_tool_jnkue/


WORKDIR /backend

# Install dependencies (this layer will be cached if pyproject.toml and uv.lock don't change)
RUN uv sync --frozen

# Copy the backend application into the container (after dependencies to maximize cache)
COPY src/backend /backend

# Default: Run as multi-worker API service (scheduler disabled)
# For production: increase --workers to 4
# For scheduler service: override CMD and set environment variable RUN_SCHEDULER=true
# Example scheduler CMD: ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
CMD ["/backend/.venv/bin/uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--log-config", "logging_config.yaml"]