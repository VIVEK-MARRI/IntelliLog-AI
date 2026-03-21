import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { StatusDot, ProgressBar } from './index';

interface DriverCardProps {
  driver: {
    id: string;
    name: string;
    vehicleType: 'bike' | 'auto' | 'car';
    status: 'on_route' | 'delayed' | 'deviated' | 'offline';
    currentZone: string;
    speed: number;
    heading: number;
    routeProgress: number;
    stopsRemaining: number;
    etaNextStop: number;
    etaConfidence: number;
    lastThreeETAs: Array<{ deviation: number }>;
    isDeviating: boolean;
    deviationMeters?: number;
  };
  isSelected: boolean;
  onSelect: (driverId: string) => void;
  onReroute?: (driverId: string) => void;
}

const VEHICLE_ICONS = { bike: '🏍️', auto: '🛺', car: '🚗' } as const;

const DriverCard = memo(({ driver, isSelected, onSelect, onReroute }: DriverCardProps) => {
  const handleClick = useCallback(() => {
    onSelect(driver.id);
  }, [driver.id, onSelect]);

  const handleReroute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onReroute?.(driver.id);
  }, [driver.id, onReroute]);

  const statusColor = {
    on_route: '#00D4AA',
    delayed: '#F59E0B',
    deviated: '#EF4444',
    offline: '#334155',
  }[driver.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleClick}
      style={{
        background: isSelected ? 'rgba(0,212,170,0.06)' : '#141B2D',
        border: `1px solid ${driver.isDeviating ? '#EF4444' : isSelected ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginBottom: 8,
      }}
    >
      {driver.isDeviating && (
        <div style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 11,
          color: '#EF4444',
          marginBottom: 8,
          fontWeight: 500,
        }}>
          Off route {driver.deviationMeters ?? 0}m - {driver.stopsRemaining} stops affected
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <StatusDot status={
          driver.status === 'on_route' ? 'online' :
          driver.status === 'delayed' ? 'warning' :
          driver.status === 'deviated' ? 'critical' : 'offline'
        } />
        <span style={{ fontWeight: 500, fontSize: 13, color: '#F1F5F9', flex: 1 }}>
          {driver.name}
        </span>
        <span style={{ fontSize: 11, color: '#64748B' }}>
          {VEHICLE_ICONS[driver.vehicleType]}
        </span>
      </div>

      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
        {driver.currentZone} · {driver.speed} km/h · {driver.stopsRemaining} stops left
      </div>

      <ProgressBar
        value={driver.routeProgress}
        color={statusColor}
        animated={driver.status === 'on_route'}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
        <span style={{ color: '#64748B' }}>Next stop</span>
        <span style={{ color: '#F1F5F9', fontWeight: 500 }}>
          {driver.etaNextStop} min
          <span style={{ color: '#64748B', marginLeft: 4 }}>({driver.etaConfidence}%)</span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {driver.lastThreeETAs.map((eta, i) => {
          const isGood = Math.abs(eta.deviation) <= 2;
          const sign = eta.deviation > 0 ? '+' : '';
          return (
            <span key={i} style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: isGood ? 'rgba(0,212,170,0.1)' : 'rgba(239,68,68,0.1)',
              color: isGood ? '#00D4AA' : '#EF4444',
            }}>
              {sign}{eta.deviation}m
            </span>
          );
        })}
      </div>

      {driver.isDeviating && onReroute && (
        <button
          onClick={handleReroute}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '6px 0',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            color: '#EF4444',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Re-route Now
        </button>
      )}
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.driver.id === nextProps.driver.id &&
    prevProps.driver.status === nextProps.driver.status &&
    prevProps.driver.currentZone === nextProps.driver.currentZone &&
    prevProps.driver.speed === nextProps.driver.speed &&
    prevProps.driver.routeProgress === nextProps.driver.routeProgress &&
    prevProps.driver.stopsRemaining === nextProps.driver.stopsRemaining &&
    prevProps.driver.etaNextStop === nextProps.driver.etaNextStop &&
    prevProps.driver.isDeviating === nextProps.driver.isDeviating &&
    prevProps.driver.deviationMeters === nextProps.driver.deviationMeters &&
    prevProps.driver.lastThreeETAs === nextProps.driver.lastThreeETAs &&
    prevProps.isSelected === nextProps.isSelected
  );
});

DriverCard.displayName = 'DriverCard';
export default DriverCard;
