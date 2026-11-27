import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:max-w-sm z-50 no-print">
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-[#111815] text-white border-[#24332C]'
            : 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#34D399] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
          )}
          <span className="truncate">{toast.text}</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="বন্ধ করুন"
          className="p-1 opacity-75 hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
