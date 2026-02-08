import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
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

// Custom icons for professional look
const driverIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const orderIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: iconShadow,
    iconSize: [20, 32],
    iconAnchor: [10, 32],
    popupAnchor: [1, -34],
    shadowSize: [32, 32]
});

interface LogisticsMapProps {
    drivers: any[];
    orders: any[];
    routes: any[];
    mode?: 'planning' | 'monitoring';
}

export default function LogisticsMap({ drivers, orders, routes, mode = 'planning' }: LogisticsMapProps) {
    const [mapCenter] = useState<[number, number]>([40.7128, -74.0060]); // New York Default
    const [simulatedDrivers, setSimulatedDrivers] = useState<any[]>([]);

    // Movement Simulation Logic
    useEffect(() => {
        if (mode !== 'monitoring') {
            setSimulatedDrivers(drivers);
            return;
        }

        const interval = setInterval(() => {
            setSimulatedDrivers(prev => {
                const currentPool = prev.length > 0 ? prev : drivers;
                return currentPool.map(d => {
                    const route = routes.find(r => r.driver_id === d.id);
                    if (!route || !route.orders || route.orders.length === 0) return d;

                    // Simple movement simulation: nudge driver towards first order
                    const targetOrder = route.orders[0];
                    const speed = 0.00005; // Simulation speed

                    const latDiff = targetOrder.lat - (d.current_lat || 40.7128);
                    const lngDiff = targetOrder.lng - (d.current_lng || -74.0060);

                    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
                    if (distance < 0.0005) return d; // Arrived (or close enough)

                    return {
                        ...d,
                        current_lat: (d.current_lat || 40.7128) + (latDiff / distance) * speed,
                        current_lng: (d.current_lng || -74.0060) + (lngDiff / distance) * speed
                    };
                });
            });
        }, 100);

        return () => clearInterval(interval);
    }, [drivers, routes, mode]);

    const activeDrivers = mode === 'monitoring' ? simulatedDrivers : drivers;

    return (
        <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
            className="z-0"
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />

            {/* Render Drivers */}
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
                            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 w-2/3" />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Battery: 82%</p>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {/* Render Orders */}
            {orders.map(order => (
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

            {/* Render Routes */}
            {routes.map(route => {
                // Find order coordinates in sequence for this route
                const points: [number, number][] = route.orders?.map((o: any) => [o.lat, o.lng]) || [];

                // If we have a driver, add their start position
                const driver = drivers.find(d => d.id === route.driver_id);
                if (driver && driver.current_lat && driver.current_lng) {
                    points.unshift([driver.current_lat, driver.current_lng]);
                }

                if (points.length < 2) return null;

                return (
                    <Polyline
                        key={route.id}
                        positions={points}
                        pathOptions={{
                            color: mode === 'planning' ? '#3b82f6' : '#10b981',
                            weight: mode === 'planning' ? 6 : 4,
                            opacity: 0.8,
                            dashArray: mode === 'planning' ? '1, 12' : '10, 10',
                            lineCap: 'round'
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}
