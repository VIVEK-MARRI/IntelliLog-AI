import { useState } from 'react';
import { Card } from '../components/ui/card';
import {
    Settings, Zap, Bell, Shield, Key,
    Smartphone, Database, Brain, Save
} from 'lucide-react';

export default function SettingsManagement() {
    const [activeTab, setActiveTab] = useState('general');

    const tabs = [
        { id: 'general', name: 'General', icon: Settings },
        { id: 'ai', name: 'AI Engine', icon: Brain },
        { id: 'api', name: 'API Keys', icon: Key },
        { id: 'notifications', name: 'Alerts', icon: Bell },
        { id: 'security', name: 'Node Security', icon: Shield },
    ];

    return (
        <div className="space-y-8 font-inter">
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">System Configuration</h1>
                <p className="text-slate-500 text-sm mt-1">Fine-tune your global logistics infrastructure.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Tabs Sidebar */}
                <Card className="lg:w-72 bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-3xl p-4 flex lg:flex-col gap-2 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center space-x-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap
                                ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <tab.icon className="h-4 w-4" />
                            <span>{tab.name}</span>
                        </button>
                    ))}
                </Card>

                {/* Content Area */}
                <div className="flex-1 space-y-6">
                    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2.5rem] p-10">
                        {activeTab === 'general' && (
                            <div className="space-y-8">
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-white flex items-center">
                                        <Database className="h-5 w-5 mr-3 text-blue-500" /> Infrastructure Node
                                    </h3>
                                    <div className="grid gap-6 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Fleet Identifier</label>
                                            <input defaultValue="GLOBAL-GRID-01" className="w-full bg-slate-950/50 border border-white/5 h-12 px-4 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/30" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Region Assignment</label>
                                            <select className="w-full bg-slate-950/50 border border-white/5 h-12 px-4 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-blue-500/30 appearance-none">
                                                <option>North America (East)</option>
                                                <option>Europe (Central)</option>
                                                <option>Asia Pacific</option>
                                            </select>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-6 pt-8 border-t border-white/5">
                                    <h3 className="text-lg font-bold text-white flex items-center">
                                        <Smartphone className="h-5 w-5 mr-3 text-emerald-500" /> Driver Interface
                                    </h3>
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                        <div>
                                            <p className="text-sm font-bold text-white">Live Telemetry</p>
                                            <p className="text-xs text-slate-500">Stream high-frequency GPS data from driver devices.</p>
                                        </div>
                                        <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                                            <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                        <div>
                                            <p className="text-sm font-bold text-white">Proof of Delivery</p>
                                            <p className="text-xs text-slate-500">Require digital signatures for all fulfillment events.</p>
                                        </div>
                                        <div className="w-12 h-6 bg-slate-800 rounded-full relative cursor-pointer">
                                            <div className="absolute left-1 top-1 w-4 h-4 bg-slate-400 rounded-full" />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div className="space-y-8">
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-white flex items-center">
                                        <Brain className="h-5 w-5 mr-3 text-purple-500" /> Neural Network Weights
                                    </h3>
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                                                <span>Traffic Weighting (LSTM)</span>
                                                <span className="text-white">High (0.85)</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-950 rounded-full border border-white/5 overflow-hidden">
                                                <div className="h-full bg-purple-500 w-[85%] shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                                                <span>Fuel Conservation vs Speed</span>
                                                <span className="text-white">Medium (0.50)</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-950 rounded-full border border-white/5 overflow-hidden">
                                                <div className="h-full bg-blue-500 w-1/2 shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="p-6 rounded-3xl bg-blue-600/10 border border-blue-500/20">
                                    <div className="flex items-start">
                                        <Zap className="h-6 w-6 text-blue-400 mr-4 mt-1" />
                                        <div>
                                            <h4 className="text-sm font-bold text-white mb-2">ML Autopilot Mode</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">System will automatically trigger optimization cycles when the fleet efficiency score drops below 85%.</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab !== 'general' && activeTab !== 'ai' && (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="p-6 rounded-full bg-white/5 mb-6">
                                    <Settings className="h-12 w-12 text-slate-700 animate-spin-slow" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{tabs.find(t => t.id === activeTab)?.name} Configuration</h3>
                                <p className="text-sm text-slate-500 max-w-xs">Initializing secure connection to the {activeTab} service node. Stand by...</p>
                            </div>
                        )}

                        <div className="mt-12 flex justify-end">
                            <button className="flex items-center px-8 py-4 bg-blue-600 rounded-2xl text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98]">
                                <Save className="h-4 w-4 mr-2" />
                                Save Configuration
                            </button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
