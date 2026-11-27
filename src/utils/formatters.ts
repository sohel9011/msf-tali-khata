import { BLUEPRINT_LIMITS, TransactionType } from '../types/bookkeeping';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d);
}

export function formatTaka(amount: number, showDecimals = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNegative = safe < 0;
  const abs = Math.abs(safe);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });
  return `${isNegative ? '-' : ''}৳ ${formatted}`;
}

export function formatDateBn(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  const monthsBn = [
    'জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে',
  ];
  const mIdx = Number(month) - 1;
  const monthLabel = monthsBn[mIdx] ?? month;
  return `${toBengaliDigits(Number(day))} ${monthLabel} ${toBengaliDigits(year)}`;
}

export function formatMonthBn(monthKey: string): string {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-');
  if (!year || !month) return monthKey;
  const fullMonthsBn = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
  ];
  const mIdx = Number(month) - 1;
  return `${fullMonthsBn[mIdx] ?? month} ${toBengaliDigits(year)}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(): string {
  return getTodayIsoDate().slice(0, 7);
}

export function clampString(value: string, maxLen: number): string {
  return (value ?? '').trim().slice(0, maxLen);
}

export function sanitizeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.slice(0, BLUEPRINT_LIMITS.ID_MAX);
}

export function getTransactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case 'supplier_purchase':
      return 'সাপ্লায়ার মাল ক্রয়';
    case 'supplier_payment':
      return 'সাপ্লায়ার পেমেন্ট';
    case 'supplier_due_add':
      return 'আগের বাকি / নগদ নেওয়া';
    case 'customer_sale':
      return 'কাস্টমার বিক্রি / ইনভয়েস';
    case 'customer_payment':
      return 'কাস্টমার টাকা আদায়';
    case 'customer_due_add':
      return 'আগের বাকি / নগদ পাওনা';
  }
}

export function buildPublicUrl(
  param: 'customer' | 'supplier' | 'invoice' | 'person',
  id: string,
): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(param, id);
  return url.toString();
}

export function formatWhatsAppPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('01') && digits.length === 11) return `88${digits}`;
  return digits;
}

export function buildWhatsAppShareUrl(phone: string, message: string): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}
