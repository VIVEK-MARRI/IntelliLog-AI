/**
 * Driver Position Tracking Component
 * Shows GPS status, current coordinates, and synchronization state
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as NetInfo from "@react-native-community/netinfo";
import DriverLocationService, { DriverPosition } from "../services/DriverLocationService";

export interface DriverTrackingUIProps {
  driverId: string;
  apiBaseUrl: string;
  jwtToken: string;
  updateIntervalSeconds?: number;
  enableBackground?: boolean;
}

const DriverTrackingUI: React.FC<DriverTrackingUIProps> = ({
  driverId,
  apiBaseUrl,
  jwtToken,
  updateIntervalSeconds = 10,
  enableBackground = true,
}) => {
  const [locationService, setLocationService] = useState<DriverLocationService | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [status, setStatus] = useState<string>("idle");
  const [lastPosition, setLastPosition] = useState<DriverPosition | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number } | null>(null);

  // Initialize location service
  useEffect(() => {
    const service = new DriverLocationService({
      api_base_url: apiBaseUrl,
      update_interval_seconds: updateIntervalSeconds,
      background_task_enabled: enableBackground,
      battery_optimization_enabled: true,
      jwt_token: jwtToken,
    });

    setLocationService(service);

    // Subscribe to network status
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
      
      if (state.isConnected && locationService) {
        // Sync cached positions when connection restored
        locationService.syncCachedPositions().then((count) => {
          if (count > 0) {
            Alert.alert("Sync Complete", `Synced ${count} cached positions`);
          }
        });
      }
    });

    return () => unsubscribe();
  }, [apiBaseUrl, jwtToken, updateIntervalSeconds, enableBackground]);

  // Start tracking
  const handleStartTracking = async () => {
    if (!locationService) {
      Alert.alert("Error", "Location service not initialized");
      return;
    }

    const success = await locationService.startTracking(
      driverId,
      (newStatus) => {
        setStatus(newStatus);
        
        // Update UI based on status
        if (newStatus === "tracking_started") {
          setIsTracking(true);
        } else if (newStatus === "tracking_stopped") {
          setIsTracking(false);
        }
      },
      (deviationData) => {
        Alert.alert(
          "Route Deviation Detected",
          `You are ${deviationData.perpendicular_distance_m?.toFixed(0)}m off your planned route. Please return to the route.`
        );
      }
    );

    if (!success) {
      Alert.alert("Error", "Failed to start location tracking");
    }
  };

  // Stop tracking
  const handleStopTracking = async () => {
    if (locationService) {
      await locationService.stopTracking();
      setIsTracking(false);
    }
  };

  // Refresh last position
  const handleRefreshPosition = async () => {
    if (locationService) {
      const lastPos = await locationService.getLastPosition();
      setLastPosition(lastPos);
    }
  };

  // Manually sync cached positions
  const handleSyncPositions = async () => {
    if (!locationService) return;

    setSyncProgress({ synced: 0, total: 0 });
    const synced = await locationService.syncCachedPositions();
    setSyncProgress(null);

    if (synced > 0) {
      Alert.alert("Sync Complete", `Successfully synced ${synced} positions`);
    } else {
      Alert.alert("Info", "No cached positions to sync");
    }
  };

  // Get status color
  const getStatusColor = (currentStatus: string) => {
    switch (currentStatus) {
      case "on_route":
        return "#4CAF50"; // Green
      case "deviated":
        return "#FF6B6B"; // Red
      case "reoptimizing":
        return "#FF9800"; // Orange
      case "offline":
        return "#9E9E9E"; // Gray
      case "sync_failed":
        return "#FF6B6B"; // Red
      default:
        return "#2196F3"; // Blue
    }
  };

  // Get status icon
  const getStatusIcon = (currentStatus: string) => {
    switch (currentStatus) {
      case "on_route":
        return "check-circle";
      case "deviated":
        return "alert-circle";
      case "reoptimizing":
        return "sync";
      case "offline":
        return "wifi-off";
      case "tracking":
        return "crosshairs-gps";
      default:
        return "information";
    }
  };

  return (
    <View style={styles.container}>
      {/* Status Header */}
      <View style={[styles.statusCard, { borderLeftColor: getStatusColor(status) }]}>
        <View style={styles.statusHeader}>
          <MaterialCommunityIcons
            name={getStatusIcon(status)}
            size={24}
            color={getStatusColor(status)}
          />
          <Text style={styles.statusTitle}>
            {isTracking ? "Tracking Active" : "Tracking Inactive"}
          </Text>
        </View>
        <Text style={styles.statusText}>{status.replace(/_/g, " ").toUpperCase()}</Text>
        {!isConnected && (
          <Text style={styles.offlineWarning}>📡 OFFLINE MODE</Text>
        )}
      </View>

      {/* Position Display */}
      {lastPosition && (
        <View style={styles.positionCard}>
          <Text style={styles.cardTitle}>Current Position</Text>
          <View style={styles.positionRow}>
            <Text style={styles.label}>Latitude:</Text>
            <Text style={styles.value}>{lastPosition.latitude.toFixed(6)}</Text>
          </View>
          <View style={styles.positionRow}>
            <Text style={styles.label}>Longitude:</Text>
            <Text style={styles.value}>{lastPosition.longitude.toFixed(6)}</Text>
          </View>
          <View style={styles.positionRow}>
            <Text style={styles.label}>Speed:</Text>
            <Text style={styles.value}>{lastPosition.speed_kmh.toFixed(1)} km/h</Text>
          </View>
          <View style={styles.positionRow}>
            <Text style={styles.label}>Heading:</Text>
            <Text style={styles.value}>{lastPosition.heading_degrees.toFixed(0)}°</Text>
          </View>
          <View style={styles.positionRow}>
            <Text style={styles.label}>Updated:</Text>
            <Text style={styles.value}>
              {new Date(lastPosition.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.buttonContainer}>
        {!isTracking ? (
          <TouchableOpacity
            style={[styles.button, styles.startButton]}
            onPress={handleStartTracking}
          >
            <MaterialCommunityIcons name="play-circle" size={20} color="white" />
            <Text style={styles.buttonText}>Start Tracking</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={handleStopTracking}
          >
            <MaterialCommunityIcons name="stop-circle" size={20} color="white" />
            <Text style={styles.buttonText}>Stop Tracking</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.refreshButton]}
          onPress={handleRefreshPosition}
        >
          <MaterialCommunityIcons name="refresh" size={20} color="white" />
          <Text style={styles.buttonText}>Refresh</Text>
        </TouchableOpacity>

        {!isConnected && (
          <TouchableOpacity
            style={[styles.button, styles.syncButton]}
            onPress={handleSyncPositions}
            disabled={syncProgress !== null}
          >
            {syncProgress ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text style={styles.buttonText}>Syncing...</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="cloud-upload" size={20} color="white" />
                <Text style={styles.buttonText}>Sync Offline Data</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Network Status */}
      <View style={styles.networkStatus}>
        <View
          style={[
            styles.networkIndicator,
            { backgroundColor: isConnected ? "#4CAF50" : "#FF6B6B" },
          ]}
        />
        <Text style={styles.networkText}>
          {isConnected ? "Connected" : "Offline (Data will be synced)"}
        </Text>
      </View>

      {/* Driver ID Display */}
      <View style={styles.footerInfo}>
        <Text style={styles.driverId}>Driver: {driverId}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 16,
  },
  statusCard: {
    backgroundColor: "white",
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    color: "#333",
  },
  statusText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 32,
    textTransform: "capitalize",
  },
  offlineWarning: {
    fontSize: 12,
    color: "#FF6B6B",
    marginTop: 8,
    fontWeight: "600",
  },
  positionCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  positionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  label: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 8,
  },
  buttonContainer: {
    gap: 8,
    marginBottom: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  startButton: {
    backgroundColor: "#4CAF50",
  },
  stopButton: {
    backgroundColor: "#FF6B6B",
  },
  refreshButton: {
    backgroundColor: "#2196F3",
  },
  syncButton: {
    backgroundColor: "#FF9800",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  networkStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  networkIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  networkText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  footerInfo: {
    alignItems: "center",
    paddingVertical: 8,
  },
  driverId: {
    fontSize: 12,
    color: "#999",
  },
});

export default DriverTrackingUI;
