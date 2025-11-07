# src/etl/ingest.py
import pandas as pd
import numpy as np
import random
import os
from datetime import datetime, timedelta
import argparse

def simulate_orders(n=1000, seed=42):
    """
    Simulates n food delivery orders with location, time, traffic & weather conditions.
    Returns a Pandas DataFrame.
    """
    random.seed(seed)
    np.random.seed(seed)

    # cluster centers (simulate restaurants in a city)
    centers = [
        (12.9716, 77.5946),  # Bangalore center
        (12.9352, 77.6245),  # Koramangala
        (13.0358, 77.5970)   # Yeshwanthpur
    ]

    rows = []
    start_time = datetime.now() - timedelta(days=30)

    for i in range(n):
        center = random.choice(centers)
        lat = center[0] + np.random.normal(0, 0.02)
        lon = center[1] + np.random.normal(0, 0.02)
        order_time = start_time + timedelta(minutes=int(np.random.exponential(scale=60*6)))
        distance_km = float(max(0.5, np.random.exponential(scale=3.0)))
        traffic = random.choice(["low", "medium", "high"])
        weather = random.choice(["clear", "rain", "storm"])
        order_type = random.choice(["normal", "express"])

        # base travel time = distance / speed (speed = 30km/h)
        base_time = distance_km / 30 * 60
        # modifiers
        traffic_factor = {"low": 1.0, "medium": 1.3, "high": 1.7}[traffic]
        weather_factor = {"clear": 1.0, "rain": 1.2, "storm": 1.5}[weather]
        type_factor = {"normal": 1.0, "express": 0.8}[order_type]
        driver_noise = np.random.normal(0, 4)

        delivery_time = base_time * traffic_factor * weather_factor * type_factor + driver_noise
        delivery_time = max(5, round(delivery_time, 2))

        rows.append({
            "order_id": f"O{i:05d}",
            "lat": lat,
            "lon": lon,
            "order_time": order_time,
            "distance_km": round(distance_km, 2),
            "traffic": traffic,
            "weather": weather,
            "order_type": order_type,
            "delivery_time_min": delivery_time
        })

    df = pd.DataFrame(rows)
    return df


def main(out_path="data/raw_orders.csv", n=1000):
    """
    Command-line entry: generates n orders and saves to out_path.
    """
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    df = simulate_orders(n=n)
    df.to_csv(out_path, index=False)
    print(f"✅ Generated {len(df)} orders and saved to {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate delivery orders for IntelliLog-AI")
    parser.add_argument("--out", default="data/raw_orders.csv", help="Output CSV path")
    parser.add_argument("--n", type=int, default=1000, help="Number of records to generate")
    args = parser.parse_args()
    main(out_path=args.out, n=args.n)
