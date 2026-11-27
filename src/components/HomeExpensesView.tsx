import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  EXPENSE_PAYMENT_METHODS,
  HomeExpenseItem,
  HomeExpenseRecord,
} from '../types/bookkeeping';
import {
  formatDateBn,
  formatMonthBn,
  formatTaka,
  getCurrentMonthKey,
  getTodayIsoDate,
  toBengaliDigits,
} from '../utils/formatters';
import {
  deleteHomeExpense,
  saveHomeExpense,
} from '../services/bookkeepingService';
import { ConfirmDialog } from './ConfirmDialog';

interface HomeExpensesViewProps {
  expenses: HomeExpenseRecord[];
  loading?: boolean;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const PAID_BY_OPTIONS = ['আমি', 'মাইনু মামা', 'যৌথ'];
const PAYMENT_METHODS: readonly string[] = EXPENSE_PAYMENT_METHODS;

function emptyExpenseItem(): HomeExpenseItem {
  return { name: '', qtyText: '', amount: 0 };
}

export const HomeExpensesView: React.FC<HomeExpensesViewProps> = ({
  expenses,
  loading = false,
  onToast,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<HomeExpenseRecord | null>(null);
  const [date, setDate] = useState(getTodayIsoDate());
  const [title, setTitle] = useState('');
  const [paidBy, setPaidBy] = useState('আমি');
  const [paymentMethod, setPaymentMethod] = useState('নগদ');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<HomeExpenseItem[]>([emptyExpenseItem()]);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<HomeExpenseRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const availableMonths = useMemo(() => {
    const set = new Set<string>([getCurrentMonthKey()]);
    for (const ex of expenses) {
      if (ex.monthKey) set.add(ex.monthKey);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((ex) => {
      if (selectedMonth !== 'all' && ex.monthKey !== selectedMonth) return false;
      if (!q) return true;
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.paidBy.toLowerCase().includes(q) ||
        ex.note.toLowerCase().includes(q) ||
        ex.items.some((it) => it.name.toLowerCase().includes(q))
      );
    });
  }, [expenses, selectedMonth, search]);

  const monthStats = useMemo(() => {
    const targetList =
      selectedMonth === 'all'
        ? expenses
        : expenses.filter((e) => e.monthKey === selectedMonth);
    const total = targetList.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
    const byMe = targetList
      .filter((e) => e.paidBy === 'আমি')
      .reduce((sum, e) => sum + (e.totalAmount || 0), 0);
    const byMama = targetList
      .filter((e) => e.paidBy === 'মাইনু মামা')
      .reduce((sum, e) => sum + (e.totalAmount || 0), 0);
    return { total, byMe, byMama, count: targetList.length };
  }, [expenses, selectedMonth]);

  const openAddModal = () => {
    setEditingExpense(null);
    setDate(getTodayIsoDate());
    setTitle('দৈনিক বাজার ও বাসার খরচ');
    setPaidBy('আমি');
    setPaymentMethod('নগদ');
    setNote('');
    setItems([emptyExpenseItem()]);
    setModalOpen(true);
  };

  const openEditModal = (ex: HomeExpenseRecord) => {
    setEditingExpense(ex);
    setDate(ex.date);
    setTitle(ex.title);
    setPaidBy(ex.paidBy || 'আমি');
    setPaymentMethod(ex.paymentMethod || 'নগদ');
    setNote(ex.note || '');
    setItems(
      ex.items.length > 0 ? ex.items.map((it) => ({ ...it })) : [emptyExpenseItem()],
    );
    setModalOpen(true);
  };

  const updateItem = (
    idx: number,
    field: keyof HomeExpenseItem,
    val: string | number,
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)),
    );
  };

  const formTotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [items],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await saveHomeExpense(
        { date, title, items, paidBy, paymentMethod, note },
        editingExpense || undefined,
      );
      onToast(
        editingExpense
          ? 'বাসার খরচ আপডেট করা হয়েছে।'
          : 'বাসার খরচ খাতায় সংরক্ষণ করা হয়েছে।',
      );
      setModalOpen(false);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'সংরক্ষণ করতে সমস্যা হয়েছে।',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteHomeExpense(deleteTarget.id);
      onToast('খরচের হিসাবটি মুছে ফেলা হয়েছে।');
      setDeleteTarget(null);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'মুছতে সমস্যা হয়েছে।',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111815]">
            বাসার খরচ খাতা (আমি ও মাইনু মামা)
          </h1>
          <p className="text-sm text-[#4B554E] mt-0.5">
            প্রতিদিনের বাজার, কি কি কেনা হলো ও মাসিক বাসার খরচের পূর্ণাঙ্গ হিসাব
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0D5C46] hover:bg-[#094534] text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          নতুন বাজার / খরচ যোগ করুন
        </button>
      </div>

      {/* 4 Monthly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">
            {selectedMonth === 'all'
              ? 'সর্বমোট বাসার খরচ'
              : `${formatMonthBn(selectedMonth)}-এর মোট খরচ`}
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-[#B91C1C] mt-2">
            {formatTaka(monthStats.total)}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">
            মোট এন্ট্রি: {toBengaliDigits(monthStats.count)} টি
          </p>
        </div>

        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">আমার খরচ</p>
          <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-2">
            {formatTaka(monthStats.byMe)}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">নিজ থেকে পরিশোধিত</p>
        </div>

        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">মাইনু মামার খরচ</p>
          <p className="text-2xl font-bold font-mono-tabular text-[#0D5C46] mt-2">
            {formatTaka(monthStats.byMama)}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">মামা থেকে পরিশোধিত</p>
        </div>

        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">জনপ্রতি গড় (২ জন)</p>
          <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-2">
            {formatTaka(Math.round(monthStats.total / 2))}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">আমি ও মাইনু মামা (অর্ধেক)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#4B554E] whitespace-nowrap">
            মাস বাছাই:
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="min-h-[42px] px-3.5 py-2 bg-white border border-[#E5E8E3] rounded-xl text-sm font-semibold text-[#111815] focus:outline-none focus:border-[#0D5C46]"
          >
            <option value="all">সব মাস</option>
            {availableMonths.map((mk) => (
              <option key={mk} value={mk}>
                {formatMonthBn(mk)}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-[#4B554E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="কেনা জিনিস বা বাজার খুঁজুন..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-white border border-[#E5E8E3] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
          />
        </div>
      </div>

      {/* Expenses List */}
      <div className="bg-white border border-[#E5E8E3] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            <div className="h-14 bg-[#F2F4F0] rounded-xl" />
            <div className="h-14 bg-[#F2F4F0] rounded-xl" />
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-[#4B554E]">
              এই মাসে এখনো কোনো বাসার খরচ তোলা হয়নি।
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D5C46] rounded-xl cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              প্রথম খরচ যোগ করুন
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E8E3]">
            {filteredExpenses.map((ex) => (
              <div
                key={ex.id}
                className="p-4 md:px-6 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-[#F8F9F7] transition-colors"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#4B554E]">
                    <span className="font-semibold text-[#111815]">
                      {formatDateBn(ex.date)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>খরচ করেছেন: {ex.paidBy}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ex.paymentMethod}</span>
                  </div>
                  <h3 className="text-base font-bold text-[#111815]">
                    {ex.title}
                  </h3>
                  {/* Bought items list */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#37413B]">
                    {ex.items.map((it, i) => (
                      <span key={i}>
                        • {it.name}
                        {it.qtyText ? ` (${it.qtyText})` : ''} —{' '}
                        <strong className="font-mono-tabular">
                          {formatTaka(it.amount)}
                        </strong>
                      </span>
                    ))}
                  </div>
                  {ex.note && (
                    <p className="text-xs text-[#4B554E]">নোট: {ex.note}</p>
                  )}
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                  <div className="md:text-right">
                    <p className="text-[11px] text-[#4B554E]">মোট খরচ</p>
                    <p className="text-lg font-bold font-mono-tabular text-[#B91C1C]">
                      {formatTaka(ex.totalAmount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(ex)}
                      aria-label="সম্পাদনা"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F2F4F0] hover:bg-[#E5E8E3] text-[#111815] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(ex)}
                      aria-label="মুছুন"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Home Expense Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 backdrop-blur-xs p-0 md:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl border border-[#E5E8E3] max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-[#E5E8E3]">
              <h2 className="text-lg font-bold text-[#111815]">
                {editingExpense ? 'বাসার খরচ সম্পাদনা' : 'নতুন বাসার খরচ যোগ করুন'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="বন্ধ করুন"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#4B554E] hover:bg-[#F2F4F0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-5 md:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    তারিখ *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    খরচের শিরোনাম *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.TITLE_MAX}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="যেমন: দৈনিক বাজার, বাসা ভাড়া, গ্যাস বিল"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    কে টাকা দিয়েছেন
                  </label>
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  >
                    {PAID_BY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    মাধ্যম
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Purchased */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-[#111815]">
                    কি কি কেনা হলো (বিস্তারিত তালিকা)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (items.length < BLUEPRINT_LIMITS.ITEMS_MAX) {
                        setItems((prev) => [...prev, emptyExpenseItem()]);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    আরও জিনিস যোগ করুন
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-[#E5E8E3] bg-[#F8F9F7] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                    >
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                          জিনিসের নাম *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={120}
                          value={item.name}
                          onChange={(e) => updateItem(idx, 'name', e.target.value)}
                          placeholder="যেমন: চাল, মুরগি, তেল, বিদ্যুৎ বিল"
                          className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D4DAD2] rounded-lg text-sm focus:outline-none focus:border-[#0D5C46]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                          পরিমাণ (ঐচ্ছিক)
                        </label>
                        <input
                          type="text"
                          maxLength={60}
                          value={item.qtyText}
                          onChange={(e) => updateItem(idx, 'qtyText', e.target.value)}
                          placeholder="যেমন: ২ কেজি"
                          className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D4DAD2] rounded-lg text-sm focus:outline-none focus:border-[#0D5C46]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                          দাম / টাকা (৳) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={item.amount}
                          onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                          className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D4DAD2] rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label="সরান"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
                <span className="text-sm font-semibold text-[#111815]">
                  সর্বমোট খরচ
                </span>
                <span className="text-xl font-bold font-mono-tabular text-[#B91C1C]">
                  {formatTaka(formTotal)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                  নোট (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="অতিরিক্ত কোনো বিবরণ..."
                  className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-sm font-semibold text-[#37413B] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="খরচের হিসাব মুছে ফেলবেন?"
        description={`"${deleteTarget?.title || ''}" (${formatTaka(deleteTarget?.totalAmount || 0)}) স্থায়ীভাবে মুছে যাবে।`}
        confirmLabel="হ্যাঁ, মুছে ফেলুন"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
