/**
 * Tests for SHAP label translation utilities
 * Ensures no raw Python field names ever appear in visible UI text
 */

import {
  getFeatureLabel,
  getImpactDescription,
  formatImpactMinutes,
  isSafeForDisplay,
  SHAP_FEATURE_LABELS,
} from "../../src/utils/shapLabels";

describe("shapLabels utilities", () => {
  describe("getFeatureLabel", () => {
    it("returns human-readable label for known fields", () => {
      expect(getFeatureLabel("driver_zone_familiarity")).toBe(
        "Driver zone familiarity"
      );
      expect(getFeatureLabel("current_traffic_ratio")).toBe(
        "Current traffic conditions"
      );
      expect(getFeatureLabel("is_peak_hour")).toBe("Rush hour");
      expect(getFeatureLabel("distance_km")).toBe("Delivery distance");
      expect(getFeatureLabel("weather_severity")).toBe("Weather conditions");
      expect(getFeatureLabel("vehicle_type")).toBe("Vehicle type");
      expect(getFeatureLabel("weight")).toBe("Package weight");
    });

    it("converts unknown snake_case to Title Case", () => {
      expect(getFeatureLabel("some_unknown_feature")).toBe(
        "Some Unknown Feature"
      );
      expect(getFeatureLabel("new_feature_xyz")).toBe("New Feature Xyz");
    });

    it("handles empty string gracefully", () => {
      expect(getFeatureLabel("")).toBe("Unknown factor");
      expect(getFeatureLabel(null as any)).toBe("Unknown factor");
    });

    it("covers all SHAP_FEATURE_LABELS keys", () => {
      for (const key of Object.keys(SHAP_FEATURE_LABELS)) {
        const label = getFeatureLabel(key);
        expect(label).toBeTruthy();
        expect(label).not.toContain("_");
      }
    });
  });

  describe("getImpactDescription", () => {
    it("uses existing sentence when clean (no underscores)", () => {
      const result = getImpactDescription(
        "current_traffic_ratio",
        8.2,
        1.67,
        "Heavy traffic on route is adding ~8 minutes"
      );
      expect(result).toBe("Heavy traffic on route is adding ~8 minutes");
      expect(result).not.toContain("_");
    });

    it("rejects sentence with underscore and regenerates", () => {
      const result = getImpactDescription(
        "current_traffic_ratio",
        8.2,
        1.67,
        "current_traffic_ratio is adding 8 min" // bad sentence
      );
      expect(result).not.toContain("current_traffic_ratio");
      expect(result).not.toContain("_ratio");
      expect(result).toMatch(/traffic|Traffic/i);
    });

    it("uses domain-specific description when no existing sentence", () => {
      const result = getImpactDescription(
        "current_traffic_ratio",
        8.2,
        2.1
      );
      expect(result).toBe("Heavy congestion on route");
      expect(result).not.toContain("_");
    });

    it("generates fallback for unknown features", () => {
      const result = getImpactDescription(
        "unknown_feature",
        3.5
      );
      expect(result).toContain("Unknown Feature");
      expect(result).toContain("adding");
      expect(result).toContain("3 minute");
      expect(result).not.toContain("_");
    });

    it("handles peak hour impact", () => {
      const posResult = getImpactDescription("is_peak_hour", 3.0);
      expect(posResult).toBe("Rush hour is adding time");

      const negResult = getImpactDescription("is_peak_hour", -1.5);
      expect(negResult).toBe("Off-peak hours saving time");
    });

    it("handles driver familiarity", () => {
      const unfamiliarResult = getImpactDescription(
        "driver_zone_familiarity",
        5.0,
        0.2
      );
      expect(unfamiliarResult).toBe(
        "Driver is unfamiliar with this area"
      );

      const familiarResult = getImpactDescription(
        "driver_zone_familiarity",
        -2.0,
        0.9
      );
      expect(familiarResult).toBe("Driver knows this area well");
    });

    it("handles distance with feature value", () => {
      const result = getImpactDescription(
        "distance_km",
        4.5,
        12.3
      );
      expect(result).toContain("12.3 km");
      expect(result).not.toContain("_");
    });

    it("handles weather severity", () => {
      const clearResult = getImpactDescription("weather_severity", 0, 0);
      expect(clearResult).toBe("Clear weather");

      const rainResult = getImpactDescription("weather_severity", 1.5, 0.8);
      expect(rainResult).toBe("Light rain affecting route");

      const heavyRainResult = getImpactDescription("weather_severity", 3.0, 2.0);
      expect(heavyRainResult).toBe("Heavy rain slowing traffic");
    });
  });

  describe("formatImpactMinutes", () => {
    it("formats positive minutes correctly", () => {
      expect(formatImpactMinutes(8.2)).toBe("+8 min");
      expect(formatImpactMinutes(3.0)).toBe("+3 min");
      expect(formatImpactMinutes(0.5)).toBe("+1 min"); // rounds
    });

    it("formats negative minutes correctly", () => {
      expect(formatImpactMinutes(-3.1)).toBe("−3 min");
      expect(formatImpactMinutes(-1.0)).toBe("−1 min");
      expect(formatImpactMinutes(-0.4)).toBe("−0 min");
    });

    it("handles zero", () => {
      expect(formatImpactMinutes(0)).toBe("+0 min");
    });

    it("rounds to nearest integer", () => {
      expect(formatImpactMinutes(8.7)).toBe("+9 min");
      expect(formatImpactMinutes(3.2)).toBe("+3 min");
    });
  });

  describe("isSafeForDisplay", () => {
    it("accepts clean English text", () => {
      expect(isSafeForDisplay("Heavy traffic on route")).toBe(true);
      expect(isSafeForDisplay("Driver is unfamiliar with area")).toBe(true);
      expect(isSafeForDisplay("Delivery distance is 12.3 km")).toBe(true);
    });

    it("rejects text with underscore patterns", () => {
      expect(isSafeForDisplay("current_traffic_ratio adding time")).toBe(false);
      expect(isSafeForDisplay("driver_zone_familiarity factor")).toBe(false);
      expect(isSafeForDisplay("historical_avg_traffic_same_hour")).toBe(false);
    });

    it("rejects specific forbidden patterns", () => {
      expect(isSafeForDisplay("some_ratio value")).toBe(false);
      expect(isSafeForDisplay("distance_km metric")).toBe(false);
      expect(isSafeForDisplay("weather_severity level")).toBe(false);
      expect(isSafeForDisplay("vehicle_type_encoded")).toBe(false);
      expect(isSafeForDisplay("value_score rating")).toBe(false);
    });

    it("handles null and empty strings", () => {
      expect(isSafeForDisplay("")).toBe(true);
      expect(isSafeForDisplay(null as any)).toBe(true);
      expect(isSafeForDisplay(undefined as any)).toBe(true);
    });

    it("accepts dashes (which are not underscores)", () => {
      expect(isSafeForDisplay("Light-duty vehicle")).toBe(true);
      expect(isSafeForDisplay("Heavy-rain situation")).toBe(true);
    });
  });

  describe("integration: no underscores in visible text", () => {
    it("produces display text without underscores for all known features", () => {
      const testCases = [
        { feature: "driver_zone_familiarity", impact: 5.0, value: 0.2 },
        { feature: "current_traffic_ratio", impact: 8.2, value: 1.67 },
        { feature: "is_peak_hour", impact: 3.0, value: 1 },
        { feature: "distance_km", impact: 2.5, value: 12.3 },
        { feature: "weather_severity", impact: 2.0, value: 1.0 },
        { feature: "weight", impact: 1.5, value: 18.5 },
        { feature: "vehicle_type", impact: 0.5, value: 0 },
      ];

      for (const testCase of testCases) {
        const label = getFeatureLabel(testCase.feature);
        const description = getImpactDescription(
          testCase.feature,
          testCase.impact,
          testCase.value
        );
        const formatted = formatImpactMinutes(testCase.impact);

        expect(label).not.toContain("_");
        expect(description).not.toContain("_");
        expect(formatted).not.toContain("_");

        expect(isSafeForDisplay(label)).toBe(true);
        expect(isSafeForDisplay(description)).toBe(true);
        expect(isSafeForDisplay(formatted)).toBe(true);
      }
    });
  });
});
