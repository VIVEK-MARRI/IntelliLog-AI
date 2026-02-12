import { Map, MapMarker, MarkerContent, MarkerPopup, MapRoute, MapControls } from './ui/map';
import { Truck, MapPin, Phone, Warehouse } from 'lucide-react';

interface FleetControlMapProps {
  drivers: any[];
  orders: any[];
  routes: any[];
  warehouses?: any[];
}

export default function FleetControlMap({ drivers, orders, routes, warehouses = [] }: FleetControlMapProps) {
  // Default center (Hyderabad)
  const defaultCenter: [number, number] = [78.4867, 17.3850];

  const getAllCoordinates = () => {
    const coords: [number, number][] = [];
    warehouses.forEach(w => {
      if (w.lat && w.lng) coords.push([w.lng, w.lat]);
    });
    drivers.forEach(d => {
      if (d.current_lat && d.current_lng) coords.push([d.current_lng, d.current_lat]);
    });
    orders.forEach(o => {
      if (o.lat && o.lng) coords.push([o.lng, o.lat]);
    });
    return coords;
  };

  const getMapCenter = () => {
    const coords = getAllCoordinates();
    if (coords.length === 0) return defaultCenter;
    const avgLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    const avgLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    return [avgLng, avgLat] as [number, number];
  };

  const buildRouteCoordinates = (route: any): [number, number][] => {
    const orderMap: { [key: string]: any } = {};
    orders.forEach(o => { orderMap[o.id] = o; });

    // Get warehouse coords for route start
    const whCoords = route.geometry_json?.warehouse_coords;
    const routePoints: [number, number][] = [];

    // Start from warehouse if available
    if (whCoords) {
      routePoints.push([whCoords[1], whCoords[0]]); // [lng, lat]
    }

    if (route.geometry_json?.points && Array.isArray(route.geometry_json.points)) {
      const points = route.geometry_json.points
        .map((orderId: string) => {
          const order = orderMap[orderId];
          return order ? [order.lng, order.lat] : null;
        })
        .filter(Boolean) as [number, number][];
      routePoints.push(...points);
    } else if (route.orders && Array.isArray(route.orders)) {
      const points = route.orders
        .map((o: any) => [o.lng, o.lat] as [number, number])
        .filter(([lng, lat]: [number, number]) => lng && lat);
      routePoints.push(...points);
    }

    // Return to warehouse
    if (whCoords && routePoints.length > 1) {
      routePoints.push([whCoords[1], whCoords[0]]);
    }

    return routePoints;
  };

  const activeRoutes = routes.filter((route) => route.status !== 'superseded');
  const activeDrivers = drivers.filter(d => d.current_lat && d.current_lng);

  const ROUTE_COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f59e0b', '#ec4899'];

  return (
    <Map
      center={getMapCenter()}
      zoom={12}
      className="w-full h-full rounded-[2.5rem]"
      theme="dark"
    >
      {/* Warehouse Markers */}
      {warehouses.map((wh: any) => (
        <MapMarker
          key={`wh-${wh.id}`}
          longitude={wh.lng}
          latitude={wh.lat}
        >
          <MarkerContent className="flex items-center justify-center">
            <div className="relative h-8 w-8 rounded-lg border-2 border-white bg-green-500 shadow-lg flex items-center justify-center">
              <Warehouse className="h-4 w-4 text-white" />
            </div>
          </MarkerContent>
          <MarkerPopup closeButton>
            <div className="space-y-2 text-sm">
              <div className="font-bold text-slate-900">{wh.name}</div>
              <div className="text-xs text-green-600 font-bold uppercase">Warehouse Depot</div>
              <div className="text-xs text-slate-600">
                Radius: {wh.service_radius_km || 25} km
              </div>
              <div className="text-xs text-slate-600">
                Capacity: {wh.capacity || 500} orders/day
              </div>
            </div>
          </MarkerPopup>
        </MapMarker>
      ))}

      {/* Routes with per-driver colors */}
      {activeRoutes.map((route, idx) => {
        const coords = buildRouteCoordinates(route);
        if (coords.length < 2) return null;
        return (
          <MapRoute
            key={route.id || idx}
            id={`route-${route.id}`}
            coordinates={coords}
            color={ROUTE_COLORS[idx % ROUTE_COLORS.length]}
            width={3}
            opacity={0.7}
          />
        );
      })}

      {/* Driver Markers */}
      {activeDrivers.map((driver) => (
        <MapMarker
          key={driver.id}
          longitude={driver.current_lng}
          latitude={driver.current_lat}
        >
          <MarkerContent className="flex items-center justify-center">
            <div className={`relative h-6 w-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center ${driver.status === 'available' ? 'bg-emerald-500' :
                driver.status === 'busy' ? 'bg-orange-500' :
                  'bg-slate-500'
              }`}>
              <Truck className="h-3 w-3 text-white" />
            </div>
          </MarkerContent>
          <MarkerPopup closeButton>
            <div className="space-y-2 text-sm">
              <div className="font-bold text-slate-900">{driver.name}</div>
              <div className="flex items-center gap-1 text-slate-600">
                <Phone className="h-3 w-3" />{driver.phone || 'No phone'}
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-xs uppercase font-semibold">
                <span className={`h-2 w-2 rounded-full ${driver.status === 'available' ? 'bg-emerald-500' :
                    driver.status === 'busy' ? 'bg-orange-500' : 'bg-slate-500'
                  }`} />
                {driver.status}
              </div>
              {driver.warehouse_id && (
                <div className="flex items-center gap-1 text-green-600 text-xs">
                  <Warehouse className="h-3 w-3" />
                  Warehouse: {warehouses.find(w => w.id === driver.warehouse_id)?.name || driver.warehouse_id}
                </div>
              )}
              <div className="flex items-center gap-1 text-slate-600 text-xs">
                <MapPin className="h-3 w-3" />
                {driver.current_lat?.toFixed(4)}, {driver.current_lng?.toFixed(4)}
              </div>
              <div className="text-xs text-slate-600">Capacity: {driver.vehicle_capacity || 0}</div>
            </div>
          </MarkerPopup>
        </MapMarker>
      ))}

      {/* Order Markers */}
      {orders.map((order) => (
        <MapMarker
          key={order.id}
          longitude={order.lng}
          latitude={order.lat}
        >
          <MarkerContent className="flex items-center justify-center">
            <div className="relative h-5 w-5 rounded-full border-2 border-white bg-red-500 shadow-lg flex items-center justify-center">
              <MapPin className="h-2.5 w-2.5 text-white" />
            </div>
          </MarkerContent>
          <MarkerPopup closeButton>
            <div className="space-y-1 text-sm">
              <div className="font-bold text-slate-900">Order {order.id}</div>
              <div className="text-xs text-slate-600">{order.address || order.delivery_address}</div>
              <div className="text-xs text-slate-500 mt-1">{order.status}</div>
            </div>
          </MarkerPopup>
        </MapMarker>
      ))}

      <MapControls
        position="bottom-right"
        showZoom={true}
        showCompass={true}
        showLocate={true}
        showFullscreen={true}
      />
    </Map>
  );
}
