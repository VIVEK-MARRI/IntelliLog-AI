import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Modal } from './Modal';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  actionLabel?: string;
}

const getIconAndColor = (type: string) => {
  switch (type) {
    case 'success':
      return {
        icon: CheckCircle2,
        color: 'text-green-400',
        bgColor: 'bg-green-900/20 border-green-500/50',
      };
    case 'error':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-900/20 border-red-500/50',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        color: 'text-amber-400',
        bgColor: 'bg-amber-900/20 border-amber-500/50',
      };
    default:
      return {
        icon: Info,
        color: 'text-blue-400',
        bgColor: 'bg-blue-900/20 border-blue-500/50',
      };
  }
};

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  actionLabel = 'OK',
}) => {
  const { icon: Icon, color, bgColor } = getIconAndColor(type);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
    >
      {/* Content */}
      <div className="space-y-4">
        <div className={`flex gap-3 p-3 ${bgColor} rounded border`}>
          <Icon className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} />
          <p className="text-sm text-slate-200">{message}</p>
        </div>
      </div>

      {/* Actions */}
      <div
        slot="actions"
        className="flex justify-end"
      >
        <button
          onClick={onClose}
          className="
            px-4 py-2 rounded font-medium
            bg-blue-600 hover:bg-blue-700 transition-colors
            text-white
          "
        >
          {actionLabel}
        </button>
      </div>
    </Modal>
  );
};
