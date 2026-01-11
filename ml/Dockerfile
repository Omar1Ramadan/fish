# Dark Zone Predictor - ML Server
# Python 3.11 for TensorFlow compatibility
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the ML code
COPY . .

# Default port (Railway will override with $PORT)
ENV PORT=8000

# Expose port
EXPOSE 8000

# Use shell form to expand $PORT variable
CMD uvicorn prediction_server:app --host 0.0.0.0 --port ${PORT:-8000}
