import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LedgerEntrySnapshot,
  PublicInvoiceRecord,
  PublicLedgerRecord,
  PublicPersonLedgerRecord,
} from '../types/bookkeeping';
import { PartyProfileView } from './PartyProfileView';
import { InvoiceView } from './InvoiceView';
import { formatDateBn, formatTaka, sanitizeId } from '../utils/formatters';

interface PublicPortalViewProps {
  customerId?: string | null;
  supplierId?: string | null;
  invoiceId?: string | null;
  personId?: string | null;
  isAdminLoggedIn?: boolean;
  onExitPublicView?: () => void;
  onCopySuccess: (msg: string) => void;
}

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({
  customerId,
  supplierId,
  invoiceId,
  personId,
  isAdminLoggedIn = false,
  onExitPublicView,
  onCopySuccess,
}) => {
  const [ledger, setLedger] = useState<PublicLedgerRecord | null>(null);
  const [personLedger, setPersonLedger] =
    useState<PublicPersonLedgerRecord | null>(null);
  const [invoice, setInvoice] = useState<PublicInvoiceRecord | null>(null);
  const [selectedEntryInvoice, setSelectedEntryInvoice] =
    useState<PublicInvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const safeCustomerId = customerId ? sanitizeId(customerId) : null;
  const safeSupplierId = supplierId ? sanitizeId(supplierId) : null;
  const safeInvoiceId = invoiceId ? sanitizeId(invoiceId) : null;
  const safePersonId = personId ? sanitizeId(personId) : null;

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setLedger(null);
    setPersonLedger(null);
    setInvoice(null);
    setSelectedEntryInvoice(null);

    if (safeInvoiceId) {
      const path = `publicInvoices/${safeInvoiceId}`;
      const unsub = onSnapshot(
        doc(db, 'publicInvoices', safeInvoiceId),
        (snap) => {
          if (snap.exists()) {
            setInvoice(snap.data() as PublicInvoiceRecord);
            setNotFound(false);
          } else {
            setNotFound(true);
          }
          setLoading(false);
        },
        (error) => {
          if (error.code === 'permission-denied') {
            setNotFound(true);
            setLoading(false);
            return;
          }
          handleFirestoreError(error, OperationType.GET, path);
        },
      );
      return () => unsub();
    }

    if (safePersonId) {
      const path = `publicPersonLedgers/${safePersonId}`;
      const unsub = onSnapshot(
        doc(db, 'publicPersonLedgers', safePersonId),
        (snap) => {
          if (snap.exists()) {
            setPersonLedger(snap.data() as PublicPersonLedgerRecord);
            setNotFound(false);
          } else {
            setNotFound(true);
          }
          setLoading(false);
        },
        (error) => {
          if (error.code === 'permission-denied') {
            setNotFound(true);
            setLoading(false);
            return;
          }
          handleFirestoreError(error, OperationType.GET, path);
        },
      );
      return () => unsub();
    }

    const targetCollection = safeCustomerId
      ? 'publicCustomerLedgers'
      : safeSupplierId
        ? 'publicSupplierLedgers'
        : null;
    const targetId = safeCustomerId || safeSupplierId;

    if (!targetCollection || !targetId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const path = `${targetCollection}/${targetId}`;
    const unsub = onSnapshot(
      doc(db, targetCollection, targetId),
      (snap) => {
        if (snap.exists()) {
          setLedger(snap.data() as PublicLedgerRecord);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      },
      (error) => {
        if (error.code === 'permission-denied') {
          setNotFound(true);
          setLoading(false);
          return;
        }
        handleFirestoreError(error, OperationType.GET, path);
      },
    );

    return () => unsub();
  }, [safeCustomerId, safeSupplierId, safeInvoiceId, safePersonId]);

  const handleOpenInvoiceFromLedger = (entry: LedgerEntrySnapshot) => {
    if (!ledger) return;
    setSelectedEntryInvoice({
      id: entry.txId,
      invoiceNo: entry.invoiceNo,
      date: entry.date,
      partyType: ledger.partyType,
      partyId: ledger.id,
      partyName: ledger.name,
      partyPhone: ledger.phone,
      partyAddress: ledger.address,
      items: entry.items,
      subtotal: entry.subtotal,
      discount: entry.discount,
      totalAmount: entry.totalAmount,
      paidAmount: entry.paidAmount,
      dueAmount: entry.dueAmount,
      partyTotalDue: ledger.currentDue,
      paymentMethod: entry.paymentMethod,
      note: entry.note,
      shareEnabled: true,
      ownerUid: ledger.ownerUid,
    });
  };

  return (
    <div className="min-h-screen bg-[#F6F7F5]">
      <header className="no-print bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 md:px-6 min-h-16 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center shrink-0">
            <img
              src="https://imgur.com/Af1qii8.png"
              alt="এমএস ফ্যাশন"
              referrerPolicy="no-referrer"
              className="w-[120px] h-auto max-h-14 object-contain block"
            />
          </div>

          {isAdminLoggedIn && onExitPublicView ? (
            <button
              type="button"
              onClick={onExitPublicView}
              className="min-h-[40px] px-4 py-1.5 text-xs md:text-sm font-semibold text-white bg-black hover:bg-neutral-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ড্যাশবোর্ডে ফিরুন
            </button>
          ) : (
            <span className="text-xs font-semibold text-black whitespace-nowrap shrink-0">
              অনলাইন ডিজিটাল হিসাব
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {loading ? (
          <div className="bg-white border border-[#E5E8E3] rounded-2xl p-8 space-y-4 animate-pulse">
            <div className="h-7 bg-[#E5E8E3] rounded-lg w-1/3" />
            <div className="h-4 bg-[#F2F4F0] rounded-lg w-1/2" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="h-20 bg-[#F2F4F0] rounded-xl" />
              <div className="h-20 bg-[#F2F4F0] rounded-xl" />
              <div className="h-20 bg-[#F2F4F0] rounded-xl" />
            </div>
          </div>
        ) : notFound ? (
          <div className="bg-white border border-[#E5E8E3] rounded-2xl p-8 md:p-12 text-center max-w-lg mx-auto">
            <h1 className="text-xl font-bold text-[#111815] mb-2">
              হিসাব বা ইনভয়েস পাওয়া যায়নি
            </h1>
            <p className="text-sm text-[#4B554E] leading-relaxed">
              আপনার লিংকটি সঠিক কিনা যাচাই করুন অথবা এমএস ফ্যাশন-এর সাথে যোগাযোগ করে নতুন শেয়ার লিংক সংগ্রহ করুন।
            </p>
            {isAdminLoggedIn && onExitPublicView && (
              <button
                type="button"
                onClick={onExitPublicView}
                className="mt-6 min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-[#0D5C46] rounded-xl cursor-pointer"
              >
                ড্যাশবোর্ডে ফিরুন
              </button>
            )}
          </div>
        ) : selectedEntryInvoice ? (
          <InvoiceView
            invoice={selectedEntryInvoice}
            isPublicMode={true}
            onBack={() => setSelectedEntryInvoice(null)}
            onCopySuccess={onCopySuccess}
          />
        ) : invoice ? (
          <InvoiceView
            invoice={invoice}
            isPublicMode={true}
            onCopySuccess={onCopySuccess}
          />
        ) : personLedger ? (
          <div className="bg-white border border-[#E5E8E3] rounded-2xl p-6 md:p-8 space-y-6">
            <div className="pb-6 border-b border-[#E5E8E3]">
              <p className="text-xs font-semibold text-[#0D5C46] mb-1">
                এমএস ফ্যাশন (MS Fashion) · {personLedger.role}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-[#111815]">
                {personLedger.name}
              </h1>
              {personLedger.phone && (
                <p className="text-sm font-mono-tabular text-[#4B554E] mt-1">
                  {personLedger.phone}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
                <p className="text-xs font-medium text-[#4B554E]">মোট প্রাপ্য / পাবে (+)</p>
                <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-1">
                  {formatTaka(personLedger.totalPayable)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
                <p className="text-xs font-medium text-[#4B554E]">মোট দেওয়া হয়েছে (-)</p>
                <p className="text-2xl font-bold font-mono-tabular text-[#15803D] mt-1">
                  {formatTaka(personLedger.totalGiven)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
                <p className="text-xs font-semibold text-[#37413B]">
                  {personLedger.currentBalance >= 0 ? 'বর্তমান প্রাপ্য বাকি' : 'অগ্রিম দেওয়া'}
                </p>
                <p
                  className={`text-2xl font-bold font-mono-tabular mt-1 ${
                    personLedger.currentBalance > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                  }`}
                >
                  {formatTaka(Math.abs(personLedger.currentBalance))}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E8E3] text-xs font-semibold text-[#4B554E]">
                    <th className="py-3 pr-3">তারিখ</th>
                    <th className="py-3 pr-3">বিবরণ / কারণ</th>
                    <th className="py-3 px-3 text-right">পাবে (+)</th>
                    <th className="py-3 px-3 text-right">দিয়েছি (-)</th>
                    <th className="py-3 pl-3 text-right">ব্যালেন্স</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] text-sm">
                  {personLedger.entries.map((e) => (
                    <tr key={e.ptxId}>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <div className="font-medium text-[#111815]">{formatDateBn(e.date)}</div>
                        <div className="text-xs text-[#4B554E]">{e.paymentMethod}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-[#111815]">{e.purpose}</div>
                        {e.note && <div className="text-xs text-[#4B554E]">{e.note}</div>}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-semibold">
                        {e.payableAmount > 0 ? `+ ${formatTaka(e.payableAmount)}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-[#15803D]">
                        {e.givenAmount > 0 ? `- ${formatTaka(e.givenAmount)}` : '—'}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono-tabular font-bold">
                        {formatTaka(e.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : ledger ? (
          <PartyProfileView
            partyId={ledger.id}
            partyType={ledger.partyType}
            name={ledger.name}
            phone={ledger.phone}
            address={ledger.address}
            totalBilled={ledger.totalBilled}
            totalPaid={ledger.totalPaid}
            currentDue={ledger.currentDue}
            entries={ledger.entries}
            isPublicMode={true}
            onOpenInvoice={handleOpenInvoiceFromLedger}
            onCopySuccess={onCopySuccess}
          />
        ) : null}
      </main>
    </div>
  );
};
