"""
Geographic order clustering service.

Uses DBSCAN to cluster orders geographically before routing,
reducing zig-zag routes for large order batches.
"""

import logging
from typing import List, Dict, Any
import numpy as np

logger = logging.getLogger(__name__)

try:
    from sklearn.cluster import DBSCAN
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not installed. Geographic clustering disabled.")


def cluster_orders(
    orders: List[Dict[str, Any]],
    eps_km: float = 2.0,
    min_samples: int = 2,
) -> Dict[int, List[Dict[str, Any]]]:
    """
    Cluster orders geographically using DBSCAN.

    Args:
        orders: List of order dicts with 'lat' and 'lon' keys.
        eps_km: Maximum distance (km) between two orders in a cluster.
        min_samples: Minimum orders to form a cluster.

    Returns:
        Dict mapping cluster_id -> list of orders.
        Noise points (label -1) are grouped into cluster_id=-1.
    """
    if not _SKLEARN_AVAILABLE or len(orders) < min_samples:
        return {0: orders}

    coords = np.array([[float(o["lat"]), float(o["lon"])] for o in orders])
    coords_rad = np.radians(coords)

    db = DBSCAN(
        eps=eps_km / 6371.0,  # Convert km to radians
        min_samples=min_samples,
        metric="haversine",
    )
    labels = db.fit_predict(coords_rad)

    clusters: Dict[int, List[Dict[str, Any]]] = {}
    for order, label in zip(orders, labels):
        label = int(label)
        clusters.setdefault(label, []).append(order)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int((labels == -1).sum())
    logger.info(
        "DBSCAN clustering: %d orders → %d clusters, %d noise points",
        len(orders), n_clusters, n_noise,
    )

    # Merge noise points into the nearest cluster
    if -1 in clusters and n_clusters > 0:
        noise_orders = clusters.pop(-1)
        cluster_centroids = {}
        for cid, c_orders in clusters.items():
            lats = [float(o["lat"]) for o in c_orders]
            lons = [float(o["lon"]) for o in c_orders]
            cluster_centroids[cid] = (np.mean(lats), np.mean(lons))

        for o in noise_orders:
            best_cid = min(
                cluster_centroids,
                key=lambda cid: _haversine_quick(
                    float(o["lat"]), float(o["lon"]),
                    cluster_centroids[cid][0], cluster_centroids[cid][1],
                ),
            )
            clusters[best_cid].append(o)

    return clusters


def _haversine_quick(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Quick haversine distance (km)."""
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
