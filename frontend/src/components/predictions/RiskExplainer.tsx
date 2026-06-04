/**
 * RiskExplainer Component
 * Displays SHAP feature importance and risk factor explanations
 */

import React from 'react'
import { RiskFactor } from '@/types/api'
import clsx from 'clsx'

interface RiskExplainerProps {
  riskScore: number
  confidence: number
  topFactors: RiskFactor[]
  predictedDelay?: number
}

export const RiskExplainer: React.FC<RiskExplainerProps> = ({
  riskScore,
  confidence,
  topFactors,
  predictedDelay,
}) => {
  const isHighRisk = riskScore > 0.7

  return (
    <div className="bg-slate-800 rounded border border-slate-700 p-6 space-y-6">
      {/* Risk Score Header */}
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <h3 className="text-2xl font-bold text-slate-100">Risk Score</h3>
          <p className={clsx(
            'text-sm font-medium',
            isHighRisk && 'text-op-critical',
            !isHighRisk && riskScore > 0.3 && 'text-op-warning',
            riskScore <= 0.3 && 'text-op-success'
          )}>
            {isHighRisk ? 'HIGH RISK' : riskScore > 0.3 ? 'MODERATE' : 'LOW RISK'}
          </p>
        </div>

        <div className="flex items-baseline gap-2">
          <div className={clsx(
            'text-4xl font-bold',
            isHighRisk && 'text-op-critical',
            !isHighRisk && riskScore > 0.3 && 'text-op-warning',
            riskScore <= 0.3 && 'text-op-success'
          )}>
            {(riskScore * 100).toFixed(0)}%
          </div>
          <p className="text-sm text-slate-400">
            Confidence: <span className="font-semibold text-slate-300">{(confidence * 100).toFixed(0)}%</span>
          </p>
        </div>

        {/* Predicted Delay */}
        {predictedDelay !== undefined && (
          <p className="text-sm text-slate-400">
            Predicted Delay: <span className="font-semibold text-slate-300">{predictedDelay.toFixed(0)} min</span>
          </p>
        )}
      </div>

      <div className="border-t border-slate-700 pt-6">
        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Top Risk Factors
        </h4>

        <div className="space-y-4">
          {topFactors.slice(0, 3).map((factor, idx) => (
            <FactorBar key={`${factor.feature}-${idx}`} factor={factor} />
          ))}
        </div>
      </div>

      {/* Summary Insight */}
      <div className="bg-slate-900 rounded border border-slate-700 p-4">
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-slate-300">Insight:</span> This order has{' '}
          <span className="font-semibold text-op-warning">
            {isHighRisk ? 'elevated risk of delay' : 'moderate risk'}
          </span>
          . Focus on monitoring{' '}
          <span className="font-semibold text-slate-300">
            {topFactors[0]?.feature}
          </span>
          .
        </p>
      </div>
    </div>
  )
}

interface FactorBarProps {
  factor: RiskFactor
}

const FactorBar: React.FC<FactorBarProps> = ({ factor }) => {
  const direction = factor.direction === 'increases' ? 'right' : 'left'
  const isIncreasing = factor.direction === 'increases'

  // Normalize contribution to percentage (0-100)
  const contributionPercent = Math.min(Math.abs(factor.contribution) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-300 uppercase">
            {factor.feature}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {factor.humanReadable}
          </p>
        </div>
        <p className={clsx(
          'text-xs font-semibold ml-2 whitespace-nowrap',
          isIncreasing && 'text-op-critical',
          !isIncreasing && 'text-op-success'
        )}>
          {isIncreasing ? '+' : '-'}{contributionPercent.toFixed(0)}%
        </p>
      </div>

      {/* Directional bar */}
      <div className="flex items-center">
        {direction === 'left' && (
          <div className="flex items-center justify-end flex-1 mr-2">
            <div className="flex items-center gap-1">
              <div
                className="h-1.5 bg-op-success rounded-r"
                style={{ width: `${Math.min(contributionPercent, 100)}px` }}
              />
              <span className="text-xs text-op-success font-mono">
                {factor.value}
              </span>
            </div>
          </div>
        )}

        {direction === 'right' && (
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-op-critical font-mono">
              {factor.value}
            </span>
            <div
              className="h-1.5 bg-op-critical rounded-l"
              style={{ width: `${Math.min(contributionPercent, 100)}px` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
