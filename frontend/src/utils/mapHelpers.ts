import type { LatLngBoundsExpression } from 'leaflet';

/**
 * Map utility functions for Leaflet operations
 */

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Calculate bounds from array of coordinates
 */
export const calculateBounds = (
  coords: Array<{ latitude: number; longitude: number }>
): MapBounds | null => {
  if (coords.length === 0) return null;

  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
};

/**
 * Convert MapBounds to Leaflet LatLngBoundsExpression
 */
export const boundsToLatLngBounds = (bounds: MapBounds): LatLngBoundsExpression => {
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
};

/**
 * Calculate distance between two points (Haversine formula)
 * Returns distance in kilometers
 */
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if point is within bounds
 */
export const isWithinBounds = (
  point: { latitude: number; longitude: number },
  bounds: MapBounds
): boolean => {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
};

/**
 * Get zoom level based on bounds
 */
export const getZoomForBounds = (bounds: MapBounds): number => {
  const latRange = bounds.north - bounds.south;
  const lngRange = bounds.east - bounds.west;
  const maxRange = Math.max(latRange, lngRange);

  if (maxRange > 10) return 6;
  if (maxRange > 5) return 7;
  if (maxRange > 1) return 9;
  if (maxRange > 0.5) return 10;
  if (maxRange > 0.1) return 12;
  return 14;
};

/**
 * Add padding to bounds (as percentage)
 */
export const padBounds = (bounds: MapBounds, padding: number = 0.1): MapBounds => {
  const latPad = (bounds.north - bounds.south) * padding;
  const lngPad = (bounds.east - bounds.west) * padding;

  return {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east: bounds.east + lngPad,
    west: bounds.west - lngPad,
  };
};

/**
 * Get center of bounds
 */
export const getBoundsCenter = (bounds: MapBounds): { latitude: number; longitude: number } => {
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.east + bounds.west) / 2,
  };
};

/**
 * Cluster nearby points within threshold distance (km)
 */
export const clusterPoints = (
  points: Array<{ id: string; latitude: number; longitude: number }>,
  thresholdKm: number = 1
): string[][] => {
  const clusters: string[][] = [];
  const visited = new Set<string>();

  points.forEach((point) => {
    if (visited.has(point.id)) return;

    const cluster = [point.id];
    visited.add(point.id);

    points.forEach((other) => {
      if (visited.has(other.id)) return;

      const distance = calculateDistance(
        point.latitude,
        point.longitude,
        other.latitude,
        other.longitude
      );

      if (distance <= thresholdKm) {
        cluster.push(other.id);
        visited.add(other.id);
      }
    });

    clusters.push(cluster);
  });

  return clusters;
};
