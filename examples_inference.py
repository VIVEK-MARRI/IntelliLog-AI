"""
Example: Using the PredictionService in production.

This script demonstrates how to:
1. Load a trained model
2. Build features from live data
3. Make predictions with SHAP explanations
4. Handle high-risk deliveries
"""

import json
from pathlib import Path
from typing import Any

from src.ml.feature_engineering import FeatureBuilder
from src.ml.inference import PredictionService


def example_basic_prediction():
    """Example 1: Basic prediction without SHAP."""
    print("=" * 80)
    print("Example 1: Basic Prediction (Fast)")
    print("=" * 80)
    
    # Initialize service
    service = PredictionService(model_dir="models/")
    
    # Create mock live order state
    order_state = {
        "order_id": "order-NYC-5849",
        "planned_stops": 12,
        "completed_stops": 6,
        "planned_duration_minutes": 360.0,
        "actual_duration_so_far_minutes": 180.0,
        "stops_remaining": 6,
        "eta_minutes_remaining": 180.0,
        "speed": 35.0,
        "deviation_meters": 200.0,
        "hour_of_day": 14,
        "day_of_week": 3,
    }
    
    driver_stats = {
        "driver_on_time_rate": 0.85,
    }
    
    # Build features
    builder = FeatureBuilder()
    features = builder.build_from_live(order_state, driver_stats)
    
    # Make prediction
    result = service.predict("order-NYC-5849", features)
    
    print(f"Order ID: {result.order_id}")
    print(f"Risk Score: {result.risk_score:.4f}")
    print(f"Is High Risk: {result.is_high_risk}")
    print(f"Confidence: {result.confidence}")
    print(f"Predicted Delay: {result.predicted_delay_minutes:.1f} minutes")
    print(f"Inference Time: {result.inference_latency_ms:.2f}ms")
    print()


def example_prediction_with_shap():
    """Example 2: Prediction with SHAP explanations."""
    print("=" * 80)
    print("Example 2: Prediction with SHAP Explanations")
    print("=" * 80)
    
    service = PredictionService(model_dir="models/")
    builder = FeatureBuilder()
    
    # Scenario: High-risk delivery (behind schedule)
    order_state = {
        "order_id": "order-LA-2234",
        "planned_stops": 15,
        "completed_stops": 5,
        "planned_duration_minutes": 480.0,
        "actual_duration_so_far_minutes": 300.0,  # Running behind
        "stops_remaining": 10,
        "eta_minutes_remaining": 200.0,  # Less time than needed
        "speed": 25.0,  # Below average
        "deviation_meters": 500.0,  # High deviation
        "hour_of_day": 16,  # Peak hours
        "day_of_week": 2,  # Tuesday
    }
    
    driver_stats = {
        "driver_on_time_rate": 0.65,  # Below average driver
    }
    
    features = builder.build_from_live(order_state, driver_stats)
    result = service.predict_with_shap("order-LA-2234", features)
    
    print(f"Order ID: {result.order_id}")
    print(f"Risk Score: {result.risk_score:.4f}")
    print(f"Is High Risk: {result.is_high_risk}")
    print(f"Confidence: {result.confidence}")
    print(f"Predicted Delay: {result.predicted_delay_minutes:.1f} minutes")
    print()
    
    # Show top risk factors
    if result.top_risk_factors:
        print("Top Risk Factors:")
        for i, factor in enumerate(result.top_risk_factors, 1):
            print(f"  {i}. {factor['feature']}")
            print(f"     Value: {factor['value']:.4f}")
            print(f"     SHAP Impact: {factor['contribution']:.4f}")
            print(f"     Direction: {factor['direction']}")
    print()


def example_batch_predictions():
    """Example 3: Batch predictions for a fleet."""
    print("=" * 80)
    print("Example 3: Batch Predictions for Fleet")
    print("=" * 80)
    
    service = PredictionService(model_dir="models/")
    builder = FeatureBuilder()
    
    # Mock fleet of 5 orders
    fleet = [
        {
            "order_id": "order-1",
            "state": {
                "planned_stops": 10,
                "completed_stops": 8,
                "planned_duration_minutes": 300.0,
                "actual_duration_so_far_minutes": 240.0,
                "stops_remaining": 2,
                "eta_minutes_remaining": 60.0,
                "speed": 40.0,
                "deviation_meters": 50.0,
                "hour_of_day": 15,
                "day_of_week": 3,
            },
            "driver_otr": 0.90,
        },
        {
            "order_id": "order-2",
            "state": {
                "planned_stops": 15,
                "completed_stops": 4,
                "planned_duration_minutes": 400.0,
                "actual_duration_so_far_minutes": 250.0,
                "stops_remaining": 11,
                "eta_minutes_remaining": 160.0,
                "speed": 20.0,
                "deviation_meters": 800.0,
                "hour_of_day": 16,
                "day_of_week": 5,
            },
            "driver_otr": 0.60,
        },
        {
            "order_id": "order-3",
            "state": {
                "planned_stops": 8,
                "completed_stops": 7,
                "planned_duration_minutes": 240.0,
                "actual_duration_so_far_minutes": 220.0,
                "stops_remaining": 1,
                "eta_minutes_remaining": 20.0,
                "speed": 45.0,
                "deviation_meters": 30.0,
                "hour_of_day": 14,
                "day_of_week": 2,
            },
            "driver_otr": 0.95,
        },
    ]
    
    # Make predictions
    high_risk_orders = []
    
    print("Fleet Status:")
    print("-" * 80)
    
    for order_info in fleet:
        order_state = {
            "order_id": order_info["order_id"],
            **order_info["state"],
        }
        
        driver_stats = {"driver_on_time_rate": order_info["driver_otr"]}
        
        features = builder.build_from_live(order_state, driver_stats)
        result = service.predict(order_info["order_id"], features)
        
        status = "HIGH RISK ⚠️" if result.is_high_risk else "ON TRACK ✓"
        
        print(f"{result.order_id:12} | Risk: {result.risk_score:6.2%} | {status}")
        
        if result.is_high_risk:
            high_risk_orders.append(result)
    
    print("-" * 80)
    print(f"Summary: {len(high_risk_orders)} high-risk deliveries detected")
    print()
    
    # Alert dispatcher
    if high_risk_orders:
        print("DISPATCHER ALERT:")
        for result in high_risk_orders:
            print(f"  - {result.order_id}: {result.risk_score:.1%} delay probability")
    print()


def example_load_metadata():
    """Example 4: Inspect model metadata."""
    print("=" * 80)
    print("Example 4: Model Metadata")
    print("=" * 80)
    
    metadata_path = Path("models/training_metadata.json")
    
    with open(metadata_path) as f:
        metadata = json.load(f)
    
    print("Training Date:", metadata["training_date"])
    print("Training Records:", f"{metadata['n_train']:,}")
    print("Test Records:", f"{metadata['n_test']:,}")
    print("Train Positive Rate:", f"{metadata['train_positive_rate']:.1%}")
    print("Test Positive Rate:", f"{metadata['test_positive_rate']:.1%}")
    print()
    
    print("Model Performance:")
    metrics = metadata["metrics"]
    for metric, value in metrics.items():
        print(f"  {metric}: {value:.4f}")
    print()
    
    print("Top 5 Most Important Features:")
    for i, feature in enumerate(metadata["top_5_features"], 1):
        print(f"  {i}. {feature['feature']}: {feature['shap_value']:.4f}")
    print()


def main():
    """Run all examples."""
    print("\n")
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 20 + "IntelliLog-AI Delay Prediction Examples" + " " * 20 + "║")
    print("╚" + "=" * 78 + "╝")
    print()
    
    example_basic_prediction()
    example_prediction_with_shap()
    example_batch_predictions()
    example_load_metadata()
    
    print("=" * 80)
    print("All examples completed successfully!")
    print("=" * 80)


if __name__ == "__main__":
    main()
