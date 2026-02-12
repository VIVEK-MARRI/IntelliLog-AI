import time
import logging
from src.backend.app.services.optimization_service import OptimizationService
from src.simulation.generators.order_generator import OrderGenerator
from src.simulation.generators.driver_generator import DriverGenerator
from src.simulation.collectors.metrics_collector import MetricsCollector

logger = logging.getLogger(__name__)

class VRPStressTest:
    def __init__(self):
        self.order_gen = OrderGenerator()
        self.driver_gen = DriverGenerator()
        self.optimization_service = OptimizationService()

    def run_stress_test(self, warehouse: dict, order_counts: list, collector: MetricsCollector):
        """
        Run VRP solver with increasing order counts.
        """
        logger.info(f"Starting VRP Stress Test for {warehouse['name']}")
        
        collector.metrics.scenario = "vrp_stress"
        collector.start_monitoring()

        for count in order_counts:
            logger.info(f"Generating {count} orders...")
            orders = self.order_gen.generate_orders(warehouse, count, burst_mode=True)
            drivers = self.driver_gen.generate_drivers(warehouse, count=max(5, count // 20)) # 1 driver per 20 orders

            logger.info(f"Solving VRP for {count} orders with {len(drivers)} drivers...")
            
            start_time = time.time()
            try:
                # Direct service call
                result = self.optimization_service.calculate_routes(
                    orders=orders,
                    drivers=len(drivers),
                    method="ortools",
                    drivers_data=drivers,
                    warehouse_coords=(warehouse['lat'], warehouse['lng']),
                    enable_clustering=True # Critical for scale
                )
                
                duration_ms = (time.time() - start_time) * 1000
                routes = len(result.get('routes', []))
                unassigned = len(result.get('unassigned', []))
                
                # Calculate total distance
                total_dist = sum(r.get('total_distance_km', 0) for r in result.get('routes', []))

                collector.sample_resources()
                collector.record_optimization(duration_ms, routes, unassigned, total_dist)
                
                logger.info(f"Solved {count} orders in {duration_ms:.2f}ms. Routes: {routes}, Unassigned: {unassigned}")

            except Exception as e:
                logger.error(f"VRP Failed for {count} orders: {e}")
                collector.metrics.error_count += 1
        
        collector.stop_monitoring()
