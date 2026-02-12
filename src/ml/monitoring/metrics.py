"""
ML Monitoring and Metrics Collection
Prometheus-compatible metrics for production ML systems
"""

import time
from typing import Dict, Any, Optional
from datetime import datetime
from collections import deque
import numpy as np
from prometheus_client import Counter, Histogram, Gauge, Summary


class MLMetricsCollector:
    """
    Collect and expose ML model metrics for monitoring
    
    Tracks:
    - Prediction latency
    - Prediction accuracy (MAE, RMSE)
    - Model drift scores
    - Data quality metrics
    - Request counts
    """
    
    def __init__(self, model_name: str = "eta_predictor"):
        """Initialize metrics collectors"""
        self.model_name = model_name
        
        # Prometheus metrics
        self.prediction_counter = Counter(
            f'{model_name}_predictions_total',
            'Total number of predictions made'
        )
        
        self.prediction_latency = Histogram(
            f'{model_name}_prediction_latency_ms',
            'Prediction latency in milliseconds',
            buckets=(10, 25, 50, 75, 100, 250, 500, 1000)
        )
        
        self.prediction_error = Gauge(
            f'{model_name}_prediction_error_minutes',
            'Current prediction error (MAE) in minutes'
        )
        
        self.prediction_accuracy = Gauge(
            f'{model_name}_prediction_accuracy_percent',
            'Prediction accuracy percentage (within 5 min threshold)'
        )
        
        self.model_drift_score = Gauge(
            f'{model_name}_drift_score',
            'Model drift detection score (0-1)'
        )
        
        self.data_quality_score = Gauge(
            f'{model_name}_data_quality_score',
            'Input data quality score (0-1)'
        )
        
        self.ood_detections = Counter(
            f'{model_name}_ood_detections_total',
            'Number of out-of-distribution samples detected'
        )
        
        # In-memory metrics storage (last 1000 predictions)
        self.recent_predictions = deque(maxlen=1000)
        self.recent_errors = deque(maxlen=1000)
        self.recent_latencies = deque(maxlen=1000)
    
    def record_prediction(
        self,
        prediction_value: float,
        actual_value: Optional[float] = None,
        latency_ms: Optional[float] = None,
        is_ood: bool = False,
        confidence: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Record a prediction event
        
        Args:
            prediction_value: Predicted ETA in minutes
            actual_value: True ETA (if known)
            latency_ms: Prediction latency
            is_ood: Whether sample was out-of-distribution
            confidence: Model confidence score
            metadata: Additional context
        """
        # Increment counter
        self.prediction_counter.inc()
        
        # Record latency
        if latency_ms is not None:
            self.prediction_latency.observe(latency_ms)
            self.recent_latencies.append(latency_ms)
        
        # Record error (if actual is known)
        if actual_value is not None:
            error = abs(prediction_value - actual_value)
            self.recent_errors.append(error)
            
            # Update MAE gauge
            if self.recent_errors:
                mae = np.mean(self.recent_errors)
                self.prediction_error.set(mae)
                
                # Update accuracy (% within 5 min)
                within_threshold = sum(1 for e in self.recent_errors if e <= 5.0)
                accuracy = (within_threshold / len(self.recent_errors)) * 100
                self.prediction_accuracy.set(accuracy)
        
        # Record OOD detection
        if is_ood:
            self.ood_detections.inc()
        
        # Store in memory
        self.recent_predictions.append({
            'timestamp': datetime.utcnow().isoformat(),
            'prediction': prediction_value,
            'actual': actual_value,
            'error': abs(prediction_value - actual_value) if actual_value else None,
            'latency_ms': latency_ms,
            'is_ood': is_ood,
            'confidence': confidence,
            'metadata': metadata or {}
        })
    
    def update_drift_score(self, drift_score: float) -> None:
        """
        Update model drift score
        
        Args:
            drift_score: Drift metric value (0 = no drift, 1 = significant drift)
        """
        self.model_drift_score.set(drift_score)
    
    def update_data_quality(self, quality_score: float) -> None:
        """
        Update data quality score
        
        Args:
            quality_score: Quality metric (0 = poor, 1 = excellent)
        """
        self.data_quality_score.set(quality_score)
    
    def get_recent_stats(self, window_size: int = 100) -> Dict[str, Any]:
        """
        Get recent statistics
        
        Args:
            window_size: Number of recent predictions to analyze
        
        Returns:
            Statistics dictionary
        """
        recent = list(self.recent_predictions)[-window_size:]
        
        if not recent:
            return {
                'n_predictions': 0,
                'message': 'No recent predictions'
            }
        
        # Calculate statistics
        predictions = [p['prediction'] for p in recent]
        errors = [p['error'] for p in recent if p['error'] is not None]
        latencies = [p['latency_ms'] for p in recent if p['latency_ms'] is not None]
        ood_count = sum(1 for p in recent if p['is_ood'])
        
        stats = {
            'n_predictions': len(recent),
            'prediction_stats': {
                'mean': float(np.mean(predictions)),
                'std': float(np.std(predictions)),
                'min': float(np.min(predictions)),
                'max': float(np.max(predictions))
            }
        }
        
        if errors:
            stats['error_stats'] = {
                'mae': float(np.mean(errors)),
                'rmse': float(np.sqrt(np.mean(np.array(errors) ** 2))),
                'max_error': float(np.max(errors)),
                'accuracy_5min': float(sum(1 for e in errors if e <= 5.0) / len(errors) * 100)
            }
        
        if latencies:
            stats['latency_stats'] = {
                'mean_ms': float(np.mean(latencies)),
                'p50_ms': float(np.percentile(latencies, 50)),
                'p95_ms': float(np.percentile(latencies, 95)),
                'p99_ms': float(np.percentile(latencies, 99))
            }
        
        stats['ood_detection'] = {
            'count': ood_count,
            'percentage': float(ood_count / len(recent) * 100)
        }
        
        return stats
    
    def reset(self) -> None:
        """Reset all in-memory metrics"""
        self.recent_predictions.clear()
        self.recent_errors.clear()
        self.recent_latencies.clear()


# Global singleton
_metrics_collector: Optional[MLMetricsCollector] = None


def get_metrics_collector(model_name: str = "eta_predictor") -> MLMetricsCollector:
    """Get or create metrics collector singleton"""
    global _metrics_collector
    
    if _metrics_collector is None:
        _metrics_collector = MLMetricsCollector(model_name)
    
    return _metrics_collector
