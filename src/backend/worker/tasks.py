import logging
from typing import List, Dict, Any
from src.backend.worker.celery_app import celery_app
from src.backend.app.services.optimization_service import OptimizationService

logger = logging.getLogger(__name__)

@celery_app.task(acks_late=True)
def optimize_route_task(
    orders: List[Dict[str, Any]],
    drivers: int = 3,
    method: str = "ortools"
) -> Dict[str, Any]:
    """
    Async task to run route optimization.
    """
    try:
        logger.info("Received optimization task.")
        result = OptimizationService.calculate_routes(orders, drivers=drivers, method=method)
        return result
    except Exception as e:
        logger.error(f"Task failed: {e}")
        return {"error": str(e)}
