import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { motion } from 'framer-motion';
import { Truck, Lock, Mail, ArrowRight, ShieldCheck, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
    const [email, setEmail] = useState('admin@intellilog.ai');
    const [password, setPassword] = useState('password');
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setError('Invalid credentials');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#020617] relative overflow-hidden font-inter">
            {/* Background Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/10 blur-[120px] rounded-full" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md z-10"
            >
                <div className="text-center mb-10">
                    <motion.div
                        initial={{ y: -20 }}
                        animate={{ y: 0 }}
                        className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-2xl shadow-blue-500/20 mb-6"
                    >
                        <Truck className="h-10 w-10" />
                    </motion.div>
                    <h1 className="text-4xl font-bold text-white tracking-tight mb-2 font-outfit">IntelliLog AI</h1>
                    <p className="text-slate-400 text-sm font-medium tracking-wide">ENTERPRISE LOGISTICS CONTROL</p>
                </div>

                <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent blur-2xl -z-10 opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                    <Card className="bg-slate-900/40 border-white/10 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <CardContent className="p-10">
                            <form onSubmit={handleLogin} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Work Email</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                        <Input
                                            type="email"
                                            placeholder="admin@intellilog.ai"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="bg-slate-950/50 border-white/5 h-14 pl-12 rounded-2xl text-white placeholder:text-slate-600 focus:border-blue-500/50 transition-all font-medium"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Access Key</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                        <Input
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="bg-slate-950/50 border-white/5 h-14 pl-12 rounded-2xl text-white placeholder:text-slate-600 focus:border-blue-500/50 transition-all"
                                            required
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-sm text-red-400 text-center font-medium"
                                    >
                                        {error}
                                    </motion.p>
                                )}

                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white h-14 rounded-2xl font-bold text-base shadow-lg shadow-blue-500/20 group transition-all duration-300 overflow-hidden relative"
                                >
                                    {isLoading ? (
                                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <span className="flex items-center justify-center">
                                            Establish Connection
                                            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                        </span>
                                    )}
                                </Button>
                            </form>

                            <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <span className="flex items-center"><ShieldCheck className="h-3 w-3 mr-1.5 text-blue-500" /> Secure Node</span>
                                <span className="flex items-center"><Globe className="h-3 w-3 mr-1.5 text-blue-500" /> Global Grid</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <p className="text-center mt-8 text-slate-500 text-xs font-medium">
                    Authorized Personnel Only. System Access is Monitored.
                </p>
            </motion.div>
        </div>
    );
}

