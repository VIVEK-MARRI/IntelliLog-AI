import pandas as pd
import os
from sklearn.model_selection import train_test_split

def validate_columns(df):
    expected = {"order_time", "distance_km", "traffic", "weather", "order_type", "delivery_time_min"}
    missing = expected - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in input data: {missing}")

def build_features(df: pd.DataFrame):
    """Feature engineering pipeline for IntelliLog-AI."""
    validate_columns(df)
    df = df.copy()
    if not pd.api.types.is_datetime64_any_dtype(df["order_time"]):
        df["order_time"] = pd.to_datetime(df["order_time"])

    df["hour"] = df["order_time"].dt.hour
    df["day_of_week"] = df["order_time"].dt.dayofweek
    df["traffic_enc"] = df["traffic"].map({"low":0,"medium":1,"high":2})
    df["weather_enc"] = df["weather"].map({"clear":0,"rain":1,"storm":2})
    df["order_type_enc"] = df["order_type"].map({"normal":0,"express":1})
    df["dist_x_traffic"] = df["distance_km"] * (1 + 0.3 * df["traffic_enc"])

    features = [
        "distance_km","hour","day_of_week",
        "traffic_enc","weather_enc","order_type_enc","dist_x_traffic"
    ]
    target = "delivery_time_min"
    return df, features, target


def main(input_csv="data/raw_orders.csv", out_dir="data/processed"):
    os.makedirs(out_dir, exist_ok=True)
    df = pd.read_csv(input_csv)
    df, features, target = build_features(df)
    train_df, val_df = train_test_split(df, test_size=0.2, random_state=42)
    train_df.to_csv(f"{out_dir}/train.csv", index=False)
    val_df.to_csv(f"{out_dir}/val.csv", index=False)
    print(f"✅ Saved processed data → {out_dir}/train.csv, {out_dir}/val.csv")
    print("Features:", features)
    print("Target:", target)

if __name__ == "__main__":
    main()
