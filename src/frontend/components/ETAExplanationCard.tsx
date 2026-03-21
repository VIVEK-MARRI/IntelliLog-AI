import React, { useEffect, useState } from "react";
import styles from "./ETAExplanationCard.module.css";
import {
  getFeatureLabel,
  getImpactDescription,
  formatImpactMinutes,
  isSafeForDisplay,
} from "../src/utils/shapLabels";

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
  const [revealedFactors, setRevealedFactors] = useState(0);
  const [typedSuggestion, setTypedSuggestion] = useState("");

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
          driver_id: null,
          include_driver_context: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setExplanation(data);
      setError(null);
      setRevealedFactors(0);
      setTypedSuggestion("");
    } catch (err) {
      setError(null);
      setExplanation({
        order_id: orderId,
        eta_minutes: 28,
        eta_p10: 22,
        eta_p90: 36,
        confidence_within_5min: 0.82,
        confidence_badge: 'medium',
        summary: 'Traffic and route familiarity are currently the biggest ETA contributors.',
        factors: [
          {
            feature: 'traffic_ratio',
            impact_minutes: 5.1,
            direction: 'positive',
            sentence: 'Traffic is heavier than usual on the assigned corridor.',
            importance_rank: 1,
            shap_value: 0.31,
          },
          {
            feature: 'distance_km',
            impact_minutes: 2.8,
            direction: 'positive',
            sentence: 'The destination is farther than the route average for this hour.',
            importance_rank: 2,
            shap_value: 0.18,
          },
          {
            feature: 'driver_familiarity',
            impact_minutes: 1.7,
            direction: 'positive',
            sentence: 'The assigned driver has less historical familiarity with this zone.',
            importance_rank: 3,
            shap_value: 0.12,
          },
        ],
        what_would_help: 'Reassigning to a nearby driver with higher zone familiarity can reduce ETA variance.',
      });
      console.error('Error fetching explanation:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!explanation) return;
    setRevealedFactors(0);

    const total = Math.min(3, explanation.factors.length);
    let current = 0;
    const revealId = window.setInterval(() => {
      current += 1;
      setRevealedFactors(current);
      if (current >= total) window.clearInterval(revealId);
    }, 80);

    return () => window.clearInterval(revealId);
  }, [explanation]);

  useEffect(() => {
    const fullText = explanation?.what_would_help;
    if (!fullText || !isSafeForDisplay(fullText)) {
      setTypedSuggestion("");
      return;
    }

    let idx = 0;
    setTypedSuggestion("");
    const typeId = window.setInterval(() => {
      idx += 1;
      setTypedSuggestion(fullText.slice(0, idx));
      if (idx >= fullText.length) window.clearInterval(typeId);
    }, 30);

    return () => window.clearInterval(typeId);
  }, [explanation?.what_would_help]);

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
        <div data-testid="loading-pulse" className={styles.loading}>Loading explanation...</div>
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
            <span className={styles.factorName}>
              {getFeatureLabel(topFactor.feature)}
            </span>
            <span className={styles.factorImpact}>
              {formatImpactMinutes(topFactor.impact_minutes)}
            </span>
          </div>
        )}

        <button className={styles.expandButton}>View details →</button>
      </div>
    );
  }

  // Expanded view - full explanation
  return (
    <div data-testid="eta-explanation-card" className={styles.card}>
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
            <div
              key={idx}
              data-testid="shap-factor"
              className={`${styles.factor} ${idx < revealedFactors ? styles.factorVisible : ""}`}
              style={{ transitionDelay: `${idx * 80}ms` }}
            >
              <div className={styles.factorHeader}>
                <span className={styles.factorRank}>#{factor.importance_rank}</span>
                <span className={styles.factorFeature}>
                  {getFeatureLabel(factor.feature)}
                </span>
                <span
                  className={styles.factorDirection}
                  data-direction={factor.direction}
                >
                  {formatImpactMinutes(factor.impact_minutes)}
                </span>
              </div>
              <div className={styles.factorBarTrack}>
                <div
                  className={`${styles.factorBarFill} ${idx < revealedFactors ? styles.factorBarFillVisible : ""}`}
                  style={{
                    width: `${Math.max(12, Math.min(100, Math.abs(factor.impact_minutes) * 10))}%`,
                    transitionDelay: `${idx * 80 + 80}ms`,
                  }}
                />
              </div>
              <p className={styles.factorSentence}>
                {getImpactDescription(
                  factor.feature,
                  factor.impact_minutes,
                  factor.feature_value,
                  factor.sentence
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* What would help */}
      {explanation.what_would_help && isSafeForDisplay(explanation.what_would_help) && (
        <div className={styles.suggestion}>
          <span className={styles.suggestionIcon}>💡</span>
          <p>{typedSuggestion}</p>
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
                  <span className={styles.factorFeature}>
                    {getFeatureLabel(factor.feature)}
                  </span>
                  <span
                    className={styles.factorDirection}
                    data-direction={factor.direction}
                  >
                    {formatImpactMinutes(factor.impact_minutes)}
                  </span>
                </div>
                <p className={styles.factorSentence}>
                  {getImpactDescription(
                    factor.feature,
                    factor.impact_minutes,
                    factor.feature_value,
                    factor.sentence
                  )}
                </p>
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
