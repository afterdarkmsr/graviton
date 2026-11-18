import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { reportService } from '../services/reportService';
import { ReportReason } from '../types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activityId: string;
  activityTitle: string;
  onReportSubmitted: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  activityId,
  activityTitle,
  onReportSubmitted,
}) => {
  const [reason, setReason] = useState<ReportReason>('Inappropriate content');
  const [details, setDetails] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setError(null);
      setIsSubmitting(false);
    }
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await reportService.submitActivityReport({
        activityId,
        activityTitle,
        reason,
        details: details.trim(),
      });
      setSubmitted(true);
      setDetails('');
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        setSubmitted(false);
        onReportSubmitted();
        onClose();
      }, 1400);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Failed to submit safety report.';
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) msg = parsed.error;
      } catch {
        // not JSON
      }
      if (msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
        msg = 'Unable to submit report: Please verify you are signed in and try again.';
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <div className="p-5 bg-[#3A0F34] dark:bg-slate-950 text-white flex items-center justify-between border-b border-transparent dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#EAAA00]" />
            <h3 id="report-modal-title" className="font-bold text-base font-display">Report Activity</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-[#3A0F34] dark:text-slate-100 text-base">Report Submitted</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your safety report has been securely recorded for campus moderation review.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Reporting: <span className="font-semibold text-[#3A0F34] dark:text-slate-100">{activityTitle}</span>
              </p>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason for concern
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
                >
                  <option value="Inappropriate content" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Inappropriate / Unsafe content</option>
                  <option value="Spam or commercial" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Spam or commercial promotion</option>
                  <option value="Non-public or private venue" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Non-public or unsafe venue</option>
                  <option value="Harassment" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Host behavior or harassment</option>
                  <option value="Other" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Other violation</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Optional details
                  </label>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{details.length}/1000</span>
                </div>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
                  disabled={isSubmitting}
                  maxLength={1000}
                  placeholder="Tell us what seems off..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] resize-none"
                />
              </div>

              {/* Required transparency disclaimer */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                <strong>Safety Notice:</strong> Reports are reviewed privately by campus moderators. Urgent emergencies should always be reported directly to university campus security or emergency services immediately.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] dark:bg-[#EAAA00] dark:hover:bg-[#D69900] dark:text-[#240720] disabled:opacity-60 text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EAAA00] dark:text-[#240720]" />}
                  <span>{isSubmitting ? 'Submitting...' : 'Submit Report'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
