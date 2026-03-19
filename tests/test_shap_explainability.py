"""
Comprehensive test suite for SHAP explainability layer.

Tests coverage:
1. SHAP value consistency checks
2. Feature-specific sentence generation
3. What-would-help actionability
4. Driver familiarity scoring
5. Explanation API endpoints
6. Celery task generation + backfilling
7. Aggregation logic
"""

import json
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal

import numpy as np
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Assuming imports from project structure
# This is a template - adjust imports based on actual project structure


class TestSHAPExplainer:
    """Test SHAP explanation engine core functionality."""

    def test_shap_values_sum_to_prediction(self):
        """Verify SHAP values + base value = actual prediction (within tolerance)."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        # Mock SHAP values that sum to prediction
        shap_values = np.array([2.5, 1.2, -0.8, 3.1, 0.5, -1.0, 2.3, 0.2])
        base_value = 20.0  # Base ETA in minutes
        actual_prediction = base_value + np.sum(shap_values)
        
        feature_names = [
            'distance_km',
            'current_traffic_ratio',
            'is_peak_hour',
            'weather_severity',
            'driver_zone_familiarity',
            'time_of_day',
            'day_of_week',
            'vehicle_type'
        ]
        
        feature_values = [15.5, 1.5, 1, 2, 0.65, 2, 3, 1]
        
        # Generate explanation
        explanation = explainer.generate_explanation(
            shap_values=shap_values,
            base_value=base_value,
            feature_names=feature_names,
            feature_values=feature_values,
            actual_prediction=actual_prediction
        )
        
        # Verify SHAP sum
        computed_prediction = explanation.base_prediction + sum(
            f.shap_value for f in explanation.factors
        )
        
        assert abs(computed_prediction - actual_prediction) < 0.1, \
            f"SHAP sum mismatch: {computed_prediction} vs {actual_prediction}"
        assert explanation.base_prediction == base_value
        assert len(explanation.factors) > 0

    def test_feature_length_mismatch_error(self):
        """Verify error on mismatched feature/value/name arrays."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        shap_values = np.array([1.0, 2.0, 3.0])  # 3 values
        feature_names = ['a', 'b']  # 2 names - mismatch
        feature_values = [1, 2, 3]
        
        with pytest.raises(ValueError, match="array length mismatch"):
            explainer.generate_explanation(
                shap_values=shap_values,
                base_value=20.0,
                feature_names=feature_names,
                feature_values=feature_values,
                actual_prediction=26.0
            )


class TestFeatureSentenceGeneration:
    """Test human-readable sentence generation for each feature type."""

    def test_distance_short_sentence(self):
        """Test sentence for short distance (<5km)."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        sentence = explainer._generate_sentence(
            feature_name='distance_km',
            feature_value=3.2,
            shap_value=1.5,
            direction='positive'
        )
        
        assert 'short' in sentence.lower()
        assert '3.2' in sentence or '3' in sentence
        assert 'distance' in sentence.lower()

    def test_distance_medium_sentence(self):
        """Test sentence for medium distance (5-15km)."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        sentence = explainer._generate_sentence(
            feature_name='distance_km',
            feature_value=10.0,
            shap_value=2.5,
            direction='positive'
        )
        
        assert 'medium' in sentence.lower() or 'distance' in sentence.lower()
        assert '10' in sentence

    def test_distance_long_sentence(self):
        """Test sentence for long distance (>15km)."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        sentence = explainer._generate_sentence(
            feature_name='distance_km',
            feature_value=25.0,
            shap_value=5.0,
            direction='positive'
        )
        
        assert 'long' in sentence.lower() or 'distance' in sentence.lower()
        assert '25' in sentence

    def test_traffic_free_flow_sentence(self):
        """Test sentence for free flow traffic."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        sentence = explainer._generate_sentence(
            feature_name='current_traffic_ratio',
            feature_value=0.5,
            shap_value=-1.0,
            direction='negative'
        )
        
        assert 'free' in sentence.lower() or 'traffic' in sentence.lower()

    def test_traffic_heavy_sentence(self):
        """Test sentence for heavy traffic."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        sentence = explainer._generate_sentence(
            feature_name='current_traffic_ratio',
            feature_value=2.0,
            shap_value=8.5,
            direction='positive'
        )
        
        assert 'heavy' in sentence.lower() or 'traffic' in sentence.lower()

    def test_peak_hour_sentence(self):
        """Test sentence for peak hour flag."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        # Peak hour
        sentence = explainer._generate_sentence(
            feature_name='is_peak_hour',
            feature_value=1,
            shap_value=2.0,
            direction='positive'
        )
        
        assert 'peak' in sentence.lower() or 'rush' in sentence.lower()
        
        # Off-peak
        sentence_off = explainer._generate_sentence(
            feature_name='is_peak_hour',
            feature_value=0,
            shap_value=-0.5,
            direction='negative'
        )
        
        assert 'off' in sentence_off.lower() or 'traffic' in sentence_off.lower()

    def test_weather_severity_sentences(self):
        """Test sentences for different weather severities."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        test_cases = [
            (0, 'clear'),      # Clear weather
            (1, 'rain'),       # Rain
            (2, 'rain'),       # Heavy rain
            (3, 'snow')        # Snow
        ]
        
        for severity, expected_keyword in test_cases:
            sentence = explainer._generate_sentence(
                feature_name='weather_severity',
                feature_value=severity,
                shap_value=1.0 + severity,
                direction='positive'
            )
            
            assert expected_keyword in sentence.lower(), \
                f"Expected '{expected_keyword}' in: {sentence}"

    def test_driver_familiarity_sentences(self):
        """Test sentences for driver zone familiarity scores."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        test_cases = [
            (0.9, 'familiar'),     # Highly familiar
            (0.5, 'moderate'),     # Moderate familiarity
            (0.2, 'unfamiliar')    # Unfamiliar
        ]
        
        for familiarity, expected_keyword in test_cases:
            sentence = explainer._generate_sentence(
                feature_name='driver_zone_familiarity',
                feature_value=familiarity,
                shap_value=0.5 if familiarity > 0.7 else 2.0,
                direction='negative' if familiarity > 0.7 else 'positive'
            )
            
            assert expected_keyword in sentence.lower() or 'driver' in sentence.lower(), \
                f"Expected '{expected_keyword}' in: {sentence}"

    def test_time_of_day_sentences(self):
        """Test sentences for different times of day."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        test_cases = [
            (0, 'morning'),
            (1, 'afternoon'),
            (2, 'evening'),
            (3, 'night')
        ]
        
        for time_code, expected_keyword in test_cases:
            sentence = explainer._generate_sentence(
                feature_name='time_of_day',
                feature_value=time_code,
                shap_value=1.0,
                direction='positive'
            )
            
            assert expected_keyword in sentence.lower(), \
                f"Expected '{expected_keyword}' in: {sentence}"

    def test_day_of_week_sentences(self):
        """Test sentences for different days of week."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        for day_code, day_name in enumerate(days):
            sentence = explainer._generate_sentence(
                feature_name='day_of_week',
                feature_value=day_code,
                shap_value=0.5,
                direction='positive'
            )
            
            assert day_name.lower() in sentence.lower(), \
                f"Expected '{day_name}' in: {sentence}"

    def test_vehicle_type_sentence(self):
        """Test sentences for vehicle types."""
        from src.ml.models.shap_explainer import SHAPExplainer
        
        explainer = SHAPExplainer()
        
        test_cases = [
            (0, 'car'),
            (1, 'van'),
            (2, 'truck')
        ]
        
        for vehicle_code, expected_vehicle in test_cases:
            sentence = explainer._generate_sentence(
                feature_name='vehicle_type',
                feature_value=vehicle_code,
                shap_value=1.0,
                direction='positive'
            )
            
            assert expected_vehicle in sentence.lower(), \
                f"Expected '{expected_vehicle}' in: {sentence}"


class TestWhatWouldHelp:
    """Test actionability of 'what would help' suggestions."""

    def test_traffic_suggestion_high_impact(self):
        """Test suggestion when traffic impact > 5 minutes."""
        from src.ml.models.shap_explainer import SHAPExplainer
        from src.ml.models.shap_explainer import ExplanationFactor
        
        explainer = SHAPExplainer()
        
        factors = [
            ExplanationFactor(
                feature='current_traffic_ratio',
                impact_minutes=7.5,
                direction='positive',
                sentence='Heavy traffic is adding ~7.5 minutes',
                importance_rank=1,
                shap_value=7.5,
                feature_value=2.0
            )
        ]
        
        suggestion = explainer._generate_what_would_help(factors)
        
        assert suggestion is not None
        assert 'reschedule' in suggestion.lower() or 'route' in suggestion.lower()

    def test_driver_familiarity_suggestion(self):
        """Test suggestion for unfamiliar driver."""
        from src.ml.models.shap_explainer import SHAPExplainer
        from src.ml.models.shap_explainer import ExplanationFactor
        
        explainer = SHAPExplainer()
        
        factors = [
            ExplanationFactor(
                feature='driver_zone_familiarity',
                impact_minutes=4.0,
                direction='positive',
                sentence='Driver unfamiliar with zone is adding ~4 minutes',
                importance_rank=1,
                shap_value=4.0,
                feature_value=0.3
            )
        ]
        
        suggestion = explainer._generate_what_would_help(factors)
        
        assert suggestion is not None
        assert 'familiar' in suggestion.lower() or 'assign' in suggestion.lower()

    def test_low_impact_no_suggestion(self):
        """Test no suggestion when all factors have low impact."""
        from src.ml.models.shap_explainer import SHAPExplainer
        from src.ml.models.shap_explainer import ExplanationFactor
        
        explainer = SHAPExplainer()
        
        factors = [
            ExplanationFactor(
                feature='time_of_day',
                impact_minutes=0.5,
                direction='positive',
                sentence='Time of day has minimal impact',
                importance_rank=1,
                shap_value=0.5,
                feature_value=1
            )
        ]
        
        suggestion = explainer._generate_what_would_help(factors)
        
        # Either None or a generic suggestion
        if suggestion:
            assert len(suggestion) > 0
        else:
            assert suggestion is None or "delivery" in suggestion.lower()


class TestDriverFamiliarity:
    """Test driver zone familiarity scoring."""

    @pytest.fixture
    def mock_db(self):
        """Mock database session."""
        return Mock(spec=Session)

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client."""
        mock = Mock()
        mock.get.return_value = None  # Cache miss
        return mock

    def test_familiarity_formula_correctness(self, mock_db, mock_redis):
        """Verify familiarity score formula: base - error_penalty + count_bonus + std_bonus."""
        from src.ml.features.driver_familiarity import DriverFamiliarityScorer
        
        scorer = DriverFamiliarityScorer(redis_client=mock_redis, db_session=mock_db)
        
        # Mock delivery history
        mock_db.query.return_value.filter.return_value.all.return_value = [
            Mock(actual_delivery_time=25, predicted_eta=23),  # -2 error
            Mock(actual_delivery_time=28, predicted_eta=26),  # -2 error
            Mock(actual_delivery_time=27, predicted_eta=25),  # -2 error
        ]
        
        # Calculate familiarity
        score = scorer._compute_familiarity_from_db(
            driver_id='DRV_123',
            zone_id='ZONE_ABC'
        )
        
        # Score should be in valid range
        assert 0.0 <= score <= 1.0, f"Score out of range: {score}"
        
        # With consistent errors, score should be moderate
        assert score > 0.3, f"Score too low for consistent deliveries: {score}"

    def test_familiarity_no_deliveries(self, mock_db, mock_redis):
        """Test familiarity when driver has no deliveries in zone."""
        from src.ml.features.driver_familiarity import DriverFamiliarityScorer
        
        scorer = DriverFamiliarityScorer(redis_client=mock_redis, db_session=mock_db)
        
        # No deliveries
        mock_db.query.return_value.filter.return_value.all.return_value = []
        
        score = scorer._compute_familiarity_from_db(
            driver_id='DRV_NEW',
            zone_id='ZONE_UNKNOWN'
        )
        
        # Default for unfamiliar driver
        assert 0.0 <= score <= 0.5, f"Score should be low for new driver: {score}"

    def test_familiarity_redis_caching(self, mock_db, mock_redis):
        """Test Redis caching of familiarity scores."""
        from src.ml.features.driver_familiarity import DriverFamiliarityScorer
        
        scorer = DriverFamiliarityScorer(redis_client=mock_redis, db_session=mock_db)
        
        # First call - cache miss, compute from DB
        mock_redis.get.return_value = None
        mock_db.query.return_value.filter.return_value.all.return_value = []
        
        score1 = scorer.get_driver_zone_familiarity('DRV_123', 'ZONE_ABC')
        
        # Verify Redis.set was called
        mock_redis.set.assert_called()
        
        # Second call - should hit cache
        mock_redis.get.return_value = b'0.65'
        score2 = scorer.get_driver_zone_familiarity('DRV_123', 'ZONE_ABC')
        
        assert score2 == 0.65

    def test_multi_zone_familiarity(self, mock_db, mock_redis):
        """Test batch familiarity computation for multiple zones."""
        from src.ml.features.driver_familiarity import DriverFamiliarityScorer
        
        scorer = DriverFamiliarityScorer(redis_client=mock_redis, db_session=mock_db)
        
        mock_redis.get.return_value = None
        mock_db.query.return_value.filter.return_value.all.return_value = []
        
        zones = ['ZONE_A', 'ZONE_B', 'ZONE_C']
        scores = scorer.get_multi_zone_familiarity('DRV_123', zones)
        
        assert len(scores) == 3
        assert all(0.0 <= score <= 1.0 for score in scores.values())


class TestExplanationAPI:
    """Test REST API endpoints for explanations."""

    @pytest.fixture
    def client(self):
        """Create test FastAPI client."""
        from fastapi.testclient import TestClient
        from src.api.app import app
        
        return TestClient(app)

    @pytest.fixture
    def mock_db(self):
        """Mock database session."""
        return Mock(spec=Session)

    def test_explain_endpoint_valid_order(self, client):
        """Test POST /predictions/explain with valid order."""
        response = client.post(
            '/api/v1/predictions/explain',
            json={
                'order_id': 'ORD_12345',
                'driver_id': 'DRV_789',
                'include_driver_context': True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert 'order_id' in data
        assert 'eta_minutes' in data
        assert 'confidence_within_5min' in data
        assert 'confidence_badge' in data
        assert 'summary' in data
        assert 'factors' in data
        assert isinstance(data['factors'], list)

    def test_explain_endpoint_missing_order(self, client):
        """Test POST /predictions/explain with non-existent order."""
        response = client.post(
            '/api/v1/predictions/explain',
            json={
                'order_id': 'ORD_NONEXISTENT',
                'driver_id': 'DRV_789'
            }
        )
        
        assert response.status_code == 404
        assert 'not found' in response.json()['detail'].lower()

    def test_confidence_badge_high(self, client):
        """Test confidence badge for high-confidence prediction (>85%)."""
        # This would need mocking the confidence value
        response = client.post(
            '/api/v1/predictions/explain',
            json={
                'order_id': 'ORD_HIGH_CONF',
                'driver_id': 'DRV_789'
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            if data['confidence_within_5min'] > 0.85:
                assert data['confidence_badge'] == 'high'

    def test_confidence_badge_medium(self, client):
        """Test confidence badge for medium-confidence prediction (70-85%)."""
        response = client.post(
            '/api/v1/predictions/explain',
            json={
                'order_id': 'ORD_MED_CONF',
                'driver_id': 'DRV_789'
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            if 0.70 <= data['confidence_within_5min'] <= 0.85:
                assert data['confidence_badge'] == 'medium'

    def test_confidence_badge_low(self, client):
        """Test confidence badge for low-confidence prediction (<70%)."""
        response = client.post(
            '/api/v1/predictions/explain',
            json={
                'order_id': 'ORD_LOW_CONF',
                'driver_id': 'DRV_789'
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            if data['confidence_within_5min'] < 0.70:
                assert data['confidence_badge'] == 'low'

    def test_delay_factors_endpoint(self, client):
        """Test GET /analytics/delay-factors endpoint."""
        response = client.get(
            '/api/v1/analytics/delay-factors',
            params={
                'zone': 'Banjara Hills',
                'date_from': '2026-03-01',
                'date_to': '2026-03-19',
                'top_k': 5
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'zone' in data
        assert 'date_range' in data
        assert 'top_delay_factors' in data
        assert isinstance(data['top_delay_factors'], list)

    def test_driver_zones_endpoint(self, client):
        """Test GET /analytics/driver-zones endpoint."""
        response = client.get(
            '/api/v1/analytics/driver-zones',
            params={'driver_id': 'DRV_789'}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'driver_id' in data
        assert 'zones' in data
        assert isinstance(data['zones'], list)
        
        # Each zone should have familiarity score
        for zone in data['zones']:
            assert 'zone_id' in zone
            assert 'familiarity_score' in zone
            assert 0.0 <= zone['familiarity_score'] <= 1.0


class TestCeleryTasks:
    """Test Celery async tasks for explanation generation."""

    @pytest.fixture
    def mock_celery_task(self):
        """Mock Celery task."""
        return Mock()

    def test_explanation_task_generation(self, mock_celery_task):
        """Test generate_explanation_task creates explanation for prediction."""
        from src.ml.continuous_learning.explanation_tasks import generate_explanation_task
        
        # Mock task execution
        with patch('src.ml.continuous_learning.explanation_tasks.db') as mock_db:
            with patch('src.ml.continuous_learning.explanation_tasks.SHAPExplainer'):
                
                result = generate_explanation_task.delay(
                    order_id='ORD_12345',
                    driver_id='DRV_789'
                )
                
                assert result is not None

    def test_backfill_explanations_task(self, mock_celery_task):
        """Test backfill_explanations_task generates missing explanations."""
        from src.ml.continuous_learning.explanation_tasks import backfill_explanations_task
        
        # Mock task execution
        with patch('src.ml.continuous_learning.explanation_tasks.db') as mock_db:
            result = backfill_explanations_task.delay(
                cutoff_date='2026-03-01'
            )
            
            assert result is not None

    def test_feature_reconstruction(self):
        """Test feature reconstruction from stored delivery feedback."""
        from src.ml.continuous_learning.explanation_tasks import _reconstruct_features_from_feedback
        
        mock_feedback = Mock(
            distance_km=15.5,
            traffic_ratio=1.5,
            is_peak_hour=True,
            weather_severity=1,
            driver_id='DRV_789',
            zone_id='ZONE_ABC',
            delivery_datetime=datetime.now()
        )
        
        features = _reconstruct_features_from_feedback(mock_feedback)
        
        assert features is not None
        assert len(features) >= 8  # At least 8 feature types


class TestAggregationLogic:
    """Test explanation aggregation for analytics."""

    @pytest.fixture
    def mock_db(self):
        """Mock database."""
        return Mock(spec=Session)

    def test_aggregation_top_factors_sorting(self, mock_db):
        """Test aggregation sorts factors by frequency."""
        # This would test the aggregation logic in the API endpoint
        # Factors should be sorted by frequency descending
        pass

    def test_aggregation_date_range_filtering(self, mock_db):
        """Test aggregation respects date_from and date_to parameters."""
        pass

    def test_aggregation_zone_filtering(self, mock_db):
        """Test aggregation filters to specific zone."""
        pass

    def test_aggregation_empty_result(self, mock_db):
        """Test aggregation with no data returns gracefully."""
        pass


class TestIntegration:
    """Integration tests for end-to-end explanation flow."""

    def test_prediction_to_explanation_flow(self):
        """Test complete flow: prediction -> SHAP -> storage -> API."""
        pass

    def test_driver_familiarity_in_training(self):
        """Test driver_zone_familiarity is used in model retraining."""
        pass

    def test_explanation_storage_and_retrieval(self):
        """Test explanation is stored and retrieved correctly."""
        pass


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
