import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Edit3,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  LEDGER_PAYMENT_METHODS,
  PersonAccountRecord,
  PersonLedgerEntrySnapshot,
  PersonTransactionRecord,
  PersonTransactionType,
} from '../types/bookkeeping';
import {
  buildPublicUrl,
  buildWhatsAppShareUrl,
  formatDateBn,
  formatTaka,
  getTodayIsoDate,
  toBengaliDigits,
} from '../utils/formatters';
import {
  computePersonLedger,
  deletePersonAccountAndTransactions,
  deletePersonTransactionAndSync,
  savePersonAccount,
  savePersonTransactionAndSync,
} from '../services/bookkeepingService';
import { ConfirmDialog } from './ConfirmDialog';

interface PersonsLedgerViewProps {
  persons: PersonAccountRecord[];
  personTransactions: PersonTransactionRecord[];
  loading?: boolean;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const ROLE_SUGGESTIONS = [
  'মামা (বাসা)',
  'মডারেটর',
  'স্টাফ / কর্মচারী',
  'ব্যক্তিগত লেনদেন',
];

const PAYMENT_METHODS: readonly string[] = LEDGER_PAYMENT_METHODS;

export const PersonsLedgerView: React.FC<PersonsLedgerViewProps> = ({
  persons,
  personTransactions,
  loading = false,
  onToast,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Person Modal (Add / Edit person with Name, Phone, Role)
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonAccountRecord | null>(null);
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pRole, setPRole] = useState('ব্যক্তিগত লেনদেন');
  const [pNote, setPNote] = useState('');
  const [pOpeningAmount, setPOpeningAmount] = useState('');
  const [pOpeningType, setPOpeningType] = useState<PersonTransactionType>('payable_add');
  const [pOpeningDate, setPOpeningDate] = useState(getTodayIsoDate());
  const [pOpeningNote, setPOpeningNote] = useState('');
  const [savingPerson, setSavingPerson] = useState(false);

  // Person Transaction Modal (Payable Add / Payment Given)
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<PersonTransactionRecord | null>(null);
  const [txPersonId, setTxPersonId] = useState('');
  const [txType, setTxType] = useState<PersonTransactionType>('payment_given');
  const [txDate, setTxDate] = useState(getTodayIsoDate());
  const [txAmount, setTxAmount] = useState('');
  const [txPurpose, setTxPurpose] = useState('');
  const [txMethod, setTxMethod] = useState('নগদ');
  const [txNote, setTxNote] = useState('');
  const [savingTx, setSavingTx] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'tx'; tx: PersonTransactionRecord }
    | { kind: 'person'; person: PersonAccountRecord }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === selectedPersonId) || null,
    [persons, selectedPersonId],
  );

  const selectedPersonTxs = useMemo(
    () =>
      selectedPerson
        ? personTransactions.filter((t) => t.personId === selectedPerson.id)
        : [],
    [personTransactions, selectedPerson],
  );

  const selectedComputed = useMemo(
    () => computePersonLedger(selectedPersonTxs),
    [selectedPersonTxs],
  );

  const txMap = useMemo(() => {
    const m: Record<string, PersonTransactionRecord> = {};
    for (const t of personTransactions) m[t.id] = t;
    return m;
  }, [personTransactions]);

  const filteredPersons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q),
    );
  }, [persons, search]);

  const summary = useMemo(() => {
    const totalPayable = persons.reduce((s, p) => s + (p.totalPayable || 0), 0);
    const totalGiven = persons.reduce((s, p) => s + (p.totalGiven || 0), 0);
    const totalBalance = persons.reduce((s, p) => s + (p.currentBalance || 0), 0);
    return { totalPayable, totalGiven, totalBalance };
  }, [persons]);

  const openAddPersonModal = () => {
    setEditingPerson(null);
    setPName('');
    setPPhone('');
    setPRole('ব্যক্তিগত লেনদেন');
    setPNote('');
    setPOpeningAmount('');
    setPOpeningType('payable_add');
    setPOpeningDate(getTodayIsoDate());
    setPOpeningNote('');
    setPersonModalOpen(true);
  };

  const openEditPersonModal = (person: PersonAccountRecord) => {
    setEditingPerson(person);
    setPName(person.name);
    setPPhone(person.phone);
    setPRole(person.role);
    setPNote(person.note);
    setPOpeningAmount('');
    setPOpeningType('payable_add');
    setPOpeningDate(getTodayIsoDate());
    setPOpeningNote('');
    setPersonModalOpen(true);
  };

  const openAddTxModal = (
    personId: string,
    defaultType: PersonTransactionType = 'payment_given',
  ) => {
    setEditingTx(null);
    setTxPersonId(personId || (persons[0]?.id ?? ''));
    setTxType(defaultType);
    setTxDate(getTodayIsoDate());
    setTxAmount('');
    setTxPurpose('');
    setTxMethod('নগদ');
    setTxNote('');
    setTxModalOpen(true);
  };

  const openEditTxModal = (tx: PersonTransactionRecord) => {
    setEditingTx(tx);
    setTxPersonId(tx.personId);
    setTxType(tx.type);
    setTxDate(tx.date);
    setTxAmount(String(tx.amount));
    setTxPurpose(tx.purpose);
    setTxMethod(tx.paymentMethod || 'নগদ');
    setTxNote(tx.note || '');
    setTxModalOpen(true);
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPerson) return;
    setSavingPerson(true);
    try {
      const existingTxs = editingPerson
        ? personTransactions.filter((t) => t.personId === editingPerson.id)
        : [];
      const savedId = await savePersonAccount(
        {
          id: editingPerson?.id,
          name: pName,
          phone: pPhone,
          role: pRole,
          note: pNote,
          openingAmount: !editingPerson ? Number(pOpeningAmount) || 0 : 0,
          openingType: pOpeningType,
          openingDate: pOpeningDate,
          openingNote: pOpeningNote,
        },
        editingPerson || undefined,
        existingTxs,
      );
      onToast(
        editingPerson
          ? 'তথ্য হালনাগাদ করা হয়েছে।'
          : 'নতুন ব্যক্তির হিসাব খাতা তৈরি হয়েছে।',
      );
      setPersonModalOpen(false);
      if (!editingPerson) {
        setSelectedPersonId(savedId);
      }
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'সংরক্ষণ করতে সমস্যা হয়েছে।',
        'error',
      );
    } finally {
      setSavingPerson(false);
    }
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTx) return;
    const person = persons.find((p) => p.id === txPersonId);
    if (!person) {
      onToast('অনুগ্রহ করে একজন ব্যক্তি নির্বাচন করুন।', 'error');
      return;
    }
    setSavingTx(true);
    try {
      const txsForPerson = personTransactions.filter(
        (t) => t.personId === person.id,
      );
      await savePersonTransactionAndSync(
        {
          ptxId: editingTx?.id,
          personId: person.id,
          type: txType,
          date: txDate,
          amount: Number(txAmount) || 0,
          purpose: txPurpose,
          paymentMethod: txMethod,
          note: txNote,
        },
        person,
        editingTx || undefined,
        txsForPerson,
      );
      onToast(
        editingTx ? 'লেনদেন আপডেট হয়েছে।' : 'লেনদেন সফলভাবে সংরক্ষণ হয়েছে।',
      );
      setTxModalOpen(false);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'সংরক্ষণ করতে সমস্যা হয়েছে।',
        'error',
      );
    } finally {
      setSavingTx(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === 'tx') {
        const person = persons.find((p) => p.id === confirmDelete.tx.personId);
        const txsForPerson = personTransactions.filter(
          (t) => t.personId === confirmDelete.tx.personId,
        );
        await deletePersonTransactionAndSync(
          confirmDelete.tx,
          person,
          txsForPerson,
        );
        onToast('লেনদেন মুছে ফেলা হয়েছে।');
      } else {
        const txsForPerson = personTransactions.filter(
          (t) => t.personId === confirmDelete.person.id,
        );
        await deletePersonAccountAndTransactions(
          confirmDelete.person,
          txsForPerson,
        );
        setSelectedPersonId(null);
        onToast('ব্যক্তির খাতা মুছে ফেলা হয়েছে।');
      }
      setConfirmDelete(null);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'মুছতে সমস্যা হয়েছে।',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyPersonLink = async (personId: string) => {
    try {
      await navigator.clipboard.writeText(buildPublicUrl('person', personId));
      onToast('হিসাবের লিংক কপি করা হয়েছে!');
    } catch {
      onToast('লিংক কপি করা যায়নি।', 'error');
    }
  };

  const handleWhatsAppShare = (
    person: PersonAccountRecord,
    totalPayable: number,
    totalGiven: number,
    balance: number,
  ) => {
    const url = buildPublicUrl('person', person.id);
    const msg = [
      `আসসালামু আলাইকুম ${person.name},`,
      `এমএস ফ্যাশন (MS Fashion)-এর সাথে আপনার হিসাব:`,
      `মোট পাবে / পাওনা: ${formatTaka(totalPayable)}`,
      `মোট দেওয়া হয়েছে: ${formatTaka(totalGiven)}`,
      `বর্তমান বাকি / প্রাপ্য: ${formatTaka(balance)}`,
      ``,
      `বিস্তারিত তারিখসহ দেখতে ক্লিক করুন:`,
      url,
    ].join('\n');
    window.location.assign(buildWhatsAppShareUrl(person.phone, msg));
  };

  // --- Detail Profile View for Selected Person (Mainu Mama, Himel, or Custom) ---
  if (selectedPerson) {
    return (
      <div className="space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedPersonId(null)}
            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            সবার তালিকায় ফিরুন
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyPersonLink(selectedPerson.id)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
            >
              <Copy className="w-4 h-4" />
              লিংক কপি করুন
            </button>
            <button
              type="button"
              onClick={() =>
                handleWhatsAppShare(
                  selectedPerson,
                  selectedComputed.totalPayable,
                  selectedComputed.totalGiven,
                  selectedComputed.currentBalance,
                )
              }
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#15803D] hover:bg-[#166534] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp-এ পাঠান
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-[#E5E8E3]">
            <div>
              <p className="text-xs font-semibold text-[#0D5C46] mb-1">
                {selectedPerson.role}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-[#111815]">
                {selectedPerson.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#4B554E] mt-1">
                {selectedPerson.phone && (
                  <span className="font-mono-tabular">{selectedPerson.phone}</span>
                )}
                {selectedPerson.phone && selectedPerson.note && (
                  <span aria-hidden="true">·</span>
                )}
                {selectedPerson.note && <span>{selectedPerson.note}</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  openAddTxModal(selectedPerson.id, 'payment_given')
                }
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
              >
                <Wallet className="w-4 h-4" />
                টাকা দিলাম
              </button>
              <button
                type="button"
                onClick={() =>
                  openAddTxModal(selectedPerson.id, 'payable_add')
                }
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                টাকা পাবে / আগের বাকি
              </button>
              <button
                type="button"
                onClick={() => openEditPersonModal(selectedPerson)}
                aria-label="তথ্য সম্পাদনা"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#F2F4F0] hover:bg-[#E5E8E3] text-[#111815] cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmDelete({ kind: 'person', person: selectedPerson })
                }
                aria-label="খাতা মুছুন"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 3 Summary Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
              <p className="text-xs font-medium text-[#4B554E]">
                মোট প্রাপ্য / পাবে (+)
              </p>
              <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-1">
                {formatTaka(selectedComputed.totalPayable)}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3]">
              <p className="text-xs font-medium text-[#4B554E]">
                মোট টাকা দেওয়া হয়েছে (-)
              </p>
              <p className="text-2xl font-bold font-mono-tabular text-[#15803D] mt-1">
                {formatTaka(selectedComputed.totalGiven)}
              </p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                selectedComputed.currentBalance > 0
                  ? 'bg-[#FEF2F2] border-[#FECACA]'
                  : 'bg-[#F0FDF4] border-[#BBF7D0]'
              }`}
            >
              <p className="text-xs font-semibold text-[#37413B]">
                {selectedComputed.currentBalance >= 0
                  ? 'আর পাবে / বাকি প্রাপ্য'
                  : 'অতিরিক্ত / অগ্রিম দেওয়া আছে'}
              </p>
              <p
                className={`text-2xl font-bold font-mono-tabular mt-1 ${
                  selectedComputed.currentBalance > 0
                    ? 'text-[#B91C1C]'
                    : 'text-[#15803D]'
                }`}
              >
                {formatTaka(Math.abs(selectedComputed.currentBalance))}
              </p>
            </div>
          </div>

          {/* Chronological Ledger */}
          {selectedComputed.entries.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-[#D4DAD2] rounded-xl">
              <p className="text-sm text-[#4B554E]">
                এখনো কোনো লেনদেন যোগ করা হয়নি।
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() =>
                    openAddTxModal(selectedPerson.id, 'payment_given')
                  }
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] rounded-xl cursor-pointer"
                >
                  + টাকা দিলাম যোগ করুন
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openAddTxModal(selectedPerson.id, 'payable_add')
                  }
                  className="px-4 py-2 text-sm font-semibold text-[#0D5C46] bg-[#0D5C46]/10 rounded-xl cursor-pointer"
                >
                  + টাকা পাবে যোগ করুন
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E8E3] text-xs font-semibold text-[#4B554E]">
                    <th className="py-3 pr-3">তারিখ</th>
                    <th className="py-3 pr-3">কি জন্য / বিস্তারিত</th>
                    <th className="py-3 px-3 text-right">পাবে (+)</th>
                    <th className="py-3 px-3 text-right">দিলাম (-)</th>
                    <th className="py-3 px-3 text-right">চলমান হিসাব</th>
                    <th className="py-3 pl-3 text-right">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] text-sm">
                  {selectedComputed.entries.map((entry: PersonLedgerEntrySnapshot) => (
                    <tr key={entry.ptxId} className="hover:bg-[#F8F9F7]">
                      <td className="py-3.5 pr-3 whitespace-nowrap align-top">
                        <div className="font-medium text-[#111815]">
                          {formatDateBn(entry.date)}
                        </div>
                        <div className="text-xs text-[#4B554E]">
                          {entry.paymentMethod}
                        </div>
                      </td>
                      <td className="py-3.5 pr-3 align-top">
                        <div className="font-semibold text-[#111815]">
                          {entry.purpose}
                        </div>
                        {entry.note && (
                          <div className="text-xs text-[#4B554E] mt-0.5">
                            {entry.note}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-[#111815] whitespace-nowrap align-top">
                        {entry.payableAmount > 0
                          ? `+ ${formatTaka(entry.payableAmount)}`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-[#15803D] whitespace-nowrap align-top">
                        {entry.givenAmount > 0
                          ? `- ${formatTaka(entry.givenAmount)}`
                          : '—'}
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
                      <td className="py-3.5 pl-3 text-right whitespace-nowrap align-top">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const found = txMap[entry.ptxId];
                              if (found) openEditTxModal(found);
                            }}
                            aria-label="সম্পাদনা"
                            className="p-2 text-[#4B554E] hover:text-[#111815] rounded-lg hover:bg-[#E5E8E3]/60 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const found = txMap[entry.ptxId];
                              if (found)
                                setConfirmDelete({ kind: 'tx', tx: found });
                            }}
                            aria-label="মুছুন"
                            className="p-2 text-[#B91C1C] rounded-lg hover:bg-[#FEF2F2] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modals inside detail view */}
        {renderModals()}
      </div>
    );
  }

  function renderModals() {
    return (
      <>
        {/* Add/Edit Person Modal */}
        {personModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white border border-[#E5E8E3] rounded-2xl max-w-md w-full p-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#111815]">
                  {editingPerson
                    ? 'ব্যক্তির তথ্য সম্পাদনা'
                    : 'নতুন ব্যক্তি / স্টাফ যোগ করুন'}
                </h3>
                <button
                  type="button"
                  onClick={() => setPersonModalOpen(false)}
                  aria-label="বন্ধ করুন"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#4B554E] hover:bg-[#F2F4F0] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSavePerson} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    নাম *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.NAME_MAX}
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="যেমন: মাইনু মামা, হিমেল, রফিক"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    মোবাইল নম্বর
                  </label>
                  <input
                    type="tel"
                    maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    পরিচয় / পদবি
                  </label>
                  <select
                    value={
                      ROLE_SUGGESTIONS.includes(pRole)
                        ? pRole
                        : 'ব্যক্তিগত লেনদেন'
                    }
                    onChange={(e) => setPRole(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  >
                    {ROLE_SUGGESTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    নোট / বিবরণ (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.ADDRESS_MAX}
                    value={pNote}
                    onChange={(e) => setPNote(e.target.value)}
                    placeholder="যেমন: মাসিক বেতন / বাসার খরচ"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>

                {!editingPerson && (
                  <div className="p-3.5 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3] space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#111815] mb-1">
                        শুরুতে আগের হিসাব / বাকি (৳) (ঐচ্ছিক)
                      </label>
                      <p className="text-[11px] text-[#4B554E] mb-2">
                        আগের পাওনা বা অগ্রিম দেওয়া থাকলে শুরুতেই সরাসরি যোগ করুন।
                      </p>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={pOpeningAmount}
                        onChange={(e) => setPOpeningAmount(e.target.value)}
                        placeholder="০"
                        className="w-full min-h-[42px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-base font-bold font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                      />
                    </div>

                    {Number(pOpeningAmount) > 0 && (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#E5E8E3]/70 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setPOpeningType('payable_add')}
                            className={`min-h-[36px] px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              pOpeningType === 'payable_add'
                                ? 'bg-white text-[#111815] shadow-xs'
                                : 'text-[#4B554E]'
                            }`}
                          >
                            সে পাবে / বাকি (+)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPOpeningType('payment_given')}
                            className={`min-h-[36px] px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              pOpeningType === 'payment_given'
                                ? 'bg-white text-[#0D5C46] shadow-xs'
                                : 'text-[#4B554E]'
                            }`}
                          >
                            আগে দিয়েছি (-)
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                              তারিখ
                            </label>
                            <input
                              type="date"
                              value={pOpeningDate}
                              onChange={(e) => setPOpeningDate(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1 bg-white border border-[#D4DAD2] rounded-lg text-xs focus:outline-none focus:border-[#0D5C46]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                              বিবরণ (ঐচ্ছিক)
                            </label>
                            <input
                              type="text"
                              maxLength={BLUEPRINT_LIMITS.PURPOSE_MAX}
                              value={pOpeningNote}
                              onChange={(e) => setPOpeningNote(e.target.value)}
                              placeholder="যেমন: আগের মাসের বাকি"
                              className="w-full min-h-[38px] px-3 py-1 bg-white border border-[#D4DAD2] rounded-lg text-xs focus:outline-none focus:border-[#0D5C46]"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setPersonModalOpen(false)}
                    className="min-h-[44px] px-4 py-2 text-sm font-semibold text-[#37413B] bg-[#F2F4F0] rounded-xl cursor-pointer"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    disabled={savingPerson}
                    className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    {savingPerson ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add/Edit Person Transaction Modal */}
        {txModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 backdrop-blur-xs p-0 md:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl border border-[#E5E8E3] p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#111815]">
                  {editingTx
                    ? 'হিসাব সম্পাদনা করুন'
                    : 'টাকা দেওয়া বা প্রাপ্য যোগ করুন'}
                </h3>
                <button
                  type="button"
                  onClick={() => setTxModalOpen(false)}
                  aria-label="বন্ধ করুন"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#4B554E] hover:bg-[#F2F4F0] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveTx} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    ব্যক্তি নির্বাচন করুন *
                  </label>
                  <select
                    value={txPersonId}
                    disabled={Boolean(editingTx)}
                    onChange={(e) => setTxPersonId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46] disabled:bg-[#F2F4F0]"
                  >
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                    হিসাবের ধরন
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-[#F2F4F0] rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTxType('payment_given')}
                      className={`min-h-[42px] px-3 py-2 text-xs md:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                        txType === 'payment_given'
                          ? 'bg-white text-[#0D5C46] shadow-xs'
                          : 'text-[#4B554E]'
                      }`}
                    >
                      টাকা দিলাম (-)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxType('payable_add')}
                      className={`min-h-[42px] px-3 py-2 text-xs md:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                        txType === 'payable_add'
                          ? 'bg-white text-[#111815] shadow-xs'
                          : 'text-[#4B554E]'
                      }`}
                    >
                      টাকা পাবে / বিল (+)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      তারিখ *
                    </label>
                    <input
                      type="date"
                      required
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      টাকার পরিমাণ (৳) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      placeholder="0"
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-base font-bold font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs font-semibold text-[#37413B]">
                      কি জন্য / বিস্তারিত কারণ *
                    </label>
                    {!editingTx && (
                      <button
                        type="button"
                        onClick={() => {
                          setTxPurpose(
                            txType === 'payment_given'
                              ? 'পূর্বের হিসাব (আগে দেওয়া টাকা)'
                              : 'পূর্বের হিসাবের শুরু (আগের বাকি)',
                          );
                          setTxMethod('পূর্বের বাকি');
                        }}
                        className="text-[11px] font-semibold text-[#0D5C46] hover:underline cursor-pointer"
                      >
                        + আগের হিসাব বসান
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.PURPOSE_MAX}
                    value={txPurpose}
                    onChange={(e) => setTxPurpose(e.target.value)}
                    placeholder={
                      txType === 'payment_given'
                        ? 'যেমন: বাসা বাজারের জন্য, বেতন বাবদ, হাতখরচ'
                        : 'যেমন: আগের বাকি, নভেম্বর মাসের বেতন, অর্ডার কমিশন'
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      মাধ্যম
                    </label>
                    <select
                      value={txMethod}
                      onChange={(e) => setTxMethod(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
                      অতিরিক্ত নোট (ঐচ্ছিক)
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                      value={txNote}
                      onChange={(e) => setTxNote(e.target.value)}
                      placeholder="অতিরিক্ত তথ্য..."
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setTxModalOpen(false)}
                    className="min-h-[44px] px-4 py-2 text-sm font-semibold text-[#37413B] bg-[#F2F4F0] rounded-xl cursor-pointer"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    disabled={savingTx}
                    className="min-h-[44px] px-6 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    {savingTx ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(confirmDelete)}
          title={
            confirmDelete?.kind === 'person'
              ? 'ব্যক্তির হিসাব খাতা মুছে ফেলবেন?'
              : 'লেনদেনটি মুছে ফেলবেন?'
          }
          description={
            confirmDelete?.kind === 'person'
              ? `"${confirmDelete.person.name}"-এর প্রোফাইল ও এর সাথে যুক্ত সব লেনদেন স্থায়ীভাবে মুছে যাবে।`
              : 'এই লেনদেনটি মুছে ফেললে সংশ্লিষ্ট ব্যক্তির বর্তমান হিসাব স্বয়ংক্রিয়ভাবে আপডেট হবে।'
          }
          confirmLabel="হ্যাঁ, মুছে ফেলুন"
          loading={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      </>
    );
  }

  // --- Main Directory View (Mainu Mama, Himel & Custom Persons) ---
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111815]">
            মাইনু মামা, মডারেটর হিমেল ও ব্যক্তিগত হিসাব
          </h1>
          <p className="text-sm text-[#4B554E] mt-0.5">
            কাকে কত টাকা দিলেন, কি জন্য দিলেন এবং কার কত টাকা পাওনা আছে তার খাতা
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openAddPersonModal}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            নতুন ব্যক্তি যোগ করুন
          </button>
          {persons.length > 0 && (
            <button
              type="button"
              onClick={() => openAddTxModal(persons[0].id, 'payment_given')}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              টাকা দিন / হিসাব যোগ
            </button>
          )}
        </div>
      </div>

      {/* 3 Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">মোট প্রাপ্য / পাবে</p>
          <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-2">
            {formatTaka(summary.totalPayable)}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">
            মোট যুক্ত বেতন, বিল বা প্রাপ্য
          </p>
        </div>

        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">
            মোট দেওয়া হয়েছে
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-[#15803D] mt-2">
            {formatTaka(summary.totalGiven)}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">
            সর্বমোট পরিশোধিত টাকা
          </p>
        </div>

        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#4B554E]">
            মোট বাকি প্রাপ্য
          </p>
          <p
            className={`text-2xl font-bold font-mono-tabular mt-2 ${
              summary.totalBalance > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
            }`}
          >
            {formatTaka(summary.totalBalance)}
          </p>
          <p className="text-xs text-[#4B554E] mt-1">
            মোট তালিকাভুক্ত ব্যক্তি: {toBengaliDigits(persons.length)} জন
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#4B554E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="নাম, মোবাইল বা পদবি দিয়ে খুঁজুন..."
          className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-white border border-[#E5E8E3] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
        />
      </div>

      {/* Directory List */}
      <div className="bg-white border border-[#E5E8E3] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            <div className="h-14 bg-[#F2F4F0] rounded-xl" />
            <div className="h-14 bg-[#F2F4F0] rounded-xl" />
          </div>
        ) : filteredPersons.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[#4B554E]">কোনো ব্যক্তি পাওয়া যায়নি।</p>
            <button
              type="button"
              onClick={openAddPersonModal}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] rounded-xl cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              নতুন ব্যক্তি যোগ করুন
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E8E3]">
            {filteredPersons.map((person) => (
              <div
                key={person.id}
                className="p-4 md:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F9F7] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(person.id)}
                  className="text-left flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-[#111815] truncate">
                      {person.name}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#4B554E] shrink-0" />
                  </div>
                  <div className="text-xs text-[#4B554E] mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{person.role}</span>
                    {person.phone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{person.phone}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      পাবে:{' '}
                      <span className="font-mono-tabular">
                        {formatTaka(person.totalPayable)}
                      </span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      দিয়েছি:{' '}
                      <span className="font-mono-tabular text-[#15803D]">
                        {formatTaka(person.totalGiven)}
                      </span>
                    </span>
                  </div>
                </button>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="sm:text-right">
                    <p className="text-[11px] text-[#4B554E]">
                      {person.currentBalance >= 0 ? 'আর পাবে' : 'অগ্রিম দেওয়া'}
                    </p>
                    <p
                      className={`text-base font-bold font-mono-tabular ${
                        person.currentBalance > 0
                          ? 'text-[#B91C1C]'
                          : 'text-[#15803D]'
                      }`}
                    >
                      {formatTaka(Math.abs(person.currentBalance))}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openAddTxModal(person.id, 'payment_given')}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + টাকা দিন
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPersonId(person.id)}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      খাতা
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Personal Transactions Quick Feed */}
      {personTransactions.length > 0 && (
        <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5 md:p-6 space-y-4">
          <h2 className="text-base font-bold text-[#111815]">
            সাম্প্রতিক লেনদেন (মামা, হিমেল ও ব্যক্তিগত)
          </h2>
          <div className="divide-y divide-[#E5E8E3]">
            {personTransactions.slice(0, 15).map((tx) => (
              <div
                key={tx.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#4B554E]">
                    <span>{formatDateBn(tx.date)}</span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPersonId(tx.personId)}
                      className="font-bold text-[#111815] hover:text-[#0D5C46] hover:underline cursor-pointer"
                    >
                      {tx.personName}
                    </button>
                    <span aria-hidden="true">·</span>
                    <span>
                      {tx.type === 'payment_given'
                        ? 'টাকা দিয়েছি'
                        : 'প্রাপ্য / পাবে যোগ'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#111815] mt-0.5">
                    {tx.purpose}
                    {tx.note ? ` (${tx.note})` : ''}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span
                    className={`text-sm font-bold font-mono-tabular ${
                      tx.type === 'payment_given'
                        ? 'text-[#15803D]'
                        : 'text-[#B91C1C]'
                    }`}
                  >
                    {tx.type === 'payment_given' ? '-' : '+'}{' '}
                    {formatTaka(tx.amount)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditTxModal(tx)}
                      aria-label="সম্পাদনা"
                      className="p-1.5 text-[#4B554E] hover:text-[#111815] rounded-lg hover:bg-[#F2F4F0] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ kind: 'tx', tx })}
                      aria-label="মুছুন"
                      className="p-1.5 text-[#B91C1C] rounded-lg hover:bg-[#FEF2F2] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {renderModals()}
    </div>
  );
};
