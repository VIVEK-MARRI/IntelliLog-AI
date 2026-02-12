import asyncio
import aiohttp
import time
import logging
import numpy as np
from src.simulation.generators.order_generator import OrderGenerator
from src.simulation.collectors.metrics_collector import MetricsCollector

logger = logging.getLogger(__name__)

class APILoadTest:
    def __init__(self, base_url: str = "http://localhost:8000/api/v1"):
        self.base_url = base_url
        self.order_gen = OrderGenerator()

    async def _send_order(self, session, order):
        start = time.time()
        try:
            async with session.post(f"{self.base_url}/orders/", json=order, timeout=10) as response:
                await response.read() # Read body
                return time.time() - start, response.status
        except Exception:
            return time.time() - start, 599

    async def run_load_test(self, warehouse: dict, total_orders: int, concurrency: int, collector: MetricsCollector):
        """
        Send concurrent order creation requests.
        """
        from datetime import datetime
        
        logger.info(f"Starting API Load Test: {total_orders} orders @ {concurrency} concurrent")
        collector.metrics.scenario = "api_load"
        collector.start_monitoring()
        
        orders = self.order_gen.generate_orders(warehouse, total_orders)
        
        # Convert to Pydantic-friendly dicts
        payloads = []
        for o in orders:
             # Match OrderCreate schema
             o['time_window_start'] = o['time_window_start'] or datetime.now().isoformat()
             o['time_window_end'] = o['time_window_end'] or datetime.now().isoformat()
             payloads.append(o)

        latencies = []
        status_codes = []
        start_ts = time.time()

        async with aiohttp.ClientSession() as session:
            tasks = []
            for i, p in enumerate(payloads):
                tasks.append(self._send_order(session, p))
                
                if len(tasks) >= concurrency:
                    results = await asyncio.gather(*tasks)
                    for lat, status in results:
                        latencies.append(lat)
                        status_codes.append(status)
                    tasks = []
                    collector.sample_resources()
            
            if tasks:
                results = await asyncio.gather(*tasks)
                for lat, status in results:
                    latencies.append(lat)
                    status_codes.append(status)

        duration = time.time() - start_ts
        throughput = total_orders / duration
        p95 = np.percentile(latencies, 95) * 1000 # ms
        errors = sum(1 for s in status_codes if s >= 400)
        timeouts = sum(1 for s in status_codes if s == 599)
        
        collector.record_api_stats(p95, throughput, errors, timeouts)
        collector.stop_monitoring()
        
        logger.info(f"API Test Complete: {throughput:.2f} req/s, p95={p95:.2f}ms, Errors={errors}")
