"""
Continuous Learning Pipeline for IntelliLog-AI.

This module implements the complete self-improving ML pipeline:
1. Feedback collection: Record delivery outcomes on each completion event
2. Daily drift detection: Detect distribution shifts in features
3. Nightly retraining: Retrain models on recent feedback
4. Model promotion: Automated A/B testing and production deployment
5. Monitoring: Prometheus metrics for observability

Components:
- feedback_collector: Captures delivery outcomes and updates rolling metrics
- drift_detector: Detects statistical shifts in feature distributions
- model_retrainer: Retrains models with data quality checks
- model_promoter: A/B testing and promotion orchestration
- metrics_collector: Prometheus metric updates
- celery_tasks: Scheduled and event-driven tasks
"""
