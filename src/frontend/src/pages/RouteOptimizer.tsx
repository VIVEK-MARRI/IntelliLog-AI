import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
    Upload, FileText, Play, Zap,
    CheckCircle2, AlertCircle, TrendingDown, MapPin
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

export default function RouteOptimizer() {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<any>(null);
    const [error, setError] = useState<string>('');
    const [dragActive, setDragActive] = useState(false);

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
            // Parse CSV file
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
            toast({
                title: 'CSV uploaded successfully',
                description: `Loaded ${parsedOrders.length} orders`,
                variant: 'success',
            });
        } catch (err) {
            const errorMsg = 'Failed to parse CSV file. Please check the format.';
            setError(errorMsg);
            toast({
                title: 'Upload failed',
                description: errorMsg,
                variant: 'error',
            });
            console.error(err);
        }
    };

    const handleOptimize = async () => {
        if (orders.length === 0) {
            setError('Please upload orders first');
            return;
        }

        setIsOptimizing(true);
        setError('');

        try {
            const response = await api.post('/routes/optimize');
            setOptimizationResult(response.data);
            toast({
                title: 'Optimization complete!',
                description: `Created ${response.data.length} optimized routes`,
                variant: 'success',
            });
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || 'Optimization failed. Please try again.';
            setError(errorMsg);
            toast({
                title: 'Optimization failed',
                description: errorMsg,
                variant: 'error',
            });
            console.error(err);
        } finally {
            setIsOptimizing(false);
        }
    };

    const totalDistance = optimizationResult?.reduce((sum: number, route: any) =>
        sum + (route.total_distance_km || 0), 0) || 0;

    return (
        <div className="space-y-6 font-inter">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Route Optimizer</h1>
                    <p className="text-slate-500 text-sm mt-1">AI-powered route optimization for maximum efficiency.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <Zap className="h-4 w-4 text-blue-400" />
                        <span>OR-Tools Engine</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Upload Section */}
                <div className="space-y-6">
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
                                    <p className="text-sm font-medium text-white mb-1">
                                        Drag & drop CSV file here
                                    </p>
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

                    {/* Optimization Controls */}
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Optimization</h3>

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

                        {optimizationResult && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 space-y-3"
                            >
                                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                                            Total Distance
                                        </span>
                                        <TrendingDown className="h-4 w-4 text-emerald-400" />
                                    </div>
                                    <p className="text-2xl font-bold text-white">
                                        {totalDistance.toFixed(2)} km
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                                            Routes Created
                                        </span>
                                        <MapPin className="h-4 w-4 text-blue-400" />
                                    </div>
                                    <p className="text-2xl font-bold text-white">
                                        {optimizationResult.length}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </Card>
                </div>

                {/* Map & Results */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Map */}
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] overflow-hidden h-[500px]">
                        <div className="relative h-full">
                            <div className="absolute top-6 left-6 z-10 flex items-center space-x-3 bg-slate-950/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                <span className="text-[11px] font-bold text-white uppercase tracking-widest px-2">
                                    {orders.length} Orders Loaded
                                </span>
                            </div>

                            {orders.length > 0 ? (
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
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                    Order #
                                                </th>
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                    Customer
                                                </th>
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                    Address
                                                </th>
                                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                                                    Weight
                                                </th>
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
                                                        <td className="py-3 px-4 text-white font-medium">
                                                            {order.order_number}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-400">
                                                            {order.customer_name}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-400 truncate max-w-[200px]">
                                                            {order.delivery_address}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-400 text-right">
                                                            {order.weight} kg
                                                        </td>
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
