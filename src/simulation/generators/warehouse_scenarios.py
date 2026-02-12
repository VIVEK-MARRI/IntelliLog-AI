from typing import List, Dict, Any

class WarehouseScenarios:
    """
    Predefined scenarios for simulation.
    """

    @staticmethod
    def get_scenario(name: str) -> Dict[str, Any]:
        scenarios = {
            "hyderabad_central": {
                "warehouses": [
                    {
                        "id": "WH-HYD-001",
                        "name": "Hyderabad Central Hub",
                        "lat": 17.3850,
                        "lng": 78.4867,
                        "service_radius_km": 25.0,
                        "capacity": 2000
                    },
                    {
                        "id": "WH-HYD-002",
                        "name": "HITEC City DC",
                        "lat": 17.444, # Approx
                        "lng": 78.377, # Approx
                        "service_radius_km": 15.0,
                        "capacity": 1000
                    }
                ],
                "defaults": {
                    "orders_per_wh": 50,
                    "drivers_per_wh": 5
                }
            },
            "bangalore_metro": {
                "warehouses": [
                    {
                        "id": "WH-BLR-001",
                        "name": "Whitefield Hub",
                        "lat": 12.970,
                        "lng": 77.750,
                        "service_radius_km": 20.0,
                        "capacity": 1500
                    },
                    {
                        "id": "WH-BLR-002",
                        "name": "Koramangala DC",
                        "lat": 12.935,
                        "lng": 77.625,
                        "service_radius_km": 10.0,
                        "capacity": 800
                    }
                ],
                "defaults": {
                    "orders_per_wh": 100,
                    "drivers_per_wh": 10
                }
            },
            "mega_scale": {
                 # 5 Simulated Warehouses around Hyderabad/Bangalore
                "warehouses": [
                    {"id": f"WH-MEGA-{i}", "name": f"Mega Hub {i}", "lat": 17.385 + (i*0.05), "lng": 78.4867 + (i*0.05), "service_radius_km": 30.0}
                    for i in range(5)
                ],
                "defaults": {
                    "orders_per_wh": 1000,
                    "drivers_per_wh": 50
                }
            }
        }
        return scenarios.get(name, scenarios["hyderabad_central"])

    @staticmethod
    def list_scenarios() -> List[str]:
        return ["hyderabad_central", "bangalore_metro", "mega_scale"]
