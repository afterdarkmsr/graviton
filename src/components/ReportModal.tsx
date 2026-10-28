import React, { useState } from 'react';
import { ShieldAlert, X, Check } from 'lucide-react';
import { storageService } from '../services/storageService';

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
  const [reason, setReason] = useState<string>('Inappropriate content');
  const [details, setDetails] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    storageService.reportActivity(activityId, `${reason}: ${details}`);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onReportSubmitted();
      onClose();
    }, 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <div className="p-5 bg-[#3A0F34] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#EAAA00]" />
            <h3 id="report-modal-title" className="font-bold text-base font-display">Report Activity</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-[#3A0F34] text-base">Report Recorded</h4>
              <p className="text-xs text-slate-500 mt-1">
                This activity has been flagged and saved locally in your browser storage.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-slate-600">
                Reporting: <span className="font-semibold text-[#3A0F34]">{activityTitle}</span>
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Reason for concern
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
                >
                  <option value="Inappropriate content">Inappropriate / Unsafe content</option>
                  <option value="Spam or commercial">Spam or commercial promotion</option>
                  <option value="Non-public or private venue">Non-public or unsafe venue</option>
                  <option value="Harassment">Host behavior or harassment</option>
                  <option value="Other">Other violation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Optional details
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Tell us what seems off..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] resize-none"
                />
              </div>

              {/* Required transparency disclaimer */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                <strong>Safety Notice:</strong> Campus safety moderation is running in local demonstration mode. Serious emergencies should always be reported to your university campus police or emergency services immediately.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] text-white rounded-xl shadow-sm transition-colors"
                >
                  Submit Report
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
