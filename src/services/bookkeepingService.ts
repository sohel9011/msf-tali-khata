import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  HomeExpenseItem,
  HomeExpenseRecord,
  LedgerEntrySnapshot,
  LineItem,
  PartyRecord,
  PartyType,
  PersonAccountRecord,
  PersonLedgerEntrySnapshot,
  PersonTransactionRecord,
  PersonTransactionType,
  TransactionRecord,
  TransactionType,
} from '../types/bookkeeping';
import { clampString, getTodayIsoDate } from '../utils/formatters';

function getOwnerUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('অ্যাডমিন লগইন করা নেই।');
  }
  return uid;
}

export function generateDocId(collectionName: string): string {
  return doc(collection(db, collectionName)).id;
}

export function generateInvoiceNo(existingTransactions: TransactionRecord[], type: TransactionType): string {
  const prefix =
    type === 'customer_sale'
      ? 'MSF'
      : type === 'supplier_purchase'
        ? 'PUR'
        : type === 'supplier_due_add' || type === 'customer_due_add'
          ? 'DUE'
          : 'PAY';
  let maxNum = 1000;
  for (const tx of existingTransactions) {
    const match = tx.invoiceNo.match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= maxNum) {
        maxNum = n;
      }
    }
  }
  return `${prefix}-${maxNum + 1}`;
}

export function sanitizeLineItems(items: LineItem[]): LineItem[] {
  return items
    .slice(0, BLUEPRINT_LIMITS.ITEMS_MAX)
    .filter((item) => item.name.trim().length > 0)
    .map((item) => {
      const qty = Math.max(0, Number(item.qty) || 0);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const lineTotal = Math.round(qty * unitPrice * 100) / 100;
      return {
        name: clampString(item.name, 120),
        details: clampString(item.details, 160),
        qty,
        unitPrice,
        lineTotal,
      };
    });
}

function buildEntrySummary(tx: TransactionRecord): string {
  if (tx.type === 'supplier_payment') {
    return `পেমেন্ট পরিশোধ (${tx.paymentMethod || 'নগদ'})${tx.note ? ` · ${tx.note}` : ''}`;
  }
  if (tx.type === 'supplier_due_add') {
    return `${tx.note || 'আগের বাকি / প্রোডাক্ট ছাড়া টাকা নেওয়া'} (${tx.paymentMethod || 'নগদ'})`;
  }
  if (tx.type === 'customer_due_add') {
    return `${tx.note || 'আগের বাকি / সরাসরি পাওনা যোগ'} (${tx.paymentMethod || 'নগদ'})`;
  }
  if (tx.type === 'customer_payment') {
    return `টাকা আদায় (${tx.paymentMethod || 'নগদ'})${tx.note ? ` · ${tx.note}` : ''}`;
  }
  if (tx.items.length === 0) {
    return tx.note || (tx.type === 'customer_sale' ? 'বিক্রি ইনভয়েস' : 'মাল ক্রয়');
  }
  const preview = tx.items
    .map((item) => `${item.name} (${item.qty} পিস × ৳${item.unitPrice})`)
    .join(', ');
  return preview.slice(0, 220);
}

export function computePartyLedger(
  partyTransactions: TransactionRecord[],
): {
  totalBilled: number;
  totalPaid: number;
  currentDue: number;
  entries: LedgerEntrySnapshot[];
} {
  const sorted = [...partyTransactions].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const aMs = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : Date.now();
    const bMs = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : Date.now();
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });

  let totalBilled = 0;
  let totalPaid = 0;
  let runningBalance = 0;
  const entries: LedgerEntrySnapshot[] = [];

  for (const tx of sorted) {
    const isBill =
      tx.type === 'supplier_purchase' ||
      tx.type === 'customer_sale' ||
      tx.type === 'supplier_due_add' ||
      tx.type === 'customer_due_add';
    const debit = isBill ? tx.totalAmount : 0;
    const credit = tx.paidAmount;

    totalBilled += debit;
    totalPaid += credit;
    runningBalance += debit - credit;

    entries.push({
      txId: tx.id,
      date: tx.date,
      type: tx.type,
      invoiceNo: tx.invoiceNo,
      summary: buildEntrySummary(tx),
      items: tx.items,
      subtotal: tx.subtotal,
      discount: tx.discount,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      dueAmount: tx.dueAmount,
      paymentMethod: tx.paymentMethod,
      note: tx.note,
      debit,
      credit,
      runningBalance,
    });
  }

  return {
    totalBilled,
    totalPaid,
    currentDue: totalBilled - totalPaid,
    entries: entries.slice(-BLUEPRINT_LIMITS.ENTRIES_MAX),
  };
}

export interface SavePartyInput {
  id?: string;
  partyType: PartyType;
  name: string;
  phone: string;
  address: string;
  openingDue?: number;
  openingDate?: string;
  openingNote?: string;
}

export async function savePartyProfile(
  input: SavePartyInput,
  existingParty: PartyRecord | undefined,
  partyTransactions: TransactionRecord[],
): Promise<string> {
  const ownerUid = getOwnerUid();
  const collectionName = input.partyType === 'supplier' ? 'suppliers' : 'customers';
  const publicCollection =
    input.partyType === 'supplier' ? 'publicSupplierLedgers' : 'publicCustomerLedgers';

  const id = input.id || generateDocId(collectionName);
  const name = clampString(input.name, BLUEPRINT_LIMITS.NAME_MAX);
  const phone = clampString(input.phone, BLUEPRINT_LIMITS.PHONE_MAX);
  const address = clampString(input.address, BLUEPRINT_LIMITS.ADDRESS_MAX);

  if (!name) {
    throw new Error('নাম আবশ্যক।');
  }

  const openingDue = !existingParty ? Math.max(0, Number(input.openingDue) || 0) : 0;
  let openingTx: TransactionRecord | null = null;
  if (!existingParty && openingDue > 0) {
    const openingTxId = generateDocId('transactions');
    openingTx = {
      id: openingTxId,
      type: input.partyType === 'supplier' ? 'supplier_due_add' : 'customer_due_add',
      date: clampString(input.openingDate || getTodayIsoDate(), BLUEPRINT_LIMITS.DATE_MAX),
      partyId: id,
      partyName: name,
      partyPhone: phone,
      partyAddress: address,
      invoiceNo: 'PREV-1001',
      items: [],
      subtotal: openingDue,
      discount: 0,
      totalAmount: openingDue,
      paidAmount: 0,
      dueAmount: openingDue,
      paymentMethod: 'পূর্বের বাকি',
      note: clampString(input.openingNote || 'শুরুতে আগের বাকি যোগ', BLUEPRINT_LIMITS.NOTE_MAX),
      ownerUid,
      createdAt: null,
      updatedAt: null,
    };
  }

  const effectiveTxs = openingTx ? [...partyTransactions, openingTx] : partyTransactions;
  const computed = computePartyLedger(effectiveTxs);
  const batch = writeBatch(db);
  const partyRef = doc(db, collectionName, id);
  const publicRef = doc(db, publicCollection, id);

  if (existingParty) {
    batch.update(partyRef, {
      name,
      phone,
      address,
      totalBilled: computed.totalBilled,
      totalPaid: computed.totalPaid,
      currentDue: computed.currentDue,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(partyRef, {
      id,
      name,
      phone,
      address,
      totalBilled: computed.totalBilled,
      totalPaid: computed.totalPaid,
      currentDue: computed.currentDue,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  if (openingTx) {
    batch.set(doc(db, 'transactions', openingTx.id), {
      id: openingTx.id,
      type: openingTx.type,
      date: openingTx.date,
      partyId: openingTx.partyId,
      partyName: openingTx.partyName,
      partyPhone: openingTx.partyPhone,
      partyAddress: openingTx.partyAddress,
      invoiceNo: openingTx.invoiceNo,
      items: openingTx.items,
      subtotal: openingTx.subtotal,
      discount: openingTx.discount,
      totalAmount: openingTx.totalAmount,
      paidAmount: openingTx.paidAmount,
      dueAmount: openingTx.dueAmount,
      paymentMethod: openingTx.paymentMethod,
      note: openingTx.note,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(publicRef, {
    id,
    partyType: input.partyType,
    name,
    phone,
    address,
    totalBilled: computed.totalBilled,
    totalPaid: computed.totalPaid,
    currentDue: computed.currentDue,
    shareEnabled: true,
    entries: computed.entries,
    ownerUid: existingParty?.ownerUid || ownerUid,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
  }
}

export interface SaveTransactionInput {
  txId?: string;
  type: TransactionType;
  date: string;
  partyId?: string;
  isNewParty?: boolean;
  partyName: string;
  partyPhone: string;
  partyAddress: string;
  invoiceNo: string;
  items: LineItem[];
  discount: number;
  directAmount?: number;
  paidAmount: number;
  paymentMethod: string;
  note: string;
}

export async function saveTransactionAndSyncLedger(
  input: SaveTransactionInput,
  existingParty: PartyRecord | undefined,
  existingTransaction: TransactionRecord | undefined,
  allTransactionsForParty: TransactionRecord[],
  allTransactions: TransactionRecord[],
): Promise<{ txId: string; partyId: string }> {
  const ownerUid = getOwnerUid();
  const isSupplierTx =
    input.type === 'supplier_purchase' ||
    input.type === 'supplier_payment' ||
    input.type === 'supplier_due_add';
  const partyType: PartyType = isSupplierTx ? 'supplier' : 'customer';
  const partyCollection = isSupplierTx ? 'suppliers' : 'customers';
  const publicLedgerCollection = isSupplierTx
    ? 'publicSupplierLedgers'
    : 'publicCustomerLedgers';

  const partyId = input.partyId || existingParty?.id || generateDocId(partyCollection);
  const txId = input.txId || existingTransaction?.id || generateDocId('transactions');

  const partyName = clampString(input.partyName, BLUEPRINT_LIMITS.NAME_MAX);
  const partyPhone = clampString(input.partyPhone, BLUEPRINT_LIMITS.PHONE_MAX);
  const partyAddress = clampString(input.partyAddress, BLUEPRINT_LIMITS.ADDRESS_MAX);

  if (!partyName) {
    throw new Error('কাস্টমার বা সাপ্লায়ারের নাম দিন।');
  }

  const isBill = input.type === 'supplier_purchase' || input.type === 'customer_sale';
  const isCashDueAdd =
    input.type === 'supplier_due_add' || input.type === 'customer_due_add';
  const cleanItems = isBill ? sanitizeLineItems(input.items) : [];

  if (isBill && cleanItems.length === 0) {
    throw new Error('কমপক্ষে একটি প্রোডাক্টের বিবরণ ও দাম দিন।');
  }

  const directAmount = isCashDueAdd ? Math.max(0, Number(input.directAmount) || 0) : 0;
  if (isCashDueAdd && directAmount <= 0) {
    throw new Error('সঠিক টাকার পরিমাণ লিখুন।');
  }

  const subtotal = isBill
    ? cleanItems.reduce((acc, item) => acc + item.lineTotal, 0)
    : isCashDueAdd
      ? directAmount
      : 0;
  const discount = isBill ? Math.max(0, Number(input.discount) || 0) : 0;
  const totalAmount = isBill
    ? Math.max(0, subtotal - discount)
    : isCashDueAdd
      ? directAmount
      : 0;
  const paidAmount = isCashDueAdd ? 0 : Math.max(0, Number(input.paidAmount) || 0);
  const dueAmount = isBill || isCashDueAdd ? totalAmount - paidAmount : 0;

  const invoiceNo =
    clampString(input.invoiceNo, BLUEPRINT_LIMITS.INVOICE_NO_MAX) ||
    generateInvoiceNo(allTransactions, input.type);

  const txPayload: TransactionRecord = {
    id: txId,
    type: input.type,
    date: clampString(input.date, BLUEPRINT_LIMITS.DATE_MAX),
    partyId,
    partyName,
    partyPhone,
    partyAddress,
    invoiceNo,
    items: cleanItems,
    subtotal,
    discount,
    totalAmount,
    paidAmount,
    dueAmount,
    paymentMethod: clampString(input.paymentMethod || 'নগদ', BLUEPRINT_LIMITS.PAYMENT_METHOD_MAX),
    note: clampString(input.note, BLUEPRINT_LIMITS.NOTE_MAX),
    ownerUid: existingTransaction?.ownerUid || ownerUid,
    createdAt: existingTransaction?.createdAt || null,
    updatedAt: null,
  };

  // Recompute party transactions list with the saved/updated tx
  const nextPartyTransactions = existingTransaction
    ? allTransactionsForParty.map((t) => (t.id === txId ? txPayload : t))
    : [...allTransactionsForParty, txPayload];

  const computed = computePartyLedger(nextPartyTransactions);

  const batch = writeBatch(db);
  const partyRef = doc(db, partyCollection, partyId);
  const txRef = doc(db, 'transactions', txId);
  const publicLedgerRef = doc(db, publicLedgerCollection, partyId);

  if (existingParty) {
    batch.update(partyRef, {
      name: partyName,
      phone: partyPhone,
      address: partyAddress,
      totalBilled: computed.totalBilled,
      totalPaid: computed.totalPaid,
      currentDue: computed.currentDue,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(partyRef, {
      id: partyId,
      name: partyName,
      phone: partyPhone,
      address: partyAddress,
      totalBilled: computed.totalBilled,
      totalPaid: computed.totalPaid,
      currentDue: computed.currentDue,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  if (existingTransaction) {
    batch.update(txRef, {
      type: txPayload.type,
      date: txPayload.date,
      partyId: txPayload.partyId,
      partyName: txPayload.partyName,
      partyPhone: txPayload.partyPhone,
      partyAddress: txPayload.partyAddress,
      invoiceNo: txPayload.invoiceNo,
      items: txPayload.items,
      subtotal: txPayload.subtotal,
      discount: txPayload.discount,
      totalAmount: txPayload.totalAmount,
      paidAmount: txPayload.paidAmount,
      dueAmount: txPayload.dueAmount,
      paymentMethod: txPayload.paymentMethod,
      note: txPayload.note,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(txRef, {
      id: txId,
      type: txPayload.type,
      date: txPayload.date,
      partyId: txPayload.partyId,
      partyName: txPayload.partyName,
      partyPhone: txPayload.partyPhone,
      partyAddress: txPayload.partyAddress,
      invoiceNo: txPayload.invoiceNo,
      items: txPayload.items,
      subtotal: txPayload.subtotal,
      discount: txPayload.discount,
      totalAmount: txPayload.totalAmount,
      paidAmount: txPayload.paidAmount,
      dueAmount: txPayload.dueAmount,
      paymentMethod: txPayload.paymentMethod,
      note: txPayload.note,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(publicLedgerRef, {
    id: partyId,
    partyType,
    name: partyName,
    phone: partyPhone,
    address: partyAddress,
    totalBilled: computed.totalBilled,
    totalPaid: computed.totalPaid,
    currentDue: computed.currentDue,
    shareEnabled: true,
    entries: computed.entries,
    ownerUid: existingParty?.ownerUid || ownerUid,
    updatedAt: serverTimestamp(),
  });

  // Sync public invoice document for bill transactions
  if (isBill) {
    const publicInvoiceRef = doc(db, 'publicInvoices', txId);
    if (existingTransaction && (existingTransaction.type === 'customer_sale' || existingTransaction.type === 'supplier_purchase')) {
      batch.update(publicInvoiceRef, {
        invoiceNo: txPayload.invoiceNo,
        date: txPayload.date,
        partyType,
        partyId,
        partyName,
        partyPhone,
        partyAddress,
        items: txPayload.items,
        subtotal: txPayload.subtotal,
        discount: txPayload.discount,
        totalAmount: txPayload.totalAmount,
        paidAmount: txPayload.paidAmount,
        dueAmount: txPayload.dueAmount,
        partyTotalDue: computed.currentDue,
        paymentMethod: txPayload.paymentMethod,
        note: txPayload.note,
        shareEnabled: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(publicInvoiceRef, {
        id: txId,
        invoiceNo: txPayload.invoiceNo,
        date: txPayload.date,
        partyType,
        partyId,
        partyName,
        partyPhone,
        partyAddress,
        items: txPayload.items,
        subtotal: txPayload.subtotal,
        discount: txPayload.discount,
        totalAmount: txPayload.totalAmount,
        paidAmount: txPayload.paidAmount,
        dueAmount: txPayload.dueAmount,
        partyTotalDue: computed.currentDue,
        paymentMethod: txPayload.paymentMethod,
        note: txPayload.note,
        shareEnabled: true,
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else if (
    existingTransaction &&
    (existingTransaction.type === 'customer_sale' || existingTransaction.type === 'supplier_purchase')
  ) {
    batch.delete(doc(db, 'publicInvoices', txId));
  }

  // Keep existing invoices' partyTotalDue synced for this party (up to 50 recent invoices)
  const otherBillTxs = allTransactionsForParty
    .filter(
      (t) =>
        t.id !== txId &&
        (t.type === 'customer_sale' || t.type === 'supplier_purchase'),
    )
    .slice(0, 50);

  for (const otherTx of otherBillTxs) {
    batch.update(doc(db, 'publicInvoices', otherTx.id), {
      partyName,
      partyPhone,
      partyAddress,
      partyTotalDue: computed.currentDue,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return { txId, partyId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export async function deleteTransactionAndSyncLedger(
  tx: TransactionRecord,
  party: PartyRecord | undefined,
  allTransactionsForParty: TransactionRecord[],
): Promise<void> {
  const ownerUid = getOwnerUid();
  const isSupplierTx =
    tx.type === 'supplier_purchase' ||
    tx.type === 'supplier_payment' ||
    tx.type === 'supplier_due_add';
  const partyType: PartyType = isSupplierTx ? 'supplier' : 'customer';
  const partyCollection = isSupplierTx ? 'suppliers' : 'customers';
  const publicLedgerCollection = isSupplierTx
    ? 'publicSupplierLedgers'
    : 'publicCustomerLedgers';

  const remaining = allTransactionsForParty.filter((t) => t.id !== tx.id);
  const computed = computePartyLedger(remaining);

  const batch = writeBatch(db);
  batch.delete(doc(db, 'transactions', tx.id));

  if (tx.type === 'customer_sale' || tx.type === 'supplier_purchase') {
    batch.delete(doc(db, 'publicInvoices', tx.id));
  }

  if (party) {
    batch.update(doc(db, partyCollection, party.id), {
      totalBilled: computed.totalBilled,
      totalPaid: computed.totalPaid,
      currentDue: computed.currentDue,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, publicLedgerCollection, party.id), {
      id: party.id,
      partyType,
      name: party.name,
      phone: party.phone,
      address: party.address,
      totalBilled: computed.totalBilled,
      totalPaid: computed.totalPaid,
      currentDue: computed.currentDue,
      shareEnabled: true,
      entries: computed.entries,
      ownerUid: party.ownerUid || ownerUid,
      updatedAt: serverTimestamp(),
    });

    const otherBillTxs = remaining
      .filter((t) => t.type === 'customer_sale' || t.type === 'supplier_purchase')
      .slice(0, 50);

    for (const otherTx of otherBillTxs) {
      batch.update(doc(db, 'publicInvoices', otherTx.id), {
        partyTotalDue: computed.currentDue,
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `transactions/${tx.id}`);
  }
}

export async function deletePartyAndTransactions(
  party: PartyRecord,
  partyType: PartyType,
  partyTransactions: TransactionRecord[],
): Promise<void> {
  getOwnerUid();
  const partyCollection = partyType === 'supplier' ? 'suppliers' : 'customers';
  const publicLedgerCollection =
    partyType === 'supplier' ? 'publicSupplierLedgers' : 'publicCustomerLedgers';

  const batch = writeBatch(db);
  batch.delete(doc(db, partyCollection, party.id));
  batch.delete(doc(db, publicLedgerCollection, party.id));

  for (const tx of partyTransactions.slice(0, 200)) {
    batch.delete(doc(db, 'transactions', tx.id));
    if (tx.type === 'customer_sale' || tx.type === 'supplier_purchase') {
      batch.delete(doc(db, 'publicInvoices', tx.id));
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${partyCollection}/${party.id}`);
  }
}

// --- Home Expenses Operations ---

export interface SaveHomeExpenseInput {
  id?: string;
  date: string;
  title: string;
  items: HomeExpenseItem[];
  paidBy: string;
  paymentMethod: string;
  note: string;
}

export async function saveHomeExpense(
  input: SaveHomeExpenseInput,
  existingExpense?: HomeExpenseRecord,
): Promise<string> {
  const ownerUid = getOwnerUid();
  const id = input.id || existingExpense?.id || generateDocId('homeExpenses');
  const date = clampString(input.date, BLUEPRINT_LIMITS.DATE_MAX);
  const monthKey = date.slice(0, 7);
  const title = clampString(input.title, BLUEPRINT_LIMITS.TITLE_MAX);

  const cleanItems: HomeExpenseItem[] = input.items
    .slice(0, BLUEPRINT_LIMITS.ITEMS_MAX)
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      name: clampString(item.name, 120),
      qtyText: clampString(item.qtyText, 60),
      amount: Math.max(0, Number(item.amount) || 0),
    }));

  if (!title) {
    throw new Error('খরচের শিরোনাম বা ধরন লিখুন (যেমন: দৈনিক বাজার)।');
  }
  if (cleanItems.length === 0) {
    throw new Error('কমপক্ষে একটি কেনা জিনিসের নাম ও খরচ দিন।');
  }

  const totalAmount = cleanItems.reduce((sum, it) => sum + it.amount, 0);
  const paidBy = clampString(input.paidBy || 'আমি', 60);
  const paymentMethod = clampString(input.paymentMethod || 'নগদ', BLUEPRINT_LIMITS.PAYMENT_METHOD_MAX);
  const note = clampString(input.note, BLUEPRINT_LIMITS.NOTE_MAX);

  const ref = doc(db, 'homeExpenses', id);
  try {
    if (existingExpense) {
      await updateDoc(ref, {
        date,
        monthKey,
        title,
        items: cleanItems,
        totalAmount,
        paidBy,
        paymentMethod,
        note,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        date,
        monthKey,
        title,
        items: cleanItems,
        totalAmount,
        paidBy,
        paymentMethod,
        note,
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `homeExpenses/${id}`);
  }
}

export async function deleteHomeExpense(expenseId: string): Promise<void> {
  getOwnerUid();
  try {
    await deleteDoc(doc(db, 'homeExpenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `homeExpenses/${expenseId}`);
  }
}

// --- Personal, Mainu Mama & Moderator Himel Accounts ---

export function computePersonLedger(
  personTxs: PersonTransactionRecord[],
): {
  totalPayable: number;
  totalGiven: number;
  currentBalance: number;
  entries: PersonLedgerEntrySnapshot[];
} {
  const sorted = [...personTxs].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const aMs = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : Date.now();
    const bMs = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : Date.now();
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });

  let totalPayable = 0;
  let totalGiven = 0;
  let runningBalance = 0;
  const entries: PersonLedgerEntrySnapshot[] = [];

  for (const tx of sorted) {
    const payableAmount = tx.type === 'payable_add' ? tx.amount : 0;
    const givenAmount = tx.type === 'payment_given' ? tx.amount : 0;

    totalPayable += payableAmount;
    totalGiven += givenAmount;
    runningBalance += payableAmount - givenAmount;

    entries.push({
      ptxId: tx.id,
      date: tx.date,
      type: tx.type,
      purpose: tx.purpose,
      paymentMethod: tx.paymentMethod,
      note: tx.note,
      payableAmount,
      givenAmount,
      runningBalance,
    });
  }

  return {
    totalPayable,
    totalGiven,
    currentBalance: totalPayable - totalGiven,
    entries: entries.slice(-BLUEPRINT_LIMITS.ENTRIES_MAX),
  };
}

export async function seedDefaultPersonsIfEmpty(): Promise<void> {
  const ownerUid = getOwnerUid();
  const defaults = [
    {
      id: 'mainu_mama',
      name: 'মাইনু মামা',
      phone: '',
      role: 'বাসার সাথী / মামা',
      note: 'বাসার যৌথ খরচ ও মামাকে দেওয়া টাকার হিসাব',
    },
    {
      id: 'himel_moderator',
      name: 'হিমেল',
      phone: '',
      role: 'মডারেটর',
      note: 'মডারেটর বেতন, কমিশন ও প্রদেয় টাকার হিসাব',
    },
  ];

  const batch = writeBatch(db);
  for (const person of defaults) {
    batch.set(doc(db, 'persons', person.id), {
      id: person.id,
      name: person.name,
      phone: person.phone,
      role: person.role,
      note: person.note,
      totalPayable: 0,
      totalGiven: 0,
      currentBalance: 0,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'publicPersonLedgers', person.id), {
      id: person.id,
      name: person.name,
      phone: person.phone,
      role: person.role,
      totalPayable: 0,
      totalGiven: 0,
      currentBalance: 0,
      shareEnabled: true,
      entries: [],
      ownerUid,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'persons/seed');
  }
}

export interface SavePersonInput {
  id?: string;
  name: string;
  phone: string;
  role: string;
  note: string;
  openingAmount?: number;
  openingType?: PersonTransactionType;
  openingDate?: string;
  openingNote?: string;
}

export async function savePersonAccount(
  input: SavePersonInput,
  existingPerson: PersonAccountRecord | undefined,
  personTxs: PersonTransactionRecord[],
): Promise<string> {
  const ownerUid = getOwnerUid();
  const id = input.id || existingPerson?.id || generateDocId('persons');
  const name = clampString(input.name, BLUEPRINT_LIMITS.NAME_MAX);
  const phone = clampString(input.phone, BLUEPRINT_LIMITS.PHONE_MAX);
  const role = clampString(input.role || 'ব্যক্তিগত', BLUEPRINT_LIMITS.ROLE_MAX);
  const note = clampString(input.note, BLUEPRINT_LIMITS.ADDRESS_MAX);

  if (!name) {
    throw new Error('ব্যক্তির নাম দিন।');
  }

  const openingAmount = !existingPerson ? Math.max(0, Number(input.openingAmount) || 0) : 0;
  let openingPtx: PersonTransactionRecord | null = null;
  if (!existingPerson && openingAmount > 0) {
    const openingType: PersonTransactionType = input.openingType || 'payable_add';
    const openingId = generateDocId('personTransactions');
    openingPtx = {
      id: openingId,
      personId: id,
      personName: name,
      type: openingType,
      date: clampString(input.openingDate || getTodayIsoDate(), BLUEPRINT_LIMITS.DATE_MAX),
      amount: openingAmount,
      purpose: clampString(
        input.openingNote ||
          (openingType === 'payment_given'
            ? 'পূর্বের হিসাবের শুরু (আগে দেওয়া)'
            : 'পূর্বের হিসাবের শুরু (আগের বাকি)'),
        BLUEPRINT_LIMITS.PURPOSE_MAX,
      ),
      paymentMethod: 'পূর্বের বাকি',
      note: '',
      ownerUid,
      createdAt: null,
      updatedAt: null,
    };
  }

  const effectiveTxs = openingPtx ? [...personTxs, openingPtx] : personTxs;
  const computed = computePersonLedger(effectiveTxs);
  const batch = writeBatch(db);
  const personRef = doc(db, 'persons', id);
  const publicRef = doc(db, 'publicPersonLedgers', id);

  if (existingPerson) {
    batch.update(personRef, {
      name,
      phone,
      role,
      note,
      totalPayable: computed.totalPayable,
      totalGiven: computed.totalGiven,
      currentBalance: computed.currentBalance,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(personRef, {
      id,
      name,
      phone,
      role,
      note,
      totalPayable: computed.totalPayable,
      totalGiven: computed.totalGiven,
      currentBalance: computed.currentBalance,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  if (openingPtx) {
    batch.set(doc(db, 'personTransactions', openingPtx.id), {
      id: openingPtx.id,
      personId: openingPtx.personId,
      personName: openingPtx.personName,
      type: openingPtx.type,
      date: openingPtx.date,
      amount: openingPtx.amount,
      purpose: openingPtx.purpose,
      paymentMethod: openingPtx.paymentMethod,
      note: openingPtx.note,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(publicRef, {
    id,
    name,
    phone,
    role,
    totalPayable: computed.totalPayable,
    totalGiven: computed.totalGiven,
    currentBalance: computed.currentBalance,
    shareEnabled: true,
    entries: computed.entries,
    ownerUid: existingPerson?.ownerUid || ownerUid,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `persons/${id}`);
  }
}

export interface SavePersonTxInput {
  ptxId?: string;
  personId: string;
  type: PersonTransactionType;
  date: string;
  amount: number;
  purpose: string;
  paymentMethod: string;
  note: string;
}

export async function savePersonTransactionAndSync(
  input: SavePersonTxInput,
  person: PersonAccountRecord,
  existingTx: PersonTransactionRecord | undefined,
  personTxs: PersonTransactionRecord[],
): Promise<string> {
  const ownerUid = getOwnerUid();
  const ptxId = input.ptxId || existingTx?.id || generateDocId('personTransactions');
  const date = clampString(input.date, BLUEPRINT_LIMITS.DATE_MAX);
  const amount = Math.max(0, Number(input.amount) || 0);
  const purpose = clampString(input.purpose, BLUEPRINT_LIMITS.PURPOSE_MAX);
  const paymentMethod = clampString(input.paymentMethod || 'নগদ', BLUEPRINT_LIMITS.PAYMENT_METHOD_MAX);
  const note = clampString(input.note, BLUEPRINT_LIMITS.NOTE_MAX);

  if (amount <= 0) {
    throw new Error('সঠিক টাকার পরিমাণ লিখুন।');
  }
  if (!purpose) {
    throw new Error('কি জন্য টাকা দেওয়া বা হিসাব করা হচ্ছে তার বিবরণ দিন।');
  }

  const nextTx: PersonTransactionRecord = {
    id: ptxId,
    personId: person.id,
    personName: person.name,
    type: input.type,
    date,
    amount,
    purpose,
    paymentMethod,
    note,
    ownerUid: existingTx?.ownerUid || ownerUid,
    createdAt: existingTx?.createdAt || null,
    updatedAt: null,
  };

  const nextList = existingTx
    ? personTxs.map((t) => (t.id === ptxId ? nextTx : t))
    : [...personTxs, nextTx];

  const computed = computePersonLedger(nextList);

  const batch = writeBatch(db);
  const txRef = doc(db, 'personTransactions', ptxId);
  const personRef = doc(db, 'persons', person.id);
  const publicRef = doc(db, 'publicPersonLedgers', person.id);

  if (existingTx) {
    batch.update(txRef, {
      personId: person.id,
      personName: person.name,
      type: input.type,
      date,
      amount,
      purpose,
      paymentMethod,
      note,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(txRef, {
      id: ptxId,
      personId: person.id,
      personName: person.name,
      type: input.type,
      date,
      amount,
      purpose,
      paymentMethod,
      note,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(personRef, {
    totalPayable: computed.totalPayable,
    totalGiven: computed.totalGiven,
    currentBalance: computed.currentBalance,
    updatedAt: serverTimestamp(),
  });

  batch.set(publicRef, {
    id: person.id,
    name: person.name,
    phone: person.phone,
    role: person.role,
    totalPayable: computed.totalPayable,
    totalGiven: computed.totalGiven,
    currentBalance: computed.currentBalance,
    shareEnabled: true,
    entries: computed.entries,
    ownerUid: person.ownerUid || ownerUid,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return ptxId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `personTransactions/${ptxId}`);
  }
}

export async function deletePersonTransactionAndSync(
  tx: PersonTransactionRecord,
  person: PersonAccountRecord | undefined,
  personTxs: PersonTransactionRecord[],
): Promise<void> {
  const ownerUid = getOwnerUid();
  const remaining = personTxs.filter((t) => t.id !== tx.id);
  const computed = computePersonLedger(remaining);

  const batch = writeBatch(db);
  batch.delete(doc(db, 'personTransactions', tx.id));

  if (person) {
    batch.update(doc(db, 'persons', person.id), {
      totalPayable: computed.totalPayable,
      totalGiven: computed.totalGiven,
      currentBalance: computed.currentBalance,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'publicPersonLedgers', person.id), {
      id: person.id,
      name: person.name,
      phone: person.phone,
      role: person.role,
      totalPayable: computed.totalPayable,
      totalGiven: computed.totalGiven,
      currentBalance: computed.currentBalance,
      shareEnabled: true,
      entries: computed.entries,
      ownerUid: person.ownerUid || ownerUid,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `personTransactions/${tx.id}`);
  }
}

export async function deletePersonAccountAndTransactions(
  person: PersonAccountRecord,
  personTxs: PersonTransactionRecord[],
): Promise<void> {
  getOwnerUid();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'persons', person.id));
  batch.delete(doc(db, 'publicPersonLedgers', person.id));
  for (const tx of personTxs.slice(0, 200)) {
    batch.delete(doc(db, 'personTransactions', tx.id));
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `persons/${person.id}`);
  }
}
