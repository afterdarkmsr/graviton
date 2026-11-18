import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Clock,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Loader2,
  Calendar,
  Flag,
} from 'lucide-react';
import { feedbackService } from '../services/feedbackService';
import { reportService } from '../services/reportService';
import { ActivityReport, PendingSuspensionAppeal } from '../types';

interface AdminAppealsScreenProps {
  authUser: User | null;
  isAdmin: boolean;
  onBack: () => void;
  onToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminAppealsScreen: React.FC<AdminAppealsScreenProps> = ({
  authUser,
  isAdmin,
  onBack,
  onToast,
}) => {
  const [adminTab, setAdminTab] = useState<'appeals' | 'reports'>('appeals');

  const [appeals, setAppeals] = useState<PendingSuspensionAppeal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<ActivityReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState<boolean>(false);
  const [reportsLoadingMore, setReportsLoadingMore] = useState<boolean>(false);
  const [reportsHasMore, setReportsHasMore] = useState<boolean>(false);
  const [reportsLastDoc, setReportsLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [triagingReportId, setTriagingReportId] = useState<string | null>(null);

  // Review state per appeal: { [userId]: { note: string, isSubmitting: boolean } }
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);

  const fetchAppeals = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const data = await feedbackService.listPendingSuspensionAppeals();
      setAppeals(data);
    } catch (err: any) {
      console.error('Failed to load appeals:', err);
      const msg = err?.message || 'Failed to load suspension appeals. Please ensure you have campus administrator privileges.';
      setError(msg);
      if (isRefresh) {
        onToast(msg, 'error');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onToast]);

  const fetchReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setReportsLoading(true);
    }
    setReportsError(null);

    try {
      const page = await reportService.listActivityReports();
      setReports(page.reports);
      setReportsLastDoc(page.lastDoc);
      setReportsHasMore(page.hasMore);
    } catch (err: any) {
      console.error('Failed to load safety reports:', err);
      const msg = err?.message || 'Failed to load safety reports.';
      setReportsError(msg);
      if (isRefresh) {
        onToast(msg, 'error');
      }
    } finally {
      setReportsLoading(false);
      setIsRefreshing(false);
    }
  }, [onToast]);

  const handleLoadMoreReports = async () => {
    if (!reportsLastDoc || reportsLoadingMore) return;
    setReportsLoadingMore(true);
    try {
      const page = await reportService.listActivityReports(reportsLastDoc);
      setReports((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const next = page.reports.filter((r) => !existingIds.has(r.id));
        return [...prev, ...next];
      });
      setReportsLastDoc(page.lastDoc);
      setReportsHasMore(page.hasMore);
    } catch (err: any) {
      onToast(err?.message || 'Failed to load older safety reports.', 'error');
    } finally {
      setReportsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAppeals();
      fetchReports();
    } else {
      setIsLoading(false);
    }
  }, [isAdmin, fetchAppeals, fetchReports]);

  const handleReview = async (
    targetUserId: string,
    decision: 'accepted' | 'rejected'
  ) => {
    if (targetUserId === authUser?.uid) {
      onToast('Conflict of interest: Administrators cannot review their own suspension appeal.', 'error');
      return;
    }

    const note = (reviewNotes[targetUserId] || '').trim();
    setSubmittingUserId(targetUserId);

    try {
      await feedbackService.reviewSuspensionAppeal(targetUserId, decision, note || undefined);

      onToast(
        decision === 'accepted'
          ? 'Appeal approved: Student suspension has been lifted.'
          : 'Appeal rejected: Suspension remains in effect.',
        'success'
      );

      // Remove reviewed appeal from the local queue
      setAppeals((prev) => prev.filter((a) => a.userId !== targetUserId));
      setReviewNotes((prev) => {
        const copy = { ...prev };
        delete copy[targetUserId];
        return copy;
      });
    } catch (err: any) {
      console.error('Failed to review appeal:', err);
      const msg = err?.message || 'Failed to submit review decision.';
      onToast(msg, 'error');
    } finally {
      setSubmittingUserId(null);
    }
  };

  const handleTriageReport = async (
    reportId: string,
    status: 'reviewed' | 'dismissed'
  ) => {
    const note = (reportNotes[reportId] || '').trim();
    setTriagingReportId(reportId);
    try {
      await reportService.triageActivityReport(reportId, status, note || undefined);
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                status,
                adminNote: note || r.adminNote,
                reviewedByAdmin: authUser?.uid,
                reviewedAt: new Date().toISOString(),
              }
            : r
        )
      );
      onToast(
        status === 'reviewed' ? 'Safety report marked reviewed.' : 'Safety report dismissed.',
        'success'
      );
    } catch (err: any) {
      onToast(err?.message || 'Failed to update safety report.', 'error');
    } finally {
      setTriagingReportId(null);
    }
  };

  // 1. Unauthorized view
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-red-200 dark:border-red-900/50 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold font-display text-[#3A0F34] dark:text-slate-100">
            Campus Administrator Access Required
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            This review queue is restricted to authorized campus moderation personnel with the administrator security claim.
          </p>
          <div className="pt-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Campus Hub</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-in fade-in">
      {/* Top Navigation & Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#EAAA00] uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Campus Governance & Moderation</span>
            </div>
            <h1 className="text-2xl font-black font-display text-[#3A0F34] dark:text-slate-100">
              Suspension Appeals Review
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => (adminTab === 'appeals' ? fetchAppeals(true) : fetchReports(true))}
            disabled={isRefreshing || isLoading || reportsLoading}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#EAAA00]' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Admin Moderation Queue Tabs */}
      <div className="flex items-center p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <button
          type="button"
          onClick={() => setAdminTab('appeals')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            adminTab === 'appeals'
              ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-[#3A0F34] dark:hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Suspension Appeals ({appeals.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('reports')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            adminTab === 'reports'
              ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-[#3A0F34] dark:hover:text-slate-200'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>Safety Reports ({reports.filter((r) => r.status === 'open').length} open)</span>
        </button>
      </div>

      {adminTab === 'reports' ? (
        <div className="space-y-4">
          {reportsError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-red-800 dark:text-red-200 flex items-start gap-3 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-bold">Error loading safety reports</p>
                <p>{reportsError}</p>
              </div>
            </div>
          )}

          {reportsLoading ? (
            <div className="p-16 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
              <Loader2 className="w-8 h-8 animate-spin text-[#3A0F34] dark:text-[#EAAA00] mx-auto" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Loading safety reports...
              </p>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-16 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold font-display text-[#3A0F34] dark:text-slate-100">
                No Safety Reports
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                No activity safety reports have been submitted.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((rep) => {
                const isTriaging = triagingReportId === rep.id;
                return (
                  <div
                    key={rep.id}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#3A0F34] dark:text-slate-100">
                            {rep.activityTitle}
                          </h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              rep.status === 'open'
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                : rep.status === 'reviewed'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {rep.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Reason: <strong className="text-slate-700 dark:text-slate-200">{rep.reason}</strong> · Activity ID: <code className="font-mono text-[11px]">{rep.activityId}</code>
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(rep.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {rep.details && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {rep.details}
                      </div>
                    )}

                    {rep.status === 'open' ? (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                        <input
                          type="text"
                          value={reportNotes[rep.id] || ''}
                          onChange={(e) =>
                            setReportNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))
                          }
                          disabled={isTriaging}
                          maxLength={500}
                          placeholder="Optional moderation note..."
                          className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleTriageReport(rep.id, 'dismissed')}
                            disabled={isTriaging}
                            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriageReport(rep.id, 'reviewed')}
                            disabled={isTriaging}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {isTriaging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>Mark Reviewed</span>
                          </button>
                        </div>
                      </div>
                    ) : rep.adminNote ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Note: {rep.adminNote}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              {reportsHasMore && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMoreReports}
                    disabled={reportsLoadingMore}
                    className="px-5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-[#3A0F34] dark:text-slate-200 shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {reportsLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EAAA00]" />}
                    <span>{reportsLoadingMore ? 'Loading Older Reports...' : 'Load Older Reports'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Overview Stat Banner */}
      <div className="bg-[#3A0F34] text-white rounded-3xl p-6 sm:p-7 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-6 -translate-y-6 w-36 h-36 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between gap-4 flex-wrap relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#EAAA00] font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Active Adjudication Queue</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display">
              Pending Student Appeals
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-lg">
              Review statements from students temporarily suspended by peer feedback. Approving an appeal lifts the suspension immediately; rejecting an appeal maintains the duration.
            </p>
          </div>
          <div className="px-5 py-3 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/10 text-center shrink-0">
            <span className="block text-3xl font-black font-display text-[#EAAA00] tabular-nums">
              {appeals.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider">
              {appeals.length === 1 ? 'Pending Case' : 'Pending Cases'}
            </span>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-red-800 dark:text-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Error loading appeals queue</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="p-16 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
          <Loader2 className="w-8 h-8 animate-spin text-[#3A0F34] dark:text-[#EAAA00] mx-auto" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Querying pending appeals from secure moderation records...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && appeals.length === 0 && (
        <div className="p-16 text-center space-y-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-display text-[#3A0F34] dark:text-slate-100">
              All Caught Up!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              There are currently no pending suspension appeals requiring campus moderation review.
            </p>
          </div>
          <button
            onClick={() => fetchAppeals(true)}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Again</span>
          </button>
        </div>
      )}

      {/* Appeals List */}
      {!isLoading && appeals.length > 0 && (
        <div className="space-y-5">
          {appeals.map((appeal) => {
            const isSelf = appeal.userId === authUser?.uid;
            const isSubmitting = submittingUserId === appeal.userId;
            const currentNote = reviewNotes[appeal.userId] || '';

            return (
              <div
                key={appeal.userId}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5 transition-shadow hover:shadow-md"
              >
                {/* Appellant & Suspension Metadata */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#3A0F34] text-white flex items-center justify-center text-sm font-extrabold shrink-0 shadow-xs">
                      {appeal.userName.slice(0, 2).toUpperCase() || 'ST'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-[#3A0F34] dark:text-slate-100">
                          {appeal.userName}
                        </h3>
                        {appeal.userEmail && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            ({appeal.userEmail})
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold uppercase tracking-wider">
                          Suspended
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        User ID: <code className="font-mono text-[11px] text-slate-700 dark:text-slate-300">{appeal.userId}</code>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {appeal.appealedAt && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          Appealed {new Date(appeal.appealedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suspension Details Box */}
                <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap text-amber-900 dark:text-amber-200 font-bold">
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      Triggering Reason:
                    </span>
                    {appeal.suspensionExpiresAt && (
                      <span className="text-[11px] font-normal text-amber-800 dark:text-amber-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Expires: {new Date(appeal.suspensionExpiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 pl-5.5">
                    {appeal.suspensionReason}
                  </p>
                </div>

                {/* Appeal Message */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <MessageSquare className="w-3.5 h-3.5 text-[#3A0F34] dark:text-[#EAAA00]" />
                    <span>Student&apos;s Appeal Statement</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed italic">
                    &ldquo;{appeal.appealReason}&rdquo;
                  </div>
                </div>

                {/* Review Action Controls */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                  {isSelf ? (
                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs italic flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>
                        Conflict of interest: You cannot review your own suspension appeal. Another verified administrator must review this case.
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Optional Moderation Note */}
                      <div className="space-y-1">
                        <label
                          htmlFor={`review-note-${appeal.userId}`}
                          className="block text-xs font-semibold text-slate-600 dark:text-slate-400"
                        >
                          Administrative Review Note (Optional justification recorded in moderation record)
                        </label>
                        <input
                          id={`review-note-${appeal.userId}`}
                          type="text"
                          value={currentNote}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({
                              ...prev,
                              [appeal.userId]: e.target.value,
                            }))
                          }
                          disabled={isSubmitting}
                          placeholder="e.g. Reviewed student context; probationary reinstatement granted."
                          maxLength={500}
                          className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-3 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleReview(appeal.userId, 'rejected')}
                          disabled={isSubmitting}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Reject Appeal</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReview(appeal.userId, 'accepted')}
                          disabled={isSubmitting}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Approve & Lift Suspension</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
};
