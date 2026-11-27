import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  HomeExpenseRecord,
  PersonTransactionRecord,
  TransactionRecord,
} from '../types/bookkeeping';
import {
  formatDateBn,
  formatMonthBn,
  formatTaka,
  getTodayIsoDate,
  toBengaliDigits,
} from './formatters';

export interface MonthlySummaryReportInput {
  monthKey: string;
  transactions: TransactionRecord[];
  homeExpenses: HomeExpenseRecord[];
  personTransactions: PersonTransactionRecord[];
  totalCustomerDue: number;
  totalSupplierDue: number;
  staffBalanceDue: number;
}

function escapeHtml(value: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const REPORT_WIDTH_PX = 794; // A4 width at 96 DPI

function buildBaseWrapperStyle(): string {
  return [
    `width: ${REPORT_WIDTH_PX}px`,
    `background: #FFFFFF`,
    `color: #111815`,
    `font-family: 'Hind Siliguri', 'Plus Jakarta Sans', sans-serif`,
    `padding: 28px 34px`,
    `box-sizing: border-box`,
  ].join(';');
}

async function renderBlockToCanvas(html: string): Promise<HTMLCanvasElement> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.style.pointerEvents = 'none';
  container.style.width = `${REPORT_WIDTH_PX}px`;
  container.style.background = '#FFFFFF';
  container.innerHTML = `<div style="${buildBaseWrapperStyle()}">${html}</div>`;
  document.body.appendChild(container);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const target = container.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false,
      windowWidth: REPORT_WIDTH_PX,
    });
    return canvas;
  } finally {
    container.remove();
  }
}

export async function generateMonthlySummaryPdf(
  input: MonthlySummaryReportInput,
): Promise<string> {
  const {
    monthKey,
    transactions,
    homeExpenses,
    personTransactions,
    totalCustomerDue,
    totalSupplierDue,
    staffBalanceDue,
  } = input;

  const monthTitle = formatMonthBn(monthKey);
  const generatedDateBn = formatDateBn(getTodayIsoDate());

  const monthTransactions = transactions
    .filter((tx) => tx.date?.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  const salesTxs = monthTransactions.filter((tx) => tx.type === 'customer_sale');
  const customerPayments = monthTransactions.filter(
    (tx) => tx.type === 'customer_payment',
  );
  const purchaseTxs = monthTransactions.filter(
    (tx) => tx.type === 'supplier_purchase',
  );
  const supplierPayments = monthTransactions.filter(
    (tx) => tx.type === 'supplier_payment',
  );

  const monthlyHomeExpenses = homeExpenses
    .filter(
      (h) => h.monthKey === monthKey || (!h.monthKey && h.date?.startsWith(monthKey)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthlyPersonGiven = personTransactions
    .filter((p) => p.type === 'payment_given' && p.date?.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalMonthlySales = salesTxs.reduce(
    (sum, tx) => sum + (tx.totalAmount || 0),
    0,
  );
  const salesPaid = salesTxs.reduce((sum, tx) => sum + (tx.paidAmount || 0), 0);
  const customerCollectedExtra = customerPayments.reduce(
    (sum, tx) => sum + (tx.paidAmount || 0),
    0,
  );
  const totalSalesCollected = salesPaid + customerCollectedExtra;

  const totalMonthlyPurchases = purchaseTxs.reduce(
    (sum, tx) => sum + (tx.totalAmount || 0),
    0,
  );
  const purchasesPaid = purchaseTxs.reduce(
    (sum, tx) => sum + (tx.paidAmount || 0),
    0,
  );
  const supplierPaidExtra = supplierPayments.reduce(
    (sum, tx) => sum + (tx.paidAmount || 0),
    0,
  );
  const totalSupplierCashOut = purchasesPaid + supplierPaidExtra;

  const totalHomeExpense = monthlyHomeExpenses.reduce(
    (sum, h) => sum + (h.totalAmount || 0),
    0,
  );
  const totalPersonExpense = monthlyPersonGiven.reduce(
    (sum, p) => sum + (p.amount || 0),
    0,
  );
  const totalMonthlyExpenses = totalHomeExpense + totalPersonExpense;

  const netMonthlyBalance =
    totalMonthlySales - totalMonthlyPurchases - totalMonthlyExpenses;

  const blocksHtml: string[] = [];

  // Block 1: Header + Executive Monthly Summary + Cashflow + Current Dues
  blocksHtml.push(`
    <div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111815;padding-bottom:16px;margin-bottom:18px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:#0D5C46;color:#FFFFFF;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">MS</div>
            <div>
              <div style="font-size:20px;font-weight:700;color:#111815;line-height:1.2;">এমএস ফ্যাশন (MS Fashion)</div>
              <div style="font-size:12px;color:#4B554E;margin-top:2px;">মাসিক ব্যবসার সারসংক্ষেপ রিপোর্ট</div>
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="display:inline-block;background:#ECFDF5;border:1px solid #A7F3D0;color:#0D5C46;font-size:12px;font-weight:700;padding:4px 12px;border-radius:8px;">
            মাস: ${escapeHtml(monthTitle)}
          </div>
          <div style="font-size:11px;color:#4B554E;margin-top:6px;">
            তৈরির তারিখ: ${escapeHtml(generatedDateBn)}
          </div>
        </div>
      </div>

      <div style="font-size:14px;font-weight:700;color:#111815;margin-bottom:10px;">
        চলতি মাসের মূল সারসংক্ষেপ (${escapeHtml(monthTitle)})
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;">
        <div style="background:#F8F9F7;border:1px solid #E5E8E3;border-radius:10px;padding:12px;">
          <div style="font-size:11px;font-weight:600;color:#4B554E;">মোট বিক্রি</div>
          <div style="font-size:17px;font-weight:700;color:#0D5C46;margin-top:4px;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalMonthlySales))}</div>
          <div style="font-size:10px;color:#4B554E;margin-top:4px;">${toBengaliDigits(salesTxs.length)}টি ইনভয়েস</div>
        </div>

        <div style="background:#F8F9F7;border:1px solid #E5E8E3;border-radius:10px;padding:12px;">
          <div style="font-size:11px;font-weight:600;color:#4B554E;">মোট কেনাকাটা</div>
          <div style="font-size:17px;font-weight:700;color:#111815;margin-top:4px;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalMonthlyPurchases))}</div>
          <div style="font-size:10px;color:#4B554E;margin-top:4px;">${toBengaliDigits(purchaseTxs.length)}টি ক্রয় চালান</div>
        </div>

        <div style="background:#F8F9F7;border:1px solid #E5E8E3;border-radius:10px;padding:12px;">
          <div style="font-size:11px;font-weight:600;color:#4B554E;">মোট মাসিক খরচ</div>
          <div style="font-size:17px;font-weight:700;color:#B45309;margin-top:4px;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalMonthlyExpenses))}</div>
          <div style="font-size:10px;color:#4B554E;margin-top:4px;">বাসা + মামা/মডারেটর</div>
        </div>

        <div style="background:#F8F9F7;border:1px solid #E5E8E3;border-radius:10px;padding:12px;">
          <div style="font-size:11px;font-weight:600;color:#4B554E;">নিট মাসিক পার্থক্য</div>
          <div style="font-size:17px;font-weight:700;color:${netMonthlyBalance >= 0 ? '#15803D' : '#B91C1C'};margin-top:4px;font-family:'JetBrains Mono',monospace;">${netMonthlyBalance > 0 ? '+' : ''}${escapeHtml(formatTaka(netMonthlyBalance))}</div>
          <div style="font-size:10px;color:#4B554E;margin-top:4px;">বিক্রি - (ক্রয় + খরচ)</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px;">
        <div style="border:1px solid #E5E8E3;border-radius:10px;padding:12px 14px;">
          <div style="font-size:12px;font-weight:700;color:#111815;margin-bottom:8px;border-bottom:1px solid #F2F4F0;padding-bottom:6px;">
            চলতি মাসের নগদ লেনদেন ও খরচের বিবরণ
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;">
            <span style="color:#4B554E;">কাস্টমার থেকে মোট আদায় (বিক্রি + বকেয়া আদায়)</span>
            <span style="font-weight:700;color:#15803D;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalSalesCollected))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;">
            <span style="color:#4B554E;">সাপ্লায়ারকে মোট পরিশোধ (ক্রয় + বকেয়া শোধ)</span>
            <span style="font-weight:700;color:#111815;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalSupplierCashOut))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;">
            <span style="color:#4B554E;">বাসার খরচ (${toBengaliDigits(monthlyHomeExpenses.length)}টি এন্ট্রি)</span>
            <span style="font-weight:700;color:#B45309;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalHomeExpense))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;">
            <span style="color:#4B554E;">মামা, মডারেটর ও ব্যক্তিগত প্রদান (${toBengaliDigits(monthlyPersonGiven.length)}টি)</span>
            <span style="font-weight:700;color:#B45309;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalPersonExpense))}</span>
          </div>
        </div>

        <div style="border:1px solid #E5E8E3;border-radius:10px;padding:12px 14px;">
          <div style="font-size:12px;font-weight:700;color:#111815;margin-bottom:8px;border-bottom:1px solid #F2F4F0;padding-bottom:6px;">
            সর্বমোট বর্তমান বকেয়া অবস্থা (আজ পর্যন্ত)
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:4px 0;">
            <span style="color:#4B554E;">মোট কাস্টমার পাওনা</span>
            <span style="font-weight:700;color:#0D5C46;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalCustomerDue))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:4px 0;">
            <span style="color:#4B554E;">মোট সাপ্লায়ার বাকি</span>
            <span style="font-weight:700;color:#B91C1C;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(totalSupplierDue))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:4px 0;">
            <span style="color:#4B554E;">মামা / স্টাফ / ব্যক্তিগত বাকি প্রাপ্য</span>
            <span style="font-weight:700;color:#111815;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(staffBalanceDue))}</span>
          </div>
        </div>
      </div>
    </div>
  `);

  // Block 2+: Sales table chunks
  const salesChunks = chunkArray(salesTxs, 14);
  if (salesChunks.length === 0) {
    blocksHtml.push(`
      <div>
        <div style="font-size:13px;font-weight:700;color:#111815;margin-bottom:8px;">
          ১. চলতি মাসের বিক্রি তালিকা (${escapeHtml(monthTitle)})
        </div>
        <div style="border:1px dashed #D4DAD2;border-radius:10px;padding:14px;font-size:11.5px;color:#4B554E;text-align:center;">
          এই মাসে এখনো কোনো বিক্রি রেকর্ড হয়নি।
        </div>
      </div>
    `);
  } else {
    salesChunks.forEach((chunk, idx) => {
      const rows = chunk
        .map(
          (tx) => `
          <tr style="border-bottom:1px solid #EEF0EC;">
            <td style="padding:7px 8px;color:#37413B;white-space:nowrap;">${escapeHtml(formatDateBn(tx.date))}</td>
            <td style="padding:7px 8px;color:#4B554E;font-family:'JetBrains Mono',monospace;">${escapeHtml(tx.invoiceNo || '-')}</td>
            <td style="padding:7px 8px;font-weight:600;color:#111815;">${escapeHtml(tx.partyName)}</td>
            <td style="padding:7px 8px;text-align:right;font-weight:700;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(tx.totalAmount))}</td>
            <td style="padding:7px 8px;text-align:right;color:#15803D;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(tx.paidAmount))}</td>
            <td style="padding:7px 8px;text-align:right;color:${tx.dueAmount > 0 ? '#B91C1C' : '#4B554E'};font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(tx.dueAmount))}</td>
          </tr>
        `,
        )
        .join('');

      blocksHtml.push(`
        <div>
          <div style="font-size:13px;font-weight:700;color:#111815;margin-bottom:8px;">
            ১. চলতি মাসের বিক্রি তালিকা${salesChunks.length > 1 ? ` (অংশ ${toBengaliDigits(idx + 1)})` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #E5E8E3;">
            <thead>
              <tr style="background:#F2F4F0;color:#37413B;border-bottom:1px solid #D4DAD2;">
                <th style="padding:7px 8px;text-align:left;">তারিখ</th>
                <th style="padding:7px 8px;text-align:left;">ইনভয়েস নং</th>
                <th style="padding:7px 8px;text-align:left;">কাস্টমার</th>
                <th style="padding:7px 8px;text-align:right;">মোট বিল</th>
                <th style="padding:7px 8px;text-align:right;">জমা</th>
                <th style="padding:7px 8px;text-align:right;">বাকি</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);
    });
  }

  // Block 3+: Purchases table chunks
  const purchaseChunks = chunkArray(purchaseTxs, 14);
  if (purchaseChunks.length === 0) {
    blocksHtml.push(`
      <div>
        <div style="font-size:13px;font-weight:700;color:#111815;margin-bottom:8px;">
          ২. চলতি মাসের কেনাকাটা তালিকা (${escapeHtml(monthTitle)})
        </div>
        <div style="border:1px dashed #D4DAD2;border-radius:10px;padding:14px;font-size:11.5px;color:#4B554E;text-align:center;">
          এই মাসে এখনো কোনো মাল ক্রয় রেকর্ড হয়নি।
        </div>
      </div>
    `);
  } else {
    purchaseChunks.forEach((chunk, idx) => {
      const rows = chunk
        .map(
          (tx) => `
          <tr style="border-bottom:1px solid #EEF0EC;">
            <td style="padding:7px 8px;color:#37413B;white-space:nowrap;">${escapeHtml(formatDateBn(tx.date))}</td>
            <td style="padding:7px 8px;color:#4B554E;font-family:'JetBrains Mono',monospace;">${escapeHtml(tx.invoiceNo || '-')}</td>
            <td style="padding:7px 8px;font-weight:600;color:#111815;">${escapeHtml(tx.partyName)}</td>
            <td style="padding:7px 8px;text-align:right;font-weight:700;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(tx.totalAmount))}</td>
            <td style="padding:7px 8px;text-align:right;color:#15803D;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(tx.paidAmount))}</td>
            <td style="padding:7px 8px;text-align:right;color:${tx.dueAmount > 0 ? '#B91C1C' : '#4B554E'};font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(tx.dueAmount))}</td>
          </tr>
        `,
        )
        .join('');

      blocksHtml.push(`
        <div>
          <div style="font-size:13px;font-weight:700;color:#111815;margin-bottom:8px;">
            ২. চলতি মাসের কেনাকাটা তালিকা${purchaseChunks.length > 1 ? ` (অংশ ${toBengaliDigits(idx + 1)})` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #E5E8E3;">
            <thead>
              <tr style="background:#F2F4F0;color:#37413B;border-bottom:1px solid #D4DAD2;">
                <th style="padding:7px 8px;text-align:left;">তারিখ</th>
                <th style="padding:7px 8px;text-align:left;">চালান নং</th>
                <th style="padding:7px 8px;text-align:left;">সাপ্লায়ার</th>
                <th style="padding:7px 8px;text-align:right;">মোট বিল</th>
                <th style="padding:7px 8px;text-align:right;">পরিশোধ</th>
                <th style="padding:7px 8px;text-align:right;">বাকি</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);
    });
  }

  // Block 4+: Monthly Expenses (Home Expenses + Mama/Staff Payments)
  interface ExpenseRowItem {
    date: string;
    category: string;
    details: string;
    method: string;
    amount: number;
  }

  const combinedExpenses: ExpenseRowItem[] = [
    ...monthlyHomeExpenses.map((h) => ({
      date: h.date,
      category: 'বাসার খরচ',
      details: h.title || 'দৈনিক বাজার / বাসার খরচ',
      method: h.paymentMethod || h.paidBy || '-',
      amount: h.totalAmount || 0,
    })),
    ...monthlyPersonGiven.map((p) => ({
      date: p.date,
      category: p.personName || 'ব্যক্তিগত / স্টাফ',
      details: p.purpose || 'টাকা প্রদান',
      method: p.paymentMethod || '-',
      amount: p.amount || 0,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const expenseChunks = chunkArray(combinedExpenses, 14);
  if (expenseChunks.length === 0) {
    blocksHtml.push(`
      <div>
        <div style="font-size:13px;font-weight:700;color:#111815;margin-bottom:8px;">
          ৩. চলতি মাসের বাসা ও অন্যান্য খরচ (${escapeHtml(monthTitle)})
        </div>
        <div style="border:1px dashed #D4DAD2;border-radius:10px;padding:14px;font-size:11.5px;color:#4B554E;text-align:center;">
          এই মাসে এখনো কোনো বাসা বা স্টাফ/মামার খরচ রেকর্ড হয়নি।
        </div>
      </div>
    `);
  } else {
    expenseChunks.forEach((chunk, idx) => {
      const rows = chunk
        .map(
          (item) => `
          <tr style="border-bottom:1px solid #EEF0EC;">
            <td style="padding:7px 8px;color:#37413B;white-space:nowrap;">${escapeHtml(formatDateBn(item.date))}</td>
            <td style="padding:7px 8px;font-weight:600;color:#111815;">${escapeHtml(item.category)}</td>
            <td style="padding:7px 8px;color:#37413B;">${escapeHtml(item.details)}</td>
            <td style="padding:7px 8px;color:#4B554E;">${escapeHtml(item.method)}</td>
            <td style="padding:7px 8px;text-align:right;font-weight:700;color:#B45309;font-family:'JetBrains Mono',monospace;">${escapeHtml(formatTaka(item.amount))}</td>
          </tr>
        `,
        )
        .join('');

      blocksHtml.push(`
        <div>
          <div style="font-size:13px;font-weight:700;color:#111815;margin-bottom:8px;">
            ৩. চলতি মাসের বাসা ও অন্যান্য খরচ${expenseChunks.length > 1 ? ` (অংশ ${toBengaliDigits(idx + 1)})` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #E5E8E3;">
            <thead>
              <tr style="background:#F2F4F0;color:#37413B;border-bottom:1px solid #D4DAD2;">
                <th style="padding:7px 8px;text-align:left;">তারিখ</th>
                <th style="padding:7px 8px;text-align:left;">খাত / ব্যক্তি</th>
                <th style="padding:7px 8px;text-align:left;">বিবরণ</th>
                <th style="padding:7px 8px;text-align:left;">মাধ্যম</th>
                <th style="padding:7px 8px;text-align:right;">পরিমাণ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);
    });
  }

  // Block 5: Footer
  blocksHtml.push(`
    <div style="border-top:1px solid #E5E8E3;padding-top:12px;display:flex;justify-content:space-between;font-size:10.5px;color:#6B726D;">
      <span>এমএস ফ্যাশন (MS Fashion) — ডিজিটাল টালি খাতা ও ইনভয়েস সিস্টেম</span>
      <span>স্বয়ংক্রিয় মাসিক সারসংক্ষেপ · ${escapeHtml(monthTitle)}</span>
    </div>
  `);

  // Create A4 PDF and place each rendered block cleanly without horizontal row clipping
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const marginX = 6;
  const marginY = 8;
  const usableWidthMm = pageWidthMm - marginX * 2;
  const usableHeightMm = pageHeightMm - marginY * 2;

  let cursorY = marginY;

  for (let i = 0; i < blocksHtml.length; i += 1) {
    const canvas = await renderBlockToCanvas(blocksHtml[i]);
    const blockHeightMm = (canvas.height * usableWidthMm) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    if (cursorY > marginY && cursorY + blockHeightMm > pageHeightMm - marginY) {
      pdf.addPage();
      cursorY = marginY;
    }

    if (blockHeightMm > usableHeightMm) {
      // Fallback scale if a single block ever exceeds a full page
      const fitScale = usableHeightMm / blockHeightMm;
      const drawWidth = usableWidthMm * fitScale;
      const offsetX = marginX + (usableWidthMm - drawWidth) / 2;
      pdf.addImage(imgData, 'PNG', offsetX, cursorY, drawWidth, usableHeightMm);
      cursorY += usableHeightMm + 2;
    } else {
      pdf.addImage(imgData, 'PNG', marginX, cursorY, usableWidthMm, blockHeightMm);
      cursorY += blockHeightMm - 4; // compact vertical rhythm between padded blocks
    }
  }

  const filename = `MS-Fashion-Monthly-Report-${monthKey}.pdf`;
  pdf.save(filename);
  return filename;
}
