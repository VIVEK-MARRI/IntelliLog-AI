import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/card';
import {
    Search, Filter, Plus,
    Package, Clock, CheckCircle2, AlertCircle,
    User, MapPin, Truck, ChevronRight
} from 'lucide-react';
import api from '../lib/api';

const statusStyles = {
    pending: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    assigned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    picked_up: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const statusIcons = {
    pending: Clock,
    assigned: User,
    picked_up: Truck,
    delivered: CheckCircle2,
    cancelled: AlertCircle,
};

export default function OrderManagement() {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchOrders = async () => {
        try {
            const res = await api.get('/orders/');
            setOrders(res.data);
        } catch (error) {
            console.error('Failed to fetch orders', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const filteredOrders = orders.filter(order =>
        (order.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.delivery_address || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 font-inter">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Order Lifecycle</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage and monitor global supply chain operations.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button className="flex items-center px-4 py-3 bg-white/5 border border-white/5 rounded-2xl text-xs font-bold text-slate-400 hover:text-white transition-all hover:bg-white/10">
                        <Filter className="h-4 w-4 mr-2" />
                        Refine
                    </button>
                    <button className="flex items-center px-6 py-3 bg-blue-600 rounded-2xl text-xs font-bold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">
                        <Plus className="h-4 w-4 mr-2" />
                        New Order
                    </button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input
                    type="text"
                    placeholder="Search by Order #, Customer, or Address..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900/40 border border-white/5 h-16 pl-14 pr-6 rounded-3xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/30 backdrop-blur-xl transition-all"
                />
            </div>

            {/* Orders Table */}
            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Package Info</th>
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Customer & Location</th>
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Logistics Data</th>
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Status</th>
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            <AnimatePresence>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-32 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                                                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Syncing Logistics DB...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-32 text-center text-slate-500 font-medium italic">
                                            Zero records found scanning the grid.
                                        </td>
                                    </tr>
                                ) : filteredOrders.map((order, i) => {
                                    const StatusIcon = statusIcons[order.status as keyof typeof statusIcons] || Clock;
                                    return (
                                        <motion.tr
                                            key={order.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                                        >
                                            <td className="px-8 py-6">
                                                <div className="flex items-center space-x-4">
                                                    <div className="p-3 rounded-2xl bg-slate-950 border border-white/5 text-slate-400 group-hover:text-blue-400 transition-colors">
                                                        <Package className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white mb-0.5">{order.order_number || 'No SKU'}</p>
                                                        <p className="text-xs text-slate-500 font-medium">Standard Ground</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="max-w-[200px]">
                                                    <p className="text-sm font-semibold text-white mb-0.5 truncate">{order.customer_name}</p>
                                                    <p className="text-[11px] text-slate-500 flex items-center truncate">
                                                        <MapPin className="h-3 w-3 mr-1 text-slate-600 shrink-0" /> {order.delivery_address}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                                        <Clock className="h-3 w-3 mr-2" /> ETA: 14:20
                                                    </div>
                                                    <div className="h-1 w-24 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 w-2/3 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border ${statusStyles[order.status as keyof typeof statusStyles]}`}>
                                                    <StatusIcon className="h-3 w-3 mr-1.5" />
                                                    {order.status}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <button className="p-2.5 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-all transform hover:scale-110">
                                                    <ChevronRight className="h-5 w-5" />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
                <div className="px-8 py-5 border-t border-white/5 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-white/[0.01]">
                    <span>Showing {filteredOrders.length} of {orders.length} Results</span>
                    <div className="flex space-x-2">
                        <button className="px-3 py-1 px rounded-lg bg-white/5 hover:bg-white/10 transition-colors">Prev</button>
                        <button className="px-3 py-1 px rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">1</button>
                        <button className="px-3 py-1 px rounded-lg bg-white/5 hover:bg-white/10 transition-colors">Next</button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
