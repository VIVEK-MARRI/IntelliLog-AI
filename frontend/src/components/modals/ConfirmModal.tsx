import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading: _isLoading = false,
}) => {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const isDanger = variant === 'danger';
  const confirmBtnColor = isDanger
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnBackdropClick={!isProcessing}
    >
      {/* Content */}
      <div className="space-y-4">
        {isDanger && (
          <div className="flex gap-3 p-3 bg-red-900/20 border border-red-500/50 rounded">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">This action cannot be undone.</p>
          </div>
        )}
        <p className="text-slate-300">{message}</p>
      </div>

      {/* Actions */}
      <div
        slot="actions"
        className="flex gap-3"
      >
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="
            flex-1 px-4 py-2 rounded font-medium
            bg-slate-700 hover:bg-slate-600 transition-colors
            text-slate-100 disabled:opacity-50
          "
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className={`
            flex-1 px-4 py-2 rounded font-medium transition-colors
            text-white disabled:opacity-50
            ${confirmBtnColor}
          `}
        >
          {isProcessing ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
