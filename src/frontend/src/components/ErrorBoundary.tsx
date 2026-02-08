import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/dashboard';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
                    <div className="max-w-md w-full">
                        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <AlertCircle className="h-8 w-8 text-red-400" />
                            </div>

                            <h1 className="text-2xl font-bold text-white mb-2">
                                Something went wrong
                            </h1>

                            <p className="text-slate-400 mb-6">
                                We encountered an unexpected error. Don't worry, your data is safe.
                            </p>

                            {this.state.error && (
                                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-6 text-left">
                                    <p className="text-xs font-mono text-red-400 break-all">
                                        {this.state.error.message}
                                    </p>
                                </div>
                            )}

                            <Button
                                onClick={this.handleReset}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white h-12 rounded-xl font-semibold flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Return to Dashboard
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
