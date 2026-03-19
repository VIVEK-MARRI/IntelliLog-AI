import React, { useEffect, useState } from "react";
import styles from "./ETAExplanationCard.module.css";

interface ExplanationFactor {
  feature: string;
  impact_minutes: number;
  direction: "positive" | "negative";
  sentence: string;
  importance_rank: number;
  shap_value: number;
  feature_value?: number;
}

interface ExplanationData {
  order_id: string;
  eta_minutes: number;
  eta_p10: number;
  eta_p90: number;
  confidence_within_5min: number;
  confidence_badge: "high" | "medium" | "low";
  summary: string;
  factors: ExplanationFactor[];
  what_would_help?: string;
}

interface ETAExplanationCardProps {
  orderId: string;
  compact?: boolean;
  onExpand?: () => void;
}

const ETAExplanationCard: React.FC<ETAExplanationCardProps> = ({
  orderId,
  compact = false,
  onExpand,
}) => {
  const [explanation, setExplanation] = useState<ExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    fetchExplanation();
  }, [orderId]);

  const fetchExplanation = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/predictions/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: orderId,
          include_driver_context: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setExplanation(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch explanation");
      console.error("Error fetching explanation:", err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (badge: string): string => {
    switch (badge) {
      case "high":
        return "#10b981"; // Green
      case "medium":
        return "#f59e0b"; // Amber
      case "low":
        return "#ef4444"; // Red
      default:
        return "#6b7280"; // Gray
    }
  };

  const getConfidenceLabel = (badge: string): string => {
    switch (badge) {
      case "high":
        return "High confidence";
      case "medium":
        return "Medium confidence";
      case "low":
        return "Low confidence";
      default:
        return "Unknown";
    }
  };

  const getFactorIcon = (direction: string): string => {
    return direction === "positive" ? "⬆️" : "⬇️";
  };

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>Loading explanation...</div>
      </div>
    );
  }

  if (error || !explanation) {
    return (
      <div className={styles.card}>
        <div className={styles.error}>
          {error ? `Error: ${error}` : "No explanation available"}
        </div>
      </div>
    );
  }

  // Compact view - just the ETA and top factor pill
  if (compact && !expanded) {
    const topFactor = explanation.factors[0];
    return (
      <div className={styles.cardCompact} onClick={() => {
        setExpanded(true);
        onExpand?.();
      }}>
        <div className={styles.etaCompact}>
          <span className={styles.etaValue}>{explanation.eta_minutes}</span>
          <span className={styles.etaUnit}>min</span>
        </div>

        {topFactor && (
          <div className={styles.topFactorPill}>
            <span className={styles.factorIcon}>
              {getFactorIcon(topFactor.direction)}
            </span>
            <span className={styles.factorName}>{topFactor.feature}</span>
            <span className={styles.factorImpact}>
              ({topFactor.direction === "positive" ? "+" : "−"}
              {Math.round(topFactor.impact_minutes)} min)
            </span>
          </div>
        )}

        <button className={styles.expandButton}>View details →</button>
      </div>
    );
  }

  // Expanded view - full explanation
  return (
    <div className={styles.card}>
      {/* Header with ETA */}
      <div className={styles.header}>
        <div className={styles.etaSection}>
          <div className={styles.etaMajor}>
            <span className={styles.etaValue}>{explanation.eta_minutes}</span>
            <span className={styles.etaUnit}>min</span>
          </div>
          <div className={styles.etaRange}>
            P10–P90: {explanation.eta_p10}–{explanation.eta_p90} min
          </div>
        </div>

        <div className={styles.confidenceSection}>
          <div
            className={styles.confidenceBadge}
            style={{
              backgroundColor: getConfidenceColor(explanation.confidence_badge),
            }}
          >
            <span className={styles.confidenceLabel}>
              {getConfidenceLabel(explanation.confidence_badge)}
            </span>
            <span className={styles.confidenceValue}>
              {Math.round(explanation.confidence_within_5min * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className={styles.summary}>
        <p>{explanation.summary}</p>
      </div>

      {/* Top factors */}
      <div className={styles.factorsSection}>
        <h3 className={styles.sectionTitle}>Key Factors</h3>
        <div className={styles.factorsList}>
          {explanation.factors.slice(0, 3).map((factor, idx) => (
            <div key={idx} className={styles.factor}>
              <div className={styles.factorHeader}>
                <span className={styles.factorRank}>#{factor.importance_rank}</span>
                <span className={styles.factorFeature}>{factor.feature}</span>
                <span
                  className={styles.factorDirection}
                  data-direction={factor.direction}
                >
                  {factor.direction === "positive" ? "+" : "−"}
                  {Math.round(factor.impact_minutes)} min
                </span>
              </div>
              <p className={styles.factorSentence}>{factor.sentence}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What would help */}
      {explanation.what_would_help && (
        <div className={styles.suggestion}>
          <span className={styles.suggestionIcon}>💡</span>
          <p>{explanation.what_would_help}</p>
        </div>
      )}

      {/* Full factor list (collapsible) */}
      {explanation.factors.length > 3 && (
        <details className={styles.details}>
          <summary>Show all {explanation.factors.length} factors</summary>
          <div className={styles.factorsList}>
            {explanation.factors.slice(3).map((factor, idx) => (
              <div key={idx + 3} className={styles.factor}>
                <div className={styles.factorHeader}>
                  <span className={styles.factorRank}>#{factor.importance_rank}</span>
                  <span className={styles.factorFeature}>{factor.feature}</span>
                  <span
                    className={styles.factorDirection}
                    data-direction={factor.direction}
                  >
                    {factor.direction === "positive" ? "+" : "−"}
                    {Math.round(factor.impact_minutes)} min
                  </span>
                </div>
                <p className={styles.factorSentence}>{factor.sentence}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Refresh button */}
      <button className={styles.refreshButton} onClick={fetchExplanation}>
        Refresh Explanation
      </button>

      {compact && (
        <button
          className={styles.collapseButton}
          onClick={() => setExpanded(false)}
        >
          ← Collapse
        </button>
      )}
    </div>
  );
};

export default ETAExplanationCard;
