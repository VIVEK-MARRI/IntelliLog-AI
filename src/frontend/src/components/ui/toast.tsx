import * as React from "react"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export interface ToastProps {
    id: string
    title?: string
    description?: string
    variant?: "default" | "success" | "error" | "warning" | "info"
    duration?: number
    onClose: (id: string) => void
}

const variantStyles = {
    default: "bg-slate-900/90 border-white/10 text-white",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    error: "bg-red-500/10 border-red-500/30 text-red-400",
    warning: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
}

const variantIcons = {
    default: null,
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
}

export function Toast({
    id,
    title,
    description,
    variant = "default",
    duration = 5000,
    onClose,
}: ToastProps) {
    React.useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose(id)
            }, duration)
            return () => clearTimeout(timer)
        }
    }, [id, duration, onClose])

    const icon = variantIcons[variant]

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            className={`
        pointer-events-auto w-full max-w-sm rounded-2xl border p-4 shadow-2xl backdrop-blur-xl
        ${variantStyles[variant]}
      `}
        >
            <div className="flex items-start gap-3">
                {icon && (
                    <div className="flex-shrink-0 text-xl font-bold">
                        {icon}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    {title && (
                        <div className="text-sm font-bold mb-1">
                            {title}
                        </div>
                    )}
                    {description && (
                        <div className="text-xs opacity-90">
                            {description}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => onClose(id)}
                    className="flex-shrink-0 rounded-lg p-1 hover:bg-white/10 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </motion.div>
    )
}

export function Toaster({ toasts, onClose }: { toasts: ToastProps[], onClose: (id: string) => void }) {
    return (
        <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <div key={toast.id} className="mb-2">
                        <Toast {...toast} onClose={onClose} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    )
}
