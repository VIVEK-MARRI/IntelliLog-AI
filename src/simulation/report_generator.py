import json
import glob
import os
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime

class ReportGenerator:
    def __init__(self, results_dir: str = "src/simulation/results"):
        self.results_dir = results_dir

    def generate_html_report(self):
        """
        Scan results directory and generate a consolidated HTML report.
        """
        json_files = glob.glob(os.path.join(self.results_dir, "*.json"))
        data = []
        for f in json_files:
            try:
                with open(f, 'r') as fp:
                    data.append(json.load(fp))
            except Exception:
                continue

        if not data:
            print("No results found to generate report.")
            return

        # Sort by timestamp
        data.sort(key=lambda x: x['start_time'])
        
        # 1. Scaling Performance (Orders vs Optimization Time)
        vrp_data = [d for d in data if d['scenario'] == 'vrp_stress']
        
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=("Optimization Time Scaling", "Memory Usage Scaling", "Route Efficiency", "API Latency Distribution")
        )

        if vrp_data:
            x_orders = [d.get('total_orders', 0) for d in vrp_data]
            y_time = [d.get('optimization_time_ms', 0) for d in vrp_data]
            y_mem = [d.get('max_memory_mb', 0) for d in vrp_data]
            y_routes = [d.get('routes_created', 0) for d in vrp_data]

            fig.add_trace(go.Scatter(x=x_orders, y=y_time, mode='lines+markers', name='Opt Time (ms)'), row=1, col=1)
            fig.add_trace(go.Scatter(x=x_orders, y=y_mem, mode='lines+markers', name='Memory (MB)'), row=1, col=2)
            fig.add_trace(go.Scatter(x=x_orders, y=y_routes, mode='lines+markers', name='Routes Created'), row=2, col=1)

        # 2. API Load Stats
        api_data = [d for d in data if d['scenario'] == 'api_load']
        if api_data:
            x_concurrency = [d.get('simulation_id', '').split('_')[-1] for d in api_data] # Mock x-axis
            y_latency = [d.get('api_latency_p95_ms', 0) for d in api_data]
            
            fig.add_trace(go.Bar(x=x_concurrency, y=y_latency, name='p95 Latency (ms)'), row=2, col=2)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(self.results_dir, f"report_{timestamp}.html")
        fig.write_html(output_path)
        print(f"Report generated: {output_path}")
