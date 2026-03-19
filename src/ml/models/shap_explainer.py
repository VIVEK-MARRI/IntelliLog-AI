"""
SHAP-based explanation engine for ETA predictions.
Generates human-readable explanations for predicted delivery times.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class ExplanationFactor:
    """Represents one contributing factor to ETA prediction."""

    def __init__(
        self,
        feature: str,
        impact_minutes: float,
        direction: str,  # "positive" (adds time) or "negative" (saves time)
        sentence: str,
        importance_rank: int,
        shap_value: float,
        feature_value: Optional[float] = None,
    ):
        self.feature = feature
        self.impact_minutes = impact_minutes
        self.direction = direction
        self.sentence = sentence
        self.importance_rank = importance_rank
        self.shap_value = shap_value
        self.feature_value = feature_value

    def to_dict(self) -> Dict[str, Any]:
        return {
            "feature": self.feature,
            "impact_minutes": round(self.impact_minutes, 1),
            "direction": self.direction,
            "sentence": self.sentence,
            "importance_rank": self.importance_rank,
            "shap_value": round(self.shap_value, 2),
            "feature_value": self.feature_value,
        }


class SHAPExplainer:
    """SHAP-based explanation engine for ETA predictions."""

    # Canonical feature names -> display names
    FEATURE_DISPLAY_NAMES = {
        "distance_km": "Distance",
        "current_traffic_ratio": "Traffic Conditions",
        "time_of_day_encoded": "Time of Day",
        "day_of_week": "Day of Week",
        "is_peak_hour": "Peak Hour",
        "weather_severity": "Weather",
        "driver_zone_familiarity": "Driver Zone Familiarity",
        "historical_avg_traffic_same_hour": "Historical Traffic",
        "vehicle_type": "Vehicle Type",
        "weight": "Package Weight",
    }

    def __init__(self):
        """Initialize explainer."""
        self.base_prediction_minutes = 20.0  # Default baseline ETA

    def generate_explanation(
        self,
        shap_values: np.ndarray,
        feature_names: List[str],
        feature_values: Dict[str, float],
        base_prediction: float,
        actual_prediction: float,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Generate human-readable explanation for prediction.

        Args:
            shap_values: SHAP values for one prediction (1D array)
            feature_names: List of feature names
            feature_values: Dict of {feature_name: value}
            base_prediction: Base prediction value (expected value)
            actual_prediction: Final model prediction (p50)
            top_k: Number of top factors to explain

        Returns:
            Explanation dict with summary and detailed factors
        """
        if len(shap_values) != len(feature_names):
            raise ValueError(
                f"SHAP values ({len(shap_values)}) "
                f"must match feature names ({len(feature_names)})"
            )

        # Verify SHAP value consistency
        shap_sum = base_prediction + np.sum(shap_values)
        shap_error = abs(shap_sum - actual_prediction)
        if shap_error > 0.1:
            logger.warning(
                f"SHAP values sum to {shap_sum:.1f} but prediction is {actual_prediction:.1f} "
                f"(error: {shap_error:.2f})"
            )

        # Build factor explanations
        factors = []
        for i, feature_name in enumerate(feature_names):
            shap_value = float(shap_values[i])
            feature_value = feature_values.get(feature_name)

            # Generate human-readable sentence
            sentence = self._generate_sentence(
                feature_name, shap_value, feature_value
            )

            # Determine direction
            direction = "positive" if shap_value > 0 else "negative"
            impact_minutes = abs(shap_value)

            factor = ExplanationFactor(
                feature=feature_name,
                impact_minutes=impact_minutes,
                direction=direction,
                sentence=sentence,
                importance_rank=0,  # Will update after sorting
                shap_value=shap_value,
                feature_value=feature_value,
            )
            factors.append(factor)

        # Sort by absolute SHAP value
        factors.sort(key=lambda f: abs(f.shap_value), reverse=True)

        # Update ranks and keep top-k
        for i, factor in enumerate(factors[:top_k]):
            factor.importance_rank = i + 1

        top_factors = factors[:top_k]

        # Generate summary
        summary = self._generate_summary(base_prediction, actual_prediction, top_factors)

        # Generate "what would help" suggestion
        what_would_help = self._generate_what_would_help(top_factors, feature_values)

        return {
            "summary": summary,
            "factors": [f.to_dict() for f in top_factors],
            "what_would_help": what_would_help,
            "base_prediction": round(base_prediction, 1),
            "actual_prediction": round(actual_prediction, 1),
            "top_k_factors": top_k,
        }

    def _generate_sentence(
        self, feature_name: str, shap_value: float, feature_value: Optional[float] = None
    ) -> str:
        """Generate human-readable sentence for feature contribution."""

        display_name = self.FEATURE_DISPLAY_NAMES.get(feature_name, feature_name)
        direction_verb = "adding" if shap_value >= 0 else "reducing"
        magnitude = abs(shap_value)

        # Feature-specific logic
        if feature_name == "distance_km":
            if feature_value is None:
                return f"Long delivery distance is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 5:
                return f"Short distance ({feature_value:.1f} km) is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 15:
                return f"Medium distance ({feature_value:.1f} km) is {direction_verb} ~{magnitude:.0f} minutes"
            else:
                return f"Long distance ({feature_value:.1f} km) is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "current_traffic_ratio":
            if feature_value is None:
                return f"Traffic conditions are {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 1.05:
                return f"Free flow traffic is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 1.3:
                return f"Light traffic is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 1.7:
                return f"Moderate traffic on route is {direction_verb} ~{magnitude:.0f} minutes"
            else:
                return f"Heavy traffic on route is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "is_peak_hour":
            if feature_value is None or feature_value < 0.5:
                return f"Off-peak hours are {direction_verb} ~{magnitude:.0f} minutes"
            else:
                return f"Peak hour (rush time) is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "weather_severity":
            if feature_value is None:
                return f"Weather conditions are {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 1:
                return f"Clear weather is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 2:
                return f"Light rain is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 3:
                return f"Heavy rain is {direction_verb} ~{magnitude:.0f} minutes"
            else:
                return f"Snow/severe weather is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "driver_zone_familiarity":
            if feature_value is None:
                return f"Driver familiarity with zone is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value > 0.8:
                return f"Driver is highly familiar with this zone ({direction_verb} ~{magnitude:.0f} min)"
            elif feature_value > 0.5:
                return f"Driver has moderate familiarity with this zone ({direction_verb} ~{magnitude:.0f} min)"
            else:
                return f"Driver is unfamiliar with this zone ({direction_verb} ~{magnitude:.0f} min)"

        elif feature_name == "time_of_day_encoded":
            time_map = {0: "morning", 1: "afternoon", 2: "evening", 3: "night"}
            time_str = time_map.get(int(feature_value) if feature_value else 0, "daytime")
            return f"{time_str.capitalize()} delivery is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "day_of_week":
            if feature_value is not None:
                day_map = {
                    0: "Monday",
                    1: "Tuesday",
                    2: "Wednesday",
                    3: "Thursday",
                    4: "Friday",
                    5: "Saturday",
                    6: "Sunday",
                }
                day_str = day_map.get(int(feature_value), "weekday")
                return f"{day_str} delivery is {direction_verb} ~{magnitude:.0f} minutes"
            else:
                return f"Day of week pattern is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "vehicle_type":
            vehicle_map = {0: "car", 1: "van", 2: "truck"}
            vehicle_str = vehicle_map.get(
                int(feature_value) if feature_value else 0, "vehicle"
            )
            return f"{vehicle_str.capitalize()} type is {direction_verb} ~{magnitude:.0f} minutes"

        elif feature_name == "weight":
            if feature_value is None:
                return f"Package weight is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 1:
                return f"Light package is {direction_verb} ~{magnitude:.0f} minutes"
            elif feature_value < 5:
                return f"Medium package is {direction_verb} ~{magnitude:.0f} minutes"
            else:
                return f"Heavy package is {direction_verb} ~{magnitude:.0f} minutes"

        else:
            # Generic fallback
            return f"{display_name} is {direction_verb} ~{magnitude:.0f} minutes"

    def _generate_summary(
        self, base_prediction: float, actual_prediction: float, top_factors: List[ExplanationFactor]
    ) -> str:
        """Generate summary sentence."""
        eta_int = int(round(actual_prediction))

        if not top_factors:
            return f"Predicted {eta_int} min based on model baseline"

        # Get top positive (adding time) and negative (saving time) factors
        positive_factors = [f for f in top_factors if f.direction == "positive"]
        negative_factors = [f for f in top_factors if f.direction == "negative"]

        factor_strs = []

        # Add top positive factors
        for factor in positive_factors[:2]:
            factor_strs.append(f"{factor.feature.replace('_', ' ')} (+{int(round(factor.impact_minutes))})")

        # Add top negative factors
        for factor in negative_factors[:1]:
            factor_strs.append(
                f"{factor.feature.replace('_', ' ')} ({int(round(factor.impact_minutes))})"
            )

        if factor_strs:
            factors_str = ", ".join(factor_strs)
            return f"Predicted {eta_int} min. Main factors: {factors_str}"
        else:
            return f"Predicted {eta_int} min based on delivery characteristics"

    def _generate_what_would_help(
        self, top_factors: List[ExplanationFactor], feature_values: Dict[str, float]
    ) -> Optional[str]:
        """Generate actionable suggestion to reduce delivery time."""

        # Check for high-impact negative factors that could be improved
        for factor in top_factors[:3]:
            if factor.direction == "positive" and factor.impact_minutes > 3:
                # This factor is adding significant time - can we suggest improvement?

                if factor.feature == "driver_zone_familiarity":
                    familiarity = feature_values.get("driver_zone_familiarity", 0.5)
                    if familiarity < 0.7:
                        return f"Assigning a driver familiar with this zone would save ~{int(factor.impact_minutes)} min"

                elif factor.feature == "current_traffic_ratio":
                    traffic_ratio = feature_values.get("current_traffic_ratio", 1.0)
                    if traffic_ratio > 1.5:
                        return f"Delivery soon (off-peak) would save ~{int(factor.impact_minutes)} min"

                elif factor.feature == "distance_km":
                    distance = feature_values.get("distance_km", 10)
                    if distance > 20:
                        return f"Alternative route might save ~{int(factor.impact_minutes)} min"

        return None


def explain_prediction(
    model,
    X: pd.DataFrame,
    shap_explainer,
    sample_idx: int = 0,
    additional_features: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    End-to-end explanation generation.

    Args:
        model: Trained ETAPredictor model
        X: Input features DataFrame (single row)
        shap_explainer: SHAP TreeExplainer instance
        sample_idx: Index of sample to explain
        additional_features: Extra features not in X (e.g., driver_zone_familiarity)

    Returns:
        Explanation dict ready for API response
    """
    if shap_explainer is None:
        raise ValueError("SHAP explainer not initialized")

    # Get SHAP values
    shap_values = shap_explainer.shap_values(X.iloc[[sample_idx]])
    feature_names = list(X.columns)
    base_value = float(shap_explainer.expected_value)

    # Get prediction
    prediction = float(model.predict_with_confidence(X.iloc[[sample_idx]])[0])

    # Build feature values dict
    feature_values = {name: float(X[name].iloc[sample_idx]) for name in feature_names}
    if additional_features:
        feature_values.update(additional_features)

    # Generate explanation
    explainer = SHAPExplainer()
    explanation = explainer.generate_explanation(
        shap_values=shap_values[sample_idx],
        feature_names=feature_names,
        feature_values=feature_values,
        base_prediction=base_value,
        actual_prediction=prediction,
        top_k=5,
    )

    return explanation
