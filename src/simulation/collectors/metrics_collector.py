from dataclasses import dataclass, asdict, field
from datetime import datetime
import psutil
import time
import json
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

@dataclass
class SimulationMetrics:
    simulation_id: str
    scenario: str
    start_time: str
    end_time: str = ""
    duration_sec: float = 0.0
    
    total_orders: int = 0
    total_drivers: int = 0
    total_warehouses: int = 0
    
    # Performance
    optimization_time_ms: float = 0.0
    api_latency_p95_ms: float = 0.0
    api_throughput_rps: float = 0.0
    
    # Resources
    max_cpu_percent: float = 0.0
    max_memory_mb: float = 0.0
    
    # Outcome
    routes_created: int = 0
    unassigned_orders: int = 0
    total_distance_km: float = 0.0
    
    # Errors
    error_count: int = 0
    timeout_count: int = 0
    
    def to_json(self):
        return json.dumps(asdict(self), indent=2)

class MetricsCollector:
    def __init__(self, simulation_id: str):
        self.metrics = SimulationMetrics(
            simulation_id=simulation_id,
            scenario="unknown",
            start_time=datetime.now().isoformat()
        )
        self.process = psutil.Process()
        self.cpu_samples = []
        self.mem_samples = []
        self.start_ts = time.time()

    def start_monitoring(self):
        # Initial snapshot
        self.sample_resources()

    def sample_resources(self):
        try:
            cpu = self.process.cpu_percent(interval=None)
            mem = self.process.memory_info().rss / (1024 * 1024) # MB
            self.cpu_samples.append(cpu)
            self.mem_samples.append(mem)
        except Exception:
            pass

    def stop_monitoring(self):
        self.metrics.end_time = datetime.now().isoformat()
        self.metrics.duration_sec = time.time() - self.start_ts
        if self.cpu_samples:
            self.metrics.max_cpu_percent = max(self.cpu_samples)
        if self.mem_samples:
            self.metrics.max_memory_mb = max(self.mem_samples)

    def record_optimization(self, duration_ms: float, routes: int, unassigned: int, distance: float):
        self.metrics.optimization_time_ms = duration_ms
        self.metrics.routes_created = routes
        self.metrics.unassigned_orders = unassigned
        self.metrics.total_distance_km = distance

    def record_api_stats(self, p95: float, throughput: float, errors: int, timeouts: int):
        self.metrics.api_latency_p95_ms = p95
        self.metrics.api_throughput_rps = throughput
        self.metrics.error_count = errors
        self.metrics.timeout_count = timeouts

    def save(self, filepath: str):
        with open(filepath, 'w') as f:
            f.write(self.metrics.to_json())
        logger.info(f"Metrics saved to {filepath}")
