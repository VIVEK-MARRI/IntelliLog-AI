"""
Simple drift detection utilities for feature distributions.
Uses KS statistic for numeric features and total variation for categorical.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from pathlib import Path


def _ks_statistic(reference: np.ndarray, current: np.ndarray) -> float:
    ref = reference[~np.isnan(reference)]
    cur = current[~np.isnan(current)]
    if ref.size == 0 or cur.size == 0:
        return 0.0

    ref = np.sort(ref)
    cur = np.sort(cur)
    values = np.unique(np.concatenate([ref, cur]))

    ref_cdf = np.searchsorted(ref, values, side="right") / ref.size
    cur_cdf = np.searchsorted(cur, values, side="right") / cur.size

    return float(np.max(np.abs(ref_cdf - cur_cdf)))


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

    per_feature = {}

    for col in numeric_cols:
        if col not in current_df.columns:
            continue
        per_feature[col] = _ks_statistic(reference_df[col].to_numpy(), current_df[col].to_numpy())

    for col in categorical_cols:
        if col not in current_df.columns:
            continue
        per_feature[col] = _categorical_tv_distance(reference_df[col], current_df[col])

    drift_scores = list(per_feature.values())
    overall = float(np.mean(drift_scores)) if drift_scores else 0.0

    return {
        "overall_drift_score": overall,
        "per_feature": per_feature,
        "reference_samples": len(reference_df),
        "current_samples": len(current_df),
    }


def should_retrain(drift_score: float, threshold: float) -> bool:
    return drift_score >= threshold
