import { useCallback, useMemo } from 'react';
import { useFleetStore } from '../store/fleetStore';
import type { LiveOrder } from '../types/api';

/**
 * Custom hook for fleet data access with derived states
 * Provides easy access to fleet metrics and filtering
 */
export const useFleetData = () => {
  const {
    orders,
    selectedOrderId,
    connectionStatus,
    setSelectedOrder,
  } = useFleetStore();

  // Convert Map to array for easier consumption
  const ordersArray = useMemo(() => Array.from(orders.values()), [orders]);

  // High-risk orders
  const highRiskOrders = useMemo(
    () => ordersArray.filter((order) => order.is_high_risk),
    [ordersArray]
  );

  // Delayed orders
  const delayedOrders = useMemo(
    () => ordersArray.filter((order) => order.delay_minutes > 0),
    [ordersArray]
  );

  // Orders by status
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, LiveOrder[]> = {};
    ordersArray.forEach((order) => {
      if (!grouped[order.status]) {
        grouped[order.status] = [];
      }
      grouped[order.status].push(order);
    });
    return grouped;
  }, [ordersArray]);

  // Fleet statistics
  const fleetStats = useMemo(() => {
    const total = ordersArray.length;
    const delivered = ordersArray.filter((o) => o.status === 'delivered').length;
    const inTransit = ordersArray.filter((o) => o.status === 'in_transit').length;
    const delayed = delayedOrders.length;
    const highRisk = highRiskOrders.length;

    return {
      total,
      delivered,
      inTransit,
      delayed,
      highRisk,
      onTimeRate: total > 0 ? ((delivered - delayed) / delivered) * 100 : 0,
      riskPercentage: total > 0 ? (highRisk / total) * 100 : 0,
    };
  }, [ordersArray, delayedOrders, highRiskOrders]);

  // Get order by ID
  const getOrder = useCallback(
    (orderId: string): LiveOrder | undefined => {
      return orders.get(orderId);
    },
    [orders]
  );

  // Select order
  const selectOrder = useCallback(
    (orderId: string | null) => {
      setSelectedOrder(orderId);
    },
    [setSelectedOrder]
  );

  return {
    ordersArray,
    highRiskOrders,
    delayedOrders,
    ordersByStatus,
    fleetStats,
    selectedOrderId,
    selectedOrder: selectedOrderId ? orders.get(selectedOrderId) : undefined,
    connectionStatus,
    getOrder,
    selectOrder,
  };
};
