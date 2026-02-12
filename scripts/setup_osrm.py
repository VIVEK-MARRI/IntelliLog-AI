import os
import requests
import sys
from pathlib import Path

# Configuration
DATA_DIR = Path("data/osrm")
PBF_URL = "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf"
PBF_FILENAME = "southern-zone-latest.osm.pbf"

def download_file(url, dest_path):
    print(f"Downloading {url}...")
    response = requests.get(url, stream=True)
    response.raise_for_status()
    with open(dest_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"Downloaded to {dest_path}")

def main():
    if not DATA_DIR.exists():
        print(f"Creating directory {DATA_DIR}...")
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    pbf_path = DATA_DIR / PBF_FILENAME
    
    if not pbf_path.exists():
        try:
            download_file(PBF_URL, pbf_path)
        except Exception as e:
            print(f"Failed to download map data: {e}")
            sys.exit(1)
    else:
        print(f"Map data already exists at {pbf_path}")

    # Docker commands to process the map data
    print("\n--- Map Data Ready ---")
    print("Now we need to process the map data using OSRM Docker image.")
    print("Run the following commands manually:\n")

    cwd = os.getcwd().replace("\\", "/")
    
    cmds = [
        f"docker run -t -v {cwd}/data/osrm:/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/{PBF_FILENAME}",
        f"docker run -t -v {cwd}/data/osrm:/data osrm/osrm-backend osrm-partition /data/{PBF_FILENAME}",
        f"docker run -t -v {cwd}/data/osrm:/data osrm/osrm-backend osrm-customize /data/{PBF_FILENAME}"
    ]

    for cmd in cmds:
        print(f"  {cmd}")

if __name__ == "__main__":
    main()
