import random
from typing import List, Dict, Any

class DriverGenerator:
    """
    Generates synthetic driver fleets for warehouses.
    """

    def __init__(self):
        self.vehicle_types = [
            {"type": "bike", "capacity": 10, "speed": 25},
            {"type": "van", "capacity": 40, "speed": 35},
            {"type": "truck", "capacity": 100, "speed": 45}
        ]

    def generate_drivers(
        self,
        warehouse: Dict[str, Any],
        count: int,
        shift_distribution: str = "day"
    ) -> List[Dict[str, Any]]:
        """
        Generate a fleet of drivers assigned to a warehouse.
        """
        drivers = []
        
        for i in range(count):
            # 80% bikes, 15% vans, 5% trucks for last-mile
            r = random.random()
            if r < 0.8:
                v_type = self.vehicle_types[0]
            elif r < 0.95:
                v_type = self.vehicle_types[1]
            else:
                v_type = self.vehicle_types[2]

            # Status distribution
            # 70% available, 20% busy, 10% offline
            s_rand = random.random()
            if s_rand < 0.7:
                status = "available"
            elif s_rand < 0.9:
                status = "busy"
            else:
                status = "offline"

            # Driver start location: usually near warehouse if available
            # Scatter slightly
            lat_offset = random.uniform(-0.01, 0.01)
            lng_offset = random.uniform(-0.01, 0.01)

            drivers.append({
                "id": f"DRV-{warehouse['id'][-4:]}-{i:03d}",
                "name": f"Driver {i} ({warehouse['name']})",
                "phone": f"+91-{random.randint(7000000000, 9999999999)}",
                "status": status,
                "vehicle_type": v_type['type'],
                "vehicle_capacity": v_type['capacity'],
                "avg_speed_kmph": v_type['speed'],
                "current_lat": float(warehouse['lat']) + lat_offset,
                "current_lng": float(warehouse['lng']) + lng_offset,
                "warehouse_id": warehouse['id'],
                "tenant_id": warehouse.get('tenant_id', 'sim-tenant'),
                "shift_start": "09:00",
                "shift_end": "18:00"
            })

        return drivers
