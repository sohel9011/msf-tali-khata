import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'অপ্রত্যাশিত একটি ত্রুটি ঘটেছে।',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = 'ডেটা লোড বা সংরক্ষণ করতে সমস্যা হয়েছে। অনুগ্রহ করে পেজটি রিফ্রেশ করুন।';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendlyMessage =
          'এই অংশে প্রবেশের অনুমতি নেই অথবা সেশন মেয়াদ শেষ হয়েছে। অনুগ্রহ করে অনুমোদিত মালিক অ্যাকাউন্ট দিয়ে লগইন করুন।';
      }

      return (
        <div className="min-h-screen bg-[#F6F7F5] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E5E8E3] rounded-2xl p-8 text-center">
            <h1 className="text-xl font-bold text-[#111815] mb-2">
              সমস্যা দেখা দিয়েছে
            </h1>
            <p className="text-sm text-[#4B554E] leading-relaxed mb-6">
              {friendlyMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#0D5C46] text-white text-sm font-semibold rounded-xl hover:bg-[#094534] transition-colors cursor-pointer"
            >
              পেজ রিফ্রেশ করুন
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
