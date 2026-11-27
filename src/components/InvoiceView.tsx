import React from 'react';
import {
  ArrowLeft,
  Copy,
  MessageCircle,
  Printer,
} from 'lucide-react';
import { PublicInvoiceRecord } from '../types/bookkeeping';
import {
  buildPublicUrl,
  buildWhatsAppShareUrl,
  formatDateBn,
  formatTaka,
  toBengaliDigits,
} from '../utils/formatters';

interface InvoiceViewProps {
  invoice: PublicInvoiceRecord;
  isPublicMode?: boolean;
  onBack?: () => void;
  onCopySuccess?: (msg: string) => void;
}

export const InvoiceView: React.FC<InvoiceViewProps> = ({
  invoice,
  isPublicMode = false,
  onBack,
  onCopySuccess,
}) => {
  const publicUrl = buildPublicUrl('invoice', invoice.id);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      onCopySuccess?.('ইনভয়েস লিংক কপি করা হয়েছে!');
    } catch {
      onCopySuccess?.('লিংক কপি করতে সমস্যা হয়েছে।');
    }
  };

  const handleWhatsAppShare = () => {
    const msg = [
      `আসসালামু আলাইকুম ${invoice.partyName},`,
      `এমএস ফ্যাশন (MS Fashion) থেকে আপনার ডিজিটাল ইনভয়েস পাঠানো হলো:`,
      `ইনভয়েস নং: ${invoice.invoiceNo}`,
      `তারিখ: ${formatDateBn(invoice.date)}`,
      `সর্বমোট বিল: ${formatTaka(invoice.totalAmount)}`,
      `জমা: ${formatTaka(invoice.paidAmount)}`,
      `এই ইনভয়েসের বাকি: ${formatTaka(invoice.dueAmount)}`,
      `মোট বকেয়া: ${formatTaka(invoice.partyTotalDue)}`,
      ``,
      `অনলাইনে সম্পূর্ণ ইনভয়েস দেখতে নিচের লিংকে ক্লিক করুন:`,
      publicUrl,
    ].join('\n');

    window.location.assign(buildWhatsAppShareUrl(invoice.partyPhone, msg));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Action Toolbar (Hidden when printing) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E5E8E3] rounded-2xl p-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-[#111815] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              ফিরে যান
            </button>
          )}
          <span className="text-sm font-semibold text-[#4B554E] hidden sm:inline">
            ইনভয়েস #{invoice.invoiceNo}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
            onClick={handlePrint}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4" />
            প্রিন্ট / PDF ডাউনলোড
          </button>
        </div>
      </div>

      {/* Printable Official Invoice Container */}
      <div className="print-only-container bg-white border border-[#E5E8E3] rounded-2xl p-6 md:p-10 max-w-4xl mx-auto">
        {/* Top Letterhead */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b-2 border-[#111815]">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#0D5C46] text-white font-bold flex items-center justify-center text-sm shrink-0">
                MS
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#111815] tracking-tight">
                  এমএস ফ্যাশন (MS Fashion)
                </h1>
                <p className="text-xs text-[#4B554E] mt-0.5">
                  পাইকারি ও খুচরা পোশাক বিক্রয় ও সরবরাহ কেন্দ্র
                </p>
              </div>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="text-base font-bold text-[#0D5C46]">
              {invoice.partyType === 'supplier' ? 'ক্রয় ভাউচার / মেমো' : 'ক্যাশ মেমো / ইনভয়েস'}
            </p>
            <p className="text-sm font-mono-tabular font-semibold text-[#111815] mt-1">
              নং: {invoice.invoiceNo}
            </p>
            <p className="text-xs text-[#4B554E] mt-0.5">
              তারিখ: {formatDateBn(invoice.date)}
            </p>
          </div>
        </div>

        {/* Party Details */}
        <div className="py-5 border-b border-[#E5E8E3] grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-[#4B554E] mb-1">
              {invoice.partyType === 'supplier' ? 'সাপ্লায়ারের বিবরণ' : 'কাস্টমারের বিবরণ'}
            </p>
            <p className="font-bold text-base text-[#111815]">{invoice.partyName}</p>
            {invoice.partyPhone && (
              <p className="text-[#37413B] font-mono-tabular mt-0.5">
                মোবাইল: {invoice.partyPhone}
              </p>
            )}
            {invoice.partyAddress && (
              <p className="text-[#4B554E] mt-0.5">ঠিকানা: {invoice.partyAddress}</p>
            )}
          </div>
          <div className="sm:text-right flex flex-col sm:items-end justify-center">
            <p className="text-xs text-[#4B554E]">পেমেন্ট মাধ্যম</p>
            <p className="font-semibold text-[#111815] mt-0.5">
              {invoice.paymentMethod || 'নগদ'}
            </p>
            <p className="text-xs text-[#4B554E] mt-2">
              অবস্থা:{' '}
              <span
                className={`font-semibold ${
                  invoice.dueAmount > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                }`}
              >
                {invoice.dueAmount > 0 ? 'বাকি রয়েছে' : 'পরিশোধিত'}
              </span>
            </p>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="py-6 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#111815] text-xs font-semibold text-[#37413B]">
                <th className="py-2.5 pr-3 w-12">নং</th>
                <th className="py-2.5 pr-3">প্রোডাক্টের বিবরণ</th>
                <th className="py-2.5 px-3 text-right">পিস</th>
                <th className="py-2.5 px-3 text-right">দর</th>
                <th className="py-2.5 pl-3 text-right">মোট টাকা</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8E3] text-sm">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 pr-3 font-mono-tabular text-[#4B554E] align-top">
                    {toBengaliDigits(idx + 1)}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <p className="font-semibold text-[#111815]">{item.name}</p>
                    {item.details && (
                      <p className="text-xs text-[#4B554E] mt-0.5">{item.details}</p>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-tabular align-top">
                    {toBengaliDigits(item.qty)} পিস
                  </td>
                  <td className="py-3 px-3 text-right font-mono-tabular align-top">
                    {formatTaka(item.unitPrice)}
                  </td>
                  <td className="py-3 pl-3 text-right font-mono-tabular font-semibold text-[#111815] align-top">
                    {formatTaka(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown */}
        <div className="pt-4 border-t border-[#E5E8E3] flex flex-col md:flex-row justify-between gap-6">
          <div className="text-xs text-[#4B554E] max-w-sm space-y-1.5">
            {invoice.note && (
              <div>
                <p className="font-semibold text-[#111815]">মন্তব্য / নোট:</p>
                <p className="mt-0.5 leading-relaxed">{invoice.note}</p>
              </div>
            )}
            <p className="pt-2 text-[#4B554E]">
              ধন্যবাদ! এমএস ফ্যাশন-এর সাথে ব্যবসা করার জন্য আন্তরিক কৃতজ্ঞতা।
            </p>
          </div>

          <div className="w-full md:w-80 space-y-2 text-sm">
            <div className="flex justify-between text-[#4B554E]">
              <span>উপমোট (Subtotal)</span>
              <span className="font-mono-tabular text-[#111815]">
                {formatTaka(invoice.subtotal)}
              </span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-[#4B554E]">
                <span>ছাড় (Discount)</span>
                <span className="font-mono-tabular text-[#15803D]">
                  - {formatTaka(invoice.discount)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-[#E5E8E3] font-bold text-base text-[#111815]">
              <span>সর্বমোট (Grand Total)</span>
              <span className="font-mono-tabular">{formatTaka(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-[#15803D] font-semibold">
              <span>নগদ জমা / পরিশোধ</span>
              <span className="font-mono-tabular">{formatTaka(invoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#E5E8E3] font-bold">
              <span className="text-[#37413B]">এই ইনভয়েসের বাকি</span>
              <span
                className={`font-mono-tabular ${
                  invoice.dueAmount > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                }`}
              >
                {formatTaka(invoice.dueAmount)}
              </span>
            </div>
            <div className="flex justify-between p-3 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3] font-bold">
              <span className="text-[#111815]">মোট বর্তমান বাকি</span>
              <span
                className={`font-mono-tabular ${
                  invoice.partyTotalDue > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                }`}
              >
                {formatTaka(invoice.partyTotalDue)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
