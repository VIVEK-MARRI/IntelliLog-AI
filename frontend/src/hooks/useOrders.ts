import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ordersAPI } from '../api/orders';
import { useToast } from '../components/notifications';

/**
 * Custom hook for order operations
 * Handles fetching, creating, updating orders with proper error handling
 */
export const useOrders = () => {
  const { addToast } = useToast();

  // Fetch all orders
  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersAPI.getOrders(),
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: any) => ordersAPI.createOrder(data),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Order created',
        message: 'New order has been created successfully',
        duration: 3000,
      });
      ordersQuery.refetch();
    },
    onError: (error) => {
      addToast({
        type: 'error',
        title: 'Failed to create order',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: 5000,
      });
    },
  });

  // Update position mutation
  const updatePositionMutation = useMutation({
    mutationFn: ({
      orderId,
      data,
    }: {
      orderId: string;
      data: { latitude: number; longitude: number };
    }) =>
      ordersAPI.updatePosition(orderId, {
        lat: data.latitude,
        lng: data.longitude,
        speed_kmh: 0,
        heading: 0,
        event_type: 'manual_update',
      }),
    onError: (error) => {
      console.error('Failed to update position:', error);
    },
  });

  // Get single order
  const getOrder = useCallback(
    (orderId: string) => {
      return useQuery({
        queryKey: ['orders', orderId],
        queryFn: () => ordersAPI.getOrder(orderId),
        enabled: !!orderId,
      });
    },
    []
  );

  // Get active orders for driver
  const getDriverOrders = useCallback((driverId: string) => {
    return useQuery({
      queryKey: ['orders', 'driver', driverId],
      queryFn: () => ordersAPI.getDriverActiveOrders(driverId),
      enabled: !!driverId,
    });
  }, []);

  // Get orders by status
  const getOrdersByStatus = useCallback((status: string) => {
    return useQuery({
      queryKey: ['orders', 'status', status],
      queryFn: () => ordersAPI.getOrdersByStatus(status),
      enabled: !!status,
    });
  }, []);

  const isLoading = ordersQuery.isLoading || createOrderMutation.isPending;
  const isError = ordersQuery.isError || createOrderMutation.isError;

  return {
    // Queries
    orders: ordersQuery.data || [],
    isLoading,
    isError,

    // Mutations
    createOrder: createOrderMutation.mutate,
    updatePosition: updatePositionMutation.mutate,

    // Utilities
    getOrder,
    getDriverOrders,
    getOrdersByStatus,
    refetch: ordersQuery.refetch,
  };
};
