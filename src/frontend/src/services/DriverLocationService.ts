/**
 * Driver Location Service for React Native
 * Handles GPS tracking and position reporting to backend API
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { AxiosInstance } from "axios";

export interface DriverPosition {
  driver_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading_degrees: number;
  timestamp: string;
  accuracy_meters?: number;
}

export interface PositionUpdateResponse {
  received: boolean;
  deviation_detected: boolean;
  reoptimize_triggered: boolean;
  message?: string;
}

export interface DriverLocationServiceConfig {
  api_base_url: string;
  update_interval_seconds: number;
  background_task_enabled: boolean;
  battery_optimization_enabled: boolean;
  jwt_token: string;
}

const LOCATION_TRACKING_TASK = "driver_location_tracking";
const POSITION_STORAGE_KEY = "@driver_app:last_position";
const CONFIG_STORAGE_KEY = "@driver_app:location_config";

class DriverLocationService {
  private config: DriverLocationServiceConfig;
  private api: AxiosInstance;
  private isTracking: boolean = false;
  private lastUpdateTime: number = 0;
  private updateInterval: number;
  private onStatusChange?: (status: string) => void;
  private onDeviation?: (data: any) => void;

  constructor(config: DriverLocationServiceConfig) {
    this.config = config;
    this.updateInterval = config.update_interval_seconds * 1000;

    // Initialize Axios client with JWT auth
    this.api = axios.create({
      baseURL: config.api_base_url,
      headers: {
        Authorization: `Bearer ${config.jwt_token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    this.setupResponseInterceptor();
  }

  private setupResponseInterceptor() {
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("[LocationService] API Error:", error.message);
        if (error.response?.status === 401) {
          // Token expired, trigger re-authentication
          this.onStatusChange?.("auth_required");
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Start location tracking
   */
  async startTracking(
    driverId: string,
    onStatusChange?: (status: string) => void,
    onDeviation?: (data: any) => void
  ): Promise<boolean> {
    try {
      this.onStatusChange = onStatusChange;
      this.onDeviation = onDeviation;

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.error("[LocationService] Location permission denied");
        this.onStatusChange?.("permission_denied");
        return false;
      }

      // Request background permissions if enabled
      if (this.config.background_task_enabled) {
        const bgStatus = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus.status === "granted") {
          await this.startBackgroundTracking(driverId);
        }
      }

      this.isTracking = true;
      this.onStatusChange?.("tracking_started");

      // Start foreground tracking loop
      await this.foregroundTrackingLoop(driverId);
      return true;
    } catch (error) {
      console.error("[LocationService] Error starting tracking:", error);
      this.onStatusChange?.("error");
      return false;
    }
  }

  /**
   * Foreground tracking loop - updates position at configured interval
   */
  private async foregroundTrackingLoop(driverId: string): Promise<void> {
    while (this.isTracking) {
      try {
        const now = Date.now();
        if (now - this.lastUpdateTime >= this.updateInterval) {
          await this.updatePosition(driverId);
          this.lastUpdateTime = now;
        }

        // Check network and battery status
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          this.onStatusChange?.("offline");
          // Save position locally for sync when online
          await this.cachePosition();
        } else {
          this.onStatusChange?.("tracking");
        }

        // Wait before next check
        await this.sleep(5000);
      } catch (error) {
        console.error("[LocationService] Tracking loop error:", error);
      }
    }
  }

  /**
   * Update driver position once
   */
  private async updatePosition(driverId: string): Promise<void> {
    try {
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 5000,
      });

      const { latitude, longitude, speed: speed_mps, heading, accuracy } = location.coords;

      // Convert m/s to km/h
      const speed_kmh = speed_mps ? speed_mps * 3.6 : 0;

      const position: DriverPosition = {
        driver_id: driverId,
        latitude,
        longitude,
        speed_kmh,
        heading_degrees: heading ?? 0,
        timestamp: new Date().toISOString(),
        accuracy_meters: accuracy ?? undefined,
      };

      // Send to backend
      const response = await this.api.post<PositionUpdateResponse>(
        "/driver/position",
        position
      );

      // Handle deviation alert
      if (response.data.deviation_detected) {
        this.onStatusChange?.("deviated");
        this.onDeviation?.(response.data);
      } else if (response.data.reoptimize_triggered) {
        this.onStatusChange?.("reoptimizing");
      } else {
        this.onStatusChange?.("on_route");
      }

      // Cache last position
      await AsyncStorage.setItem(
        POSITION_STORAGE_KEY,
        JSON.stringify(position)
      );

      console.log(
        `[LocationService] Position updated: (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
      );
    } catch (error) {
      console.error("[LocationService] Position update failed:", error);

      // If offline, cache the position
      if (axios.isAxiosError(error) && !error.response) {
        await this.cachePosition();
      }

      this.onStatusChange?.("sync_failed");
    }
  }

  /**
   * Start background location tracking (requires TaskManager)
   */
  private async startBackgroundTracking(driverId: string): Promise<void> {
    try {
      // Define background task
      TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
        if (error) {
          console.error("[LocationService] Background task error:", error);
          return;
        }

        if (data instanceof Object && "locations" in data) {
          const locations = data.locations as Location.LocationObject[];
          for (const location of locations) {
            try {
              const { latitude, longitude, speed: speed_mps, heading } = location.coords;
              const speed_kmh = speed_mps ? speed_mps * 3.6 : 0;

              const position: DriverPosition = {
                driver_id: driverId,
                latitude,
                longitude,
                speed_kmh,
                heading_degrees: heading ?? 0,
                timestamp: new Date().toISOString(),
              };

              await this.api.post("/driver/position", position);
              await AsyncStorage.setItem(
                POSITION_STORAGE_KEY,
                JSON.stringify(position)
              );
            } catch (err) {
              console.error("[LocationService] Background position send failed:", err);
            }
          }
        }
      });

      // Start watching location
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 50, // Update when moved 50 meters
        timeInterval: this.updateInterval,
        foregroundService: {
          notificationTitle: "Location Tracking Active",
          notificationBody: "IntelliLog driver app is tracking your location",
          notificationColor: "#FF6B35",
        },
      });

      console.log("[LocationService] Background tracking started");
    } catch (error) {
      console.error("[LocationService] Failed to start background tracking:", error);
    }
  }

  /**
   * Stop location tracking
   */
  async stopTracking(): Promise<void> {
    try {
      this.isTracking = false;

      if (this.config.background_task_enabled) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      }

      this.onStatusChange?.("tracking_stopped");
      console.log("[LocationService] Tracking stopped");
    } catch (error) {
      console.error("[LocationService] Error stopping tracking:", error);
    }
  }

  /**
   * Get last known position
   */
  async getLastPosition(): Promise<DriverPosition | null> {
    try {
      const cached = await AsyncStorage.getItem(POSITION_STORAGE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error("[LocationService] Error retrieving last position:", error);
      return null;
    }
  }

  /**
   * Cache position for offline sync
   */
  private async cachePosition(): Promise<void> {
    try {
      const lastPos = await this.getLastPosition();
      if (lastPos) {
        const cached = await AsyncStorage.getItem("@driver_app:position_queue");
        const queue: DriverPosition[] = cached ? JSON.parse(cached) : [];
        queue.push(lastPos);
        await AsyncStorage.setItem(
          "@driver_app:position_queue",
          JSON.stringify(queue)
        );
      }
    } catch (error) {
      console.error("[LocationService] Error caching position:", error);
    }
  }

  /**
   * Sync cached positions when connection restored
   */
  async syncCachedPositions(): Promise<number> {
    try {
      const cached = await AsyncStorage.getItem("@driver_app:position_queue");
      if (!cached) return 0;

      const queue: DriverPosition[] = JSON.parse(cached);
      let synced = 0;

      for (const position of queue) {
        try {
          await this.api.post("/driver/position/batch", [position]);
          synced++;
        } catch (error) {
          console.error("[LocationService] Failed to sync position:", error);
          break;
        }
      }

      if (synced > 0) {
        const remaining = queue.slice(synced);
        if (remaining.length > 0) {
          await AsyncStorage.setItem(
            "@driver_app:position_queue",
            JSON.stringify(remaining)
          );
        } else {
          await AsyncStorage.removeItem("@driver_app:position_queue");
        }
      }

      console.log(
        `[LocationService] Synced ${synced}/${queue.length} cached positions`
      );
      return synced;
    } catch (error) {
      console.error("[LocationService] Error syncing cached positions:", error);
      return 0;
    }
  }

  /**
   * Update JWT token (for token refresh)
   */
  setJWTToken(token: string): void {
    this.config.jwt_token = token;
    this.api.defaults.headers.Authorization = `Bearer ${token}`;
  }

  /**
   * Check if currently tracking
   */
  isTrackingActive(): boolean {
    return this.isTracking;
  }

  /**
   * Utility: sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default DriverLocationService;
