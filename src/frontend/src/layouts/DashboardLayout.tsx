import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    Map,
    Settings,
    LogOut,
    Truck,
    Package,
    Shield,
    Bell,
    Search,
    Zap
} from 'lucide-react';

export default function DashboardLayout() {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { name: 'Overview', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'Route Optimizer', icon: Zap, path: '/dashboard/optimizer' },
        { name: 'Fleet Control', icon: Map, path: '/dashboard/fleet' },
        { name: 'Orders', icon: Package, path: '/dashboard/orders' },
        { name: 'Analytics', icon: Shield, path: '/dashboard/analytics' },
        { name: 'Settings', icon: Settings, path: '/dashboard/settings' },
    ];

    return (
        <div className="flex h-screen bg-[#020617] text-slate-100 overflow-hidden font-inter">
            {/* Sidebar */}
            <aside className="w-72 border-r border-white/5 bg-slate-900/20 backdrop-blur-2xl flex flex-col z-20">
                <div className="p-8 pb-10 flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
                        <Truck className="h-6 w-6" />
                    </div>
                    <div>
                        <span className="font-bold text-xl tracking-tight block leading-tight">IntelliLog</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-semibold">AI Command Center</span>
                    </div>
                </div>

                <div className="px-4 mb-4">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                        <input
                            placeholder="Quick search..."
                            className="w-full bg-slate-950/50 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                        />
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-1 overflow-y-auto pt-2">
                    {navItems.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group
                                ${location.pathname === item.path
                                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
                        >
                            <item.icon className={`mr-3 h-5 w-5 transition-transform duration-300 ${location.pathname === item.path ? 'scale-110' : 'group-hover:scale-110'}`} />
                            {item.name}
                            {location.pathname === item.path && (
                                <motion.div
                                    layoutId="active-pill"
                                    className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,1)]"
                                />
                            )}
                        </button>
                    ))}
                </nav>

                <div className="p-4 mt-auto">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600/10 to-transparent border border-white/5 mb-6">
                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">PRO PLAN</p>
                        <p className="text-[11px] text-slate-400 mb-3">Optimize without limits</p>
                        <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors">
                            Manage Billing
                        </button>
                    </div>

                    <div className="flex items-center p-3 rounded-2xl bg-slate-950/40 border border-white/5 group transition-colors hover:border-white/10">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-sm font-bold border border-white/10">
                            {user?.full_name?.[0] || 'A'}
                        </div>
                        <div className="ml-3 flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user?.full_name || 'Admin'}</p>
                            <p className="text-[11px] text-slate-500 truncate">{user?.email || 'admin@intellilog.ai'}</p>
                        </div>
                        <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-[#020617] relative">
                {/* Background Decorations */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-600/5 blur-[120px] pointer-events-none" />

                {/* Top Header */}
                <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#020617]/50 backdrop-blur-md sticky top-0 z-10">
                    <h2 className="text-lg font-semibold text-white">
                        {navItems.find(i => i.path === location.pathname)?.name || 'Dashboard'}
                    </h2>
                    <div className="flex items-center space-x-4">
                        <button className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition-colors relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#020617]" />
                        </button>
                        <div className="h-8 w-[1px] bg-white/5" />
                        <div className="text-right hidden sm:block">
                            <p className="text-xs text-slate-500">System Status</p>
                            <p className="text-xs font-bold text-green-400 flex items-center justify-end">
                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                                Operational
                            </p>
                        </div>
                    </div>
                </header>

                <div className="p-8 relative">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

