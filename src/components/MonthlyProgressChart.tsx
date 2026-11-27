import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TransactionRecord } from '../types/bookkeeping';
import {
  formatMonthBn,
  formatTaka,
  getCurrentMonthKey,
  toBengaliDigits,
} from '../utils/formatters';

interface MonthlyProgressChartProps {
  transactions: TransactionRecord[];
  loading?: boolean;
}

interface MonthlyChartDatum {
  monthKey: string;
  shortLabel: string;
  fullLabel: string;
  purchases: number;
  sales: number;
}

const SHORT_MONTHS_BN = [
  'জানু',
  'ফেব্রু',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টে',
  'অক্টো',
  'নভে',
  'ডিসে',
];

function formatShortMonthBn(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const idx = Number(month) - 1;
  const label = SHORT_MONTHS_BN[idx] ?? month;
  const shortYear = year ? year.slice(-2) : '';
  return `${label} '${toBengaliDigits(shortYear)}`;
}

function buildMonthKeysWindow(endMonthKey: string, count: number): string[] {
  const [yStr, mStr] = endMonthKey.split('-');
  let year = Number(yStr);
  let month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    let targetMonth = month - i;
    let targetYear = year;
    while (targetMonth <= 0) {
      targetMonth += 12;
      targetYear -= 1;
    }
    keys.push(`${targetYear}-${String(targetMonth).padStart(2, '0')}`);
  }
  return keys;
}

function formatYAxisTaka(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '৳০';
  if (value >= 100000) {
    const lakhs = value / 100000;
    const text = Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(1);
    return `৳${toBengaliDigits(text)}লাখ`;
  }
  if (value >= 1000) {
    const thousands = value / 1000;
    const text = Number.isInteger(thousands)
      ? String(thousands)
      : thousands.toFixed(1);
    return `৳${toBengaliDigits(text)}হা`;
  }
  return `৳${toBengaliDigits(Math.round(value))}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: MonthlyChartDatum;
  }>;
}

const ChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  const diff = datum.sales - datum.purchases;

  return (
    <div className="bg-white border border-[#E5E8E3] rounded-xl p-3.5 shadow-lg text-xs space-y-2 min-w-[200px]">
      <p className="font-bold text-[#111815] border-b border-[#F2F4F0] pb-1.5">
        {datum.fullLabel}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#4B554E]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#1E293B] inline-block" />
            মোট কেনাকাটা
          </span>
          <span className="font-bold font-mono-tabular text-[#111815]">
            {formatTaka(datum.purchases)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#4B554E]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#0D5C46] inline-block" />
            মোট বিক্রি
          </span>
          <span className="font-bold font-mono-tabular text-[#0D5C46]">
            {formatTaka(datum.sales)}
          </span>
        </div>
      </div>
      <div className="pt-1.5 border-t border-[#F2F4F0] flex items-center justify-between gap-4">
        <span className="text-[#4B554E] font-medium">বিক্রি - কেনাকাটা</span>
        <span
          className={`font-bold font-mono-tabular ${
            diff >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
          }`}
        >
          {diff > 0 ? '+' : ''}
          {formatTaka(diff)}
        </span>
      </div>
    </div>
  );
};

export const MonthlyProgressChart: React.FC<MonthlyProgressChartProps> = ({
  transactions,
  loading = false,
}) => {
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(6);

  const { chartData, rangePurchases, rangeSales, hasAnyData } = useMemo(() => {
    const map = new Map<string, { purchases: number; sales: number }>();
    let latestMonth = getCurrentMonthKey();

    for (const tx of transactions) {
      if (tx.type !== 'supplier_purchase' && tx.type !== 'customer_sale') {
        continue;
      }
      const mk = tx.date?.slice(0, 7);
      if (!mk || mk.length !== 7) continue;
      if (mk > latestMonth) latestMonth = mk;

      const cur = map.get(mk) || { purchases: 0, sales: 0 };
      if (tx.type === 'supplier_purchase') {
        cur.purchases += tx.totalAmount || 0;
      } else {
        cur.sales += tx.totalAmount || 0;
      }
      map.set(mk, cur);
    }

    const keys = buildMonthKeysWindow(latestMonth, rangeMonths);
    let totalP = 0;
    let totalS = 0;

    const data: MonthlyChartDatum[] = keys.map((mk) => {
      const entry = map.get(mk) || { purchases: 0, sales: 0 };
      totalP += entry.purchases;
      totalS += entry.sales;
      return {
        monthKey: mk,
        shortLabel: formatShortMonthBn(mk),
        fullLabel: formatMonthBn(mk),
        purchases: Math.round(entry.purchases),
        sales: Math.round(entry.sales),
      };
    });

    return {
      chartData: data,
      rangePurchases: totalP,
      rangeSales: totalS,
      hasAnyData: totalP > 0 || totalS > 0,
    };
  }, [transactions, rangeMonths]);

  return (
    <section
      aria-label="মাসিক কেনাকাটা ও বিক্রয়ের তুলনামূলক চার্ট"
      className="bg-white border border-[#E5E8E3] rounded-2xl p-5 md:p-6 space-y-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#111815]">
            মাসিক কেনাকাটা ও বিক্রয়ের তুলনামূলক চিত্র
          </h2>
          <p className="text-xs text-[#4B554E] mt-0.5">
            গত {toBengaliDigits(rangeMonths)} মাসের মোট ক্রয় ({formatTaka(rangePurchases)}) বনাম মোট বিক্রি ({formatTaka(rangeSales)})
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs font-semibold text-[#37413B]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-3 h-3 rounded-xs bg-[#1E293B] inline-block" />
              মোট কেনাকাটা
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-3 h-3 rounded-xs bg-[#0D5C46] inline-block" />
              মোট বিক্রি
            </span>
          </div>

          {/* Range Switcher */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#F2F4F0] rounded-xl">
            <button
              type="button"
              onClick={() => setRangeMonths(6)}
              className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                rangeMonths === 6
                  ? 'bg-white text-[#111815] shadow-xs'
                  : 'text-[#4B554E] hover:text-[#111815]'
              }`}
            >
              গত ৬ মাস
            </button>
            <button
              type="button"
              onClick={() => setRangeMonths(12)}
              className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                rangeMonths === 12
                  ? 'bg-white text-[#111815] shadow-xs'
                  : 'text-[#4B554E] hover:text-[#111815]'
              }`}
            >
              গত ১২ মাস
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-[280px] bg-[#F8F9F7] rounded-xl animate-pulse" />
      ) : !hasAnyData ? (
        <div className="h-[240px] flex flex-col items-center justify-center text-center border border-dashed border-[#D4DAD2] rounded-xl px-4">
          <p className="text-sm font-semibold text-[#37413B]">
            এই সময়ে এখনো কোনো মাল ক্রয় বা বিক্রির হিসাব পাওয়া যায়নি
          </p>
          <p className="text-xs text-[#4B554E] mt-1">
            নতুন সাপ্লায়ার ক্রয় বা কাস্টমার বিক্রি যোগ করলে এখানে মাসিক তুলনামূলক বার চার্ট দেখা যাবে।
          </p>
        </div>
      ) : (
        <div className="w-full min-w-0 h-[280px] sm:h-[310px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
              barGap={6}
              barCategoryGap="24%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#E5E8E3"
              />
              <XAxis
                dataKey="shortLabel"
                tick={{ fill: '#4B554E', fontSize: 12, fontWeight: 500 }}
                axisLine={{ stroke: '#E5E8E3' }}
                tickLine={false}
                dy={6}
              />
              <YAxis
                tickFormatter={formatYAxisTaka}
                tick={{ fill: '#4B554E', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: '#F2F4F0', opacity: 0.7 }}
              />
              <Bar
                dataKey="purchases"
                name="মোট কেনাকাটা"
                fill="#1E293B"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                dataKey="sales"
                name="মোট বিক্রি"
                fill="#0D5C46"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
