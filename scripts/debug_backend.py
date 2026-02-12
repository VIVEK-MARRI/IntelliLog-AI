import sys
import os
import threading
import time
import requests
import uvicorn
import logging

# Add project root to path
sys.path.append(os.getcwd())

from src.backend.app.main import app

def run_server():
    # Run server on port 8002 to avoid conflict with running docker container (8001/8000)
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="debug")

if __name__ == "__main__":
    print("--- Starting Backend in Background Thread ---")
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Wait for server to start
    print("Waiting for server startup...")
    time.sleep(5)
    
    print("--- Sending Debug Request ---")
    try:
        response = requests.get("http://127.0.0.1:8002/api/v1/orders/", timeout=5)
        print(f"Response Status: {response.status_code}")
        print("Response Content:")
        print(response.text)
    except Exception as e:
        print(f"Request failed: {e}")
    
    # Keep alive briefly to let logs flush
    time.sleep(2)
    print("--- Done ---")
