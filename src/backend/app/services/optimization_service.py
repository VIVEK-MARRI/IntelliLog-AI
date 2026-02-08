import logging
from typing import List, Dict, Any
from src.optimization.vrp_solver import plan_routes

from src.backend.app.services.eta_service import ETAService

logger = logging.getLogger(__name__)

class OptimizationService:
    @staticmethod
    def calculate_routes(
        orders: List[Dict[str, Any]],
        drivers: int = 3,
        method: str = "greedy",
        use_ml: bool = True
    ) -> Dict[str, Any]:
        """
        Wrapper around the core VRP solver.
        """
        logger.info(f"Starting optimization for {len(orders)} orders with {drivers} drivers using {method}.")
        try:
            # Inject ML predictor from ETAService
            predictor = ETAService.predict_eta if use_ml else None
            
            result = plan_routes(
                orders, 
                drivers=drivers, 
                method=method, 
                use_ml_predictions=use_ml,
                model_predictor=predictor
            )
            return result
        except Exception as e:
            logger.error(f"Optimization failed: {str(e)}")
            raise e
