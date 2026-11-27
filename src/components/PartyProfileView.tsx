import React, { useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Edit3,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  LedgerEntrySnapshot,
  PartyType,
  TransactionRecord,
  TransactionType,
} from '../types/bookkeeping';
import {
  buildPublicUrl,
  buildWhatsAppShareUrl,
  formatDateBn,
  formatTaka,
  getTransactionTypeLabel,
} from '../utils/formatters';

interface PartyProfileViewProps {
  partyId: string;
  partyType: PartyType;
  name: string;
  phone: string;
  address: string;
  totalBilled: number;
  totalPaid: number;
  currentDue: number;
  entries: LedgerEntrySnapshot[];
  isPublicMode?: boolean;
  onBack?: () => void;
  onAddEntry?: (type: TransactionType, partyId: string) => void;
  onEditEntry?: (txId: string) => void;
  onDeleteEntry?: (txId: string) => void;
  onOpenInvoice?: (entry: LedgerEntrySnapshot) => void;
  onEditParty?: () => void;
  onDeleteParty?: () => void;
  onCopySuccess?: (msg: string) => void;
  transactionsById?: Record<string, TransactionRecord>;
}

export const PartyProfileView: React.FC<PartyProfileViewProps> = ({
  partyId,
  partyType,
  name,
  phone,
  address,
  totalBilled,
  totalPaid,
  currentDue,
  entries,
  isPublicMode = false,
  onBack,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onOpenInvoice,
  onEditParty,
  onDeleteParty,
  onCopySuccess,
}) => {
  const [filter, setFilter] = useState<'all' | 'bills' | 'payments'>('all');
  const isSupplier = partyType === 'supplier';
  const publicUrl = buildPublicUrl(partyType, partyId);

  const filteredEntries = entries.filter((entry) => {
    if (filter === 'bills') {
      return (
        entry.type === 'customer_sale' ||
        entry.type === 'supplier_purchase' ||
        entry.type === 'supplier_due_add' ||
        entry.type === 'customer_due_add'
      );
    }
    if (filter === 'payments') {
      return entry.type === 'customer_payment' || entry.type === 'supplier_payment';
    }
    return true;
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      onCopySuccess?.('হিসাবের পাবলিক লিংক কপি করা হয়েছে!');
    } catch {
      onCopySuccess?.('লিংক কপি করতে সমস্যা হয়েছে।');
    }
  };

  const handleWhatsAppShare = () => {
    const msg = [
      `আসসালামু আলাইকুম ${name},`,
      `এমএস ফ্যাশন (MS Fashion)-এর সাথে আপনার হালনাগাদ হিসাব বিবরণী:`,
      `মোট ${isSupplier ? 'সরবরাহ/বিল' : 'কেনাকাটা'}: ${formatTaka(totalBilled)}`,
      `মোট ${isSupplier ? 'পরিশোধ' : 'জমা'}: ${formatTaka(totalPaid)}`,
      `বর্তমান ${isSupplier ? 'পাওনা/বাকি' : 'বাকি'}: ${formatTaka(currentDue)}`,
      ``,
      `সম্পূর্ণ বিবরণ ও ইনভয়েস লাইভ দেখতে নিচের লিংকে ক্লিক করুন:`,
      publicUrl,
    ].join('\n');

    window.location.assign(buildWhatsAppShareUrl(phone, msg));
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              ফিরে যান
            </button>
          )}
          <span className="text-xs font-medium text-[#4B554E]">
            {isSupplier ? 'সাপ্লায়ার খাতা' : 'কাস্টমার খাতা'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Copy className="w-4 h-4" />
            লিংক কপি করুন
          </button>

          {!isPublicMode && (
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#15803D] hover:bg-[#166534] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp-এ পাঠান
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4" />
            প্রিন্ট
          </button>
        </div>
      </div>

      {/* Party Summary Card */}
      <div className="print-only-container bg-white border border-[#E5E8E3] rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-[#E5E8E3]">
          <div>
            {isPublicMode && (
              <p className="text-xs font-semibold text-[#0D5C46] mb-1">
                এমএস ফ্যাশন (MS Fashion) · লাইভ অ্যাকাউন্ট স্টেটমেন্ট
              </p>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-[#111815]">{name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#4B554E] mt-1.5">
              <span>{isSupplier ? 'সাপ্লায়ার' : 'কাস্টমার'}</span>
              {phone && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{phone}</span>
                </>
              )}
              {address && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{address}</span>
                </>
              )}
            </div>
          </div>

          {!isPublicMode && (
            <div className="no-print flex flex-wrap items-center gap-2">
              {onAddEntry && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onAddEntry(
                        isSupplier ? 'supplier_payment' : 'customer_payment',
                        partyId,
                      )
                    }
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Wallet className="w-4 h-4" />
                    {isSupplier ? 'পেমেন্ট যোগ করুন' : 'টাকা আদায় করুন'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAddEntry(
                        isSupplier ? 'supplier_purchase' : 'customer_sale',
                        partyId,
                      )
                    }
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    {isSupplier ? 'নতুন মাল যোগ করুন' : 'নতুন ইনভয়েস'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAddEntry(
                        isSupplier ? 'supplier_due_add' : 'customer_due_add',
                        partyId,
                      )
                    }
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    {isSupplier ? 'আগের বাকি / টাকা নেওয়া' : 'আগের বাকি যোগ'}
                  </button>
                </>
              )}
              {onEditParty && (
                <button
                  type="button"
                  onClick={onEditParty}
                  aria-label="তথ্য সম্পাদনা"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#4B554E] hover:text-[#111815] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl transition-colors cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              {onDeleteParty && (
                <button
                  type="button"
                  onClick={onDeleteParty}
                  aria-label="প্রোফাইল মুছুন"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* 3 Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
            <p className="text-xs font-medium text-[#4B554E]">
              {isSupplier ? 'মোট কেনাকাটা (বিল)' : 'মোট বিক্রি (বিল)'}
            </p>
            <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-1">
              {formatTaka(totalBilled)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
            <p className="text-xs font-medium text-[#4B554E]">
              {isSupplier ? 'মোট পরিশোধ' : 'মোট জমা / আদায়'}
            </p>
            <p className="text-2xl font-bold font-mono-tabular text-[#15803D] mt-1">
              {formatTaka(totalPaid)}
            </p>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              currentDue > 0
                ? 'bg-[#FEF2F2] border-[#FECACA]'
                : 'bg-[#F0FDF4] border-[#BBF7D0]'
            }`}
          >
            <p className="text-xs font-semibold text-[#37413B]">
              {isSupplier ? 'বর্তমান বাকি (দেনা)' : 'বর্তমান বাকি (পাওনা)'}
            </p>
            <p
              className={`text-2xl font-bold font-mono-tabular mt-1 ${
                currentDue > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
              }`}
            >
              {formatTaka(currentDue)}
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-2">
          <h2 className="text-base font-bold text-[#111815]">
            হিসাবের খাতা (ধারাবাহিক লেজার)
          </h2>
          <div className="flex items-center gap-1 p-1 bg-[#F2F4F0] rounded-xl">
            {(
              [
                { id: 'all', label: 'সব লেনদেন' },
                { id: 'bills', label: isSupplier ? 'মাল / বাকি যোগ' : 'ইনভয়েস / বাকি যোগ' },
                { id: 'payments', label: 'পেমেন্ট / জমা' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-[#111815] shadow-xs'
                    : 'text-[#4B554E] hover:text-[#111815]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-[#D4DAD2] rounded-xl">
            <p className="text-sm font-medium text-[#4B554E]">
              এখনো কোনো লেনদেনের হিসাব যোগ করা হয়নি।
            </p>
            {!isPublicMode && onAddEntry && (
              <button
                type="button"
                onClick={() =>
                  onAddEntry(
                    isSupplier ? 'supplier_purchase' : 'customer_sale',
                    partyId,
                  )
                }
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                প্রথম হিসাব যোগ করুন
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E8E3] text-xs font-semibold text-[#4B554E]">
                    <th className="py-3 pr-3">তারিখ</th>
                    <th className="py-3 pr-3">বিবরণ ও পণ্য</th>
                    <th className="py-3 px-3 text-right">যোগ (+)</th>
                    <th className="py-3 px-3 text-right">মাইনাস (-)</th>
                    <th className="py-3 px-3 text-right">চলমান বাকি</th>
                    <th className="no-print py-3 pl-3 text-right">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] text-sm">
                  {filteredEntries.map((entry) => {
                    const isInvoice =
                      entry.type === 'customer_sale' ||
                      entry.type === 'supplier_purchase';
                    return (
                      <tr
                        key={entry.txId}
                        className="hover:bg-[#F8F9F7] transition-colors"
                      >
                        <td className="py-3.5 pr-3 whitespace-nowrap align-top">
                          <div className="font-medium text-[#111815]">
                            {formatDateBn(entry.date)}
                          </div>
                          <div className="text-xs font-mono-tabular text-[#4B554E] mt-0.5">
                            {entry.invoiceNo}
                          </div>
                        </td>
                        <td className="py-3.5 pr-3 align-top">
                          <div className="font-semibold text-[#111815]">
                            {getTransactionTypeLabel(entry.type)}
                          </div>
                          <div className="text-xs text-[#4B554E] mt-0.5 leading-relaxed">
                            {entry.summary}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-[#111815] whitespace-nowrap align-top">
                          {entry.debit > 0 ? `+ ${formatTaka(entry.debit)}` : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-[#15803D] whitespace-nowrap align-top">
                          {entry.credit > 0 ? `- ${formatTaka(entry.credit)}` : '—'}
                        </td>
                        <td
                          className={`py-3.5 px-3 text-right font-mono-tabular font-bold whitespace-nowrap align-top ${
                            entry.runningBalance > 0
                              ? 'text-[#B91C1C]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {formatTaka(entry.runningBalance)}
                        </td>
                        <td className="no-print py-3.5 pl-3 text-right whitespace-nowrap align-top">
                          <div className="inline-flex items-center gap-1">
                            {isInvoice && onOpenInvoice && (
                              <button
                                type="button"
                                onClick={() => onOpenInvoice(entry)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-lg transition-colors cursor-pointer"
                              >
                                ইনভয়েস
                              </button>
                            )}
                            {!isPublicMode && onEditEntry && (
                              <button
                                type="button"
                                onClick={() => onEditEntry(entry.txId)}
                                aria-label="সম্পাদনা"
                                className="p-2 text-[#4B554E] hover:text-[#111815] rounded-lg hover:bg-[#E5E8E3]/60 transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            {!isPublicMode && onDeleteEntry && (
                              <button
                                type="button"
                                onClick={() => onDeleteEntry(entry.txId)}
                                aria-label="মুছুন"
                                className="p-2 text-[#B91C1C] rounded-lg hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Cards */}
            <div className="md:hidden divide-y divide-[#E5E8E3]">
              {filteredEntries.map((entry) => {
                const isInvoice =
                  entry.type === 'customer_sale' ||
                  entry.type === 'supplier_purchase';
                return (
                  <div key={entry.txId} className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-[#4B554E]">
                          {formatDateBn(entry.date)} ·{' '}
                          <span className="font-mono-tabular">{entry.invoiceNo}</span>
                        </p>
                        <p className="text-sm font-bold text-[#111815] mt-0.5">
                          {getTransactionTypeLabel(entry.type)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-[#4B554E]">চলমান বাকি</p>
                        <p
                          className={`text-sm font-bold font-mono-tabular ${
                            entry.runningBalance > 0
                              ? 'text-[#B91C1C]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {formatTaka(entry.runningBalance)}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-[#4B554E] leading-relaxed">
                      {entry.summary}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-3 text-xs font-mono-tabular">
                        {entry.debit > 0 && (
                          <span className="font-semibold text-[#111815]">
                            যোগ: +{formatTaka(entry.debit)}
                          </span>
                        )}
                        {entry.credit > 0 && (
                          <span className="font-semibold text-[#15803D]">
                            জমা: -{formatTaka(entry.credit)}
                          </span>
                        )}
                      </div>

                      <div className="no-print flex items-center gap-1.5">
                        {isInvoice && onOpenInvoice && (
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(entry)}
                            className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 rounded-lg cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            ইনভয়েস
                          </button>
                        )}
                        {!isPublicMode && onEditEntry && (
                          <button
                            type="button"
                            onClick={() => onEditEntry(entry.txId)}
                            aria-label="সম্পাদনা"
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#4B554E] bg-[#F2F4F0] rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isPublicMode && onDeleteEntry && (
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(entry.txId)}
                            aria-label="মুছুন"
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#B91C1C] bg-[#FEF2F2] rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
