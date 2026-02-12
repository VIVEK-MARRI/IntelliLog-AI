import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
    Upload, FileText, Play, Zap,
    CheckCircle2, AlertCircle, TrendingDown, MapPin, Settings2, Clock, Warehouse
} from 'lucide-react';
import LogisticsMap from '../components/LogisticsMap';
import api from '../lib/api';
import { useToast } from '../hooks/use-toast';

interface Order {
    order_number: string;
    customer_name: string;
    delivery_address: string;
    lat: number;
    lng: number;
    weight: number;
}

interface WarehouseData {
    id: string;
    name: string;
    lat: number;
    lng: number;
    service_radius_km: number;
    capacity: number;
    tenant_id: string;
}

export default function RouteOptimizer() {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [syncedCount, setSyncedCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<any>(null);
    const [error, setError] = useState<string>('');
    const [dragActive, setDragActive] = useState(false);
    const [method, setMethod] = useState<'ortools' | 'greedy'>('ortools');
    const [useMl, setUseMl] = useState(true);
    const [useOsrm, setUseOsrm] = useState(true);
    const [avgSpeed, setAvgSpeed] = useState(30);
    const [timeLimit, setTimeLimit] = useState(10);

    // Warehouse state
    const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');

    // Fetch warehouses on mount
    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const res = await api.get('/warehouses/');
                setWarehouses(res.data);
                if (res.data.length > 0) {
                    setSelectedWarehouse(res.data[0].id);
                }
            } catch (err) {
                console.error('Failed to fetch warehouses:', err);
            }
        };
        fetchWarehouses();
    }, []);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = async (selectedFile: File) => {
        if (!selectedFile.name.endsWith('.csv')) {
            setError('Please upload a CSV file');
            return;
        }
        setFile(selectedFile);
        setError('');
        try {
            const text = await selectedFile.text();
            const lines = text.split('\n').filter(line => line.trim());
            const parsedOrders: Order[] = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 6) {
                    parsedOrders.push({
                        order_number: values[0] || `ORD-${Date.now()}-${i}`,
                        customer_name: values[1] || 'Unknown Customer',
                        delivery_address: values[2] || 'Unknown Address',
                        lat: parseFloat(values[3]) || 0,
                        lng: parseFloat(values[4]) || 0,
                        weight: parseFloat(values[5]) || 1.0,
                    });
                }
            }
            setOrders(parsedOrders);
            setSyncedCount(0);
            toast({
                title: 'CSV uploaded successfully',
                description: `Loaded ${parsedOrders.length} orders`,
                variant: 'success',
            });
        } catch (err) {
            const errorMsg = 'Failed to parse CSV file. Please check the format.';
            setError(errorMsg);
            toast({ title: 'Upload failed', description: errorMsg, variant: 'error' });
            console.error(err);
        }
    };

    const syncOrders = async () => {
        if (orders.length === 0) { setError('Please upload orders first'); return false; }
        setIsSyncing(true);
        setError('');
        try {
            const results = await Promise.allSettled(
                orders.map(order => api.post('/orders/', {
                    order_number: order.order_number,
                    customer_name: order.customer_name,
                    delivery_address: order.delivery_address,
                    lat: order.lat,
                    lng: order.lng,
                    weight: order.weight,
                    status: 'pending',
                    warehouse_id: selectedWarehouse || undefined,
                }))
            );
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            setSyncedCount(successCount);
            toast({
                title: 'Orders synced',
                description: `Uploaded ${successCount} orders to the system`,
                variant: 'success',
            });
            return true;
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || 'Failed to sync orders.';
            setError(errorMsg);
            toast({ title: 'Order sync failed', description: errorMsg, variant: 'error' });
            return false;
        } finally {
            setIsSyncing(false);
        }
    };

    const handleOptimize = async () => {
        if (orders.length === 0) { setError('Please upload orders first'); return; }
        setIsOptimizing(true);
        setError('');

        try {
            const synced = syncedCount >= orders.length ? true : await syncOrders();
            if (!synced) { setIsOptimizing(false); return; }

            const params: any = {
                method,
                use_ml: useMl,
                use_osrm: useOsrm,
                avg_speed_kmph: avgSpeed,
                ortools_time_limit: timeLimit,
            };
            if (selectedWarehouse) {
                params.warehouse_id = selectedWarehouse;
            }

            const response = await api.post('/routes/optimize', null, { params });
            setOptimizationResult(response.data);
            toast({
                title: 'Optimization complete!',
                description: `Created ${response.data.length} optimized routes`,
                variant: 'success',
            });
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || 'Optimization failed.';
            setError(errorMsg);
            toast({ title: 'Optimization failed', description: errorMsg, variant: 'error' });
        } finally {
            setIsOptimizing(false);
        }
    };

    const totalDistance = optimizationResult?.reduce((sum: number, route: any) =>
        sum + (route.total_distance_km || 0), 0) || 0;
    const totalDuration = optimizationResult?.reduce((sum: number, route: any) =>
        sum + (route.total_duration_min || 0), 0) || 0;

    const selectedWh = warehouses.find(w => w.id === selectedWarehouse);

    return (
        <div className="space-y-6 font-inter">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Route Optimizer</h1>
                    <p className="text-slate-500 text-sm mt-1">Warehouse-centric AI-powered route optimization.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <Zap className="h-4 w-4 text-blue-400" />
                        <span>OR-Tools Engine</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Panel */}
                <div className="space-y-6">
                    {/* Warehouse Selector */}
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                            <Warehouse className="h-5 w-5 mr-2 text-green-400" />
                            Warehouse Depot
                        </h3>
                        <select
                            value={selectedWarehouse}
                            onChange={(e) => setSelectedWarehouse(e.target.value)}
                            className="w-full bg-slate-800/50 border border-white/10 text-white h-12 px-4 rounded-2xl text-sm font-medium focus:outline-none focus:border-green-500/30 transition-all appearance-none cursor-pointer"
                        >
                            <option value="">All Warehouses</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </select>
                        {selectedWh && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-3 p-3 rounded-xl bg-green-500/5 border border-green-500/10"
                            >
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-green-400 font-bold uppercase tracking-widest">Selected Depot</span>
                                    <MapPin className="h-3 w-3 text-green-400" />
                                </div>
                                <p className="text-sm font-medium text-white mt-1">{selectedWh.name}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                    {selectedWh.lat.toFixed(4)}, {selectedWh.lng.toFixed(4)} · Radius: {selectedWh.service_radius_km} km
                                </p>
                            </motion.div>
                        )}
                    </Card>

                    {/* CSV Upload */}
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                            <Upload className="h-5 w-5 mr-2 text-blue-400" />
                            Upload Orders
                        </h3>
                        <div
                            className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragActive
                                ? 'border-blue-500 bg-blue-500/5'
                                : 'border-white/10 hover:border-white/20'
                                }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <FileText className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                            {file ? (
                                <div>
                                    <p className="text-sm font-bold text-white mb-1">{file.name}</p>
                                    <p className="text-xs text-emerald-400">✓ {orders.length} orders loaded</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-sm font-medium text-white mb-1">Drag & drop CSV file here</p>
                                    <p className="text-xs text-slate-500">or click to browse</p>
                                </div>
                            )}
                        </div>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start"
                            >
                                <AlertCircle className="h-4 w-4 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-400">{error}</p>
                            </motion.div>
                        )}
                        <div className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                            <p className="text-xs text-blue-400 font-bold mb-2">CSV Format:</p>
                            <code className="text-[10px] text-slate-400 block">
                                order_number,customer,address,lat,lng,weight
                            </code>
                        </div>
                    </Card>

                    {/* Solver Settings */}
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-6">
                        <div className="flex items-center mb-4">
                            <Settings2 className="h-5 w-5 mr-2 text-blue-400" />
                            <h3 className="text-lg font-bold text-white">Solver Settings</h3>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">
                                    Routing Method
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMethod('ortools')}
                                        className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${method === 'ortools'
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                                            }`}
                                    >OR-Tools</button>
                                    <button
                                        onClick={() => setMethod('greedy')}
                                        className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${method === 'greedy'
                                            ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/30'
                                            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                                            }`}
                                    >Greedy</button>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Smart Features</label>
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-white/5">
                                    <span className="text-sm font-medium text-slate-300">ML ETA Prediction</span>
                                    <button
                                        onClick={() => setUseMl(!useMl)}
                                        className={`relative inline-flex w-12 h-7 rounded-full transition-colors ${useMl ? 'bg-emerald-600' : 'bg-slate-700'}`}
                                    >
                                        <span className={`absolute top-1 left-1 inline-block w-5 h-5 bg-white rounded-full transition-transform ${useMl ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-white/5">
                                    <span className="text-sm font-medium text-slate-300">Real Road Routing (OSRM)</span>
                                    <button
                                        onClick={() => setUseOsrm(!useOsrm)}
                                        className={`relative inline-flex w-12 h-7 rounded-full transition-colors ${useOsrm ? 'bg-cyan-600' : 'bg-slate-700'}`}
                                    >
                                        <span className={`absolute top-1 left-1 inline-block w-5 h-5 bg-white rounded-full transition-transform ${useOsrm ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">
                                    Avg Speed: {avgSpeed} km/h
                                </label>
                                <input type="range" min="10" max="60" value={avgSpeed}
                                    onChange={(e) => setAvgSpeed(parseInt(e.target.value))}
                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                    <span>10</span><span>60</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">
                                    Solver Time: {timeLimit}s
                                </label>
                                <input type="range" min="5" max="30" value={timeLimit}
                                    onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                    <span>5s</span><span>30s</span>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Execution */}
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Execution</h3>
                        <div className="space-y-3">
                            <Button
                                onClick={syncOrders}
                                disabled={isSyncing || orders.length === 0 || syncedCount >= orders.length}
                                className="w-full bg-slate-700 hover:bg-slate-600 text-white h-12 rounded-2xl font-semibold transition-all disabled:opacity-50"
                            >
                                {isSyncing ? 'Syncing...' : `Sync Orders (${syncedCount}/${orders.length})`}
                            </Button>
                            <Button
                                onClick={handleOptimize}
                                disabled={orders.length === 0 || isOptimizing}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white h-14 rounded-2xl font-bold text-base shadow-lg shadow-blue-500/20 group transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isOptimizing ? (
                                    <div className="flex items-center">
                                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                                        Optimizing...
                                    </div>
                                ) : (
                                    <div className="flex items-center">
                                        <Play className="mr-2 h-5 w-5 fill-current transition-transform group-hover:translate-x-1" />
                                        Run Optimization
                                    </div>
                                )}
                            </Button>
                        </div>
                    </Card>

                    {/* Results */}
                    {optimizationResult && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 space-y-3"
                        >
                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Total Distance</span>
                                    <TrendingDown className="h-4 w-4 text-emerald-400" />
                                </div>
                                <p className="text-2xl font-bold text-white">{totalDistance.toFixed(2)} km</p>
                            </div>
                            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Routes Created</span>
                                    <MapPin className="h-4 w-4 text-blue-400" />
                                </div>
                                <p className="text-2xl font-bold text-white">{optimizationResult.length}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Total Duration</span>
                                    <Clock className="h-4 w-4 text-purple-400" />
                                </div>
                                <p className="text-2xl font-bold text-white">{totalDuration.toFixed(0)} min</p>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Map & Results */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] overflow-hidden h-[500px]">
                        <div className="relative h-full">
                            <div className="absolute top-6 left-6 z-10 flex items-center space-x-3 bg-slate-950/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                <span className="text-[11px] font-bold text-white uppercase tracking-widest px-2">
                                    {orders.length} Orders · {warehouses.length} Warehouses
                                </span>
                            </div>
                            {orders.length > 0 || warehouses.length > 0 ? (
                                <div className="h-full w-full">
                                    <LogisticsMap
                                        drivers={[]}
                                        orders={orders.map(o => ({
                                            ...o,
                                            id: o.order_number,
                                            status: 'pending',
                                            tenant_id: 'default'
                                        }))}
                                        routes={optimizationResult || []}
                                        warehouses={selectedWarehouse
                                            ? warehouses.filter(w => w.id === selectedWarehouse)
                                            : warehouses
                                        }
                                        mode="planning"
                                    />
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        <Upload className="h-16 w-16 mx-auto mb-4 text-slate-700" />
                                        <p className="text-slate-500 font-medium">Upload CSV to visualize orders</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Per-Route Breakdown Cards */}
                    {optimizationResult && optimizationResult.length > 0 && (
                        <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-6">
                            <h3 className="text-lg font-bold text-white mb-4">Route Breakdown</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {optimizationResult.map((route: any, i: number) => {
                                    const COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f59e0b', '#ec4899'];
                                    const color = COLORS[i % COLORS.length];
                                    return (
                                        <div
                                            key={route.id || i}
                                            className="p-4 rounded-2xl bg-slate-800/30 border border-white/5"
                                        >
                                            <div className="flex items-center space-x-2 mb-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                                <span className="text-sm font-bold text-white">Route {i + 1}</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Stops</p>
                                                    <p className="text-sm font-bold text-white">
                                                        {route.orders?.length || route.geometry_json?.points?.length || 0}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Distance</p>
                                                    <p className="text-sm font-bold text-white">
                                                        {(route.total_distance_km || 0).toFixed(1)} km
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">ETA</p>
                                                    <p className="text-sm font-bold text-white">
                                                        {(route.total_duration_min || 0).toFixed(0)} min
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* Orders Table */}
                    {orders.length > 0 && (
                        <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-white">Loaded Orders</h3>
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        {orders.length} Total
                                    </span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-xl">
                                            <tr className="border-b border-white/5">
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Order #</th>
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Customer</th>
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Address</th>
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Weight</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            <AnimatePresence>
                                                {orders.map((order, i) => (
                                                    <motion.tr
                                                        key={order.order_number}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.02 }}
                                                        className="hover:bg-white/[0.02] transition-colors"
                                                    >
                                                        <td className="py-3 px-4 text-white font-medium">{order.order_number}</td>
                                                        <td className="py-3 px-4 text-slate-400">{order.customer_name}</td>
                                                        <td className="py-3 px-4 text-slate-400 truncate max-w-[200px]">{order.delivery_address}</td>
                                                        <td className="py-3 px-4 text-slate-400 text-right">{order.weight} kg</td>
                                                    </motion.tr>
                                                ))}
                                            </AnimatePresence>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
