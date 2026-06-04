import React from 'react';
import { useToast } from './ToastProvider';
import { ToastItem } from './Toast';

export const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  return (
    <div
      className="fixed bottom-6 right-6 z-50 space-y-3 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
};
