/**
 * Utility Functions - Formatters
 * Format dates, numbers, risk levels, and other values
 */

import { format, formatDistanceToNow } from 'date-fns'

/**
 * Format a date to human-readable format
 */
export const formatDate = (date: string | Date): string => {
  try {
    return format(new Date(date), 'MMM d, yyyy')
  } catch {
    return 'Invalid date'
  }
}

/**
 * Format a datetime to HH:mm format
 */
export const formatTime = (date: string | Date): string => {
  try {
    return format(new Date(date), 'HH:mm')
  } catch {
    return 'Invalid time'
  }
}

/**
 * Format a datetime to full format (MMM d, yyyy HH:mm)
 */
export const formatDateTime = (date: string | Date): string => {
  try {
    return format(new Date(date), 'MMM d, yyyy HH:mm')
  } catch {
    return 'Invalid datetime'
  }
}

/**
 * Format a date relative to now (e.g., "2 hours ago")
 */
export const formatRelativeTime = (date: string | Date): string => {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return 'Unknown'
  }
}

/**
 * Format a number with comma separator
 */
export const formatNumber = (num: number): string => {
  return num.toLocaleString()
}

/**
 * Format a number as percentage
 */
export const formatPercentage = (num: number, decimals = 0): string => {
  return `${(num * 100).toFixed(decimals)}%`
}

/**
 * Format a distance in kilometers
 */
export const formatDistance = (km: number): string => {
  return `${km.toFixed(1)} km`
}

/**
 * Format a speed in km/h
 */
export const formatSpeed = (kmh: number): string => {
  return `${kmh.toFixed(1)} km/h`
}

/**
 * Format a duration in minutes to human-readable format
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`
  }
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours}h ${mins}m`
}

/**
 * Format a risk score as a label
 */
export const formatRiskLevel = (score: number): string => {
  if (score < 0.3) return 'Low'
  if (score < 0.7) return 'Moderate'
  return 'High'
}

/**
 * Format order status as human-readable text
 */
export const formatOrderStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending: 'Pending',
    in_transit: 'In Transit',
    completed: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Failed',
  }
  return statusMap[status] || status
}

/**
 * Format currency value
 */
export const formatCurrency = (amount: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a decision type as readable text
 */
export const formatDecisionType = (type: string): string => {
  const typeMap: Record<string, string> = {
    no_action: 'No Action',
    alert: 'Alert Sent',
    reroute: 'Rerouted',
    escalate: 'Escalated',
  }
  return typeMap[type] || type
}

/**
 * Truncate a string to a maximum length
 */
export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}
