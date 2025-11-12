"""
🚀 IntelliLog-AI — Feature Engineering Pipeline (v3.2)

Responsibilities:
-----------------
- Prepare input data for XGBoost model (training & inference)
- Handle categorical encoding, time-based extraction, and feature interactions
- Provide consistent preprocessing between API and model training
- Automatically handle missing or malformed data safely

Author: Vivek Marri
Project: IntelliLog-AI
Version: 3.2.0
"""

import os
import pandas as pd
from sklearn.model_selection import train_test_split

# -----------------------------------------------------------
# VALIDATION
# -----------------------------------------------------------
def validate_columns(df: pd.DataFrame):
    """Ensure all required columns exist."""
    expected = {"distance_km", "traffic", "weather", "order_type"}
    missing = expected - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in input data: {missing}")

# -----------------------------------------------------------
# FEATURE ENGINEERING PIPELINE
# -----------------------------------------------------------
def build_features(df: pd.DataFrame):
    """
    Feature engineering pipeline for IntelliLog-AI.

    Works for both:
        • Training (includes target column 'delivery_time_min')
        • Inference (without target)

    Returns:
        (df_transformed, feature_list, target_column)
    """
    df = df.copy()

    # Validate expected base columns
    validate_columns(df)

    # Ensure order_time column exists
    if "order_time" not in df.columns or df["order_time"].isnull().all():
        df["order_time"] = pd.Timestamp.now()

    # Parse datetime safely
    df["order_time"] = pd.to_datetime(df["order_time"], errors="coerce").fillna(pd.Timestamp.now())

    # Extract time-based features
    df["hour"] = df["order_time"].dt.hour.astype(int)
    df["day_of_week"] = df["order_time"].dt.dayofweek.astype(int)

    # Encode categorical columns
    df["traffic_enc"] = df["traffic"].map({"low": 0, "medium": 1, "high": 2}).fillna(1).astype(int)
    df["weather_enc"] = df["weather"].map({"clear": 0, "rain": 1, "storm": 2}).fillna(0).astype(int)
    df["order_type_enc"] = df["order_type"].map({"normal": 0, "express": 1}).fillna(0).astype(int)

    # Interaction features
    df["dist_x_traffic"] = df["distance_km"] * (1 + 0.3 * df["traffic_enc"])
    df["dist_x_hour"] = df["distance_km"] * (1 + 0.1 * df["hour"] / 24)
    df["traffic_x_weather"] = df["traffic_enc"] * df["weather_enc"]

    # Final feature list (used for training + inference)
    features = [
        "distance_km",
        "hour",
        "day_of_week",
        "traffic_enc",
        "weather_enc",
        "order_type_enc",
        "dist_x_traffic",
        "dist_x_hour",
        "traffic_x_weather",
    ]

    # Target (for supervised training)
    target = "delivery_time_min" if "delivery_time_min" in df.columns else None

    return df, features, target

# -----------------------------------------------------------
# DATA PIPELINE (TRAIN/VALIDATION SPLIT)
# -----------------------------------------------------------
def main(input_csv: str = "data/raw_orders.csv", out_dir: str = "data/processed"):
    """
    CLI utility for preprocessing training data.
    Splits data into train/validation CSVs for model training.
    """
    os.makedirs(out_dir, exist_ok=True)

    df = pd.read_csv(input_csv)
    df, features, target = build_features(df)

    train_df, val_df = train_test_split(df, test_size=0.2, random_state=42)

    train_df.to_csv(f"{out_dir}/train.csv", index=False)
    val_df.to_csv(f"{out_dir}/val.csv", index=False)

    print(f"✅ Saved processed data → {out_dir}/train.csv, {out_dir}/val.csv")
    print(f"Features Used → {features}")
    print(f"Target Column → {target or 'None (inference mode)'}")

# -----------------------------------------------------------
# MAIN ENTRY
# -----------------------------------------------------------
if __name__ == "__main__":
    main()
