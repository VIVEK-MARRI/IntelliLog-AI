import argparse
import sys
import uuid
import logging
import asyncio
from datetime import datetime

# Setup path to include project root
import os
sys.path.append(os.getcwd())

from src.simulation.generators.warehouse_scenarios import WarehouseScenarios
from src.simulation.stress.vrp_stress_test import VRPStressTest
from src.simulation.stress.api_load_test import APILoadTest
from src.simulation.collectors.metrics_collector import MetricsCollector
from src.simulation.report_generator import ReportGenerator

# Improve logging to stdout
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def main():
    parser = argparse.ArgumentParser(description="IntelliLog-AI Simulation Runner")
    parser.add_argument("--mode", choices=["vrp-stress", "api-load", "full", "report-only"], required=True)
    parser.add_argument("--orders", type=int, default=100)
    parser.add_argument("--drivers", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--scenario", default="hyderabad_central")
    
    args = parser.parse_args()
    
    sim_id = f"sim_{args.mode}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    collector = MetricsCollector(sim_id)
    
    scenario = WarehouseScenarios.get_scenario(args.scenario)
    primary_warehouse = scenario["warehouses"][0]
    
    if args.mode == "vrp-stress":
        tester = VRPStressTest()
        # Scale test: 50, 100... up to target
        counts = [50, 100, 500, 1000] if args.orders >= 1000 else [args.orders]
        tester.run_stress_test(primary_warehouse, counts, collector)
        collector.save(f"src/simulation/results/{sim_id}.json")
        
    elif args.mode == "api_load":
        tester = APILoadTest()
        await tester.run_load_test(primary_warehouse, args.orders, args.concurrency, collector)
        collector.save(f"src/simulation/results/{sim_id}.json")
        
    elif args.mode == "full":
        # Run both
        logger.info("Running FULL simulation suite...")
        
        # 1. VRP Stress
        vrp_tester = VRPStressTest()
        vrp_tester.run_stress_test(primary_warehouse, [100, 500], collector)
        collector.save(f"src/simulation/results/{sim_id}_vrp.json")
        
        # 2. API Load
        collector = MetricsCollector(f"{sim_id}_api") # New collector
        api_tester = APILoadTest()
        await api_tester.run_load_test(primary_warehouse, 1000, 50, collector)
        collector.save(f"src/simulation/results/{sim_id}_api.json")

    elif args.mode == "report-only":
        pass

    # Generate Report
    reporter = ReportGenerator()
    reporter.generate_html_report()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
