"""
Calibration evaluation utilities for ETA predictor

Provides functions to:
- Evaluate calibration quality on holdout test set
- Generate calibration curves
- Export calibration metrics for monitoring
- Compare calibration across models/versions
"""

import numpy as np
import pandas as pd
import json
from typing import Dict, Any, Tuple, List, Optional
from pathlib import Path


def evaluate_model_calibration(
    y_true: np.ndarray,
    predictions: Dict[str, np.ndarray],
    tolerance_minutes: float = 5.0,
    confidence_buckets: Optional[List[Tuple[float, float]]] = None,
) -> Dict[str, Any]:
    """
    Comprehensive calibration evaluation.
    
    Args:
        y_true: Ground truth values
        predictions: Dict with keys 'p10', 'p50', 'p90', 'confidence'
        tolerance_minutes: Error tolerance for "within tolerance" metric
        confidence_buckets: List of (lower, upper) confidence ranges
    
    Returns:
        Dictionary with calibration metrics
    """
    if confidence_buckets is None:
        confidence_buckets = [
            (0.5, 0.6), (0.6, 0.7), (0.7, 0.8), 
            (0.8, 0.9), (0.9, 1.0)
        ]
    
    p50 = predictions['p50']
    p90 = predictions['p90']
    p10 = predictions['p10']
    confidence = predictions.get('confidence_within_5min', predictions.get('confidence'))
    if confidence is None:
        raise ValueError("Predictions must include 'confidence_within_5min' or 'confidence'")
    
    # Compute key metrics
    errors = np.abs(y_true - p50)
    
    # Within tolerance
    within_tolerance = (errors <= tolerance_minutes).astype(float)
    tolerance_accuracy = float(np.mean(within_tolerance))
    
    # Prediction interval contains actual
    interval_coverage = (
        (p10 <= y_true) & (y_true <= p90)
    ).astype(float)
    interval_coverage_rate = float(np.mean(interval_coverage))
    
    # Calibration by bucket
    bucket_analysis = {}
    avg_calibration_error = 0.0
    bucket_count = 0
    
    for lower, upper in confidence_buckets:
        mask = (confidence >= lower) & (confidence < upper)
        
        if mask.sum() > 0:
            # What fraction of predictions in this bucket are within tolerance?
            bucket_accuracy = float(np.mean(within_tolerance[mask]))
            bucket_count_n = int(mask.sum())
            
            # Stated confidence (midpoint of bucket)
            stated_conf = (lower + upper) / 2.0
            
            # Calibration error: difference between stated and actual
            cal_error = np.abs(bucket_accuracy - stated_conf)
            
            bucket_analysis[f"{lower:.1f}_{upper:.1f}"] = {
                "count": bucket_count_n,
                "stated_confidence": float(stated_conf),
                "actual_accuracy": float(bucket_accuracy),
                "calibration_error": float(cal_error),
                "percentage_of_total": float(bucket_count_n / len(y_true) * 100)
            }
            
            avg_calibration_error += cal_error * bucket_count_n
            bucket_count += bucket_count_n
    
    # Expected Calibration Error (ECE)
    ece = float(avg_calibration_error / len(y_true)) if len(y_true) > 0 else 0.0
    
    # Maximum Calibration Error
    mce = max(
        [v['calibration_error'] for v in bucket_analysis.values()],
        default=0.0
    )
    
    # Interval width statistics
    interval_width = p90 - p10
    
    return {
        'error_metrics': {
            'mae': float(np.mean(errors)),
            'rmse': float(np.sqrt(np.mean(errors ** 2))),
            'median_error': float(np.median(errors)),
            'std_error': float(np.std(errors)),
            'p90_error': float(np.percentile(errors, 90)),
        },
        'tolerance_metrics': {
            f'accuracy_within_{tolerance_minutes}min': float(tolerance_accuracy),
            'predictions_within_tolerance': int(within_tolerance.sum()),
            'total_predictions': len(y_true),
        },
        'interval_metrics': {
            'coverage_rate': float(interval_coverage_rate),
            'mean_interval_width': float(np.mean(interval_width)),
            'median_interval_width': float(np.median(interval_width)),
            'min_interval_width': float(np.min(interval_width)),
            'max_interval_width': float(np.max(interval_width)),
        },
        'calibration_metrics': {
            'expected_calibration_error': float(ece),
            'maximum_calibration_error': float(mce),
            'bucket_analysis': bucket_analysis,
        },
        'summary': {
            'is_well_calibrated': ece < 0.10,
            'calibration_status': _calibration_status(ece),
        }
    }


def _calibration_status(ece: float) -> str:
    """Describe calibration quality based on ECE"""
    if ece < 0.05:
        return "Excellent"
    elif ece < 0.10:
        return "Good"
    elif ece < 0.15:
        return "Fair"
    elif ece < 0.20:
        return "Poor"
    else:
        return "Very Poor"


def compare_model_calibration(
    models_and_predictions: Dict[str, Dict[str, np.ndarray]],
    y_true: np.ndarray,
    tolerance_minutes: float = 5.0,
) -> pd.DataFrame:
    """
    Compare calibration metrics across multiple models.
    
    Args:
        models_and_predictions: Dict[model_name -> predictions dict]
        y_true: Ground truth values
        tolerance_minutes: Error tolerance
    
    Returns:
        DataFrame comparing models
    """
    results = []
    
    for model_name, predictions in models_and_predictions.items():
        metrics = evaluate_model_calibration(
            y_true, predictions, tolerance_minutes
        )
        
        result_row = {
            'model': model_name,
            'ece': metrics['calibration_metrics']['expected_calibration_error'],
            'mce': metrics['calibration_metrics']['maximum_calibration_error'],
            'mae': metrics['error_metrics']['mae'],
            'rmse': metrics['error_metrics']['rmse'],
            f'accuracy_within_{tolerance_minutes}min': (
                metrics['tolerance_metrics'][f'accuracy_within_{tolerance_minutes}min']
            ),
            'interval_coverage': metrics['interval_metrics']['coverage_rate'],
            'mean_interval_width': metrics['interval_metrics']['mean_interval_width'],
        }
        results.append(result_row)
    
    return pd.DataFrame(results).sort_values('ece')


def export_calibration_to_json(
    metrics: Dict[str, Any],
    output_path: Path
) -> None:
    """
    Export calibration metrics to JSON for monitoring/logging.
    
    Args:
        metrics: Metrics dict from evaluate_model_calibration()
        output_path: Path to save JSON file
    """
    # Convert numpy types to native Python types for JSON serialization
    def convert_types(obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, (np.integer, np.floating)):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: convert_types(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_types(item) for item in obj]
        return obj
    
    json_metrics = convert_types(metrics)
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(json_metrics, f, indent=2)


def generate_calibration_curve(
    confidence: np.ndarray,
    actual_within_tolerance: np.ndarray,
    n_bins: int = 10
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate calibration curve points.
    
    Returns:
        (mean_predicted_confidence, empirical_accuracy) for each bin
    """
    bins = np.linspace(0, 1, n_bins + 1)
    bin_centers = (bins[:-1] + bins[1:]) / 2
    
    empirical_accuracies = []
    
    for i in range(n_bins):
        mask = (confidence >= bins[i]) & (confidence < bins[i + 1])
        
        if mask.sum() > 0:
            accuracy = float(np.mean(actual_within_tolerance[mask]))
        else:
            accuracy = 0.5  # Neutral if no samples
        
        empirical_accuracies.append(accuracy)
    
    return bin_centers, np.array(empirical_accuracies)


def detect_calibration_drift(
    recent_metrics: Dict[str, Any],
    baseline_metrics: Dict[str, Any],
    ece_drift_threshold: float = 0.05
) -> Dict[str, Any]:
    """
    Detect if calibration has shifted from baseline.
    
    Args:
        recent_metrics: Current calibration metrics
        baseline_metrics: Baseline/training metrics
        ece_drift_threshold: How much ECE can change before alert
    
    Returns:
        Dictionary with drift analysis
    """
    recent_ece = recent_metrics['calibration_metrics']['expected_calibration_error']
    baseline_ece = baseline_metrics['calibration_metrics']['expected_calibration_error']
    
    ece_delta = recent_ece - baseline_ece
    ece_pct_change = ((recent_ece - baseline_ece) / max(baseline_ece, 0.01)) * 100
    
    # Check accuracy metrics
    recent_acc = recent_metrics['tolerance_metrics'].get('accuracy_within_5min', 0.0)
    baseline_acc = baseline_metrics['tolerance_metrics'].get('accuracy_within_5min', 0.0)
    acc_delta = recent_acc - baseline_acc
    
    drift_detected = np.abs(ece_delta) > ece_drift_threshold
    
    return {
        'ece_drift_detected': bool(drift_detected),
        'ece_baseline': float(baseline_ece),
        'ece_recent': float(recent_ece),
        'ece_change_absolute': float(ece_delta),
        'ece_change_percent': float(ece_pct_change),
        'accuracy_baseline': float(baseline_acc),
        'accuracy_recent': float(recent_acc),
        'accuracy_change': float(acc_delta),
        'alert_level': 'HIGH' if drift_detected else 'NORMAL',
        'recommendation': (
            'Recalibrate model' if drift_detected
            else 'Calibration stable'
        ),
    }


def print_calibration_report(metrics: Dict[str, Any]) -> None:
    """Pretty-print calibration metrics"""
    print("\n" + "=" * 60)
    print("CALIBRATION REPORT")
    print("=" * 60)
    
    # Summary
    print("\nSUMMARY")
    print(f"  Status: {metrics['summary']['calibration_status']}")
    print(f"  ECE: {metrics['calibration_metrics']['expected_calibration_error']:.4f}")
    print(f"  MCE: {metrics['calibration_metrics']['maximum_calibration_error']:.4f}")
    
    # Error Metrics
    print("\nERROR METRICS")
    err = metrics['error_metrics']
    print(f"  MAE: {err['mae']:.2f} minutes")
    print(f"  RMSE: {err['rmse']:.2f} minutes")
    print(f"  Median Error: {err['median_error']:.2f} minutes")
    
    # Tolerance
    print("\nTOLERANCE METRICS")
    tol = metrics['tolerance_metrics']
    print(f"  Accuracy within 5min: {tol['accuracy_within_5min']:.2%}")
    print(f"  {tol['predictions_within_tolerance']}/{tol['total_predictions']} predictions within tolerance")
    
    # Intervals
    print("\nPREDICTION INTERVALS")
    iv = metrics['interval_metrics']
    print(f"  Coverage Rate: {iv['coverage_rate']:.2%}")
    print(f"  Mean Width: {iv['mean_interval_width']:.2f} minutes")
    
    # Bucket Analysis
    print("\nCALIBRATION BY CONFIDENCE BUCKET")
    print("  Confidence Range | Count | Stated | Actual | Error")
    print("  " + "-" * 55)
    
    for bucket_name, bucket_data in metrics['calibration_metrics']['bucket_analysis'].items():
        lower, upper = bucket_name.split('_')
        count = bucket_data['count']
        stated = bucket_data['stated_confidence']
        actual = bucket_data['actual_accuracy']
        error = bucket_data['calibration_error']
        
        print(f"  {lower:>4}-{upper:<4}      | {count:>4} | {stated:.2%}   | {actual:.2%}   | {error:.4f}")
    
    print("\n" + "=" * 60 + "\n")


if __name__ == "__main__":
    # Example usage
    pass
