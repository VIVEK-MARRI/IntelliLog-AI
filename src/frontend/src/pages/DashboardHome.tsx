import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Truck, Package, Activity, Play, ArrowUpRight, TrendingUp, Layers, Zap } from 'lucide-react';
import { Button } from '../components/ui/button';
import { motion } from 'framer-motion';
import LogisticsMap from '../components/LogisticsMap';
import api from '../lib/api';

export default function DashboardHome() {
    const [data, setData] = useState({
        drivers: [] as any[],
        orders: [] as any[],
        routes: [] as any[]
    });
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [driversRes, ordersRes, routesRes] = await Promise.all([
                api.get('/drivers/'),
                api.get('/orders/'),
                api.get('/routes/')
            ]);
            setData({
                drivers: driversRes.data,
                orders: ordersRes.data,
                routes: routesRes.data
            });
        } catch (error) {
            console.error('Failed to fetch dashboard data', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOptimize = async () => {
        try {
            await api.post('/routes/optimize');
            fetchData();
        } catch (error) {
            console.error('Optimization failed', error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const activeOrders = data.orders.filter(o => o.status === 'pending' || o.status === 'assigned').length;
    const onlineDrivers = data.drivers.filter(d => d.status !== 'offline').length;

    const stats = [
        {
            title: 'Fleet Status',
            value: onlineDrivers,
            total: data.drivers.length,
            label: 'Drivers Online',
            icon: Truck,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10'
        },
        {
            title: 'Active Demand',
            value: activeOrders,
            total: data.orders.length,
            label: 'Ongoing Orders',
            icon: Package,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10'
        },
        {
            title: 'Path Efficiency',
            value: data.routes.length,
            total: null,
            label: 'Optimized Routes',
            icon: Layers,
            color: 'text-orange-400',
            bg: 'bg-orange-500/10'
        },
        {
            title: 'System Health',
            value: '98.2%',
            total: null,
            label: 'AI Reliability',
            icon: Zap,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10'
        },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
        >
            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="group relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl -z-10 group-hover:from-white/10 transition-colors duration-500" />
                        <Card className="bg-transparent border-white/5 backdrop-blur-sm rounded-3xl overflow-hidden group-hover:border-white/10 transition-all duration-300">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} transition-transform duration-300 group-hover:scale-110`}>
                                        <stat.icon className="h-6 w-6" />
                                    </div>
                                    <span className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                                        <ArrowUpRight className="h-3 w-3 mr-1" />
                                        8.2%
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">{stat.title}</p>
                                    <div className="flex items-baseline space-x-2">
                                        <h3 className="text-3xl font-bold text-white tracking-tight">{stat.value}</h3>
                                        {stat.total !== null && (
                                            <span className="text-slate-500 font-medium font-inter">/ {stat.total}</span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1 flex items-center">
                                        <TrendingUp className="h-3 w-3 mr-1.5 text-slate-600" />
                                        {stat.label}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Map & Optimization Section */}
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    <div className="relative rounded-[2.5rem] overflow-hidden glass-card h-[600px] border-white/10">
                        <div className="absolute top-6 left-6 z-10 flex items-center space-x-3 bg-slate-950/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-[11px] font-bold text-white uppercase tracking-widest px-2">Live Grid Monitor</span>
                        </div>

                        <div className="absolute bottom-6 right-6 z-10 flex space-x-2">
                            <div className="bg-slate-950/80 backdrop-blur-md border border-white/10 p-3 rounded-xl flex items-center space-x-3">
                                <span className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" /> Drivers
                                </span>
                                <div className="w-[1px] h-4 bg-white/10" />
                                <span className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full bg-red-500 mr-2" /> Orders
                                </span>
                            </div>
                        </div>

                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-md z-10">
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                                    <div className="text-blue-400 font-outfit font-semibold uppercase tracking-widest text-sm">Syncing Fleet...</div>
                                </div>
                            </div>
                        ) : null}

                        <div className="h-[500px] w-full">
                            <LogisticsMap drivers={data.drivers} orders={data.orders} routes={data.routes} />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] h-full overflow-hidden flex flex-col">
                        <div className="p-8 border-b border-white/5">
                            <h3 className="text-xl font-bold text-white mb-2">AI Routing Engine</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">Neural VRP solver with traffic-aware weighting for maximum efficiency.</p>
                        </div>

                        <div className="p-8 space-y-8 flex-1">
                            <div className="space-y-4">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                    <span className="text-slate-500">Fleet Utilization</span>
                                    <span className="text-blue-400">72%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: '72%' }}
                                        className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                    <span className="text-slate-500">Route Compliance</span>
                                    <span className="text-emerald-400">94%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: '94%' }}
                                        className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                    />
                                </div>
                            </div>

                            <div className="pt-8">
                                <Button
                                    onClick={handleOptimize}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white h-14 rounded-2xl font-bold text-base shadow-lg shadow-blue-500/20 group transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Play className="mr-3 h-5 w-5 fill-current transition-transform group-hover:translate-x-1" />
                                    Trigger AI Optimization
                                </Button>
                                <p className="text-[10px] text-center text-slate-500 mt-4 uppercase tracking-[0.2em] font-semibold">
                                    Next batch in 12:45
                                </p>
                            </div>
                        </div>

                        <div className="p-8 bg-white/5 border-t border-white/5">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                    <Activity className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Analytics Ready</p>
                                    <p className="text-xs text-white">Generate performance report</p>
                                </div>
                                <button className="ml-auto p-2 text-slate-400 hover:text-white transition-colors">
                                    <ArrowUpRight className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </motion.div>
    );
}


