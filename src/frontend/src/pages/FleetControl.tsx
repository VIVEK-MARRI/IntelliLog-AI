import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/ui/card';
import {
    MapPin, Truck, Phone, Navigation, Clock,
    Search, CheckCircle2, AlertCircle, Circle, Zap, Warehouse
} from 'lucide-react';
import FleetControlMap from '../components/FleetControlMap';
import api from '../lib/api';
import { useToast } from '../hooks/use-toast';

const statusColors = {
    available: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    busy: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    offline: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const statusIcons = {
    available: CheckCircle2,
    busy: Clock,
    offline: AlertCircle,
};

export default function FleetControl() {
    const { toast } = useToast();
    const [drivers, setDrivers] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [routes, setRoutes] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [isReroutingActive, setIsReroutingActive] = useState(false);
    const [lastRerouteTime, setLastRerouteTime] = useState<Date | null>(null);
    const [livePositions, setLivePositions] = useState<Map<string, any>>(new Map());

    const fetchData = async () => {
        try {
            const [driversRes, ordersRes, routesRes, warehousesRes] = await Promise.all([
                api.get('/drivers/'),
                api.get('/orders/'),
                api.get('/routes/'),
                api.get('/warehouses/'),
            ]);
            setDrivers(driversRes.data);
            setOrders(ordersRes.data);
            setRoutes(routesRes.data);
            setWarehouses(warehousesRes.data);
        } catch (error: any) {
            console.error('Failed to fetch fleet data', error);
            toast({
                title: 'Error loading fleet data',
                description: error.response?.data?.detail || 'Failed to load drivers and routes',
                variant: 'error',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<any>(null);

    const connectWebSocket = () => {
        // Prevent multiple connections or establishing if already open/connecting
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8001/api/v1/ws/locations';
        console.log(`Connecting to WebSocket: ${wsUrl}`);

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connected');
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'ping') return;

                    if (data.type === 'location_update') {
                        // Update the drivers array so markers move
                        setDrivers(prev => prev.map(d =>
                            d.id === data.driver_id
                                ? { ...d, current_lat: data.lat, current_lng: data.lng, speed_kmph: data.speed_kmph }
                                : d
                        ));

                        // Update live positions map for reroute status tracking
                        setLivePositions(prev => {
                            const updated = new Map(prev);
                            updated.set(`${data.tenant_id}-${data.driver_id}`, data);
                            return updated;
                        });

                        setIsReroutingActive(true);
                        setLastRerouteTime(new Date());
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = (event) => {
                console.warn(`WebSocket closed: ${event.code} ${event.reason}`);
                wsRef.current = null;
                // Avoid reconnecting if component unmounted
                if (!reconnectTimeoutRef.current) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectTimeoutRef.current = null;
                        connectWebSocket();
                    }, 3000);
                }
            };
        } catch (err) {
            console.error('Failed to create WebSocket:', err);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        connectWebSocket();

        return () => {
            clearInterval(interval);
            if (wsRef.current) {
                console.log('Closing WebSocket on unmount');
                // Set onclose to null to avoid reconnecting during unmount
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, []);

    const filteredDrivers = drivers.filter(driver => {
        const matchesSearch = driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            driver.phone?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || driver.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = {
        all: drivers.length,
        available: drivers.filter(d => d.status === 'available').length,
        busy: drivers.filter(d => d.status === 'busy').length,
        offline: drivers.filter(d => d.status === 'offline').length,
    };

    // Find warehouse name for a driver
    const getWarehouseName = (warehouseId: string) => {
        const wh = warehouses.find(w => w.id === warehouseId);
        return wh ? wh.name : null;
    };

    return (
        <div className="space-y-6 font-inter">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Fleet Control</h1>
                    <p className="text-slate-500 text-sm mt-1">Real-time driver tracking and fleet management.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400 animate-pulse" />
                        <span>Live Tracking</span>
                    </div>
                </div>
            </div>

            {/* Live Rerouting Status */}
            {isReroutingActive && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-between"
                >
                    <div className="flex items-center space-x-3">
                        <div className="relative w-3 h-3 rounded-full bg-cyan-500">
                            <div className="absolute inset-0 rounded-full bg-cyan-500 animate-pulse" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-cyan-400">Dynamic Rerouting Active</p>
                            <p className="text-xs text-cyan-300/80">
                                {lastRerouteTime ? `Last update: ${lastRerouteTime.toLocaleTimeString()}` : 'Connecting...'}
                            </p>
                        </div>
                    </div>
                    <Zap className="h-5 w-5 text-cyan-400" />
                </motion.div>
            )}

            {/* Warehouse Overview Cards */}
            {warehouses.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {warehouses.map((wh: any) => {
                        const whDrivers = drivers.filter(d => d.warehouse_id === wh.id);
                        const whOrders = orders.filter(o => o.warehouse_id === wh.id);
                        const whPending = whOrders.filter(o => o.status === 'pending').length;
                        return (
                            <Card key={wh.id} className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-2xl p-4">
                                <div className="flex items-center space-x-3 mb-3">
                                    <div className="p-2 rounded-xl bg-green-500/10 text-green-400">
                                        <Warehouse className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{wh.name}</p>
                                        <p className="text-[10px] text-slate-500">
                                            {wh.lat.toFixed(4)}, {wh.lng.toFixed(4)}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase">Drivers</p>
                                        <p className="text-lg font-bold text-white">{whDrivers.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase">Orders</p>
                                        <p className="text-lg font-bold text-white">{whOrders.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase">Pending</p>
                                        <p className="text-lg font-bold text-orange-400">{whPending}</p>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Status Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { key: 'all', label: 'Total Fleet', count: statusCounts.all, color: 'blue' },
                    { key: 'available', label: 'Available', count: statusCounts.available, color: 'emerald' },
                    { key: 'busy', label: 'On Delivery', count: statusCounts.busy, color: 'orange' },
                    { key: 'offline', label: 'Offline', count: statusCounts.offline, color: 'slate' },
                ].map((stat) => (
                    <motion.button
                        key={stat.key}
                        onClick={() => setStatusFilter(stat.key)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`p-4 rounded-2xl border transition-all ${statusFilter === stat.key
                            ? `bg-${stat.color}-500/10 border-${stat.color}-500/30`
                            : 'bg-slate-900/40 border-white/5 hover:border-white/10'
                            }`}
                    >
                        <p className={`text-2xl font-bold ${statusFilter === stat.key ? `text-${stat.color}-400` : 'text-white'}`}>
                            {stat.count}
                        </p>
                        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">{stat.label}</p>
                    </motion.button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Map View */}
                <div className="lg:col-span-2">
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] overflow-hidden h-[600px]">
                        <div className="relative h-full">
                            <div className="absolute top-6 left-6 z-10 flex items-center space-x-3 bg-slate-950/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[11px] font-bold text-white uppercase tracking-widest px-2">
                                    {filteredDrivers.length} Drivers · {warehouses.length} Depots
                                </span>
                            </div>
                            {isLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-md z-10">
                                    <div className="flex flex-col items-center">
                                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                                        <div className="text-blue-400 font-outfit font-semibold uppercase tracking-widest text-sm">
                                            Loading Fleet...
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full w-full">
                                    <FleetControlMap
                                        drivers={filteredDrivers}
                                        orders={orders}
                                        routes={routes}
                                        warehouses={warehouses}
                                    />
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Driver List */}
                <div className="space-y-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search drivers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900/40 border border-white/5 h-12 pl-12 pr-4 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/30 backdrop-blur-xl transition-all"
                        />
                    </div>

                    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2 custom-scrollbar">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        ) : filteredDrivers.length === 0 ? (
                            <div className="text-center py-20 text-slate-500">
                                <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                <p className="text-sm font-medium">No drivers found</p>
                            </div>
                        ) : (
                            filteredDrivers.map((driver, i) => {
                                const StatusIcon = statusIcons[driver.status as keyof typeof statusIcons] || Circle;
                                const whName = getWarehouseName(driver.warehouse_id);
                                return (
                                    <motion.div
                                        key={driver.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <Card
                                            className={`p-4 bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-2xl hover:border-white/10 transition-all cursor-pointer ${selectedDriver?.id === driver.id ? 'border-blue-500/30 bg-blue-500/5' : ''}`}
                                            onClick={() => setSelectedDriver(driver)}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                                                        <Truck className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{driver.name}</p>
                                                        <p className="text-xs text-slate-500 flex items-center mt-0.5">
                                                            <Phone className="h-3 w-3 mr-1" />
                                                            {driver.phone || 'No phone'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${statusColors[driver.status as keyof typeof statusColors]}`}>
                                                    <StatusIcon className="h-3 w-3 mr-1" />{driver.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center text-slate-500">
                                                    <MapPin className="h-3 w-3 mr-1" />
                                                    <span>
                                                        {driver.current_lat && driver.current_lng
                                                            ? `${driver.current_lat.toFixed(4)}, ${driver.current_lng.toFixed(4)}`
                                                            : 'Location unknown'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center text-slate-500">
                                                    <Navigation className="h-3 w-3 mr-1" />
                                                    <span>{driver.vehicle_capacity || 0} cap</span>
                                                </div>
                                            </div>
                                            {whName && (
                                                <div className="mt-2 flex items-center text-xs text-green-400">
                                                    <Warehouse className="h-3 w-3 mr-1" />
                                                    <span>{whName}</span>
                                                </div>
                                            )}
                                        </Card>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
