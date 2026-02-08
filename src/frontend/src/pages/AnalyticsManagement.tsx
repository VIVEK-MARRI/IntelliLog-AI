import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/ui/card';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, PieChart, Pie
} from 'recharts';
import {
    TrendingUp, Shield, Zap, Clock, ArrowUpRight,
    Filter, Download
} from 'lucide-react';
import api from '../lib/api';


const performanceData = [
    { name: '08:00', fuel: 45, efficiency: 85, latency: 12 },
    { name: '10:00', fuel: 52, efficiency: 82, latency: 15 },
    { name: '12:00', fuel: 48, efficiency: 88, latency: 10 },
    { name: '14:00', fuel: 61, efficiency: 79, latency: 18 },
    { name: '16:00', fuel: 55, efficiency: 92, latency: 11 },
    { name: '18:00', fuel: 42, efficiency: 95, latency: 8 },
    { name: '20:00', fuel: 38, efficiency: 90, latency: 9 },
];

const distributionData = [
    { name: 'Urban', value: 400, color: '#3b82f6' },
    { name: 'Highways', value: 300, color: '#06b6d4' },
    { name: 'Last-Mile', value: 300, color: '#10b981' },
    { name: 'Rural', value: 200, color: '#f59e0b' },
];

export default function AnalyticsManagement() {
    const [analyticsData, setAnalyticsData] = useState({
        drivers: [] as any[],
        orders: [] as any[],
        routes: [] as any[]
    });
    const [isLoading, setIsLoading] = useState(true);

    const fetchAnalytics = async () => {
        try {
            const [driversRes, ordersRes, routesRes] = await Promise.all([
                api.get('/drivers/'),
                api.get('/orders/'),
                api.get('/routes/')
            ]);
            setAnalyticsData({
                drivers: driversRes.data,
                orders: ordersRes.data,
                routes: routesRes.data
            });
        } catch (error) {
            console.error('Failed to fetch analytics', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const efficiencyScore = analyticsData.orders.length > 0
        ? ((analyticsData.orders.filter(o => o.status === 'assigned' || o.status === 'delivered').length / analyticsData.orders.length) * 100).toFixed(1)
        : '0.0';

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    if (isLoading) {
        return (
            <div className="flex h-[70vh] items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                    <div className="text-slate-500 font-bold uppercase tracking-widest text-xs">Processing Big Data...</div>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-8"
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">System Analytics</h1>
                    <p className="text-slate-500 text-sm mt-1">Real-time performance intelligence and AI insights.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button className="flex items-center px-4 py-2 bg-slate-900 border border-white/5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors">
                        <Filter className="h-4 w-4 mr-2" />
                        Last 24 Hours
                    </button>
                    <button className="flex items-center px-4 py-2 bg-blue-600 rounded-xl text-xs font-bold text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20">
                        <Download className="h-4 w-4 mr-2" />
                        Export Intelligence
                    </button>
                </div>
            </div>

            {/* Top Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div variants={item}>
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <TrendingUp className="h-24 w-24 text-blue-500" />
                        </div>
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center">
                            <Zap className="h-3 w-3 mr-2" /> Efficiency Score
                        </p>
                        <h3 className="text-4xl font-bold text-white mb-2 tracking-tighter">{efficiencyScore}%</h3>
                        <p className="text-xs text-emerald-400 font-bold flex items-center">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> Live <span className="text-slate-500 ml-2 font-medium">Optimization Index</span>
                        </p>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Shield className="h-24 w-24 text-emerald-500" />
                        </div>
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center">
                            <Clock className="h-3 w-3 mr-2" /> Assigned Capacity
                        </p>
                        <h3 className="text-4xl font-bold text-white mb-2 tracking-tighter">{analyticsData.routes.length}</h3>
                        <p className="text-xs text-emerald-400 font-bold flex items-center">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> Active <span className="text-slate-500 ml-2 font-medium">Logistics Threads</span>
                        </p>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="h-24 w-24 text-orange-500" />
                        </div>
                        <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-4 flex items-center">
                            <TrendingUp className="h-3 w-3 mr-2" /> AI Accuracy
                        </p>
                        <h3 className="text-4xl font-bold text-white mb-2 tracking-tighter">98.2%</h3>
                        <p className="text-xs text-orange-400 font-bold flex items-center">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> +0.8% <span className="text-slate-500 ml-2 font-medium">Model Precision</span>
                        </p>
                    </Card>
                </motion.div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div variants={item} className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Fleet Efficiency vs Latency</h3>
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-8 h-[400px]">
                        <div className="h-full w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={performanceData}>
                                    <defs>
                                        <linearGradient id="colorEff" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="efficiency"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorEff)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="latency"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        fill="transparent"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </motion.div>

                <motion.div variants={item} className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Delivery Distribution</h3>
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-8 h-[400px] flex items-center justify-center relative">
                        <div className="h-full w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={distributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={120}
                                        paddingAngle={8}
                                        dataKey="value"
                                    >
                                        {distributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute flex flex-col items-center">
                                <span className="text-3xl font-bold text-white tracking-tighter">{analyticsData.orders.length}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Orders</span>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </div>

            <motion.div variants={item}>
                <Card className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
                        <Shield className="h-48 w-48" />
                    </div>
                    <div className="relative z-10 md:w-2/3">
                        <h3 className="text-2xl font-bold mb-3">AI Deep Learning Forecast</h3>
                        <p className="text-blue-100 text-sm leading-relaxed mb-6">
                            Our neural network predicts a 15% surge in last-mile demand for the next 48 hours.
                            We recommend pre-assigning 4 standby drivers to the Urban Grid to maintain 98%+ SLA compliance.
                        </p>
                        <button className="bg-white text-blue-600 px-6 py-3 rounded-2xl text-xs font-bold hover:bg-slate-100 transition-colors">
                            Apply Recommendations
                        </button>
                    </div>
                </Card>
            </motion.div>
        </motion.div>
    );
}
