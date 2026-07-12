#!/usr/bin/env python3
"""
Generate synthetic historical delivery data for ML training.

This script must be run before `python -m src.ml.train` on a fresh clone,
since the historical_deliveries.parquet file is not committed to the repository.

Usage:
    python scripts/generate_training_data.py
    python scripts/generate_training_data.py --records 5000 --seed 42 --output data/historical_deliveries.parquet

The data/ directory is created automatically if it does not exist.
The output is deterministic for a given --seed, so CI runs are reproducible.
"""

import argparse
import sys
from pathlib import Path

# Allow running from the repo root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.simulator.delivery_simulator import DeliverySimulator


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic historical delivery data for ML training"
    )
    parser.add_argument(
        "--records",
        type=int,
        default=2000,
        help="Number of delivery records to generate (default: 2000; use 10000 for production quality)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    parser.add_argument(
        "--output",
        default="data/historical_deliveries.parquet",
        help="Output path for the parquet file (default: data/historical_deliveries.parquet)",
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Generating {args.records} synthetic delivery records (seed={args.seed})...")
    simulator = DeliverySimulator(seed=args.seed, tenant_id="dev-tenant-id")
    df = simulator.generate_historical(num_deliveries=args.records)

    # Validate calibration targets before writing
    late_rate = df["was_late"].mean()
    duration_min = df["actual_duration_minutes"].min()
    duration_max = df["actual_duration_minutes"].max()
    in_range = ((df["actual_duration_minutes"] >= 210) & (df["actual_duration_minutes"] <= 600)).mean()

    print(f"\nCalibration check:")
    print(f"  Late delivery rate: {late_rate:.1%}  (target ~20%)")
    print(f"  Duration range: {duration_min:.0f}-{duration_max:.0f} minutes")
    print(f"  In 3.5-10h range: {in_range:.1%}  (target >50%)")

    if late_rate < 0.10:
        print(f"WARNING: Late delivery rate {late_rate:.1%} is well below 20% target.")
    if in_range < 0.30:
        print(f"WARNING: Only {in_range:.1%} of durations fall in the 3.5-10h range.")

    df.to_parquet(output_path, index=False)
    print(f"\n[OK] Saved {len(df)} records to {output_path}")
    print(f"  Columns: {list(df.columns)}")
    print(f"\nNext step:")
    print(f"  python -m src.ml.train --data {output_path} --trials 10 --no-mlflow")


if __name__ == "__main__":
    main()
