import random
import math
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

class OrderGenerator:
    """
    Generates synthetic logistics orders with realistic patterns:
    - Geographic clustering around warehouses
    - Time-window constraints
    - Variable package characteristics
    - Burst patterns (peak hours)
    """

    def __init__(self):
        pass

    def _generate_point_in_circle(self, center_lat: float, center_lng: float, radius_km: float) -> tuple[float, float]:
        """Generate a random lat/lng within radius_km of center."""
        radius_deg = radius_km / 111.0  # Approx conversion
        r = radius_deg * math.sqrt(random.random())
        theta = random.random() * 2 * math.pi

        lat = center_lat + r * math.cos(theta)
        lng = center_lng + r * math.sin(theta)
        return lat, lng

    def generate_orders(
        self,
        warehouse: Dict[str, Any],
        count: int,
        burst_mode: bool = False,
        base_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate a batch of orders for a specific warehouse.
        """
        orders = []
        base_time = base_time or datetime.now()
        
        # Parse warehouse location
        wh_lat = float(warehouse['lat'])
        wh_lng = float(warehouse['lng'])
        radius = float(warehouse.get('service_radius_km', 20.0))

        for i in range(count):
            # 1. Location
            lat, lng = self._generate_point_in_circle(wh_lat, wh_lng, radius)

            # 2. Time Windows (optional, 30% of orders)
            has_time_window = random.random() < 0.3
            tw_start, tw_end = None, None
            if has_time_window:
                # Random window between 9 AM and 6 PM
                hour_offset = random.randint(0, 8)
                start_dt = base_time.replace(hour=9, minute=0, second=0) + timedelta(hours=hour_offset)
                end_dt = start_dt + timedelta(hours=2) # 2-hour window
                tw_start = start_dt.isoformat()
                tw_end = end_dt.isoformat()

            # 3. Package details
            weight = round(random.uniform(0.5, 15.0), 1)
            priority = 'high' if random.random() < 0.1 else 'standard'

            # 4. Burst Simulation (Time of creation)
            # If burst_mode, cluster creation times narrowly
            creation_offset = 0
            if burst_mode:
                # Poisson-like burst: most orders created recently
                creation_offset = int(np.random.exponential(scale=10)) # minutes
            else:
                creation_offset = random.randint(0, 120)

            created_at = base_time - timedelta(minutes=creation_offset)

            orders.append({
                "id": f"ORD-{warehouse['id'][-4:]}-{i:04d}",
                "order_id": f"ORD-{warehouse['id'][-4:]}-{i:04d}", # required by solver
                "order_number": f"ORD-{warehouse['id'][-4:]}-{i:04d}",
                "customer_name": f"Customer {i}",
                "delivery_address": f"Simulated Address {i}",
                "lat": lat,
                "lng": lng,
                "lon": lng, # Compatibility
                "weight": weight,
                "priority": priority,
                "time_window_start": tw_start,
                "time_window_end": tw_end,
                "status": "pending",
                "warehouse_id": warehouse['id'],
                "created_at": created_at.isoformat()
            })

        return orders
