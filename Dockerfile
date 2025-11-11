# =============================
# IntelliLog-AI: Production Dockerfile (v3.3)
# Author: Vivek Marri
# =============================

# ---- Base Python Environment ----
FROM python:3.10-slim AS base

# Set working directory
WORKDIR /app

# Copy dependencies first for Docker caching
COPY requirements.txt .

# Install dependencies efficiently
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project
COPY . .

# Common environment variables
ENV PYTHONUNBUFFERED=1
ENV MODEL_PATH=/app/models/xgb_delivery_time_model.pkl

# Expose both ports (FastAPI + Streamlit)
EXPOSE 8000 8501

# =============================
# Stage 1: FastAPI Backend
# =============================
FROM base AS api
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]

# =============================
# Stage 2: Streamlit Dashboard
# =============================
FROM base AS dashboard
ENV API_URL=http://api:8000
CMD ["streamlit", "run", "src/dashboard/app.py", "--server.port=8501", "--server.address=0.0.0.0"]
