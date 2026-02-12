import random
from typing import List, Dict, Any

class FailureInjector:
    """
    Injects failures into the simulation state to test resilience.
    """

    @staticmethod
    def inject_driver_failures(drivers: List[Dict[str, Any]], failure_pct: float) -> List[Dict[str, Any]]:
        """
        Mark a percentage of available drivers as offline/breakdown.
        """
        target_count = int(len(drivers) * failure_pct)
        candidates = [d for d in drivers if d['status'] == 'available']
        
        failed = random.sample(candidates, min(len(candidates), target_count))
        for d in failed:
            d['status'] = 'offline'
            d['notes'] = 'Simulated breakdown'
        
        return drivers

    @staticmethod
    def inject_warehouse_overload(
        orders: List[Dict[str, Any]],
        target_warehouse_id: str,
        multiplier: float
    ) -> List[Dict[str, Any]]:
        """
        Duplicate orders for a specific warehouse to simulate a surge.
        """
        target_orders = [o for o in orders if o['warehouse_id'] == target_warehouse_id]
        if not target_orders:
            return orders

        extensions = []
        for _ in range(int(multiplier) - 1):
             for o in target_orders:
                 copy = o.copy()
                 copy['id'] = f"{copy['id']}-OVL-{random.randint(100,999)}"
                 extensions.append(copy)
        
        return orders + extensions

    @staticmethod
    def inject_solver_timeout_config(base_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Return a config dict with extremely short timeouts to force solver (VRP) failures.
        """
        cfg = base_config.copy()
        cfg['ortools_time_limit'] = 1 # 1 second timeout
        return cfg
