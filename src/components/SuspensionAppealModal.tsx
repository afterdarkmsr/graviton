import React, { useState } from 'react';
import { feedbackService } from '../services/feedbackService';
import { X, ShieldAlert, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface SuspensionAppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onAppealSubmitted?: () => void;
}

export const SuspensionAppealModal: React.FC<SuspensionAppealModalProps> = ({
  isOpen,
  onClose,
  userId,
  onAppealSubmitted,
}) => {
  const [appealText, setAppealText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = appealText.trim();
    if (!trimmed || trimmed.length < 10) {
      setError('Please provide a constructive appeal statement (at least 10 characters).');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await feedbackService.submitSuspensionAppeal(userId, trimmed);
      setSuccess(true);
      if (onAppealSubmitted) {
        onAppealSubmitted();
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj?.message || 'Failed to submit appeal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#3A0F34] dark:text-slate-100">
                Submit Suspension Appeal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Account safety and moderation review
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {success ? (
            <div className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Appeal Submitted Successfully
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Your appeal statement has been registered with your suspension record.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                Your account was temporarily suspended for 15 days due to receiving 5 distinct 1-star ratings across campus activities. Explain the context or reasons below.
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Appeal Explanation
                </label>
                <textarea
                  value={appealText}
                  onChange={(e) => setAppealText(e.target.value.slice(0, 1000))}
                  placeholder="Describe what occurred during the squad meetups or any misunderstandings..."
                  rows={4}
                  className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#3A0F34]/20 resize-none"
                />
                <span className="text-[10px] text-slate-400 float-right mt-1">
                  {appealText.length}/1000
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-[#3A0F34] dark:bg-[#EAAA00] hover:bg-[#52184A] dark:hover:bg-[#D69900] disabled:opacity-60 text-white dark:text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting appeal...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Appeal</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
