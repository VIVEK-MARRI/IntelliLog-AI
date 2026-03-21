/**
 * SHAP Explanation Field Label Translation Layer
 *
 * Converts raw Python field names to human-readable labels for the dashboard.
 * Ensures that NO raw Python field names ever appear in visible UI text.
 *
 * This is the single source of truth for all SHAP field translations.
 */

/**
 * Maps raw Python field names to dispatcher-friendly labels.
 * Used throughout the dashboard whenever a SHAP factor name is displayed.
 */
export const SHAP_FEATURE_LABELS: Record<string, string> = {
  // Traffic features
  current_traffic_ratio: "Current traffic conditions",
  historical_avg_traffic_same_hour: "Typical traffic at this time",
  historical_std_traffic_same_hour: "Traffic unpredictability",
  effective_travel_time_min: "Adjusted travel time",

  // Time features
  is_peak_hour: "Rush hour",
  time_of_day: "Time of day",
  time_of_day_encoded: "Time of day",
  day_of_week: "Day of week",
  hour_of_day: "Hour of day",

  // Route features
  distance_km: "Delivery distance",
  distance: "Delivery distance",

  // Driver features
  driver_zone_familiarity: "Driver zone familiarity",
  driver_familiarity_score: "Driver zone familiarity",
  zone_familiarity: "Driver zone familiarity",
  driver_experience_in_zone: "Driver zone familiarity",

  // Package features
  weight: "Package weight",
  package_weight: "Package weight",
  weight_kg: "Package weight",

  // Vehicle features
  vehicle_type: "Vehicle type",
  vehicle_type_encoded: "Vehicle type",
  vehicle_capacity: "Vehicle capacity",

  // Weather features
  weather_severity: "Weather conditions",
  weather_condition: "Weather conditions",
  weather: "Weather conditions",

  // Other
  base_delivery_time: "Base delivery time",
  route_complexity: "Route complexity",
};

/**
 * Domain-specific descriptions for each factor type.
 * Generates human-readable explanations based on impact direction and values.
 */
export const SHAP_IMPACT_DESCRIPTIONS: Record<
  string,
  (value: number, featureValue?: number) => string
> = {
  current_traffic_ratio: (impact, val) => {
    if (!val) {
      return impact > 0 ? "Heavy traffic on route" : "Light traffic on route";
    }
    if (val >= 2.0) return "Heavy congestion on route";
    if (val >= 1.5) return "Moderate traffic on route";
    if (val >= 1.2) return "Light traffic on route";
    return "Free-flowing traffic";
  },

  historical_avg_traffic_same_hour: (impact) =>
    impact > 0
      ? "This route is typically busier at this time"
      : "This route is typically clear at this time",

  historical_std_traffic_same_hour: (impact) =>
    impact > 0
      ? "High traffic variability at this time"
      : "Traffic is predictable at this time",

  is_peak_hour: (impact) =>
    impact > 0 ? "Rush hour is adding time" : "Off-peak hours saving time",

  time_of_day: (impact) =>
    impact > 0
      ? "Delivery at a busy time of day"
      : "Delivery at a lighter time of day",

  driver_zone_familiarity: (impact) =>
    impact > 0
      ? "Driver is unfamiliar with this area"
      : "Driver knows this area well",

  driver_familiarity_score: (impact) =>
    impact > 0
      ? "Driver is unfamiliar with this area"
      : "Driver knows this area well",

  zone_familiarity: (impact) =>
    impact > 0
      ? "Driver is unfamiliar with this area"
      : "Driver knows this area well",

  distance_km: (impact, val) =>
    val ? `Delivery distance is ${val.toFixed(1)} km` : "Delivery distance",

  distance: (impact, val) =>
    val ? `Delivery distance is ${val.toFixed(1)} km` : "Delivery distance",

  weight: (impact, val) =>
    val
      ? `Package is ${val.toFixed(1)} kg`
      : impact > 0
        ? "Heavy package slowing delivery"
        : "Light package",

  package_weight: (impact, val) =>
    val
      ? `Package is ${val.toFixed(1)} kg`
      : impact > 0
        ? "Heavy package slowing delivery"
        : "Light package",

  weight_kg: (impact, val) =>
    val
      ? `Package is ${val.toFixed(1)} kg`
      : impact > 0
        ? "Heavy package slowing delivery"
        : "Light package",

  weather_severity: (impact, val) => {
    if (!val || val === 0) return "Clear weather";
    if (val <= 1) return "Light rain affecting route";
    if (val <= 2) return "Heavy rain slowing traffic";
    return "Severe weather conditions";
  },

  weather_condition: (impact, val) => {
    if (!val || val === 0) return "Clear weather";
    if (impact > 0) return "Bad weather conditions affecting delivery";
    return "Good weather conditions";
  },

  weather: (impact, val) => {
    if (!val || val === 0) return "Clear weather";
    if (impact > 0) return "Bad weather conditions affecting delivery";
    return "Good weather conditions";
  },

  vehicle_type: (impact) =>
    impact > 0
      ? "Vehicle type affecting delivery speed"
      : "Vehicle well-suited for this delivery",

  vehicle_capacity: (impact) =>
    impact > 0
      ? "Vehicle capacity limiting efficiency"
      : "Vehicle capacity adequate for this delivery",

  effective_travel_time_min: (impact, val) =>
    val
      ? `Adjusted travel time is ${val.toFixed(1)} minutes`
      : "Travel time adjusted for conditions",

  base_delivery_time: (impact, val) =>
    val
      ? `Base time estimate is ${val.toFixed(1)} minutes`
      : "Route baseline",

  route_complexity: (impact) =>
    impact > 0
      ? "Complex route with many stops"
      : "Straightforward route",
};

/**
 * Convert raw Python field name to human-readable label.
 * Falls back to Title Case conversion for unknown fields.
 *
 * @param featureName - Raw Python field name (e.g., "current_traffic_ratio")
 * @returns Human-readable label (e.g., "Current traffic conditions")
 */
export function getFeatureLabel(featureName: string): string {
  if (!featureName) return "Unknown factor";

  const label = SHAP_FEATURE_LABELS[featureName];
  if (label) return label;

  // Fallback: convert snake_case to Title Case
  return featureName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Generate human-readable description for a SHAP factor's impact.
 *
 * Strategy:
 * 1. If an existing sentence is provided and contains NO underscore, use it
 * 2. Otherwise, use domain-specific description generator if available
 * 3. Fall back to generic description using the feature label
 *
 * @param featureName - Raw Python field name
 * @param impactMinutes - Numeric impact in minutes
 * @param featureValue - Optional actual feature value for context
 * @param existingSentence - Optional sentence already generated by SHAP engine
 * @returns Human-readable description of the factor's impact
 */
export function getImpactDescription(
  featureName: string,
  impactMinutes: number,
  featureValue?: number,
  existingSentence?: string
): string {
  // Validate that existing sentence doesn't contain raw Python field names
  if (existingSentence && !existingSentence.includes("_")) {
    return existingSentence;
  }

  // Use domain-specific description generator if available
  const descFn = SHAP_IMPACT_DESCRIPTIONS[featureName];
  if (descFn) {
    return descFn(impactMinutes, featureValue);
  }

  // Final fallback: generic description using human label
  const label = getFeatureLabel(featureName);
  const direction = impactMinutes > 0 ? "adding" : "saving";
  const mins = Math.abs(Math.round(impactMinutes));
  return `${label} is ${direction} ~${mins} minute${mins !== 1 ? "s" : ""}`;
}

/**
 * Format impact minutes for display.
 * Converts numeric impact to a sign-prefixed string like "+8 min" or "-3 min".
 *
 * @param minutes - Impact in minutes (positive or negative)
 * @returns Formatted string (e.g., "+8 min", "-3 min")
 */
export function formatImpactMinutes(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const sign = minutes > 0 ? "+" : "−"; // Using minus sign (−) for negative
  return `${sign}${abs} min`;
}

/**
 * Validate that a text string contains no raw Python field name patterns.
 * Used as a safety net in the frontend to catch backend issues.
 *
 * @param text - Text to validate
 * @returns true if text is safe (no raw field patterns), false otherwise
 */
export function isSafeForDisplay(text: string): boolean {
  if (!text) return true;

  const FORBIDDEN_PATTERNS = [
    "_ratio",
    "_km",
    "_encoded",
    "_min",
    "_score",
    "_severity",
    "_familiarity",
    "_avg_",
    "_std_",
    "_condition",
  ];

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (text.includes(pattern)) {
      return false;
    }
  }

  return true;
}
