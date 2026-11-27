import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X, UserPlus } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  LEDGER_PAYMENT_METHODS,
  LineItem,
  PartyRecord,
  TransactionRecord,
  TransactionType,
} from '../types/bookkeeping';
import { formatTaka, getTodayIsoDate } from '../utils/formatters';
import {
  generateInvoiceNo,
  saveTransactionAndSyncLedger,
} from '../services/bookkeepingService';

interface EntryFormModalProps {
  open: boolean;
  onClose: () => void;
  suppliers: PartyRecord[];
  customers: PartyRecord[];
  transactions: TransactionRecord[];
  initialType?: TransactionType;
  initialPartyId?: string;
  editingTransaction?: TransactionRecord | null;
  onSaved: (message: string, result?: { txId: string; partyId: string; type: TransactionType }) => void;
  onError: (message: string) => void;
}

const PAYMENT_METHODS: readonly string[] = LEDGER_PAYMENT_METHODS;

function emptyItem(): LineItem {
  return { name: '', details: '', qty: 1, unitPrice: 0, lineTotal: 0 };
}

export const EntryFormModal: React.FC<EntryFormModalProps> = ({
  open,
  onClose,
  suppliers,
  customers,
  transactions,
  initialType = 'customer_sale',
  initialPartyId,
  editingTransaction,
  onSaved,
  onError,
}) => {
  const [type, setType] = useState<TransactionType>(initialType);
  const [date, setDate] = useState<string>(getTodayIsoDate());
  const [isNewParty, setIsNewParty] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [discount, setDiscount] = useState<string>('0');
  const [directAmount, setDirectAmount] = useState<string>('0');
  const [paidAmount, setPaidAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<string>('নগদ');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const isSupplierType =
    type === 'supplier_purchase' ||
    type === 'supplier_payment' ||
    type === 'supplier_due_add';
  const isBillType = type === 'supplier_purchase' || type === 'customer_sale';
  const isCashDueAdd =
    type === 'supplier_due_add' || type === 'customer_due_add';
  const partyList = isSupplierType ? suppliers : customers;

  useEffect(() => {
    if (!open) return;
    if (editingTransaction) {
      setType(editingTransaction.type);
      setDate(editingTransaction.date);
      setIsNewParty(false);
      setSelectedPartyId(editingTransaction.partyId);
      setPartyName(editingTransaction.partyName);
      setPartyPhone(editingTransaction.partyPhone);
      setPartyAddress(editingTransaction.partyAddress);
      setInvoiceNo(editingTransaction.invoiceNo);
      setItems(
        editingTransaction.items.length > 0
          ? editingTransaction.items.map((it) => ({ ...it }))
          : [emptyItem()],
      );
      setDiscount(String(editingTransaction.discount || 0));
      setDirectAmount(String(editingTransaction.totalAmount || 0));
      setPaidAmount(String(editingTransaction.paidAmount || 0));
      setPaymentMethod(editingTransaction.paymentMethod || 'নগদ');
      setNote(editingTransaction.note || '');
      return;
    }

    const startType = initialType;
    setType(startType);
    setDate(getTodayIsoDate());
    const list =
      startType === 'supplier_purchase' ||
      startType === 'supplier_payment' ||
      startType === 'supplier_due_add'
        ? suppliers
        : customers;
    const preselected = initialPartyId
      ? list.find((p) => p.id === initialPartyId)
      : undefined;

    if (preselected) {
      setIsNewParty(false);
      setSelectedPartyId(preselected.id);
      setPartyName(preselected.name);
      setPartyPhone(preselected.phone);
      setPartyAddress(preselected.address);
    } else if (list.length > 0) {
      setIsNewParty(false);
      setSelectedPartyId(list[0].id);
      setPartyName(list[0].name);
      setPartyPhone(list[0].phone);
      setPartyAddress(list[0].address);
    } else {
      setIsNewParty(true);
      setSelectedPartyId('');
      setPartyName('');
      setPartyPhone('');
      setPartyAddress('');
    }

    setInvoiceNo(generateInvoiceNo(transactions, startType));
    setItems([emptyItem()]);
    setDiscount('0');
    setDirectAmount('0');
    setPaidAmount('0');
    setPaymentMethod(
      startType === 'supplier_due_add' || startType === 'customer_due_add'
        ? 'পূর্বের বাকি'
        : 'নগদ',
    );
    setNote('');
  }, [open, editingTransaction, initialType, initialPartyId]);

  const handleTypeChange = (nextType: TransactionType) => {
    if (editingTransaction) return;
    setType(nextType);
    const nextIsSupplier =
      nextType === 'supplier_purchase' ||
      nextType === 'supplier_payment' ||
      nextType === 'supplier_due_add';
    if (nextIsSupplier !== isSupplierType) {
      const nextList = nextIsSupplier ? suppliers : customers;
      if (nextList.length > 0) {
        setIsNewParty(false);
        setSelectedPartyId(nextList[0].id);
        setPartyName(nextList[0].name);
        setPartyPhone(nextList[0].phone);
        setPartyAddress(nextList[0].address);
      } else {
        setIsNewParty(true);
        setSelectedPartyId('');
        setPartyName('');
        setPartyPhone('');
        setPartyAddress('');
      }
    }
    setDirectAmount('0');
    setPaymentMethod(
      nextType === 'supplier_due_add' || nextType === 'customer_due_add'
        ? 'পূর্বের বাকি'
        : 'নগদ',
    );
    setInvoiceNo(generateInvoiceNo(transactions, nextType));
  };

  const selectedParty = useMemo(
    () => partyList.find((p) => p.id === selectedPartyId),
    [partyList, selectedPartyId],
  );

  const handleSelectParty = (id: string) => {
    setSelectedPartyId(id);
    const found = partyList.find((p) => p.id === id);
    if (found) {
      setPartyName(found.name);
      setPartyPhone(found.phone);
      setPartyAddress(found.address);
    }
  };

  const handleToggleNewParty = () => {
    if (editingTransaction) return;
    const next = !isNewParty;
    setIsNewParty(next);
    if (next) {
      setSelectedPartyId('');
      setPartyName('');
      setPartyPhone('');
      setPartyAddress('');
    } else if (partyList.length > 0) {
      handleSelectParty(partyList[0].id);
    }
  };

  const updateItemField = (
    index: number,
    field: keyof LineItem,
    value: string | number,
  ) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        const q = Number(updated.qty) || 0;
        const p = Number(updated.unitPrice) || 0;
        updated.lineTotal = Math.round(q * p * 100) / 100;
        return updated;
      }),
    );
  };

  const addItemRow = () => {
    if (items.length >= BLUEPRINT_LIMITS.ITEMS_MAX) return;
    setItems((prev) => [...prev, emptyItem()]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
        0,
      ),
    [items],
  );
  const discountNum = Math.max(0, Number(discount) || 0);
  const directAmountNum = Math.max(0, Number(directAmount) || 0);
  const grandTotal = Math.max(0, subtotal - discountNum);
  const paidNum = Math.max(0, Number(paidAmount) || 0);
  const dueAmount = isBillType ? grandTotal - paidNum : 0;

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const effectiveParty = isNewParty ? undefined : selectedParty;
    const finalName = isNewParty ? partyName : effectiveParty?.name || partyName;
    const finalPhone = isNewParty ? partyPhone : effectiveParty?.phone || partyPhone;
    const finalAddress = isNewParty
      ? partyAddress
      : effectiveParty?.address || partyAddress;

    if (!finalName.trim()) {
      onError(
        isSupplierType
          ? 'সাপ্লায়ারের নাম নির্বাচন করুন অথবা নতুন নাম লিখুন।'
          : 'কাস্টমারের নাম নির্বাচন করুন অথবা নতুন নাম লিখুন।',
      );
      return;
    }

    if (isCashDueAdd && directAmountNum <= 0) {
      onError('অনুগ্রহ করে আগের বাকি বা নেওয়া টাকার পরিমাণ লিখুন।');
      return;
    }

    if (!isBillType && !isCashDueAdd && paidNum <= 0) {
      onError('অনুগ্রহ করে পরিশোধিত বা আদায়কৃত টাকার পরিমাণ লিখুন।');
      return;
    }

    setSaving(true);
    try {
      const targetPartyId = effectiveParty?.id;
      const partyTxs = targetPartyId
        ? transactions.filter((t) => t.partyId === targetPartyId)
        : [];

      const res = await saveTransactionAndSyncLedger(
        {
          txId: editingTransaction?.id,
          type,
          date,
          partyId: targetPartyId,
          isNewParty,
          partyName: finalName,
          partyPhone: finalPhone,
          partyAddress: finalAddress,
          invoiceNo,
          items: isBillType ? items : [],
          discount: isBillType ? discountNum : 0,
          directAmount: isCashDueAdd ? directAmountNum : 0,
          paidAmount: isCashDueAdd ? 0 : paidNum,
          paymentMethod,
          note,
        },
        effectiveParty,
        editingTransaction || undefined,
        partyTxs,
        transactions,
      );

      onSaved(
        editingTransaction
          ? 'হিসাব সফলভাবে হালনাগাদ হয়েছে।'
          : 'নতুন হিসাব ক্লাউডে সংরক্ষণ করা হয়েছে।',
        { txId: res.txId, partyId: res.partyId, type },
      );
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'সংরক্ষণ করতে সমস্যা হয়েছে।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 backdrop-blur-xs p-0 md:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full md:max-w-3xl rounded-t-3xl md:rounded-2xl border border-[#E5E8E3] max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-[#E5E8E3] shrink-0">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[#111815]">
              {editingTransaction ? 'হিসাব সম্পাদনা করুন' : 'নতুন হিসাব যোগ করুন'}
            </h2>
            <p className="text-xs text-[#4B554E] mt-0.5">
              এমএস ফ্যাশন — তাৎক্ষণিক লেজার ও ইনভয়েস আপডেট
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B554E] hover:bg-[#F2F4F0] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 md:p-6 space-y-5">
          {/* Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#4B554E] mb-2">
              লেনদেনের ধরন নির্বাচন করুন
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1 bg-[#F2F4F0] rounded-xl">
              {(
                [
                  { id: 'customer_sale', label: 'কাস্টমার বিক্রি' },
                  { id: 'customer_due_add', label: 'কাস্টমার আগের বাকি' },
                  { id: 'customer_payment', label: 'কাস্টমার আদায়' },
                  { id: 'supplier_purchase', label: 'সাপ্লায়ার ক্রয়' },
                  { id: 'supplier_due_add', label: 'সাপ্লায়ার বাকি / নেওয়া' },
                  { id: 'supplier_payment', label: 'সাপ্লায়ার পেমেন্ট' },
                ] as { id: TransactionType; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  disabled={Boolean(editingTransaction)}
                  onClick={() => handleTypeChange(tab.id)}
                  className={`min-h-[42px] px-2.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap truncate cursor-pointer disabled:cursor-not-allowed ${
                    type === tab.id
                      ? 'bg-white text-[#0D5C46] shadow-xs'
                      : 'text-[#4B554E] hover:text-[#111815]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Invoice No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                তারিখ
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                {isBillType
                  ? 'ইনভয়েস / ভাউচার নং'
                  : isCashDueAdd
                    ? 'ভাউচার / রেফারেন্স নং'
                    : 'রসিদ নং'}
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.INVOICE_NO_MAX}
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="MSF-1001"
                className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm font-mono-tabular text-[#111815] focus:outline-none focus:border-[#0D5C46]"
              />
            </div>
          </div>

          {/* Party Selector */}
          <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#111815]">
                {isSupplierType ? 'সাপ্লায়ারের তথ্য' : 'কাস্টমারের তথ্য'}
              </span>
              {!editingTransaction && (
                <button
                  type="button"
                  onClick={handleToggleNewParty}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D5C46] hover:underline cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {isNewParty
                    ? 'বিদ্যমান তালিকা থেকে বাছাই করুন'
                    : isSupplierType
                      ? '+ নতুন সাপ্লায়ার যোগ করুন'
                      : '+ নতুন কাস্টমার যোগ করুন'}
                </button>
              )}
            </div>

            {!isNewParty && partyList.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={selectedPartyId}
                  disabled={Boolean(editingTransaction)}
                  onChange={(e) => handleSelectParty(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46] disabled:bg-[#F2F4F0]"
                >
                  {partyList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.phone ? `(${p.phone})` : ''}
                    </option>
                  ))}
                </select>
                {selectedParty && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4B554E]">
                    <span>
                      বর্তমান {isSupplierType ? 'বাকি' : 'পাওনা'}:{' '}
                      <strong className="font-mono-tabular text-[#B91C1C]">
                        {formatTaka(selectedParty.currentDue)}
                      </strong>
                    </span>
                    {selectedParty.phone && (
                      <span>মোবাইল: {selectedParty.phone}</span>
                    )}
                    {selectedParty.address && (
                      <span>ঠিকানা: {selectedParty.address}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4B554E] mb-1">
                    {isSupplierType ? 'সাপ্লায়ারের নাম *' : 'কাস্টমারের নাম *'}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.NAME_MAX}
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="যেমন: করিম গার্মেন্টস"
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B554E] mb-1">
                    মোবাইল নম্বর
                  </label>
                  <input
                    type="tel"
                    maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                    value={partyPhone}
                    onChange={(e) => setPartyPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm font-mono-tabular text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4B554E] mb-1">
                    ঠিকানা
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.ADDRESS_MAX}
                    value={partyAddress}
                    onChange={(e) => setPartyAddress(e.target.value)}
                    placeholder="মার্কেট / শহর"
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Multi-item Product List for Sale / Purchase */}
          {isBillType && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[#111815]">
                  প্রোডাক্টের তালিকা
                </label>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  আরও প্রোডাক্ট যোগ করুন
                </button>
              </div>

              <div className="space-y-2.5">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-[#E5E8E3] bg-white grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                        প্রোডাক্টের নাম *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={item.name}
                        onChange={(e) =>
                          updateItemField(idx, 'name', e.target.value)
                        }
                        placeholder="যেমন: থ্রি-পিস / পাঞ্জাবি"
                        className="w-full min-h-[40px] px-3 py-1.5 border border-[#D4DAD2] rounded-lg text-sm focus:outline-none focus:border-[#0D5C46]"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                        বিবরণ (রং/সাইজ)
                      </label>
                      <input
                        type="text"
                        maxLength={160}
                        value={item.details}
                        onChange={(e) =>
                          updateItemField(idx, 'details', e.target.value)
                        }
                        placeholder="কটন, L/XL"
                        className="w-full min-h-[40px] px-3 py-1.5 border border-[#D4DAD2] rounded-lg text-sm focus:outline-none focus:border-[#0D5C46]"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:contents gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                          পিস (Qty)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={item.qty}
                          onChange={(e) =>
                            updateItemField(idx, 'qty', e.target.value)
                          }
                          className="w-full min-h-[40px] px-2.5 py-1.5 border border-[#D4DAD2] rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                          দর (৳)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItemField(idx, 'unitPrice', e.target.value)
                          }
                          className="w-full min-h-[40px] px-2.5 py-1.5 border border-[#D4DAD2] rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-1 flex items-center justify-between sm:justify-end gap-2">
                      <span className="sm:hidden text-xs font-mono-tabular font-semibold text-[#111815]">
                        মোট: {formatTaka(item.lineTotal)}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          aria-label="প্রোডাক্ট সরান"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="hidden sm:flex sm:col-span-12 justify-end text-xs text-[#4B554E] pt-1 border-t border-[#F2F4F0]">
                      লাইন মোট:{' '}
                      <span className="font-mono-tabular font-semibold text-[#111815] ml-1.5">
                        {formatTaka(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals & Payment / Cash Due Section */}
          <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3] space-y-4">
            {isCashDueAdd ? (
              <>
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#7F1D1D] leading-relaxed">
                  {isSupplierType
                    ? 'প্রোডাক্ট না নিয়ে সাপ্লায়ারের কাছ থেকে ক্যাশ/নগদ টাকা নিলে অথবা আগের খাতার বকেয়া যোগ করতে চাইলে এখান থেকে এন্ট্রি করুন। এটি সরাসরি সাপ্লায়ারের মোট বাকিতে যোগ (+) হবে।'
                    : 'প্রোডাক্ট বিক্রি না করেই কাস্টমারের আগের খাতার বকেয়া যোগ করতে অথবা সরাসরি ক্যাশ/নগদ পাওনা লিখতে চাইলে এখান থেকে এন্ট্রি করুন। এটি কাস্টমারের মোট পাওনায় যোগ (+) হবে।'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      টাকার পরিমাণ (৳) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={directAmount}
                      onChange={(e) => setDirectAmount(e.target.value)}
                      placeholder="০"
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-base font-bold font-mono-tabular text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      হিসাবের ধরন / মাধ্যম
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E8E3]">
                  <span className="text-sm font-semibold text-[#37413B]">
                    {isSupplierType
                      ? 'সাপ্লায়ারের বাকি বাড়বে'
                      : 'কাস্টমারের পাওনা বাড়বে'}
                  </span>
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono-tabular text-[#B91C1C]">
                      + {formatTaka(directAmountNum)}
                    </span>
                    {!editingTransaction && selectedParty && (
                      <p className="text-[11px] text-[#4B554E] font-mono-tabular">
                        নতুন মোট {isSupplierType ? 'বাকি' : 'পাওনা'}:{' '}
                        {formatTaka(selectedParty.currentDue + directAmountNum)}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {isBillType ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-[#E5E8E3]">
                    <div>
                      <span className="block text-xs text-[#4B554E]">উপমোট (Subtotal)</span>
                      <span className="text-base font-bold font-mono-tabular text-[#111815]">
                        {formatTaka(subtotal)}
                      </span>
                    </div>
                    <div>
                      <label className="block text-xs text-[#4B554E] mb-1">
                        ছাড় / ডিসকাউন্ট (৳)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D4DAD2] rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                      />
                    </div>
                    <div>
                      <span className="block text-xs text-[#4B554E]">সর্বমোট বিল</span>
                      <span className="text-lg font-bold font-mono-tabular text-[#0D5C46]">
                        {formatTaka(grandTotal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#166534] leading-relaxed">
                    {isSupplierType
                      ? 'কোনো পণ্য ক্রয় ছাড়াই সাপ্লায়ারকে সরাসরি পেমেন্ট বা অগ্রিম টাকা দিলে এখান থেকে এন্ট্রি করুন। এটি সাপ্লায়ারের বর্তমান বাকি থেকে কমবে।'
                      : 'কোনো ইনভয়েস ছাড়াই কাস্টমারের কাছ থেকে সরাসরি বকেয়া আদায় করলে এখান থেকে এন্ট্রি করুন। এটি কাস্টমারের মোট পাওনা থেকে কমবে।'}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[#37413B]">
                        {isSupplierType
                          ? 'পরিশোধিত টাকা (ক্যাশ/নগদ/ব্যাংক)'
                          : 'আদায়কৃত / জমা টাকা (৳)'}
                      </label>
                      {(isBillType || (selectedParty && selectedParty.currentDue > 0)) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isBillType) {
                              setPaidAmount(String(grandTotal));
                            } else if (selectedParty && selectedParty.currentDue > 0) {
                              setPaidAmount(String(selectedParty.currentDue));
                            }
                          }}
                          className="text-[11px] font-semibold text-[#0D5C46] hover:underline cursor-pointer"
                        >
                          {isBillType ? 'পুরো বিল পরিশোধ' : 'সম্পূর্ণ বাকি'}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-base font-bold font-mono-tabular text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      পেমেন্ট মাধ্যম
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46]"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isBillType ? (
                  <div className="flex items-center justify-between pt-2 border-t border-[#E5E8E3]">
                    <span className="text-sm font-semibold text-[#37413B]">
                      এই {isSupplierType ? 'ক্রয়ের' : 'ইনভয়েসের'} বাকি
                    </span>
                    <span
                      className={`text-lg font-bold font-mono-tabular ${
                        dueAmount > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                      }`}
                    >
                      {formatTaka(dueAmount)}
                    </span>
                  </div>
                ) : (
                  !editingTransaction &&
                  selectedParty && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E8E3]">
                      <span className="text-sm font-semibold text-[#37413B]">
                        {isSupplierType
                          ? 'এই পেমেন্টের পর সাপ্লায়ারের হিসাব'
                          : 'এই আদায়ের পর কাস্টমারের হিসাব'}
                      </span>
                      <div className="text-right">
                        {selectedParty.currentDue - paidNum >= 0 ? (
                          <span
                            className={`text-lg font-bold font-mono-tabular ${
                              selectedParty.currentDue - paidNum > 0
                                ? 'text-[#B91C1C]'
                                : 'text-[#15803D]'
                            }`}
                          >
                            বাকি: {formatTaka(selectedParty.currentDue - paidNum)}
                          </span>
                        ) : (
                          <span className="text-lg font-bold font-mono-tabular text-[#15803D]">
                            অগ্রিম: {formatTaka(Math.abs(selectedParty.currentDue - paidNum))}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                {isCashDueAdd ? 'কারণ / বিবরণ (ঐচ্ছিক)' : 'নোট / অতিরিক্ত বিবরণ (ঐচ্ছিক)'}
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isCashDueAdd
                    ? 'যেমন: আগের খাতার বাকি / প্রোডাক্ট ছাড়া নগদ টাকা নেওয়া'
                    : !isBillType
                      ? 'যেমন: অগ্রিম পেমেন্ট, আগের বাকি পরিশোধ, বিকাশ/চেক নম্বর'
                      : 'যেমন: কুরিয়ার বা ডেলিভারি তথ্য, চেক নম্বর ইত্যাদি'
                }
                className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-sm text-[#111815] focus:outline-none focus:border-[#0D5C46]"
              />
            </div>
          </div>

          {/* Submit Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-5 py-2.5 text-sm font-semibold text-[#37413B] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl transition-colors cursor-pointer"
            >
              বাতিল করুন
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[46px] px-6 py-2.5 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving
                ? 'সংরক্ষণ হচ্ছে...'
                : editingTransaction
                  ? 'হিসাব আপডেট করুন'
                  : isCashDueAdd
                    ? 'বাকি / নগদ হিসাব সংরক্ষণ করুন'
                    : isBillType
                      ? 'ইনভয়েস ও হিসাব সংরক্ষণ করুন'
                      : 'পেমেন্ট সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
