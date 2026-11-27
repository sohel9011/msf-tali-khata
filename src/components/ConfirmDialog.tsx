import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'নিশ্চিত করুন',
  cancelLabel = 'বাতিল',
  isDanger = true,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E5E8E3] rounded-2xl max-w-md w-full p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[#111815] mb-2">{title}</h3>
        <p className="text-sm text-[#4B554E] leading-relaxed mb-6">{description}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#37413B] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`min-h-[44px] px-5 py-2 text-sm font-semibold text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
              isDanger
                ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                : 'bg-[#0D5C46] hover:bg-[#094534]'
            }`}
          >
            {loading ? 'প্রক্রিয়াধীন...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
