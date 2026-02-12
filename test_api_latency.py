"""
Quick API latency test - start your FastAPI server first
"""
import requests
import time
import numpy as np

API_URL = "http://localhost:8001/api/v1/ml/predict/eta"

sample_request = {
    "order_id": "TEST-001",
    "origin_lat": 40.7128,
    "origin_lng": -74.0060,
    "dest_lat": 40.7580,
    "dest_lng": -73.9855,
    "distance_km": 5.2,
    "time_of_day_hour": 14,
    "day_of_week": 3,
    "weather_condition": "clear",
    "traffic_level": "medium",
    "vehicle_type": "standard"
}

print('='*80)
print('API LATENCY TEST')
print('='*80)
print(f'\nTarget: {API_URL}')
print('Sending 50 requests...\n')

total_requests = 50
latencies = []
success = 0
failed = 0

try:
    for i in range(total_requests):
        try:
            start = time.time()
            response = requests.post(API_URL, json=sample_request, timeout=10)
            latency_ms = (time.time() - start) * 1000
            
            if response.status_code == 200:
                latencies.append(latency_ms)
                success += 1
                if (i + 1) % 5 == 0:
                    print(f'✓ Request {i+1:2d}/{total_requests}: {latency_ms:6.2f}ms')
            else:
                failed += 1
                if (i + 1) % 5 == 0:
                    print(f'⚠️  Request {i+1:2d}/{total_requests}: HTTP {response.status_code}')
        except Exception as e:
            failed += 1
            if i == 0:
                print(f'❌ Connection error: {str(e)}')
                print(f'💡 Start API first: uvicorn src.backend.app.main:app --reload')
                exit(1)
    
    if latencies:
        latencies_arr = np.array(latencies)
        
        print()
        print('='*80)
        print('✅ API LATENCY METRICS')
        print('='*80)
        print(f'\nRequests: {success} successful, {failed} failed')
        print(f'Success Rate: {(success/total_requests)*100:.1f}%\n')
        
        print('⏱️  LATENCY STATISTICS:')
        print(f'   Mean: {np.mean(latencies_arr):.2f}ms')
        print(f'   Median: {np.median(latencies_arr):.2f}ms')
        print(f'   Min: {np.min(latencies_arr):.2f}ms')
        print(f'   Max: {np.max(latencies_arr):.2f}ms')
        print(f'   Std Dev: {np.std(latencies_arr):.2f}ms')
        
        print()
        print('📊 PERCENTILES:')
        p50 = np.percentile(latencies_arr, 50)
        p75 = np.percentile(latencies_arr, 75)
        p95 = np.percentile(latencies_arr, 95)
        p99 = np.percentile(latencies_arr, 99)
        
        print(f'   P50 (Median): {p50:.2f}ms')
        print(f'   P75: {p75:.2f}ms')
        print(f'   P95: {p95:.2f}ms  {"✅ <300ms" if p95 < 300 else "⚠️ >300ms"}')
        print(f'   P99: {p99:.2f}ms')
        
        print()
        if p95 < 300:
            print('✅ SLA VALIDATED: P95 latency <300ms ✓')
        else:
            print(f'⚠️  P95 latency ({p95:.2f}ms) exceeds 300ms target')
    else:
        print('❌ No successful responses captured.')
        print(f'Requests: {success} successful, {failed} failed')
        print('Check API logs for request errors or validation failures.')
        
except Exception as e:
    print(f'Error: {e}')
