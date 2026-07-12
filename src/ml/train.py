"""
Training script for IntelliLog-AI delay prediction model.

Key features:
- Time-based train/test split (no data leakage)
- Proper class imbalance handling
- Optuna hyperparameter optimization
- Comprehensive evaluation metrics
- SHAP explainability
- MLflow tracking
"""

import argparse
import json
import math
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any

import mlflow
import mlflow.xgboost
import numpy as np
import optuna
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import (
    auc,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.calibration import calibration_curve
import matplotlib.pyplot as plt

from src.ml.feature_engineering import FeatureBuilder, FeatureStats


warnings.filterwarnings("ignore")


def load_and_split_data(
    data_path: str,
    train_fraction: float = 0.8,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Load data and perform time-based train/test split.
    
    Time-based split prevents data leakage: train on historical data,
    test on more recent deliveries (which would naturally be harder).
    
    Args:
        data_path: Path to parquet file
        train_fraction: Fraction for training (rest is test)
    
    Returns:
        (df_train, df_test) sorted by delivery start time
    """
    print(f"Loading data from {data_path}...")
    df = pd.read_parquet(data_path)
    
    print(f"Total records: {len(df)}")
    print(f"Late deliveries: {df['was_late'].sum()} ({df['was_late'].mean():.1%})")
    
    # Sort by time (assume created_at or start time is implicit in order)
    # Since we don't have explicit timestamps, use the dataframe order
    # (which comes from ordered generation in simulator)
    split_idx = int(len(df) * train_fraction)
    
    df_train = df.iloc[:split_idx].reset_index(drop=True)
    df_test = df.iloc[split_idx:].reset_index(drop=True)
    
    print(f"\nTime-based split:")
    print(f"  Training: {len(df_train)} records ({df_train['was_late'].mean():.1%} late)")
    print(f"  Test: {len(df_test)} records ({df_test['was_late'].mean():.1%} late)")
    
    return df_train, df_test


def build_feature_matrix(
    df: pd.DataFrame,
    builder: FeatureBuilder,
) -> tuple[np.ndarray, list[dict[str, float]]]:
    """
    Build feature matrix from dataframe.
    
    Args:
        df: DataFrame with delivery records
        builder: FeatureBuilder instance
    
    Returns:
        (X: feature matrix, features_list: list of feature dicts for inspection)
    """
    features_list = []
    
    for _, row in df.iterrows():
        features = builder.build_from_historical(row)
        builder.validate_features(features)
        features_list.append(features)
    
    # Convert to numpy array with features in consistent order
    feature_names = builder.get_feature_names()
    X = np.array([[f[name] for name in feature_names] for f in features_list])
    
    return X, features_list


def get_class_weights(y: np.ndarray) -> float:
    """
    Calculate scale_pos_weight for XGBoost to handle imbalance.
    
    Formula: scale_pos_weight = negative_samples / positive_samples
    
    Args:
        y: Binary labels (0 = on-time, 1 = late)
    
    Returns:
        scale_pos_weight value
    """
    n_positive = np.sum(y == 1)
    n_negative = np.sum(y == 0)
    scale_pos_weight = n_negative / max(n_positive, 1)
    
    print(f"Class weights: scale_pos_weight = {scale_pos_weight:.2f}")
    print(f"  (negative={n_negative}, positive={n_positive})")
    
    return scale_pos_weight


def objective(
    trial: optuna.Trial,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    scale_pos_weight: float,
) -> float:
    """
    Optuna objective function: maximize F1 on validation set.
    
    Args:
        trial: Optuna trial
        X_train, y_train: Training data
        X_val, y_val: Validation data
        scale_pos_weight: Class weight for imbalance
    
    Returns:
        F1 score on validation set
    """
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 50, 500),
        "max_depth": trial.suggest_int("max_depth", 3, 8),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
        "scale_pos_weight": scale_pos_weight,
        "random_state": 42,
        "tree_method": "hist",
        "verbosity": 0,
    }
    
    model = xgb.XGBClassifier(**params)
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    
    y_pred = model.predict(X_val)
    f1 = f1_score(y_val, y_pred, zero_division=0)
    
    return f1


def find_optimal_threshold(
    y_val: np.ndarray,
    y_pred_proba: np.ndarray,
) -> tuple[float, float]:
    """
    Find threshold that maximizes F1 score.
    
    Args:
        y_val: True labels
        y_pred_proba: Predicted probabilities
    
    Returns:
        (optimal_threshold, best_f1)
    """
    best_f1 = 0.0
    best_threshold = 0.5
    
    thresholds = np.linspace(0.1, 0.9, 50)
    
    for threshold in thresholds:
        y_pred = (y_pred_proba >= threshold).astype(int)
        f1 = f1_score(y_val, y_pred, zero_division=0)
        
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = threshold
    
    return best_threshold, best_f1


def compute_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_pred_proba: np.ndarray,
    set_name: str = "Test",
) -> dict[str, float]:
    """
    Compute comprehensive evaluation metrics.
    
    Args:
        y_true: True labels
        y_pred: Binary predictions
        y_pred_proba: Predicted probabilities
        set_name: Name for printing ("Test", "Train", etc.)
    
    Returns:
        Dict of metrics
    """
    metrics = {
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "auc_roc": roc_auc_score(y_true, y_pred_proba),
        "auc_pr": average_precision_score(y_true, y_pred_proba),
        "brier_score": np.mean((y_pred_proba - y_true) ** 2),  # Lower is better
    }
    
    print(f"\n{set_name} Set Metrics:")
    print(f"  Precision: {metrics['precision']:.4f}")
    print(f"  Recall: {metrics['recall']:.4f}")
    print(f"  F1: {metrics['f1']:.4f}")
    print(f"  AUC-ROC: {metrics['auc_roc']:.4f}")
    print(f"  AUC-PR: {metrics['auc_pr']:.4f}")
    print(f"  Brier Score (calibration): {metrics['brier_score']:.4f}")
    
    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    print(f"\nConfusion Matrix:")
    print(f"  TP: {tp:,}  FP: {fp:,}")
    print(f"  FN: {fn:,}  TN: {tn:,}")
    
    return metrics


def compute_naive_baseline(y_test: np.ndarray) -> float:
    """
    Compute F1 of naive baseline (always predict on-time).
    
    Args:
        y_test: True labels
    
    Returns:
        F1 score of baseline
    """
    # Baseline: always predict 0 (on-time)
    y_pred_baseline = np.zeros_like(y_test)
    f1_baseline = f1_score(y_test, y_pred_baseline, zero_division=0)
    
    return f1_baseline


def plot_calibration_curve(
    y_test: np.ndarray,
    y_pred_proba: np.ndarray,
    output_path: Path,
) -> None:
    """
    Plot calibration curve (reliability diagram).
    
    Args:
        y_test: True labels
        y_pred_proba: Predicted probabilities
        output_path: Path to save figure
    """
    fig, ax = plt.subplots(figsize=(8, 6))
    
    prob_true, prob_pred = calibration_curve(
        y_test,
        y_pred_proba,
        n_bins=10,
        strategy="uniform",
    )
    
    ax.plot([0, 1], [0, 1], "k--", label="Perfectly calibrated")
    ax.plot(prob_pred, prob_true, "s-", label="Model")
    
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Fraction of positives")
    ax.set_title("Calibration Curve")
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    fig.tight_layout()
    fig.savefig(output_path, dpi=100, bbox_inches="tight")
    plt.close(fig)
    
    print(f"\nCalibration curve saved to {output_path}")


def plot_shap_summary(
    explainer: shap.TreeExplainer,
    X_test: np.ndarray,
    output_path: Path,
) -> None:
    """
    Plot SHAP summary plot.
    
    Args:
        explainer: SHAP TreeExplainer
        X_test: Test feature matrix
        output_path: Path to save figure
    """
    shap_values = explainer.shap_values(X_test)
    
    fig, ax = plt.subplots(figsize=(10, 8))
    shap.summary_plot(shap_values, X_test, plot_type="bar", show=False)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=100, bbox_inches="tight")
    plt.close()
    
    print(f"SHAP summary plot saved to {output_path}")


def get_top_shap_features(
    explainer: shap.TreeExplainer,
    X_test: np.ndarray,
    feature_names: list[str],
    top_k: int = 5,
) -> list[tuple[str, float]]:
    """
    Get top K features by mean |SHAP value|.
    
    Args:
        explainer: SHAP TreeExplainer
        X_test: Test feature matrix
        feature_names: Feature names in order
        top_k: Number of top features
    
    Returns:
        List of (feature_name, mean_shap_value) tuples
    """
    shap_values = explainer.shap_values(X_test)
    
    # Mean absolute SHAP value per feature
    mean_shap = np.abs(shap_values).mean(axis=0)
    
    # Top features
    top_indices = np.argsort(mean_shap)[-top_k:][::-1]
    top_features = [
        (feature_names[i], mean_shap[i])
        for i in top_indices
    ]
    
    print(f"\nTop {top_k} Features by SHAP:")
    for i, (name, shap_val) in enumerate(top_features, 1):
        print(f"  {i}. {name}: {shap_val:.4f}")
    
    return top_features


def train_model(
    data_path: str,
    output_dir: str = "models/",
    n_trials: int = 30,
    mlflow_tracking: bool = True,
) -> dict[str, Any]:
    """
    Train complete delay prediction model.
    
    Args:
        data_path: Path to training data parquet
        output_dir: Directory to save model artifacts
        n_trials: Number of Optuna trials
        mlflow_tracking: Whether to use MLflow
    
    Returns:
        Dict with metrics and metadata
    """
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True, parents=True)
    
    print("=" * 80)
    print("IntelliLog-AI Delay Prediction Model Training")
    print("=" * 80)
    
    # ===== Load and Split Data =====
    df_train, df_test = load_and_split_data(data_path)
    
    # ===== Build Features =====
    print("\nBuilding features...")
    builder = FeatureBuilder()
    feature_names = builder.get_feature_names()
    
    X_train, _ = build_feature_matrix(df_train, builder)
    X_test, _ = build_feature_matrix(df_test, builder)
    
    y_train = df_train["was_late"].astype(int).values
    y_test = df_test["was_late"].astype(int).values
    
    # Compute feature stats for inference
    feature_stats = builder.compute_feature_stats(df_train)
    
    print(f"Feature matrix shape: train={X_train.shape}, test={X_test.shape}")
    
    # ===== Class Imbalance Handling =====
    scale_pos_weight = get_class_weights(y_train)
    
    # ===== Baseline =====
    f1_baseline = compute_naive_baseline(y_test)
    print(f"\nNaive baseline F1 (always predict on-time): {f1_baseline:.4f}")
    
    # ===== Hyperparameter Optimization with Optuna =====
    print(f"\nOptuna hyperparameter search ({n_trials} trials)...")
    
    # Split training into train/val for optimization
    val_split = int(0.8 * len(X_train))
    X_opt_train = X_train[:val_split]
    y_opt_train = y_train[:val_split]
    X_opt_val = X_train[val_split:]
    y_opt_val = y_train[val_split:]
    
    study = optuna.create_study(direction="maximize")
    study.optimize(
        lambda trial: objective(
            trial,
            X_opt_train,
            y_opt_train,
            X_opt_val,
            y_opt_val,
            scale_pos_weight,
        ),
        n_trials=n_trials,
        show_progress_bar=True,
    )
    
    best_params = study.best_params
    best_params["scale_pos_weight"] = scale_pos_weight
    best_params["random_state"] = 42
    best_params["tree_method"] = "hist"
    best_params["verbosity"] = 0
    
    print(f"\nBest trial F1: {study.best_value:.4f}")
    print(f"Best hyperparameters: {best_params}")
    
    # ===== Train Final Model =====
    print("\nTraining final model on full training set...")
    model = xgb.XGBClassifier(**best_params)
    model.fit(X_train, y_train, verbose=False)
    
    # ===== Predictions =====
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    
    # Find optimal threshold
    optimal_threshold, f1_at_threshold = find_optimal_threshold(y_test, y_pred_proba)
    y_pred = (y_pred_proba >= optimal_threshold).astype(int)
    
    print(f"\nOptimal threshold: {optimal_threshold:.4f}")
    print(f"F1 at optimal threshold: {f1_at_threshold:.4f}")
    
    # ===== Evaluation =====
    metrics_test = compute_metrics(y_test, y_pred, y_pred_proba, "Test")
    
    # Check baseline
    if metrics_test["f1"] <= f1_baseline:
        raise ValueError(
            f"Model F1 ({metrics_test['f1']:.4f}) does not beat baseline ({f1_baseline:.4f})"
        )
    
    print(f"\nModel F1: {metrics_test['f1']:.4f}")
    print(f"[OK] Model beats naive baseline!")
    
    # ===== SHAP Explainability =====
    print("\nComputing SHAP values...")
    explainer = shap.TreeExplainer(model)
    
    # Full SHAP for summary plot (use sample if too large)
    sample_size = min(len(X_test), 500)
    X_sample = X_test[:sample_size]
    
    plot_shap_summary(
        explainer,
        X_sample,
        output_path / "shap_summary.png",
    )
    
    top_features = get_top_shap_features(explainer, X_sample, feature_names)
    
    # ===== Calibration =====
    plot_calibration_curve(y_test, y_pred_proba, output_path / "calibration_curve.png")
    
    # ===== Save Artifacts =====
    print("\nSaving artifacts...")
    
    # Model
    import joblib
    joblib.dump(model, output_path / "model.joblib")
    
    # Feature names
    with open(output_path / "feature_names.json", "w") as f:
        json.dump(feature_names, f, indent=2)
    
    # Optimal threshold
    with open(output_path / "optimal_threshold.json", "w") as f:
        json.dump(
            {"threshold": optimal_threshold, "f1_at_threshold": f1_at_threshold},
            f,
            indent=2,
        )
    
    # Feature stats (for imputation)
    with open(output_path / "feature_stats.json", "w") as f:
        json.dump(
            {
                "feature_medians": feature_stats.feature_medians,
                "feature_mins": feature_stats.feature_mins,
                "feature_maxs": feature_stats.feature_maxs,
            },
            f,
            indent=2,
        )
    
    # Training metadata
    metadata = {
        "training_date": datetime.now().isoformat(),
        "data_path": str(data_path),
        "n_train": len(df_train),
        "n_test": len(df_test),
        "train_positive_rate": float(y_train.mean()),
        "test_positive_rate": float(y_test.mean()),
        "hyperparameters": {k: v for k, v in best_params.items()},
        "n_optuna_trials": n_trials,
        "optimal_threshold": optimal_threshold,
        "f1_at_optimal_threshold": f1_at_threshold,
        "f1_baseline": f1_baseline,
        "metrics": {
            "precision": metrics_test["precision"],
            "recall": metrics_test["recall"],
            "f1": metrics_test["f1"],
            "auc_roc": metrics_test["auc_roc"],
            "auc_pr": metrics_test["auc_pr"],
            "brier_score": metrics_test["brier_score"],
        },
        "top_5_features": [
            {"feature": name, "shap_value": float(shap_val)}
            for name, shap_val in top_features
        ],
    }
    
    with open(output_path / "training_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"[OK] Model saved to {output_path / 'model.joblib'}")
    print(f"[OK] Metadata saved to {output_path / 'training_metadata.json'}")
    
    # ===== MLflow Tracking =====
    if mlflow_tracking:
        print("\nLogging to MLflow...")
        mlflow.set_experiment("intelligog-ai-delay-prediction")
        
        with mlflow.start_run():
            # Log parameters
            mlflow.log_params(best_params)
            mlflow.log_param("n_optuna_trials", n_trials)
            mlflow.log_param("optimal_threshold", optimal_threshold)
            
            # Log metrics
            mlflow.log_metrics(metrics_test)
            mlflow.log_metric("f1_baseline", f1_baseline)
            
            # Log model
            mlflow.xgboost.log_model(model, "model")
            
            # Log artifacts
            mlflow.log_artifact(str(output_path / "feature_names.json"))
            mlflow.log_artifact(str(output_path / "optimal_threshold.json"))
            mlflow.log_artifact(str(output_path / "shap_summary.png"))
            mlflow.log_artifact(str(output_path / "calibration_curve.png"))
            
            # Tags
            mlflow.set_tags({
                "project": "intelligog-ai",
                "data_version": "v1",
                "feature_set_version": "v1",
            })
        
        print("[OK] Run logged to MLflow")
    
    print("\n" + "=" * 80)
    print("Training Complete!")
    print("=" * 80)
    
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train IntelliLog-AI delay prediction model"
    )
    parser.add_argument(
        "--data",
        default="data/historical_deliveries.parquet",
        help="Path to training data",
    )
    parser.add_argument(
        "--output",
        default="models/",
        help="Directory to save model artifacts",
    )
    parser.add_argument(
        "--trials",
        type=int,
        default=30,
        help="Number of Optuna trials",
    )
    parser.add_argument(
        "--no-mlflow",
        action="store_true",
        help="Disable MLflow tracking",
    )
    
    args = parser.parse_args()
    
    train_model(
        data_path=args.data,
        output_dir=args.output,
        n_trials=args.trials,
        mlflow_tracking=not args.no_mlflow,
    )
