"""Tests for calibrated ETA predictor."""

from pathlib import Path
import tempfile

import numpy as np
import pandas as pd
import pytest
import xgboost as xgb

from src.ml.models.eta_predictor import ETAPredictor


@pytest.fixture
def synthetic_eta_data():
    np.random.seed(7)
    n = 1200
    X = pd.DataFrame(
        {
            "distance_km": np.random.uniform(1, 40, n),
            "traffic_idx": np.random.uniform(0, 1, n),
            "hour": np.random.randint(0, 24, n),
            "dow": np.random.randint(0, 7, n),
            "rain": np.random.binomial(1, 0.2, n),
        }
    )

    signal = (
        4.0
        + 1.4 * X["distance_km"]
        + 3.2 * X["traffic_idx"]
        + 2.0 * X["rain"]
        + 0.08 * (X["hour"] - 12) ** 2
    )
    y = signal + np.random.normal(0, 0.9, n)

    i1 = int(0.6 * n)
    i2 = int(0.8 * n)
    return {
        "X_train": X.iloc[:i1].reset_index(drop=True),
        "y_train": y.iloc[:i1].reset_index(drop=True),
        "X_val": X.iloc[i1:i2].reset_index(drop=True),
        "y_val": y.iloc[i1:i2].reset_index(drop=True),
        "X_test": X.iloc[i2:].reset_index(drop=True),
        "y_test": y.iloc[i2:].reset_index(drop=True),
    }


def _train_predictor(data):
    predictor = ETAPredictor(xgb_params={
        "objective": "reg:squarederror",
        "max_depth": 5,
        "learning_rate": 0.08,
        "n_estimators": 260,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "min_child_weight": 2,
        "gamma": 0.0,
        "reg_alpha": 0.0,
        "reg_lambda": 1.0,
        "random_state": 42,
        "n_jobs": -1,
        "tree_method": "hist",
        "early_stopping_rounds": 20,
    })
    predictor.train(
        data["X_train"],
        data["y_train"],
        data["X_val"],
        data["y_val"],
        verbose=False,
        log_mlflow=False,
    )
    return predictor


def test_quantile_models_and_ordering(synthetic_eta_data):
    predictor = _train_predictor(synthetic_eta_data)

    assert predictor.model_p10 is not None
    assert predictor.model_p50 is not None
    assert predictor.model_p90 is not None

    out = predictor.predict_with_intervals(synthetic_eta_data["X_test"])
    assert np.all(out["p10"] < out["p50"])
    assert np.all(out["p50"] < out["p90"])


def test_confidence_is_probability(synthetic_eta_data):
    predictor = _train_predictor(synthetic_eta_data)
    out = predictor.predict_with_intervals(synthetic_eta_data["X_test"])
    conf = out["confidence_within_5min"]
    assert np.all(conf >= 0.0)
    assert np.all(conf <= 1.0)


def test_ece_below_target(synthetic_eta_data):
    predictor = _train_predictor(synthetic_eta_data)

    val_out = predictor.predict_with_intervals(synthetic_eta_data["X_val"])
    metrics = predictor.evaluate_calibration(
        y_true=synthetic_eta_data["y_val"],
        p50_pred=val_out["p50"],
        confidence_scores=val_out["confidence_within_5min"],
    )
    assert metrics["expected_calibration_error"] < 0.05


def test_predict_returns_full_object(synthetic_eta_data):
    predictor = _train_predictor(synthetic_eta_data)
    row = synthetic_eta_data["X_test"].iloc[[0]]
    pred = predictor.predict(row)

    expected = {
        "eta_minutes",
        "eta_p10",
        "eta_p90",
        "interval_width_minutes",
        "confidence_within_5min",
        "is_ood",
        "top_features",
        "explanation",
    }
    assert expected.issubset(pred.keys())


def test_migration_path_for_old_models(synthetic_eta_data):
    with tempfile.TemporaryDirectory() as td:
        path = Path(td)
        legacy = xgb.XGBRegressor(random_state=42, n_estimators=30)
        legacy.fit(synthetic_eta_data["X_train"], synthetic_eta_data["y_train"])
        legacy.save_model(str(path / "xgboost_model.json"))

        predictor = ETAPredictor()
        predictor.load(path)

        out = predictor.predict_with_intervals(synthetic_eta_data["X_test"].iloc[:5])
        assert len(out["p50"]) == 5
        assert np.all(out["confidence_within_5min"] >= 0.0)
        assert np.all(out["confidence_within_5min"] <= 1.0)
