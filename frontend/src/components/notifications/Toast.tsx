import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import type { Toast } from './ToastProvider';
import { useToast } from './ToastProvider';

interface ToastComponentProps {
  toast: Toast;
}

const getIcon = (type: Toast['type']) => {
  const iconClass = 'w-5 h-5';
  switch (type) {
    case 'success':
      return <CheckCircle2 className={`${iconClass} text-green-400`} />;
    case 'error':
      return <AlertCircle className={`${iconClass} text-red-400`} />;
    case 'warning':
      return <AlertTriangle className={`${iconClass} text-amber-400`} />;
    case 'info':
      return <Info className={`${iconClass} text-blue-400`} />;
    default:
      return null;
  }
};

const getBgColor = (type: Toast['type']) => {
  switch (type) {
    case 'success':
      return 'bg-slate-800 border-green-500';
    case 'error':
      return 'bg-slate-800 border-red-500';
    case 'warning':
      return 'bg-slate-800 border-amber-500';
    case 'info':
      return 'bg-slate-800 border-blue-500';
    default:
      return 'bg-slate-800 border-slate-700';
  }
};

export const ToastItem: React.FC<ToastComponentProps> = ({ toast }) => {
  const { removeToast } = useToast();
  const [isExiting, setIsExiting] = useState(false);
  const duration = toast.duration ?? 5000;

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  };

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(handleClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, toast.id]);

  return (
    <div
      className={`
        transform transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
    >
      <div
        className={`
          flex items-start gap-3 p-4 rounded-lg border
          ${getBgColor(toast.type)}
          shadow-lg backdrop-blur-sm
          max-w-sm
        `}
      >
        {/* Icon */}
        <div className="flex-shrink-0 pt-0.5">{getIcon(toast.type)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">
            {toast.title}
          </h3>
          {toast.message && (
            <p className="text-sm text-slate-300 mt-1">
              {toast.message}
            </p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                handleClose();
              }}
              className="text-sm font-medium text-blue-400 hover:text-blue-300 mt-2 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-1 rounded hover:bg-slate-700 transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4 text-slate-400 hover:text-slate-300" />
        </button>
      </div>
    </div>
  );
};
