import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Unhandled application render error:', error, errorInfo);
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#DDE3E8] dark:bg-[#0A0E17] flex items-center justify-center p-6 text-[#3A0F34] dark:text-slate-100">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-lg text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold font-display">Something went wrong</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              VibeMatch ran into an unexpected display issue. Reloading the page usually resolves it cleanly.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#3A0F34] hover:bg-[#52184A] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#EAAA00]" />
              <span>Reload VibeMatch</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
