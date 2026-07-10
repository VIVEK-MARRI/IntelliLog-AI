#!/usr/bin/env python3
"""
Generate historical delivery data for ML training.

Creates 10,000 realistic delivery records with ~20% late deliveries
and saves to data/historical_deliveries.parquet
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from simulator.delivery_simulator import DeliverySimulator

def main():
    """Generate and save historical deliveries."""
    print("Generating 10,000 historical delivery records...")
    
    simulator = DeliverySimulator(seed=42)
    df = simulator.generate_historical(num_deliveries=10000)
    
    # Verify statistics
    late_count = df['was_late'].sum()
    late_rate = late_count / len(df)
    
    print(f"\nGenerated {len(df)} deliveries")
    print(f"Late deliveries: {late_count} ({late_rate:.1%})")
    print(f"On-time deliveries: {len(df) - late_count} ({1 - late_rate:.1%})")
    
    # Check for NaN values
    nan_counts = df.isna().sum()
    if nan_counts.any():
        print("\nWarning: NaN values found:")
        print(nan_counts[nan_counts > 0])
    else:
        print("\nNo NaN values found ✓")
    
    # Print sample statistics
    print("\nSample Statistics:")
    print(f"  Distance (km): {df['distance_km'].mean():.1f} ± {df['distance_km'].std():.1f}")
    print(f"  Actual duration (min): {df['actual_duration_minutes'].mean():.1f} ± {df['actual_duration_minutes'].std():.1f}")
    print(f"  Avg speed (km/h): {df['avg_speed_kmh'].mean():.1f} ± {df['avg_speed_kmh'].std():.1f}")
    print(f"  Delay (min): {df['delay_minutes'].mean():.1f} ± {df['delay_minutes'].std():.1f}")
    print(f"  Stops per delivery: {df['planned_stops'].mean():.1f}")
    print(f"  Stop dwell (min): {df['stop_dwell_time_avg_minutes'].mean():.1f}")
    print(f"  Weather - Clear: {(df['weather_condition'] == 'clear').sum()}")
    print(f"  Weather - Rain: {(df['weather_condition'] == 'rain').sum()}")
    print(f"  Weather - Heavy Rain: {(df['weather_condition'] == 'heavy_rain').sum()}")
    
    # Save to parquet
    output_path = Path(__file__).parent / "data" / "historical_deliveries.parquet"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    
    print(f"\nSaved to {output_path}")

if __name__ == "__main__":
    main()
