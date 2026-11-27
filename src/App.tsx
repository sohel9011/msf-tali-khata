import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import {
  Copy,
  Edit3,
  FileDown,
  FileText,
  Home,
  Loader2,
  LogOut,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  BookOpen,
  LayoutDashboard,
  ChevronRight,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  ADMIN_EMAIL,
  HomeExpenseRecord,
  LedgerEntrySnapshot,
  PartyRecord,
  PartyType,
  PersonAccountRecord,
  PersonTransactionRecord,
  PublicInvoiceRecord,
  TransactionRecord,
  TransactionType,
} from './types/bookkeeping';
import {
  computePartyLedger,
  deletePartyAndTransactions,
  deleteTransactionAndSyncLedger,
  seedDefaultPersonsIfEmpty,
} from './services/bookkeepingService';
import {
  buildPublicUrl,
  formatDateBn,
  formatMonthBn,
  formatTaka,
  getCurrentMonthKey,
  getTransactionTypeLabel,
  toBengaliDigits,
} from './utils/formatters';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { EntryFormModal } from './components/EntryFormModal';
import { PartyProfileView } from './components/PartyProfileView';
import { InvoiceView } from './components/InvoiceView';
import { PartyModal } from './components/PartyModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast, ToastMessage } from './components/Toast';
import { PublicPortalView } from './components/PublicPortalView';
import { HomeExpensesView } from './components/HomeExpensesView';
import { PersonsLedgerView } from './components/PersonsLedgerView';
import { MonthlyProgressChart } from './components/MonthlyProgressChart';
import { generateMonthlySummaryPdf } from './utils/monthlyReportPdf';

type ActiveTab = 'dashboard' | 'suppliers' | 'customers' | 'home_expenses' | 'persons';

interface PublicQueryParams {
  customer: string | null;
  supplier: string | null;
  invoice: string | null;
  person: string | null;
}

function readQueryParams(): PublicQueryParams {
  const params = new URLSearchParams(window.location.search);
  return {
    customer: params.get('customer'),
    supplier: params.get('supplier'),
    invoice: params.get('invoice'),
    person: params.get('person'),
  };
}

function BookkeepingApp() {
  const [queryParams, setQueryParams] = useState<PublicQueryParams>(() =>
    readQueryParams(),
  );

  // Auth state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore synced collections
  const [suppliers, setSuppliers] = useState<PartyRecord[]>([]);
  const [customers, setCustomers] = useState<PartyRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [homeExpenses, setHomeExpenses] = useState<HomeExpenseRecord[]>([]);
  const [persons, setPersons] = useState<PersonAccountRecord[]>([]);
  const [personTransactions, setPersonTransactions] = useState<
    PersonTransactionRecord[]
  >([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Navigation & View state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [customerSubTab, setCustomerSubTab] = useState<'customers' | 'invoices'>(
    'customers',
  );
  const [selectedParty, setSelectedParty] = useState<{
    id: string;
    type: PartyType;
  } | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  // Filters & Search
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalType, setEntryModalType] =
    useState<TransactionType>('customer_sale');
  const [entryModalPartyId, setEntryModalPartyId] = useState<string | undefined>(
    undefined,
  );
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);

  const [partyModalState, setPartyModalState] = useState<{
    open: boolean;
    type: PartyType;
    editing: PartyRecord | null;
  }>({ open: false, type: 'customer', editing: null });

  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'tx'; tx: TransactionRecord }
    | { kind: 'party'; party: PartyRecord; type: PartyType }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ id: Date.now(), text, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onPopState = () => setQueryParams(readQueryParams());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }

      if (
        currentUser.emailVerified &&
        currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      ) {
        setIsAdmin(true);
        setAuthReady(true);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdmin(currentUser.emailVerified && adminDoc.exists());
      } catch {
        setIsAdmin(false);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const isPublicRoute = Boolean(
    queryParams.customer ||
      queryParams.supplier ||
      queryParams.invoice ||
      queryParams.person,
  );

  // Real-time Firestore listeners (strictly when authenticated admin is ready)
  useEffect(() => {
    if (!authReady || !isAdmin || isPublicRoute) {
      return;
    }

    setDataLoading(true);
    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 6) {
        setDataLoading(false);
      }
    };

    const unsubSuppliers = onSnapshot(
      collection(db, 'suppliers'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PartyRecord);
        list.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
        setSuppliers(list);
        markLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      },
    );

    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PartyRecord);
        list.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
        setCustomers(list);
        markLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'customers');
      },
    );

    const unsubTransactions = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as TransactionRecord);
        list.sort((a, b) => {
          const dCmp = b.date.localeCompare(a.date);
          if (dCmp !== 0) return dCmp;
          const aMs =
            a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
          const bMs =
            b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
          return bMs - aMs;
        });
        setTransactions(list);
        markLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      },
    );

    const unsubHomeExpenses = onSnapshot(
      collection(db, 'homeExpenses'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as HomeExpenseRecord);
        list.sort((a, b) => {
          const dCmp = b.date.localeCompare(a.date);
          if (dCmp !== 0) return dCmp;
          const aMs =
            a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
          const bMs =
            b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
          return bMs - aMs;
        });
        setHomeExpenses(list);
        markLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'homeExpenses');
      },
    );

    const unsubPersons = onSnapshot(
      collection(db, 'persons'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PersonAccountRecord);
        list.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
        setPersons(list);
        markLoaded();

        if (
          list.length === 0 &&
          window.localStorage.getItem('ms_fashion_persons_seeded') !== '1'
        ) {
          window.localStorage.setItem('ms_fashion_persons_seeded', '1');
          void seedDefaultPersonsIfEmpty();
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'persons');
      },
    );

    const unsubPersonTxs = onSnapshot(
      collection(db, 'personTransactions'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PersonTransactionRecord);
        list.sort((a, b) => {
          const dCmp = b.date.localeCompare(a.date);
          if (dCmp !== 0) return dCmp;
          const aMs =
            a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
          const bMs =
            b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
          return bMs - aMs;
        });
        setPersonTransactions(list);
        markLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'personTransactions');
      },
    );

    return () => {
      unsubSuppliers();
      unsubCustomers();
      unsubTransactions();
      unsubHomeExpenses();
      unsubPersons();
      unsubPersonTxs();
    };
  }, [authReady, isAdmin, isPublicRoute]);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Google লগইন সম্পন্ন হয়নি।';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('লগইন উইন্ডোটি বন্ধ করা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      } else if (msg.includes('unauthorized-domain')) {
        setAuthError(
          `এই ডোমেইনটি (${window.location.hostname}) এখনো Firebase-এ অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized domains-এ গিয়ে "${window.location.hostname}" যোগ করুন।`,
        );
      } else {
        setAuthError('লগইন করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setSuppliers([]);
    setCustomers([]);
    setTransactions([]);
    setHomeExpenses([]);
    setPersons([]);
    setPersonTransactions([]);
    setSelectedParty(null);
    setActiveInvoiceId(null);
  };

  // Derived Dashboard Summary Metrics
  const summary = useMemo(() => {
    const totalSupplierDue = suppliers.reduce(
      (sum, s) => sum + (s.currentDue || 0),
      0,
    );
    const totalCustomerDue = customers.reduce(
      (sum, c) => sum + (c.currentDue || 0),
      0,
    );
    const totalPurchases = transactions
      .filter((t) => t.type === 'supplier_purchase')
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalSales = transactions
      .filter((t) => t.type === 'customer_sale')
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    const currentMonth = getCurrentMonthKey();
    const monthlyHomeExpense = homeExpenses
      .filter((h) => h.monthKey === currentMonth)
      .reduce((sum, h) => sum + (h.totalAmount || 0), 0);

    const staffBalanceDue = persons.reduce(
      (sum, p) => sum + Math.max(0, p.currentBalance || 0),
      0,
    );

    return {
      totalSupplierDue,
      totalCustomerDue,
      totalPurchases,
      totalSales,
      monthlyHomeExpense,
      staffBalanceDue,
      currentMonth,
    };
  }, [suppliers, customers, transactions, homeExpenses, persons]);

  const transactionsById = useMemo(() => {
    const map: Record<string, TransactionRecord> = {};
    for (const tx of transactions) {
      map[tx.id] = tx;
    }
    return map;
  }, [transactions]);

  const lastTxDateBySupplier = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tx of transactions) {
      if (
        tx.type !== 'supplier_purchase' &&
        tx.type !== 'supplier_payment' &&
        tx.type !== 'supplier_due_add'
      ) {
        continue;
      }
      if (!tx.partyId || !tx.date) continue;
      if (!map[tx.partyId] || tx.date > map[tx.partyId]) {
        map[tx.partyId] = tx.date;
      }
    }
    return map;
  }, [transactions]);

  const activePartyObj = useMemo(() => {
    if (!selectedParty) return null;
    const source = selectedParty.type === 'supplier' ? suppliers : customers;
    return source.find((p) => p.id === selectedParty.id) || null;
  }, [selectedParty, suppliers, customers]);

  const activePartyComputedLedger = useMemo(() => {
    if (!selectedParty) return null;
    const partyTxs = transactions.filter((t) => t.partyId === selectedParty.id);
    return computePartyLedger(partyTxs);
  }, [selectedParty, transactions]);

  const activeInvoiceRecord: PublicInvoiceRecord | null = useMemo(() => {
    if (!activeInvoiceId) return null;
    const tx = transactionsById[activeInvoiceId];
    if (!tx) return null;
    const isSupplierTx =
      tx.type === 'supplier_purchase' ||
      tx.type === 'supplier_payment' ||
      tx.type === 'supplier_due_add';
    const partyList = isSupplierTx ? suppliers : customers;
    const party = partyList.find((p) => p.id === tx.partyId);

    return {
      id: tx.id,
      invoiceNo: tx.invoiceNo,
      date: tx.date,
      partyType: isSupplierTx ? 'supplier' : 'customer',
      partyId: tx.partyId,
      partyName: party?.name || tx.partyName,
      partyPhone: party?.phone || tx.partyPhone,
      partyAddress: party?.address || tx.partyAddress,
      items: tx.items,
      subtotal: tx.subtotal,
      discount: tx.discount,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      dueAmount: tx.dueAmount,
      partyTotalDue: party?.currentDue ?? tx.dueAmount,
      paymentMethod: tx.paymentMethod,
      note: tx.note,
      shareEnabled: true,
      ownerUid: tx.ownerUid,
    };
  }, [activeInvoiceId, transactionsById, suppliers, customers]);

  // Filtered lists
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (!q) return true;
      return (
        tx.partyName.toLowerCase().includes(q) ||
        tx.partyPhone.toLowerCase().includes(q) ||
        tx.invoiceNo.toLowerCase().includes(q) ||
        tx.items.some((it) => it.name.toLowerCase().includes(q))
      );
    });
  }, [transactions, txTypeFilter, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q),
    );
  }, [suppliers, searchQuery]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }, [customers, searchQuery]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (tx.type !== 'customer_sale') return false;
      if (!q) return true;
      return (
        tx.partyName.toLowerCase().includes(q) ||
        tx.partyPhone.toLowerCase().includes(q) ||
        tx.invoiceNo.toLowerCase().includes(q)
      );
    });
  }, [transactions, searchQuery]);

  const openNewEntryModal = (
    type: TransactionType = 'customer_sale',
    partyId?: string,
  ) => {
    setEditingTx(null);
    setEntryModalType(type);
    setEntryModalPartyId(partyId);
    setEntryModalOpen(true);
  };

  const openEditEntryModal = (tx: TransactionRecord) => {
    setEditingTx(tx);
    setEntryModalType(tx.type);
    setEntryModalPartyId(tx.partyId);
    setEntryModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === 'tx') {
        const tx = confirmDelete.tx;
        const isSup =
          tx.type === 'supplier_purchase' ||
          tx.type === 'supplier_payment' ||
          tx.type === 'supplier_due_add';
        const partyList = isSup ? suppliers : customers;
        const party = partyList.find((p) => p.id === tx.partyId);
        const partyTxs = transactions.filter((t) => t.partyId === tx.partyId);
        await deleteTransactionAndSyncLedger(tx, party, partyTxs);
        if (activeInvoiceId === tx.id) {
          setActiveInvoiceId(null);
        }
        showToast('হিসাবটি মুছে ফেলা হয়েছে।');
      } else {
        const partyTxs = transactions.filter(
          (t) => t.partyId === confirmDelete.party.id,
        );
        await deletePartyAndTransactions(
          confirmDelete.party,
          confirmDelete.type,
          partyTxs,
        );
        setSelectedParty(null);
        showToast('প্রোফাইল এবং সংশ্লিষ্ট হিসাব মুছে ফেলা হয়েছে।');
      }
      setConfirmDelete(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'মুছতে সমস্যা হয়েছে।',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyShareLink = async (
    param: 'customer' | 'supplier' | 'invoice',
    id: string,
  ) => {
    try {
      await navigator.clipboard.writeText(buildPublicUrl(param, id));
      showToast('শেয়ার লিংক কপি করা হয়েছে!');
    } catch {
      showToast('লিংক কপি করা যায়নি।', 'error');
    }
  };

  const handleDownloadMonthlyReportPdf = async () => {
    if (pdfExporting || dataLoading) return;
    setPdfExporting(true);
    try {
      await generateMonthlySummaryPdf({
        monthKey: summary.currentMonth,
        transactions,
        homeExpenses,
        personTransactions,
        totalCustomerDue: summary.totalCustomerDue,
        totalSupplierDue: summary.totalSupplierDue,
        staffBalanceDue: summary.staffBalanceDue,
      });
      showToast(
        `${formatMonthBn(summary.currentMonth)} মাসের রিপোর্ট PDF ডাউনলোড হয়েছে!`,
      );
    } catch {
      showToast('মাসিক রিপোর্ট PDF তৈরি করতে সমস্যা হয়েছে।', 'error');
    } finally {
      setPdfExporting(false);
    }
  };

  const handleExitPublicView = () => {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.pushState({}, '', cleanUrl);
    setQueryParams({
      customer: null,
      supplier: null,
      invoice: null,
      person: null,
    });
  };

  // 1. Public Read-Only Shareable Route (No login required!)
  if (isPublicRoute) {
    return (
      <>
        <PublicPortalView
          customerId={queryParams.customer}
          supplierId={queryParams.supplier}
          invoiceId={queryParams.invoice}
          personId={queryParams.person}
          isAdminLoggedIn={isAdmin}
          onExitPublicView={handleExitPublicView}
          onCopySuccess={(msg) => showToast(msg)}
        />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  // 2. Loading Auth Boot Screen
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F6F7F5] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#0D5C46] text-white font-bold flex items-center justify-center mx-auto">
            MS
          </div>
          <p className="text-sm font-medium text-[#4B554E]">
            এমএস ফ্যাশন টালি খাতা লোড হচ্ছে...
          </p>
        </div>
      </div>
    );
  }

  // 3. Login Screen (Not signed in or non-admin signed in)
  if (!user || !isAdmin) {
    return (
      <LoginView
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        unauthorizedEmail={user && !isAdmin ? user.email || user.uid : null}
        authError={authError}
        loading={authLoading}
      />
    );
  }

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSelectedParty(null);
    setActiveInvoiceId(null);
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-[#F6F7F5] pb-24 md:pb-12">
      {/* Desktop & Mobile Top Navigation Bar (Strict 3-zone contract) */}
      <header className="no-print sticky top-0 z-30 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 min-h-16 py-2 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Logo (120px width) */}
          <button
            type="button"
            onClick={() => switchTab('dashboard')}
            aria-label="এমএস ফ্যাশন"
            className="flex items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black rounded-lg"
          >
            <img
              src="https://imgur.com/Af1qii8.png"
              alt="এমএস ফ্যাশন"
              referrerPolicy="no-referrer"
              className="w-[120px] h-auto max-h-14 object-contain block"
            />
          </button>

          {/* Zone 2: 5 concise single-line navigation links in black scheme */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold">
            <button
              type="button"
              onClick={() => switchTab('dashboard')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'dashboard' && !selectedParty && !activeInvoiceId
                  ? 'text-black underline underline-offset-8 decoration-2 decoration-black'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              ড্যাশবোর্ড
            </button>
            <button
              type="button"
              onClick={() => switchTab('suppliers')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'suppliers' || selectedParty?.type === 'supplier'
                  ? 'text-black underline underline-offset-8 decoration-2 decoration-black'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              সাপ্লায়ার খাতা
            </button>
            <button
              type="button"
              onClick={() => switchTab('customers')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'customers' || selectedParty?.type === 'customer'
                  ? 'text-black underline underline-offset-8 decoration-2 decoration-black'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              কাস্টমার ও ইনভয়েস
            </button>
            <button
              type="button"
              onClick={() => switchTab('home_expenses')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'home_expenses'
                  ? 'text-black underline underline-offset-8 decoration-2 decoration-black'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              বাসার খরচ
            </button>
            <button
              type="button"
              onClick={() => switchTab('persons')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'persons'
                  ? 'text-black underline underline-offset-8 decoration-2 decoration-black'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              মামা ও স্টাফ হিসাব
            </button>
          </nav>

          {/* Zone 3: Primary Action + Sign Out in black scheme */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openNewEntryModal('customer_sale')}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 md:px-4 py-2 bg-black hover:bg-neutral-800 text-white text-xs md:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              নতুন হিসাব
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="লগআউট"
              title="লগআউট"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-black hover:text-[#B91C1C] hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {activeInvoiceRecord ? (
          <InvoiceView
            invoice={activeInvoiceRecord}
            onBack={() => setActiveInvoiceId(null)}
            onCopySuccess={(msg) => showToast(msg)}
          />
        ) : activePartyObj && activePartyComputedLedger && selectedParty ? (
          <PartyProfileView
            partyId={activePartyObj.id}
            partyType={selectedParty.type}
            name={activePartyObj.name}
            phone={activePartyObj.phone}
            address={activePartyObj.address}
            totalBilled={activePartyComputedLedger.totalBilled}
            totalPaid={activePartyComputedLedger.totalPaid}
            currentDue={activePartyComputedLedger.currentDue}
            entries={activePartyComputedLedger.entries}
            transactionsById={transactionsById}
            onBack={() => setSelectedParty(null)}
            onAddEntry={(type, partyId) => openNewEntryModal(type, partyId)}
            onEditEntry={(txId) => {
              const found = transactionsById[txId];
              if (found) openEditEntryModal(found);
            }}
            onDeleteEntry={(txId) => {
              const found = transactionsById[txId];
              if (found) setConfirmDelete({ kind: 'tx', tx: found });
            }}
            onOpenInvoice={(entry: LedgerEntrySnapshot) =>
              setActiveInvoiceId(entry.txId)
            }
            onEditParty={() =>
              setPartyModalState({
                open: true,
                type: selectedParty.type,
                editing: activePartyObj,
              })
            }
            onDeleteParty={() =>
              setConfirmDelete({
                kind: 'party',
                party: activePartyObj,
                type: selectedParty.type,
              })
            }
            onCopySuccess={(msg) => showToast(msg)}
          />
        ) : activeTab === 'home_expenses' ? (
          <HomeExpensesView
            expenses={homeExpenses}
            loading={dataLoading}
            onToast={showToast}
          />
        ) : activeTab === 'persons' ? (
          <PersonsLedgerView
            persons={persons}
            personTransactions={personTransactions}
            loading={dataLoading}
            onToast={showToast}
          />
        ) : activeTab === 'suppliers' ? (
          /* Suppliers Directory */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#111815]">
                  সাপ্লায়ার খাতা ({toBengaliDigits(suppliers.length)})
                </h1>
                <p className="text-sm text-[#4B554E] mt-0.5">
                  মোট সাপ্লায়ার বাকি:{' '}
                  <strong className="font-mono-tabular text-[#B91C1C]">
                    {formatTaka(summary.totalSupplierDue)}
                  </strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setPartyModalState({
                      open: true,
                      type: 'supplier',
                      editing: null,
                    })
                  }
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  নতুন সাপ্লায়ার
                </button>
                <button
                  type="button"
                  onClick={() => openNewEntryModal('supplier_due_add')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  আগের বাকি / টাকা নেওয়া
                </button>
                <button
                  type="button"
                  onClick={() => openNewEntryModal('supplier_payment')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  পেমেন্ট পরিশোধ
                </button>
                <button
                  type="button"
                  onClick={() => openNewEntryModal('supplier_purchase')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  মাল ক্রয় এন্ট্রি
                </button>
              </div>
            </div>

            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-[#4B554E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="সাপ্লায়ারের নাম বা মোবাইল নম্বর খুঁজুন..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-white border border-[#E5E8E3] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
              />
            </div>

            <div className="bg-white border border-[#E5E8E3] rounded-2xl overflow-hidden">
              {dataLoading ? (
                <div className="p-6 space-y-3 animate-pulse">
                  <div className="h-12 bg-[#F2F4F0] rounded-xl" />
                  <div className="h-12 bg-[#F2F4F0] rounded-xl" />
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-[#4B554E]">
                    কোনো সাপ্লায়ার পাওয়া যায়নি।
                  </p>
                  <button
                    type="button"
                    onClick={() => openNewEntryModal('supplier_purchase')}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] rounded-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    প্রথম সাপ্লায়ার ক্রয় যোগ করুন
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#E5E8E3]">
                  {filteredSuppliers.map((sup) => {
                    const lastTxDate = lastTxDateBySupplier[sup.id];
                    const dueDotColor =
                      sup.currentDue > 0
                        ? 'bg-[#DC2626]'
                        : sup.currentDue < 0
                          ? 'bg-[#D97706]'
                          : 'bg-[#16A34A]';
                    const dueStatusLabel =
                      sup.currentDue > 0
                        ? 'বাকি আছে'
                        : sup.currentDue < 0
                          ? 'অগ্রিম দেওয়া'
                          : 'পরিশোধিত';

                    return (
                      <div
                        key={sup.id}
                        className="p-4 md:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F9F7] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedParty({ id: sup.id, type: 'supplier' })
                          }
                          className="text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-[#111815] truncate">
                              {sup.name}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#4B554E] shrink-0" />
                          </div>
                          <div className="text-xs text-[#4B554E] mt-0.5 flex flex-wrap items-center gap-x-2">
                            {sup.phone && (
                              <span className="font-mono-tabular">{sup.phone}</span>
                            )}
                            {sup.phone && sup.address && (
                              <span aria-hidden="true">·</span>
                            )}
                            {sup.address && <span>{sup.address}</span>}
                            {(sup.phone || sup.address) && (
                              <span aria-hidden="true">·</span>
                            )}
                            <span>
                              মোট কেনাকাটা:{' '}
                              <span className="font-mono-tabular">
                                {formatTaka(sup.totalBilled)}
                              </span>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              সর্বশেষ লেনদেন:{' '}
                              <span className="font-medium text-[#111815]">
                                {lastTxDate ? formatDateBn(lastTxDate) : 'নেই'}
                              </span>
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <div className="sm:text-right">
                            <p className="text-[11px] text-[#4B554E] inline-flex items-center sm:justify-end gap-1.5">
                              <span
                                aria-label={dueStatusLabel}
                                title={dueStatusLabel}
                                className={`w-2 h-2 rounded-full shrink-0 ${dueDotColor}`}
                              />
                              বর্তমান বাকি
                            </p>
                            <p
                              className={`text-base font-bold font-mono-tabular ${
                                sup.currentDue > 0
                                  ? 'text-[#B91C1C]'
                                  : 'text-[#15803D]'
                              }`}
                            >
                              {formatTaka(sup.currentDue)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyShareLink('supplier', sup.id)
                              }
                              aria-label="লিংক কপি"
                              title="শেয়ার লিংক কপি করুন"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F2F4F0] hover:bg-[#E5E8E3] text-[#111815] transition-colors cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedParty({ id: sup.id, type: 'supplier' })
                              }
                              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              খাতা দেখুন
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'customers' ? (
          /* Customers & Invoices Directory */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#111815]">
                  কাস্টমার খাতা ও ইনভয়েস
                </h1>
                <p className="text-sm text-[#4B554E] mt-0.5">
                  মোট কাস্টমার পাওনা:{' '}
                  <strong className="font-mono-tabular text-[#0D5C46]">
                    {formatTaka(summary.totalCustomerDue)}
                  </strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setPartyModalState({
                      open: true,
                      type: 'customer',
                      editing: null,
                    })
                  }
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#111815] bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  নতুন কাস্টমার
                </button>
                <button
                  type="button"
                  onClick={() => openNewEntryModal('customer_due_add')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  আগের বাকি যোগ
                </button>
                <button
                  type="button"
                  onClick={() => openNewEntryModal('customer_sale')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  নতুন ইনভয়েস তৈরি
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-[#E8ECE6] rounded-xl self-start">
                <button
                  type="button"
                  onClick={() => setCustomerSubTab('customers')}
                  className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    customerSubTab === 'customers'
                      ? 'bg-white text-[#111815] shadow-xs'
                      : 'text-[#4B554E] hover:text-[#111815]'
                  }`}
                >
                  কাস্টমার তালিকা ({toBengaliDigits(customers.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerSubTab('invoices')}
                  className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    customerSubTab === 'invoices'
                      ? 'bg-white text-[#111815] shadow-xs'
                      : 'text-[#4B554E] hover:text-[#111815]'
                  }`}
                >
                  সব ইনভয়েস (
                  {toBengaliDigits(
                    transactions.filter((t) => t.type === 'customer_sale')
                      .length,
                  )}
                  )
                </button>
              </div>

              <div className="relative w-full sm:max-w-xs">
                <Search className="w-4 h-4 text-[#4B554E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="নাম, মোবাইল বা ইনভয়েস নং..."
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-white border border-[#E5E8E3] rounded-xl text-sm focus:outline-none focus:border-[#0D5C46]"
                />
              </div>
            </div>

            {customerSubTab === 'customers' ? (
              <div className="bg-white border border-[#E5E8E3] rounded-2xl overflow-hidden">
                {dataLoading ? (
                  <div className="p-6 space-y-3 animate-pulse">
                    <div className="h-12 bg-[#F2F4F0] rounded-xl" />
                    <div className="h-12 bg-[#F2F4F0] rounded-xl" />
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm text-[#4B554E]">
                      কোনো কাস্টমার পাওয়া যায়নি।
                    </p>
                    <button
                      type="button"
                      onClick={() => openNewEntryModal('customer_sale')}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D5C46] rounded-xl cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      প্রথম বিক্রি / ইনভয়েস তৈরি করুন
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E8E3]">
                    {filteredCustomers.map((cust) => (
                      <div
                        key={cust.id}
                        className="p-4 md:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F9F7] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedParty({ id: cust.id, type: 'customer' })
                          }
                          className="text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-[#111815] truncate">
                              {cust.name}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#4B554E] shrink-0" />
                          </div>
                          <div className="text-xs text-[#4B554E] mt-0.5 flex flex-wrap items-center gap-x-2">
                            {cust.phone && (
                              <span className="font-mono-tabular">
                                {cust.phone}
                              </span>
                            )}
                            {cust.phone && cust.address && (
                              <span aria-hidden="true">·</span>
                            )}
                            {cust.address && <span>{cust.address}</span>}
                            <span>·</span>
                            <span>
                              মোট বিক্রি:{' '}
                              <span className="font-mono-tabular">
                                {formatTaka(cust.totalBilled)}
                              </span>
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <div className="sm:text-right">
                            <p className="text-[11px] text-[#4B554E]">
                              বর্তমান পাওনা
                            </p>
                            <p
                              className={`text-base font-bold font-mono-tabular ${
                                cust.currentDue > 0
                                  ? 'text-[#B91C1C]'
                                  : 'text-[#15803D]'
                              }`}
                            >
                              {formatTaka(cust.currentDue)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyShareLink('customer', cust.id)
                              }
                              aria-label="লিংক কপি"
                              title="কাস্টমার হিসাবের লিংক কপি করুন"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F2F4F0] hover:bg-[#E5E8E3] text-[#111815] transition-colors cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedParty({
                                  id: cust.id,
                                  type: 'customer',
                                })
                              }
                              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              খাতা দেখুন
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#E5E8E3] rounded-2xl overflow-hidden">
                {filteredInvoices.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[#4B554E]">
                    কোনো ইনভয়েস পাওয়া যায়নি।
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E8E3]">
                    {filteredInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-4 md:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F9F7] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#4B554E]">
                            <span className="font-mono-tabular font-semibold text-[#0D5C46]">
                              {inv.invoiceNo}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDateBn(inv.date)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{toBengaliDigits(inv.items.length)} টি আইটেম</span>
                          </div>
                          <p className="font-bold text-base text-[#111815] mt-0.5">
                            {inv.partyName}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <div className="sm:text-right text-xs">
                            <p className="font-bold text-sm font-mono-tabular text-[#111815]">
                              মোট: {formatTaka(inv.totalAmount)}
                            </p>
                            <p
                              className={`font-mono-tabular ${
                                inv.dueAmount > 0
                                  ? 'text-[#B91C1C]'
                                  : 'text-[#15803D]'
                              }`}
                            >
                              বাকি: {formatTaka(inv.dueAmount)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyShareLink('invoice', inv.id)
                              }
                              aria-label="ইনভয়েস লিংক কপি"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F2F4F0] hover:bg-[#E5E8E3] text-[#111815] cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveInvoiceId(inv.id)}
                              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              ইনভয়েস দেখুন
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Main Dashboard View */
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[#111815] tracking-tight">
                  ড্যাশবোর্ড ও সারসংক্ষেপ
                </h1>
                <p className="text-sm text-[#4B554E] mt-1">
                  এমএস ফ্যাশন ব্যবসা, বাসার খরচ এবং মামা ও মডারেটরের দৈনিক হিসাব
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNewEntryModal('customer_sale')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-[#0D5C46] hover:bg-[#094534] text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  নতুন হিসাব যোগ করুন
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('suppliers')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] text-[#111815] text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 text-[#0D5C46]" />
                  সাপ্লায়ার খাতা
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('customers')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] text-[#111815] text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[#0D5C46]" />
                  কাস্টমার ও ইনভয়েস
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('home_expenses')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] text-[#111815] text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Home className="w-4 h-4 text-[#0D5C46]" />
                  বাসার খরচ
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('persons')}
                  className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E8E3] hover:bg-[#F2F4F0] text-[#111815] text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-[#0D5C46]" />
                  মামা ও হিমেল
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMonthlyReportPdf}
                  disabled={pdfExporting || dataLoading}
                  className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2.5 bg-[#111815] hover:bg-[#1E293B] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {pdfExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  {pdfExporting ? 'তৈরি হচ্ছে...' : 'মাসিক রিপোর্ট PDF'}
                </button>
              </div>
            </div>

            {/* 4 Business KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
                <p className="text-xs font-semibold text-[#4B554E]">
                  মোট সাপ্লায়ার বাকি
                </p>
                <p className="text-2xl font-bold font-mono-tabular text-[#B91C1C] mt-2">
                  {formatTaka(summary.totalSupplierDue)}
                </p>
                <p className="text-xs text-[#4B554E] mt-1.5">
                  সাপ্লায়ারদের পরিশোধযোগ্য দেনা ·{' '}
                  {toBengaliDigits(suppliers.length)} জন
                </p>
              </div>

              <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
                <p className="text-xs font-semibold text-[#4B554E]">
                  মোট কাস্টমার পাওনা
                </p>
                <p className="text-2xl font-bold font-mono-tabular text-[#0D5C46] mt-2">
                  {formatTaka(summary.totalCustomerDue)}
                </p>
                <p className="text-xs text-[#4B554E] mt-1.5">
                  কাস্টমারদের কাছ থেকে আদায়যোগ্য ·{' '}
                  {toBengaliDigits(customers.length)} জন
                </p>
              </div>

              <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
                <p className="text-xs font-semibold text-[#4B554E]">
                  মোট কেনাকাটা
                </p>
                <p className="text-2xl font-bold font-mono-tabular text-[#111815] mt-2">
                  {formatTaka(summary.totalPurchases)}
                </p>
                <p className="text-xs text-[#4B554E] mt-1.5">
                  সাপ্লায়ার থেকে মোট ক্রয়কৃত পণ্য
                </p>
              </div>

              <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5">
                <p className="text-xs font-semibold text-[#4B554E]">
                  মোট বিক্রি
                </p>
                <p className="text-2xl font-bold font-mono-tabular text-[#15803D] mt-2">
                  {formatTaka(summary.totalSales)}
                </p>
                <p className="text-xs text-[#4B554E] mt-1.5">
                  কাস্টমারদের কাছে মোট বিক্রয় মূল্য
                </p>
              </div>
            </div>

            {/* Monthly Purchases vs Sales Bar Chart */}
            <MonthlyProgressChart transactions={transactions} loading={dataLoading} />

            {/* Secondary Strip: Home Expense & Staff/Mama Quick Access */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => switchTab('home_expenses')}
                className="text-left bg-white border border-[#E5E8E3] hover:border-[#0D5C46]/50 rounded-2xl p-5 flex items-center justify-between gap-4 transition-colors cursor-pointer"
              >
                <div>
                  <p className="text-xs font-semibold text-[#4B554E]">
                    বাসার খরচ ({formatMonthBn(summary.currentMonth)})
                  </p>
                  <p className="text-xl font-bold font-mono-tabular text-[#111815] mt-1">
                    {formatTaka(summary.monthlyHomeExpense)}
                  </p>
                  <p className="text-xs text-[#4B554E] mt-1">
                    আমি ও মাইনু মামা — বাজার ও মাসিক খরচের তালিকা দেখুন
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#0D5C46] whitespace-nowrap shrink-0">
                  খাতা দেখুন →
                </span>
              </button>

              <button
                type="button"
                onClick={() => switchTab('persons')}
                className="text-left bg-white border border-[#E5E8E3] hover:border-[#0D5C46]/50 rounded-2xl p-5 flex items-center justify-between gap-4 transition-colors cursor-pointer"
              >
                <div>
                  <p className="text-xs font-semibold text-[#4B554E]">
                    মাইনু মামা, হিমেল ও ব্যক্তিগত হিসাব
                  </p>
                  <p className="text-xl font-bold font-mono-tabular text-[#111815] mt-1">
                    বাকি প্রাপ্য: {formatTaka(summary.staffBalanceDue)}
                  </p>
                  <p className="text-xs text-[#4B554E] mt-1">
                    টাকা দেওয়া, মডারেটর প্রাপ্য ও নতুন ব্যক্তি যোগ করুন
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#0D5C46] whitespace-nowrap shrink-0">
                  হিসাব দেখুন →
                </span>
              </button>
            </div>

            {/* Recent Business Transactions Section */}
            <div className="bg-white border border-[#E5E8E3] rounded-2xl p-5 md:p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-[#111815]">
                  সাম্প্রতিক ব্যবসায়িক লেনদেন (
                  {toBengaliDigits(filteredTransactions.length)})
                </h2>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-1 p-1 bg-[#F2F4F0] rounded-xl overflow-x-auto">
                    {(
                      [
                        { id: 'all', label: 'সব' },
                        { id: 'customer_sale', label: 'বিক্রি' },
                        { id: 'customer_due_add', label: 'কাস্টমার বাকি' },
                        { id: 'customer_payment', label: 'আদায়' },
                        { id: 'supplier_purchase', label: 'মাল ক্রয়' },
                        { id: 'supplier_due_add', label: 'সাপ্লায়ার বাকি' },
                        { id: 'supplier_payment', label: 'পরিশোধ' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTxTypeFilter(f.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          txTypeFilter === f.id
                            ? 'bg-white text-[#111815] shadow-xs'
                            : 'text-[#4B554E] hover:text-[#111815]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative sm:w-64">
                    <Search className="w-4 h-4 text-[#4B554E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="নাম, পণ্য বা ইনভয়েস খুঁজুন..."
                      className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-[#F8F9F7] border border-[#E5E8E3] rounded-xl text-xs md:text-sm focus:outline-none focus:border-[#0D5C46]"
                    />
                  </div>
                </div>
              </div>

              {dataLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-12 bg-[#F2F4F0] rounded-xl" />
                  <div className="h-12 bg-[#F2F4F0] rounded-xl" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-[#D4DAD2] rounded-xl">
                  <p className="text-sm font-medium text-[#4B554E]">
                    কোনো লেনদেন পাওয়া যায়নি। নতুন হিসাব যোগ করে শুরু করুন।
                  </p>
                  <button
                    type="button"
                    onClick={() => openNewEntryModal('customer_sale')}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D5C46] hover:bg-[#094534] rounded-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    প্রথম হিসাব যোগ করুন
                  </button>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E5E8E3] text-xs font-semibold text-[#4B554E]">
                          <th className="py-3 pr-3">তারিখ ও নং</th>
                          <th className="py-3 pr-3">নাম ও ধরন</th>
                          <th className="py-3 pr-3">বিবরণ</th>
                          <th className="py-3 px-3 text-right">মোট বিল</th>
                          <th className="py-3 px-3 text-right">জমা / পরিশোধ</th>
                          <th className="py-3 px-3 text-right">বাকি</th>
                          <th className="py-3 pl-3 text-right">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E8E3] text-sm">
                        {filteredTransactions.slice(0, 60).map((tx) => {
                          const isSupplierTx =
                            tx.type === 'supplier_purchase' ||
                            tx.type === 'supplier_payment' ||
                            tx.type === 'supplier_due_add';
                          const isBill =
                            tx.type === 'customer_sale' ||
                            tx.type === 'supplier_purchase';
                          const isCashDueAdd =
                            tx.type === 'supplier_due_add' ||
                            tx.type === 'customer_due_add';

                          return (
                            <tr
                              key={tx.id}
                              className="hover:bg-[#F8F9F7] transition-colors"
                            >
                              <td className="py-3.5 pr-3 whitespace-nowrap align-top">
                                <div className="font-medium text-[#111815]">
                                  {formatDateBn(tx.date)}
                                </div>
                                <div className="text-xs font-mono-tabular text-[#4B554E] mt-0.5">
                                  {tx.invoiceNo}
                                </div>
                              </td>
                              <td className="py-3.5 pr-3 align-top">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedParty({
                                      id: tx.partyId,
                                      type: isSupplierTx
                                        ? 'supplier'
                                        : 'customer',
                                    })
                                  }
                                  className="font-bold text-[#111815] hover:text-[#0D5C46] hover:underline text-left cursor-pointer"
                                >
                                  {tx.partyName}
                                </button>
                                <div className="text-xs text-[#4B554E] mt-0.5">
                                  {getTransactionTypeLabel(tx.type)}
                                </div>
                              </td>
                              <td className="py-3.5 pr-3 text-xs text-[#4B554E] max-w-xs align-top">
                                {isBill && tx.items.length > 0 ? (
                                  <span>
                                    {tx.items
                                      .map(
                                        (it) =>
                                          `${it.name} (${toBengaliDigits(it.qty)} পিস)`,
                                      )
                                      .join(', ')}
                                  </span>
                                ) : (
                                  <span>
                                    {tx.paymentMethod}
                                    {tx.note ? ` · ${tx.note}` : ''}
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-[#111815] whitespace-nowrap align-top">
                                {isBill || isCashDueAdd
                                  ? formatTaka(tx.totalAmount)
                                  : '—'}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-[#15803D] whitespace-nowrap align-top">
                                {isCashDueAdd ? '—' : formatTaka(tx.paidAmount)}
                              </td>
                              <td
                                className={`py-3.5 px-3 text-right font-mono-tabular font-bold whitespace-nowrap align-top ${
                                  tx.dueAmount > 0
                                    ? 'text-[#B91C1C]'
                                    : 'text-[#15803D]'
                                }`}
                              >
                                {isBill || isCashDueAdd
                                  ? formatTaka(tx.dueAmount)
                                  : '—'}
                              </td>
                              <td className="py-3.5 pl-3 text-right whitespace-nowrap align-top">
                                <div className="inline-flex items-center gap-1">
                                  {isBill && (
                                    <button
                                      type="button"
                                      onClick={() => setActiveInvoiceId(tx.id)}
                                      className="px-2.5 py-1.5 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 hover:bg-[#0D5C46]/15 rounded-lg transition-colors cursor-pointer"
                                    >
                                      ইনভয়েস
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openEditEntryModal(tx)}
                                    aria-label="সম্পাদনা"
                                    className="p-2 text-[#4B554E] hover:text-[#111815] rounded-lg hover:bg-[#E5E8E3]/60 transition-colors cursor-pointer"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmDelete({ kind: 'tx', tx })
                                    }
                                    aria-label="মুছুন"
                                    className="p-2 text-[#B91C1C] rounded-lg hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-[#E5E8E3]">
                    {filteredTransactions.slice(0, 60).map((tx) => {
                      const isSupplierTx =
                        tx.type === 'supplier_purchase' ||
                        tx.type === 'supplier_payment' ||
                        tx.type === 'supplier_due_add';
                      const isBill =
                        tx.type === 'customer_sale' ||
                        tx.type === 'supplier_purchase';
                      const isCashDueAdd =
                        tx.type === 'supplier_due_add' ||
                        tx.type === 'customer_due_add';
                      return (
                        <div key={tx.id} className="py-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs text-[#4B554E]">
                                {formatDateBn(tx.date)} ·{' '}
                                <span className="font-mono-tabular">
                                  {tx.invoiceNo}
                                </span>
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedParty({
                                    id: tx.partyId,
                                    type: isSupplierTx
                                      ? 'supplier'
                                      : 'customer',
                                  })
                                }
                                className="text-base font-bold text-[#111815] hover:text-[#0D5C46] text-left mt-0.5 cursor-pointer"
                              >
                                {tx.partyName}
                              </button>
                              <p className="text-xs text-[#4B554E]">
                                {getTransactionTypeLabel(tx.type)}
                              </p>
                            </div>
                            <div className="text-right">
                              {isBill || isCashDueAdd ? (
                                <>
                                  <p className="text-sm font-bold font-mono-tabular text-[#111815]">
                                    {formatTaka(tx.totalAmount)}
                                  </p>
                                  <p
                                    className={`text-xs font-mono-tabular font-semibold ${
                                      tx.dueAmount > 0
                                        ? 'text-[#B91C1C]'
                                        : 'text-[#15803D]'
                                    }`}
                                  >
                                    বাকি: {formatTaka(tx.dueAmount)}
                                  </p>
                                </>
                              ) : (
                                <p className="text-sm font-bold font-mono-tabular text-[#15803D]">
                                  {formatTaka(tx.paidAmount)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-xs text-[#4B554E] truncate">
                              {isBill && tx.items.length > 0
                                ? tx.items
                                    .map(
                                      (it) =>
                                        `${it.name} (${toBengaliDigits(it.qty)})`,
                                    )
                                    .join(', ')
                                : `${tx.paymentMethod}${tx.note ? ` · ${tx.note}` : ''}`}
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isBill && (
                                <button
                                  type="button"
                                  onClick={() => setActiveInvoiceId(tx.id)}
                                  className="min-h-[36px] px-3 py-1 text-xs font-semibold text-[#0D5C46] bg-[#0D5C46]/10 rounded-lg cursor-pointer"
                                >
                                  ইনভয়েস
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditEntryModal(tx)}
                                aria-label="সম্পাদনা"
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#4B554E] bg-[#F2F4F0] rounded-lg cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDelete({ kind: 'tx', tx })
                                }
                                aria-label="মুছুন"
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#B91C1C] bg-[#FEF2F2] rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (5 thumb-zone destinations, <=15% viewport height) */}
      <nav className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E8E3]">
        <div className="grid grid-cols-5 h-16 items-center">
          <button
            type="button"
            onClick={() => switchTab('dashboard')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer ${
              activeTab === 'dashboard' && !selectedParty && !activeInvoiceId
                ? 'text-[#0D5C46]'
                : 'text-[#4B554E]'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1">ড্যাশবোর্ড</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('suppliers')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer ${
              activeTab === 'suppliers' || selectedParty?.type === 'supplier'
                ? 'text-[#0D5C46]'
                : 'text-[#4B554E]'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1">সাপ্লায়ার</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('customers')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer ${
              activeTab === 'customers' || selectedParty?.type === 'customer'
                ? 'text-[#0D5C46]'
                : 'text-[#4B554E]'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1">কাস্টমার</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('home_expenses')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer ${
              activeTab === 'home_expenses'
                ? 'text-[#0D5C46]'
                : 'text-[#4B554E]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1">বাসা</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('persons')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer ${
              activeTab === 'persons' ? 'text-[#0D5C46]' : 'text-[#4B554E]'
            }`}
          >
            <UserCheck className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1">মামা/স্টাফ</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <EntryFormModal
        open={entryModalOpen}
        onClose={() => {
          setEntryModalOpen(false);
          setEditingTx(null);
        }}
        suppliers={suppliers}
        customers={customers}
        transactions={transactions}
        initialType={entryModalType}
        initialPartyId={entryModalPartyId}
        editingTransaction={editingTx}
        onSaved={(msg) => showToast(msg)}
        onError={(msg) => showToast(msg, 'error')}
      />

      <PartyModal
        open={partyModalState.open}
        partyType={partyModalState.type}
        editingParty={partyModalState.editing}
        partyTransactions={
          partyModalState.editing
            ? transactions.filter(
                (t) => t.partyId === partyModalState.editing!.id,
              )
            : []
        }
        onClose={() =>
          setPartyModalState({ open: false, type: 'customer', editing: null })
        }
        onSaved={(msg, id) => {
          showToast(msg);
          if (!partyModalState.editing) {
            setSelectedParty({ id, type: partyModalState.type });
          }
        }}
        onError={(msg) => showToast(msg, 'error')}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === 'party'
            ? 'খাতা স্থায়ীভাবে মুছে ফেলবেন?'
            : 'হিসাবটি মুছে ফেলবেন?'
        }
        description={
          confirmDelete?.kind === 'party'
            ? `"${confirmDelete.party.name}"-এর প্রোফাইল ও এর সাথে যুক্ত সব লেনদেনের হিসাব স্থায়ীভাবে মুছে যাবে।`
            : 'এই লেনদেনটি মুছে ফেললে সংশ্লিষ্ট কাস্টমার বা সাপ্লায়ারের বর্তমান বাকি স্বয়ংক্রিয়ভাবে পুনরায় হিসাব হবে।'
        }
        confirmLabel="হ্যাঁ, মুছে ফেলুন"
        loading={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BookkeepingApp />
    </ErrorBoundary>
  );
}
