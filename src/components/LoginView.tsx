import React, { useState } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { ADMIN_EMAIL } from '../types/bookkeeping';

interface LoginViewProps {
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  unauthorizedEmail?: string | null;
  authError?: string | null;
  loading?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onSignIn,
  onSignOut,
  unauthorizedEmail,
  authError,
  loading = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#F6F7F5] flex items-center justify-center p-4 md:p-8">
      <div className="max-w-5xl w-full bg-white border border-neutral-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left prominent MS Fashion Logo panel — crystal clear with zero hazy overlay */}
        <div className="lg:col-span-6 bg-white border-b lg:border-b-0 lg:border-r border-neutral-200 p-8 md:p-12 flex flex-col justify-between gap-8 min-h-[340px] lg:min-h-[560px]">
          <div className="flex-1 flex items-center justify-center">
            {!imgFailed ? (
              <img
                src="https://imgur.com/Af1qii8.png"
                alt="এমএস ফ্যাশন (MS Fashion) লোগো"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full max-w-[340px] h-auto max-h-[260px] object-contain block"
              />
            ) : (
              <div className="w-32 h-32 rounded-3xl bg-black text-white font-bold text-4xl flex items-center justify-center">
                MS
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-neutral-200 text-black">
            <p className="text-xs font-semibold tracking-wide text-black/80 mb-1.5">
              ডিজিটাল হিসাবরক্ষণ ও ইনভয়েস পোর্টাল
            </p>
            <h2 className="text-2xl md:text-3xl font-bold leading-snug text-black text-balance">
              এমএস ফ্যাশন (MS Fashion)
            </h2>
            <p className="text-sm font-medium text-neutral-800 mt-2 max-w-md leading-relaxed">
              সাপ্লায়ার বাকি, কাস্টমার পাওনা, বাসার খরচ, মাইনু মামা ও মডারেটর হিমেলের হিসাব — সবকিছু এক খাতায়।
            </p>
          </div>
        </div>

        {/* Right sign-in panel */}
        <div className="lg:col-span-6 p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-sm w-full mx-auto">
            <div className="mb-8">
              <div className="mb-5">
                <img
                  src="https://imgur.com/Af1qii8.png"
                  alt="এমএস ফ্যাশন"
                  referrerPolicy="no-referrer"
                  className="w-[120px] h-auto max-h-14 object-contain block"
                />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-black tracking-tight text-balance">
                টালি খাতায় স্বাগতম
              </h1>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                মালিক হিসেবে আপনার ব্যবসা ও ব্যক্তিগত সব হিসাব নিরাপদে ক্লাউডে সংরক্ষণ করতে Google অ্যাকাউন্ট দিয়ে প্রবেশ করুন।
              </p>
            </div>

            {unauthorizedEmail ? (
              <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] mb-6">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#991B1B]">
                      অনুমোদিত মালিক অ্যাকাউন্ট নয়
                    </p>
                    <p className="text-xs text-[#7F1D1D] mt-1 leading-relaxed">
                      আপনি <span className="font-mono-tabular">{unauthorizedEmail}</span> দিয়ে লগইন করেছেন। এই টালি খাতার অ্যাডমিন অ্যাক্সেস শুধুমাত্র <span className="font-mono-tabular">{ADMIN_EMAIL}</span>-এর জন্য সংরক্ষিত।
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="mt-4 w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#FECACA] text-[#991B1B] text-sm font-semibold rounded-xl hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  অন্য অ্যাকাউন্ট দিয়ে চেষ্টা করুন
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={onSignIn}
                className="w-full min-h-[48px] flex items-center justify-center gap-3 px-5 py-3 bg-black hover:bg-neutral-800 text-white text-base font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className="w-5 h-5 bg-white rounded-full p-0.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                <span>{loading ? 'লগইন হচ্ছে...' : 'Google দিয়ে লগইন করুন'}</span>
              </button>
            )}

            {authError && (
              <p className="mt-4 text-xs text-[#B91C1C] leading-relaxed">
                {authError}
              </p>
            )}

            <div className="mt-8 pt-6 border-t border-neutral-200 grid grid-cols-2 gap-4 text-xs text-neutral-600">
              <div>
                <p className="font-semibold text-black">রিয়েল-টাইম সিঙ্ক</p>
                <p className="mt-0.5">মোবাইল, ট্যাব ও কম্পিউটারে তাৎক্ষণিক আপডেট</p>
              </div>
              <div>
                <p className="font-semibold text-black">পাবলিক শেয়ার লিংক</p>
                <p className="mt-0.5">লগইন ছাড়াই কাস্টমার ও সাপ্লায়ার হিসাব দেখতে পারবেন</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
