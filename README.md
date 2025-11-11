# 🚚 IntelliLog-AI — Intelligent Logistics & Delivery Optimization System

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-teal.svg)](https://fastapi.tiangolo.com/)
[![Streamlit](https://img.shields.io/badge/Dashboard-Streamlit-ff4b4b.svg)](https://streamlit.io/)
[![Docker](https://img.shields.io/badge/Containerized-Docker-2496ED.svg)](https://www.docker.com/)
[![XGBoost](https://img.shields.io/badge/ML-XGBoost-orange.svg)](https://xgboost.readthedocs.io/)
[![OR-Tools](https://img.shields.io/badge/Optimizer-Google%20OR--Tools-4285F4.svg)](https://developers.google.com/optimization)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 Overview

**IntelliLog-AI** is an **end-to-end AI system** that predicts delivery times using machine learning (XGBoost)  
and optimizes delivery routes using algorithmic optimization (VRP via OR-Tools + heuristics).  

It’s a hybrid **ML + DSA-based logistics engine** designed for **real-world scalability and deployment.**  

---

## 🧠 Core Features

✅ **Machine Learning Engine** — Predicts delivery times using XGBoost regression.  
✅ **Route Optimization** — Solves multi-driver Vehicle Routing Problem (VRP) via OR-Tools or custom heuristics.  
✅ **Interactive Dashboard** — Real-time Streamlit visualization with KPI metrics and persistent maps.  
✅ **FastAPI Microservice** — Low-latency REST API serving predictions and optimized routes.  
✅ **Dockerized Deployment** — One-command setup using Docker Compose.  
✅ **API Health & Smart Insights** — CPU/memory metrics + route performance analytics.  

---

## 🏗️ Architecture

                 ┌──────────────────────────┐
                 │        Frontend          │
                 │ Streamlit Dashboard      │
                 │ (User Input + Map + KPIs)│
                 └────────────┬─────────────┘
                              │
                        REST API Calls
                              │
                 ┌────────────┴─────────────┐
                 │        Backend           │
                 │ FastAPI (XGBoost + VRP)  │
                 │ ML + Optimization Engine │
                 └────────────┬─────────────┘
                              │
                 ┌────────────┴─────────────┐
                 │     Model & Data Layer   │
                 │  XGBoost | OR-Tools | CSV│
                 └──────────────────────────┘

---

## ⚙️ Tech Stack

| Layer | Technology |
|--------|-------------|
| **Frontend** | Streamlit + Folium |
| **Backend** | FastAPI |
| **ML Engine** | XGBoost |
| **Optimization Engine** | Google OR-Tools, NetworkX |
| **Deployment** | Docker, Docker Compose |
| **Data Handling** | Pandas, NumPy |
| **Monitoring** | psutil (API Health Metrics) |

---

## 🚀 Getting Started

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/VIVEK-MARRI/IntelliLog-AI.git
cd IntelliLog-AI
2️⃣ Build & Run (Dockerized)
docker compose up -d



API runs on → http://localhost:8000


Dashboard runs on → http://localhost:8501


3️⃣ Access the Dashboard
Open your browser → http://localhost:8501
You’ll see:


📊 Predicted delivery times


🧭 Optimized delivery routes


🗺️ Interactive real-time map


📈 API health metrics & smart insights



🧩 API Endpoints
MethodEndpointDescriptionGET/API health checkPOST/predict_delivery_timePredict delivery time for ordersPOST/plan_routesOptimize delivery routes using VRPGET/metricsAPI & system performance metrics

🧪 Example Request — /predict_delivery_time
{
  "orders": [
    {
      "order_id": "O001",
      "lat": 12.97,
      "lon": 77.59,
      "distance_km": 3.5,
      "traffic": "medium",
      "weather": "clear",
      "order_type": "normal"
    }
  ]
}

Response:
[
  {
    "order_id": "O001",
    "predicted_delivery_time_min": 26.43
  }
]


📦 Project Structure
IntelliLog-AI/
├── src/
│   ├── api/                # FastAPI backend
│   │   └── app.py
│   ├── dashboard/          # Streamlit dashboard
│   │   └── app.py
│   ├── optimization/       # VRP + heuristics + OR-Tools
│   │   └── vrp_solver.py
│   ├── features/           # Feature engineering scripts
│   │   └── build_features.py
│   └── etl/                # Data generation & ingestion
│       └── ingest.py
├── models/                 # Trained ML models
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md


📊 Smart Insights (from Dashboard)


🕒 Average Predicted Time


🧭 Longest Route Distance


💨 Heaviest Route Load


🚀 Reduction in Delivery Delays (~25%)



🧰 Development Setup (Without Docker)
# Create virtual environment
python -m venv venv
source venv/bin/activate  # (Windows: venv\Scripts\activate)

# Install dependencies
pip install -r requirements.txt

# Start backend
uvicorn src.api.app:app --reload

# Start dashboard
streamlit run src/dashboard/app.py


🧠 Future Enhancements


 Integrate real-time GPS tracking (Simulated IoT)


 Add dynamic traffic & weather data APIs


 Include SHAP explanations for ML interpretability


 Deploy to Render / GCP Cloud Run


 Add authentication (JWT) for API security



🧾 License
This project is released under the MIT License.
Feel free to use, modify, and distribute with attribution.

💡 Author
Vivek Marri
📧 vivekmarriofficial@gmail.com
🌐 GitHub: VIVEK-MARRI

"Where Machine Learning meets Real-World Optimization."


---
