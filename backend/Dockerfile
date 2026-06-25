FROM python:3.12-slim

# Install system dependencies (libgomp1 is required for FAISS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv for dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency definition and source code
COPY pyproject.toml .
COPY src/ src/

# Sync virtualenv using uv (frozen parameter is omitted for convenience)
RUN uv sync

EXPOSE 8000

ENV PATH="/app/.venv/bin:$PATH"

# Run Uvicorn server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
