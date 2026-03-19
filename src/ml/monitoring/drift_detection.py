"""
Simple drift detection utilities for feature distributions.
Uses KS statistic for numeric features and total variation for categorical.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from pathlib import Path
from scipy.stats import ks_2samp


def _ks_test(reference: np.ndarray, current: np.ndarray) -> Dict[str, float]:
    ref = reference[~np.isnan(reference)]
    cur = current[~np.isnan(current)]
    if ref.size == 0 or cur.size == 0:
        return {"statistic": 0.0, "p_value": 1.0}

    ks_result = ks_2samp(ref, cur, method="auto")
    return {"statistic": float(ks_result.statistic), "p_value": float(ks_result.pvalue)}


def _categorical_tv_distance(reference: pd.Series, current: pd.Series) -> float:
    ref_counts = reference.value_counts(normalize=True)
    cur_counts = current.value_counts(normalize=True)

    all_keys = set(ref_counts.index).union(set(cur_counts.index))
    ref = np.array([ref_counts.get(k, 0.0) for k in all_keys])
    cur = np.array([cur_counts.get(k, 0.0) for k in all_keys])

    return float(0.5 * np.sum(np.abs(ref - cur)))


def compute_drift_report(
    reference_df: Optional[pd.DataFrame] = None,
    current_df: Optional[pd.DataFrame] = None,
    numeric_cols: Optional[List[str]] = None,
    categorical_cols: Optional[List[str]] = None,
    ks_alpha: float = 0.05,
    categorical_threshold: float = 0.2,
) -> Dict[str, Any]:
    """Compute drift report using processed training data by default."""
    if reference_df is None or current_df is None:
        data_path = Path("data/processed/training_data_enhanced.csv")
        df = pd.read_csv(data_path)
        df = df.sort_values("order_time")
        split_idx = int(len(df) * 0.7)
        reference_df = df.iloc[:split_idx].copy()
        current_df = df.iloc[split_idx:].copy()

    numeric_cols = numeric_cols or reference_df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = categorical_cols or [
        c for c in reference_df.columns if c not in numeric_cols
    ]

    per_feature: Dict[str, Dict[str, Any]] = {}
    numeric_drift_count = 0
    categorical_drift_count = 0

    for col in numeric_cols:
        if col not in current_df.columns:
            continue
        ks = _ks_test(reference_df[col].to_numpy(), current_df[col].to_numpy())
        is_drifted = ks["p_value"] < ks_alpha
        if is_drifted:
            numeric_drift_count += 1
        per_feature[col] = {
            "type": "numeric",
            "ks_statistic": ks["statistic"],
            "p_value": ks["p_value"],
            "is_drifted": is_drifted,
        }

    for col in categorical_cols:
        if col not in current_df.columns:
            continue
        tv_distance = _categorical_tv_distance(reference_df[col], current_df[col])
        is_drifted = tv_distance >= categorical_threshold
        if is_drifted:
            categorical_drift_count += 1
        per_feature[col] = {
            "type": "categorical",
            "tv_distance": tv_distance,
            "threshold": categorical_threshold,
            "is_drifted": is_drifted,
        }

    drift_scores: List[float] = []
    for feature_result in per_feature.values():
        if feature_result["type"] == "numeric":
            drift_scores.append(float(feature_result["ks_statistic"]))
        else:
            drift_scores.append(float(feature_result["tv_distance"]))

    overall = float(np.mean(drift_scores)) if drift_scores else 0.0
    drifted_feature_count = numeric_drift_count + categorical_drift_count

    return {
        "overall_drift_score": overall,
        "per_feature": per_feature,
        "ks_alpha": ks_alpha,
        "categorical_threshold": categorical_threshold,
        "numeric_drift_count": numeric_drift_count,
        "categorical_drift_count": categorical_drift_count,
        "drifted_feature_count": drifted_feature_count,
        "reference_samples": len(reference_df),
        "current_samples": len(current_df),
    }


def should_retrain(
    drift_report: Dict[str, Any],
    threshold: float,
    min_drifted_features: int = 1,
) -> bool:
    """Decide retraining using score threshold and number of drifted features."""
    drift_score = float(drift_report.get("overall_drift_score", 0.0))
    drifted_feature_count = int(drift_report.get("drifted_feature_count", 0))
    return drift_score >= threshold or drifted_feature_count >= min_drifted_features
