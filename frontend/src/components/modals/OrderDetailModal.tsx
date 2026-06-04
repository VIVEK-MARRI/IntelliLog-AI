import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { MetricCard } from '../shared/MetricCard';
import type { LiveOrder } from '../../types/api';

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: LiveOrder;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const navigate = useNavigate();
  if (!order) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order ${order.id}`}
      size="lg"
    >
      {/* Order Header */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Status"
          value={order.status}
        />
        <MetricCard
          label="Risk Score"
          value={`${order.risk_score}%`}
        />
        <MetricCard
          label="Delay"
          value={`${order.delay_minutes}m`}
        />
      </div>

      {/* Order Details Grid */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Order ID
            </label>
            <p className="text-slate-100 font-mono text-sm mt-1">{order.id}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Customer
            </label>
            <p className="text-slate-100 mt-1">{order.customer_name || 'N/A'}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Driver
            </label>
            <p className="text-slate-100 mt-1">{order.driver_name || 'Not Assigned'}</p>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Pickup Location
            </label>
            <p className="text-slate-100 text-sm mt-1">
              {order.origin || 'N/A'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Delivery Location
            </label>
            <p className="text-slate-100 text-sm mt-1">
              {order.destination || 'N/A'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Estimated Delivery
            </label>
            <p className="text-slate-100 text-sm mt-1">
              {order.eta_time || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Risk Details */}
      {order.is_high_risk && (
        <div className="bg-red-900/20 border border-red-500/50 rounded p-4 mb-6">
          <h4 className="text-sm font-semibold text-red-300 mb-3">Risk Factors</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Traffic Congestion</span>
              <span className="text-red-400 font-medium">+28%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Driver Behavior</span>
              <span className="text-amber-400 font-medium">+15%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Vehicle Health</span>
              <span className="text-green-400 font-medium">-5%</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div
        slot="actions"
        className="flex gap-3"
      >
        <button
          onClick={onClose}
          className="
            flex-1 px-4 py-2 rounded font-medium
            bg-slate-700 hover:bg-slate-600 transition-colors
            text-slate-100
          "
        >
          Close
        </button>
        <button
          onClick={() => { onClose(); navigate(`/orders/${order.id}`); }}
          className="
            flex-1 px-4 py-2 rounded font-medium
            bg-blue-600 hover:bg-blue-700 transition-colors
            text-white
          "
        >
          View Full Details
        </button>
      </div>
    </Modal>
  );
};
