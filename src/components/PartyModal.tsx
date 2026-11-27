import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BLUEPRINT_LIMITS, PartyRecord, PartyType, TransactionRecord } from '../types/bookkeeping';
import { savePartyProfile } from '../services/bookkeepingService';
import { getTodayIsoDate } from '../utils/formatters';

interface PartyModalProps {
  open: boolean;
  partyType: PartyType;
  editingParty?: PartyRecord | null;
  partyTransactions: TransactionRecord[];
  onClose: () => void;
  onSaved: (message: string, partyId: string) => void;
  onError: (message: string) => void;
}

export const PartyModal: React.FC<PartyModalProps> = ({
  open,
  partyType,
  editingParty,
  partyTransactions,
  onClose,
  onSaved,
  onError,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingDue, setOpeningDue] = useState('');
  const [openingDate, setOpeningDate] = useState(getTodayIsoDate());
  const [openingNote, setOpeningNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingParty) {
      setName(editingParty.name);
      setPhone(editingParty.phone);
      setAddress(editingParty.address);
      setOpeningDue('');
      setOpeningDate(getTodayIsoDate());
      setOpeningNote('');
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setOpeningDue('');
      setOpeningDate(getTodayIsoDate());
      setOpeningNote('');
    }
  }, [open, editingParty]);

  if (!open) return null;

  const isSupplier = partyType === 'supplier';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onError(isSupplier ? 'সাপ্লায়ারের নাম দিন।' : 'কাস্টমারের নাম দিন।');
      return;
    }
    setSaving(true);
    try {
      const id = await savePartyProfile(
        {
          id: editingParty?.id,
          partyType,
          name,
          phone,
          address,
          openingDue: !editingParty ? Number(openingDue) || 0 : 0,
          openingDate,
          openingNote,
        },
        editingParty || undefined,
        partyTransactions,
      );
      onSaved(
        editingParty
          ? 'তথ্য সফলভাবে হালনাগাদ হয়েছে।'
          : isSupplier
            ? 'নতুন সাপ্লায়ার খাতা তৈরি হয়েছে।'
            : 'নতুন কাস্টমার খাতা তৈরি হয়েছে।',
        id,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E5E8E3] rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-[#111815]">
            {editingParty
              ? isSupplier
                ? 'সাপ্লায়ারের তথ্য সম্পাদনা'
                : 'কাস্টমারের তথ্য সম্পাদনা'
              : isSupplier
                ? 'নতুন সাপ্লায়ার যোগ করুন'
                : 'নতুন কাস্টমার যোগ করুন'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#4B554E] hover:bg-[#F2F4F0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
              {isSupplier ? 'সাপ্লায়ার / প্রতিষ্ঠানের নাম *' : 'কাস্টমার / দোকানের নাম *'}
            </label>
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isSupplier ? 'যেমন: ইসলামপুর ক্লথ হাউস' : 'যেমন: মা ফ্যাশন'}
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#37413B] mb-1.5">
              ঠিকানা / মার্কেট
            </label>
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.ADDRESS_MAX}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="মার্কেটের নাম, শহর"
              className="w-full min-h-[44px] px-3.5 py-2 border border-[#D4DAD2] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
            />
          </div>

          {!editingParty && (
            <div className="p-3.5 rounded-xl bg-[#F8F9F7] border border-[#E5E8E3] space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#111815] mb-1">
                  {isSupplier
                    ? 'শুরুতে আগের বাকি / দেনা (৳) (ঐচ্ছিক)'
                    : 'শুরুতে আগের বাকি / পাওনা (৳) (ঐচ্ছিক)'}
                </label>
                <p className="text-[11px] text-[#4B554E] mb-2">
                  আগের খাতার বকেয়া থাকলে এখান থেকে সরাসরি শুরুতেই যোগ করে দিন।
                </p>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={openingDue}
                  onChange={(e) => setOpeningDue(e.target.value)}
                  placeholder="০"
                  className="w-full min-h-[42px] px-3.5 py-2 bg-white border border-[#D4DAD2] rounded-xl text-base font-bold font-mono-tabular focus:outline-none focus:border-[#0D5C46]"
                />
              </div>

              {Number(openingDue) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                      তারিখ
                    </label>
                    <input
                      type="date"
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D4DAD2] rounded-lg text-xs focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B554E] mb-1">
                      নোট (ঐচ্ছিক)
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                      value={openingNote}
                      onChange={(e) => setOpeningNote(e.target.value)}
                      placeholder="যেমন: আগের খাতার বাকি"
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D4DAD2] rounded-lg text-xs focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-semibold text-[#37413B] bg-[#F2F4F0] hover:bg-[#E5E8E3] rounded-xl cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer disabled:opacity-60"
            >
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
