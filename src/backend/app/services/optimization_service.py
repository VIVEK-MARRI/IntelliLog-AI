"""
Optimization service — wraps the VRP solver with ML + OSRM integration.

Now supports warehouse-centric depot routing and geographic clustering.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from src.optimization.vrp_solver import plan_routes

from src.backend.app.services.eta_service import ETAService
from src.backend.app.services.routing_service import RoutingService
from src.backend.app.services.clustering_service import cluster_orders
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)

class OptimizationService:
    @staticmethod
    def _build_points(
        orders: List[Dict[str, Any]],
        drivers_data: Optional[List[Dict[str, Any]]],
        warehouse_coords: Optional[Tuple[float, float]] = None,
    ) -> List[Tuple[float, float]]:
        """
        Build points list for routing: depot first, then orders.

        If warehouse_coords is provided, it is used as the single shared depot
        for all vehicles (real-world warehouse-centric routing).
        Otherwise falls back to per-driver locations or centroid.
        """
        points: List[Tuple[float, float]] = []

        # Priority 1: Warehouse as depot (production flow)
        if warehouse_coords:
            points.append(warehouse_coords)
        # Priority 2: Driver current locations as individual depots
        elif drivers_data:
            for d in drivers_data:
                lat = d.get("current_lat")
                lng = d.get("current_lng")
                if lat is None or lng is None:
                    continue
                points.append((float(lat), float(lng)))

        # Fallback: centroid if nothing else
        if not points:
            lats = [float(o["lat"]) for o in orders]
            lngs = [float(o["lon"]) for o in orders]
            if lats and lngs:
                points.append((float(sum(lats) / len(lats)), float(sum(lngs) / len(lngs))))

        for o in orders:
            points.append((float(o["lat"]), float(o["lon"])))

        return points

    @staticmethod
    def calculate_routes(
        orders: List[Dict[str, Any]],
        drivers: int = 3,
        method: str = "greedy",
        use_ml: bool = True,
        drivers_data: Optional[List[Dict[str, Any]]] = None,
        avg_speed_kmph: float = 30.0,
        ortools_time_limit: int = 10,
        use_osrm: bool = True,
        warehouse_coords: Optional[Tuple[float, float]] = None,
        enable_clustering: bool = True,
    ) -> Dict[str, Any]:
        """
        Wrapper around the core VRP solver.

        Args:
            warehouse_coords: (lat, lng) of the warehouse depot. When provided,
                all drivers start and end at this single shared depot.
            enable_clustering: If True, pre-cluster large batches (>50) with DBSCAN.
        """
        logger.info(
            "Starting optimization for %d orders with %d drivers using %s. "
            "Warehouse depot: %s",
            len(orders), drivers, method,
            warehouse_coords or "driver-locations",
        )

        # Pre-cluster for large batches
        if enable_clustering and len(orders) > 50 and method == "ortools":
            clusters = cluster_orders(orders, eps_km=2.0, min_samples=3)
            if len(clusters) > 1:
                logger.info("Pre-clustering: %d clusters for %d orders", len(clusters), len(orders))
                all_routes = []
                all_unassigned = []
                for cid, cluster_orders_list in clusters.items():
                    sub_result = OptimizationService._solve_single(
                        cluster_orders_list, drivers, method, use_ml,
                        drivers_data, avg_speed_kmph, ortools_time_limit,
                        use_osrm, warehouse_coords,
                    )
                    all_routes.extend(sub_result.get("routes", []))
                    all_unassigned.extend(sub_result.get("unassigned", []))

                return {
                    "routes": all_routes,
                    "method": f"{method}+clustered",
                    "n_orders": len(orders),
                    "unassigned": all_unassigned,
                    "debug": {"clusters": len(clusters)},
                }

        return OptimizationService._solve_single(
            orders, drivers, method, use_ml,
            drivers_data, avg_speed_kmph, ortools_time_limit,
            use_osrm, warehouse_coords,
        )

    @staticmethod
    def _solve_single(
        orders: List[Dict[str, Any]],
        drivers: int,
        method: str,
        use_ml: bool,
        drivers_data: Optional[List[Dict[str, Any]]],
        avg_speed_kmph: float,
        ortools_time_limit: int,
        use_osrm: bool,
        warehouse_coords: Optional[Tuple[float, float]],
    ) -> Dict[str, Any]:
        """Solve VRP for a single batch of orders."""
        try:
            predictor = ETAService.predict_eta if use_ml else None

            distance_matrix_km = None
            time_matrix_sec = None
            if method == "ortools" and use_osrm:
                try:
                    points = OptimizationService._build_points(
                        orders, drivers_data, warehouse_coords,
                    )
                    distance_matrix_km, time_matrix_sec = RoutingService.get_osrm_table(points)
                except Exception as e:
                    logger.warning("OSRM routing failed: %s", str(e))
                    if not settings.OSRM_FALLBACK_HAVERSINE:
                        raise

            result = plan_routes(
                orders,
                drivers=drivers,
                method=method,
                use_ml_predictions=use_ml,
                model_predictor=predictor,
                drivers_data=drivers_data,
                avg_speed_kmph=avg_speed_kmph,
                ortools_time_limit=ortools_time_limit,
                distance_matrix_km=distance_matrix_km,
                time_matrix_sec=time_matrix_sec,
                depot_coords=warehouse_coords,
            )
            return result
        except Exception as e:
            logger.error("Optimization failed: %s", str(e))
            raise e
