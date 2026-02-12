import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect } from 'react';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Driver marker
const driverIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Order marker
const orderIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: iconShadow,
    iconSize: [20, 32],
    iconAnchor: [10, 32],
    popupAnchor: [1, -34],
    shadowSize: [32, 32]
});

// Warehouse marker (green)
const warehouseIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: iconShadow,
    iconSize: [30, 48],
    iconAnchor: [15, 48],
    popupAnchor: [1, -40],
    shadowSize: [48, 48]
});

// Route colors for per-driver distinction
const ROUTE_COLORS = [
    '#3b82f6', // blue
    '#f97316', // orange
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ef4444', // red
    '#84cc16', // lime
    '#f59e0b', // amber
    '#ec4899', // pink
    '#14b8a6', // teal
    '#a855f7', // purple
];

// Create numbered circle markers for stops
const createNumberedIcon = (num: number, color: string) => {
    return L.divIcon({
        className: 'custom-numbered-marker',
        html: `<div style="
            background: ${color};
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            font-family: 'Inter', sans-serif;
        ">${num}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -16],
    });
};

interface LogisticsMapProps {
    drivers: any[];
    orders: any[];
    routes: any[];
    warehouses?: any[];
    mode?: 'planning' | 'monitoring';
}

export default function LogisticsMap({
    drivers, orders, routes, warehouses = [], mode = 'planning'
}: LogisticsMapProps) {
    // Auto-center on data: try warehouses first, then orders, then default
    const getCenter = (): [number, number] => {
        if (warehouses.length > 0) {
            return [warehouses[0].lat, warehouses[0].lng];
        }
        if (orders.length > 0) {
            const avgLat = orders.reduce((s: number, o: any) => s + o.lat, 0) / orders.length;
            const avgLng = orders.reduce((s: number, o: any) => s + o.lng, 0) / orders.length;
            return [avgLat, avgLng];
        }
        return [17.3850, 78.4867]; // Hyderabad default
    };

    const [mapCenter] = useState<[number, number]>(getCenter());
    const [simulatedDrivers, setSimulatedDrivers] = useState<any[]>([]);
    const hasLivePositions = drivers.some(d => d.current_lat && d.current_lng);

    useEffect(() => {
        if (mode !== 'monitoring') {
            setSimulatedDrivers(drivers);
            return;
        }
        if (hasLivePositions) {
            setSimulatedDrivers(drivers);
            return;
        }

        const interval = setInterval(() => {
            setSimulatedDrivers(prev => {
                const currentPool = prev.length > 0 ? prev : drivers;
                return currentPool.map(d => {
                    const route = routes.find(r => r.driver_id === d.id);
                    if (!route || !route.orders || route.orders.length === 0) return d;
                    const targetOrder = route.orders[0];
                    const speed = 0.00005;
                    const latDiff = targetOrder.lat - (d.current_lat || 17.3850);
                    const lngDiff = targetOrder.lng - (d.current_lng || 78.4867);
                    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
                    if (distance < 0.0005) return d;
                    return {
                        ...d,
                        current_lat: (d.current_lat || 17.3850) + (latDiff / distance) * speed,
                        current_lng: (d.current_lng || 78.4867) + (lngDiff / distance) * speed
                    };
                });
            });
        }, 100);
        return () => clearInterval(interval);
    }, [drivers, routes, mode]);

    const activeDrivers = mode === 'monitoring' ? simulatedDrivers : drivers;
    const activeRoutes = routes.filter((route) => route.status !== 'superseded');

    const buildRoutePoints = (route: any): [number, number][] => {
        const orderMap = new Map(orders.map(o => [o.id, o]));
        const pointsFromGeometry: [number, number][] =
            route.geometry_json?.points
                ?.map((orderId: string) => {
                    const order = orderMap.get(orderId);
                    return order ? [order.lat, order.lng] : null;
                })
                .filter(Boolean) || [];

        if (pointsFromGeometry.length > 0) return pointsFromGeometry as [number, number][];

        const pointsFromOrders: [number, number][] =
            route.orders?.map((o: any) => [o.lat, o.lng]) || [];
        return pointsFromOrders;
    };

    // Get warehouse coords for route start/end
    const getWarehouseForRoute = (route: any) => {
        const whId = route.warehouse_id || route.geometry_json?.warehouse_id;
        if (whId && warehouses.length > 0) {
            return warehouses.find((w: any) => w.id === whId);
        }
        // Fallback to geometry_json embedded coords
        const coords = route.geometry_json?.warehouse_coords;
        if (coords) return { lat: coords[0], lng: coords[1], name: 'Warehouse' };
        return null;
    };

    return (
        <MapContainer
            center={mapCenter}
            zoom={12}
            style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
            className="z-0"
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />

            {/* Warehouse Markers */}
            {warehouses.map((wh: any) => (
                <Marker
                    key={`wh-${wh.id}`}
                    position={[wh.lat, wh.lng]}
                    icon={warehouseIcon}
                >
                    <Popup>
                        <div className="p-2">
                            <p className="font-bold text-sm">{wh.name}</p>
                            <p className="text-[10px] text-green-600 font-bold uppercase mb-1">
                                🏭 Warehouse Depot
                            </p>
                            <p className="text-xs text-slate-600">
                                Radius: {wh.service_radius_km || 25} km
                            </p>
                            <p className="text-xs text-slate-600">
                                Capacity: {wh.capacity || 500} orders/day
                            </p>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {/* Warehouse Service Zone Circles */}
            {warehouses.map((wh: any) => (
                <Circle
                    key={`wh-zone-${wh.id}`}
                    center={[wh.lat, wh.lng]}
                    radius={(wh.service_radius_km || 25) * 1000}
                    pathOptions={{
                        color: '#22c55e',
                        fillColor: '#22c55e',
                        fillOpacity: 0.04,
                        weight: 1,
                        dashArray: '6, 6',
                    }}
                />
            ))}

            {/* Driver Markers */}
            {activeDrivers.filter(d => d.current_lat && d.current_lng).map(driver => (
                <Marker
                    key={driver.id}
                    position={[driver.current_lat, driver.current_lng]}
                    icon={driverIcon}
                >
                    <Popup>
                        <div className="p-1">
                            <p className="font-bold">{driver.name}</p>
                            <p className="text-[10px] text-blue-500 font-bold uppercase mb-1">{driver.status}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {/* Order Markers (only show when no routes — when routes exist, we show numbered stops) */}
            {activeRoutes.length === 0 && orders.map(order => (
                <Marker
                    key={order.id}
                    position={[order.lat, order.lng]}
                    icon={orderIcon}
                >
                    <Popup>
                        <div className="p-1">
                            <p className="font-bold">{order.order_number}</p>
                            <p className="text-xs">{order.delivery_address}</p>
                            <p className="text-[10px] font-bold mt-1 uppercase text-red-500">{order.status}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {/* Color-Coded Routes with Numbered Stops */}
            {activeRoutes.map((route, routeIndex) => {
                const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
                const orderStops = buildRoutePoints(route);
                const warehouse = getWarehouseForRoute(route);

                // Build full route: warehouse → stops → warehouse
                const fullRoute: [number, number][] = [];
                if (warehouse) {
                    fullRoute.push([warehouse.lat, warehouse.lng]);
                }
                fullRoute.push(...orderStops);

                if (fullRoute.length < 2) return null;

                // Find driver for this route
                const driver = drivers.find(d => d.id === route.driver_id);

                // Get order details for numbered stop popups
                const orderMap = new Map(orders.map(o => [o.id, o]));
                const routeOrderIds = route.geometry_json?.points || [];

                return (
                    <div key={route.id}>
                        {/* Main route polyline (warehouse → stops) */}
                        <Polyline
                            positions={fullRoute}
                            pathOptions={{
                                color,
                                weight: 5,
                                opacity: 0.85,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }}
                        />

                        {/* Return leg: last stop → warehouse (dashed) */}
                        {warehouse && orderStops.length > 0 && (
                            <Polyline
                                positions={[
                                    orderStops[orderStops.length - 1],
                                    [warehouse.lat, warehouse.lng]
                                ]}
                                pathOptions={{
                                    color,
                                    weight: 3,
                                    opacity: 0.5,
                                    dashArray: '8, 12',
                                    lineCap: 'round',
                                }}
                            />
                        )}

                        {/* Numbered stop markers */}
                        {orderStops.map((pos, stopIndex) => {
                            const orderId = routeOrderIds[stopIndex];
                            const order = orderId ? orderMap.get(orderId) : null;
                            return (
                                <Marker
                                    key={`stop-${route.id}-${stopIndex}`}
                                    position={pos}
                                    icon={createNumberedIcon(stopIndex + 1, color)}
                                >
                                    <Popup>
                                        <div className="p-2 min-w-[140px]">
                                            <p className="font-bold text-sm">
                                                Stop #{stopIndex + 1}
                                            </p>
                                            {order && (
                                                <>
                                                    <p className="text-xs font-medium">{order.order_number || order.customer_name}</p>
                                                    <p className="text-[10px] text-slate-500">{order.delivery_address}</p>
                                                    <p className="text-[10px] text-slate-500">Weight: {order.weight} kg</p>
                                                </>
                                            )}
                                            {driver && (
                                                <p className="text-[10px] mt-1" style={{ color }}>
                                                    Driver: {driver.name}
                                                </p>
                                            )}
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </div>
                );
            })}
        </MapContainer>
    );
}
