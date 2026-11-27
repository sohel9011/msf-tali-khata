import { Timestamp } from 'firebase/firestore';

export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  NAME_MAX: 120,
  PHONE_MAX: 30,
  ADDRESS_MAX: 240,
  INVOICE_NO_MAX: 40,
  DATE_MAX: 20,
  MONTH_KEY_MAX: 10,
  TITLE_MAX: 160,
  ROLE_MAX: 60,
  PURPOSE_MAX: 200,
  PAYMENT_METHOD_MAX: 60,
  NOTE_MAX: 500,
  ITEMS_MAX: 50,
  ENTRIES_MAX: 250,
} as const;

export const ADMIN_EMAIL = 'sohel901190@gmail.com';

export const BASE_PAYMENT_METHODS = [
  'নগদ',
  'ক্যাশ',
  'বিকাশ',
  'নগদ ও ব্যাংক',
  'ব্যাংক ট্রান্সফার',
  'নগদ ও বিকাশ',
  'চেক',
] as const;

export const EXPENSE_PAYMENT_METHODS = [
  'নগদ',
  'ক্যাশ',
  'বিকাশ',
  'নগদ ও ব্যাংক',
  'ব্যাংক',
  'ব্যাংক ট্রান্সফার',
] as const;

export const LEDGER_PAYMENT_METHODS = [
  ...BASE_PAYMENT_METHODS,
  'পূর্বের বাকি',
] as const;

export type TransactionType =
  | 'supplier_purchase'
  | 'supplier_payment'
  | 'supplier_due_add'
  | 'customer_sale'
  | 'customer_payment'
  | 'customer_due_add';

export type PartyType = 'supplier' | 'customer';

export interface LineItem {
  name: string;
  details: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PartyRecord {
  id: string;
  name: string;
  phone: string;
  address: string;
  totalBilled: number;
  totalPaid: number;
  currentDue: number;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface TransactionRecord {
  id: string;
  type: TransactionType;
  date: string;
  partyId: string;
  partyName: string;
  partyPhone: string;
  partyAddress: string;
  invoiceNo: string;
  items: LineItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  note: string;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface LedgerEntrySnapshot {
  txId: string;
  date: string;
  type: TransactionType;
  invoiceNo: string;
  summary: string;
  items: LineItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  note: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface PublicLedgerRecord {
  id: string;
  partyType: PartyType;
  name: string;
  phone: string;
  address: string;
  totalBilled: number;
  totalPaid: number;
  currentDue: number;
  shareEnabled: boolean;
  entries: LedgerEntrySnapshot[];
  ownerUid: string;
  updatedAt?: Timestamp | null;
}

export interface PublicInvoiceRecord {
  id: string;
  invoiceNo: string;
  date: string;
  partyType: PartyType;
  partyId: string;
  partyName: string;
  partyPhone: string;
  partyAddress: string;
  items: LineItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  partyTotalDue: number;
  paymentMethod: string;
  note: string;
  shareEnabled: boolean;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

// --- Home Expenses ---
export interface HomeExpenseItem {
  name: string;
  qtyText: string;
  amount: number;
}

export interface HomeExpenseRecord {
  id: string;
  date: string;
  monthKey: string;
  title: string;
  items: HomeExpenseItem[];
  totalAmount: number;
  paidBy: string;
  paymentMethod: string;
  note: string;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

// --- Personal, Mama & Staff Accounts (Mainu Mama, Moderator Himel, Custom Recipients) ---
export type PersonTransactionType = 'payable_add' | 'payment_given';

export interface PersonAccountRecord {
  id: string;
  name: string;
  phone: string;
  role: string;
  note: string;
  totalPayable: number;
  totalGiven: number;
  currentBalance: number;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PersonTransactionRecord {
  id: string;
  personId: string;
  personName: string;
  type: PersonTransactionType;
  date: string;
  amount: number;
  purpose: string;
  paymentMethod: string;
  note: string;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PersonLedgerEntrySnapshot {
  ptxId: string;
  date: string;
  type: PersonTransactionType;
  purpose: string;
  paymentMethod: string;
  note: string;
  payableAmount: number;
  givenAmount: number;
  runningBalance: number;
}

export interface PublicPersonLedgerRecord {
  id: string;
  name: string;
  phone: string;
  role: string;
  totalPayable: number;
  totalGiven: number;
  currentBalance: number;
  shareEnabled: boolean;
  entries: PersonLedgerEntrySnapshot[];
  ownerUid: string;
  updatedAt?: Timestamp | null;
}
